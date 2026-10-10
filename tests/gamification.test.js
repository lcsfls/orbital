'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../backend/gamification');

test('level curve', () => {
  assert.equal(g.levelFromXp(0), 1);
  assert.equal(g.levelFromXp(99), 1);
  assert.equal(g.levelFromXp(100), 2);
  assert.equal(g.levelFromXp(299), 2);
  assert.equal(g.levelFromXp(300), 3);
  assert.equal(g.levelFromXp(600), 4);
  const info = g.levelInfo(150);
  assert.equal(info.level, 2);
  assert.equal(info.progress, 0.25);
});

test('XP weights: finishing > parking > creating', () => {
  assert.ok(g.XP.task_done > g.XP.park);
  assert.ok(g.XP.park > g.XP.idea_create);
  assert.equal(g.XP.park, 10);
  assert.equal(g.XP.evaluate, 15);
  assert.equal(g.XP.task_done, 20);
  assert.equal(g.XP.project_completed, 100);
  assert.equal(g.XP.drop, 10);
  assert.equal(g.XP.mandatory_done, 30);
  assert.equal(g.IDEA_CREATE_DAILY_CAP, 3);
});

test('streak continues on consecutive days and resets quietly after a gap', () => {
  assert.equal(g.nextStreak(0, null, '2026-03-02'), 1);
  assert.equal(g.nextStreak(1, '2026-03-02', '2026-03-02'), 1);
  assert.equal(g.nextStreak(1, '2026-03-02', '2026-03-03'), 2);
  assert.equal(g.nextStreak(5, '2026-03-02', '2026-03-05'), 1);
  assert.equal(g.currentStreak(5, '2026-03-02', '2026-03-03'), 5);
  assert.equal(g.currentStreak(5, '2026-03-02', '2026-03-04'), 0);
  assert.equal(g.MESSAGES.pause, 'A pause is fine.');
});

test('day helpers cross month borders', () => {
  assert.equal(g.addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(g.daysBetween('2026-01-01', '2026-04-01'), 90);
  assert.equal(g.dayOf(new Date('2026-03-02T23:30:00Z'), 'Europe/Berlin'), '2026-03-03');
});
