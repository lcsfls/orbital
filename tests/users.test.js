'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, ADMIN } = require('./helpers');
const { hashPassword, verifyPassword } = require('../backend/auth');

test('password hashing', () => {
  const h = hashPassword('correct horse');
  assert.match(h, /^scrypt\$/);
  assert.equal(verifyPassword('correct horse', h), true);
  assert.equal(verifyPassword('wrong horse', h), false);
  assert.notEqual(hashPassword('correct horse'), h, 'salted');
});

test('first run setup creates the admin once', async (t) => {
  const s = await startServer({ setup: false });
  t.after(s.close);
  let st = await s.get('/api/auth/status');
  assert.equal(st.body.setup_required, true);
  assert.equal(st.body.user, null);
  assert.equal((await s.get('/api/ideas')).status, 401);

  assert.equal((await s.post('/api/auth/setup', { username: 'ab', password: 'longenough' })).status, 400);
  assert.equal((await s.post('/api/auth/setup', { username: 'alex', password: 'short' })).status, 400);
  const r = await s.post('/api/auth/setup', { username: 'Alex', password: 'longenough', display_name: 'Alex' });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.username, 'alex');
  assert.equal(r.body.user.role, 'admin');
  assert.match(r.setCookie, /HttpOnly/i);
  assert.match(r.setCookie, /SameSite=Lax/i);

  st = await s.get('/api/auth/status');
  assert.equal(st.body.setup_required, false);
  assert.equal(st.body.user.username, 'alex');

  const other = s.client();
  assert.equal((await other.post('/api/auth/setup', { username: 'mallory', password: 'longenough' })).status, 409);
});

test('optional setup token', async (t) => {
  const s = await startServer({ setup: false, setupToken: 'let-me-in' });
  t.after(s.close);
  assert.equal((await s.post('/api/auth/setup', { username: 'alex', password: 'longenough' })).status, 403);
  assert.equal((await s.post('/api/auth/setup', { username: 'alex', password: 'longenough', setup_token: 'let-me-in' })).status, 201);
});

test('login, logout, wrong password, rate limit', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const c = s.client();
  assert.equal((await c.login(ADMIN.username, 'nope-nope')).status, 401);
  assert.equal((await c.login('nobody', 'nope-nope')).status, 401);
  const ok = await c.login(ADMIN.username.toUpperCase(), ADMIN.password);
  assert.equal(ok.status, 200);
  assert.equal((await c.get('/api/ideas')).status, 200);
  assert.equal((await c.post('/api/auth/logout')).status, 204);
  assert.equal((await c.get('/api/ideas')).status, 401);

  const brute = s.client();
  for (let i = 0; i < 10; i += 1) await brute.login('admin', `wrong-${i}-pass`);
  const locked = await brute.login(ADMIN.username, ADMIN.password);
  assert.equal(locked.status, 429);
});

test('sessions slide while in use and expire after 30 idle days', async (t) => {
  const s = await startServer();
  t.after(s.close);
  for (let i = 0; i < 4; i += 1) {
    s.clock.addDays(20);
    assert.equal((await s.get('/api/ideas')).status, 200, `still signed in after ${(i + 1) * 20} active days`);
  }
  s.clock.addDays(31);
  assert.equal((await s.get('/api/ideas')).status, 401);
});

test('mutations need the X-Orbital header (CSRF)', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const r = await s.call('POST', '/api/ideas', { title: 'x' }, { csrf: false });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'csrf');
  assert.equal((await s.call('GET', '/api/ideas', undefined, { csrf: false })).status, 200);
});

test('each user only sees their own data', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const created = await s.post('/api/users', { username: 'bea', password: 'bea-password', display_name: 'Bea' });
  assert.equal(created.status, 201);
  assert.equal(created.body.role, 'user');
  assert.equal(created.body.password_hash, undefined);

  const bea = s.client();
  await bea.login('bea', 'bea-password');

  const idea = await s.post('/api/ideas', { title: 'Admin idea' });
  const proj = await s.post('/api/projects', { title: 'Admin project' });
  const task = await s.post('/api/tasks', { project_id: proj.body.item.id, title: 'Admin task' });
  await s.put('/api/scratch', { content: 'admin notes' });

  assert.deepEqual((await bea.get('/api/ideas')).body, []);
  assert.deepEqual((await bea.get('/api/projects')).body, []);
  assert.deepEqual((await bea.get('/api/tasks')).body, []);
  assert.equal((await bea.get('/api/scratch')).body.content, '');
  assert.equal((await bea.get(`/api/ideas/${idea.body.item.id}`)).status, 404);
  assert.equal((await bea.patch(`/api/ideas/${idea.body.item.id}`, { title: 'hijack' })).status, 404);
  assert.equal((await bea.del(`/api/projects/${proj.body.item.id}`)).status, 404);
  assert.equal((await bea.patch(`/api/tasks/${task.body.item.id}`, { status: 'done' })).status, 404);
  assert.equal((await bea.post('/api/tasks', { project_id: proj.body.item.id, title: 'sneak' })).status, 400);
  assert.equal((await bea.post(`/api/ideas/${idea.body.item.id}/make-project`)).status, 404);

  // XP and streaks are per user.
  const g1 = (await s.get('/api/gamification')).body;
  const g2 = (await bea.get('/api/gamification')).body;
  assert.ok(g1.xp_total > 0);
  assert.equal(g2.xp_total, 0);
  await bea.post('/api/ideas', { title: 'Bea idea' });
  assert.equal((await bea.get('/api/stats')).body.ideas.total, 1);
  assert.equal((await s.get('/api/stats')).body.ideas.total, 1);

  // Export contains only your own data.
  const exp = (await bea.get('/api/export')).body;
  assert.deepEqual(exp.ideas.map((i) => i.title), ['Bea idea']);
  // Replace import only replaces your own data.
  await bea.post('/api/import?mode=replace', { ...exp, ideas: [] });
  assert.equal((await bea.get('/api/ideas')).body.length, 0);
  assert.equal((await s.get('/api/ideas')).body.length, 1);
});

test('admin user management', async (t) => {
  const s = await startServer();
  t.after(s.close);
  const u = (await s.post('/api/users', { username: 'cem', password: 'cem-password' })).body;
  assert.equal((await s.post('/api/users', { username: 'CEM', password: 'cem-password' })).status, 409);

  const cem = s.client();
  await cem.login('cem', 'cem-password');
  assert.equal((await cem.get('/api/users')).status, 403);
  assert.equal((await cem.post('/api/users', { username: 'x1x', password: 'longenough' })).status, 403);

  // Password reset by admin signs the user out.
  await s.patch(`/api/users/${u.id}`, { password: 'new-cem-password' });
  assert.equal((await cem.get('/api/ideas')).status, 401);
  assert.equal((await cem.login('cem', 'new-cem-password')).status, 200);

  // Own password change.
  assert.equal((await cem.post('/api/auth/password', { current_password: 'bad', new_password: 'another-pass' })).status, 400);
  assert.equal((await cem.post('/api/auth/password', { current_password: 'new-cem-password', new_password: 'another-pass' })).status, 204);
  assert.equal((await cem.get('/api/ideas')).status, 200, 'current session stays valid');

  // Disable blocks login.
  await s.patch(`/api/users/${u.id}`, { disabled: true });
  assert.equal((await cem.get('/api/ideas')).status, 401);
  assert.equal((await s.client().login('cem', 'another-pass')).status, 401);

  // Last admin is protected.
  const me = (await s.get('/api/auth/status')).body.user;
  assert.equal((await s.patch(`/api/users/${me.id}`, { role: 'user' })).status, 409);
  assert.equal((await s.del(`/api/users/${me.id}`)).status, 409);

  // Deleting a user removes their data.
  await s.patch(`/api/users/${u.id}`, { disabled: false });
  await cem.login('cem', 'another-pass');
  await cem.post('/api/ideas', { title: 'cem idea' });
  assert.equal((await s.del(`/api/users/${u.id}`)).status, 204);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM ideas WHERE user_id = ?').get(u.id).n, 0);
});

test('AI settings can only be changed by admins', async (t) => {
  const s = await startServer({ aiEnabled: true, aiFetch: async () => ({ ok: true, json: async () => ({}) }) });
  t.after(s.close);
  await s.post('/api/users', { username: 'dora', password: 'dora-password' });
  const dora = s.client();
  await dora.login('dora', 'dora-password');
  assert.equal((await dora.get('/api/ai/settings')).status, 200);
  assert.equal((await dora.patch('/api/ai/settings', { model: 'x' })).status, 403);
  assert.equal((await s.patch('/api/ai/settings', { model: 'x' })).status, 200);
});
