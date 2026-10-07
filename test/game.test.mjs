// =============================================================================
// Contract tests for game.js: createGame, advance, nextPipe.
//
// Written BEFORE game.js existed. Every expected number was worked out by hand
// from the written contract and the values in constants.js; none was obtained
// by running an implementation. The arithmetic sits next to each expectation.
//
//   node --test "test/*.test.mjs"
//
// -----------------------------------------------------------------------------
// FAILURE MODES THIS FILE GUARDS AGAINST (written first; the tests follow it)
// -----------------------------------------------------------------------------
// Physics
//  F01 A flap ADDS to the speed instead of setting it.
//  F02 A flap is applied on every substep, or after the first substep, or to a
//      dead bird.
//  F03 Position is moved with the OLD speed (explicit Euler), not the new one.
//  F04 dt taken in ms, or the whole call simulated as one big step.
//  F05 Fall-speed cap missing, off by one substep, or applied after the
//      position update.
//  F06 Ceiling: kills the bird, keeps the upward speed, clamps at 0 instead of
//      BIRD_R, or treats "touching" as "through" (<= where < is meant).
// Time
//  F07 Wrong number of substeps; t advanced by the full ms although the bird
//      died part-way; t advanced on a dead state.
// Death
//  F08 Ground: > where >= is meant, bird centre instead of bottom edge, wrong
//      cause, or the bird's position altered on death.
//  F09 Ground and pipe hit on the same substep reported as 'pipe'.
//  F10 Pipe overlap measured from the bird's centre, with <= / >= at the faces,
//      or ignoring PIPE_W (front or back face off by a substep).
//  F11 Gap edges: touching counted as a hit, GAP_H used where GAP_H / 2 is
//      meant, BIRD_R forgotten, top and bottom swapped.
//  F12 Death checked before the pipes move, or only at the end of the call
//      (a substep late, or tunnelling through a pipe).
//  F13 The simulation carries on after death inside the same call (bird, pipes,
//      t or score keep changing).
//  F14 A dead state still changes on later calls (t ticks, a flap changes vy,
//      the bird revives).
// Pipes
//  F15 Pipes move per call instead of per substep, or by the wrong amount.
//  F16 Removal at the wrong edge (x < 0 pops a visible pipe; <= removes a
//      substep early).
//  F17 Spawn at the wrong moment or place (at WORLD_W instead of
//      last.x + PIPE_SPACING, <= WORLD_W, `if` where `while` is needed), so the
//      spacing drifts.
//  F18 Spawned gapY outside [GAP_MIN_Y, GAP_MAX_Y] or not an integer; spawned
//      pipe not passed:false.
// Scoring
//  F19 Score ticks a substep early or late (<= where < is meant, pipe centre or
//      left edge, bird centre).
//  F20 A pipe is counted twice, or counted on the substep the bird dies.
//  F21 Score recomputed from the pipes on screen (drops when a pipe is removed,
//      or resets a large score).
//  F22 nextPipe returns pipes[0] regardless of `passed`, or a copy instead of
//      the pipe object in the state.
// State and determinism
//  F23 Hidden state outside `state` (module-level generator, Math.random,
//      cached arrays): clones diverge, two games interfere with each other.
//  F24 State is not plain JSON data (class instances, undefined, NaN): a JSON
//      round trip changes it.
//  F25 advance returns a new object instead of mutating; createGame hands out
//      shared objects.
//  F26 One 100 ms call differs from ten 10 ms calls.
//  F27 Seed ignored, default seed is not 1, rng is not an unsigned 32-bit
//      integer, generator stuck on one value.
// The suite itself
//  F28 The comparison helpers or the chaos harness cannot fail (negative
//      controls at the bottom of the file).
//
// -----------------------------------------------------------------------------
// ASSUMPTIONS WHERE THE CONTRACT IS SILENT (each is asserted somewhere below)
// -----------------------------------------------------------------------------
//  A1 advance() on a dead state returns that same state object.
//  A2 On the fatal substep, steps 1-6 have already happened: t includes that
//     substep, the pipes have moved, and bird.y is left where it landed (550.5
//     in a free fall, not snapped back to 548).
//  A3 rng is an unsigned 32-bit integer for ANY non-negative integer seed,
//     including 0 and a Date.now()-sized one, and no seed (0 included) leaves
//     the generator stuck on one gap position.
//  A4 A fresh state and its pipes have exactly the listed keys, nothing extra.
// Not tested, because the contract does not define them: an empty pipes array,
// nextPipe when every pipe is passed (neither can happen in play: after any
// substep the last pipe is at x >= WORLD_W), negative or fractional seeds, and
// ms that is not a positive multiple of SUBSTEP_MS.
//
// -----------------------------------------------------------------------------
// HAND-DERIVATION CHEAT SHEET (actual values from constants.js)
// -----------------------------------------------------------------------------
//   dt             = SUBSTEP_MS / 1000 = 10 / 1000   = 0.01 s
//   gravity / step = GRAVITY * dt      = 1400 * 0.01 = 14 px/s per substep
//   pipe / step    = PIPE_SPEED * dt   = 150 * 0.01  = 1.5 px per substep
//   bird hitbox    : back 88, front 112   (BIRD_X -/+ BIRD_R = 100 -/+ 12)
//   a pipe overlaps the bird while  24 < pipe.x < 112   (x < 112 and x + 64 > 88)
//   a pipe is scored once           pipe.x < 24         (x + 64 < 88)
//   a pipe is removed once          pipe.x < -64        (x + 64 < 0)
//   a pipe is spawned once          last.x < 360        (at last.x + 220)
//   the bird fits the gap while     gapY - 78 <= y <= gapY + 78   (90 - 12)
//   the bird dies on the ground at  y >= 548            (y + 12 >= 560)
//   the ceiling clamp bites at      y < 12
//
//   k substeps after the speed was v0 at height y0 (no cap, no ceiling):
//     vy_k = v0 + 14k
//     y_k  = y0 + 0.01 * sum_{i=1..k}(v0 + 14i) = y0 + 0.01*k*v0 + 0.07*k*(k+1)
//   (speed is updated first; position then uses the NEW speed)
//
//   In a fresh game pipe number n (0, 1, 2, ...) is at  x = 460 + 220n - 1.5k
//   after k substeps, for as long as it exists.
// =============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORLD_W, GROUND_Y, BIRD_X, BIRD_R, BIRD_START_Y,
  GRAVITY, FLAP_VY, MAX_FALL_VY, SUBSTEP_MS,
  PIPE_SPEED, PIPE_W, GAP_H, PIPE_SPACING, FIRST_PIPE_X, GAP_MIN_Y, GAP_MAX_Y,
  DECISION_STEP_MS,
} from '../constants.js';
import { createGame, advance, nextPipe } from '../game.js';

// -----------------------------------------------------------------------------
// Derived quantities (from constants, never retyped) and helpers
// -----------------------------------------------------------------------------
const EPS = 1e-9; // tolerance for every float comparison in this file
const TICK = SUBSTEP_MS; // 10 ms: one substep
const STEP = DECISION_STEP_MS; // 100 ms: one decision
const DT = SUBSTEP_MS / 1000; // 0.01 s
const FALL_STEP = GRAVITY * DT; // 14 px/s gained per substep
const PIPE_STEP = PIPE_SPEED * DT; // 1.5 px per substep
const BIRD_FRONT = BIRD_X + BIRD_R; // 112
const BIRD_BACK = BIRD_X - BIRD_R; // 88
const CLEAR_X = BIRD_BACK - PIPE_W; // 24: pipe.x when its right edge touches the bird's back
const FIT = GAP_H / 2 - BIRD_R; // 78: how far the bird's centre may be from the gap's centre
const GROUND_CONTACT_Y = GROUND_Y - BIRD_R; // 548
const MID_GAP = Math.round((GAP_MIN_Y + GAP_MAX_Y) / 2); // 285
const UINT32_MAX = 0xffffffff;

// A bird given this speed does not move during the next single substep:
// vy becomes -14 + 14 = 0, so y += 0 * 0.01. It lets a test park the bird on
// an exact y (an integer, exact in floating point) and ask one question about it.
const STILL_VY = -FALL_STEP;

const GAME = { createGame, advance };

function assertNear(actual, expected, label = 'value') {
  assert.equal(typeof actual, 'number', `${label}: expected a number near ${expected}, got ${typeof actual} ${String(actual)}`);
  assert.ok(Math.abs(actual - expected) <= EPS, `${label}: expected ${expected} (within ${EPS}), got ${actual}`);
}

function assertXs(s, xs, label = 'pipes') {
  const got = s.pipes.map((p) => p.x);
  assert.equal(got.length, xs.length, `${label}: expected ${xs.length} pipes at x = [${xs.join(', ')}], got [${got.join(', ')}]`);
  xs.forEach((x, i) => assertNear(got[i], x, `${label}: pipes[${i}].x`));
}

// Checks only the fields named in `want`.
function expectState(s, want, label) {
  if ('t' in want) assert.equal(s.t, want.t, `${label}: t`);
  if ('y' in want) assertNear(s.bird.y, want.y, `${label}: bird.y`);
  if ('vy' in want) assertNear(s.bird.vy, want.vy, `${label}: bird.vy`);
  if ('alive' in want) assert.equal(s.alive, want.alive, `${label}: alive`);
  if ('cause' in want) assert.equal(s.cause, want.cause, `${label}: cause`);
  if ('score' in want) assert.equal(s.score, want.score, `${label}: score`);
  if ('xs' in want) assertXs(s, want.xs, label);
  if ('passed' in want) assert.deepEqual(s.pipes.map((p) => p.passed), want.passed, `${label}: passed flags`);
}

function assertValidGap(gapY, label) {
  assert.ok(
    Number.isInteger(gapY) && gapY >= GAP_MIN_Y && gapY <= GAP_MAX_Y,
    `${label}: gapY must be an integer in [${GAP_MIN_Y}, ${GAP_MAX_Y}], got ${gapY}`,
  );
}

function assertUint32(rng, label) {
  assert.ok(Number.isInteger(rng) && rng >= 0 && rng <= UINT32_MAX, `${label}: rng must be an unsigned 32-bit integer, got ${rng}`);
}

// A fresh game with the bird and the pipes placed by hand. State is plain
// mutable data, so overwriting it is within the contract; starting from
// createGame keeps state.rng whatever the implementation wants it to be.
function world({ y = BIRD_START_Y, vy = 0, pipes = null, score = 0 } = {}, impl = GAME) {
  const s = impl.createGame(1);
  s.bird.y = y;
  s.bird.vy = vy;
  s.score = score;
  if (pipes) s.pipes = pipes.map((p) => ({ x: p.x, gapY: p.gapY, passed: p.passed ?? false }));
  return s;
}

// "Cruise": before every substep the bird is put back on the centre of the next
// gap with zero speed, so it survives whatever gaps the generator picks (it then
// moves 0.14 px). Used only by tests about pipes, score, time and the generator,
// never by tests about the bird's own motion.
function cruise(s, substeps, afterEach = null) {
  for (let i = 0; i < substeps; i += 1) {
    const target = s.pipes.find((p) => p.passed === false);
    s.bird.y = target.gapY;
    s.bird.vy = 0;
    advance(s, TICK);
    assert.equal(s.alive, true, `cruise: the bird sat on the gap centre yet died (${s.cause}) at t=${s.t}`);
    if (afterEach) afterEach(s);
  }
}

// -----------------------------------------------------------------------------
// Tripwire
// -----------------------------------------------------------------------------
test('tripwire: the hand-derived numbers below were computed for these constants', () => {
  // The only place numbers from constants.js are repeated. If this fails, the
  // game was retuned and every literal expectation in this file must be
  // re-derived by hand (not copied from a run).
  assert.deepEqual(
    {
      WORLD_W, GROUND_Y, BIRD_X, BIRD_R, BIRD_START_Y, GRAVITY, FLAP_VY, MAX_FALL_VY, SUBSTEP_MS,
      PIPE_SPEED, PIPE_W, GAP_H, PIPE_SPACING, FIRST_PIPE_X, GAP_MIN_Y, GAP_MAX_Y, DECISION_STEP_MS,
    },
    {
      WORLD_W: 360, GROUND_Y: 560, BIRD_X: 100, BIRD_R: 12, BIRD_START_Y: 280, GRAVITY: 1400, FLAP_VY: -420, MAX_FALL_VY: 480, SUBSTEP_MS: 10,
      PIPE_SPEED: 150, PIPE_W: 64, GAP_H: 180, PIPE_SPACING: 220, FIRST_PIPE_X: 460, GAP_MIN_Y: 170, GAP_MAX_Y: 400, DECISION_STEP_MS: 100,
    },
  );
});

// =============================================================================
// 1. createGame
// =============================================================================
test('createGame: a fresh state has exactly the contract shape and values', () => {
  const s = createGame(1);
  assert.deepEqual(Object.keys(s).sort(), ['alive', 'bird', 'cause', 'pipes', 'rng', 'score', 't']);
  assert.equal(s.t, 0);
  assert.deepEqual(s.bird, { y: BIRD_START_Y, vy: 0 });
  assert.ok(Array.isArray(s.pipes), 'pipes must be an array');
  assert.equal(s.pipes.length, 1);
  assert.deepEqual(Object.keys(s.pipes[0]).sort(), ['gapY', 'passed', 'x']);
  assert.equal(s.pipes[0].x, FIRST_PIPE_X);
  assert.equal(s.pipes[0].passed, false);
  assertValidGap(s.pipes[0].gapY, 'first pipe');
  assert.equal(s.score, 0);
  assert.equal(s.alive, true);
  assert.equal(s.cause, null);
  assertUint32(s.rng, 'fresh state');
});

test('createGame: the default seed is 1, and the same seed gives the same game', () => {
  assert.deepEqual(createGame(), createGame(1));
  assert.deepEqual(createGame(77), createGame(77));
});

test('createGame: every call returns its own objects (no sharing between games)', () => {
  const a = createGame(5);
  const b = createGame(5);
  assert.notEqual(a, b);
  assert.notEqual(a.bird, b.bird);
  assert.notEqual(a.pipes, b.pipes);
  assert.notEqual(a.pipes[0], b.pipes[0]);
  a.bird.y = -999;
  a.pipes[0].x = -999;
  a.pipes.push({ x: 1, gapY: MID_GAP, passed: true });
  a.score = 41;
  assert.deepEqual(b, createGame(5), 'changing one game must not change another, nor later games');
});

test('createGame: any seed gives an in-range integer gap and an unsigned 32-bit rng', () => {
  // 0, the 32-bit edges, and a Date.now()-sized seed are all things a caller
  // could plausibly pass; the declared shape of the state has to hold for each.
  const seeds = [0, 2 ** 31 - 1, 2 ** 31, 2 ** 32 - 1, 1_790_000_000_000];
  for (let seed = 1; seed <= 300; seed += 1) seeds.push(seed);
  for (const seed of seeds) {
    const s = createGame(seed);
    assertValidGap(s.pipes[0].gapY, `seed ${seed}`);
    assertUint32(s.rng, `seed ${seed}`);
    assert.equal(s.pipes[0].x, FIRST_PIPE_X, `seed ${seed}: first pipe x`);
    assert.deepEqual(s.bird, { y: BIRD_START_Y, vy: 0 }, `seed ${seed}: bird`);
  }
});

test('createGame: the state is plain JSON data', () => {
  const s = createGame(9);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.deepEqual(structuredClone(s), s);
});

// =============================================================================
// 2. advance: the bird's motion (hand-computed)
// =============================================================================
test('advance: mutates the state it is given and returns that same object', () => {
  const s = createGame(1);
  assert.equal(advance(s, TICK), s);
  assert.equal(advance(s, STEP, true), s);
  assert.equal(s.t, TICK + STEP);
});

test('advance: one substep of free fall updates speed first, then position', () => {
  const s = createGame(1);
  advance(s, TICK);
  // vy = 0 + 1400*0.01 = 14;  y = 280 + 14*0.01 = 280.14 (explicit Euler would leave y at 280)
  // pipe = 460 - 150*0.01 = 458.5;  t = 10
  expectState(s, { t: 10, vy: 14, y: 280.14, alive: true, cause: null, score: 0, xs: [458.5] }, 'one substep');
});

test('advance: flap defaults to false; 100 ms of free fall', () => {
  const s = createGame(1);
  advance(s, STEP);
  // vy = 14*10 = 140;  y = 280 + 0.07*10*11 = 287.7;  pipe = 460 - 15 = 445
  expectState(s, { t: 100, vy: 140, y: 287.7, alive: true, score: 0, xs: [445] }, '100 ms of free fall');
});

test('advance: one flap then 100 ms gives y = 245.7 and vy = -280', () => {
  const s = createGame(1);
  advance(s, STEP, true);
  // flap: vy = -420 (set once, before the first substep)
  // 10 substeps: vy = -420 + 14*10 = -280
  //              y  = 280 + 0.01*10*(-420) + 0.07*10*11 = 280 - 42 + 7.7 = 245.7
  // pipe: 460 - 1.5*10 = 445 (still >= 360, so no second pipe yet)
  expectState(s, { t: 100, vy: -280, y: 245.7, alive: true, cause: null, score: 0, xs: [445], passed: [false] }, 'flap + 100 ms');
});

function arcScenario(impl = GAME) {
  // Flap on the first step only. After k substeps:
  //   vy = -420 + 14k        y = 280 - 4.2k + 0.07k(k+1)
  //   k=10: vy=-280  y = 280 -  42 +   7.7 = 245.7
  //   k=20: vy=-140  y = 280 -  84 +  29.4 = 225.4
  //   k=30: vy=   0  y = 280 - 126 +  65.1 = 219.1   (the top of the arc)
  //   k=40: vy= 140  y = 280 - 168 + 114.8 = 226.8
  //   k=50: vy= 280  y = 280 - 210 + 178.5 = 248.5
  //   k=60: vy= 420  y = 280 - 252 + 256.2 = 284.2   (420 < 480: never capped)
  // pipe: 460 - 15 per step = 445, 430, 415, 400, 385, 370 (>= 360: no spawn)
  const arc = [
    { vy: -280, y: 245.7, x: 445 },
    { vy: -140, y: 225.4, x: 430 },
    { vy: 0, y: 219.1, x: 415 },
    { vy: 140, y: 226.8, x: 400 },
    { vy: 280, y: 248.5, x: 385 },
    { vy: 420, y: 284.2, x: 370 },
  ];
  const s = impl.createGame(1);
  arc.forEach((want, i) => {
    impl.advance(s, STEP, i === 0);
    expectState(
      s,
      { t: (i + 1) * 100, vy: want.vy, y: want.y, alive: true, cause: null, score: 0, xs: [want.x] },
      `arc, after step ${i + 1}`,
    );
  });
}

test('advance: the full arc of one flap over six 100 ms steps', () => arcScenario());

test('advance: a flap lifts the bird 60.9 px and the top lasts two substeps', () => {
  const s = createGame(1);
  advance(s, TICK, true);
  for (let k = 2; k <= 28; k += 1) advance(s, TICK);
  // k=28: vy = -420 + 392 = -28;  y = 280 - 117.6 + 0.07*28*29 = 280 - 117.6 + 56.84 = 219.24
  expectState(s, { t: 280, vy: -28, y: 219.24 }, 'substep 28');
  advance(s, TICK);
  // k=29: vy = -14;  y = 219.24 - 0.14 = 219.1   (280 - 219.1 = 60.9 px of lift)
  expectState(s, { t: 290, vy: -14, y: 219.1 }, 'substep 29');
  advance(s, TICK);
  // k=30: vy = 0;  y unchanged
  expectState(s, { t: 300, vy: 0, y: 219.1 }, 'substep 30');
  advance(s, TICK);
  // k=31: vy = 14;  y = 219.1 + 0.14 = 219.24
  expectState(s, { t: 310, vy: 14, y: 219.24 }, 'substep 31');
});

test('advance: a flap SETS the speed when the bird is already rising', () => {
  const s = createGame(1);
  advance(s, STEP, true); // y 245.7, vy -280
  advance(s, STEP, true);
  // set to -420 again (adding would give -700): vy = -420 + 140 = -280
  // y = 245.7 - 42 + 7.7 = 211.4   (adding would give 245.7 - 70 + 7.7 = 183.4)
  expectState(s, { t: 200, vy: -280, y: 211.4, alive: true }, 'second flap in a row');
});

test('advance: a flap SETS the speed when the bird is falling at the cap', () => {
  const s = createGame(1);
  for (let i = 0; i < 4; i += 1) advance(s, STEP);
  // free fall: capped at 480 from substep 35 (y 368.1), so k=40: y = 368.1 + 4.8*5 = 392.1
  expectState(s, { t: 400, vy: 480, y: 392.1 }, 'falling at the cap');
  advance(s, STEP, true);
  // vy = -420 + 140 = -280;  y = 392.1 - 42 + 7.7 = 357.8
  expectState(s, { t: 500, vy: -280, y: 357.8, alive: true }, 'flap out of a capped fall');
});

test('advance: a flap is applied once per call, not once per substep', () => {
  const held = createGame(1);
  for (let i = 0; i < 10; i += 1) advance(held, TICK, true);
  // ten separate 10 ms calls, each with its own flap: vy = -420 + 14 = -406 every time,
  // y = 280 - 10*4.06 = 239.4
  expectState(held, { t: 100, vy: -406, y: 239.4 }, 'ten 10 ms calls, each flapping');

  const once = createGame(1);
  advance(once, STEP, true);
  expectState(once, { t: 100, vy: -280, y: 245.7 }, 'one 100 ms call with one flap');
});

test('advance: fall speed reaches the MAX_FALL_VY cap on the 35th substep', () => {
  const s = createGame(1);
  for (let k = 1; k <= 34; k += 1) advance(s, TICK);
  // k=34: vy = 14*34 = 476 (below 480);  y = 280 + 0.07*34*35 = 280 + 83.3 = 363.3
  expectState(s, { t: 340, vy: 476, y: 363.3 }, 'substep 34');
  advance(s, TICK);
  // k=35: vy = min(476 + 14, 480) = 480;  y = 363.3 + 4.8 = 368.1
  // (cap applied after the move would give 363.3 + 4.9 = 368.2)
  expectState(s, { t: 350, vy: 480, y: 368.1 }, 'substep 35');
  advance(s, TICK);
  expectState(s, { t: 360, vy: 480, y: 372.9 }, 'substep 36');
});

// =============================================================================
// 3. Ceiling
// =============================================================================
test('ceiling: the bird is clamped to BIRD_R with zero speed and does not die', () => {
  const s = world({ y: BIRD_R + 2, vy: 0 }); // y = 14
  advance(s, TICK, true);
  // vy = -420 + 14 = -406;  y = 14 - 4.06 = 9.94 < 12  ->  y = 12, vy = 0
  expectState(s, { t: 10, y: BIRD_R, vy: 0, alive: true, cause: null }, 'clamped');
  advance(s, TICK);
  // next substep falls from rest: vy = 14, y = 12.14
  expectState(s, { t: 20, y: 12.14, vy: 14, alive: true }, 'falling away from the ceiling');
});

test('ceiling: exactly touching (y == BIRD_R) is not a clamp, so the speed is kept', () => {
  const s = world({ y: BIRD_R + 1, vy: -100 - FALL_STEP }); // y = 13, vy = -114
  advance(s, TICK);
  // vy = -114 + 14 = -100;  y = 13 - 100*0.01 = 12 exactly;  12 < 12 is false -> no clamp
  expectState(s, { y: 12, vy: -100, alive: true }, 'touching the ceiling');
  advance(s, TICK);
  // vy = -86;  y = 12 - 0.86 = 11.14 < 12  ->  y = 12, vy = 0
  expectState(s, { y: 12, vy: 0, alive: true }, 'through the ceiling');
});

function ceilingScenario(impl = GAME) {
  // Flap on every 100 ms step of a fresh game. Each flap step that stays clear of
  // the ceiling moves the bird by -42 + 7.7 = -34.3 px and ends at vy = -280:
  //   245.7, 211.4, 177.1, 142.8, 108.5, 74.2, 39.9
  const s = impl.createGame(1);
  for (let i = 0; i < 7; i += 1) impl.advance(s, STEP, true);
  expectState(s, { t: 700, y: 39.9, vy: -280, alive: true }, 'after 7 flap steps');

  // Step 8, y_k = 39.9 - 4.2k + 0.07k(k+1):
  //   k=7: 39.9 - 29.4 + 3.92 = 14.42     k=8: 39.9 - 33.6 + 5.04 = 11.34 < 12 -> clamp (y 12, vy 0) at t=780
  //   k=9: vy 14, y 12.14                 k=10: vy 28, y 12.42
  impl.advance(s, STEP, true);
  expectState(s, { t: 800, y: 12.42, vy: 28, alive: true }, 'after step 8 (first clamp)');

  // Step 9: k=1: vy -406, y 12.42 - 4.06 = 8.36 -> clamp. Then 9 substeps from rest:
  //   vy = 14*9 = 126,  y = 12 + 0.07*9*10 = 18.3
  impl.advance(s, STEP, true);
  expectState(s, { t: 900, y: 18.3, vy: 126, alive: true }, 'after step 9');

  // Step 10: k=1: y 18.3 - 4.06 = 14.24;  k=2: vy -392, y 14.24 - 3.92 = 10.32 -> clamp.
  //   Then 8 substeps from rest: vy = 112, y = 12 + 0.07*8*9 = 17.04
  impl.advance(s, STEP, true);
  expectState(s, { t: 1000, y: 17.04, vy: 112, alive: true }, 'after step 10');

  // Step 11 on: k=1: 17.04 - 4.06 = 12.98 (clear);  k=2: 12.98 - 3.92 = 9.06 -> clamp;
  //   8 substeps from rest -> 17.04, 112 again. A fixed point.
  for (let i = 11; i <= 23; i += 1) {
    impl.advance(s, STEP, true);
    expectState(s, { t: i * 100, y: 17.04, vy: 112, alive: true, cause: null, score: 0 }, `after step ${i} (fixed point)`);
  }

  // The first pipe arrives whatever its gap is: the highest legal gap starts at
  // GAP_MIN_Y - GAP_H/2 = 80, and the bird's top is within 6.3 px of 0.
  //   pipe.x = 460 - 1.5k:  k=231 -> 113.5,  k=232 -> 112 (touching, no overlap),  k=233 -> 110.5 (overlap)
  //   pipe 1 spawned at k=67 at 579.5, pipe 2 at k=214 at 579  (x = 460 + 220n - 1.5k)
  impl.advance(s, TICK, true);
  expectState(s, { t: 2310, y: 12.98, vy: -406, alive: true, xs: [113.5, 333.5, 553.5] }, 'substep 231');
  impl.advance(s, TICK);
  expectState(s, { t: 2320, y: 12, vy: 0, alive: true, cause: null, xs: [112, 332, 552] }, 'substep 232: pipe touches the bird, clamp');
  impl.advance(s, TICK);
  expectState(
    s,
    { t: 2330, y: 12.14, vy: 14, alive: false, cause: 'pipe', score: 0, xs: [110.5, 330.5, 550.5], passed: [false, false, false] },
    'substep 233: first overlapping substep',
  );
}

test('ceiling: flapping on every step pins the bird to the ceiling until the first pipe kills it at t=2330', () => ceilingScenario());

// =============================================================================
// 4. Ground
// =============================================================================
function freeFallScenario(impl = GAME) {
  // No flap ever. Capped at 480 from substep 35 (y 368.1), then 4.8 px per substep:
  //   y_k = 368.1 + 4.8(k - 35)
  //   k=72: 368.1 + 177.6 = 545.7  -> bottom 557.7 <  560: alive
  //   k=73: 368.1 + 182.4 = 550.5  -> bottom 562.5 >= 560: dead, cause 'ground'
  // pipes: pipe 0 = 460 - 1.5k; pipe 1 spawned at k=67 (359.5 < 360) at 579.5
  //   k=72: 352, 572      k=73: 350.5, 570.5   (nowhere near the bird: 112)
  const s = impl.createGame(1);
  for (let k = 1; k <= 72; k += 1) impl.advance(s, TICK);
  expectState(s, { t: 720, y: 545.7, vy: 480, alive: true, cause: null, xs: [352, 572] }, 'substep 72');
  impl.advance(s, TICK);
  expectState(s, { t: 730, y: 550.5, vy: 480, alive: false, cause: 'ground', score: 0, xs: [350.5, 570.5] }, 'substep 73');

  // Dead means frozen: nothing at all changes, t included, flap or not.
  const frozen = structuredClone(s);
  impl.advance(s, TICK);
  impl.advance(s, STEP, true);
  impl.advance(s, STEP);
  assert.deepEqual(s, frozen, 'a dead state must not change');
}

test('ground: free fall dies on substep 73 (t=730, y=550.5) and stays frozen', () => freeFallScenario());

test('ground: death in the middle of a 100 ms call stops the clock at the fatal substep', () => {
  const s = createGame(1);
  for (let i = 0; i < 7; i += 1) advance(s, STEP);
  // k=70: y = 368.1 + 4.8*35 = 536.1
  expectState(s, { t: 700, y: 536.1, vy: 480, alive: true, xs: [355, 575] }, 'after 7 steps');
  assert.equal(advance(s, STEP), s);
  // the 8th call covers substeps 71..80 but the bird dies on 73: t is 730, not 800,
  // and the pipes stopped with it (350.5, not 460 - 120 = 340)
  expectState(s, { t: 730, y: 550.5, vy: 480, alive: false, cause: 'ground', xs: [350.5, 570.5] }, '8th step');
  const frozen = structuredClone(s);
  assert.equal(advance(s, STEP, true), s, 'advance on a dead state still returns that state');
  assert.deepEqual(s, frozen, 'a flap must not touch a dead bird');
});

test('ground: bottom edge exactly on GROUND_Y is dead; 0.01 px above is alive', () => {
  const touching = world({ y: GROUND_CONTACT_Y, vy: STILL_VY }); // 548 + 12 = 560 >= 560
  advance(touching, TICK);
  expectState(touching, { t: 10, y: GROUND_CONTACT_Y, vy: 0, alive: false, cause: 'ground' }, 'touching the ground');

  const above = world({ y: GROUND_CONTACT_Y - 0.01, vy: STILL_VY }); // 547.99 + 12 = 559.99 < 560
  advance(above, TICK);
  expectState(above, { t: 10, y: GROUND_CONTACT_Y - 0.01, alive: true, cause: null }, '0.01 px above the ground');
});

test('ground: checked before pipes, so hitting both on one substep reports "ground"', () => {
  // Pipe overlapping the bird (x 100 -> 98.5) whose gap ends at 170 + 90 = 260:
  // a bird on the ground (bottom 560) is far below it.
  const s = world({ y: GROUND_CONTACT_Y, vy: STILL_VY, pipes: [{ x: BIRD_X, gapY: GAP_MIN_Y }] });
  advance(s, TICK);
  expectState(s, { alive: false, cause: 'ground' }, 'ground and pipe together');
});

test('ground: a pipe that would have been passed on the fatal substep is not scored', () => {
  // pipe.x 24.75 -> 23.25 < 24 would score, but the bird dies first on this substep
  const s = world({ y: GROUND_CONTACT_Y, vy: STILL_VY, pipes: [{ x: CLEAR_X + PIPE_STEP / 2, gapY: GAP_MAX_Y }] });
  advance(s, TICK);
  expectState(s, { alive: false, cause: 'ground', score: 0 }, 'death substep');
  assert.equal(s.pipes[0].passed, false);
});

test('dead: a state marked dead by hand is left completely alone', () => {
  const s = createGame(1);
  s.alive = false;
  s.cause = 'pipe';
  const frozen = structuredClone(s);
  advance(s, STEP, true);
  advance(s, TICK);
  assert.deepEqual(s, frozen); // t still 0, vy still 0, pipe still at FIRST_PIPE_X
});

// =============================================================================
// 5. Pipe collision: exact boundaries on all four sides
// =============================================================================
test('pipe front face: one substep before contact alive, touching alive, first overlap dead', () => {
  // Bird 40 px above the top of where it would fit. Pipe: 113.5 -> 112 -> 110.5.
  const s = world({ y: MID_GAP - FIT - 40, pipes: [{ x: BIRD_FRONT + PIPE_STEP, gapY: MID_GAP }] });
  advance(s, TICK);
  // pipe.x = 112: 112 < 112 is false -> no overlap
  expectState(s, { t: 10, alive: true, cause: null }, 'pipe touching the front of the bird');
  assertNear(s.pipes[0].x, BIRD_FRONT, 'pipes[0].x');
  advance(s, TICK);
  // pipe.x = 110.5 < 112 and 174.5 > 88 -> overlap, and the bird is not in the gap
  expectState(s, { t: 20, alive: false, cause: 'pipe', score: 0 }, 'pipe overlapping the bird');
  assertNear(s.pipes[0].x, BIRD_FRONT - PIPE_STEP, 'pipes[0].x');
});

test('pipe back face: last overlapping substep dead; right edge exactly on the bird\'s back is clear but not yet scored', () => {
  const outside = MID_GAP + FIT + 40; // 40 px below where it would fit

  // pipe.x 27 -> 25.5: right edge 89.5 > 88 -> still overlapping -> dead
  const hit = world({ y: outside, vy: STILL_VY, pipes: [{ x: CLEAR_X + 2 * PIPE_STEP, gapY: MID_GAP }] });
  advance(hit, TICK);
  expectState(hit, { alive: false, cause: 'pipe', score: 0 }, 'pipe.x = 25.5');

  // pipe.x 25.5 -> 24: right edge 88 > 88 is false -> clear; 88 < 88 is false -> not scored either
  const clear = world({ y: outside, vy: STILL_VY, pipes: [{ x: CLEAR_X + PIPE_STEP, gapY: MID_GAP }] });
  advance(clear, TICK);
  expectState(clear, { alive: true, cause: null, score: 0, passed: [false, false, false] }, 'pipe.x = 24');
  assertNear(clear.pipes[0].x, CLEAR_X, 'pipes[0].x');
  assert.equal(nextPipe(clear), clear.pipes[0], 'a pipe at x = 24 is still the next pipe');

  // one more substep: pipe.x = 22.5, right edge 86.5 < 88 -> scored
  advance(clear, TICK);
  expectState(clear, { alive: true, score: 1 }, 'pipe.x = 22.5');
  assert.equal(clear.pipes[0].passed, true);
  assert.equal(nextPipe(clear), clear.pipes[1]);
});

test('pipe top edge: bird top exactly on the gap top is alive; 0.01 px higher is dead', () => {
  for (const gapY of [GAP_MIN_Y, MID_GAP, GAP_MAX_Y]) {
    const edge = gapY - FIT; // bird.y - 12 == gapY - 90, e.g. 285 - 78 = 207
    for (const [y, alive] of [[edge + 0.01, true], [edge, true], [edge - 0.01, false]]) {
      const s = world({ y, vy: STILL_VY, pipes: [{ x: BIRD_X, gapY }] }); // pipe 100 -> 98.5: overlapping
      advance(s, TICK);
      expectState(s, { t: 10, y, alive, cause: alive ? null : 'pipe', score: 0 }, `gapY ${gapY}, bird.y ${y}`);
    }
  }
});

test('pipe bottom edge: bird bottom exactly on the gap bottom is alive; 0.01 px lower is dead', () => {
  for (const gapY of [GAP_MIN_Y, MID_GAP, GAP_MAX_Y]) {
    const edge = gapY + FIT; // bird.y + 12 == gapY + 90, e.g. 285 + 78 = 363 (at most 478 < 548: no ground)
    for (const [y, alive] of [[edge - 0.01, true], [edge, true], [edge + 0.01, false]]) {
      const s = world({ y, vy: STILL_VY, pipes: [{ x: BIRD_X, gapY }] });
      advance(s, TICK);
      expectState(s, { t: 10, y, alive, cause: alive ? null : 'pipe', score: 0 }, `gapY ${gapY}, bird.y ${y}`);
    }
  }
});

test('pipe collision spans the whole pipe, hitbox edge to hitbox edge, and only there', () => {
  // After the move the pipe overlaps the bird for 24 < pipe.x < 112.
  const rows = [
    // [pipe.x after the substep, alive when 0.01 px outside the gap]
    [BIRD_FRONT + PIPE_SPACING, true], // 332: the following pipe, far ahead
    [BIRD_FRONT + 0.01, true], // 112.01: not there yet
    [BIRD_FRONT, true], // 112: touching
    [BIRD_FRONT - 0.01, false], // 111.99
    [BIRD_X, false], // 100
    [BIRD_BACK, false], // 88: pipe's left edge on the bird's back, right edge at 152
    [BIRD_X - PIPE_W, false], // 36: pipe's right edge on the bird's centre
    [CLEAR_X + 0.01, false], // 24.01: right edge at 88.01
    [CLEAR_X, true], // 24: right edge touching the bird's back
    [CLEAR_X - 0.01, true], // 23.99: gone
    [-PIPE_W + 1, true], // -63: almost off screen
  ];
  for (const [xAfter, aliveOutside] of rows) {
    for (const [y, side] of [[MID_GAP - FIT - 0.01, 'above'], [MID_GAP + FIT + 0.01, 'below']]) {
      const s = world({ y, vy: STILL_VY, pipes: [{ x: xAfter + PIPE_STEP, gapY: MID_GAP }] });
      advance(s, TICK);
      expectState(s, { alive: aliveOutside, cause: aliveOutside ? null : 'pipe' }, `pipe.x ${xAfter}, bird 0.01 px ${side} the gap`);
    }
    // a bird inside the gap survives every position of the pipe
    for (const y of [MID_GAP - FIT, MID_GAP, MID_GAP + FIT]) {
      const s = world({ y, vy: STILL_VY, pipes: [{ x: xAfter + PIPE_STEP, gapY: MID_GAP }] });
      advance(s, TICK);
      expectState(s, { alive: true, cause: null }, `pipe.x ${xAfter}, bird at ${y} inside the gap`);
    }
  }
});

// =============================================================================
// 6. Scoring and nextPipe
// =============================================================================
test('score: ticks only when the pipe\'s right edge is strictly behind the bird\'s back', () => {
  for (const [xAfter, score] of [[CLEAR_X + 0.01, 0], [CLEAR_X, 0], [CLEAR_X - 0.01, 1]]) {
    const s = world({ y: MID_GAP, vy: STILL_VY, pipes: [{ x: xAfter + PIPE_STEP, gapY: MID_GAP }] });
    advance(s, TICK);
    expectState(s, { alive: true, score }, `pipe.x ${xAfter}`);
    assert.equal(s.pipes[0].passed, score === 1, `pipe.x ${xAfter}: passed flag`);
  }
});

function cleanPassScenario(impl = GAME) {
  // First pipe where a fresh game puts it (x 460), gap centred on 260: the bird
  // fits while 182 <= y <= 338. Flap on steps 1, 7, 13, 19, 25 (every 600 ms).
  // One 60-substep cycle from vy -420 ends 4.2 px lower at vy +420 (never capped),
  // dipping to (start - 60.9) at its top, so:
  //   cycle starts (k = 0, 60, 120, 180, 240):  280, 284.2, 288.4, 292.6, 296.8
  //   overall range up to k=291: 219.1 .. 296.8  -> inside 182..338 throughout
  // pipe.x = 460 - 1.5k: overlaps the bird for k = 233..290 (110.5 .. 25), and
  //   k=290: 25   (right edge 89 > 88: still overlapping, not scored)
  //   k=291: 23.5 (right edge 87.5 < 88: scored)
  // bird in cycle 5 (j = k - 240): y = 296.8 - 4.2j + 0.07j(j+1), vy = -420 + 14j
  //   j=50: 296.8 - 210 + 178.5 = 265.3, vy 280      j=51: 265.3 + 2.94 = 268.24, vy 294
  //   j=60: 296.8 + 4.2 = 301, vy 420
  // other pipes: n=1 at 680 - 1.5k, n=2 at 900 - 1.5k
  const s = world({ pipes: [{ x: FIRST_PIPE_X, gapY: 260 }] }, impl);
  const cycleEnds = { 6: 284.2, 12: 288.4, 18: 292.6, 24: 296.8 };
  for (let step = 1; step <= 29; step += 1) {
    impl.advance(s, STEP, (step - 1) % 6 === 0);
    expectState(s, { t: step * 100, alive: true, cause: null, score: 0 }, `clean pass, step ${step}`);
    if (step in cycleEnds) expectState(s, { y: cycleEnds[step], vy: 420 }, `clean pass, end of cycle at step ${step}`);
  }
  expectState(s, { t: 2900, y: 265.3, vy: 280, score: 0, xs: [25, 245, 465], passed: [false, false, false] }, 'substep 290');
  impl.advance(s, TICK);
  expectState(s, { t: 2910, y: 268.24, vy: 294, alive: true, score: 1, xs: [23.5, 243.5, 463.5], passed: [true, false, false] }, 'substep 291');
  // The passed pipe stays on screen for a while; it must not be counted again.
  for (let k = 292; k <= 300; k += 1) {
    impl.advance(s, TICK);
    expectState(s, { alive: true, score: 1 }, `substep ${k}`);
  }
  expectState(s, { t: 3000, y: 301, vy: 420, score: 1, xs: [10, 230, 450], passed: [true, false, false] }, 'substep 300');
  return s;
}

test('score: a bird flying cleanly through a gap scores on substep 291 exactly, once', () => {
  const s = cleanPassScenario();
  assert.equal(nextPipe(s), s.pipes[1], 'after scoring, the next pipe is the second one although the first is still on screen');
});

test('score: adds one to whatever the score already is', () => {
  const s = world({ y: MID_GAP, vy: STILL_VY, score: 999_999, pipes: [{ x: CLEAR_X + PIPE_STEP / 2, gapY: MID_GAP }] });
  advance(s, TICK);
  assert.equal(s.score, 1_000_000);
  advance(s, TICK);
  advance(s, STEP, true);
  assert.equal(s.score, 1_000_000, 'and the same pipe is never counted again');
});

function twoPipeScenario(impl = GAME) {
  // Bird at y 300. Pipe A at x 40 (gap 300, fits 222..378), pipe B 220 px behind
  // it at x 260 (gap 280, fits 202..358). Flap on steps 1 and 7 only.
  //
  // Cycle 1 (k = 0..60):  y = 300 - 4.2k + 0.07k(k+1)
  //   A overlaps for k = 1..10 (38.5 .. 25) while y falls 295.94 .. 265.7: inside 222..378
  //   k=10: y = 300 - 42 + 7.7 = 265.7, vy -280.  A at 25: not scored yet.
  //   k=11: A at 23.5 -> score 1.
  //   k=60: y = 304.2, vy 420
  // Cycle 2 (j = k - 60):  y = 304.2 - 4.2j + 0.07j(j+1)
  //   k=70:  y = 304.2 - 42 + 7.7 = 269.9, vy -280
  //   top of the arc 304.2 - 60.9 = 243.3 (>= 202)
  //   k=99:  B at 260 - 148.5 = 111.5: overlap begins; y = 304.2 - 163.8 + 109.2 = 249.6
  //   k=120: y = 308.4, vy 420
  // No more flaps:
  //   k=121: vy 434, y 312.74    k=122: vy 448, y 317.22    k=123: vy 462, y 321.84
  //   k=124: vy 476, y 326.60    k=125: vy 480 (capped), y 331.40, then +4.8 each:
  //   k=130: 331.4 + 24   = 355.4  <= 358: alive  (bottom 367.4 <= 370)
  //   k=131: 331.4 + 28.8 = 360.2  >  358: dead   (bottom 372.2 >  370), B at 260 - 196.5 = 63.5
  //
  // Pipes: A = 40 - 1.5k, removed at k=70 (-65; at k=69 it is -63.5)
  //        B = 260 - 1.5k
  //        C spawned on substep 1 (B at 258.5 < 360) at 478.5, so C = B + 220
  //        D spawned on substep 81 (C at 358.5; at k=80 C is exactly 360: no spawn), D = B + 440
  const s = world({ y: 300, pipes: [{ x: 40, gapY: 300 }, { x: 40 + PIPE_SPACING, gapY: 280 }] }, impl);
  const flapOn = new Set([1, 7]);
  const checkpoints = {
    1: { y: 265.7, vy: -280, score: 0, xs: [25, 245, 465], passed: [false, false, false] },
    2: { score: 1, xs: [10, 230, 450], passed: [true, false, false] },
    6: { y: 304.2, vy: 420, score: 1, xs: [-50, 170, 390], passed: [true, false, false] },
    7: { y: 269.9, vy: -280, score: 1, xs: [155, 375], passed: [false, false] },
    8: { score: 1, xs: [140, 360], passed: [false, false] },
    9: { score: 1, xs: [125, 345, 565], passed: [false, false, false] },
    12: { y: 308.4, vy: 420, score: 1, xs: [80, 300, 520] },
    13: { y: 355.4, vy: 480, score: 1, xs: [65, 285, 505], passed: [false, false, false] },
  };
  for (let step = 1; step <= 13; step += 1) {
    impl.advance(s, STEP, flapOn.has(step));
    expectState(s, { t: step * 100, alive: true, cause: null, score: step === 1 ? 0 : 1, ...checkpoints[step] }, `two pipes, step ${step}`);
  }
  impl.advance(s, STEP);
  // dies on the first substep of step 14: t = 1310, not 1400; pipe B is not scored
  expectState(
    s,
    { t: 1310, y: 360.2, vy: 480, alive: false, cause: 'pipe', score: 1, xs: [63.5, 283.5, 503.5], passed: [false, false, false] },
    'two pipes, step 14',
  );
  const frozen = structuredClone(s);
  impl.advance(s, STEP, true);
  assert.deepEqual(s, frozen, 'two pipes: dead state must not change');
}

test('two pipes in play: pass the first, score once, die on the second at t=1310', () => twoPipeScenario());

test('nextPipe: returns the first unpassed pipe object from the state, without changing anything', () => {
  const fresh = createGame(4);
  assert.equal(nextPipe(fresh), fresh.pipes[0]);

  const s = world({
    pipes: [
      { x: 10, gapY: GAP_MIN_Y, passed: true }, // passed, still on screen
      { x: 10 + PIPE_SPACING, gapY: GAP_MAX_Y },
      { x: 10 + 2 * PIPE_SPACING, gapY: MID_GAP },
    ],
  });
  const before = structuredClone(s);
  assert.equal(nextPipe(s), s.pipes[1], 'must be the very object in state.pipes, not a copy');
  assert.deepEqual(s, before, 'nextPipe must not change the state');

  s.pipes[1].passed = true;
  assert.equal(nextPipe(s), s.pipes[2]);
});

// =============================================================================
// 7. Pipes: movement, spawn and removal timing
// =============================================================================
test('pipes: spawn, score and removal fall on exactly these substeps of a fresh game', () => {
  // pipe n is at x = 460 + 220n - 1.5k after k substeps.
  const s = createGame(3);
  let k = 0;
  const goTo = (target) => {
    cruise(s, target - k);
    k = target;
    assert.equal(s.t, k * TICK);
  };
  goTo(66); // 460 - 99 = 361 >= 360: still one pipe
  expectState(s, { xs: [361], score: 0 }, 'k=66');
  goTo(67); // 359.5 < 360 -> spawn at 359.5 + 220
  expectState(s, { xs: [359.5, 579.5], passed: [false, false] }, 'k=67');
  goTo(213); // pipe 1 at 680 - 319.5 = 360.5
  expectState(s, { xs: [140.5, 360.5] }, 'k=213');
  goTo(214); // pipe 1 at 359 -> spawn at 579
  expectState(s, { xs: [139, 359, 579], score: 0 }, 'k=214');
  goTo(290); // pipe 0 at 25: right edge 89, not yet behind the bird's back (88)
  expectState(s, { xs: [25, 245, 465], score: 0, passed: [false, false, false] }, 'k=290');
  goTo(291); // pipe 0 at 23.5
  expectState(s, { xs: [23.5, 243.5, 463.5], score: 1, passed: [true, false, false] }, 'k=291');
  goTo(349); // pipe 0 at 460 - 523.5 = -63.5: right edge 0.5, still there
  expectState(s, { xs: [-63.5, 156.5, 376.5], score: 1, passed: [true, false, false] }, 'k=349');
  goTo(350); // pipe 0 at -65: right edge -1 < 0 -> removed. Score is untouched.
  expectState(s, { xs: [155, 375], score: 1, passed: [false, false] }, 'k=350');
  goTo(360); // pipe 2 at 900 - 540 = 360 exactly: 360 < 360 is false -> no spawn
  expectState(s, { xs: [140, 360] }, 'k=360');
  goTo(361); // pipe 2 at 358.5 -> spawn at 578.5
  expectState(s, { xs: [138.5, 358.5, 578.5] }, 'k=361');
  goTo(437); // pipe 1 at 680 - 655.5 = 24.5
  expectState(s, { xs: [24.5, 244.5, 464.5], score: 1 }, 'k=437');
  goTo(438); // pipe 1 at 23
  expectState(s, { xs: [23, 243, 463], score: 2, passed: [true, false, false] }, 'k=438');
  goTo(496); // pipe 1 at 680 - 744 = -64: right edge exactly 0, 0 < 0 is false -> stays
  expectState(s, { xs: [-64, 156, 376], score: 2 }, 'k=496');
  goTo(497); // pipe 1 at -65.5 -> removed
  expectState(s, { xs: [154.5, 374.5], score: 2 }, 'k=497');
  goTo(584); // pipe 2 at 900 - 876 = 24 exactly: right edge 88, 88 < 88 is false -> not scored
  expectState(s, { xs: [24, 244, 464], score: 2, passed: [false, false, false] }, 'k=584');
  assert.equal(nextPipe(s), s.pipes[0]);
  goTo(585); // pipe 2 at 22.5
  expectState(s, { xs: [22.5, 242.5, 462.5], score: 3, passed: [true, false, false] }, 'k=585');
  assert.equal(nextPipe(s), s.pipes[1]);
});

test('pipes: a pipe whose right edge is exactly at x = 0 stays; one substep later it is removed', () => {
  const s = world({
    y: MID_GAP,
    score: 7,
    pipes: [
      { x: -PIPE_W + PIPE_STEP, gapY: MID_GAP, passed: true }, // -62.5 -> -64 -> -65.5
      { x: -PIPE_W + PIPE_STEP + PIPE_SPACING, gapY: MID_GAP }, // 157.5
      { x: -PIPE_W + PIPE_STEP + 2 * PIPE_SPACING, gapY: MID_GAP }, // 377.5
    ],
  });
  cruise(s, 1);
  expectState(s, { xs: [-PIPE_W, -PIPE_W + PIPE_SPACING, -PIPE_W + 2 * PIPE_SPACING], score: 7, passed: [true, false, false] }, 'right edge at 0');
  cruise(s, 1);
  expectState(s, { xs: [154.5, 374.5], score: 7, passed: [false, false] }, 'right edge at -1.5');
});

test('pipes: the last pipe exactly at WORLD_W spawns nothing; one substep later it does', () => {
  const s = world({ pipes: [{ x: WORLD_W + PIPE_STEP, gapY: MID_GAP }] }); // 361.5
  advance(s, TICK);
  expectState(s, { xs: [WORLD_W] }, 'last pipe at 360');
  advance(s, TICK);
  // 358.5 < 360 -> one new pipe at 358.5 + 220 = 578.5 (>= 360, so only one)
  expectState(s, { xs: [358.5, 578.5], passed: [false, false] }, 'last pipe at 358.5');
  assertValidGap(s.pipes[1].gapY, 'spawned pipe');
});

test('pipes: spawning repeats until the last pipe is at or beyond WORLD_W', () => {
  // A lone pipe at 101.5 moves to 100; 320 < 360 so a second spawn follows at 540.
  const s = world({ y: MID_GAP, vy: STILL_VY, pipes: [{ x: BIRD_X + PIPE_STEP, gapY: MID_GAP }] });
  advance(s, TICK);
  expectState(s, { alive: true, xs: [100, 320, 540], passed: [false, false, false] }, 'after one substep');
  assertValidGap(s.pipes[1].gapY, 'pipes[1]');
  assertValidGap(s.pipes[2].gapY, 'pipes[2]');
  assertUint32(s.rng, 'after two spawns');
});

// Closed form for a fresh game, independent of any step-by-step simulation.
function freshPipesAt(k) {
  const pipes = [];
  for (let n = 0; ; n += 1) {
    const x = FIRST_PIPE_X + PIPE_SPACING * n - PIPE_STEP * k; // multiples of 0.5: exact
    const spawned = n === 0 || x - PIPE_SPACING < WORLD_W; // the pipe before it has dipped below WORLD_W
    if (!spawned) return pipes;
    if (x + PIPE_W < 0) continue; // already removed
    pipes.push({ x, passed: x + PIPE_W < BIRD_BACK });
  }
}
function freshScoreAt(k) {
  let score = 0;
  while (FIRST_PIPE_X + PIPE_SPACING * score - PIPE_STEP * k + PIPE_W < BIRD_BACK) score += 1;
  return score;
}

test('pipes: a 60 s cruise matches the closed form on every one of 6000 substeps', () => {
  const s = createGame(11);
  const gapsSeen = new Set();
  let k = 0;
  cruise(s, 6000, () => {
    k += 1;
    const want = freshPipesAt(k);
    const label = `k=${k}`;
    assert.equal(s.t, k * TICK, `${label}: t`);
    assertXs(s, want.map((p) => p.x), label);
    assert.deepEqual(s.pipes.map((p) => p.passed), want.map((p) => p.passed), `${label}: passed flags`);
    assert.equal(s.score, freshScoreAt(k), `${label}: score`);
    assertUint32(s.rng, label);
    for (let i = 0; i < s.pipes.length; i += 1) {
      assertValidGap(s.pipes[i].gapY, `${label}: pipes[${i}]`);
      // spacing never drifts: every neighbour is exactly PIPE_SPACING ahead
      if (i > 0) assertNear(s.pipes[i].x - s.pipes[i - 1].x, PIPE_SPACING, `${label}: spacing ${i - 1}->${i}`);
    }
    assert.ok(s.pipes.length >= 1 && s.pipes.length <= 3, `${label}: 1 to 3 pipes exist at any time, got ${s.pipes.length}`);
    gapsSeen.add(s.pipes.at(-1).gapY);
  });
  // k=6000: pipe n is passed when 460 + 220n - 9000 + 64 < 88, i.e. 220n < 8564, n <= 38 -> 39 pipes
  assert.equal(s.score, 39);
  assert.equal(s.t, 60_000);
  // 42 pipes were created (n <= 41: 220(n-1) < 8900). A generator that works shows some variety.
  assert.ok(gapsSeen.size >= 5, `42 pipes should not share ${gapsSeen.size} gap position(s): the generator looks stuck`);
});

// =============================================================================
// 8. Determinism and hidden state
// =============================================================================
function gapSequence(seed, substeps = 3000) {
  const s = createGame(seed);
  const gaps = [s.pipes[0].gapY];
  let lastX = s.pipes.at(-1).x;
  cruise(s, substeps, () => {
    // pipes only ever move left, so a last pipe further right than before is a new one
    if (s.pipes.at(-1).x > lastX) gaps.push(s.pipes.at(-1).gapY);
    lastX = s.pipes.at(-1).x;
  });
  return gaps;
}

test('generator: the seed matters, and no seed (not even 0) is stuck on one value', () => {
  // 30 s of cruising creates 20 more pipes after the first (n <= 20: 220(n-1) < 4400).
  const sequences = [1, 2, 3, 4, 5, 6, 7, 8, 0, UINT32_MAX].map((seed) => gapSequence(seed));
  for (const gaps of sequences) {
    assert.equal(gaps.length, 21);
    assert.ok(new Set(gaps).size >= 3, `gap sequence [${gaps.join(', ')}] has almost no variety`);
  }
  assert.ok(new Set(sequences.map((g) => g.join(','))).size >= 2, 'every seed produced the same pipes: the seed is ignored');
  assert.deepEqual(gapSequence(5), gapSequence(5), 'same seed, same pipes');
});

test('determinism: same seed and same calls give deep-equal states at every step', () => {
  const calls = [];
  for (let i = 0; i < 300; i += 1) calls.push([i % 3 === 0 ? STEP : TICK, i % 7 === 0]);
  const a = createGame(21);
  const b = createGame(21);
  calls.forEach(([ms, flap], i) => {
    advance(a, ms, flap);
    advance(b, ms, flap);
    assert.deepEqual(a, b, `diverged at call ${i + 1}`);
  });
});

test('determinism: a structuredClone advanced the same way stays deep-equal (no state outside `state`)', () => {
  const a = createGame(8);
  cruise(a, 250);
  const b = structuredClone(a);
  assert.deepEqual(b, a);
  cruise(a, 700); // crosses several spawns: both must draw the same gaps
  cruise(b, 700);
  assert.deepEqual(b, a);
});

test('determinism: a state survives a JSON round trip mid-run and carries on identically', () => {
  const a = createGame(8);
  cruise(a, 400);
  const b = JSON.parse(JSON.stringify(a));
  assert.deepEqual(b, a, 'state must be plain JSON data at any time');
  cruise(a, 700);
  cruise(b, 700);
  assert.deepEqual(b, a);
});

test('determinism: two games running side by side do not disturb each other', () => {
  const a = createGame(5);
  const other = createGame(99);
  const doomed = createGame(5); // same seed as `a`, left to fall: dead from t=730 on
  for (let i = 0; i < 100; i += 1) {
    cruise(a, 10);
    cruise(other, 7);
    advance(doomed, STEP, false);
  }
  assert.equal(doomed.alive, false);
  const alone = createGame(5);
  cruise(alone, 1000);
  assert.deepEqual(a, alone);
});

test('determinism: advance(s, 100, f) equals advance(s, 10, f) then nine advance(s, 10, false)', () => {
  const starts = {
    'fresh game': () => createGame(2),
    'mid-flight': () => { const s = createGame(2); advance(s, STEP, true); advance(s, STEP); return s; },
    'across a spawn (substep 67)': () => { const s = createGame(2); cruise(s, 60); return s; },
    'across a ground death (substep 73)': () => { const s = createGame(2); for (let i = 0; i < 7; i += 1) advance(s, STEP); return s; },
    'under the ceiling': () => world({ y: BIRD_R + 3, vy: -50 }),
    'across a pipe death': () => world({ y: MID_GAP - FIT - 30, pipes: [{ x: BIRD_FRONT + 4 * PIPE_STEP, gapY: MID_GAP }] }),
    'across a score': () => world({ y: MID_GAP - 3, pipes: [{ x: CLEAR_X + 4 * PIPE_STEP, gapY: MID_GAP }] }),
  };
  for (const [name, make] of Object.entries(starts)) {
    for (const flap of [false, true]) {
      const big = make();
      const small = structuredClone(big);
      advance(big, STEP, flap);
      advance(small, TICK, flap);
      for (let i = 0; i < 9; i += 1) advance(small, TICK, false);
      assert.deepEqual(small, big, `${name}, flap=${flap}`);
    }
  }
});

// =============================================================================
// 9. Chaos: the implementation against an independent reference simulator
// =============================================================================
// The reference below was written from the contract text alone. It shares no
// code with game.js. It cannot know the implementation's generator, so pipes it
// spawns carry gapY = null until the harness fills them in after the call (a
// pipe is spawned at least 220 px beyond the previous one and needs hundreds of
// substeps to reach the bird, so a null gap is never consulted).

const TIE = 1e-9; // a y-threshold decision closer than this is float noise, not behaviour

function referenceCreate(firstGapY) {
  return {
    t: 0,
    bird: { y: BIRD_START_Y, vy: 0 },
    pipes: [{ x: FIRST_PIPE_X, gapY: firstGapY, passed: false }],
    score: 0,
    alive: true,
    cause: null,
  };
}

// `bug` is null except in the negative-control test, where it plants one
// deliberate mistake so the harness can be shown to catch it.
function referenceAdvance(s, ms, flap, bug = null) {
  const note = { tie: false, clamps: 0 };
  if (!s.alive) {
    if (bug === 'ticks-after-death') s.t += ms;
    return note;
  }
  const dt = SUBSTEP_MS / 1000;
  const bird = s.bird;
  if (flap) bird.vy = bug === 'flap-adds' ? bird.vy + FLAP_VY : FLAP_VY;
  if (bug === 'pipes-move-per-call') for (const p of s.pipes) p.x -= PIPE_SPEED * dt;

  const substeps = Math.round(ms / SUBSTEP_MS);
  for (let i = 0; i < substeps; i += 1) {
    // 1, 2: speed, then position
    if (bug === 'explicit-euler') bird.y += bird.vy * dt;
    bird.vy = bug === 'no-cap' ? bird.vy + GRAVITY * dt : Math.min(bird.vy + GRAVITY * dt, MAX_FALL_VY);
    if (bug !== 'explicit-euler') bird.y += bird.vy * dt;

    // 3: ceiling
    if (Math.abs(bird.y - BIRD_R) < TIE) note.tie = true;
    if (bird.y < BIRD_R) {
      bird.y = BIRD_R;
      if (bug !== 'ceiling-keeps-speed') bird.vy = 0;
      note.clamps += 1;
    }

    // 4: pipes move
    if (bug !== 'pipes-move-per-call') for (const p of s.pipes) p.x -= PIPE_SPEED * dt;

    // 5: remove, then spawn
    s.pipes = s.pipes.filter((p) => !(p.x + PIPE_W < 0));
    while (s.pipes.at(-1).x < WORLD_W) {
      s.pipes.push({ x: s.pipes.at(-1).x + PIPE_SPACING, gapY: null, passed: false });
    }

    // 6: clock
    s.t += SUBSTEP_MS;

    // 7: death, ground first
    const groundLine = bug === 'ground-uses-centre' ? GROUND_Y + BIRD_R : GROUND_Y;
    if (Math.abs(bird.y + BIRD_R - GROUND_Y) < TIE) note.tie = true;
    if (bird.y + BIRD_R >= groundLine) {
      s.alive = false;
      s.cause = 'ground';
      break;
    }
    let hit = false;
    for (const p of s.pipes) {
      const reached = bug === 'front-face-inclusive' ? p.x <= BIRD_X + BIRD_R : p.x < BIRD_X + BIRD_R;
      if (reached && p.x + PIPE_W > BIRD_X - BIRD_R) {
        assert.notEqual(p.gapY, null, 'reference simulator: a pipe reached the bird before its gap was filled in');
        const gapTop = p.gapY - GAP_H / 2;
        const gapBottom = p.gapY + GAP_H / 2;
        if (Math.abs(bird.y - BIRD_R - gapTop) < TIE || Math.abs(bird.y + BIRD_R - gapBottom) < TIE) note.tie = true;
        if (bird.y - BIRD_R < gapTop || bird.y + BIRD_R > gapBottom) hit = true;
      }
    }
    if (hit) {
      s.alive = false;
      s.cause = 'pipe';
      break;
    }

    // 8: score
    for (const p of s.pipes) {
      if (p.passed === false && p.x + PIPE_W < BIRD_X - BIRD_R) {
        p.passed = true;
        s.score += 1;
      }
    }
  }
  return note;
}

// The reference wrapped up to look like game.js (it fills its own gaps from a
// trivial counter). Used to check the reference against the hand-derived
// scenarios, and, with a planted bug, as the victim in the negative control.
function standIn(bug = null) {
  const span = GAP_MAX_Y - GAP_MIN_Y + 1;
  const gapFor = (n) => GAP_MIN_Y + ((Math.imul(n, 2654435761) >>> 0) % span);
  return {
    createGame(seed = 1) {
      const s = referenceCreate(gapFor(seed));
      s.rng = seed >>> 0;
      return s;
    },
    advance(s, ms, flap = false) {
      referenceAdvance(s, ms, flap, bug);
      for (const p of s.pipes) {
        if (p.gapY === null) {
          s.rng = (s.rng + 1) >>> 0;
          p.gapY = gapFor(s.rng);
        }
      }
      return s;
    },
  };
}

// First difference between the implementation's state and the reference's, as
// text, or null when they agree (floats within EPS, everything else exactly).
function diffStates(real, ref) {
  const close = (a, b) => typeof a === 'number' && Math.abs(a - b) <= EPS;
  if (real.t !== ref.t) return `t is ${real.t}, reference says ${ref.t}`;
  if (real.alive !== ref.alive) return `alive is ${real.alive} (cause ${real.cause}), reference says ${ref.alive} (cause ${ref.cause})`;
  if (real.cause !== ref.cause) return `cause is ${real.cause}, reference says ${ref.cause}`;
  if (!close(real.bird.y, ref.bird.y)) return `bird.y is ${real.bird.y}, reference says ${ref.bird.y}`;
  if (!close(real.bird.vy, ref.bird.vy)) return `bird.vy is ${real.bird.vy}, reference says ${ref.bird.vy}`;
  if (real.score !== ref.score) return `score is ${real.score}, reference says ${ref.score}`;
  const xs = (s) => `[${s.pipes.map((p) => p.x).join(', ')}]`;
  if (!Array.isArray(real.pipes) || real.pipes.length !== ref.pipes.length) {
    return `pipes are at ${Array.isArray(real.pipes) ? xs(real) : real.pipes}, reference says ${xs(ref)}`;
  }
  for (let i = 0; i < ref.pipes.length; i += 1) {
    const a = real.pipes[i];
    const b = ref.pipes[i];
    if (!close(a.x, b.x)) return `pipes[${i}].x is ${a.x}, reference says ${b.x}`;
    if (a.passed !== b.passed) return `pipes[${i}].passed is ${a.passed}, reference says ${b.passed}`;
    if (b.gapY !== null && a.gapY !== b.gapY) return `pipes[${i}].gapY is ${a.gapY}, reference says ${b.gapY}`;
  }
  return null;
}

// Small seeded generator for the chaos inputs (mulberry32). Nothing to do with
// whatever generator game.js uses for its gaps.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// A crude pilot, so that some runs live long enough to score and recycle pipes.
function pilotWantsFlap(ref) {
  const next = ref.pipes.find((p) => p.passed === false);
  return ref.bird.y > next.gapY + 10;
}

const POLICIES = [
  { name: 'never flap', flap: () => false }, // always ends on the ground at t=730
  { name: 'always flap', flap: () => true }, // ceiling, then the first pipe at t=2330
  { name: 'random 8%', flap: (ref, rand) => rand() < 0.08 },
  { name: 'random 25%', flap: (ref, rand) => rand() < 0.25 },
  { name: 'pilot', flap: (ref) => pilotWantsFlap(ref) },
  { name: 'noisy pilot', flap: (ref, rand) => (rand() < 0.03) !== pilotWantsFlap(ref) },
];

function forcedGap(rand) {
  const r = rand();
  if (r < 0.1) return GAP_MIN_Y;
  if (r < 0.2) return GAP_MAX_Y;
  return GAP_MIN_Y + Math.floor(rand() * (GAP_MAX_Y - GAP_MIN_Y + 1));
}

const CHAOS_SEED = Number(process.env.CHAOS_SEED ?? 20261006);
const CHAOS_RUNS = Number(process.env.CHAOS_RUNS ?? 240);
const CHAOS_CALLS = 600;
const CHAOS_IS_DEFAULT = process.env.CHAOS_SEED === undefined && process.env.CHAOS_RUNS === undefined;

// One run. Everything about it (policy, gap mode, call lengths, flaps) follows
// from runSeed alone, so a failure can be replayed from the seed it prints.
//   policy   = runSeed mod 6
//   gap mode = even floor(runSeed / 6): the implementation's own gaps are copied
//              into the reference; odd: the test overwrites the gaps in both
//              (plain mutable state), leaning on the extremes.
function chaosRun(runSeed, impl = GAME, maxCalls = CHAOS_CALLS) {
  const rand = mulberry32(runSeed);
  const policy = POLICIES[runSeed % POLICIES.length];
  const forced = Math.floor(runSeed / POLICIES.length) % 2 === 1;
  const tag = `chaos run seed ${runSeed} (policy "${policy.name}", ${forced ? 'gaps forced by the test' : "implementation's own gaps"})`;
  const replay = `replay this run alone: CHAOS_SEED=${runSeed} CHAOS_RUNS=1 node --test test/game.test.mjs`;
  const stats = { policy: policy.name, forced, end: 'survived', calls: 0, substeps: 0, score: 0, clamps: 0 };

  const real = impl.createGame(runSeed);
  assertValidGap(real.pipes?.[0]?.gapY, `${tag}, fresh game`);
  if (forced) real.pipes[0].gapY = forcedGap(rand);
  const ref = referenceCreate(real.pipes[0].gapY);
  let diff = diffStates(real, ref);
  if (diff) assert.fail(`${tag}, fresh game: ${diff}\n  ${replay}`);

  for (let call = 1; call <= maxCalls; call += 1) {
    const r = rand();
    // 45% one substep, 45% one decision step, 10% some other multiple (20..80 ms)
    const ms = r < 0.45 ? SUBSTEP_MS : r < 0.9 ? DECISION_STEP_MS : SUBSTEP_MS * (2 + Math.floor(rand() * 7));
    const flap = policy.flap(ref, rand);

    const returned = impl.advance(real, ms, flap);
    const note = referenceAdvance(ref, ms, flap);
    const at = `${tag}, call #${call} advance(state, ${ms}, ${flap}), reference now at t=${ref.t}`;
    assert.equal(returned, real, `${at}: advance must return the state it was given\n  ${replay}`);

    // Fill in the gaps of pipes spawned during this call.
    if (Array.isArray(real.pipes) && real.pipes.length === ref.pipes.length) {
      ref.pipes.forEach((p, i) => {
        if (p.gapY !== null) return;
        const g = real.pipes[i].gapY;
        if (!(Number.isInteger(g) && g >= GAP_MIN_Y && g <= GAP_MAX_Y)) {
          assert.fail(`${at}: spawned pipes[${i}].gapY is ${g}, not an integer in [${GAP_MIN_Y}, ${GAP_MAX_Y}]\n  ${replay}`);
        }
        p.gapY = forced ? forcedGap(rand) : g;
        real.pipes[i].gapY = p.gapY;
      });
    }

    diff = diffStates(real, ref);
    if (diff) {
      if (note.tie) {
        // The reference made a decision within 1e-9 of a threshold during this
        // call; either answer is float noise. Stop judging this run.
        stats.end = 'tie';
        break;
      }
      assert.fail(`${at}: ${diff}\n  ${replay}`);
    }
    assertUint32(real.rng, `${at} (${replay})`);
    stats.calls = call;
    stats.clamps += note.clamps;

    if (!ref.alive) {
      const frozen = structuredClone(real);
      impl.advance(real, DECISION_STEP_MS, true);
      impl.advance(real, SUBSTEP_MS, false);
      assert.deepEqual(real, frozen, `${at}: the bird is dead (${ref.cause}) but later advance calls changed the state\n  ${replay}`);
      stats.end = ref.cause;
      break;
    }
  }
  stats.substeps = ref.t / SUBSTEP_MS;
  stats.score = ref.score;
  return stats;
}

test(`chaos: ${CHAOS_RUNS} seeded runs of up to ${CHAOS_CALLS} mixed 10/100 ms calls match the reference simulator (base seed ${CHAOS_SEED})`, (t) => {
  const tally = { ground: 0, pipe: 0, survived: 0, tie: 0, calls: 0, substeps: 0, maxScore: 0, runsWithClamp: 0 };
  // The half of the runs whose gaps the test chose: identical for every correct
  // implementation, so thresholds on these do not depend on game.js's generator.
  const forcedOnly = { runs: 0, substeps: 0, maxScore: 0 };
  const endings = {};
  for (let i = 0; i < CHAOS_RUNS; i += 1) {
    const stats = chaosRun(CHAOS_SEED + i);
    tally[stats.end] += 1;
    tally.calls += stats.calls;
    tally.substeps += stats.substeps;
    tally.maxScore = Math.max(tally.maxScore, stats.score);
    if (stats.clamps > 0) tally.runsWithClamp += 1;
    if (stats.forced) {
      forcedOnly.runs += 1;
      forcedOnly.substeps += stats.substeps;
      forcedOnly.maxScore = Math.max(forcedOnly.maxScore, stats.score);
    }
    endings[stats.policy] ??= { ground: 0, pipe: 0, survived: 0, tie: 0 };
    endings[stats.policy][stats.end] += 1;
  }
  t.diagnostic(`chaos coverage, all runs: ${JSON.stringify(tally)}`);
  t.diagnostic(`chaos coverage, runs with test-chosen gaps: ${JSON.stringify(forcedOnly)}`);
  t.diagnostic(`chaos endings by policy: ${JSON.stringify(endings)}`);

  if (CHAOS_IS_DEFAULT) {
    // Coverage, not correctness: prove the runs above were not all trivial.
    // Each policy gets 40 of the 240 runs. "never flap" always ends on the
    // ground; "always flap" always clamps at the ceiling and ends on a pipe.
    assert.ok(CHAOS_RUNS >= 200);
    assert.ok(tally.ground >= 35, `expected at least 35 ground deaths, saw ${tally.ground}`);
    assert.ok(tally.pipe >= 35, `expected at least 35 pipe deaths, saw ${tally.pipe}`);
    assert.ok(tally.runsWithClamp >= 35, `expected at least 35 runs to touch the ceiling, saw ${tally.runsWithClamp}`);
    assert.ok(forcedOnly.maxScore >= 5, `expected some piloted run to pass 5 pipes, best was ${forcedOnly.maxScore}`);
    assert.ok(forcedOnly.substeps >= 50_000, `expected at least 50000 substeps compared on test-chosen gaps, saw ${forcedOnly.substeps}`);
    assert.ok(tally.tie <= CHAOS_RUNS / 20, `${tally.tie} runs were abandoned as float-noise ties: too many to trust the comparison`);
  }
});

// =============================================================================
// 10. Negative controls and the reference's own check
// =============================================================================
test('negative control: assertNear accepts float noise and rejects a real difference', () => {
  assertNear(245.7 + 1e-12, 245.7);
  assertNear(0.1 + 0.2, 0.3);
  assert.throws(() => assertNear(245.7 + 1e-6, 245.7), assert.AssertionError);
  assert.throws(() => assertNear(244.3, 245.7), assert.AssertionError); // what explicit Euler would give
  assert.throws(() => assertNear(Number.NaN, 245.7), assert.AssertionError);
  assert.throws(() => assertNear('245.7', 245.7), assert.AssertionError);
  assert.throws(() => assertNear(undefined, 0), assert.AssertionError);
  const s = referenceCreate(MID_GAP);
  assert.throws(() => expectState(s, { y: BIRD_START_Y + 0.001 }, 'control'), assert.AssertionError);
  assert.throws(() => expectState(s, { xs: [FIRST_PIPE_X, FIRST_PIPE_X + PIPE_SPACING] }, 'control'), assert.AssertionError);
  assert.throws(() => expectState(s, { alive: false }, 'control'), assert.AssertionError);
});

test('negative control: diffStates reports every kind of single-field difference', () => {
  const base = () => referenceCreate(MID_GAP);
  assert.equal(diffStates(base(), base()), null);
  const noisy = base();
  noisy.bird.y += 1e-12;
  noisy.pipes[0].x -= 1e-12;
  assert.equal(diffStates(noisy, base()), null, 'float noise is not a difference');

  const corruptions = {
    t: (s) => { s.t += SUBSTEP_MS; },
    'bird.y': (s) => { s.bird.y += 1e-6; },
    'bird.vy': (s) => { s.bird.vy -= 1e-6; },
    'bird.y NaN': (s) => { s.bird.y = Number.NaN; },
    score: (s) => { s.score += 1; },
    alive: (s) => { s.alive = false; },
    cause: (s) => { s.cause = 'pipe'; },
    'pipe x': (s) => { s.pipes[0].x += 1e-6; },
    'pipe passed': (s) => { s.pipes[0].passed = true; },
    'pipe gapY': (s) => { s.pipes[0].gapY += 1; },
    'extra pipe': (s) => { s.pipes.push({ x: FIRST_PIPE_X + PIPE_SPACING, gapY: MID_GAP, passed: false }); },
    'missing pipe': (s) => { s.pipes.pop(); },
  };
  for (const [name, corrupt] of Object.entries(corruptions)) {
    const bad = base();
    corrupt(bad);
    assert.equal(typeof diffStates(bad, base()), 'string', `diffStates missed a difference in: ${name}`);
  }
});

test('reference simulator: reproduces every hand-derived scenario, so it can arbitrate', () => {
  const ref = standIn();
  arcScenario(ref);
  ceilingScenario(ref);
  freeFallScenario(ref);
  cleanPassScenario(ref);
  twoPipeScenario(ref);
});

test('negative control: the chaos harness passes a faithful stand-in and catches each planted bug', () => {
  const seeds = Array.from({ length: 12 }, (_, i) => CHAOS_SEED + i); // every policy, both gap modes
  for (const seed of seeds) chaosRun(seed, standIn());

  const bugs = [
    'flap-adds', // F01
    'explicit-euler', // F03
    'no-cap', // F05
    'ceiling-keeps-speed', // F06
    'ground-uses-centre', // F08
    'front-face-inclusive', // F10
    'ticks-after-death', // F14
    'pipes-move-per-call', // F15
  ];
  for (const bug of bugs) {
    assert.throws(
      () => { for (const seed of seeds) chaosRun(seed, standIn(bug)); },
      assert.AssertionError,
      `the chaos harness did not notice the planted bug "${bug}"`,
    );
  }
  // ...and the hand-derived scenarios catch planted bugs too.
  assert.throws(() => arcScenario(standIn('explicit-euler')), assert.AssertionError);
  assert.throws(() => ceilingScenario(standIn('flap-adds')), assert.AssertionError);
  assert.throws(() => ceilingScenario(standIn('front-face-inclusive')), assert.AssertionError);
  assert.throws(() => freeFallScenario(standIn('no-cap')), assert.AssertionError);
  assert.throws(() => freeFallScenario(standIn('ticks-after-death')), assert.AssertionError);
  assert.throws(() => twoPipeScenario(standIn('pipes-move-per-call')), assert.AssertionError);
});
