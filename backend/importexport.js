'use strict';

// JSON backup and migration. Reads Orbital exports and old Planer prototype files.

const rules = require('./rules');
const { schemaVersion } = require('./db');
const { HttpError } = require('./validate');
const { COMPANION_COLORS } = require('./gamification');

const FORMAT_VERSION = 1;

const IDEA_FIELDS = [
  'title', 'notes', 'status', 'importance', 'urgency', 'core_context', 'mission_critical', 'money', 'time',
  'delegation', 'mandatory', 'mandatory_reason', 'due_date', 'quadrant_set_at', 'done_at', 'created_at', 'updated_at',
];
const PROJECT_FIELDS = [
  'title', 'notes', 'status', 'kind', 'idea_id', 'core_context', 'mission_critical', 'mandatory', 'mandatory_reason',
  'quadrant_set_at', 'completed_at', 'created_at', 'updated_at',
];
const TASK_FIELDS = [
  'project_id', 'title', 'status', 'mandatory', 'mandatory_reason', 'position', 'done_at', 'created_at', 'updated_at',
];

const ENUMS = {
  idea_status: ['parked', 'evaluated', 'decided', 'dropped'],
  project_status: ['active', 'completed'],
  task_status: ['todo', 'doing', 'done'],
  importance: rules.IMPORTANCE,
  urgency: rules.URGENCY,
  core_context: rules.CORE_CONTEXT,
  mission_critical: rules.YES_NO,
  money: rules.TERNARY,
  time: rules.TERNARY,
  delegation: rules.TERNARY,
};

const LEGACY_IDEA_STATUS = { parkplatz: 'parked', evaluiert: 'parked', entschieden: 'decided', verworfen: 'dropped' };
const LEGACY_ANSWER = { ja: 'yes', neutral: 'neutral', nein: 'no' };

const str = (v, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : v == null ? '' : String(v).slice(0, max));
const pick = (v, values) => (values.includes(v) ? v : null);
const isoOr = (v, fallback) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : fallback);

function legacyDate(v, fallback) {
  if (typeof v !== 'string') return fallback;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v) ? `${v.replace(' ', 'T')}:00.000Z` : v;
  return isoOr(iso, fallback);
}

function exportAll(ctx) {
  const { db } = ctx;
  const u = ctx.uid();
  const g = db.prepare('SELECT * FROM gamification WHERE user_id = ?').get(u);
  const h = db.prepare('SELECT * FROM home_state WHERE user_id = ?').get(u);
  const strip = ({ user_id, ...r }) => r; // eslint-disable-line no-unused-vars
  return {
    app: 'orbital',
    format_version: FORMAT_VERSION,
    schema_version: schemaVersion(db),
    exported_at: ctx.nowIso(),
    ideas: db.prepare('SELECT * FROM ideas WHERE user_id = ? ORDER BY id').all(u).map(strip),
    projects: db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY id').all(u).map(strip),
    tasks: db.prepare('SELECT t.* FROM tasks t JOIN projects p ON p.id = t.project_id WHERE p.user_id = ? ORDER BY t.id').all(u),
    gamification: {
      xp_total: g.xp_total,
      xp_spent: g.xp_spent,
      streak: g.streak,
      best_streak: g.best_streak,
      last_active_day: g.last_active_day,
      settings: JSON.parse(g.settings),
    },
    xp_events: db.prepare('SELECT * FROM xp_events WHERE user_id = ? ORDER BY id').all(u).map(strip),
    home_state: {
      owned_items: JSON.parse(h.owned_items),
      placements: JSON.parse(h.placements),
      last_mow_at: h.last_mow_at,
    },
    scratchpad: db.prepare('SELECT content, updated_at FROM scratchpad WHERE user_id = ?').get(u),
    scratch_snapshots: db.prepare('SELECT day, content, created_at FROM scratch_snapshots WHERE user_id = ? ORDER BY day').all(u),
    sorted_history: db.prepare('SELECT text, items, sorted_at FROM sorted_history WHERE user_id = ? ORDER BY id').all(u),
  };
}

// Normalises one idea, project or task row from an Orbital export.
function cleanIdea(r, now) {
  return {
    title: str(r.title, 200).trim() || '(untitled)',
    notes: str(r.notes),
    status: pick(r.status, ENUMS.idea_status) || 'parked',
    importance: pick(r.importance, ENUMS.importance),
    urgency: pick(r.urgency, ENUMS.urgency),
    core_context: pick(r.core_context, ENUMS.core_context),
    mission_critical: pick(r.mission_critical, ENUMS.mission_critical),
    money: pick(r.money, ENUMS.money),
    time: pick(r.time, ENUMS.time),
    delegation: pick(r.delegation, ENUMS.delegation),
    mandatory: r.mandatory ? 1 : 0,
    mandatory_reason: str(r.mandatory_reason, 200),
    due_date: typeof r.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.due_date) ? r.due_date : null,
    quadrant_set_at: isoOr(r.quadrant_set_at, null),
    done_at: isoOr(r.done_at, null),
    created_at: isoOr(r.created_at, now),
    updated_at: isoOr(r.updated_at, now),
  };
}

function cleanProject(r, now) {
  return {
    title: str(r.title, 200).trim() || '(untitled)',
    notes: str(r.notes),
    status: pick(r.status, ENUMS.project_status) || 'active',
    kind: r.kind === 'inbox' ? 'inbox' : 'normal',
    idea_id: Number.isInteger(r.idea_id) ? r.idea_id : null,
    core_context: pick(r.core_context, ENUMS.core_context),
    mission_critical: pick(r.mission_critical, ENUMS.mission_critical),
    mandatory: r.mandatory ? 1 : 0,
    mandatory_reason: str(r.mandatory_reason, 200),
    quadrant_set_at: isoOr(r.quadrant_set_at, null),
    completed_at: isoOr(r.completed_at, null),
    created_at: isoOr(r.created_at, now),
    updated_at: isoOr(r.updated_at, now),
  };
}

function cleanTask(r, now) {
  return {
    project_id: r.project_id,
    title: str(r.title, 200).trim() || '(untitled)',
    status: pick(r.status, ENUMS.task_status) || 'todo',
    mandatory: r.mandatory ? 1 : 0,
    mandatory_reason: str(r.mandatory_reason, 200),
    position: Number.isInteger(r.position) && r.position >= 0 ? r.position : 0,
    done_at: isoOr(r.done_at, null),
    created_at: isoOr(r.created_at, now),
    updated_at: isoOr(r.updated_at, now),
  };
}

// Converts an old Planer prototype file to the Orbital export shape.
function fromLegacy(data, now) {
  const ideas = [];
  const projects = [];
  const tasks = [];
  for (const i of data.ideas) {
    if (!i || typeof i !== 'object') continue;
    const created = legacyDate(i.created, now);
    ideas.push({
      id: i.id,
      title: i.title,
      notes: i.notes,
      // Old "evaluated" ideas have no Eisenhower answers yet, so they start parked.
      status: LEGACY_IDEA_STATUS[i.status] || 'parked',
      money: LEGACY_ANSWER[i.geld] || null,
      time: LEGACY_ANSWER[i.zeit] || null,
      delegation: LEGACY_ANSWER[i.delegation] || null,
      created_at: created,
      updated_at: created,
    });
  }
  for (const p of data.projects) {
    if (!p || typeof p !== 'object') continue;
    const created = legacyDate(p.created, now);
    projects.push({ id: p.id, title: p.title, notes: p.notes, idea_id: p.ideaId ?? null, created_at: created, updated_at: created });
    (Array.isArray(p.tasks) ? p.tasks : []).forEach((t, n) => {
      if (!t || typeof t !== 'object') return;
      tasks.push({ id: t.id, project_id: p.id, title: t.title, status: t.status, position: n, done_at: t.status === 'done' ? created : null, created_at: created, updated_at: created });
    });
  }
  return { ideas, projects, tasks };
}

function detect(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.app === 'orbital' && Array.isArray(data.ideas) && Array.isArray(data.projects)) return 'orbital';
  if (Array.isArray(data.ideas) && Array.isArray(data.projects)) return 'legacy';
  return null;
}

// mode: 'replace' wipes everything first (restore). 'merge' adds items next to the existing ones.
function importAll(ctx, data, mode = 'merge') {
  const { db } = ctx;
  if (!['replace', 'merge'].includes(mode)) throw new HttpError(400, 'validation_error', 'mode must be replace or merge');
  const format = detect(data);
  if (!format) throw new HttpError(400, 'invalid_import', 'File is not an Orbital or Planer export');
  const now = ctx.nowIso();
  const src = format === 'legacy' ? fromLegacy(data, now) : { ideas: data.ideas, projects: data.projects, tasks: Array.isArray(data.tasks) ? data.tasks : [] };
  if (src.ideas.length + src.projects.length + src.tasks.length > 50000) {
    throw new HttpError(413, 'too_large', 'Import is too large');
  }
  const u = ctx.uid();
  // Restoring an Orbital file also restores XP, history, home and scratchpad.
  const restore = mode === 'replace' && format === 'orbital';

  const insert = (table, fields, row) => {
    const cols = ['user_id', ...fields];
    const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => `@${c}`).join(', ')})`;
    return Number(db.prepare(sql).run({ user_id: u, ...row }).lastInsertRowid);
  };
  const insertTask = (row) => {
    const sql = `INSERT INTO tasks (${TASK_FIELDS.join(', ')}) VALUES (${TASK_FIELDS.map((c) => `@${c}`).join(', ')})`;
    return Number(db.prepare(sql).run(row).lastInsertRowid);
  };

  const counts = { ideas: 0, projects: 0, tasks: 0 };
  db.transaction(() => {
    if (mode === 'replace') {
      // Only this user's data. Tasks go with their projects.
      db.prepare('DELETE FROM projects WHERE user_id = ?').run(u);
      db.prepare('DELETE FROM ideas WHERE user_id = ?').run(u);
      db.prepare('DELETE FROM xp_events WHERE user_id = ?').run(u);
      db.prepare('UPDATE gamification SET xp_total = 0, xp_spent = 0, streak = 0, best_streak = 0, last_active_day = NULL WHERE user_id = ?').run(u);
      db.prepare("UPDATE home_state SET owned_items = '[]', placements = '[]', last_mow_at = NULL WHERE user_id = ?").run(u);
    }
    // Ids are global across users, so imported rows always get new ids.
    const ideaMap = new Map();
    const projectMap = new Map();
    const taskMap = new Map();
    for (const r of src.ideas) {
      if (!r || typeof r !== 'object') continue;
      const id = insert('ideas', IDEA_FIELDS, cleanIdea(r, now));
      if (r.id != null) ideaMap.set(r.id, id);
      counts.ideas += 1;
    }
    for (const r of src.projects) {
      if (!r || typeof r !== 'object') continue;
      const row = cleanProject(r, now);
      row.idea_id = row.idea_id != null ? ideaMap.get(row.idea_id) ?? null : null;
      const id = insert('projects', PROJECT_FIELDS, row);
      if (r.id != null) projectMap.set(r.id, id);
      counts.projects += 1;
      // Also accept tasks nested inside projects (as GET /api/projects returns them).
      if (Array.isArray(r.tasks) && format === 'orbital' && !Array.isArray(data.tasks)) {
        for (const t of r.tasks) src.tasks.push({ ...t, project_id: r.id });
      }
    }
    for (const r of src.tasks) {
      if (!r || typeof r !== 'object') continue;
      const projectId = projectMap.get(r.project_id);
      if (!projectId) continue;
      const id = insertTask(cleanTask({ ...r, project_id: projectId }, now));
      if (r.id != null) taskMap.set(r.id, id);
      counts.tasks += 1;
    }
    if (restore) {
      const g = data.gamification && typeof data.gamification === 'object' ? data.gamification : {};
      const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
      db.prepare(
        'UPDATE gamification SET xp_total = ?, xp_spent = ?, streak = ?, best_streak = ?, last_active_day = ?, settings = ? WHERE user_id = ?',
      ).run(
        int(g.xp_total),
        Math.min(int(g.xp_spent), int(g.xp_total)),
        int(g.streak),
        int(g.best_streak),
        typeof g.last_active_day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.last_active_day) ? g.last_active_day : null,
        JSON.stringify({
          effects: g.settings?.effects !== false,
          sound: g.settings?.sound === true,
          companion_name: typeof g.settings?.companion_name === 'string' && g.settings.companion_name.trim() ? g.settings.companion_name.trim().slice(0, 24) : 'Orbit',
          companion_color: COMPANION_COLORS.includes(g.settings?.companion_color) ? g.settings.companion_color : 'moon',
          onboarded: g.settings?.onboarded !== false,
        }),
        u,
      );
      const refMaps = { idea: ideaMap, project: projectMap, task: taskMap };
      const ev = db.prepare('INSERT INTO xp_events (user_id, action, xp, ref_type, ref_id, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const e of Array.isArray(data.xp_events) ? data.xp_events : []) {
        if (!e || typeof e.action !== 'string' || !Number.isInteger(e.xp) || typeof e.day !== 'string') continue;
        const map = refMaps[e.ref_type];
        const refId = Number.isInteger(e.ref_id) ? (map ? map.get(e.ref_id) ?? null : e.ref_id) : null;
        ev.run(u, e.action, e.xp, e.ref_type ?? null, refId, e.day, isoOr(e.created_at, now));
      }
      if (data.home_state && typeof data.home_state === 'object') ctx.home.importState(data.home_state);
      db.prepare('DELETE FROM scratch_snapshots WHERE user_id = ?').run(u);
      db.prepare('DELETE FROM sorted_history WHERE user_id = ?').run(u);
      const sp = data.scratchpad && typeof data.scratchpad.content === 'string' ? data.scratchpad : { content: '', updated_at: null };
      db.prepare('UPDATE scratchpad SET content = ?, updated_at = ? WHERE user_id = ?').run(sp.content.slice(0, 200000), isoOr(sp.updated_at, null), u);
      const snap = db.prepare('INSERT OR IGNORE INTO scratch_snapshots (user_id, day, content, created_at) VALUES (?, ?, ?, ?)');
      for (const x of Array.isArray(data.scratch_snapshots) ? data.scratch_snapshots : []) {
        if (x && /^\d{4}-\d{2}-\d{2}$/.test(x.day) && typeof x.content === 'string') snap.run(u, x.day, x.content, isoOr(x.created_at, now));
      }
      const hist = db.prepare('INSERT INTO sorted_history (user_id, text, items, sorted_at) VALUES (?, ?, ?, ?)');
      for (const x of Array.isArray(data.sorted_history) ? data.sorted_history : []) {
        if (x && typeof x.text === 'string') hist.run(u, x.text, typeof x.items === 'string' ? x.items : '[]', isoOr(x.sorted_at, now));
      }
    }
  })();
  return { format, mode, imported: counts };
}

module.exports = { FORMAT_VERSION, exportAll, importAll, fromLegacy, detect };
