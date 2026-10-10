'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer, ADMIN } = require('./helpers');
const { openDatabase } = require('../backend/db');
const { POOLS } = require('../backend/praise');

const EVAL = { importance: 'important', urgency: 'urgent', core_context: 'core', mission_critical: 'yes' };

test('health check and config', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const h = await s.get('/healthz');
  assert.equal(h.status, 200);
  assert.equal(h.body.status, 'ok');
  assert.equal(h.body.schema_version, 2);
  const c = await s.get('/api/config');
  assert.equal(c.body.name, 'Orbital');
  assert.equal(c.body.home_enabled, false);
  assert.equal(c.body.ai_enabled, false);
});

test('ideas CRUD', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const created = await s.post('/api/ideas', { title: '  Backup audit  ', notes: 'for small practices' });
  assert.equal(created.status, 201);
  assert.equal(created.body.item.title, 'Backup audit');
  assert.equal(created.body.item.status, 'parked');
  const id = created.body.item.id;

  const list = await s.get('/api/ideas');
  assert.equal(list.body.length, 1);
  const one = await s.get(`/api/ideas/${id}`);
  assert.equal(one.body.notes, 'for small practices');

  const upd = await s.patch(`/api/ideas/${id}`, { notes: 'changed' });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.item.notes, 'changed');

  assert.equal((await s.del(`/api/ideas/${id}`)).status, 204);
  assert.equal((await s.get(`/api/ideas/${id}`)).status, 404);
});

test('input validation returns JSON errors', async (t) => {
  const s = await startServer();
  t.after(s.close);
  let r = await s.post('/api/ideas', {});
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'validation_error');
  r = await s.post('/api/ideas', { title: 'x', importance: 'very' });
  assert.equal(r.status, 400);
  r = await s.post('/api/ideas', { title: 'x', color: 'red' });
  assert.equal(r.status, 400);
  assert.match(r.body.message, /not a known field/);
  r = await s.post('/api/ideas', '{"title":');
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'invalid_json');
  r = await s.get('/api/ideas/abc');
  assert.equal(r.status, 400);
  r = await s.get('/api/nothing');
  assert.equal(r.status, 404);
  assert.equal(r.body.error, 'not_found');
  r = await s.post('/api/tasks', { project_id: 999, title: 'x' });
  assert.equal(r.status, 400);
});

test('Eisenhower quadrant results through the API', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const cases = [
    ['important', 'urgent', 'do_now', 'Do now'],
    ['important', 'not_urgent', 'schedule', 'Schedule'],
    ['not_important', 'urgent', 'delegate', 'Delegate'],
    ['not_important', 'not_urgent', 'drop', 'Drop or defer'],
  ];
  for (const [importance, urgency, q, label] of cases) {
    const r = await s.post('/api/ideas', { title: q, importance, urgency });
    assert.equal(r.body.item.eisenhower_quadrant, q);
    assert.equal(r.body.item.result, label);
    // Eisenhower alone is not a full evaluation: Core/Context is required too.
    assert.equal(r.body.item.status, 'parked');
  }
});

test('Eisenhower is required before economics', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const r = await s.post('/api/ideas', { title: 'x', money: 'yes', time: 'yes', delegation: 'no' });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, 'eisenhower_required');
  const ok = await s.post('/api/ideas', { title: 'x', ...EVAL, money: 'yes', time: 'yes', delegation: 'no' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.item.status, 'evaluated');
  assert.equal(ok.body.item.result, 'Do it yourself and prioritise');
  const fb = await s.post('/api/ideas', { title: 'y', ...EVAL, money: 'yes', time: 'yes', delegation: 'yes' });
  assert.equal(fb.body.item.result_kind, 'fallback');
  const bad = await s.post('/api/ideas', { title: 'z', status: 'evaluated', importance: 'important', urgency: 'urgent' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'evaluation_incomplete');
});

test('mandatory override: first in the list, skips stage 2, cannot be dropped', async (t) => {
  const s = await startServer();
  t.after(s.close);
  await s.post('/api/ideas', { title: 'Do now idea', ...EVAL });
  const m = await s.post('/api/ideas', {
    title: 'Renew certificate',
    importance: 'not_important',
    urgency: 'not_urgent',
    core_context: 'core',
    mission_critical: 'no',
    money: 'no',
    time: 'no',
    delegation: 'no',
    mandatory: true,
    mandatory_reason: 'Security vulnerability',
  });
  assert.equal(m.body.item.result, 'Mandatory – must be done');
  assert.equal(m.body.item.stage2_skipped, true);
  assert.equal(m.body.item.still_required, true);
  assert.equal(m.body.gamification.orbit_state, 'alert');

  const list = await s.get('/api/ideas');
  assert.equal(list.body[0].title, 'Renew certificate');

  const drop = await s.patch(`/api/ideas/${m.body.item.id}`, { status: 'dropped' });
  assert.equal(drop.status, 409);

  const stats = await s.get('/api/stats');
  assert.equal(stats.body.mandatory_open.length, 1);
  assert.equal(stats.body.mandatory_open[0].reason, 'Security vulnerability');

  const done = await s.patch(`/api/ideas/${m.body.item.id}`, { status: 'decided' });
  assert.deepEqual(done.body.reward.actions, ['mandatory_done']);
  assert.equal(done.body.reward.xp, 30);
  assert.equal(done.body.gamification.orbit_state, 'idle');
});

test('Manage prefills mandatory and skips economics', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const r = await s.post('/api/ideas', { title: 'Payroll', importance: 'important', urgency: 'urgent', core_context: 'context', mission_critical: 'yes' });
  assert.equal(r.body.item.core_context_quadrant, 'manage');
  assert.equal(r.body.item.mandatory, true);
  assert.equal(r.body.item.mandatory_reason, 'Context, mission-critical');
  assert.equal(r.body.item.result, 'Keep running – minimise effort');
  assert.ok(r.body.item.quadrant_set_at);

  // Explicitly unticked stays unticked.
  const r2 = await s.post('/api/ideas', { title: 'Office plants', importance: 'important', urgency: 'urgent', core_context: 'context', mission_critical: 'yes', mandatory: false });
  assert.equal(r2.body.item.mandatory, false);

  // Leaving Manage removes the automatic flag.
  const moved = await s.patch(`/api/ideas/${r.body.item.id}`, { mission_critical: 'no' });
  assert.equal(moved.body.item.mandatory, false);
  assert.equal(moved.body.item.core_context_quadrant, 'offload');
});

test('XP rules: evaluate, park, drop, daily cap on new ideas, no double rewards', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const xp = [];
  for (let i = 0; i < 4; i += 1) {
    const r = await s.post('/api/ideas', { title: `idea ${i}` });
    xp.push(r.body.reward ? r.body.reward.xp : 0);
  }
  assert.deepEqual(xp, [5, 5, 5, 0]);

  const ev = await s.patch('/api/ideas/1', EVAL);
  assert.equal(ev.body.item.status, 'evaluated');
  assert.deepEqual(ev.body.reward.actions, ['evaluate']);
  assert.equal(ev.body.reward.xp, 15);

  const park = await s.patch('/api/ideas/1', { status: 'parked' });
  assert.equal(park.body.reward.xp, 10);
  assert.ok(POOLS.park.includes(park.body.reward.message));

  const again = await s.patch('/api/ideas/1', { status: 'evaluated' });
  assert.equal(again.body.reward, null);

  const drop = await s.patch('/api/ideas/2', { status: 'dropped' });
  assert.equal(drop.body.reward.xp, 10);
  assert.ok(POOLS.drop.includes(drop.body.reward.message));

  const g = await s.get('/api/gamification');
  assert.equal(g.body.xp_total, 15 + 15 + 10 + 10);
});

test('projects and tasks: CRUD, progress, task and project XP', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const idea = await s.post('/api/ideas', { title: 'Backup module', ...EVAL });
  const mp = await s.post(`/api/ideas/${idea.body.item.id}/make-project`);
  assert.equal(mp.status, 201);
  assert.equal(mp.body.idea.status, 'decided');
  const pid = mp.body.item.id;
  assert.equal(mp.body.item.core_context_quadrant, 'deploy');
  assert.equal((await s.post(`/api/ideas/${idea.body.item.id}/make-project`)).status, 409);

  const t1 = await s.post('/api/tasks', { project_id: pid, title: 'Write spec' });
  const t2 = await s.post('/api/tasks', { project_id: pid, title: 'Ship it', mandatory: true, mandatory_reason: 'Contract obligation' });
  assert.equal(t1.status, 201);
  assert.equal((await s.get(`/api/tasks?project_id=${pid}`)).body.length, 2);

  const d1 = await s.patch(`/api/tasks/${t1.body.item.id}`, { status: 'done' });
  assert.equal(d1.body.reward.xp, 20);
  assert.equal(d1.body.reward.message, 'First thing done today. The first one is always the hardest.');
  // Toggling back and forth does not farm XP.
  await s.patch(`/api/tasks/${t1.body.item.id}`, { status: 'todo' });
  const d1b = await s.patch(`/api/tasks/${t1.body.item.id}`, { status: 'done' });
  assert.equal(d1b.body.reward, null);

  const d2 = await s.patch(`/api/tasks/${t2.body.item.id}`, { status: 'done' });
  assert.equal(d2.body.reward.xp, 30);

  const p = await s.get(`/api/projects/${pid}`);
  assert.equal(p.body.progress, 100);
  assert.equal(p.body.tasks_done, 2);

  const done = await s.patch(`/api/projects/${pid}`, { status: 'completed' });
  assert.equal(done.body.reward.xp, 100);
  assert.ok(done.body.item.completed_at);

  const rename = await s.patch(`/api/projects/${pid}`, { title: 'Backup module v1' });
  assert.equal(rename.body.item.title, 'Backup module v1');

  assert.equal((await s.del(`/api/tasks/${t1.body.item.id}`)).status, 204);
  assert.equal((await s.del(`/api/projects/${pid}`)).status, 204);
  assert.equal((await s.get(`/api/tasks/${t2.body.item.id}`)).status, 404);
});

test('streak: daily actions count up, a gap resets quietly', async (t) => {
  const s = await startServer();
  t.after(s.close);
  await s.post('/api/ideas', { title: 'a' });
  assert.equal((await s.get('/api/gamification')).body.streak, 1);
  s.clock.addDays(1);
  await s.post('/api/ideas', { title: 'b' });
  assert.equal((await s.get('/api/gamification')).body.streak, 2);
  s.clock.addDays(2);
  const paused = (await s.get('/api/gamification')).body;
  assert.equal(paused.streak, 0);
  assert.equal(paused.streak_message, 'A pause is fine.');
  assert.equal(paused.best_streak, 2);
  await s.post('/api/ideas', { title: 'c' });
  assert.equal((await s.get('/api/gamification')).body.streak, 1);
});

test('gamification settings', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const g = await s.get('/api/gamification');
  assert.deepEqual(g.body.settings, { effects: true, sound: false, companion_name: 'Orbit', companion_color: 'moon', onboarded: false, crew: false });
  const p = await s.patch('/api/gamification', { settings: { effects: false } });
  assert.equal(p.body.settings.effects, false);
  assert.equal(p.body.settings.sound, false);
  assert.equal((await s.patch('/api/gamification', { settings: { volume: 3 } })).status, 400);

  // Onboarding: name and colour for the companion.
  const named = await s.patch('/api/gamification', { settings: { companion_name: '  Mila ', companion_color: 'mint', onboarded: true } });
  assert.equal(named.body.settings.companion_name, 'Mila');
  assert.equal(named.body.settings.companion_color, 'mint');
  assert.equal(named.body.settings.onboarded, true);
  assert.equal((await s.patch('/api/gamification', { settings: { companion_color: 'neon' } })).status, 400);
  assert.equal((await s.patch('/api/gamification', { settings: { companion_name: '' } })).status, 400);
  assert.equal((await s.patch('/api/gamification', { settings: { companion_name: 'x'.repeat(25) } })).status, 400);

  // Settings survive a backup round trip.
  const exp = (await s.get('/api/export')).body;
  await s.patch('/api/gamification', { settings: { companion_name: 'Other' } });
  await s.post('/api/import?mode=replace', exp);
  assert.equal((await s.get('/api/gamification')).body.settings.companion_name, 'Mila');
});

test('drift review after 90 days', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const r = await s.post('/api/ideas', { title: 'Hosting', ...EVAL });
  const id = r.body.item.id;
  assert.equal(r.body.item.review_due, false);
  s.clock.addDays(90);
  await s.login(ADMIN.username, ADMIN.password); // the session expired meanwhile
  const due = await s.get(`/api/ideas/${id}`);
  assert.equal(due.body.review_due, true);
  assert.equal((await s.get('/api/stats')).body.review_due.count, 1);

  const needNote = await s.post(`/api/ideas/${id}/review`, { core_context: 'context', mission_critical: 'no' });
  assert.equal(needNote.status, 400);
  assert.equal(needNote.body.error, 'confirmation_note_required');

  const rev = await s.post(`/api/ideas/${id}/review`, { core_context: 'context', mission_critical: 'yes' });
  assert.equal(rev.status, 200);
  assert.equal(rev.body.drift.direction, 'clockwise');
  assert.equal(rev.body.drift.message, 'Drifted. Normal.');
  assert.equal(rev.body.reward.xp, 15);
  assert.equal(rev.body.item.review_due, false);
  assert.equal(rev.body.item.core_context_quadrant, 'manage');

  // Not due anymore: no XP for another review right away.
  const again = await s.post(`/api/ideas/${id}/review`, { core_context: 'context', mission_critical: 'yes' });
  assert.equal(again.body.reward, null);
  assert.equal(again.body.drift.message, 'Quadrant confirmed.');
});

test('overview hints', async (t) => {
  const s = await startServer();
  t.after(s.close);
  let st = (await s.get('/api/stats')).body;
  assert.ok(st.hints.some((h) => h.code === 'deploy_empty'));
  const p = await s.post('/api/projects', { title: 'Ops', core_context: 'context', mission_critical: 'yes' });
  assert.equal(p.body.item.mandatory, true);
  for (const title of ['a', 'b']) await s.post('/api/tasks', { project_id: p.body.item.id, title });
  const other = await s.post('/api/projects', { title: 'Other' });
  await s.post('/api/tasks', { project_id: other.body.item.id, title: 'c' });
  st = (await s.get('/api/stats')).body;
  assert.ok(st.hints.some((h) => h.code === 'manage_heavy'));
  assert.equal(st.manage_task_share, 0.67);
});

test('scratchpad autosave target, snapshots and inbox sorting', async (t) => {
  const s = await startServer();
  t.after(s.close);
  let r = await s.put('/api/scratch', { content: 'first draft\n' });
  assert.equal(r.status, 200);
  assert.equal(r.body.content, 'first draft\n');
  assert.equal(r.body.unsorted, true);

  // Next day: the first change keeps yesterday's text as a snapshot.
  s.clock.addDays(1);
  await s.put('/api/scratch', { content: '' });
  const snaps = (await s.get('/api/scratch/snapshots')).body;
  assert.equal(snaps.length, 1);
  assert.equal(snaps[0].content, 'first draft\n');
  r = await s.post(`/api/scratch/snapshots/${snaps[0].day}/restore`);
  assert.equal(r.body.content, 'first draft\n');

  const text = 'Newsletter idea\n- call bank\nSwitch hosting?';
  await s.put('/api/scratch', { content: text });
  const preview = await s.post('/api/inbox/preview', { text });
  assert.deepEqual(preview.body.items.map((i) => i.kind), ['idea', 'task', 'idea']);

  const apply = await s.post('/api/inbox/apply', {
    items: preview.body.items.map(({ kind, title, notes }) => ({ kind, title, notes })),
    source_text: text,
    scratch_content: '',
  });
  assert.equal(apply.status, 201);
  assert.equal(apply.body.created.ideas.length, 2);
  assert.equal(apply.body.created.tasks.length, 1);
  assert.equal(apply.body.scratch.content, '');
  assert.equal(apply.body.reward.xp, 10);

  const ideas = (await s.get('/api/ideas')).body;
  assert.ok(ideas.some((i) => i.title === 'Switch hosting?' && i.notes === 'open question'));
  const inbox = (await s.get('/api/projects')).body.find((p) => p.kind === 'inbox');
  assert.equal(inbox.title, 'To-do');
  assert.equal(inbox.tasks[0].title, 'call bank');

  // Inbox zero is rewarded once per day; writing gives nothing.
  const w = await s.put('/api/scratch', { content: 'more' });
  assert.equal(w.body.reward, undefined);
  const again = await s.post('/api/inbox/apply', { items: [{ kind: 'idea', title: 'more' }], scratch_content: '' });
  assert.equal(again.body.reward, null);

  const hist = (await s.get('/api/inbox/history')).body;
  assert.equal(hist.length, 2);

  // History and snapshots older than 30 days are removed.
  s.clock.addDays(31);
  await s.login(ADMIN.username, ADMIN.password);
  assert.equal((await s.get('/api/inbox/history')).body.length, 0);
  assert.equal((await s.get('/api/scratch/snapshots')).body.length, 0);
});

test('export and import (replace) round trip, plus old Planer files', async (t) => {
  const s = await startServer();
  t.after(s.close);
  await s.post('/api/ideas', { title: 'Keep me', ...EVAL });
  const p = await s.post('/api/projects', { title: 'Proj' });
  await s.post('/api/tasks', { project_id: p.body.item.id, title: 'Task A', status: 'done' });
  await s.put('/api/scratch', { content: 'note' });
  const exp = await s.get('/api/export');
  assert.equal(exp.body.app, 'orbital');
  assert.equal(exp.body.tasks.length, 1);

  const s2 = await startServer();
  t.after(s2.close);
  await s2.post('/api/ideas', { title: 'Will be replaced' });
  const imp = await s2.post('/api/import?mode=replace', exp.body);
  assert.equal(imp.status, 200);
  assert.deepEqual(imp.body.imported, { ideas: 1, projects: 1, tasks: 1 });
  const ideas = (await s2.get('/api/ideas')).body;
  assert.deepEqual(ideas.map((i) => i.title), ['Keep me']);
  assert.equal((await s2.get('/api/gamification')).body.xp_total, exp.body.gamification.xp_total);
  assert.equal((await s2.get('/api/scratch')).body.content, 'note');

  const legacy = {
    version: 1,
    ideas: [
      { id: 1, title: 'Alte Idee', notes: '', status: 'evaluiert', geld: 'ja', zeit: 'nein', delegation: 'ja', ergebnis: 'Delegieren', created: '2025-01-05 10:00' },
      { id: 2, title: 'Verworfen', status: 'verworfen', created: '2025-01-06 10:00' },
    ],
    projects: [{ id: 3, title: 'Altes Projekt', notes: 'n', ideaId: 1, tasks: [{ id: 4, title: 'Schritt', status: 'done' }], created: '2025-01-07 09:00' }],
  };
  const li = await s2.post('/api/import', legacy);
  assert.equal(li.body.format, 'legacy');
  assert.deepEqual(li.body.imported, { ideas: 2, projects: 1, tasks: 1 });
  const all = (await s2.get('/api/ideas')).body;
  const old = all.find((i) => i.title === 'Alte Idee');
  assert.equal(old.status, 'parked');
  assert.equal(old.money, 'yes');
  assert.equal(old.result, null);
  assert.equal(all.find((i) => i.title === 'Verworfen').status, 'dropped');

  assert.equal((await s2.post('/api/import', { foo: 1 })).status, 400);
});

test('home can be switched off, and works when on', async (t) => {
  const off = await startServer();
  t.after(off.close);
  assert.equal((await off.get('/api/home')).status, 404);

  const s = await startServer({ homeEnabled: true });
  t.after(s.close);
  const h = await s.get('/api/home');
  assert.ok(h.body.catalogue.length >= 20 && h.body.catalogue.length <= 30);
  assert.equal(h.body.rooms.length, 3);
  for (const r of h.body.rooms) assert.ok(r.slots.length >= 4 && r.slots.length <= 6);

  assert.equal((await s.post('/api/home/buy', { item_id: 'stool' })).body.error, 'not_enough_xp');
  const p = await s.post('/api/projects', { title: 'P' });
  await s.post('/api/tasks', { project_id: p.body.item.id, title: 'T', status: 'done' });
  await s.patch(`/api/projects/${p.body.item.id}`, { status: 'completed' });
  const before = (await s.get('/api/gamification')).body;
  const buy = await s.post('/api/home/buy', { item_id: 'stool' });
  assert.equal(buy.status, 200);
  assert.ok(buy.body.state.owned_items.includes('stool'));
  assert.equal(buy.body.state.placements[0].slot, 'workshop-1');
  const after = buy.body.gamification;
  assert.equal(after.xp_total, before.xp_total, 'buying never changes earned XP or level');
  assert.equal(after.xp_balance, before.xp_balance - 25);
  assert.equal((await s.post('/api/home/buy', { item_id: 'stool' })).status, 409);
  assert.equal((await s.patch('/api/home/placements', { item_id: 'stool', slot: 'living-1' })).status, 409);

  // 3D living room layout.
  const sofaBuy = await s.post('/api/home/buy', { item_id: 'rug' });
  assert.equal(sofaBuy.status, 200);
  let lay = await s.patch('/api/home/layout', { item_id: 'rug', x: 3, z: 2, rot: 1 });
  assert.equal(lay.status, 200);
  assert.deepEqual(lay.body.state.placements.find((p) => p.item === 'rug').pos, { x: 3, z: 2, rot: 1 });
  const stoolLay = await s.patch('/api/home/layout', { item_id: 'stool', x: 1, z: 1, rot: 0 });
  assert.deepEqual(stoolLay.body.state.placements.find((p) => p.item === 'stool').pos, { x: 1, z: 1, rot: 0 });
  // Different rooms never block each other.
  assert.equal((await s.patch('/api/home/layout', { item_id: 'rug', x: 1, z: 1, rot: 0 })).status, 200);
  assert.equal((await s.patch('/api/home/layout', { item_id: 'rug', x: 6, z: 0, rot: 0 })).body.error, 'out_of_room');
  assert.equal((await s.patch('/api/home/layout', { item_id: 'rug', x: 0, z: 0, rot: 4 })).status, 400);
  assert.equal((await s.get('/vendor/three/three.module.js')).status, 200);

  // Grass grows with days since the last completed task, capped at 3 of 5.
  s.clock.addDays(10);
  assert.equal((await s.get('/api/home')).body.state.grass_level, 3);
  const mow = await s.post('/api/home/mow');
  assert.ok(['Fresh start.', 'Pause is fine.'].includes(mow.body.message));
  assert.equal(mow.body.state.grass_level, 0);
  assert.equal(mow.body.gamification, undefined);
});

test('local AI is off by default', async (t) => {
  const s = await startServer();
  t.after(s.close);
  assert.equal((await s.get('/api/ai/settings')).status, 404);
  assert.equal((await s.post('/api/ai/test')).status, 404);
});

test('local AI talks only to the configured endpoint and only suggests', async (t) => {
  const calls = [];
  const reply = (content) => ({ ok: true, status: 200, json: async () => ({ model: 'fake-model', choices: [{ message: { content } }] }) });
  const aiFetch = async (url, init) => {
    if (url.endsWith('/models')) {
      calls.push({ url });
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 'qwen' }, { id: 'llama3.2:3b' }] }) };
    }
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const prompt = JSON.parse(init.body).messages[0].content;
    if (prompt.includes('break a project')) return reply('{"steps":["Write the restore test","Pick a storage target","Write the restore test"],"reason":"Small first."}');
    if (prompt.includes('small friendly satellite robot')) {
      assert.ok(prompt.startsWith('You are Orbit,'));
      return reply('Try the restore test first! It is small.');
    }
    if (prompt.includes('single word')) return reply('ready');
    if (prompt.includes('Idea title:')) {
      return reply('Sure! ```json\n{"title":"Backup audit","tasks":["List clients","Write checklist","Book first audit"],"importance":"important","urgency":"not_urgent","core_context":"core","mission_critical":"no","reason":"New offer, nothing breaks yet!"}\n```');
    }
    if (prompt.includes('Lines:')) return reply('{"items":[{"kind":"idea","title":"Newsletter","core_context":"core","mission_critical":"no"},{"kind":"task","title":"Call bank"}]}');
    return reply('You finished one task. That is real progress!');
  };
  const s = await startServer({ aiEnabled: true, aiFetch, env: { AI_BASE_URL: 'http://127.0.0.1:11434' } });
  t.after(s.close);

  const st = await s.get('/api/ai/settings');
  assert.equal(st.body.endpoint, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(st.body.api_key_set, false);

  const upd = await s.patch('/api/ai/settings', { base_url: 'http://lmstudio.local:1234/v1', model: 'qwen', api_key: 'secret' });
  assert.equal(upd.body.api_key_set, true);
  assert.equal(upd.body.api_key, undefined);
  assert.equal((await s.patch('/api/ai/settings', { base_url: 'ftp://x' })).status, 400);

  const test1 = await s.post('/api/ai/test');
  assert.equal(test1.body.ok, true);
  assert.equal(test1.body.model, 'fake-model');
  assert.equal(calls[0].url, 'http://lmstudio.local:1234/v1/chat/completions');
  assert.equal(calls[0].headers.Authorization, 'Bearer secret');
  assert.equal(calls[0].body.model, 'qwen');

  const idea = await s.post('/api/ideas', { title: 'backup audit thing' });
  const before = (await s.get('/api/ideas')).body.length;
  const sug = await s.post(`/api/ai/suggest/${idea.body.item.id}`);
  assert.equal(sug.status, 200);
  assert.equal(sug.body.suggestion.title, 'Backup audit');
  assert.equal(sug.body.suggestion.tasks.length, 3);
  assert.equal(sug.body.suggestion.reason, 'New offer, nothing breaks yet.');
  assert.equal(sug.body.prompt.version, 1);
  // Nothing was created or changed.
  assert.equal((await s.get('/api/ideas')).body.length, before);
  assert.equal((await s.get(`/api/ideas/${idea.body.item.id}`)).body.title, 'backup audit thing');

  const inbox = await s.post('/api/ai/inbox', { text: 'newsletter\n- call bank' });
  assert.deepEqual(inbox.body.items.map((i) => i.kind), ['idea', 'task']);
  assert.equal((await s.get('/api/projects')).body.length, 0);

  const steps = await s.post('/api/projects', { title: 'Backup module' });
  const st2 = await s.post(`/api/ai/project-steps/${steps.body.item.id}`);
  assert.equal(st2.status, 200);
  assert.deepEqual(st2.body.steps, ['Write the restore test', 'Pick a storage target']);
  const models = await s.get('/api/ai/models');
  assert.deepEqual(models.body.models, ['llama3.2:3b', 'qwen']);
  assert.equal(calls.at(-1).url, 'http://lmstudio.local:1234/v1/models');

  const ask = await s.post('/api/orbit/ask', { message: 'What next?' });
  assert.equal(ask.body.source, 'ai');
  assert.equal(ask.body.text.includes('!'), false);

  const dg = await s.post('/api/ai/digest');
  assert.equal(dg.body.text.includes('!'), false);
  assert.ok(calls.every((c) => c.url.startsWith('http://lmstudio.local:1234/')));
});

test('simple to-do list', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const todo = await s.get('/api/todo');
  assert.equal(todo.status, 200);
  assert.equal(todo.body.kind, 'inbox');
  assert.equal(todo.body.title, 'To-do');
  assert.equal((await s.get('/api/todo')).body.id, todo.body.id, 'created once');

  const t1 = await s.post('/api/tasks', { project_id: todo.body.id, title: 'Buy stamps' });
  const done = await s.patch(`/api/tasks/${t1.body.item.id}`, { status: 'done' });
  assert.equal(done.body.reward.xp, 20);

  // The list is not counted as a project and cannot be completed.
  const st = (await s.get('/api/stats')).body;
  assert.equal(st.projects.active, 0);
  assert.equal(st.tasks.done, 1);
  assert.equal((await s.patch(`/api/projects/${todo.body.id}`, { status: 'completed' })).status, 409);

  // Move a to-do into a project and back.
  const p = await s.post('/api/projects', { title: 'Taxes' });
  const t2 = await s.post('/api/tasks', { project_id: todo.body.id, title: 'Find receipts' });
  const mv = await s.patch(`/api/tasks/${t2.body.item.id}`, { project_id: p.body.item.id });
  assert.equal(mv.body.item.project_id, p.body.item.id);
  assert.equal((await s.get(`/api/projects/${p.body.item.id}`)).body.tasks.length, 1);
  const other = s.client();
  await s.post('/api/users', { username: 'erin', password: 'erin-password' });
  await other.login('erin', 'erin-password');
  const theirs = (await other.get('/api/todo')).body.id;
  assert.notEqual(theirs, todo.body.id);
  assert.equal((await s.patch(`/api/tasks/${t2.body.item.id}`, { project_id: theirs })).status, 400);
});

test('Orbit answers without AI, rule based', async (t) => {
  const s = await startServer();
  t.after(s.close);
  let r = await s.post('/api/orbit/ask', { message: 'What now?' });
  assert.equal(r.body.source, 'rules');
  assert.equal(r.body.text, 'Nothing open right now. A pause is fine.');
  const p = await s.post('/api/projects', { title: 'Taxes' });
  await s.post('/api/tasks', { project_id: p.body.item.id, title: 'Find receipts' });
  r = await s.post('/api/orbit/ask', { message: 'What now?' });
  assert.match(r.body.text, /Find receipts, in Taxes/);
  assert.equal((await s.post('/api/orbit/ask', { message: '' })).status, 400);
});

test('AI errors are reported, not hidden', async (t) => {
  const aiFetch = async () => {
    throw new Error('connect ECONNREFUSED');
  };
  const s = await startServer({ aiEnabled: true, aiFetch });
  t.after(s.close);
  const r = await s.post('/api/ai/test');
  assert.equal(r.status, 502);
  assert.equal(r.body.error, 'ai_unreachable');
  assert.match(r.body.message, /host\.docker\.internal:11434\/v1\/chat\/completions/);
});

test('data survives reopening the database file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbital-'));
  const file = path.join(dir, 'orbital.sqlite');
  let db = openDatabase(file);
  db.prepare("INSERT INTO users (username, password_hash, created_at, updated_at) VALUES ('u1', 'x', 'x', 'x')").run();
  db.prepare("INSERT INTO ideas (user_id, title, created_at, updated_at) VALUES (1, 'persist', 'x', 'x')").run();
  db.close();
  db = openDatabase(file);
  assert.equal(db.prepare('SELECT title FROM ideas').get().title, 'persist');
  assert.equal(db.prepare('SELECT MAX(version) AS v FROM migrations').get().v, 2);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
