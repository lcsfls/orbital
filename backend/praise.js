'use strict';

// Praise that notices what was done. Calm, warm, specific, no exclamation marks.
// Especially for the thankless things nobody else thanks you for.

const POOLS = {
  household: [
    'Done. That kind of work rarely gets a thank you, so here is one.',
    'Nobody claps for chores. I do.',
    'Clean space, clearer head. Thank you for doing it.',
    'That was real work, even if it looks invisible afterwards.',
    'The kind of task nobody notices until it is not done. You did it.',
  ],
  call: [
    'That call is done. Those are often the hardest ones.',
    'Done. One less thing in your head.',
    'Reaching out takes energy. You spent it well.',
  ],
  admin: [
    'Paperwork done. Future you is grateful.',
    'Forms and bills are heavy. You did it anyway.',
    'That was the boring kind of important. Well done.',
  ],
  health: [
    'Taking care of your health counts double.',
    'Appointments are a chore. You handled it.',
    'Looking after yourself is real work too.',
  ],
  selfcare: [
    'Small care, big effect.',
    'Water, food, rest. The basics matter most.',
    'You looked after yourself. That counts.',
  ],
  move: [
    'You moved. Your body says thanks.',
    'A bit of movement. That is enough for today.',
  ],
  task: [
    'Done beats perfect.',
    'One more lap.',
    'Checked off. Quietly done.',
    'That counts.',
    'Look at you, finishing things.',
    'Another one off your mind.',
  ],
  mandatory_done: [
    'The must-do is done. You can breathe out.',
    'That one had to happen, and it did.',
    'Done, and off your shoulders.',
  ],
  project_completed: [
    'A whole project. Take a moment to enjoy that.',
    'Project done. It took many small steps, and you took them.',
    'Finished. That is rarer than starting.',
  ],
  park: [
    'Parking is deciding, not failing.',
    'Parked. It is safe here until you need it.',
    'Not now is a real answer.',
  ],
  drop: [
    'That was a real decision.',
    'Letting go is a skill.',
    'Dropped. More room for what matters.',
  ],
  evaluate: [
    'That was a real decision.',
    'Thought through. Now you know where it stands.',
    'Sorted. One idea less spinning around.',
  ],
  quadrant_review: ['Drifted. Normal.', 'Checked again. Things change, and that is fine.'],
  inbox_zero: ['Scratchpad empty. Clear head.', 'Everything sorted. One more lap.'],
  idea_create: ['Parking is deciding, not failing.', 'Caught it. Now it cannot get lost.', 'Written down. Your head can let go of it.'],
};

// First match wins. Patterns are kept simple and cover English and German words.
const KINDS = [
  ['household', /\b(kitchen|k[üu]che|dish|dishes|geschirr|sp[üu]l|clean|putz|aufr[äa]um|tidy|laundry|w[äa]sche|vacuum|staubsaug|trash|m[üu]ll|garbage|bathroom|bad\b|toilet|klo\b|fridge|k[üu]hlschrank|bed\b|bett\b|floor|boden|wipe|wisch|iron|b[üu]gel|grocer|einkauf)/i],
  ['call', /\b(call|anruf|ruf|phone|telefon|email|e-mail|mail|reply|antwort|message|nachricht|text\b|write to|schreib)/i],
  ['admin', /\b(tax|steuer|invoice|rechnung|bill|bank\b|insurance|versicherung|form\b|formular|antrag|contract|vertrag|paperwork|papier|amt\b|beh[öo]rde|pay\b|bezahl|receipt|beleg)/i],
  ['health', /\b(doctor|arzt|[äa]rztin|dentist|zahnarzt|appointment|termin|pharmacy|apotheke|medic|medikament|therap)/i],
  ['selfcare', /\b(water|wasser|drink|trink|eat|essen|lunch|breakfast|fr[üu]hst[üu]ck|sleep|schlaf|rest\b|pause|shower|dusch|break\b)/i],
  ['move', /\b(walk|spazier|run\b|lauf|gym\b|workout|sport|yoga|stretch|dehn|bike|rad\b|fahrrad|swim|schwimm)/i],
];

function kindOf(title) {
  const t = String(title || '');
  for (const [kind, re] of KINDS) if (re.test(t)) return kind;
  return null;
}

const STREAK_LINES = {
  3: 'Three days in a row. A rhythm is forming.',
  7: 'Seven days in a row. Steady.',
  14: 'Two weeks in a row. That is a habit now.',
  30: 'Thirty days in a row. Quietly impressive.',
};

// Picks a line. `rnd` is injectable for tests.
function pick({ action, title, doneToday = 0, streak = 0, firstToday = false, rnd = Math.random }) {
  const one = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
  const isTask = action === 'task_done' || action === 'mandatory_done';
  if (isTask && firstToday && STREAK_LINES[streak]) return STREAK_LINES[streak];
  if (isTask && doneToday === 1) return 'First thing done today. The first one is always the hardest.';
  if (isTask && doneToday === 5) return 'Five things today. Plenty. A break is allowed.';
  if (isTask && doneToday === 10) return 'Ten things today. Please rest a little, too.';
  const kind = isTask ? kindOf(title) : null;
  if (kind) return one(POOLS[kind]);
  return one(POOLS[action] || POOLS.task);
}

module.exports = { POOLS, KINDS, STREAK_LINES, kindOf, pick };
