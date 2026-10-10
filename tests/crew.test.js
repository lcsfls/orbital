'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, fakeClock } = require('./helpers');
const { weekStart } = require('../backend/week');

const doneTasks = async (c, n, prefix = 'T') => {
  const list = (await c.get('/api/todo')).body;
  for (let i = 0; i < n; i += 1) await c.post('/api/tasks', { project_id: list.id, title: `${prefix}${i}`, status: 'done' });
};

test('weeks start on Monday', () => {
  assert.equal(weekStart('2026-10-07'), '2026-10-05'); // Wednesday
  assert.equal(weekStart('2026-10-05'), '2026-10-05'); // Monday
  assert.equal(weekStart('2026-10-11'), '2026-10-05'); // Sunday
});

test('this week compares only with your own last week', async (t) => {
  const clock = fakeClock('2026-10-07T10:00:00.000Z'); // a Wednesday
  const s = await startServer({ clock });
  t.after(s.close);
  let w = (await s.get('/api/week')).body;
  assert.equal(w.start, '2026-10-05');
  assert.equal(w.days.length, 7);
  assert.equal(w.message, 'A quiet week so far. A pause is fine.');
  assert.ok(w.days.find((d) => d.day === '2026-10-07').today);

  await doneTasks(s, 2);
  clock.addDays(7);
  await s.login('admin', 'test-password-1');
  await doneTasks(s, 5, 'N');
  w = (await s.get('/api/week')).body;
  assert.equal(w.done, 5);
  assert.equal(w.done_last_week, 2);
  assert.equal(w.message, '3 more than last week.');
  assert.equal(w.days.filter((d) => d.active).length, 1);

  clock.addDays(7);
  await s.login('admin', 'test-password-1');
  await doneTasks(s, 1, 'L');
  w = (await s.get('/api/week')).body;
  assert.equal(w.message, 'A calmer week than the last one. That is fine.');
});

test('crew is opt-in, alphabetical, with cheers and a shared goal', async (t) => {
  const s = await startServer();
  t.after(s.close);
  await s.patch('/api/auth/profile', { display_name: 'Zoe' });
  await s.post('/api/users', { username: 'ann', password: 'ann-password', display_name: 'Ann' });
  await s.post('/api/users', { username: 'ben', password: 'ben-password', display_name: 'Ben' });
  const ann = s.client();
  await ann.login('ann', 'ann-password');
  const ben = s.client();
  await ben.login('ben', 'ben-password');

  // Not opted in: you only learn how many are in it.
  let c = (await s.get('/api/crew')).body;
  assert.equal(c.opted_in, false);
  assert.equal(c.member_count, 0);
  assert.equal(c.members, undefined);

  await s.patch('/api/gamification', { settings: { crew: true } });
  await ann.patch('/api/gamification', { settings: { crew: true } });
  await doneTasks(s, 3);
  await doneTasks(ann, 2);
  await doneTasks(ben, 9); // Ben is not in the crew.

  c = (await s.get('/api/crew')).body;
  assert.equal(c.opted_in, true);
  assert.deepEqual(c.members.map((m) => m.name), ['Ann', 'Zoe'], 'alphabetical, Ben not listed');
  assert.equal(c.total, 5);
  assert.equal(c.goal, 30);
  assert.equal(c.members.find((m) => m.name === 'Ann').done, 2);
  assert.equal(JSON.stringify(c).includes('T0'), false, 'no task titles');

  const annId = c.members.find((m) => m.name === 'Ann').id;
  const zoeId = c.members.find((m) => m.me).id;
  const benId = (await s.get('/api/users')).body.find((u) => u.username === 'ben').id;
  assert.equal((await s.post('/api/crew/cheer', { user_id: zoeId })).status, 400, 'not yourself');
  assert.equal((await s.post('/api/crew/cheer', { user_id: benId })).status, 404, 'not someone outside the crew');
  assert.equal((await ben.post('/api/crew/cheer', { user_id: annId })).status, 403, 'only crew members cheer');
  const cheer = await s.post('/api/crew/cheer', { user_id: annId });
  assert.equal(cheer.status, 201);
  assert.equal((await s.post('/api/crew/cheer', { user_id: annId })).status, 409, 'once a day');
  assert.equal((await s.get('/api/crew')).body.members.find((m) => m.id === annId).cheered_today, true);

  let annCrew = (await ann.get('/api/crew')).body;
  assert.deepEqual(annCrew.cheers_unseen.map((x) => x.from_name), ['Zoe']);
  assert.equal((await ann.post('/api/crew/cheers/seen')).status, 204);
  annCrew = (await ann.get('/api/crew')).body;
  assert.equal(annCrew.cheers_unseen.length, 0);

  // Shared goal, set by an admin.
  assert.equal((await ann.patch('/api/crew/goal', { goal: 10 })).status, 403);
  assert.equal((await s.patch('/api/crew/goal', { goal: 10 })).body.goal, 10);
  assert.equal((await ann.get('/api/crew')).body.goal, 10);

  // Leaving the crew hides you again.
  await ann.patch('/api/gamification', { settings: { crew: false } });
  assert.deepEqual((await s.get('/api/crew')).body.members.map((m) => m.name), ['Zoe']);
});
