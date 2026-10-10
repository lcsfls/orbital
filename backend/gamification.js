'use strict';

// XP, levels and streaks. Rewards only, never penalties.

const XP = {
  idea_create: 5,
  park: 10,
  drop: 10,
  evaluate: 15,
  quadrant_review: 15,
  inbox_zero: 10,
  task_done: 20,
  mandatory_done: 30,
  project_completed: 100,
};

const IDEA_CREATE_DAILY_CAP = 3;

// Actions that can only be rewarded once per day.
const ONCE_PER_DAY = new Set(['inbox_zero']);

// Actions that can only be rewarded once per referenced item.
const ONCE_PER_ITEM = new Set(['park', 'drop', 'evaluate', 'task_done', 'mandatory_done', 'project_completed']);

const MESSAGES = {
  idle: 'Orbiting the core. Nothing urgent.',
  alert: 'Mandatory item open. Orbit is waiting.',
  pause: 'A pause is fine.',
  celebrate: ['Done beats perfect.', 'That was a real decision.', 'Parking is deciding, not failing.', 'One more lap.'],
};

const ACTION_MESSAGE = {
  park: 'Parking is deciding, not failing.',
  drop: 'That was a real decision.',
  evaluate: 'That was a real decision.',
  idea_create: 'Parking is deciding, not failing.',
  inbox_zero: 'One more lap.',
  task_done: 'Done beats perfect.',
  mandatory_done: 'Done beats perfect.',
  project_completed: 'Done beats perfect.',
};

// Calm body colours for the companion robot. The id is stored, the UI maps it to a colour.
const COMPANION_COLORS = ['moon', 'sky', 'mint', 'peach', 'rose', 'lilac', 'sand'];

const DEFAULT_SETTINGS = { effects: true, sound: false, companion_name: 'Orbit', companion_color: 'moon', onboarded: false };

// Level n starts at 50 * n * (n - 1) XP: 0, 100, 300, 600, 1000, ...
function levelFloor(level) {
  return 50 * level * (level - 1);
}

function levelFromXp(xp) {
  let level = 1;
  while (levelFloor(level + 1) <= xp) level += 1;
  return level;
}

function levelInfo(xp) {
  const level = levelFromXp(xp);
  const floor = levelFloor(level);
  const next = levelFloor(level + 1);
  return { level, level_floor: floor, next_level_at: next, progress: (xp - floor) / (next - floor) };
}

// Calendar day (YYYY-MM-DD) in the configured time zone.
function dayOf(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDays(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000);
}

// Next streak value after a rewarded action on `today`.
function nextStreak(streak, lastDay, today) {
  if (lastDay === today) return streak;
  if (lastDay && addDays(lastDay, 1) === today) return streak + 1;
  return 1;
}

// Streak as seen today. Missing a day resets it to 0, quietly.
function currentStreak(streak, lastDay, today) {
  if (!lastDay) return 0;
  if (lastDay === today || addDays(lastDay, 1) === today) return streak;
  return 0;
}

// `uid()` returns the signed-in user of the current request.
function createGamification(db, clock, uid) {
  const q = {
    row: db.prepare('SELECT * FROM gamification WHERE user_id = ?'),
    ref: db.prepare('SELECT COUNT(*) AS n FROM xp_events WHERE user_id = ? AND action = ? AND ref_type IS ? AND ref_id IS ?'),
    day: db.prepare('SELECT COUNT(*) AS n FROM xp_events WHERE user_id = ? AND action = ? AND day = ?'),
    all: db.prepare('SELECT COUNT(*) AS n FROM xp_events WHERE user_id = ?'),
    insert: db.prepare('INSERT INTO xp_events (user_id, action, xp, ref_type, ref_id, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    update: db.prepare('UPDATE gamification SET xp_total = ?, streak = ?, best_streak = ?, last_active_day = ? WHERE user_id = ?'),
  };
  const getRow = { get: () => q.row.get(uid()) };
  const countRef = { get: (...a) => q.ref.get(uid(), ...a) };
  const countDay = { get: (...a) => q.day.get(uid(), ...a) };
  const countAll = { get: () => q.all.get(uid()) };
  const insertEvent = { run: (...a) => q.insert.run(uid(), ...a) };
  const updateRow = { run: (...a) => q.update.run(...a, uid()) };

  const today = () => dayOf(clock.now(), clock.timeZone);

  // Awards XP for one action. Returns the reward or null if not rewarded.
  function award(action, refType = null, refId = null) {
    const xp = XP[action];
    if (!xp) throw new Error(`Unknown action ${action}`);
    const day = today();
    if (ONCE_PER_ITEM.has(action) && countRef.get(action, refType, refId).n > 0) return null;
    if (action === 'idea_create' && countDay.get(action, day).n >= IDEA_CREATE_DAILY_CAP) return null;
    if (ONCE_PER_DAY.has(action) && countDay.get(action, day).n > 0) return null;

    insertEvent.run(action, xp, refType, refId, day, clock.now().toISOString());
    const row = getRow.get();
    const streak = nextStreak(row.streak, row.last_active_day, day);
    updateRow.run(row.xp_total + xp, streak, Math.max(row.best_streak, streak), day);
    const rotate = MESSAGES.celebrate[countAll.get().n % MESSAGES.celebrate.length];
    return { action, xp, message: ACTION_MESSAGE[action] || rotate };
  }

  // Combines several rewards from one request into one.
  function combine(rewards) {
    const list = rewards.filter(Boolean);
    if (!list.length) return null;
    const best = list.reduce((a, b) => (b.xp > a.xp ? b : a));
    return {
      xp: list.reduce((n, r) => n + r.xp, 0),
      actions: list.map((r) => r.action),
      message: best.message,
    };
  }

  function settings() {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(getRow.get().settings) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function updateSettings(patch) {
    const next = { ...settings(), ...patch };
    db.prepare('UPDATE gamification SET settings = ? WHERE user_id = ?').run(JSON.stringify(next), uid());
    return next;
  }

  function spend(amount) {
    db.prepare('UPDATE gamification SET xp_spent = xp_spent + ? WHERE user_id = ?').run(amount, uid());
  }

  function state(alertCount = null) {
    const row = getRow.get();
    const day = today();
    const streak = currentStreak(row.streak, row.last_active_day, day);
    const ideaCreations = countDay.get('idea_create', day).n;
    const out = {
      xp_total: row.xp_total,
      xp_spent: row.xp_spent,
      xp_balance: row.xp_total - row.xp_spent,
      ...levelInfo(row.xp_total),
      streak,
      best_streak: row.best_streak,
      active_today: row.last_active_day === day,
      streak_message: streak === 0 && row.last_active_day ? MESSAGES.pause : null,
      idea_creations_left: Math.max(0, IDEA_CREATE_DAILY_CAP - ideaCreations),
      settings: settings(),
    };
    if (alertCount !== null) {
      out.alert_count = alertCount;
      out.orbit_state = alertCount > 0 ? 'alert' : 'idle';
      out.message = alertCount > 0 ? MESSAGES.alert : MESSAGES.idle;
    }
    return out;
  }

  return { award, combine, state, settings, updateSettings, spend, today };
}

module.exports = {
  COMPANION_COLORS,
  XP,
  IDEA_CREATE_DAILY_CAP,
  MESSAGES,
  DEFAULT_SETTINGS,
  levelFloor,
  levelFromXp,
  levelInfo,
  dayOf,
  addDays,
  daysBetween,
  nextStreak,
  currentStreak,
  createGamification,
};
