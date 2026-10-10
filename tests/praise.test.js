'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { POOLS, kindOf, pick, STREAK_LINES } = require('../backend/praise');

test('praise notices what kind of thing was done', () => {
  assert.equal(kindOf('Clean the kitchen'), 'household');
  assert.equal(kindOf('Küche sauber machen'), 'household');
  assert.equal(kindOf('Wäsche waschen'), 'household');
  assert.equal(kindOf('Call the dentist'), 'call');
  assert.equal(kindOf('Steuererklärung'), 'admin');
  assert.equal(kindOf('Zahnarzt Termin'), 'health');
  assert.equal(kindOf('Drink a glass of water'), 'selfcare');
  assert.equal(kindOf('Go for a walk'), 'move');
  assert.equal(kindOf('Fix the radio'), null, 'no false match on "rad"');
  assert.equal(kindOf('Write spec'), null);
});

test('praise picks the right pool and special moments', () => {
  const rnd = () => 0;
  assert.equal(pick({ action: 'task_done', title: 'Clean the kitchen', doneToday: 2, rnd }), POOLS.household[0]);
  assert.equal(pick({ action: 'task_done', title: 'Write spec', doneToday: 1, rnd }), 'First thing done today. The first one is always the hardest.');
  assert.equal(pick({ action: 'task_done', title: 'x', doneToday: 5, rnd }), 'Five things today. Plenty. A break is allowed.');
  assert.equal(pick({ action: 'task_done', title: 'x', doneToday: 1, streak: 7, firstToday: true, rnd }), STREAK_LINES[7]);
  assert.equal(pick({ action: 'park', rnd }), POOLS.park[0]);
  assert.ok(POOLS.project_completed.includes(pick({ action: 'project_completed' })));
});

test('every praise line follows the tone rules', () => {
  for (const lines of [...Object.values(POOLS), Object.values(STREAK_LINES)]) {
    for (const line of lines) {
      assert.equal(line.includes('!'), false, line);
      assert.ok(line.length <= 90, line);
    }
  }
});
