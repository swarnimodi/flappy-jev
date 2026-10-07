// Which decisions a crash may be blamed on. Written before the rule was changed.
//
// The rule: only the approach to the pipe that was hit counts, meaning every
// decision since the bird cleared the pipe before it (in the log: since the
// last time `next_pipe` went from "between the pipes" to anything else).
// Before the first pipe is cleared, the whole log is the approach.
//   too high: the last flap in the approach, or no note.
//   too low:  the last "no flap" in the approach made while not rising; if
//             there is none, the last "no flap" in the approach; or no note.
//
// Ways this could be wrong:
//  W1 A too-low crash blames a correct decision from inside the previous gap.
//  W2 A too-high crash blames a flap from inside the previous gap.
//  W3 With nothing to blame in the approach, it reaches back anyway instead of giving no note.
//  W4 The approach starts in the wrong place: it keeps the last "between" entry of the
//     previous pipe, drops its own first entry, or starts at the first pipe cleared, not the last.
//  W5 "Between the pipes" entries of the pipe that was hit are left out of the approach.
//  W6 Before any pipe is cleared, something other than the whole log is used.
//  W7 A bird that climbed too late (only rising "no flap"s in the approach) gets no note,
//     or a note about an older decision, instead of the last time it did not flap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crashNote, HEIGHT, MOVEMENT, DISTANCE } from '../pilot.js';

const [FAR, NEARING, CLOSE, BETWEEN] = DISTANCE;
const E = (h, m, d, flap) => Object.freeze({ bird_height: HEIGHT[h], bird_movement: MOVEMENT[m], next_pipe: d, flap, p: flap ? 0.9 : 0.1 });
const F = (h, m, d) => E(h, m, d, true), N = (h, m, d) => E(h, m, d, false);
const log = (...entries) => Object.freeze(entries);
const low = (h, m, hit = 'lower pipe') => ({ bird_height: HEIGHT[h], bird_movement: MOVEMENT[m], choice: 'no flap', hit, times: 1 });
const high = (h, m) => ({ bird_height: HEIGHT[h], bird_movement: MOVEMENT[m], choice: 'flap', hit: 'upper pipe', times: 1 });

test('W1 W7: climbing too late into a higher gap blames the last time it did not flap, not the previous gap', () => {
  // Entries 0-2 are the previous pipe. Entry 1 (a little above the middle, falling slowly, no flap) was correct.
  // Entries 3-7 are the climb: every "no flap" there was made while rising fast. The last one is entry 7.
  const l = log(N(3, 2, CLOSE), N(2, 3, BETWEEN), F(4, 4, BETWEEN),
    N(6, 0, NEARING), F(6, 1, NEARING), N(6, 0, CLOSE), F(6, 1, BETWEEN), N(6, 0, BETWEEN));
  assert.deepEqual(crashNote(l, 'lower pipe'), low(6, 0));
});

test('W1: a "no flap" made while not rising, inside the approach, is still the one blamed', () => {
  const l = log(N(4, 3, BETWEEN), N(5, 2, NEARING), F(6, 3, CLOSE), N(6, 0, BETWEEN));
  assert.deepEqual(crashNote(l, 'lower pipe'), low(5, 2)); // entry 1: hovering near the bottom edge
});

test('W2 W3: hitting the upper pipe without a flap in the approach gives no note', () => {
  // The only flap (entry 0) was inside the previous gap.
  assert.equal(crashNote(log(F(4, 3, BETWEEN), N(1, 0, NEARING), N(0, 1, CLOSE), N(0, 2, BETWEEN)), 'upper pipe'), null);
});

test('W2: the last flap in the approach is blamed for hitting the upper pipe', () => {
  const l = log(F(4, 3, BETWEEN), N(2, 0, NEARING), F(2, 4, CLOSE), N(1, 0, BETWEEN));
  assert.deepEqual(crashNote(l, 'upper pipe'), high(2, 4)); // entry 2
});

test('W3: sinking although every decision in the approach was a flap gives no note', () => {
  assert.equal(crashNote(log(N(3, 2, BETWEEN), F(6, 1, NEARING), F(6, 0, CLOSE)), 'lower pipe'), null);
  assert.equal(crashNote(log(N(3, 2, BETWEEN), F(6, 1, NEARING), F(6, 0, CLOSE)), 'ground'), null);
});

test('W6: before any pipe is cleared, the whole log is the approach', () => {
  const l = log(N(6, 2, FAR), N(6, 3, FAR), N(6, 4, FAR));
  assert.deepEqual(crashNote(l, 'ground'), low(6, 4, 'ground')); // the last one: falling fast
  // and a log that is "between" from start to finish (crashed inside the first pipe) is one approach too
  assert.deepEqual(crashNote(log(F(2, 4, BETWEEN), N(1, 0, BETWEEN)), 'upper pipe'), high(2, 4));
});

test('W4: the approach starts after the LAST pipe cleared, not the first', () => {
  // Pipe 1: entry 0. Pipe 2: entries 1-2. Pipe 3 (hit): entries 3-5, where both "no flap"s were made while rising.
  // Starting at the first pipe cleared would blame entry 1 (hovering); the right answer is entry 5.
  const l = log(N(3, 3, BETWEEN), N(4, 2, NEARING), F(4, 3, BETWEEN), F(5, 3, NEARING), N(5, 0, CLOSE), N(4, 1, BETWEEN));
  assert.deepEqual(crashNote(l, 'lower pipe'), low(4, 1));
});

test('W4: the first entry of the approach is in it, and the last entry of the previous pipe is not', () => {
  assert.deepEqual(crashNote(log(F(4, 3, BETWEEN), N(5, 3, NEARING), F(6, 4, CLOSE)), 'lower pipe'), low(5, 3)); // entry 1
  // Entry 0 (previous pipe, falling fast, no flap) would be blamed if it were kept; entry 2 is the answer.
  assert.deepEqual(crashNote(log(N(5, 4, BETWEEN), F(6, 3, NEARING), N(6, 0, CLOSE)), 'lower pipe'), low(6, 0));
});

test('W5: decisions made between the pipes of the pipe that was hit count', () => {
  const l = log(N(3, 2, BETWEEN), N(2, 0, NEARING), N(2, 3, CLOSE), F(2, 4, BETWEEN), N(1, 0, BETWEEN));
  assert.deepEqual(crashNote(l, 'upper pipe'), high(2, 4)); // entry 3, made between the pipes it then hit
});
