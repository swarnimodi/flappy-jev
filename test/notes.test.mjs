// =============================================================================
// Contract tests for the crash notes in pilot.js: CHOICES / HITS, whatItHit,
// crashNote, addNote, isNote, areNotes, noteSentence, and the `notes` argument
// of buildRequest.
//
// Written from the contract while that code was still being written, without
// reading it. Expected values come from the written contract and the numbers
// in constants.js, worked out by hand; none was obtained by running an
// implementation.
//
//   node --test "test/notes.test.mjs"
//
// -----------------------------------------------------------------------------
// FAILURE MODES THIS FILE GUARDS AGAINST (written first; the tests follow it)
// -----------------------------------------------------------------------------
// Words
//  N01 CHOICES or HITS has a typo, another order, a missing or extra word, or
//      HITS carries the game's raw cause 'pipe'. MAX_NOTES is not a count.
// whatItHit
//  N02 Decides "ground" from where the bird is instead of from state.cause, so
//      a ground crash under a pipe is recorded as 'lower pipe'.
//  N03 Compares the bird with pipes[0] (passed, still on screen) or with the
//      last pipe, instead of the first pipe not yet passed.
//  N04 Upper and lower swapped (y grows downward), or a bird exactly at gapY
//      called 'upper pipe' (<= where < is meant).
//  N05 Returns the raw cause or another word not in HITS; changes the state.
// crashNote
//  N06 Blames the final entry whatever it was, or the FIRST entry of the right
//      kind instead of the LAST; looks only at the last few entries; applies
//      the "not while rising" idea to flaps too (the upper pipe has no such
//      exception).
//  N07 Blames the wrong kind of decision: a no-flap for the upper pipe, a flap
//      for the lower pipe or the ground; treats ground unlike the lower pipe.
//  N08 Too-low crash: blames a no-flap made while the bird was rising although
//      an earlier one let it drop; skips only one of the two rising words;
//      skips 'hovering' as well; gives up at the last flap instead of reaching
//      further back.
//  N09 Fallback (every no-flap was made while rising): returns null, picks the
//      first no-flap, or picks a flap.
//  N10 Returns a note, undefined or false, or throws, where the answer is null:
//      an empty log, a too-low crash after only flaps, an upper-pipe crash
//      after only no-flaps.
//  N11 Wrong note: keys leaked from the log entry (next_pipe, flap, p, t),
//      `times` not 1, the hit not carried through ('ground' saved as 'lower
//      pipe'), a choice word not in CHOICES, height and movement taken from
//      different entries.
//  N12 Changes the log (reverses it in place, pops entries, edits an entry).
// addNote
//  N13 Changes its arguments: pushes into `notes`, counts up inside the stored
//      note, edits the incoming note; or hands back the same array.
//  N14 Tells crashes apart wrongly: by object identity (a repeat never
//      matches); by fewer than the four fields (notes differing only in hit, or
//      only in choice, height or movement, get merged); or by `times` as well
//      (a counted note never matches a fresh one).
//  N15 A repeat is counted wrongly (stays at 1, restarts, adds the incoming
//      count), is left where it was, or ends up listed twice.
//  N16 Order and cap: a new note is put at the back; the cut removes the newest
//      or is off by one; a repeat on a full list pushes a note out; a forgotten
//      crash comes back with its old count.
//  N17 null is stored as an item, throws, or returns the same array.
// isNote / areNotes
//  N18 Too loose: null, arrays, strings, missing or extra keys, a phrase from
//      another list, near-miss spellings, a flap blamed for a low crash or a
//      no-flap for the upper pipe, `times` that is 0, negative, fractional, a
//      string, NaN or Infinity; or throws instead of returning false.
//  N19 Too strict: rejects one of the 105 valid notes, a large count, another
//      key order.
//  N20 areNotes: accepts something that is not an array, a list longer than
//      MAX_NOTES, or a list with one bad item among good ones; rejects [] or a
//      list of exactly MAX_NOTES.
// noteSentence
//  N21 Leaves out the height or movement phrase, or its single quotes; says
//      "It flapped." for a no-flap or the reverse; names the wrong obstacle, or
//      names it only by accident (two height phrases contain "upper pipe" /
//      "lower pipe"); says "more than once" for a first crash or omits it from
//      the second on; returns something other than one string.
// buildRequest
//  N22 The no-notes request changed: an empty past_crashes, instructions that
//      mention past_crashes with nothing to read, an explicit [] behaving
//      unlike the default.
//  N23 With notes: past_crashes missing, in another order, holding raw notes or
//      one joined string, or placed outside `state`; rules or situation fields
//      lost; instructions replaced instead of extended, or extended without
//      naming `past_crashes`; criteria or model changed; inputs changed.
// The suite itself
//  N24 A checker in this file cannot fail (negative control at the bottom).
//
// -----------------------------------------------------------------------------
// WHERE THE CONTRACT WAS SILENT, AND WHAT THIS FILE ASSUMES
// -----------------------------------------------------------------------------
//  S1 noteSentence: the obstacle must be named outside the two quoted phrases,
//     and the sentence for one choice does not contain the other choice's
//     exact words ("It flapped." / "It did not flap.").
//  S2 noteSentence: two different notes never read the same.
//  S3 buildRequest with notes changes nothing except state.past_crashes and the
//     instructions (no other new key; the question type stays as it is), and a
//     request without notes does not contain the text past_crashes anywhere.
//  S4 addNote compares the four fields as they are and does not validate: the
//     "differ only in choice" pair is necessarily one valid and one invalid
//     note.
//  S5 addNote(notes, null) returns a new array too ("returns a NEW array").
//  S6 A repeat is "old times + 1" even if the incoming note says times: 7.
//  S7 MAX_NOTES is between 3 and 104 (the scenarios keep 3 notes; only 105
//     different notes exist).
// Not tested, because the contract does not define them: whatItHit on a live
// game or with no unpassed pipe; crashNote with a hit outside HITS or a flap
// that is not a boolean; addNote(notes, null) when notes is already longer
// than MAX_NOTES; whether the note at the front is the object passed in or a
// copy; duplicates inside a list given to areNotes; buildRequest with more
// than MAX_NOTES notes; noteSentence, addNote and buildRequest given things
// that are not notes; isNote on class instances, prototype-less objects,
// inherited keys or counts beyond 2^53.
//
// -----------------------------------------------------------------------------
// HAND-DERIVATION CHEAT SHEET
// -----------------------------------------------------------------------------
//   Logs are written F(h, m) for a flap and N(h, m) for a no-flap.
//     h indexes HEIGHT:   0 above the gap ... 3 middle ... 6 below the gap
//     m indexes MOVEMENT: 0 rising fast, 1 rising slowly, 2 hovering,
//                         3 falling slowly, 4 falling fast
//   crashNote(log, hit)
//     'upper pipe'           -> the last F                     choice 'flap'
//     'lower pipe', 'ground' -> the last N with m >= 2;        choice 'no flap'
//                               if there is none, the last N
//     nothing of that kind   -> null
//   Notes: 7 heights x 5 movements x 3 coherent pairs (flap + upper pipe,
//   no flap + lower pipe, no flap + ground) = 105 different crashes.
//
//   Real runs (section 7). One substep (10 ms) adds 14 px/s; ten substeps
//   starting at speed v move the bird 0.1 v + 7.7 px; a flap sets v to -420.
//   Height is bird.y - gapY against 10 / 35 / 78; movement is v against
//   -200 / -50 / 50 / 250. Written as <h><m><F or ->, one per decision.
//   a) Never flaps, gap centred on the start height (280).
//        t    0     100    200    300    400    500    600    700
//        y    280   287.7  309.4  345.1  392.1  440.1  488.1  536.1
//        v    0     140    280    420    480    480    480    480  (capped)
//             32-   33-    44-    54-    64-    64-    64-    64-
//      Substep 73: y 550.5, bottom edge 562.5 >= 560 -> 'ground' at t 730.
//      Blamed: the last no-flap, 64- -> below the gap, falling fast.
//   b) Flaps every time, same gap. Climbs 34.3 px per decision (v -280 at each
//      one) until it is pinned under the ceiling, where it bobs between 12 and
//      17.04 and each answer finds it at y 17.04, v 112.
//        32F 20F 10F 00F 00F 00F 00F 00F 02F 03F, then 03F fourteen more times
//      The first pipe (460 - 1.5 px per substep) crosses the bird's front (112)
//      on substep 233 -> 'upper pipe' at t 2330, on the 24th decision.
//      Blamed: the last flap, 03F -> above the gap, falling slowly.
//   c) Far too low (y 400, gap 200) with the pipe 68 px ahead; flaps once, on
//      its third answer.
//        t    0     100    200    300    400
//        y    400   407.7  429.4  395.1  374.8
//        v    0     140    280    -280   -140
//             62-   63-    64F    60-    61-
//      Pipe at 180 - 1.5 n crosses 112 on substep 46; bird at 369.34, bottom
//      edge 381.34 > 290 -> 'lower pipe' at t 460.
//      Blamed: not 61- or 60- (rising), not 64F (a flap): 63-, below the gap,
//      falling slowly.
//   d) As c, but the pipe is 1 px ahead and Jev flaps at once: 62F, dead on the
//      first substep (y 395.94, bottom edge 407.94 > 290) -> 'lower pipe' at
//      t 10, and no no-flap to blame: null.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { inspect, isDeepStrictEqual } from 'node:util';

import {
  GROUND_Y, BIRD_X, BIRD_R, BIRD_START_Y, GRAVITY, FLAP_VY, MAX_FALL_VY, SUBSTEP_MS,
  PIPE_SPEED, PIPE_W, GAP_H, PIPE_SPACING, FIRST_PIPE_X, GAP_MIN_Y, GAP_MAX_Y,
  DECISION_STEP_MS, JEV_MODEL, MAX_NOTES,
  HEIGHT_EDGE, HEIGHT_NEAR_EDGE, HEIGHT_MIDDLE, SPEED_FAST_RISE, SPEED_LEVEL, SPEED_FAST_FALL,
} from '../constants.js';
import { createGame, advance } from '../game.js';
// The names are read off the module object instead of being imported one by
// one: while pilot.js is half-written, a missing name then fails only the tests
// that use it, rather than stopping the whole file at import.
import * as pilot from '../pilot.js';

// Note: `describe` here is pilot.js's function, not node:test's.
const {
  HEIGHT, MOVEMENT, DISTANCE, describe,
  CHOICES, HITS, whatItHit, crashNote, addNote, isNote, areNotes, noteSentence, buildRequest,
} = pilot;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const MID_GAP = Math.round((GAP_MIN_Y + GAP_MAX_Y) / 2); // 285
const STILL_VY = -GRAVITY * (SUBSTEP_MS / 1000); // -14: the bird does not move during the next substep
const NOTE_KEYS = ['bird_height', 'bird_movement', 'choice', 'hit', 'times'];
const PAIRS = [['flap', 'upper pipe'], ['no flap', 'lower pipe'], ['no flap', 'ground']];
const show = (value) => inspect(value, { depth: 5, breakLength: Infinity });

function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// One decision as the game records it: the situation in words, Jev's
// probability and what was done. h and m index HEIGHT and MOVEMENT.
const F = (h, m) => ({ bird_height: HEIGHT[h], bird_movement: MOVEMENT[m], next_pipe: DISTANCE[1], p: 0.9, flap: true });
const N = (h, m) => ({ bird_height: HEIGHT[h], bird_movement: MOVEMENT[m], next_pipe: DISTANCE[1], p: 0.1, flap: false });
const logOf = (...entries) => entries.map((entry, i) => ({ t: i * DECISION_STEP_MS, ...entry }));
const crashed = (hit, ...entries) => ({ hit, log: logOf(...entries) });

// Notes, always as fresh objects.
const note = (h, m, choice, hit, times = 1) => ({ bird_height: HEIGHT[h], bird_movement: MOVEMENT[m], choice, hit, times });
const flapNote = (h, m, times) => note(h, m, 'flap', 'upper pipe', times);
const lowNote = (h, m, times) => note(h, m, 'no flap', 'lower pipe', times);
const groundNote = (h, m, times) => note(h, m, 'no flap', 'ground', times);
const A = (times) => lowNote(5, 4, times); // sank into the lower pipe
const B = (times) => flapNote(1, 0, times); // flapped up into the upper pipe
const C = (times) => groundNote(6, 4, times); // fell to the ground

// All 105 different crashes.
function everyNote(times = 1) {
  const all = [];
  for (const bird_height of HEIGHT) {
    for (const bird_movement of MOVEMENT) {
      for (const [choice, hit] of PAIRS) all.push({ bird_height, bird_movement, choice, hit, times });
    }
  }
  return all;
}
// n different notes with counts 1, 2, 3, ... so that a moved or dropped note
// shows. Neighbours differ in as little as the hit alone.
const differentNotes = (n) => everyNote().slice(0, n).map((item, i) => ({ ...item, times: i + 1 }));

// Runs every [label, input, expected] row through `fn` and returns a line of
// text for each row that came out wrong (all of them, not just the first).
function tableMismatches(rows, fn) {
  const bad = [];
  for (const [label, input, expected] of rows) {
    let got;
    try {
      got = fn(input);
    } catch (err) {
      got = `threw ${err?.name}: ${err?.message}`;
    }
    if (!isDeepStrictEqual(got, expected)) bad.push(`${label}: expected ${show(expected)}, got ${show(got)}`);
  }
  return bad;
}

// crashNote's rule restated on its own: read the log forwards and remember the
// most recent candidates (pilot.js is free to do it any other way). Checked
// against every hand-worked row in the negative control.
function expectedNote(log, hit) {
  let blamed = null; // upper pipe: the latest flap. Otherwise: the latest no-flap made while not rising
  let spare = null; // otherwise only: the latest no-flap of any kind
  for (const entry of log) {
    if (hit === 'upper pipe') {
      if (entry.flap) blamed = entry;
    } else if (!entry.flap) {
      spare = entry;
      if (entry.bird_movement !== 'rising fast' && entry.bird_movement !== 'rising slowly') blamed = entry;
    }
  }
  const entry = blamed ?? spare;
  if (entry === null) return null;
  return { bird_height: entry.bird_height, bird_movement: entry.bird_movement, choice: hit === 'upper pipe' ? 'flap' : 'no flap', hit, times: 1 };
}

// addNote's rule restated on its own.
const sameCrash = (a, b) => a.bird_height === b.bird_height && a.bird_movement === b.bird_movement && a.choice === b.choice && a.hit === b.hit;
function modelAdd(notes, incoming) {
  const list = notes.map((item) => ({ ...item }));
  if (incoming === null) return list;
  const at = list.findIndex((item) => sameCrash(item, incoming));
  const front = at === -1 ? { ...incoming } : list.splice(at, 1)[0];
  if (at !== -1) front.times += 1;
  return [front, ...list].slice(0, MAX_NOTES);
}

// Everything the contract says a note's sentence must hold. Returns one line of
// text per broken promise.
function sentenceProblems(item, sentence) {
  if (typeof sentence !== 'string') return [`not a string: ${show(sentence)}`];
  const problems = [];
  const height = `'${item.bird_height}'`;
  const movement = `'${item.bird_movement}'`;
  if (!sentence.includes(height)) problems.push(`no ${height}`);
  if (!sentence.includes(movement)) problems.push(`no ${movement}`);
  const [said, notSaid] = item.choice === 'flap' ? ['It flapped.', 'It did not flap.'] : ['It did not flap.', 'It flapped.'];
  if (!sentence.includes(said)) problems.push(`no "${said}"`);
  if (sentence.includes(notSaid)) problems.push(`says "${notSaid}"`);
  // The obstacle is looked for in what is left once the quoted phrases are
  // taken out: HEIGHT[0] and HEIGHT[6] contain "upper pipe" and "lower pipe"
  // themselves, and must not stand in for the hit.
  const rest = sentence.split(height).join(' ').split(movement).join(' ');
  if (!rest.includes(item.hit)) problems.push(`does not name the ${item.hit} outside the quoted phrases`);
  const repeated = sentence.includes('more than once');
  if (item.times >= 2 && !repeated) problems.push(`times ${item.times} but no "more than once"`);
  if (item.times === 1 && repeated) problems.push('times 1 but says "more than once"');
  return problems;
}

// A dead game in the game's own shape.
function deadState(cause, birdY, pipes) {
  return { t: 4200, bird: { y: birdY, vy: 0 }, pipes, score: pipes.filter((p) => p.passed).length, alive: false, cause, rng: 7 };
}
const pipeAt = (x, gapY, passed = false) => ({ x, gapY, passed });
const OVER = BIRD_X; // a pipe with its left edge here is over the bird: 100 < 112 and 164 > 88
const BEHIND = 10; // right edge at 74 < 88: passed, and still on screen

// Flies a real game: asks `flapAt(i)` at each decision, records it as the game
// would, and stops when the bird dies.
function fly(state, flapAt) {
  const log = [];
  while (state.alive) {
    assert.ok(log.length < 500, 'sanity: the run never ended');
    const flap = flapAt(log.length);
    log.push({ t: state.t, ...describe(state), p: flap ? 0.9 : 0.1, flap });
    advance(state, DECISION_STEP_MS, flap);
  }
  return log;
}
// A log as text: height index, movement index, F or -, one group per decision.
const transcript = (log) => log.map((e) => `${HEIGHT.indexOf(e.bird_height)}${MOVEMENT.indexOf(e.bird_movement)}${e.flap ? 'F' : '-'}`).join(' ');

// =============================================================================
// 0. Names, words and constants
// =============================================================================
test('exports: pilot.js has every name in the contract', () => {
  const functions = ['whatItHit', 'crashNote', 'addNote', 'isNote', 'areNotes', 'noteSentence', 'buildRequest'];
  assert.deepEqual(functions.filter((name) => typeof pilot[name] !== 'function'), [], 'these must be exported functions');
  assert.deepEqual(['CHOICES', 'HITS'].filter((name) => !Array.isArray(pilot[name])), [], 'these must be exported arrays');
});

test('words: CHOICES and HITS, exact words in exact order', () => {
  assert.deepEqual(CHOICES, ['flap', 'no flap']);
  assert.deepEqual(HITS, ['upper pipe', 'lower pipe', 'ground']);
});

test('constants: MAX_NOTES is a count the scenarios in this file fit into', () => {
  assert.ok(Number.isInteger(MAX_NOTES), `MAX_NOTES must be a whole number, got ${MAX_NOTES}`);
  // the hand-written scenarios keep up to 3 different notes at once
  assert.ok(MAX_NOTES >= 3, `the scenarios in this file need room for 3 notes, MAX_NOTES is ${MAX_NOTES}`);
  // the full-list tests need MAX_NOTES + 1 different notes, and 7 x 5 x 3 = 105 exist
  assert.equal(everyNote().length, 105);
  assert.equal(new Set(everyNote().map((item) => JSON.stringify(item))).size, 105);
  assert.ok(MAX_NOTES + 1 <= 105, `this file cannot build ${MAX_NOTES + 1} different notes`);
});

test('tripwire: the real runs in section 7 were worked out by hand for these constants', () => {
  // If this fails the game was retuned, and the transcripts in the cheat sheet
  // must be re-derived by hand.
  assert.deepEqual(
    {
      GROUND_Y, BIRD_X, BIRD_R, BIRD_START_Y, GRAVITY, FLAP_VY, MAX_FALL_VY, SUBSTEP_MS, PIPE_SPEED, PIPE_W, GAP_H, PIPE_SPACING, FIRST_PIPE_X, GAP_MIN_Y, GAP_MAX_Y, DECISION_STEP_MS,
      HEIGHT_EDGE, HEIGHT_NEAR_EDGE, HEIGHT_MIDDLE, SPEED_FAST_RISE, SPEED_LEVEL, SPEED_FAST_FALL,
    },
    {
      GROUND_Y: 560, BIRD_X: 100, BIRD_R: 12, BIRD_START_Y: 280, GRAVITY: 1400, FLAP_VY: -420, MAX_FALL_VY: 480, SUBSTEP_MS: 10, PIPE_SPEED: 150, PIPE_W: 64, GAP_H: 180, PIPE_SPACING: 220, FIRST_PIPE_X: 460, GAP_MIN_Y: 170, GAP_MAX_Y: 400, DECISION_STEP_MS: 100,
      HEIGHT_EDGE: 78, HEIGHT_NEAR_EDGE: 35, HEIGHT_MIDDLE: 10, SPEED_FAST_RISE: -200, SPEED_LEVEL: 50, SPEED_FAST_FALL: 250,
    },
  );
});

// =============================================================================
// 1. whatItHit
// =============================================================================
const DEAD_STATES = [
  // --- cause 'pipe': is the bird above or below the centre of the gap? ---
  // The bird clears a gap while |bird.y - gapY| <= 78, so a real pipe crash is
  // always more than 78 px off centre. For a gap at 285: 206.99 and 363.01.
  ['a hair too high for the gap', deadState('pipe', MID_GAP - HEIGHT_EDGE - 0.01, [pipeAt(OVER, MID_GAP)]), 'upper pipe'],
  ['a hair too low for the gap', deadState('pipe', MID_GAP + HEIGHT_EDGE + 0.01, [pipeAt(OVER, MID_GAP)]), 'lower pipe'],
  // pinned under the ceiling (y 12) when the highest gap (170) arrives
  ['on the ceiling', deadState('pipe', BIRD_R, [pipeAt(OVER, GAP_MIN_Y)]), 'upper pipe'],
  // y 547.5: bottom edge 559.5, half a pixel short of the ground, beside the lowest gap (400)
  ['half a pixel above the ground', deadState('pipe', GROUND_Y - BIRD_R - 0.5, [pipeAt(OVER, GAP_MAX_Y)]), 'lower pipe'],
  // the boundary as the contract words it: bird.y < gapY is 'upper pipe', anything else 'lower pipe'
  ['a hair above the centre of the gap', deadState('pipe', MID_GAP - 0.01, [pipeAt(OVER, MID_GAP)]), 'upper pipe'],
  ['exactly at the centre of the gap', deadState('pipe', MID_GAP, [pipeAt(OVER, MID_GAP)]), 'lower pipe'],
  ['a hair below the centre of the gap', deadState('pipe', MID_GAP + 0.01, [pipeAt(OVER, MID_GAP)]), 'lower pipe'],
  // --- which pipe: the first one not yet passed ---
  // Bird at 300, in a pipe whose gap is at 400: 300 < 400 -> upper. pipes[0],
  // behind it, and the pipe after both have their gaps at 170 (300 > 170).
  ['in the upper pipe, behind a passed pipe with a higher gap', deadState('pipe', 300, [pipeAt(BEHIND, GAP_MIN_Y, true), pipeAt(OVER, GAP_MAX_Y), pipeAt(OVER + PIPE_SPACING, GAP_MIN_Y)]), 'upper pipe'],
  // Mirror image: in a pipe whose gap is at 170: 300 > 170 -> lower. The others say 400.
  ['in the lower pipe, behind a passed pipe with a lower gap', deadState('pipe', 300, [pipeAt(BEHIND, GAP_MAX_Y, true), pipeAt(OVER, GAP_MIN_Y), pipeAt(OVER + PIPE_SPACING, GAP_MAX_Y)]), 'lower pipe'],
  // --- cause 'ground': the cause decides, the pipes do not ---
  // y 550.5: bottom edge 562.5, past the ground line
  ['on the ground, next pipe still far ahead', deadState('ground', GROUND_Y - BIRD_R + 2.5, [pipeAt(300, GAP_MIN_Y)]), 'ground'],
  // the same bird with a pipe over it: it is also inside the lower pipe (490 and down)
  ['on the ground and inside the lower pipe at once', deadState('ground', GROUND_Y - BIRD_R + 2.5, [pipeAt(OVER, GAP_MAX_Y)]), 'ground'],
  ['on the ground, a passed pipe behind and the next one close', deadState('ground', GROUND_Y - BIRD_R, [pipeAt(BEHIND, GAP_MIN_Y, true), pipeAt(BEHIND + PIPE_SPACING, GAP_MAX_Y)]), 'ground'],
];

test('whatItHit: names what a dead bird hit', () => {
  assert.deepEqual(tableMismatches(DEAD_STATES, (state) => whatItHit(state)), []);
});

test('whatItHit: does not change the state and gives the same answer every time', () => {
  for (const [label, state, expected] of DEAD_STATES) {
    const frozen = deepFreeze(structuredClone(state));
    assert.equal(whatItHit(frozen), expected, `${label} (frozen state)`);
    assert.equal(whatItHit(frozen), expected, `${label} (asked again)`);
    assert.deepEqual(frozen, state, label);
  }
});

test('whatItHit: a pipe crash is upper above the centre of the gap and lower from the centre down, at every quarter pixel', () => {
  for (const gapY of [GAP_MIN_Y, MID_GAP, GAP_MAX_Y]) {
    for (let offset = -150; offset <= 150; offset += 0.25) {
      // a passed pipe with the opposite answer sits behind the bird throughout
      const decoy = pipeAt(BEHIND, offset < 0 ? gapY + offset - 50 : gapY + offset + 50, true);
      const state = deadState('pipe', gapY + offset, [decoy, pipeAt(OVER, gapY)]);
      assert.equal(whatItHit(state), offset < 0 ? 'upper pipe' : 'lower pipe', `gapY ${gapY}, offset ${offset}`);
    }
  }
});

test('whatItHit: a ground crash is the ground wherever the pipes are', () => {
  for (const gapY of [GAP_MIN_Y, MID_GAP, GAP_MAX_Y]) {
    for (let x = -PIPE_W; x <= 300; x += 4) {
      const passed = x + PIPE_W < BIRD_X - BIRD_R;
      const state = deadState('ground', GROUND_Y - BIRD_R + 1, [pipeAt(x, gapY, passed), pipeAt(x + PIPE_SPACING, gapY)]);
      assert.equal(whatItHit(state), 'ground', `pipe at ${x}, gapY ${gapY}`);
    }
  }
});

test('whatItHit: agrees with the game about real pipe crashes, and with the height words', () => {
  // The game is run for one substep with a pipe over a bird that does not
  // move. It dies on the pipe exactly when it is more than 78 px off centre.
  const seen = { 'upper pipe': 0, 'lower pipe': 0 };
  for (let offset = -150; offset <= 150; offset += 0.5) {
    const s = createGame(1);
    s.pipes = [pipeAt(OVER, MID_GAP)];
    s.bird.y = MID_GAP + offset;
    s.bird.vy = STILL_VY;
    advance(s, SUBSTEP_MS);
    assert.equal(s.alive, Math.abs(offset) <= HEIGHT_EDGE, `sanity (game.js): offset ${offset}`);
    if (s.alive) continue;
    assert.equal(s.cause, 'pipe', `sanity (game.js): offset ${offset}`);
    const expected = offset < 0 ? 'upper pipe' : 'lower pipe';
    assert.equal(whatItHit(s), expected, `offset ${offset}`);
    // "above the gap, level with the upper pipe" / "below the gap, level with the lower pipe"
    assert.equal(describe(s).bird_height, HEIGHT[offset < 0 ? 0 : 6], `offset ${offset}`);
    seen[expected] += 1;
  }
  // 78.5 ... 150 in half pixels, on each side
  assert.deepEqual(seen, { 'upper pipe': 144, 'lower pipe': 144 });
});

test('whatItHit: the ground wins when the bird reaches it on the very substep a pipe reaches the bird', () => {
  // Falling at the cap (480 px/s -> 4.8 px a substep) from y 545, with the
  // lowest gap's pipe 1 px ahead of the bird's front. After one substep the
  // bird's bottom edge is at 561.8 (>= 560) and the pipe's left edge at 111.5
  // (< 112): the bird is on the ground AND inside the lower pipe (490 down).
  // game.js checks the ground first.
  const s = createGame(1);
  s.pipes = [pipeAt(BIRD_X + BIRD_R + 1, GAP_MAX_Y)];
  s.bird.y = 545;
  s.bird.vy = MAX_FALL_VY;
  advance(s, SUBSTEP_MS);
  assert.deepEqual([s.alive, s.cause], [false, 'ground'], 'sanity (game.js)');
  assert.ok(s.pipes[0].x < BIRD_X + BIRD_R && s.bird.y + BIRD_R > GAP_MAX_Y + GAP_H / 2, 'sanity: the bird is inside the lower pipe too');
  assert.equal(whatItHit(s), 'ground');
});

// =============================================================================
// 2. crashNote
// =============================================================================
const MIXED = [N(3, 2), F(4, 3), N(3, 0), N(2, 1), N(3, 3), F(5, 4), N(5, 0), F(6, 3), N(6, 0)];
const CLIMBING_TOO_LATE = [N(3, 3), N(5, 4), F(6, 4), N(6, 0), N(6, 0), N(6, 1), N(6, 1)];

const CRASHES = [
  // --- too high: the last flap ---
  // flaps at 0 and 2; six no-flaps follow the second while the bird coasts up into the pipe
  ['upper pipe: the last flap was six decisions before the crash', crashed('upper pipe', F(4, 4), N(3, 2), F(2, 3), N(2, 0), N(1, 0), N(1, 1), N(0, 1), N(0, 2), N(0, 3)), flapNote(2, 3)],
  ['upper pipe: the flap was the very last decision', crashed('upper pipe', F(3, 2), N(2, 1), F(1, 0)), flapNote(1, 0)],
  // the last flap was made while falling and an earlier one while rising: still the last one
  ['upper pipe: the last flap was made while falling fast', crashed('upper pipe', F(3, 0), N(2, 0), F(1, 4), N(0, 1)), flapNote(1, 4)],
  ['upper pipe: a run of only flaps', crashed('upper pipe', F(3, 2), F(2, 0), F(1, 0), F(0, 0)), flapNote(0, 0)],
  ['upper pipe: one decision, a flap', crashed('upper pipe', F(0, 3)), flapNote(0, 3)],
  ['upper pipe: a run of only no-flaps has no flap to blame', crashed('upper pipe', N(2, 0), N(1, 1), N(0, 2)), null],
  ['upper pipe: one decision, a no-flap', crashed('upper pipe', N(0, 2)), null],
  ['upper pipe: empty log', crashed('upper pipe'), null],
  // --- too low: the last time it chose to let the bird drop ---
  ['lower pipe: the last decision let it drop', crashed('lower pipe', F(3, 0), N(3, 2), N(4, 3), N(5, 4)), lowNote(5, 4)],
  // The final four no-flaps were made while rising (the flap at 2 came too
  // late). Going back: 6 RS, 5 RS, 4 RF, 3 RF are rising, 2 is a flap, and
  // entry 1, N(5, 4), is the last time it let the bird drop.
  ['lower pipe: climbing too late, the final four no-flaps were made while rising', crashed('lower pipe', ...CLIMBING_TOO_LATE), lowNote(5, 4)],
  ['ground: the same log', crashed('ground', ...CLIMBING_TOO_LATE), groundNote(5, 4)],
  // hovering is not rising: entry 2 is blamed, not entry 0
  ['lower pipe: a no-flap while hovering counts as letting it drop', crashed('lower pipe', N(4, 3), F(5, 4), N(5, 2), N(6, 0), N(6, 1)), lowNote(5, 2)],
  // every later no-flap (entries 2, 4, 5 and 7) was made while rising: back to entry 0, past three flaps
  ['lower pipe: the only no-flap that let it drop was the first decision', crashed('lower pipe', N(3, 2), F(4, 3), N(4, 0), F(5, 3), N(5, 0), N(5, 1), F(6, 4), N(6, 0)), lowNote(3, 2)],
  ['lower pipe: the last two decisions were flaps', crashed('lower pipe', N(3, 3), N(4, 4), F(5, 4), F(6, 0)), lowNote(4, 4)],
  // rising no-flaps in the middle, falling ones at the end: the very last (one of two alike)
  ['ground: it rose, then fell all the way', crashed('ground', F(3, 2), N(2, 0), N(2, 1), N(3, 2), N(4, 3), N(5, 4), N(6, 4), N(6, 4)), groundNote(6, 4)],
  ['lower pipe: one decision, a no-flap while falling', crashed('lower pipe', N(5, 4)), lowNote(5, 4)],
  ['ground: one decision, a no-flap while falling', crashed('ground', N(5, 4)), groundNote(5, 4)],
  // --- too low, fallback: every no-flap was made while rising -> the last no-flap ---
  ['lower pipe: every no-flap was made while rising', crashed('lower pipe', F(5, 4), N(5, 0), F(6, 3), N(6, 0), N(6, 1)), lowNote(6, 1)],
  ['ground: every no-flap was made while rising, and the last decision was a flap', crashed('ground', N(4, 1), N(5, 0), F(6, 4)), groundNote(5, 0)],
  ['lower pipe: one decision, a no-flap while rising fast', crashed('lower pipe', N(6, 0)), lowNote(6, 0)],
  ['ground: one decision, a no-flap while rising slowly', crashed('ground', N(6, 1)), groundNote(6, 1)],
  // --- too low with no no-flap at all ---
  ['lower pipe: a run of only flaps has no no-flap to blame', crashed('lower pipe', F(5, 4), F(6, 0), F(6, 0)), null],
  ['ground: a run of only flaps', crashed('ground', F(3, 2), F(2, 0), F(1, 0)), null],
  ['lower pipe: one decision, a flap', crashed('lower pipe', F(6, 4)), null],
  ['ground: one decision, a flap', crashed('ground', F(6, 4)), null],
  ['lower pipe: empty log', crashed('lower pipe'), null],
  ['ground: empty log', crashed('ground'), null],
  // --- one log, three endings ---
  // flaps at 1, 5, 7. No-flaps at 0 HV, 2 RF, 3 RS, 4 FS, 6 RF, 8 RF.
  ['mixed log, upper pipe: the last flap (entry 7)', crashed('upper pipe', ...MIXED), flapNote(6, 3)],
  ['mixed log, lower pipe: entries 8 and 6 were rising, so entry 4', crashed('lower pipe', ...MIXED), lowNote(3, 3)],
  ['mixed log, ground: entry 4 again, and the hit is kept', crashed('ground', ...MIXED), groundNote(3, 3)],
];

test('crashNote: blames the right decision, or nothing', () => {
  assert.deepEqual(tableMismatches(CRASHES, ({ log, hit }) => crashNote(log, hit)), []);
});

test('crashNote: the note has exactly the five keys, passes isNote, and is the same every time', () => {
  let notes = 0;
  for (const [label, { log, hit }, expected] of CRASHES) {
    if (expected === null) continue;
    const got = crashNote(log, hit);
    // the entries carry t, next_pipe, p and flap as well: none of them belongs in a note
    assert.deepEqual(Object.keys(got).sort(), NOTE_KEYS, label);
    assert.equal(isNote(got), true, label);
    assert.ok(!log.includes(got), `${label}: the note must not be the log entry itself`);
    assert.deepEqual(crashNote(log, hit), got, `${label}: asked again`);
    notes += 1;
  }
  assert.equal(notes, 21, 'sanity: 21 of the 30 hand-worked crashes end in a note');
});

test('crashNote: works on a frozen log, so it cannot be changing it', () => {
  for (const [label, { log, hit }, expected] of CRASHES) {
    const frozen = deepFreeze(structuredClone(log));
    let got;
    assert.doesNotThrow(() => { got = crashNote(frozen, hit); }, label);
    assert.deepEqual(got, expected, label);
    assert.deepEqual(frozen, log, label);
  }
});

test('crashNote: a minute-long flight, and a blamed decision far back in the log', () => {
  // 600 decisions (60 s of flight) in a steady rhythm: flap, then three no-flaps
  // made while rising fast, rising slowly and hovering. Then the ending.
  const cruise = Array.from({ length: 600 }, (_, i) => (i % 4 === 0 ? F(4, 3) : N(3, i % 4 - 1)));
  // ending 1: it lets the bird drop twice, flaps too late, and is still rising at the crash
  const sunk = logOf(...cruise, N(4, 3), N(5, 4), F(6, 4), N(6, 0));
  assert.deepEqual(crashNote(sunk, 'lower pipe'), lowNote(5, 4));
  assert.deepEqual(crashNote(sunk, 'ground'), groundNote(5, 4));
  assert.deepEqual(crashNote(sunk, 'upper pipe'), flapNote(6, 4));
  // ending 2: the rhythm simply runs into a pipe. Entry 599 is the hovering
  // no-flap N(3, 2); the last flap is entry 596.
  assert.deepEqual(crashNote(logOf(...cruise), 'lower pipe'), lowNote(3, 2));
  assert.deepEqual(crashNote(logOf(...cruise), 'upper pipe'), flapNote(4, 3));

  // The rule has no window. (No real bird coasts upward for 200 decisions; the
  // contract says "the LAST entry", however far back that is.)
  const climb = Array.from({ length: 200 }, (_, i) => N(i % 3, i % 2)); // all made while rising
  assert.deepEqual(crashNote(logOf(N(3, 2), F(4, 3), ...climb), 'upper pipe'), flapNote(4, 3));
  assert.deepEqual(crashNote(logOf(N(5, 4), F(6, 4), ...climb), 'lower pipe'), lowNote(5, 4));
  assert.deepEqual(crashNote(logOf(N(5, 4), F(6, 4), ...climb), 'ground'), groundNote(5, 4));
  // with no no-flap that let it drop, the fallback is the last of the 200: N(199 % 3, 199 % 2)
  assert.deepEqual(crashNote(logOf(F(6, 4), ...climb), 'lower pipe'), lowNote(1, 1));
});

test('crashNote: agrees with an independent restatement of the rule on every log of up to 4 decisions', () => {
  // 6 kinds of decision: a flap, or a no-flap in each of the 5 movements.
  // 1 + 6 + 36 + 216 + 1296 logs, each ended in each of the 3 ways.
  const kinds = ['flap', 0, 1, 2, 3, 4];
  const shapes = [[]];
  for (let from = 0, length = 1; length <= 4; length += 1) {
    const to = shapes.length;
    for (let i = from; i < to; i += 1) for (const kind of kinds) shapes.push([...shapes[i], kind]);
    from = to;
  }
  assert.equal(shapes.length, 1555);
  let nulls = 0;
  for (const shape of shapes) {
    // heights go by position, so every entry of a log is different from the others
    const log = logOf(...shape.map((kind, i) => (kind === 'flap' ? F(i, (2 * i + 1) % 5) : N(i, kind))));
    for (const hit of ['upper pipe', 'lower pipe', 'ground']) {
      const expected = expectedNote(log, hit);
      assert.deepEqual(crashNote(log, hit), expected, `${transcript(log) || '(empty)'} -> ${hit}`);
      if (expected === null) nulls += 1;
    }
  }
  // by hand: no flap to blame in 1 + 5 + 25 + 125 + 625 = 781 logs; no no-flap
  // in 5 logs (all flaps, lengths 0 to 4), for each of the two low endings
  assert.equal(nulls, 781 + 5 + 5);
});

// =============================================================================
// 3. addNote
// =============================================================================
test('addNote: the first note, then each newer note in front of the older ones', () => {
  const one = addNote([], A());
  assert.deepEqual(one, [A()]);
  const two = addNote(one, B());
  assert.deepEqual(two, [B(), A()]);
  const three = addNote(two, C());
  assert.deepEqual(three, [C(), B(), A()]);
});

test('addNote: the same crash three times in a row is one note, counted 1, 2, 3', () => {
  let notes = [];
  for (const times of [1, 2, 3]) {
    notes = addNote(notes, A()); // a fresh, equal object each time, as crashNote returns
    assert.deepEqual(notes, [A(times)]);
  }
  // and straight from crashNote: the same log and the same hit, three runs running
  const log = logOf(...CLIMBING_TOO_LATE);
  let learned = [];
  for (const times of [1, 2, 3]) {
    learned = addNote(learned, crashNote(log, 'lower pipe'));
    assert.deepEqual(learned, [lowNote(5, 4, times)]);
  }
});

test('addNote: a repeated crash moves to the front and counts up, wherever it was', () => {
  const start = [C(), B(), A()];
  const second = addNote(start, B()); // from the middle
  assert.deepEqual(second, [B(2), C(), A()]);
  const third = addNote(second, B()); // already at the front: stays there
  assert.deepEqual(third, [B(3), C(), A()]);
  const fourth = addNote(third, A()); // from the back
  assert.deepEqual(fourth, [A(2), B(3), C()]);
  const fifth = addNote(fourth, C());
  assert.deepEqual(fifth, [C(2), A(2), B(3)]);
});

test('addNote: the count is not part of what makes two notes the same crash', () => {
  assert.deepEqual(addNote([A(5)], A()), [A(6)]);
  assert.deepEqual(addNote([B(), A(41)], A()), [A(42), B()]);
});

test('addNote: a repeat counts one more than the stored note, whatever count the incoming note carries', () => {
  // Followed literally: "a copy with times = old times + 1". crashNote only
  // ever writes times: 1, so this pins the wording, not a case from play.
  assert.deepEqual(addNote([A(2)], A(7)), [A(3)]);
  // and a note that is not in the list goes in as it is
  assert.deepEqual(addNote([B()], A(7)), [A(7), B()]);
});

test('addNote: notes that differ in any one of the four fields stay separate', () => {
  const base = () => lowNote(5, 4);
  const others = [
    ['hit only: the ground instead of the lower pipe', () => groundNote(5, 4)],
    ['height only', () => lowNote(4, 4)],
    ['movement only', () => lowNote(5, 3)],
    ['choice and hit: a flap into the upper pipe from the same place', () => flapNote(5, 4)],
    // Not a note crashNote can write, and isNote rejects it. It is here because
    // the contract compares `choice` on its own, and only this pair isolates it.
    ['choice only', () => note(5, 4, 'flap', 'lower pipe')],
  ];
  for (const [label, other] of others) {
    const two = addNote([base()], other());
    assert.deepEqual(two, [other(), base()], label);
    const again = addNote(two, base());
    assert.deepEqual(again, [{ ...base(), times: 2 }, other()], label);
    const andAgain = addNote(again, other());
    assert.deepEqual(andAgain, [{ ...other(), times: 2 }, { ...base(), times: 2 }], label);
  }
});

test('addNote: a full list stays full, and only a brand-new crash pushes the oldest out', () => {
  const full = differentNotes(MAX_NOTES); // counts 1 (newest, at the front) to MAX_NOTES (oldest, at the back)
  const oldest = full.at(-1);
  // the oldest crash happens again: it moves to the front and nothing is dropped
  assert.deepEqual(addNote(full, { ...oldest, times: 1 }), [{ ...oldest, times: MAX_NOTES + 1 }, ...full.slice(0, -1)]);
  // the newest happens again: same order, one more on its count
  assert.deepEqual(addNote(full, { ...full[0], times: 1 }), [{ ...full[0], times: 2 }, ...full.slice(1)]);
  // one from the middle (its count was k + 1)
  const k = Math.floor(MAX_NOTES / 2);
  assert.deepEqual(addNote(full, { ...full[k], times: 1 }), [{ ...full[k], times: k + 2 }, ...full.slice(0, k), ...full.slice(k + 1)]);
  // a crash that is not in the list: it goes to the front and exactly the oldest falls off
  const fresh = everyNote()[MAX_NOTES];
  const after = addNote(full, { ...fresh });
  assert.deepEqual(after, [fresh, ...full.slice(0, -1)]);
  assert.equal(after.length, MAX_NOTES);
  assert.ok(!after.some((item) => sameCrash(item, oldest)), 'the oldest note is gone');
});

test('addNote: filling up from empty never goes over MAX_NOTES, and a forgotten crash starts again at 1', () => {
  const crashes = everyNote().slice(0, MAX_NOTES + 1);
  const twice = (crash) => ({ ...crash, times: 2 });
  let notes = [];
  crashes.forEach((crash, i) => {
    notes = addNote(addNote(notes, { ...crash }), { ...crash }); // every crash happens twice
    assert.equal(notes.length, Math.min(i + 1, MAX_NOTES), `after ${i + 1} different crashes`);
  });
  // newest first; crashes[0], the oldest, fell off when the last one arrived
  assert.deepEqual(notes, crashes.slice(1).reverse().map(twice));
  // crashes[0] happens a third time, but its note is gone: it is new again, and crashes[1] falls off
  assert.deepEqual(addNote(notes, { ...crashes[0] }), [crashes[0], ...crashes.slice(2).reverse().map(twice)]);
});

test('addNote: null (a crash with nothing to blame) changes nothing', () => {
  for (const notes of [[], [A()], [C(2), B(), A(3)], differentNotes(MAX_NOTES)]) {
    const copy = structuredClone(notes);
    const result = addNote(notes, null);
    assert.deepEqual(result, copy);
    assert.notEqual(result, notes, 'a new array, not the one passed in');
    assert.deepEqual(notes, copy);
  }
});

test('addNote: works on frozen arguments, so it cannot be changing them', () => {
  const cases = [
    ['a new crash into an empty list', [], A()],
    ['a new crash', [B(), A()], C()],
    ['a repeat at the back', [B(), A()], A()],
    ['a repeat at the front', [B(2), A()], B()],
    ['a new crash into a full list', differentNotes(MAX_NOTES), everyNote()[MAX_NOTES]],
    ['a repeat of the oldest in a full list', differentNotes(MAX_NOTES), { ...differentNotes(MAX_NOTES).at(-1), times: 1 }],
    ['null', [B(), A()], null],
  ];
  for (const [label, notes, incoming] of cases) {
    const notesBefore = structuredClone(notes);
    const incomingBefore = structuredClone(incoming);
    deepFreeze(notes);
    deepFreeze(incoming);
    let result;
    assert.doesNotThrow(() => { result = addNote(notes, incoming); }, label);
    assert.deepEqual(result, modelAdd(notesBefore, incomingBefore), label);
    assert.notEqual(result, notes, `${label}: a new array, not the one passed in`);
    assert.deepEqual(notes, notesBefore, label);
    assert.deepEqual(incoming, incomingBefore, label);
  }
});

test('addNote: lists returned earlier are not changed by later calls', () => {
  const steps = [A(), B(), A(), C(), null, B(), A(), C(), C()];
  const lists = [[]];
  for (const step of steps) lists.push(addNote(lists.at(-1), step));
  // worked by hand, newest first; all ten lists are compared after the last call
  assert.deepEqual(lists, [
    [],
    [A()],
    [B(), A()],
    [A(2), B()],
    [C(), A(2), B()],
    [C(), A(2), B()],
    [B(2), C(), A(2)],
    [A(3), B(2), C()],
    [C(2), A(3), B(2)],
    [C(3), A(3), B(2)],
  ]);
  assert.equal(new Set(lists).size, lists.length, 'every call returned a different array');
});

test('addNote: a thousand crashes in a row agree, step by step, with an independent restatement of the rule', () => {
  // More different crashes than the list can hold, so notes fall off the back
  // and come back as new. Each happens once, in order (which fills the list and
  // overflows it), then 1000 more are drawn from a fixed pseudo-random sequence.
  const pool = everyNote().slice(0, MAX_NOTES + 4);
  let seed = 20261006;
  const pick = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor((seed / 2 ** 32) * n);
  };
  const crashes = [...pool];
  for (let i = 0; i < 1000; i += 1) {
    const at = pick(pool.length + 1);
    crashes.push(at === pool.length ? null : pool[at]); // now and then a crash with nothing to blame
  }
  let notes = [];
  let model = [];
  const seen = { nothingToBlame: 0, repeats: 0, pushedOut: 0, highestCount: 0 };
  crashes.forEach((crash, step) => {
    const incoming = crash === null ? null : { ...crash };
    if (incoming === null) seen.nothingToBlame += 1;
    else if (model.some((item) => sameCrash(item, incoming))) seen.repeats += 1;
    else if (model.length === MAX_NOTES) seen.pushedOut += 1;
    model = modelAdd(model, incoming);
    // the previous result and the incoming note are frozen: changing either throws
    notes = addNote(deepFreeze(notes), deepFreeze(incoming));
    assert.deepEqual(notes, model, `step ${step}, adding ${show(incoming)}`);
    assert.equal(areNotes(notes), true, `step ${step}: the list must stay a valid list of notes`);
    seen.highestCount = Math.max(seen.highestCount, ...model.map((item) => item.times));
  });
  // sanity: the walk went through every kind of step
  assert.ok(seen.nothingToBlame > 0 && seen.repeats > 0 && seen.pushedOut > 0 && seen.highestCount >= 3, show(seen));
});

// =============================================================================
// 4. isNote and areNotes
// =============================================================================
const OK_NOTE = Object.freeze(lowNote(5, 4, 2));
const without = (object, key) => Object.fromEntries(Object.entries(object).filter(([k]) => k !== key));

test('isNote: true for all 105 valid notes, at any count from 1 up', () => {
  for (const times of [1, 2, 3, MAX_NOTES + 1, 1000]) {
    for (const item of everyNote(times)) assert.equal(isNote(item), true, show(item));
  }
  const { bird_height, bird_movement, choice, hit, times } = OK_NOTE;
  assert.equal(isNote(OK_NOTE), true, 'a frozen note');
  assert.equal(isNote({ times, hit, choice, bird_movement, bird_height }), true, 'key order does not matter');
  assert.equal(isNote(JSON.parse(JSON.stringify(OK_NOTE))), true, 'and after a JSON round trip');
});

test('isNote: false, without throwing, for everything else', () => {
  assert.equal(isNote(OK_NOTE), true, 'sanity: the base note is valid');
  const { bird_height, bird_movement, choice, hit, times } = OK_NOTE;
  const rejects = [
    // --- not a plain object ---
    ['null', null],
    ['undefined', undefined],
    ['a number', 2],
    ['true', true],
    ['a sentence instead of the note', "The bird was 'inside the gap, near its bottom edge' and 'falling fast'. It did not flap. It hit the lower pipe."],
    ['a valid note as JSON text', JSON.stringify(OK_NOTE)],
    ['an empty array', []],
    ['an array of the five values', [bird_height, bird_movement, choice, hit, times]],
    ['an array carrying the five keys', Object.assign([], OK_NOTE)],
    ['a list holding one valid note', [{ ...OK_NOTE }]],
    // --- wrong keys ---
    ['an empty object', {}],
    ...NOTE_KEYS.map((key) => [`missing ${key}`, without(OK_NOTE, key)]),
    ['an extra key: next_pipe, left over from the log entry', { ...OK_NOTE, next_pipe: DISTANCE[2] }],
    ['an extra key: flap, left over from the log entry', { ...OK_NOTE, flap: false }],
    ['an extra key holding undefined', { ...OK_NOTE, extra: undefined }],
    ['a log entry', N(5, 4)],
    ['a whole log entry with the note fields added on', { ...logOf(N(5, 4))[0], choice, hit, times }],
    ['camelCase keys', { birdHeight: bird_height, birdMovement: bird_movement, choice, hit, times }],
    // --- bird_height ---
    ['bird_height a band index', { ...OK_NOTE, bird_height: 5 }],
    ['bird_height null', { ...OK_NOTE, bird_height: null }],
    ['bird_height undefined', { ...OK_NOTE, bird_height: undefined }],
    ['bird_height an empty string', { ...OK_NOTE, bird_height: '' }],
    ['bird_height taken from MOVEMENT', { ...OK_NOTE, bird_height: MOVEMENT[4] }],
    ['bird_height in capitals', { ...OK_NOTE, bird_height: bird_height.toUpperCase() }],
    ['bird_height only the start of a phrase', { ...OK_NOTE, bird_height: 'inside the gap' }],
    ['bird_height an array holding a valid phrase', { ...OK_NOTE, bird_height: [bird_height] }],
    // --- bird_movement ---
    ['bird_movement a band index', { ...OK_NOTE, bird_movement: 4 }],
    ['bird_movement null', { ...OK_NOTE, bird_movement: null }],
    ['bird_movement taken from HEIGHT', { ...OK_NOTE, bird_movement: HEIGHT[5] }],
    ['bird_movement taken from DISTANCE', { ...OK_NOTE, bird_movement: DISTANCE[2] }],
    ['bird_movement with a trailing space', { ...OK_NOTE, bird_movement: `${bird_movement} ` }],
    ['bird_movement an unlisted phrase', { ...OK_NOTE, bird_movement: 'gliding' }],
    ['bird_movement only "rising"', { ...OK_NOTE, bird_movement: 'rising' }],
    ['bird_movement an array holding a valid phrase', { ...OK_NOTE, bird_movement: [bird_movement] }],
    ['height and movement swapped', { ...OK_NOTE, bird_height: bird_movement, bird_movement: bird_height }],
    // --- choice ---
    ['choice the boolean false', { ...OK_NOTE, choice: false }],
    ['choice the boolean true', { ...OK_NOTE, choice: true }],
    ['choice null', { ...OK_NOTE, choice: null }],
    ['choice "no_flap"', { ...OK_NOTE, choice: 'no_flap' }],
    ['choice "noflap"', { ...OK_NOTE, choice: 'noflap' }],
    ['choice "No flap"', { ...OK_NOTE, choice: 'No flap' }],
    ['choice "did not flap"', { ...OK_NOTE, choice: 'did not flap' }],
    ['choice a hit word', { ...OK_NOTE, choice: 'ground' }],
    ['choice an array holding a valid word', { ...OK_NOTE, choice: [choice] }],
    // --- hit ---
    ["hit the game's raw cause", { ...OK_NOTE, hit: 'pipe' }],
    ['hit "lower"', { ...OK_NOTE, hit: 'lower' }],
    ['hit "Lower pipe"', { ...OK_NOTE, hit: 'Lower pipe' }],
    ['hit "ceiling"', { ...OK_NOTE, hit: 'ceiling' }],
    ['hit null', { ...OK_NOTE, hit: null }],
    ['hit an index into HITS', { ...OK_NOTE, hit: 1 }],
    ['hit a choice word', { ...OK_NOTE, hit: 'no flap' }],
    ['hit an array holding a valid word', { ...OK_NOTE, hit: [hit] }],
    // --- every word listed, but the pair makes no sense ---
    ['a flap blamed for the lower pipe', { ...OK_NOTE, choice: 'flap', hit: 'lower pipe' }],
    ['a flap blamed for the ground', { ...OK_NOTE, choice: 'flap', hit: 'ground' }],
    ['a no-flap blamed for the upper pipe', { ...OK_NOTE, choice: 'no flap', hit: 'upper pipe' }],
    // --- times ---
    ['times 0', { ...OK_NOTE, times: 0 }],
    ['times -0', { ...OK_NOTE, times: -0 }],
    ['times -1', { ...OK_NOTE, times: -1 }],
    ['times 1.5', { ...OK_NOTE, times: 1.5 }],
    ['times 0.5', { ...OK_NOTE, times: 0.5 }],
    ['times a hair over 2', { ...OK_NOTE, times: 2 + 2 * Number.EPSILON }],
    ['times the string "2"', { ...OK_NOTE, times: '2' }],
    ['times the string "1"', { ...OK_NOTE, times: '1' }],
    ['times NaN', { ...OK_NOTE, times: Number.NaN }],
    ['times Infinity', { ...OK_NOTE, times: Number.POSITIVE_INFINITY }],
    ['times -Infinity', { ...OK_NOTE, times: Number.NEGATIVE_INFINITY }],
    ['times null', { ...OK_NOTE, times: null }],
    ['times undefined', { ...OK_NOTE, times: undefined }],
    ['times true', { ...OK_NOTE, times: true }],
    ['times an array holding 2', { ...OK_NOTE, times: [2] }],
    ['times an object', { ...OK_NOTE, times: { value: 2 } }],
  ];
  assert.deepEqual(tableMismatches(rejects.map(([label, value]) => [label, value, false]), (value) => isNote(value)), []);
});

test('areNotes: true for an empty list and for up to MAX_NOTES valid notes', () => {
  const rows = [
    ['an empty list', [], true],
    ['one note', [A()], true],
    ['three notes', [C(2), B(), A(3)], true],
    ['one fewer than MAX_NOTES', differentNotes(MAX_NOTES - 1), true],
    ['exactly MAX_NOTES', differentNotes(MAX_NOTES), true],
    ['exactly MAX_NOTES, after a JSON round trip', JSON.parse(JSON.stringify(differentNotes(MAX_NOTES))), true],
    ['a frozen list of frozen notes', deepFreeze([B(), A(2)]), true],
  ];
  assert.deepEqual(tableMismatches(rows, (value) => areNotes(value)), []);
});

test('areNotes: false, without throwing, for everything else', () => {
  const rows = [
    ['MAX_NOTES + 1 valid notes', differentNotes(MAX_NOTES + 1), false],
    ['null', null, false],
    ['undefined', undefined, false],
    ['a number', 0, false],
    ['a single note, not in a list', A(), false],
    ['an empty object', {}, false],
    ['an object that looks like a list', { 0: A(), length: 1 }, false],
    ['a Set of notes', new Set([A()]), false],
    ['a list as JSON text', JSON.stringify([A()]), false],
    ['a list inside a list', [[A()]], false],
    ['sentences instead of notes', ["The bird was 'in the middle of the gap' and 'falling fast'. It did not flap. It hit the ground."], false],
  ];
  // one bad item at each position of an otherwise good, full list
  const bads = [
    ['a flap blamed for the lower pipe', note(5, 4, 'flap', 'lower pipe')],
    ['a count of 0', A(0)],
    ['next_pipe left on the note', { ...A(), next_pipe: DISTANCE[2] }],
    ['a log entry', N(5, 4)],
    ['null', null],
  ];
  for (const [what, bad] of bads) {
    for (let i = 0; i < MAX_NOTES; i += 1) {
      const list = differentNotes(MAX_NOTES);
      list[i] = bad;
      rows.push([`${what}, at position ${i} of ${MAX_NOTES}`, list, false]);
    }
  }
  assert.deepEqual(tableMismatches(rows, (value) => areNotes(value)), []);
});

// =============================================================================
// 5. noteSentence
// =============================================================================
test('noteSentence: three notes read by hand', () => {
  const low = noteSentence(lowNote(5, 4));
  assert.equal(typeof low, 'string');
  assert.ok(low.includes("'inside the gap, near its bottom edge'"), low);
  assert.ok(low.includes("'falling fast'"), low);
  assert.ok(low.includes('It did not flap.'), low);
  assert.ok(low.includes('lower pipe'), low);
  assert.ok(!low.includes('more than once'), low);

  const high = noteSentence(flapNote(1, 0, 2));
  assert.ok(high.includes("'inside the gap, near its top edge'"), high);
  assert.ok(high.includes("'rising fast'"), high);
  assert.ok(high.includes('It flapped.'), high);
  assert.ok(high.includes('upper pipe'), high);
  assert.ok(high.includes('more than once'), high);

  const ground = noteSentence(groundNote(3, 2, 7));
  assert.ok(ground.includes("'in the middle of the gap'"), ground);
  assert.ok(ground.includes("'hovering'"), ground);
  assert.ok(ground.includes('It did not flap.'), ground);
  assert.ok(ground.includes('ground'), ground);
  assert.ok(ground.includes('more than once'), ground);
});

test('noteSentence: every one of the 105 notes, at counts 1, 2, 3 and beyond, says all it must', () => {
  const problems = [];
  for (const times of [1, 2, 3, MAX_NOTES + 1]) {
    for (const item of everyNote(times)) {
      let sentence;
      try {
        sentence = noteSentence(item);
      } catch (err) {
        sentence = err;
      }
      for (const problem of sentenceProblems(item, sentence)) problems.push(`${show(item)} -> ${show(sentence)}: ${problem}`);
    }
  }
  assert.deepEqual(problems.slice(0, 8), [], `${problems.length} problem(s) in all`);
});

test('noteSentence: different notes read differently, the same note reads the same, and the note is left alone', () => {
  const first = everyNote(1).map((item) => noteSentence(item));
  const repeated = everyNote(2).map((item) => noteSentence(item));
  // 105 crashes, each as a first time and as a repeat
  assert.equal(new Set([...first, ...repeated]).size, 210);
  assert.deepEqual(everyNote(1).map((item) => noteSentence(Object.freeze(item))), first, 'asked again, with frozen notes');
});

// =============================================================================
// 6. buildRequest with notes
// =============================================================================
const SITUATIONS = [
  { bird_height: HEIGHT[3], bird_movement: MOVEMENT[2], next_pipe: DISTANCE[0] },
  { bird_height: HEIGHT[6], bird_movement: MOVEMENT[4], next_pipe: DISTANCE[2] },
  { bird_height: HEIGHT[0], bird_movement: MOVEMENT[0], next_pipe: DISTANCE[3] },
];

test('buildRequest: with no notes it is the request it always was', () => {
  for (const situation of SITUATIONS) {
    const plain = buildRequest(situation);
    assert.deepEqual(buildRequest(situation, []), plain);
    assert.deepEqual(buildRequest(situation, undefined), plain);
    assert.deepEqual(buildRequest(situation, Object.freeze([])), plain);
    assert.ok(!('past_crashes' in plain.state), 'no past_crashes key when there are no notes');
    assert.ok(!('past_crashes' in buildRequest(situation, []).state), 'nor for an explicit empty list');
    // the shape pilot.test.mjs has always asked for
    assert.deepEqual(Object.keys(plain.state).sort(), ['bird_height', 'bird_movement', 'next_pipe', 'rules']);
    // and Jev is not pointed at a field that is not there
    assert.ok(!JSON.stringify(plain).includes('past_crashes'), 'a request without notes must not mention past_crashes');
  }
});

test('buildRequest: with notes it adds past_crashes and extends the instructions, and changes nothing else', () => {
  const lists = [
    ['one note', [A()]],
    ['two notes', [B(2), A()]],
    ['three notes', [C(3), B(), A(2)]],
    ['a full list', differentNotes(MAX_NOTES)],
  ];
  for (const situation of SITUATIONS) {
    const plain = buildRequest(situation);
    for (const [name, notes] of lists) {
      const label = `${name}, ${situation.bird_height}`;
      const frozenNotes = deepFreeze(structuredClone(notes));
      const frozenSituation = Object.freeze({ ...situation });
      let request;
      assert.doesNotThrow(() => { request = buildRequest(frozenSituation, frozenNotes); }, `${label}: the inputs are frozen and must not be changed`);
      assert.deepEqual(frozenNotes, notes, label);
      assert.deepEqual(frozenSituation, situation, label);

      // state: one sentence per note, in the order given, beside everything that was there before
      const { past_crashes, ...restOfState } = request.state;
      assert.ok(Array.isArray(past_crashes), `${label}: state.past_crashes must be an array`);
      assert.deepEqual(past_crashes, notes.map((item) => noteSentence(item)), label);
      notes.forEach((item, i) => assert.deepEqual(sentenceProblems(item, past_crashes[i]), [], `${label}: past_crashes[${i}]`));
      assert.deepEqual(restOfState, plain.state, `${label}: rules and the three situation fields`);

      // question: the old instructions, then more, and the more names the new field
      const before = plain.questions.flap.instructions;
      const after = request.questions.flap.instructions;
      assert.ok(after.startsWith(before), `${label}: the instructions must start with the no-notes instructions`);
      const added = after.slice(before.length);
      assert.ok(added.includes('`past_crashes`'), `${label}: the added instructions must name \`past_crashes\`, got ${show(added)}`);
      assert.deepEqual(request.questions.flap.criteria, plain.questions.flap.criteria, label);
      assert.equal(request.model, plain.model, label);
      assert.equal(request.model, JEV_MODEL, label);

      // take the two additions away and the plain request is left
      const undone = structuredClone(request);
      delete undone.state.past_crashes;
      undone.questions.flap.instructions = before;
      assert.deepEqual(undone, plain, label);
      assert.deepEqual(JSON.parse(JSON.stringify(request)), request, `${label}: the request must survive JSON unchanged`);
    }
  }
});

test('buildRequest: past_crashes keeps the order it was given, newest first', () => {
  const [situation] = SITUATIONS;
  const forwards = buildRequest(situation, [C(3), B(), A(2)]).state.past_crashes;
  const backwards = buildRequest(situation, [A(2), B(), C(3)]).state.past_crashes;
  assert.equal(forwards.length, 3);
  assert.deepEqual(backwards, [...forwards].reverse());
  assert.notDeepEqual(backwards, forwards);
  // each sentence is about the note in the same place
  assert.ok(forwards[0].includes(`'${HEIGHT[6]}'`) && forwards[0].includes('It did not flap.') && forwards[0].includes('more than once'), forwards[0]);
  assert.ok(forwards[1].includes(`'${HEIGHT[1]}'`) && forwards[1].includes('It flapped.') && !forwards[1].includes('more than once'), forwards[1]);
  assert.ok(forwards[2].includes(`'${HEIGHT[5]}'`) && forwards[2].includes('It did not flap.') && forwards[2].includes('more than once'), forwards[2]);
});

// =============================================================================
// 7. Real runs, from the first answer to the next flight's first question
// =============================================================================
// Each is derived by hand in the cheat sheet at the top. The transcript and the
// time of death are checked first, so a slip in that arithmetic (or a retuned
// game) shows up as "sanity", not as a fault in the notes.
function sinkingRun() { // a) Jev never flaps
  const state = createGame(1);
  state.pipes[0].gapY = BIRD_START_Y;
  return { state, log: fly(state, () => false) };
}
function ceilingRun() { // b) Jev flaps every time
  const state = createGame(1);
  state.pipes[0].gapY = BIRD_START_Y;
  return { state, log: fly(state, () => true) };
}
function lateFlapRun() { // c) far too low with the pipe 68 px ahead; one flap, on the third answer
  const state = createGame(1);
  state.pipes = [pipeAt(180, 200)];
  state.bird.y = 400;
  return { state, log: fly(state, (i) => i === 2) };
}
function hopelessRun() { // far too low with the pipe 1 px ahead; Jev flaps, and dies on the first substep
  const state = createGame(1);
  state.pipes = [pipeAt(BIRD_X + BIRD_R + 1, 200)];
  state.bird.y = 400;
  return { state, log: fly(state, () => true) };
}

test('real run a: Jev never flaps and the bird falls to the ground', () => {
  const { state, log } = sinkingRun();
  assert.equal(transcript(log), '32- 33- 44- 54- 64- 64- 64- 64-', 'sanity (game.js and describe)');
  assert.deepEqual([state.alive, state.cause, state.t], [false, 'ground', 730], 'sanity (game.js)');
  assert.equal(whatItHit(state), 'ground');
  // every decision was a no-flap made while not rising: the last one is blamed
  assert.deepEqual(crashNote(log, whatItHit(state)), groundNote(6, 4));
});

test('real run b: Jev flaps every time and the bird meets the first pipe at the ceiling', () => {
  const { state, log } = ceilingRun();
  assert.equal(transcript(log), `32F 20F 10F 00F 00F 00F 00F 00F 02F 03F${' 03F'.repeat(14)}`, 'sanity (game.js and describe)');
  assert.deepEqual([state.alive, state.cause, state.t], [false, 'pipe', 2330], 'sanity (game.js)');
  assert.equal(whatItHit(state), 'upper pipe');
  // the last flap was made while the bird was dropping back from the ceiling:
  // a flap blamed although the bird was "falling slowly"
  assert.deepEqual(crashNote(log, whatItHit(state)), flapNote(0, 3));
});

test('real run c: Jev flaps too late and the bird is still climbing when it meets the lower pipe', () => {
  const { state, log } = lateFlapRun();
  assert.equal(transcript(log), '62- 63- 64F 60- 61-', 'sanity (game.js and describe)');
  assert.deepEqual([state.alive, state.cause, state.t], [false, 'pipe', 460], 'sanity (game.js)');
  assert.equal(whatItHit(state), 'lower pipe');
  // not the two no-flaps made while rising, not the flap: the no-flap before it
  assert.deepEqual(crashNote(log, whatItHit(state)), lowNote(6, 3));
});

test('real run d: one flap, dead on the first substep, nothing to blame', () => {
  const { state, log } = hopelessRun();
  // y 400 - 4.06 = 395.94, bottom edge 407.94 > 290, pipe at 111.5 < 112
  assert.equal(transcript(log), '62F', 'sanity (game.js and describe)');
  assert.deepEqual([state.alive, state.cause, state.t], [false, 'pipe', 10], 'sanity (game.js)');
  assert.equal(whatItHit(state), 'lower pipe');
  assert.equal(crashNote(log, whatItHit(state)), null);
});

test('real runs, one after another: the notes Jev is shown before its next flight', () => {
  let notes = [];
  const crash = ({ state, log }) => {
    notes = addNote(notes, crashNote(log, whatItHit(state)));
    assert.equal(areNotes(notes), true);
  };
  const ground = (times) => groundNote(6, 4, times);
  const upper = (times) => flapNote(0, 3, times);
  const lower = (times) => lowNote(6, 3, times);

  crash(sinkingRun());
  assert.deepEqual(notes, [ground(1)]);
  crash(sinkingRun()); // the same mistake again
  assert.deepEqual(notes, [ground(2)]);
  crash(ceilingRun());
  assert.deepEqual(notes, [upper(1), ground(2)]);
  crash(hopelessRun()); // nothing to blame: nothing changes
  assert.deepEqual(notes, [upper(1), ground(2)]);
  crash(lateFlapRun());
  assert.deepEqual(notes, [lower(1), upper(1), ground(2)]);
  crash(sinkingRun()); // and the first mistake a third time: back to the front
  assert.deepEqual(notes, [ground(3), lower(1), upper(1)]);

  // the next flight's first question
  const situation = describe(createGame(2));
  const plain = buildRequest(situation);
  const request = buildRequest(situation, notes);
  const { past_crashes, ...restOfState } = request.state;
  assert.deepEqual(restOfState, plain.state);
  assert.equal(past_crashes.length, 3);
  assert.deepEqual(sentenceProblems(ground(3), past_crashes[0]), []);
  assert.deepEqual(sentenceProblems(lower(1), past_crashes[1]), []);
  assert.deepEqual(sentenceProblems(upper(1), past_crashes[2]), []);
  // read by hand: fell to the ground, more than once; then the two single crashes
  assert.ok(past_crashes[0].includes("'below the gap, level with the lower pipe'") && past_crashes[0].includes("'falling fast'") && past_crashes[0].includes('ground') && past_crashes[0].includes('more than once'), past_crashes[0]);
  assert.ok(past_crashes[1].includes("'falling slowly'") && past_crashes[1].includes('It did not flap.') && !past_crashes[1].includes('more than once'), past_crashes[1]);
  assert.ok(past_crashes[2].includes("'above the gap, level with the upper pipe'") && past_crashes[2].includes('It flapped.') && !past_crashes[2].includes('more than once'), past_crashes[2]);
  assert.ok(request.questions.flap.instructions.startsWith(plain.questions.flap.instructions));
  assert.ok(request.questions.flap.instructions.slice(plain.questions.flap.instructions.length).includes('`past_crashes`'));
});

// =============================================================================
// 8. Negative control
// =============================================================================
test('negative control: the checkers in this file report a deliberately wrong expectation, and only that one', () => {
  // Nothing here calls the code under test: the classifiers are this file's own
  // restatements and hand-written sentences, so the control holds whatever
  // pilot.js does.
  const byTheRule = ({ log, hit }) => expectedNote(log, hit);

  // the restatement agrees with all 30 hand-worked crashes, so the sweep that leans on it is anchored
  assert.equal(CRASHES.length, 30);
  assert.deepEqual(tableMismatches(CRASHES, byTheRule), []);

  // one wrong row among them is reported, by name, and nothing else is
  const lie = ['WRONG ON PURPOSE: blames the final entry', crashed('upper pipe', F(4, 4), N(3, 2), F(2, 3), N(0, 3)), flapNote(0, 3)];
  const bad = tableMismatches([...CRASHES, lie], byTheRule);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /WRONG ON PURPOSE/);
  assert.throws(() => assert.deepEqual(bad, []), assert.AssertionError);

  // near misses are all told apart from the right answer
  const nearMisses = [
    ['the ground saved as the lower pipe', crashed('ground', N(5, 4)), lowNote(5, 4)],
    ['counted twice', crashed('ground', N(5, 4)), groundNote(5, 4, 2)],
    ['next_pipe left on the note', crashed('ground', N(5, 4)), { ...groundNote(5, 4), next_pipe: DISTANCE[1] }],
    ['the movement of another entry', crashed('ground', N(5, 3), N(5, 4)), groundNote(5, 3)],
    ['null where a note is due', crashed('ground', N(5, 4)), null],
    ['a note where null is due', crashed('ground', F(5, 4)), groundNote(5, 4)],
    ['undefined where null is due', crashed('ground', F(5, 4)), undefined],
  ];
  assert.equal(tableMismatches(nearMisses, byTheRule).length, nearMisses.length);
  // a function that throws is reported, not swallowed
  assert.equal(tableMismatches(CRASHES, () => { throw new TypeError('boom'); }).length, CRASHES.length);

  // the sentence checker passes a good sentence written by hand and catches each way of spoiling it
  const repeat = lowNote(6, 4, 2); // its height phrase is 'below the gap, level with the lower pipe'
  const good = "The bird was 'below the gap, level with the lower pipe' and 'falling fast'. It did not flap. It hit the lower pipe. This has happened more than once.";
  assert.deepEqual(sentenceProblems(repeat, good), []);
  const spoiled = [
    ['no quotes round the height', good.replace("'below the gap, level with the lower pipe'", 'below the gap, level with the lower pipe')],
    ['no quotes round the movement', good.replace("'falling fast'", 'falling fast')],
    ['another movement', good.replace('falling fast', 'falling slowly')],
    ['says it flapped', good.replace('It did not flap.', 'It flapped.')],
    ['says both', good.replace('It did not flap.', 'It did not flap. It flapped.')],
    ['names the ground', good.replace('It hit the lower pipe.', 'It hit the ground.')],
    // "lower pipe" is then left only inside the quoted height phrase
    ['names no obstacle of its own', good.replace(' It hit the lower pipe.', '')],
    ['forgets it happened before', good.replace(' This has happened more than once.', '')],
    ['an array holding the sentence', [good]],
    ['undefined', undefined],
  ];
  for (const [label, sentence] of spoiled) assert.notDeepEqual(sentenceProblems(repeat, sentence), [], label);
  const once = good.replace(' This has happened more than once.', '');
  assert.deepEqual(sentenceProblems(lowNote(6, 4, 1), once), []);
  assert.notDeepEqual(sentenceProblems(lowNote(6, 4, 1), good), [], 'a first crash said to have happened more than once');
  const flapped = "The bird was 'above the gap, level with the upper pipe' and 'rising fast'. It flapped. It hit the upper pipe.";
  assert.deepEqual(sentenceProblems(flapNote(0, 0), flapped), []);
  assert.notDeepEqual(sentenceProblems(flapNote(0, 0), flapped.replace('It flapped.', 'It did not flap.')), []);
  assert.notDeepEqual(sentenceProblems(flapNote(0, 0), flapped.replace(' It hit the upper pipe.', '')), [], 'the hit named only by the height phrase');

  // the addNote restatement, on examples worked by hand
  assert.deepEqual(modelAdd([C(), B(), A()], B()), [B(2), C(), A()]);
  assert.deepEqual(modelAdd([C(), B(), A()], null), [C(), B(), A()]);
  assert.deepEqual(modelAdd([B(), A()], groundNote(5, 4)), [groundNote(5, 4), B(), A()]);
  const full = differentNotes(MAX_NOTES);
  const fresh = everyNote()[MAX_NOTES];
  assert.deepEqual(modelAdd(full, fresh), [fresh, ...full.slice(0, -1)]);
  assert.deepEqual(modelAdd(full, { ...full.at(-1), times: 1 }), [{ ...full.at(-1), times: MAX_NOTES + 1 }, ...full.slice(0, -1)]);
  // and strict deep equality does tell a note from its near misses
  assert.throws(() => assert.deepEqual(groundNote(5, 4), lowNote(5, 4)), assert.AssertionError);
  assert.throws(() => assert.deepEqual({ ...A(), next_pipe: DISTANCE[1] }, A()), assert.AssertionError);
  assert.throws(() => assert.deepEqual([A(2), B()], [B(), A(2)]), assert.AssertionError);
});
