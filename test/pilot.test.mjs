// =============================================================================
// Contract tests for pilot.js: HEIGHT / MOVEMENT / DISTANCE, describe,
// isSituation, buildRequest, readAnswer.
//
// Written BEFORE pilot.js existed. Expected values come from the written
// contract and the numbers in constants.js, worked out by hand; none was
// obtained by running an implementation.
//
//   node --test "test/*.test.mjs"
//
// -----------------------------------------------------------------------------
// FAILURE MODES THIS FILE GUARDS AGAINST (written first; the tests follow it)
// -----------------------------------------------------------------------------
// Words
//  P01 A phrase list has a typo, a different order, a missing or extra phrase,
//      or shares a phrase with another list.
// describe
//  P02 A boundary value lands in the neighbouring band (< where <= is meant, or
//      the reverse) at any of the 6 height, 4 movement or 3 distance boundaries.
//  P03 Sign or reference-point mistakes: height as gapY - bird.y (above and
//      below swapped), rising and falling swapped, distance measured from the
//      bird's centre or back edge, or to the pipe's centre or far edge.
//  P04 Rounding or truncating a number before banding it.
//  P05 Looks at pipes[0] instead of nextPipe(state) (describes a pipe that is
//      already behind the bird).
//  P06 The height words disagree with the collision rule: "inside the gap"
//      while colliding, or "level with the pipe" while clear.
//  P07 Mutates the state, adds or drops keys, returns numbers or indices
//      instead of phrases, lets one field leak into another, or depends on
//      earlier calls.
// isSituation
//  P08 Too loose: accepts null, arrays, strings, missing or extra keys,
//      non-string values, a phrase from another list, near-miss spellings; or
//      throws instead of returning false.
//  P09 Too strict: rejects a valid combination of listed phrases.
// buildRequest
//  P10 Wrong model, situation not spread into `state`, rules missing or empty,
//      question not named `flap` or not type 'noul', criteria keys wrong or
//      empty, extra fields (raw numbers) leaking to the model, input mutated,
//      result not plain JSON.
// readAnswer
//  P11 Accepts out-of-range, non-finite or non-number values, coerces strings /
//      null / booleans, rounds or thresholds the probability, reads the wrong
//      path, returns undefined instead of throwing, throws something that is
//      not an Error.
// Constants
//  P12 The band constants drift out of step with the physics (HEIGHT_EDGE no
//      longer GAP_H / 2 - BIRD_R; thresholds out of order).
// The suite itself
//  P13 The table checker cannot fail (negative control at the bottom).
//
// -----------------------------------------------------------------------------
// ASSUMPTIONS WHERE THE CONTRACT IS SILENT (each is asserted somewhere below)
// -----------------------------------------------------------------------------
//  B1 isSituation is false for an array even when it carries the three keys,
//     and for an extra key whose value is undefined.
//  B2 readAnswer throws for bodies that are not objects at all (JSON text, a
//     number, an array) and for noul that is null, a boolean, an array or
//     infinite.
//  B3 buildRequest's two criteria strings differ from each other.
// An oddity in the contract, followed literally: next_pipe reads "the bird is
// between the pipes right now" at dist == 0 (pipe.x == 112) and for a still
// unpassed pipe at pipe.x == 24, although the collision rule (strict < and >)
// counts neither as overlapping. One substep at each end.
// Not tested, because the contract does not define them: describe when no pipe
// is unpassed, buildRequest given something that is not a situation, and
// isSituation on class instances or prototype-less objects.
//
// -----------------------------------------------------------------------------
// HAND-DERIVATION CHEAT SHEET (actual values from constants.js)
// -----------------------------------------------------------------------------
//   offset = bird.y - gapY           (edge 78, near edge 35, middle 10)
//     < -78 [0] | -78 <= o < -35 [1] | -35 <= o < -10 [2] | -10 <= o <= 10 [3]
//     | 10 < o <= 35 [4] | 35 < o <= 78 [5] | > 78 [6]
//   vy                               (fast rise -200, level 50, fast fall 250)
//     < -200 [0] | -200 <= vy < -50 [1] | -50 <= vy <= 50 [2]
//     | 50 < vy <= 250 [3] | > 250 [4]
//   dist = pipe.x - (100 + 12)       (far 150, close 60)
//     > 150 [0] | 60 < d <= 150 [1] | 0 < d <= 60 [2] | <= 0 [3]
//     i.e. pipe.x > 262 [0] | 172 < x <= 262 [1] | 112 < x <= 172 [2] | x <= 112 [3]
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORLD_W, BIRD_X, BIRD_R, BIRD_START_Y, GRAVITY, FLAP_VY, MAX_FALL_VY, SUBSTEP_MS,
  PIPE_SPEED, PIPE_W, GAP_H, PIPE_SPACING, FIRST_PIPE_X, GAP_MIN_Y, GAP_MAX_Y,
  DECISION_STEP_MS, FLAP_THRESHOLD, JEV_MODEL,
  HEIGHT_EDGE, HEIGHT_NEAR_EDGE, HEIGHT_MIDDLE,
  SPEED_FAST_RISE, SPEED_LEVEL, SPEED_FAST_FALL,
  DIST_FAR, DIST_CLOSE,
} from '../constants.js';
import { createGame, advance } from '../game.js';
// Note: `describe` here is pilot.js's function, not node:test's.
import { HEIGHT, MOVEMENT, DISTANCE, describe, isSituation, buildRequest, readAnswer } from '../pilot.js';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const BIRD_FRONT = BIRD_X + BIRD_R; // 112
const MID_GAP = Math.round((GAP_MIN_Y + GAP_MAX_Y) / 2); // 285
const HAIRS = [0.01, 1e-6]; // "a hair either side" of a boundary
const STILL_VY = -GRAVITY * (SUBSTEP_MS / 1000); // -14: the bird does not move during the next substep

// A state built by hand in the contract's shape, described by the three numbers
// that describe() turns into words.
function stateWith({ offset = 0, vy = 0, dist = DIST_FAR + 100, gapY = MID_GAP } = {}) {
  return {
    t: 0,
    bird: { y: gapY + offset, vy },
    pipes: [{ x: BIRD_FRONT + dist, gapY, passed: false }],
    score: 0,
    alive: true,
    cause: null,
    rng: 1,
  };
}

// Runs every [input, expected, note] row through `classify` and returns a line
// of text for each row that came out wrong (all of them, not just the first).
function tableMismatches(rows, classify) {
  const bad = [];
  for (const [input, expected, note] of rows) {
    let got;
    try {
      got = classify(input);
    } catch (err) {
      got = `threw ${err?.name}: ${err?.message}`;
    }
    if (got !== expected) bad.push(`${note} (${JSON.stringify(input)}): expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`);
  }
  return bad;
}

// Rows for one boundary: exactly on it, and a hair below and above it.
function around(boundary, name, list, below, at, above) {
  const rows = [[boundary, list[at], `exactly on ${name}`]];
  for (const hair of HAIRS) {
    rows.push([boundary - hair, list[below], `${hair} below ${name}`]);
    rows.push([boundary + hair, list[above], `${hair} above ${name}`]);
  }
  return rows;
}

// An independent restatement of the bands, used by the sweeps: the index is the
// number of thresholds the value has crossed.
const count = (flags) => flags.filter(Boolean).length;
const heightIndex = (o) => count([o >= -HEIGHT_EDGE, o >= -HEIGHT_NEAR_EDGE, o >= -HEIGHT_MIDDLE, o > HEIGHT_MIDDLE, o > HEIGHT_NEAR_EDGE, o > HEIGHT_EDGE]);
const movementIndex = (v) => count([v >= SPEED_FAST_RISE, v >= -SPEED_LEVEL, v > SPEED_LEVEL, v > SPEED_FAST_FALL]);
const distanceIndex = (d) => count([d <= DIST_FAR, d <= DIST_CLOSE, d <= 0]);

// One value from the middle of each band.
const HEIGHT_REPS = [
  -HEIGHT_EDGE - 20, // -98
  -(HEIGHT_EDGE + HEIGHT_NEAR_EDGE) / 2, // -56.5
  -(HEIGHT_NEAR_EDGE + HEIGHT_MIDDLE) / 2, // -22.5
  0,
  (HEIGHT_NEAR_EDGE + HEIGHT_MIDDLE) / 2, // 22.5
  (HEIGHT_EDGE + HEIGHT_NEAR_EDGE) / 2, // 56.5
  HEIGHT_EDGE + 20, // 98
];
const MOVEMENT_REPS = [
  SPEED_FAST_RISE - 100, // -300
  (SPEED_FAST_RISE - SPEED_LEVEL) / 2, // -125
  0,
  (SPEED_LEVEL + SPEED_FAST_FALL) / 2, // 150
  SPEED_FAST_FALL + 100, // 350
];
const DISTANCE_REPS = [
  DIST_FAR + 100, // 250
  (DIST_FAR + DIST_CLOSE) / 2, // 105
  DIST_CLOSE / 2, // 30
  -20,
];

function allSituations() {
  const all = [];
  for (const bird_height of HEIGHT) {
    for (const bird_movement of MOVEMENT) {
      for (const next_pipe of DISTANCE) all.push({ bird_height, bird_movement, next_pipe });
    }
  }
  return all;
}

// Keeps the bird alive whatever the gaps are: before each substep it is put
// back on the centre of the next gap with zero speed.
function cruise(s, substeps) {
  for (let i = 0; i < substeps; i += 1) {
    const target = s.pipes.find((p) => p.passed === false);
    s.bird.y = target.gapY;
    s.bird.vy = 0;
    advance(s, SUBSTEP_MS);
    assert.equal(s.alive, true, `cruise: the bird sat on the gap centre yet died (${s.cause}) at t=${s.t}`);
  }
}

// =============================================================================
// 0. Constants the words depend on
// =============================================================================
test('tripwire: the hand-derived substep numbers below were computed for these constants', () => {
  // The only place numbers from constants.js are repeated. If this fails, the
  // game was retuned and the literal substep numbers in section 2 must be
  // re-derived by hand.
  assert.deepEqual(
    {
      BIRD_X, BIRD_R, BIRD_START_Y, GRAVITY, FLAP_VY, MAX_FALL_VY, SUBSTEP_MS, PIPE_SPEED, PIPE_W, PIPE_SPACING, FIRST_PIPE_X, DECISION_STEP_MS,
      HEIGHT_EDGE, HEIGHT_NEAR_EDGE, HEIGHT_MIDDLE, SPEED_FAST_RISE, SPEED_LEVEL, SPEED_FAST_FALL, DIST_FAR, DIST_CLOSE,
    },
    {
      BIRD_X: 100, BIRD_R: 12, BIRD_START_Y: 280, GRAVITY: 1400, FLAP_VY: -420, MAX_FALL_VY: 480, SUBSTEP_MS: 10, PIPE_SPEED: 150, PIPE_W: 64, PIPE_SPACING: 220, FIRST_PIPE_X: 460, DECISION_STEP_MS: 100,
      HEIGHT_EDGE: 78, HEIGHT_NEAR_EDGE: 35, HEIGHT_MIDDLE: 10, SPEED_FAST_RISE: -200, SPEED_LEVEL: 50, SPEED_FAST_FALL: 250, DIST_FAR: 150, DIST_CLOSE: 60,
    },
  );
});

test('constants: the bands are in order and in step with the physics', () => {
  // "level with the pipe" must begin exactly where the bird stops fitting the gap: 180/2 - 12 = 78
  assert.equal(HEIGHT_EDGE, GAP_H / 2 - BIRD_R);
  assert.ok(0 < HEIGHT_MIDDLE && HEIGHT_MIDDLE < HEIGHT_NEAR_EDGE && HEIGHT_NEAR_EDGE < HEIGHT_EDGE);
  assert.ok(SPEED_FAST_RISE < -SPEED_LEVEL && -SPEED_LEVEL < 0 && SPEED_LEVEL < SPEED_FAST_FALL);
  assert.ok(0 < DIST_CLOSE && DIST_CLOSE < DIST_FAR);
  // every movement word is reachable: a fresh flap reads "rising fast", the capped fall "falling fast"
  assert.ok(FLAP_VY < SPEED_FAST_RISE);
  assert.ok(MAX_FALL_VY > SPEED_FAST_FALL);
  // a run opens with the first pipe "far ahead": 460 - 112 = 348 > 150
  assert.ok(FIRST_PIPE_X - BIRD_FRONT > DIST_FAR);
  assert.ok(FLAP_THRESHOLD > 0 && FLAP_THRESHOLD <= 1);
});

// =============================================================================
// 1. The phrase lists
// =============================================================================
test('phrase lists: exact words in exact order', () => {
  assert.deepEqual(HEIGHT, [
    'above the gap, level with the upper pipe',
    'inside the gap, near its top edge',
    'inside the gap, a little above the middle',
    'in the middle of the gap',
    'inside the gap, a little below the middle',
    'inside the gap, near its bottom edge',
    'below the gap, level with the lower pipe',
  ]);
  assert.deepEqual(MOVEMENT, ['rising fast', 'rising slowly', 'hovering', 'falling slowly', 'falling fast']);
  assert.deepEqual(DISTANCE, ['far ahead', 'approaching', 'very close', 'the bird is between the pipes right now']);
  const every = [...HEIGHT, ...MOVEMENT, ...DISTANCE];
  assert.equal(new Set(every).size, 16, 'no phrase may appear twice, within a list or across lists');
});

// =============================================================================
// 2. describe
// =============================================================================
test('describe: returns exactly bird_height, bird_movement and next_pipe, each a listed phrase', () => {
  const said = describe(stateWith());
  assert.deepEqual(Object.keys(said).sort(), ['bird_height', 'bird_movement', 'next_pipe']);
  assert.ok(HEIGHT.includes(said.bird_height), `bird_height ${JSON.stringify(said.bird_height)} is not in HEIGHT`);
  assert.ok(MOVEMENT.includes(said.bird_movement), `bird_movement ${JSON.stringify(said.bird_movement)} is not in MOVEMENT`);
  assert.ok(DISTANCE.includes(said.next_pipe), `next_pipe ${JSON.stringify(said.next_pipe)} is not in DISTANCE`);
  // the defaults of stateWith: on the gap centre, at rest, 250 px away
  assert.deepEqual(said, { bird_height: HEIGHT[3], bird_movement: MOVEMENT[2], next_pipe: DISTANCE[0] });
});

test('describe: bird_height, every band boundary on both sides', () => {
  // offset = bird.y - gapY; negative means the bird is higher.
  //   -78.01 [0]   -78 [1]   -77.99 [1]
  //   -35.01 [1]   -35 [2]   -34.99 [2]
  //   -10.01 [2]   -10 [3]    -9.99 [3]
  //     9.99 [3]    10 [3]    10.01 [4]
  //    34.99 [4]    35 [4]    35.01 [5]
  //    77.99 [5]    78 [5]    78.01 [6]
  const rows = [
    ...around(-HEIGHT_EDGE, '-HEIGHT_EDGE', HEIGHT, 0, 1, 1),
    ...around(-HEIGHT_NEAR_EDGE, '-HEIGHT_NEAR_EDGE', HEIGHT, 1, 2, 2),
    ...around(-HEIGHT_MIDDLE, '-HEIGHT_MIDDLE', HEIGHT, 2, 3, 3),
    ...around(HEIGHT_MIDDLE, '+HEIGHT_MIDDLE', HEIGHT, 3, 3, 4),
    ...around(HEIGHT_NEAR_EDGE, '+HEIGHT_NEAR_EDGE', HEIGHT, 4, 4, 5),
    ...around(HEIGHT_EDGE, '+HEIGHT_EDGE', HEIGHT, 5, 5, 6),
    ...HEIGHT_REPS.map((offset, i) => [offset, HEIGHT[i], `middle of band ${i}`]),
    [-(GAP_MAX_Y - BIRD_R), HEIGHT[0], 'bird on the ceiling, lowest gap'],
    [GAP_MAX_Y, HEIGHT[6], 'bird far below any gap'],
  ];
  for (const gapY of [GAP_MIN_Y, MID_GAP, GAP_MAX_Y]) {
    assert.deepEqual(tableMismatches(rows, (offset) => describe(stateWith({ offset, gapY })).bird_height), [], `gapY ${gapY}`);
  }
});

test('describe: bird_movement, every band boundary on both sides', () => {
  // vy; negative means rising.
  //   -200.01 [0]   -200 [1]   -199.99 [1]
  //    -50.01 [1]    -50 [2]    -49.99 [2]
  //     49.99 [2]     50 [2]     50.01 [3]
  //    249.99 [3]    250 [3]    250.01 [4]
  const rows = [
    ...around(SPEED_FAST_RISE, 'SPEED_FAST_RISE', MOVEMENT, 0, 1, 1),
    ...around(-SPEED_LEVEL, '-SPEED_LEVEL', MOVEMENT, 1, 2, 2),
    ...around(SPEED_LEVEL, '+SPEED_LEVEL', MOVEMENT, 2, 2, 3),
    ...around(SPEED_FAST_FALL, 'SPEED_FAST_FALL', MOVEMENT, 3, 3, 4),
    ...MOVEMENT_REPS.map((vy, i) => [vy, MOVEMENT[i], `middle of band ${i}`]),
    [FLAP_VY, MOVEMENT[0], 'the instant after a flap (-420)'],
    [MAX_FALL_VY, MOVEMENT[4], 'falling at the cap (480)'],
  ];
  assert.deepEqual(tableMismatches(rows, (vy) => describe(stateWith({ vy })).bird_movement), []);
});

test('describe: next_pipe, every band boundary on both sides', () => {
  // dist = pipe.x - 112 (the bird's front edge to the pipe's left edge).
  //   150.01 [0]   150 [1]   149.99 [1]      pipe.x 262.01 / 262 / 261.99
  //    60.01 [1]    60 [2]    59.99 [2]      pipe.x 172.01 / 172 / 171.99
  //     0.01 [2]     0 [3]    -0.01 [3]      pipe.x 112.01 / 112 / 111.99
  const rows = [
    ...around(DIST_FAR, 'DIST_FAR', DISTANCE, 1, 1, 0),
    ...around(DIST_CLOSE, 'DIST_CLOSE', DISTANCE, 2, 2, 1),
    ...around(0, 'zero distance', DISTANCE, 3, 3, 2),
    ...DISTANCE_REPS.map((dist, i) => [dist, DISTANCE[i], `middle of band ${i}`]),
    [FIRST_PIPE_X - BIRD_FRONT, DISTANCE[0], 'first pipe of a fresh game (348)'],
    [-BIRD_R, DISTANCE[3], "pipe's left edge at the bird's centre"],
    [-(2 * BIRD_R + PIPE_W), DISTANCE[3], "pipe's right edge on the bird's back (x = 24), not yet passed"],
  ];
  assert.deepEqual(tableMismatches(rows, (dist) => describe(stateWith({ dist })).next_pipe), []);
});

test('describe: sweeps agree with an independent restatement of the bands, with no cross-talk between fields', () => {
  // Each sweep moves one number in exact binary steps while the other two cycle
  // through one value per band; the whole triple is checked every time.
  const expected = (offset, vy, dist) => ({
    bird_height: HEIGHT[heightIndex(offset)],
    bird_movement: MOVEMENT[movementIndex(vy)],
    next_pipe: DISTANCE[distanceIndex(dist)],
  });
  let i = 0;
  const check = (offset, vy, dist) => {
    assert.deepEqual(describe(stateWith({ offset, vy, dist })), expected(offset, vy, dist), `offset ${offset}, vy ${vy}, dist ${dist}`);
    i += 1;
  };
  const other = (reps) => reps[i % reps.length];
  for (let offset = -HEIGHT_EDGE - 40; offset <= HEIGHT_EDGE + 40; offset += 0.25) check(offset, other(MOVEMENT_REPS), other(DISTANCE_REPS));
  for (let vy = FLAP_VY - 20; vy <= MAX_FALL_VY + 20; vy += 0.5) check(other(HEIGHT_REPS), vy, other(DISTANCE_REPS));
  for (let dist = -(2 * BIRD_R + PIPE_W) - 20; dist <= FIRST_PIPE_X; dist += 0.25) check(other(HEIGHT_REPS), other(MOVEMENT_REPS), dist);
});

test('describe: all 140 combinations of words are reachable, one per combination of bands', () => {
  const seen = new Set();
  HEIGHT_REPS.forEach((offset, h) => {
    MOVEMENT_REPS.forEach((vy, m) => {
      DISTANCE_REPS.forEach((dist, d) => {
        const said = describe(stateWith({ offset, vy, dist }));
        assert.deepEqual(said, { bird_height: HEIGHT[h], bird_movement: MOVEMENT[m], next_pipe: DISTANCE[d] });
        assert.equal(isSituation(said), true);
        seen.add(JSON.stringify(said));
      });
    });
  });
  assert.equal(seen.size, 7 * 5 * 4);
});

test('describe: the height words agree with the collision rule at the gap edges', () => {
  const rows = [
    // [offset, HEIGHT index, survives a substep with the pipe over the bird]
    [-HEIGHT_EDGE - 0.01, 0, false], // bird top 0.01 px into the upper pipe
    [-HEIGHT_EDGE, 1, true], // bird top exactly on the gap's top edge
    [-HEIGHT_EDGE + 0.01, 1, true],
    [0, 3, true],
    [HEIGHT_EDGE - 0.01, 5, true],
    [HEIGHT_EDGE, 5, true], // bird bottom exactly on the gap's bottom edge
    [HEIGHT_EDGE + 0.01, 6, false], // bird bottom 0.01 px into the lower pipe
  ];
  for (const gapY of [GAP_MIN_Y, MID_GAP, GAP_MAX_Y]) {
    for (const [offset, index, survives] of rows) {
      const s = createGame(1);
      s.pipes = [{ x: BIRD_X, gapY, passed: false }]; // 100 -> 98.5: over the bird
      s.bird.y = gapY + offset;
      s.bird.vy = STILL_VY;
      const said = describe(s);
      const label = `gapY ${gapY}, offset ${offset}`;
      assert.equal(said.bird_height, HEIGHT[index], label);
      assert.equal(said.next_pipe, DISTANCE[3], label);
      advance(s, SUBSTEP_MS);
      assert.equal(s.alive, survives, `${label}: described as "${said.bird_height}" but alive=${s.alive}`);
      assert.equal(s.cause, survives ? null : 'pipe', label);
    }
  }
});

test('describe: "inside the gap" means not colliding, and "level with a pipe" means colliding, at every half pixel', () => {
  for (let offset = -HEIGHT_EDGE - 30; offset <= HEIGHT_EDGE + 30; offset += 0.5) {
    const s = createGame(1);
    s.pipes = [{ x: BIRD_X, gapY: MID_GAP, passed: false }];
    s.bird.y = MID_GAP + offset;
    s.bird.vy = STILL_VY;
    const band = HEIGHT.indexOf(describe(s).bird_height);
    assert.notEqual(band, -1, `offset ${offset}: bird_height is not a listed phrase`);
    advance(s, SUBSTEP_MS);
    const saysInside = band >= 1 && band <= 5;
    assert.equal(s.alive, saysInside, `offset ${offset}: described as "${HEIGHT[band]}" but alive=${s.alive}`);
  }
});

test('describe: looks at the next unpassed pipe, not at pipes[0]', () => {
  const s = stateWith();
  s.bird.y = GAP_MAX_Y;
  s.pipes = [
    { x: 10, gapY: GAP_MIN_Y, passed: true }, // behind the bird, still on screen
    { x: 10 + PIPE_SPACING, gapY: GAP_MAX_Y, passed: false }, // 230: dist 118
    { x: 10 + 2 * PIPE_SPACING, gapY: GAP_MIN_Y, passed: false },
  ];
  // against pipes[1]: offset 0 -> middle; dist 230 - 112 = 118 -> approaching
  // (against pipes[0] it would be offset 230 -> below the gap; dist -102 -> between the pipes)
  assert.deepEqual(describe(s), { bird_height: HEIGHT[3], bird_movement: MOVEMENT[2], next_pipe: DISTANCE[1] });
});

test('describe: does not change the state and gives the same answer every time', () => {
  const s = createGame(6);
  advance(s, DECISION_STEP_MS, true);
  const before = structuredClone(s);
  const first = describe(s);
  const second = describe(s);
  assert.deepEqual(s, before, 'describe must not change the state');
  assert.deepEqual(second, first);
  // describing other states in between must not change the answer for this one
  describe(stateWith({ offset: HEIGHT_EDGE + 20, vy: MAX_FALL_VY, dist: -20 }));
  describe(createGame(7));
  assert.deepEqual(describe(s), first);
});

test('describe: a fresh game reads "hovering" and "far ahead", with the height taken from the first gap', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const s = createGame(seed);
    const said = describe(s);
    // vy 0 -> hovering; pipe at 460: dist 348 > 150 -> far ahead
    assert.equal(said.bird_movement, MOVEMENT[2]);
    assert.equal(said.next_pipe, DISTANCE[0]);
    assert.equal(said.bird_height, HEIGHT[heightIndex(BIRD_START_Y - s.pipes[0].gapY)], `seed ${seed}, gapY ${s.pipes[0].gapY}`);
    assert.equal(isSituation(said), true);
  }
});

test('describe: bird_movement changes on exactly these substeps of a flap arc', () => {
  // After a flap vy = -420 + 14k:
  //   k=15: -210 rising fast        k=16: -196 rising slowly   (-200 is crossed between them)
  //   k=26:  -56 rising slowly      k=27:  -42 hovering
  //   k=33:   42 hovering           k=34:   56 falling slowly
  //   k=47:  238 falling slowly     k=48:  252 falling fast
  const wordAt = { 1: 0, 15: 0, 16: 1, 26: 1, 27: 2, 30: 2, 33: 2, 34: 3, 47: 3, 48: 4, 60: 4 };
  const s = createGame(1);
  assert.equal(describe(s).bird_movement, MOVEMENT[2], 'before the flap (vy 0)');
  for (let k = 1; k <= 60; k += 1) {
    advance(s, SUBSTEP_MS, k === 1);
    if (k in wordAt) assert.equal(describe(s).bird_movement, MOVEMENT[wordAt[k]], `substep ${k}, vy ${s.bird.vy}`);
  }
  // and at Jev's six decision points: vy -280, -140, 0, 140, 280, 420
  const atDecisions = [0, 1, 2, 3, 4, 4];
  const again = createGame(1);
  atDecisions.forEach((index, i) => {
    advance(again, DECISION_STEP_MS, i === 0);
    assert.equal(describe(again).bird_movement, MOVEMENT[index], `after decision step ${i + 1}, vy ${again.bird.vy}`);
  });
});

test('describe: next_pipe changes on exactly these substeps as the first pipe arrives and is passed', () => {
  // First pipe: x = 460 - 1.5k, so dist = 348 - 1.5k.
  //   k=131: 151.5 far ahead          k=132: 150  approaching   (exactly on DIST_FAR)
  //   k=191:  61.5 approaching        k=192:  60  very close    (exactly on DIST_CLOSE)
  //   k=231:   1.5 very close         k=232:   0  between the pipes (pipe touching the bird's front)
  //   k=290:  -87  between the pipes  (pipe at 25, right edge 89: not passed yet)
  //   k=291: passed (23.5). Next pipe at 680 - 436.5 = 243.5: dist 131.5 -> approaching
  const checkpoints = [
    [131, 0], [132, 1], [191, 1], [192, 2], [231, 2], [232, 3], [290, 3], [291, 1],
  ];
  const s = createGame(2);
  assert.equal(describe(s).next_pipe, DISTANCE[0], 'fresh game');
  let k = 0;
  for (const [target, index] of checkpoints) {
    cruise(s, target - k);
    k = target;
    const said = describe(s);
    assert.equal(said.next_pipe, DISTANCE[index], `substep ${k}`);
    // cruising: vy 14 -> hovering; 0.14 px below the centre of the gap it is flying
    // through -> "in the middle", until substep 291 switches the reference to the
    // second pipe's gap, wherever that is
    assert.equal(said.bird_movement, MOVEMENT[2], `substep ${k}`);
    const ahead = s.pipes.find((p) => p.passed === false);
    assert.equal(said.bird_height, HEIGHT[heightIndex(s.bird.y - ahead.gapY)], `substep ${k}`);
    if (k < 291) assert.equal(said.bird_height, HEIGHT[3], `substep ${k}`);
  }
  assert.ok(s.pipes[0].x < WORLD_W, 'sanity: the passed pipe is still on screen');
  assert.equal(s.score, 1);
});

// =============================================================================
// 3. isSituation
// =============================================================================
test('isSituation: true for all 140 combinations of listed phrases', () => {
  const all = allSituations();
  assert.equal(all.length, 140);
  for (const situation of all) {
    assert.equal(isSituation(situation), true, JSON.stringify(situation));
    assert.equal(isSituation(JSON.parse(JSON.stringify(situation))), true, 'and after a JSON round trip');
    const { next_pipe, bird_height, bird_movement } = situation;
    assert.equal(isSituation({ next_pipe, bird_movement, bird_height }), true, 'key order does not matter');
  }
});

test('isSituation: false, without throwing, for everything else', () => {
  const ok = { bird_height: HEIGHT[3], bird_movement: MOVEMENT[2], next_pipe: DISTANCE[0] };
  assert.equal(isSituation(ok), true, 'sanity: the base object is valid');
  const { bird_height, bird_movement, next_pipe } = ok;
  const rejects = [
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['true', true],
    ['a phrase on its own', HEIGHT[3]],
    ['a valid situation as JSON text', JSON.stringify(ok)],
    ['an empty array', []],
    ['an array of the three phrases', [bird_height, bird_movement, next_pipe]],
    ['an array carrying the three keys', Object.assign([], ok)],
    ['an empty object', {}],
    ['missing bird_height', { bird_movement, next_pipe }],
    ['missing bird_movement', { bird_height, next_pipe }],
    ['missing next_pipe', { bird_height, bird_movement }],
    ['an extra key', { ...ok, score: 3 }],
    ['an extra key holding undefined', { ...ok, extra: undefined }],
    ['a built request state (has rules)', { rules: 'Flap to rise.', ...ok }],
    ['camelCase keys', { birdHeight: bird_height, birdMovement: bird_movement, nextPipe: next_pipe }],
    ['bird_height a band index', { ...ok, bird_height: 3 }],
    ['bird_height null', { ...ok, bird_height: null }],
    ['bird_height undefined', { ...ok, bird_height: undefined }],
    ['bird_movement an array holding a valid phrase', { ...ok, bird_movement: [bird_movement] }],
    ['next_pipe an object', { ...ok, next_pipe: { phrase: next_pipe } }],
    ['next_pipe a number of pixels', { ...ok, next_pipe: 348 }],
    ['bird_height taken from MOVEMENT', { ...ok, bird_height: MOVEMENT[2] }],
    ['bird_movement taken from DISTANCE', { ...ok, bird_movement: DISTANCE[0] }],
    ['next_pipe taken from HEIGHT', { ...ok, next_pipe: HEIGHT[3] }],
    ['height and movement swapped', { bird_height: bird_movement, bird_movement: bird_height, next_pipe }],
    ['right phrase in capitals', { ...ok, bird_movement: bird_movement.toUpperCase() }],
    ['right phrase with a trailing space', { ...ok, next_pipe: `${next_pipe} ` }],
    ['an empty string', { ...ok, bird_height: '' }],
    ['only the start of a phrase', { ...ok, bird_height: 'inside the gap' }],
    ['an unlisted phrase', { ...ok, bird_movement: 'gliding' }],
  ];
  const bad = tableMismatches(rejects.map(([note, value]) => [value, false, note]), (value) => isSituation(value));
  assert.deepEqual(bad, []);
});

// =============================================================================
// 4. buildRequest
// =============================================================================
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

test('buildRequest: exactly the contract shape, for every situation', () => {
  for (const situation of allSituations()) {
    const request = buildRequest(situation);
    const label = JSON.stringify(situation);
    assert.deepEqual(Object.keys(request).sort(), ['model', 'questions', 'state'], label);
    assert.equal(request.model, JEV_MODEL, label);

    // state = rules + the situation, spread flat; nothing else reaches the model
    assert.deepEqual(Object.keys(request.state).sort(), ['bird_height', 'bird_movement', 'next_pipe', 'rules'], label);
    assert.ok(isText(request.state.rules), `${label}: state.rules must be a non-empty string`);
    assert.equal(request.state.bird_height, situation.bird_height, label);
    assert.equal(request.state.bird_movement, situation.bird_movement, label);
    assert.equal(request.state.next_pipe, situation.next_pipe, label);

    // one question, `flap`, of type 'noul'
    assert.deepEqual(Object.keys(request.questions), ['flap'], label);
    const { flap } = request.questions;
    assert.deepEqual(Object.keys(flap).sort(), ['criteria', 'instructions', 'type'], label);
    assert.equal(flap.type, 'noul', label);
    assert.ok(isText(flap.instructions), `${label}: instructions must be a non-empty string`);
    assert.deepEqual(Object.keys(flap.criteria).sort(), ['false', 'true'], label);
    assert.ok(isText(flap.criteria.true), `${label}: criteria.true must be a non-empty string`);
    assert.ok(isText(flap.criteria.false), `${label}: criteria.false must be a non-empty string`);
  }
});

test('buildRequest: plain JSON, leaves its input alone, same answer for the same input', () => {
  const situation = { bird_height: HEIGHT[5], bird_movement: MOVEMENT[4], next_pipe: DISTANCE[2] };
  const copy = structuredClone(situation);
  const request = buildRequest(situation);
  assert.deepEqual(situation, copy, 'the situation passed in must not be changed (no `rules` added to it)');
  assert.notEqual(request.state, situation, 'state must be a new object');
  assert.deepEqual(JSON.parse(JSON.stringify(request)), request, 'the request must survive JSON unchanged');
  assert.deepEqual(buildRequest(situation), request);
});

test('buildRequest: the criteria for true and for false are different sentences', () => {
  const request = buildRequest({ bird_height: HEIGHT[3], bird_movement: MOVEMENT[2], next_pipe: DISTANCE[0] });
  assert.notEqual(request.questions.flap.criteria.true.trim(), request.questions.flap.criteria.false.trim());
});

test('buildRequest: carries what describe says about a live game', () => {
  const s = createGame(3);
  advance(s, DECISION_STEP_MS, true); // vy -280 -> rising fast; pipe at 445 -> far ahead
  const situation = describe(s);
  const { rules, ...rest } = buildRequest(situation).state;
  assert.ok(isText(rules));
  assert.deepEqual(rest, situation);
  assert.equal(rest.bird_movement, MOVEMENT[0]);
  assert.equal(rest.next_pipe, DISTANCE[0]);
  assert.equal(isSituation(rest), true);
});

// =============================================================================
// 5. readAnswer
// =============================================================================
const body = (noul) => ({ answers: { flap: { noul } } });

test('readAnswer: returns the probability untouched when it is a finite number in [0, 1]', () => {
  for (const p of [0, 1, 0.5, FLAP_THRESHOLD, 0.0001, 0.9999, 0.123456789, Number.MIN_VALUE, 1 - Number.EPSILON]) {
    assert.equal(readAnswer(body(p)), p, `noul ${p}`);
  }
  // other fields in the response are ignored
  const full = { id: 'r1', model: JEV_MODEL, answers: { flap: { noul: 0.73, note: 'x' }, other: { noul: 0.1 } }, usage: { ms: 97 } };
  assert.equal(readAnswer(full), 0.73);
  assert.equal(readAnswer(JSON.parse(JSON.stringify(full))), 0.73);
});

test('readAnswer: throws an Error for every malformed or out-of-range body', () => {
  const rejects = [
    ['null body', null],
    ['undefined body', undefined],
    ['empty object', {}],
    ['body still JSON text', JSON.stringify(body(0.5))],
    ['body a bare number', 0.5],
    ['body an array', [body(0.5)]],
    ['answers null', { answers: null }],
    ['answers missing flap', { answers: {} }],
    ['answer under another question', { answers: { jump: { noul: 0.5 } } }],
    ['flap null', { answers: { flap: null } }],
    ['flap a bare number', { answers: { flap: 0.5 } }],
    ['flap without noul', { answers: { flap: {} } }],
    ['probability under another key', { answers: { flap: { value: 0.5 } } }],
    ['noul at the top level', { noul: 0.5 }],
    ['flap at the top level', { flap: { noul: 0.5 } }],
    ['noul a numeric string', body('0.7')],
    ['noul NaN', body(Number.NaN)],
    ['noul -0.1', body(-0.1)],
    ['noul 1.5', body(1.5)],
    ['noul just above 1', body(1 + 1e-9)],
    ['noul just below 0', body(-1e-9)],
    ['noul Infinity', body(Number.POSITIVE_INFINITY)],
    ['noul -Infinity', body(Number.NEGATIVE_INFINITY)],
    ['noul null', body(null)],
    ['noul true', body(true)],
    ['noul false', body(false)],
    ['noul an array', body([0.5])],
    ['noul an object', body({ value: 0.5 })],
    ['noul a percentage', body(73)],
  ];
  for (const [note, value] of rejects) {
    assert.throws(() => readAnswer(value), Error, `readAnswer should throw for: ${note}`);
  }
});

// =============================================================================
// 6. Negative control
// =============================================================================
test('negative control: the table checker reports a deliberately wrong expectation, and only that one', () => {
  // The classifier here is the test's own restatement of the bands, so this
  // control does not depend on pilot.js behaving.
  const classify = (offset) => HEIGHT[heightIndex(offset)];
  const right = [
    [-HEIGHT_EDGE - 0.01, HEIGHT[0], 'a hair above the gap'],
    [-HEIGHT_EDGE, HEIGHT[1], 'on the top edge'],
    [HEIGHT_EDGE, HEIGHT[5], 'on the bottom edge'],
    [HEIGHT_EDGE + 0.01, HEIGHT[6], 'a hair below the gap'],
  ];
  assert.deepEqual(tableMismatches(right, classify), []);

  const wrong = [...right, [HEIGHT_EDGE, HEIGHT[6], 'WRONG ON PURPOSE: the bottom edge is still inside']];
  const bad = tableMismatches(wrong, classify);
  assert.equal(bad.length, 1);
  assert.match(bad[0], /WRONG ON PURPOSE/);

  // a classifier that throws is reported, not swallowed
  assert.equal(tableMismatches(right, () => { throw new TypeError('boom'); }).length, right.length);
  // and assert.deepEqual on a non-empty report does fail
  assert.throws(() => assert.deepEqual(bad, []), assert.AssertionError);
  // the restated bands themselves: boundary values, both sides, by hand
  assert.deepEqual([-78.01, -78, -35.01, -35, -10.01, -10, 10, 10.01, 35, 35.01, 78, 78.01].map(heightIndex), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
  assert.deepEqual([-200.01, -200, -50.01, -50, 50, 50.01, 250, 250.01].map(movementIndex), [0, 1, 1, 2, 2, 3, 3, 4]);
  assert.deepEqual([150.01, 150, 60.01, 60, 0.01, 0, -0.01].map(distanceIndex), [0, 1, 1, 2, 2, 3, 3]);
});
