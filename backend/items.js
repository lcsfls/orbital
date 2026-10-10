'use strict';

// Shared helpers for ideas, projects and tasks.

const rules = require('./rules');
const { daysBetween, dayOf } = require('./gamification');

const REVIEW_AFTER_DAYS = 90;

const IDEA_STATUS = ['parked', 'evaluated', 'decided', 'dropped'];
const PROJECT_STATUS = ['active', 'completed'];
const TASK_STATUS = ['todo', 'doing', 'done'];

const ECONOMICS_FIELDS = ['money', 'time', 'delegation'];
const EISENHOWER_FIELDS = ['importance', 'urgency'];
const CORE_CONTEXT_FIELDS = ['core_context', 'mission_critical'];

const enumOf = (values) => ({ type: 'enum', values, nullable: true });

const IDEA_SCHEMA = {
  title: { type: 'string', required: true, min: 1, max: 200 },
  notes: { type: 'string', max: 5000 },
  status: { type: 'enum', values: IDEA_STATUS },
  importance: enumOf(rules.IMPORTANCE),
  urgency: enumOf(rules.URGENCY),
  core_context: enumOf(rules.CORE_CONTEXT),
  mission_critical: enumOf(rules.YES_NO),
  money: enumOf(rules.TERNARY),
  time: enumOf(rules.TERNARY),
  delegation: enumOf(rules.TERNARY),
  mandatory: { type: 'bool' },
  mandatory_reason: { type: 'string', max: 200 },
  due_date: { type: 'date', nullable: true },
};

const PROJECT_SCHEMA = {
  title: { type: 'string', required: true, min: 1, max: 200 },
  notes: { type: 'string', max: 5000 },
  status: { type: 'enum', values: PROJECT_STATUS },
  core_context: enumOf(rules.CORE_CONTEXT),
  mission_critical: enumOf(rules.YES_NO),
  mandatory: { type: 'bool' },
  mandatory_reason: { type: 'string', max: 200 },
};

const TASK_SCHEMA = {
  project_id: { type: 'int', required: true, min: 1 },
  title: { type: 'string', required: true, min: 1, max: 200 },
  status: { type: 'enum', values: TASK_STATUS },
  mandatory: { type: 'bool' },
  mandatory_reason: { type: 'string', max: 200 },
  position: { type: 'int', min: 0 },
};

const REVIEW_SCHEMA = {
  core_context: { type: 'enum', values: rules.CORE_CONTEXT, required: true },
  mission_critical: { type: 'enum', values: rules.YES_NO, required: true },
  note: { type: 'string', max: 1000 },
};

const touches = (patch, fields) => fields.some((f) => f in patch);

// Booleans are stored as 0/1.
function toRow(patch) {
  const out = { ...patch };
  if ('mandatory' in out) out.mandatory = out.mandatory ? 1 : 0;
  return out;
}

// Keeps Core/Context side effects consistent:
// - quadrant_set_at is stamped whenever the quadrant changes,
// - context + critical (Manage) prefills mandatory unless the caller set it explicitly,
// - leaving Manage removes the automatic mandatory flag again.
function applyCoreContext(prev, next, patch, nowIso) {
  const before = prev ? rules.coreContextQuadrant(prev.core_context, prev.mission_critical) : null;
  const after = rules.coreContextQuadrant(next.core_context, next.mission_critical);
  if (after !== before) {
    next.quadrant_set_at = after ? nowIso : null;
    if (!('mandatory' in patch)) {
      if (after === 'manage') {
        next.mandatory = 1;
        if (!next.mandatory_reason) next.mandatory_reason = rules.MANAGE_REASON;
      } else if (before === 'manage' && next.mandatory_reason === rules.MANAGE_REASON) {
        next.mandatory = 0;
        next.mandatory_reason = '';
      }
    }
  }
  if (next.mandatory && !next.mandatory_reason && after === 'manage') next.mandatory_reason = rules.MANAGE_REASON;
}

function isOpenIdea(row) {
  return row.status === 'parked' || row.status === 'evaluated';
}

function reviewDue(row, open, now, timeZone) {
  if (!open || !row.quadrant_set_at) return false;
  const since = daysBetween(dayOf(new Date(row.quadrant_set_at), timeZone), dayOf(now, timeZone));
  return since >= REVIEW_AFTER_DAYS;
}

function serializeIdea(row, ctx) {
  const ev = rules.evaluate(row);
  const open = isOpenIdea(row);
  return {
    ...row,
    mandatory: Boolean(row.mandatory),
    ...ev,
    open,
    review_due: reviewDue(row, open && Boolean(ev.core_context_quadrant), ctx.clock.now(), ctx.clock.timeZone),
  };
}

function serializeTask(row) {
  return { ...row, mandatory: Boolean(row.mandatory) };
}

function serializeProject(row, tasks, ctx) {
  const ev = rules.evaluate(row);
  const open = row.status === 'active';
  const list = tasks.map(serializeTask);
  const done = list.filter((t) => t.status === 'done').length;
  return {
    ...row,
    mandatory: Boolean(row.mandatory),
    core_context_quadrant: ev.core_context_quadrant,
    result: ev.result_kind === 'mandatory' || ev.result_kind === 'manage' ? ev.result : null,
    result_kind: ev.result_kind === 'mandatory' || ev.result_kind === 'manage' ? ev.result_kind : null,
    open,
    review_due: reviewDue(row, open, ctx.clock.now(), ctx.clock.timeZone),
    tasks: list,
    tasks_done: done,
    progress: list.length ? Math.round((100 * done) / list.length) : 0,
  };
}

// Sort: open mandatory/Manage first, then open before closed, then Eisenhower order, newest first.
function sortIdeas(list) {
  const rank = (i) => {
    const pinned = i.open && (i.mandatory || i.core_context_quadrant === 'manage') ? 0 : 1;
    const openRank = i.open ? 0 : 1;
    const eq = i.eisenhower_quadrant ? rules.EISENHOWER[i.eisenhower_quadrant].order : 4;
    return [pinned, openRank, eq];
  };
  return list.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let k = 0; k < ra.length; k += 1) if (ra[k] !== rb[k]) return ra[k] - rb[k];
    return b.id - a.id;
  });
}

function sortProjects(list) {
  const rank = (p) => (p.open ? (p.mandatory || p.core_context_quadrant === 'manage' ? 0 : 1) : 2);
  return list.sort((a, b) => rank(a) - rank(b) || b.id - a.id);
}

// Open mandatory and Manage items. These drive the Overview banner and Orbit's alert state.
function openAlerts(db, userId) {
  const out = [];
  for (const row of db.prepare("SELECT * FROM ideas WHERE user_id = ? AND status IN ('parked','evaluated')").all(userId)) {
    const ev = rules.evaluate(row);
    if (row.mandatory || ev.core_context_quadrant === 'manage') {
      out.push({ type: 'idea', id: row.id, title: row.title, reason: row.mandatory_reason, still_required: ev.still_required });
    }
  }
  for (const row of db.prepare("SELECT * FROM projects WHERE user_id = ? AND status = 'active'").all(userId)) {
    const q = rules.coreContextQuadrant(row.core_context, row.mission_critical);
    if (row.mandatory || q === 'manage') {
      out.push({ type: 'project', id: row.id, title: row.title, reason: row.mandatory_reason, still_required: false });
    }
  }
  const tasks = db
    .prepare(
      `SELECT t.*, p.title AS project_title FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE p.user_id = ? AND t.mandatory = 1 AND t.status != 'done' AND p.status = 'active'`,
    )
    .all(userId);
  for (const t of tasks) {
    out.push({ type: 'task', id: t.id, project_id: t.project_id, title: t.title, project_title: t.project_title, reason: t.mandatory_reason, still_required: false });
  }
  return out;
}

module.exports = {
  REVIEW_AFTER_DAYS,
  IDEA_STATUS,
  PROJECT_STATUS,
  TASK_STATUS,
  ECONOMICS_FIELDS,
  EISENHOWER_FIELDS,
  CORE_CONTEXT_FIELDS,
  IDEA_SCHEMA,
  PROJECT_SCHEMA,
  TASK_SCHEMA,
  REVIEW_SCHEMA,
  touches,
  toRow,
  applyCoreContext,
  isOpenIdea,
  serializeIdea,
  serializeProject,
  serializeTask,
  sortIdeas,
  sortProjects,
  openAlerts,
};
