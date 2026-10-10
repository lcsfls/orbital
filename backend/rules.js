'use strict';

// Pure evaluation logic. No database access here, so it is easy to test.

const IMPORTANCE = ['important', 'not_important'];
const URGENCY = ['urgent', 'not_urgent'];
const CORE_CONTEXT = ['core', 'context'];
const YES_NO = ['yes', 'no'];
const TERNARY = ['yes', 'neutral', 'no'];

const EISENHOWER = {
  do_now: { label: 'Do now', hint: 'Priority. Top of the list.', order: 0 },
  schedule: { label: 'Schedule', hint: 'Set a due date.', order: 1 },
  delegate: { label: 'Delegate', hint: 'Hand it to someone else.', order: 2 },
  drop: { label: 'Drop or defer', hint: 'Parking lot or archive.', order: 3 },
};

const CORE_CONTEXT_QUADRANTS = {
  invent: { label: 'Invent', line: 'Core, not critical. Experiment. Small bets, fast learning.' },
  deploy: { label: 'Deploy', line: 'Core, critical. This is what pays. Scale it, protect it.' },
  manage: { label: 'Manage', line: 'Context, critical. Must run. Minimise effort, never drop.' },
  offload: { label: 'Offload', line: 'Context, not critical. Standardise, hand off or stop.' },
};

// Lifecycle order. Things drift clockwise: invent -> deploy -> manage -> offload.
const CLOCKWISE = ['invent', 'deploy', 'manage', 'offload'];

// The nine economics rules, unchanged from the prototype (translated).
// Key: money|time|delegation
const ECONOMICS_RULES = {
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

// Results that would normally say "do not do this".
const STOP_RESULTS = new Set([
  'Stop or avoid if possible',
  'Do not do it yourself; check value and necessity',
  'Urgently check whether the task is needed at all',
  'Avoid or simplify',
]);

const RESULT_MANDATORY = 'Mandatory – must be done';
const RESULT_MANAGE = 'Keep running – minimise effort';
const MANAGE_REASON = 'Context, mission-critical';

function eisenhowerQuadrant(importance, urgency) {
  if (!importance || !urgency) return null;
  if (importance === 'important') return urgency === 'urgent' ? 'do_now' : 'schedule';
  return urgency === 'urgent' ? 'delegate' : 'drop';
}

function coreContextQuadrant(coreContext, missionCritical) {
  if (!coreContext || !missionCritical) return null;
  const critical = missionCritical === 'yes';
  if (coreContext === 'core') return critical ? 'deploy' : 'invent';
  return critical ? 'manage' : 'offload';
}

// Returns { text, fallback } or null when not all three answers are given.
function economics(money, time, delegation) {
  if (!money || !time || !delegation) return null;
  const key = `${money}|${time}|${delegation}`;
  if (ECONOMICS_RULES[key]) return { text: ECONOMICS_RULES[key], fallback: false };
  // Fallback logic from the prototype.
  if (money === 'yes') {
    return { text: delegation === 'yes' ? 'Delegate' : 'Do it yourself, review the process', fallback: true };
  }
  if (money === 'no') {
    return { text: time === 'no' ? 'Avoid or simplify' : 'Stop or avoid if possible', fallback: true };
  }
  return { text: 'No clear rule – decide consciously', fallback: true };
}

// Full evaluation of an idea (or project). Input uses DB field names.
function evaluate(item) {
  const eq = eisenhowerQuadrant(item.importance, item.urgency);
  const cq = coreContextQuadrant(item.core_context, item.mission_critical);
  const mandatory = Boolean(item.mandatory);
  const autoMandatory = mandatory && item.mandatory_reason === MANAGE_REASON;
  const externalMandatory = mandatory && !autoMandatory;

  // Stage 2 only applies once Eisenhower is set. It is skipped for
  // mandatory items and for Manage.
  const stage2Skipped = mandatory || cq === 'manage';
  const eco = eq && !stage2Skipped ? economics(item.money, item.time, item.delegation) : null;

  let result = null;
  let resultKind = null;
  if (externalMandatory) {
    result = RESULT_MANDATORY;
    resultKind = 'mandatory';
  } else if (cq === 'manage') {
    result = RESULT_MANAGE;
    resultKind = 'manage';
  } else if (mandatory) {
    result = RESULT_MANDATORY;
    resultKind = 'mandatory';
  } else if (eco) {
    result = eco.text;
    resultKind = eco.fallback ? 'fallback' : 'economics';
  } else if (eq) {
    result = EISENHOWER[eq].label;
    resultKind = 'eisenhower';
  }

  const stillRequired =
    mandatory &&
    (eq === 'drop' || cq === 'offload' || Boolean(eco && STOP_RESULTS.has(eco.text)));

  return {
    eisenhower_quadrant: eq,
    core_context_quadrant: cq,
    economics_result: eco ? eco.text : null,
    economics_fallback: eco ? eco.fallback : false,
    stage2_skipped: stage2Skipped,
    result,
    result_kind: resultKind,
    still_required: stillRequired,
  };
}

// Is the evaluation complete enough to count as "evaluated"?
function isEvaluated(item) {
  return Boolean(
    eisenhowerQuadrant(item.importance, item.urgency) &&
      coreContextQuadrant(item.core_context, item.mission_critical),
  );
}

// Drift between two Core/Context quadrants.
// Returns { direction: 'none'|'clockwise'|'counter_clockwise', needsNote }.
function drift(from, to) {
  if (!from || !to || from === to) return { direction: 'none', needsNote: false };
  const a = CLOCKWISE.indexOf(from);
  const b = CLOCKWISE.indexOf(to);
  const direction = b > a ? 'clockwise' : 'counter_clockwise';
  return { direction, needsNote: from === 'deploy' && to === 'offload' };
}

module.exports = {
  IMPORTANCE,
  URGENCY,
  CORE_CONTEXT,
  YES_NO,
  TERNARY,
  EISENHOWER,
  CORE_CONTEXT_QUADRANTS,
  CLOCKWISE,
  ECONOMICS_RULES,
  RESULT_MANDATORY,
  RESULT_MANAGE,
  MANAGE_REASON,
  eisenhowerQuadrant,
  coreContextQuadrant,
  economics,
  evaluate,
  isEvaluated,
  drift,
};
