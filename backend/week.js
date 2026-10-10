'use strict';

// "This week" for one person and the opt-in crew. Only counts, never task titles.
// Weeks run Monday to Sunday in the configured time zone.

const { addDays, currentStreak } = require('./gamification');

const DONE = ['task_done', 'mandatory_done'];
const DECIDED = ['evaluate', 'park', 'drop', 'quadrant_review'];

// Monday of the week that contains `day` (YYYY-MM-DD).
function weekStart(day) {
  const d = new Date(`${day}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -offset);
}

function weekDays(start) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function createWeek(db, game) {
  const countIn = (userId, actions, from, to) =>
    db
      .prepare(`SELECT COUNT(*) AS n FROM xp_events WHERE user_id = ? AND day >= ? AND day <= ? AND action IN (${actions.map(() => '?').join(',')})`)
      .get(userId, from, to, ...actions).n;

  function summary(userId) {
    const today = game.today();
    const start = weekStart(today);
    const end = addDays(start, 6);
    const prevStart = addDays(start, -7);
    const prevEnd = addDays(start, -1);
    const activeDays = new Set(
      db.prepare('SELECT DISTINCT day FROM xp_events WHERE user_id = ? AND day >= ? AND day <= ?').all(userId, start, end).map((r) => r.day),
    );
    const done = countIn(userId, DONE, start, end);
    const doneBefore = countIn(userId, DONE, prevStart, prevEnd);
    const ideas = db
      .prepare('SELECT COUNT(*) AS n FROM ideas WHERE user_id = ? AND substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ?')
      .get(userId, start, end).n;
    let message;
    if (done === 0 && doneBefore === 0) message = 'A quiet week so far. A pause is fine.';
    else if (done > doneBefore) message = `${done - doneBefore} more than last week.`;
    else if (done === doneBefore) message = 'Same as last week. Steady.';
    else message = 'A calmer week than the last one. That is fine.';
    return {
      start,
      end,
      days: weekDays(start).map((day) => ({ day, active: activeDays.has(day), today: day === today, future: day > today })),
      done,
      done_last_week: doneBefore,
      decided: countIn(userId, DECIDED, start, end),
      ideas,
      projects_completed: countIn(userId, ['project_completed'], start, end),
      message,
    };
  }

  // Opt-in members only. Sorted by name, never ranked.
  function crew() {
    const today = game.today();
    const start = weekStart(today);
    const end = addDays(start, 6);
    const rows = db
      .prepare(
        `SELECT u.id, u.username, u.display_name, g.settings, g.streak, g.last_active_day
         FROM users u JOIN gamification g ON g.user_id = u.id WHERE u.disabled = 0`,
      )
      .all();
    const members = [];
    for (const r of rows) {
      let s = {};
      try {
        s = JSON.parse(r.settings);
      } catch {
        s = {};
      }
      if (!s.crew) continue;
      members.push({
        id: r.id,
        name: r.display_name || r.username,
        companion_name: s.companion_name || 'Orbit',
        companion_color: s.companion_color || 'moon',
        done: countIn(r.id, DONE, start, end),
        streak: currentStreak(r.streak, r.last_active_day, today),
        active_today: r.last_active_day === today,
      });
    }
    members.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return { start, end, members, total: members.reduce((n, m) => n + m.done, 0) };
  }

  return { summary, crew, weekStart };
}

module.exports = { createWeek, weekStart, weekDays };
