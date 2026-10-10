'use strict';

const path = require('node:path');
const express = require('express');
const rules = require('./rules');
const items = require('./items');
const { createGamification, XP, IDEA_CREATE_DAILY_CAP, COMPANION_COLORS } = require('./gamification');
const { createHome, ROOMS, CATALOGUE, GRIDS, FLAT_ITEMS } = require('./home');
const { exportAll, importAll } = require('./importexport');
const { createInbox, parseLines } = require('./inbox');
const { createAi } = require('./ai');
const { schemaVersion } = require('./db');
const { createAuth, currentUserId } = require('./auth');
const { createSystem } = require('./system');
const { createWeek } = require('./week');
const { HttpError, validate } = require('./validate');
const pkg = require('../package.json');

const systemClock = { now: () => new Date(), timeZone: process.env.TZ || 'UTC' };

// Builds the Express app. `clock` can be replaced in tests.
function createApp({
  db,
  clock = systemClock,
  homeEnabled = false,
  aiEnabled = false,
  aiFetch = globalThis.fetch,
  env = process.env,
  cookieSecure = 'auto',
  setupToken = '',
  dataDir = null,
  system: systemOpts = {},
  trustProxy = false,
  publicDir = path.join(__dirname, '..', 'public'),
}) {
  const uid = currentUserId;
  const auth = createAuth(db, clock, { cookieSecure });
  const game = createGamification(db, clock, uid);
  const home = createHome(db, clock, game, uid);

  const system = createSystem({ dataDir, env, ...systemOpts });
  const ctx = {
    db,
    clock,
    game,
    home,
    auth,
    uid,
    homeEnabled,
    setupToken,
    nowIso: () => clock.now().toISOString(),
    gameState: () => game.state(items.openAlerts(db, uid()).length),
  };

  ctx.week = createWeek(db, game);

  ctx.loadProject = (id) => {
    const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, uid());
    if (!row) throw new HttpError(404, 'not_found', 'Project not found');
    const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY position, id').all(id);
    return items.serializeProject(row, tasks, ctx);
  };

  // Standard response for mutations: the item, the reward (if any) and fresh gamification state.
  ctx.respond = (res, status, item, rewards, extra = {}) => {
    res.status(status).json({ item, ...extra, reward: game.combine(rewards), gamification: ctx.gameState() });
  };

  // Shared drift review for ideas and projects.
  ctx.review = (type, prev, due, body) => {
    const from = rules.coreContextQuadrant(prev.core_context, prev.mission_critical);
    const to = rules.coreContextQuadrant(body.core_context, body.mission_critical);
    const d = rules.drift(from, to);
    if (d.needsNote && !body.note) {
      throw new HttpError(400, 'confirmation_note_required', 'Moving from Deploy to Offload in one review needs a short confirmation note');
    }
    const now = ctx.nowIso();
    const next = { ...prev, core_context: body.core_context, mission_critical: body.mission_critical, updated_at: now };
    items.applyCoreContext(prev, next, {}, now);
    next.quadrant_set_at = now;
    if (body.note) {
      const label = (q) => (q ? rules.CORE_CONTEXT_QUADRANTS[q].label : 'none');
      const line = `Review ${game.today()}: ${label(from)} -> ${label(to)}. ${body.note}`;
      next.notes = prev.notes ? `${prev.notes}\n\n${line}` : line;
    }
    const rewards = due ? [game.award('quadrant_review', type, prev.id)] : [];
    const message =
      d.direction === 'clockwise' ? 'Drifted. Normal.' : d.direction === 'none' ? 'Quadrant confirmed.' : 'Quadrant updated.';
    return { fields: next, rewards, drift: { from, to, direction: d.direction, message } };
  };

  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  if (trustProxy) app.set('trust proxy', trustProxy);

  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });

  app.get('/healthz', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', version: pkg.version, commit: system.current().commit, schema_version: schemaVersion(db) });
    } catch (err) {
      res.status(503).json({ status: 'error', error: err.message });
    }
  });

  const api = express.Router();
  api.use(express.json({ limit: '10mb' }));
  api.use(auth.middleware);
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // CSRF protection: browsers cannot send this header cross-site without a CORS preflight,
    // and Orbital never answers preflights.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-orbital'] !== '1') {
      return next(new HttpError(403, 'csrf', 'Missing X-Orbital header'));
    }
    const hasBody = Number(req.headers['content-length']) > 0 || Boolean(req.headers['transfer-encoding']);
    if (['POST', 'PATCH', 'PUT'].includes(req.method) && hasBody && !req.is('application/json')) {
      return next(new HttpError(415, 'unsupported_media_type', 'Send JSON with Content-Type: application/json'));
    }
    if (['POST', 'PATCH', 'PUT'].includes(req.method) && req.body === undefined) req.body = {};
    next();
  });

  api.get('/config', (req, res) => {
    res.json({ name: 'Orbital', version: pkg.version, home_enabled: homeEnabled, ai_enabled: aiEnabled, setup_token_required: Boolean(setupToken) });
  });

  // Accounts. Everything below requires a signed-in user.
  api.use(require('./routes/users')(ctx));
  api.use(auth.requireUser);

  // Rule tables for the Rules tab, so the UI shows exactly what the server applies.
  api.get('/rules', (req, res) => {
    res.json({
      eisenhower: rules.EISENHOWER,
      economics: Object.entries(rules.ECONOMICS_RULES).map(([key, result]) => {
        const [money, time, delegation] = key.split('|');
        return { money, time, delegation, result };
      }),
      core_context: rules.CORE_CONTEXT_QUADRANTS,
      clockwise: rules.CLOCKWISE,
      xp: XP,
      idea_create_daily_cap: IDEA_CREATE_DAILY_CAP,
      review_after_days: items.REVIEW_AFTER_DAYS,
    });
  });

  // Live preview for the evaluation form. Same logic as saving.
  api.post('/evaluate', (req, res) => {
    const { title, notes, status, due_date, ...schema } = items.IDEA_SCHEMA; // eslint-disable-line no-unused-vars
    const body = validate(req.body, schema);
    const row = { ...body, mandatory: body.mandatory ? 1 : 0 };
    const ev = rules.evaluate(row);
    res.json({
      ...ev,
      eisenhower_label: ev.eisenhower_quadrant ? rules.EISENHOWER[ev.eisenhower_quadrant].label : null,
      core_context_label: ev.core_context_quadrant ? rules.CORE_CONTEXT_QUADRANTS[ev.core_context_quadrant].label : null,
      evaluated: rules.isEvaluated(row),
      prefill_mandatory: ev.core_context_quadrant === 'manage',
      manage_reason: rules.MANAGE_REASON,
    });
  });

  api.use('/ideas', require('./routes/ideas')(ctx));
  api.use('/projects', require('./routes/projects')(ctx));
  api.use('/tasks', require('./routes/tasks')(ctx));

  api.get('/stats', (req, res) => res.json(stats(ctx)));
  api.use(require('./routes/crew')(ctx));

  // Updates (admins). Checking only happens when an admin presses the button.
  api.get('/system/update', auth.requireAdmin, async (req, res) => res.json(await system.check()));
  api.post('/system/update', auth.requireAdmin, (req, res) => res.status(202).json(system.request()));
  api.get('/system/status', auth.requireAdmin, (req, res) => res.json({ current: system.current(), status: system.status() }));

  api.get('/gamification', (req, res) => res.json(ctx.gameState()));
  api.patch('/gamification', (req, res) => {
    const body = validate(req.body, { settings: { type: 'object', required: true } });
    const s = validate(body.settings, {
      effects: { type: 'bool' },
      sound: { type: 'bool' },
      companion_name: { type: 'string', min: 1, max: 24 },
      companion_color: { type: 'enum', values: COMPANION_COLORS },
      onboarded: { type: 'bool' },
      crew: { type: 'bool' },
    });
    game.updateSettings(s);
    res.json(ctx.gameState());
  });

  api.get('/export', (req, res) => {
    const day = game.today();
    res.set('Content-Disposition', `attachment; filename="orbital_${day}.json"`);
    res.json(exportAll(ctx));
  });
  api.post('/import', (req, res) => {
    const mode = req.query.mode || 'merge';
    const result = importAll(ctx, req.body, mode);
    res.json({ ...result, gamification: ctx.gameState() });
  });

  // Scratchpad and inbox.
  const inbox = createInbox(ctx);
  ctx.inbox = inbox;
  api.get('/scratch', (req, res) => res.json(inbox.getScratch()));
  api.put('/scratch', (req, res) => {
    const body = validate(req.body, { content: { type: 'string', required: true, max: 200000, raw: true } });
    res.json(inbox.saveScratch(body.content));
  });
  api.get('/scratch/snapshots', (req, res) => res.json(inbox.snapshots()));
  api.post('/scratch/snapshots/:day/restore', (req, res) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.day)) throw new HttpError(400, 'validation_error', 'day must be YYYY-MM-DD');
    res.json(inbox.restoreSnapshot(req.params.day));
  });
  api.get('/inbox/history', (req, res) => res.json(inbox.history()));

  // The simple to-do list: one per user, created on first use (stored as the 'inbox' project).
  api.get('/todo', (req, res) => res.json(ctx.loadProject(inbox.inboxProject())));
  api.post('/inbox/preview', (req, res) => {
    const body = validate(req.body, { text: { type: 'string', required: true, max: 200000 } });
    res.json({ items: parseLines(body.text), source: 'rules' });
  });
  const INBOX_ITEM = {
    kind: { type: 'enum', values: ['idea', 'task'], required: true },
    title: { type: 'string', required: true, min: 1, max: 200 },
    notes: { type: 'string', max: 5000 },
    reason: { type: 'string', max: 300 },
    source: { type: 'string', max: 5000 },
    importance: items.IDEA_SCHEMA.importance,
    urgency: items.IDEA_SCHEMA.urgency,
    core_context: items.IDEA_SCHEMA.core_context,
    mission_critical: items.IDEA_SCHEMA.mission_critical,
  };
  api.post('/inbox/apply', (req, res) => {
    const body = validate(req.body, {
      items: { type: 'array', required: true },
      source_text: { type: 'string', max: 200000 },
      scratch_content: { type: 'string', max: 200000, raw: true },
    });
    if (body.items.length > 500) throw new HttpError(413, 'too_large', 'Too many items in one sort');
    const list = body.items.map((it) => {
      const { reason, source, ...v } = validate(it, INBOX_ITEM); // eslint-disable-line no-unused-vars
      return v;
    });
    const r = inbox.apply({ ...body, items: list });
    res.status(201).json({ created: r.created, scratch: r.scratch, reward: game.combine(r.rewards), gamification: ctx.gameState() });
  });

  // Local AI. Hidden unless AI_ENABLED is set. Only explicit user actions call the model.
  const ai = createAi(ctx, { enabled: aiEnabled, env, fetchImpl: aiFetch });
  const aiRouter = express.Router();
  aiRouter.use((req, res, next) => (aiEnabled ? next() : next(new HttpError(404, 'not_found', 'Local AI is not enabled'))));
  aiRouter.get('/settings', (req, res) => res.json(ai.settings()));
  aiRouter.patch('/settings', auth.requireAdmin, (req, res) => {
    const body = validate(req.body, {
      base_url: { type: 'string', min: 1, max: 500 },
      model: { type: 'string', min: 1, max: 200 },
      api_key: { type: 'string', max: 500 },
      timeout_ms: { type: 'int', min: 1000 },
      max_tokens: { type: 'int', min: 16 },
    });
    if (body.timeout_ms > 600000) throw new HttpError(400, 'validation_error', 'timeout_ms must be at most 600000');
    if (body.max_tokens > 32000) throw new HttpError(400, 'validation_error', 'max_tokens must be at most 32000');
    res.json(ai.updateSettings(body));
  });
  aiRouter.post('/test', async (req, res) => res.json(await ai.test()));
  aiRouter.get('/models', async (req, res) => res.json(await ai.models()));
  aiRouter.post('/project-steps/:id', async (req, res) => {
    const id = Number(req.params.id);
    const project = Number.isInteger(id) ? db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(id, uid()) : null;
    if (!project) throw new HttpError(404, 'not_found', 'Project not found');
    const tasks = db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY position, id').all(id);
    res.json(await ai.projectSteps(project, tasks));
  });
  aiRouter.post('/suggest/:id', async (req, res) => {
    const id = Number(req.params.id);
    const idea = Number.isInteger(id) ? db.prepare('SELECT * FROM ideas WHERE id = ? AND user_id = ?').get(id, uid()) : null;
    if (!idea) throw new HttpError(404, 'not_found', 'Idea not found');
    res.json(await ai.suggest(idea));
  });
  aiRouter.post('/inbox', async (req, res) => {
    const body = validate(req.body, { text: { type: 'string', required: true, max: 50000 } });
    res.json({ ...(await ai.sortInbox(body.text)), source: 'ai' });
  });
  aiRouter.post('/digest', async (req, res) => res.json(await ai.digest()));
  api.use('/ai', aiRouter);

  // Talk to Orbit. Uses the local model when AI is on, otherwise a simple rule-based answer.
  api.post('/orbit/ask', async (req, res) => {
    const body = validate(req.body, { message: { type: 'string', required: true, min: 1, max: 500 } });
    const facts = orbitFacts(ctx);
    if (aiEnabled) {
      try {
        const r = await ai.orbitChat(body.message, facts.text, game.settings().companion_name);
        return res.json({ text: r.text, source: 'ai', model: r.model });
      } catch (err) {
        return res.json({ text: facts.fallback, source: 'rules', note: err.message });
      }
    }
    res.json({ text: facts.fallback, source: 'rules' });
  });

  // Home (phase 2). Hidden unless HOME_ENABLED is set.
  const homeRouter = express.Router();
  homeRouter.use((req, res, next) => (homeEnabled ? next() : next(new HttpError(404, 'not_found', 'Home is not enabled'))));
  homeRouter.get('/', (req, res) => res.json({ rooms: ROOMS, catalogue: CATALOGUE, grids: GRIDS, flat_items: [...FLAT_ITEMS], state: home.state() }));
  homeRouter.patch('/layout', (req, res) => {
    const body = validate(req.body, {
      item_id: { type: 'string', required: true, max: 64 },
      x: { type: 'int', required: true, min: 0 },
      z: { type: 'int', required: true, min: 0 },
      rot: { type: 'int', required: true, min: 0 },
    });
    if (body.rot > 3) throw new HttpError(400, 'validation_error', 'rot must be 0 to 3');
    const r = home.layout(body.item_id, body.x, body.z, body.rot);
    const messages = {
      not_owned: 'You do not own this item',
      out_of_room: 'That spot is outside the room',
      cell_taken: 'Something already stands there',
    };
    if (r.error) throw new HttpError(409, r.error, messages[r.error]);
    res.json({ state: home.state() });
  });
  homeRouter.post('/buy', (req, res) => {
    const body = validate(req.body, { item_id: { type: 'string', required: true, max: 64 } });
    const r = home.buy(body.item_id);
    if (r.error === 'unknown_item') throw new HttpError(404, r.error, 'Item not found');
    if (r.error === 'already_owned') throw new HttpError(409, r.error, 'You already own this item');
    if (r.error === 'not_enough_xp') throw new HttpError(409, r.error, 'Not enough XP yet');
    res.json({ state: home.state(), celebrate: true, gamification: ctx.gameState() });
  });
  homeRouter.patch('/placements', (req, res) => {
    const body = validate(req.body, {
      item_id: { type: 'string', required: true, max: 64 },
      slot: { type: 'string', nullable: true, required: true, max: 64 },
    });
    const r = home.place(body.item_id, body.slot);
    if (r.error) throw new HttpError(409, r.error, r.error === 'wrong_room' ? 'That slot is in another room' : 'You do not own this item');
    res.json({ state: home.state() });
  });
  homeRouter.post('/mow', (req, res) => {
    const message = home.mow();
    res.json({ state: home.state(), message });
  });
  api.use('/home', homeRouter);

  api.use((req, res, next) => next(new HttpError(404, 'not_found', 'Endpoint not found')));

  app.use('/api', api);
  // Vendored three.js for the 3D living room, served from node_modules (pinned in package.json).
  const threeDir = path.join(path.dirname(require.resolve('three')), '..');
  for (const file of ['three.module.js', 'three.core.js']) {
    app.get(`/vendor/three/${file}`, (req, res) => {
      res.type('text/javascript').set('Cache-Control', 'public, max-age=86400');
      res.sendFile(path.join(threeDir, 'build', file));
    });
  }
  app.use(express.static(publicDir, { index: 'index.html', maxAge: 0 }));

  // JSON errors everywhere.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'invalid_json', message: 'Request body is not valid JSON' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'too_large', message: 'Request body is too large' });
    }
    console.error(err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong on the server' });
  });

  return app;
}

// A short, factual picture of open work for Orbit (and a rule-based answer without AI).
function orbitFacts(ctx) {
  const { db } = ctx;
  const u = ctx.uid();
  const alerts = items.openAlerts(db, u);
  const tasks = db
    .prepare(
      `SELECT t.title, t.status, t.mandatory, p.title AS project FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE p.user_id = ? AND p.status = 'active' AND t.status != 'done' ORDER BY t.mandatory DESC, (t.status = 'doing') DESC, t.position LIMIT 12`,
    )
    .all(u);
  const parked = db.prepare("SELECT COUNT(*) AS n FROM ideas WHERE user_id = ? AND status = 'parked'").get(u).n;
  const g = ctx.gameState();
  const lines = [
    `Open tasks (${tasks.length}${tasks.length === 12 ? '+' : ''}): ${tasks.map((t) => `${t.title} [${t.project}${t.status === 'doing' ? ', in progress' : ''}${t.mandatory ? ', must happen' : ''}]`).join('; ') || 'none'}`,
    `Things that must happen: ${alerts.map((a) => a.title).join('; ') || 'none'}`,
    `Parked ideas waiting for a decision: ${parked}`,
    `Streak: ${g.streak} days. Level ${g.level}.`,
  ];
  let fallback;
  if (alerts.length) fallback = `First the thing that must happen: ${alerts[0].title}. One small step is enough.`;
  else if (tasks.length) fallback = `How about this one: ${tasks[0].title}, in ${tasks[0].project}. Small steps count.`;
  else if (parked) fallback = `Nothing open right now. You could decide one of your ${parked} parked ideas, or simply rest.`;
  else fallback = 'Nothing open right now. A pause is fine.';
  return { text: lines.join('\n'), fallback };
}

function stats(ctx) {
  const { db } = ctx;
  const ideas = db.prepare('SELECT * FROM ideas WHERE user_id = ?').all(ctx.uid()).map((r) => items.serializeIdea(r, ctx));
  const projects = db.prepare('SELECT id FROM projects WHERE user_id = ?').all(ctx.uid()).map((r) => ctx.loadProject(r.id));
  const byStatus = Object.fromEntries(items.IDEA_STATUS.map((s) => [s, 0]));
  const eisenhower = { do_now: 0, schedule: 0, delegate: 0, drop: 0 };
  const coreContext = { invent: 0, deploy: 0, manage: 0, offload: 0 };
  for (const i of ideas) {
    byStatus[i.status] += 1;
    if (i.status === 'dropped') continue;
    if (i.eisenhower_quadrant) eisenhower[i.eisenhower_quadrant] += 1;
    if (i.core_context_quadrant) coreContext[i.core_context_quadrant] += 1;
  }
  const active = projects.filter((p) => p.open);
  // The to-do list is not a project in the counts, but its tasks count as tasks.
  const realProjects = projects.filter((p) => p.kind !== 'inbox');
  const activeProjects = realProjects.filter((p) => p.open);
  const openTasks = active.flatMap((p) => p.tasks.filter((t) => t.status !== 'done').map((t) => ({ ...t, quadrant: p.core_context_quadrant })));
  const doneTasks = projects.reduce((n, p) => n + p.tasks_done, 0);
  const manageOpen = openTasks.filter((t) => t.quadrant === 'manage').length;
  const manageShare = openTasks.length ? manageOpen / openTasks.length : 0;

  const hints = [];
  if (coreContext.deploy === 0) hints.push({ code: 'deploy_empty', message: 'Nothing in Deploy. What actually pays right now?' });
  if (manageShare > 0.4) {
    hints.push({ code: 'manage_heavy', message: 'Most of your open work is Manage. Can any of it be automated or handed off?' });
  }

  const reviewDue = [
    ...ideas.filter((i) => i.review_due).map((i) => ({ type: 'idea', id: i.id, title: i.title })),
    ...projects.filter((p) => p.review_due).map((p) => ({ type: 'project', id: p.id, title: p.title })),
  ];

  return {
    ideas: { total: ideas.length, by_status: byStatus, parked: byStatus.parked },
    projects: { total: realProjects.length, active: activeProjects.length, completed: realProjects.length - activeProjects.length },
    tasks: { open: openTasks.length, done: doneTasks },
    eisenhower,
    core_context: coreContext,
    manage_task_share: Math.round(manageShare * 100) / 100,
    mandatory_open: items.openAlerts(db, ctx.uid()),
    review_due: { count: reviewDue.length, items: reviewDue },
    hints,
  };
}

module.exports = { createApp, systemClock };
