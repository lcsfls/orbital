'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../backend/rules');
const { parseLines } = require('../backend/inbox');

test('Eisenhower quadrants', () => {
  assert.equal(rules.eisenhowerQuadrant('important', 'urgent'), 'do_now');
  assert.equal(rules.eisenhowerQuadrant('important', 'not_urgent'), 'schedule');
  assert.equal(rules.eisenhowerQuadrant('not_important', 'urgent'), 'delegate');
  assert.equal(rules.eisenhowerQuadrant('not_important', 'not_urgent'), 'drop');
  assert.equal(rules.eisenhowerQuadrant('important', null), null);
  assert.equal(rules.EISENHOWER.drop.label, 'Drop or defer');
});

test('Core/Context quadrants', () => {
  assert.equal(rules.coreContextQuadrant('core', 'no'), 'invent');
  assert.equal(rules.coreContextQuadrant('core', 'yes'), 'deploy');
  assert.equal(rules.coreContextQuadrant('context', 'yes'), 'manage');
  assert.equal(rules.coreContextQuadrant('context', 'no'), 'offload');
  assert.equal(rules.coreContextQuadrant(null, 'no'), null);
});

test('the nine economics rules are unchanged', () => {
  const expected = {
    'neutral|yes|yes': 'Delegate',
    'neutral|no|yes': 'Delegate or automate',
    'neutral|no|no': 'Check necessity and simplify',
    'no|yes|yes': 'Stop or avoid if possible',
    'no|no|yes': 'Do not do it yourself; check value and necessity',
    'no|no|no': 'Urgently check whether the task is needed at all',
    'yes|yes|no': 'Do it yourself and prioritise',
    'yes|no|yes': 'Delegate',
    'yes|neutral|neutral': 'Improve the process, partly delegate',
  };
  assert.deepEqual(rules.ECONOMICS_RULES, expected);
  for (const [key, text] of Object.entries(expected)) {
    const [m, t, d] = key.split('|');
    assert.deepEqual(rules.economics(m, t, d), { text, fallback: false });
  }
});

test('unmapped economics combinations use the fallback and are marked', () => {
  assert.deepEqual(rules.economics('yes', 'yes', 'yes'), { text: 'Delegate', fallback: true });
  assert.deepEqual(rules.economics('yes', 'no', 'no'), { text: 'Do it yourself, review the process', fallback: true });
  assert.deepEqual(rules.economics('no', 'no', 'neutral'), { text: 'Avoid or simplify', fallback: true });
  assert.deepEqual(rules.economics('no', 'yes', 'no'), { text: 'Stop or avoid if possible', fallback: true });
  assert.deepEqual(rules.economics('neutral', 'neutral', 'neutral'), { text: 'No clear rule – decide consciously', fallback: true });
  assert.equal(rules.economics('yes', null, 'no'), null);
});

test('stage 2 only applies after Eisenhower', () => {
  const ev = rules.evaluate({ money: 'yes', time: 'yes', delegation: 'no' });
  assert.equal(ev.economics_result, null);
  assert.equal(ev.result, null);
  const ev2 = rules.evaluate({ importance: 'important', urgency: 'urgent', money: 'yes', time: 'yes', delegation: 'no' });
  assert.equal(ev2.result, 'Do it yourself and prioritise');
  assert.equal(ev2.result_kind, 'economics');
});

test('mandatory override beats the matrix and shows still required', () => {
  const ev = rules.evaluate({
    importance: 'not_important', urgency: 'not_urgent', money: 'no', time: 'no', delegation: 'no',
    mandatory: 1, mandatory_reason: 'Contract obligation',
  });
  assert.equal(ev.result, 'Mandatory – must be done');
  assert.equal(ev.stage2_skipped, true);
  assert.equal(ev.economics_result, null);
  assert.equal(ev.still_required, true);
});

test('Manage skips stage 2 and keeps running', () => {
  const ev = rules.evaluate({
    importance: 'important', urgency: 'urgent', core_context: 'context', mission_critical: 'yes',
    money: 'yes', time: 'yes', delegation: 'no', mandatory: 1, mandatory_reason: rules.MANAGE_REASON,
  });
  assert.equal(ev.core_context_quadrant, 'manage');
  assert.equal(ev.result, 'Keep running – minimise effort');
  assert.equal(ev.stage2_skipped, true);
});

test('drift is clockwise in the lifecycle', () => {
  assert.deepEqual(rules.drift('deploy', 'manage'), { direction: 'clockwise', needsNote: false });
  assert.deepEqual(rules.drift('invent', 'deploy'), { direction: 'clockwise', needsNote: false });
  assert.deepEqual(rules.drift('manage', 'deploy'), { direction: 'counter_clockwise', needsNote: false });
  assert.deepEqual(rules.drift('deploy', 'offload'), { direction: 'clockwise', needsNote: true });
  assert.deepEqual(rules.drift('deploy', 'deploy'), { direction: 'none', needsNote: false });
});

test('inbox line rules', () => {
  const items = parseLines('Write newsletter\n\n- call the bank\n* buy cables\n[ ] renew domain\nTODO: fix backup\ntodo check logs\nShould we switch hosting?\n   ');
  assert.deepEqual(
    items.map((i) => [i.kind, i.title, i.notes]),
    [
      ['idea', 'Write newsletter', ''],
      ['task', 'call the bank', ''],
      ['task', 'buy cables', ''],
      ['task', 'renew domain', ''],
      ['task', 'fix backup', ''],
      ['task', 'check logs', ''],
      ['idea', 'Should we switch hosting?', 'open question'],
    ],
  );
});

test('inbox keeps very long lines in the notes', () => {
  const long = 'x'.repeat(250);
  const [item] = parseLines(long);
  assert.equal(item.title.length, 200);
  assert.ok(item.notes.includes(long));
});
