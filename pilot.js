// Everything Jev is told and asked. If Jev flies badly, this is the file to
// tune: the phrases, the rules text, the question and the crash notes.
//
// Jev is weak with raw numbers and reads instructions literally, so code turns
// the physics into named bands and the question spells out what yes and no mean.
import {
  BIRD_X, BIRD_R, JEV_MODEL, MAX_NOTES,
  HEIGHT_EDGE, HEIGHT_NEAR_EDGE, HEIGHT_MIDDLE,
  SPEED_FAST_RISE, SPEED_LEVEL, SPEED_FAST_FALL,
  DIST_FAR, DIST_CLOSE,
} from './constants.js';
import { nextPipe } from './game.js';

export const HEIGHT = [
  'above the gap, level with the upper pipe',
  'inside the gap, near its top edge',
  'inside the gap, a little above the middle',
  'in the middle of the gap',
  'inside the gap, a little below the middle',
  'inside the gap, near its bottom edge',
  'below the gap, level with the lower pipe',
];
export const MOVEMENT = ['rising fast', 'rising slowly', 'hovering', 'falling slowly', 'falling fast'];
export const DISTANCE = ['far ahead', 'approaching', 'very close', 'the bird is between the pipes right now'];
export const CHOICES = ['flap', 'no flap'];
export const HITS = ['upper pipe', 'lower pipe', 'ground'];

const RULES =
  'This is a Flappy Bird game. The bird flies toward a pair of pipes with a gap between them. ' +
  'To survive, the bird must be inside the gap when it reaches the pipes. ' +
  'Gravity pulls the bird down all the time, faster and faster. ' +
  "A flap makes the bird jump up by about one third of the gap's height, and then it falls again.";

const QUESTION = {
  type: 'noul',
  instructions: 'Read `bird_height`, `bird_movement` and `next_pipe`. Should the bird flap right now?',
  criteria: {
    true:
      'Yes, flap now. The bird is below the middle of the gap and is not already rising fast, ' +
      'or it is in the middle of the gap and falling fast. Without a flap it will end up too low.',
    false:
      'No, do not flap now. The bird is above the middle of the gap, or it is already rising fast. ' +
      'A flap now would push it too high.',
  },
};

export function describe(state) {
  const { bird } = state;
  const pipe = nextPipe(state);
  const offset = bird.y - pipe.gapY;
  const dist = pipe.x - (BIRD_X + BIRD_R);

  let h;
  if (offset < -HEIGHT_EDGE) h = 0;
  else if (offset < -HEIGHT_NEAR_EDGE) h = 1;
  else if (offset < -HEIGHT_MIDDLE) h = 2;
  else if (offset <= HEIGHT_MIDDLE) h = 3;
  else if (offset <= HEIGHT_NEAR_EDGE) h = 4;
  else if (offset <= HEIGHT_EDGE) h = 5;
  else h = 6;

  let m;
  if (bird.vy < SPEED_FAST_RISE) m = 0;
  else if (bird.vy < -SPEED_LEVEL) m = 1;
  else if (bird.vy <= SPEED_LEVEL) m = 2;
  else if (bird.vy <= SPEED_FAST_FALL) m = 3;
  else m = 4;

  let d;
  if (dist > DIST_FAR) d = 0;
  else if (dist > DIST_CLOSE) d = 1;
  else if (dist > 0) d = 2;
  else d = 3;

  return { bird_height: HEIGHT[h], bird_movement: MOVEMENT[m], next_pipe: DISTANCE[d] };
}

// The server only forwards situations this module could have produced, so the
// endpoint cannot be used to send arbitrary text to the paid API.
export function isSituation(x) {
  return (
    x !== null &&
    typeof x === 'object' &&
    !Array.isArray(x) &&
    Object.keys(x).length === 3 &&
    HEIGHT.includes(x.bird_height) &&
    MOVEMENT.includes(x.bird_movement) &&
    DISTANCE.includes(x.next_pipe)
  );
}

// Jev's model cannot be retrained, so it learns the only way it can: each
// question carries notes about earlier crashes, in the same words as the situation.
const LEARN = ' `past_crashes` lists choices that ended in a crash. Do not repeat a choice that crashed in the same situation.';

export function buildRequest(situation, notes = []) {
  if (!notes.length) {
    return { model: JEV_MODEL, state: { rules: RULES, ...situation }, questions: { flap: QUESTION } };
  }
  return {
    model: JEV_MODEL,
    state: { rules: RULES, ...situation, past_crashes: notes.map(noteSentence) },
    questions: { flap: { ...QUESTION, instructions: QUESTION.instructions + LEARN } },
  };
}

export function noteSentence(note) {
  const did = note.choice === 'flap' ? 'It flapped. It rose too high' : 'It did not flap. It sank too low';
  const end = note.hit === 'ground' ? 'hit the ground' : `crashed into the ${note.hit}`;
  const again = note.times >= 2 ? ' This happened more than once.' : '';
  return `The bird was '${note.bird_height}' and '${note.bird_movement}'. ${did} and ${end}.${again}`;
}

export function whatItHit(state) {
  if (state.cause === 'ground') return 'ground';
  return state.bird.y < nextPipe(state).gapY ? 'upper pipe' : 'lower pipe';
}

// Which decision to blame for a crash. Only the approach to the pipe that was
// hit counts: everything since the bird cleared the pipe before it, so a
// correct decision inside the previous gap is never blamed.
// Too high: the last flap. Too low: the last time Jev chose to let the bird
// drop; if every "no flap" was made while already climbing, the last of those
// (it climbed too late). Nothing of the kind in the approach: no note.
export function crashNote(log, hit) {
  let start = 0;
  for (let i = 0; i < log.length - 1; i++) {
    if (log[i].next_pipe === DISTANCE[3] && log[i + 1].next_pipe !== DISTANCE[3]) start = i + 1;
  }
  const approach = log.slice(start);
  const rising = (e) => e.bird_movement === MOVEMENT[0] || e.bird_movement === MOVEMENT[1];
  const blamed = hit === 'upper pipe'
    ? approach.findLast((e) => e.flap)
    : approach.findLast((e) => !e.flap && !rising(e)) ?? approach.findLast((e) => !e.flap);
  if (!blamed) return null;
  return {
    bird_height: blamed.bird_height,
    bird_movement: blamed.bird_movement,
    choice: hit === 'upper pipe' ? 'flap' : 'no flap',
    hit,
    times: 1,
  };
}

// Newest first. The same mistake again is counted, not listed twice.
export function addNote(notes, note) {
  if (!note) return [...notes];
  const same = (n) => n.bird_height === note.bird_height && n.bird_movement === note.bird_movement && n.choice === note.choice && n.hit === note.hit;
  const seen = notes.find(same);
  return [seen ? { ...seen, times: seen.times + 1 } : note, ...notes.filter((n) => !same(n))].slice(0, MAX_NOTES);
}

export function isNote(x) {
  return (
    x !== null &&
    typeof x === 'object' &&
    !Array.isArray(x) &&
    Object.keys(x).length === 5 &&
    HEIGHT.includes(x.bird_height) &&
    MOVEMENT.includes(x.bird_movement) &&
    CHOICES.includes(x.choice) &&
    HITS.includes(x.hit) &&
    (x.choice === 'flap') === (x.hit === 'upper pipe') &&
    Number.isInteger(x.times) &&
    x.times >= 1
  );
}

export function areNotes(x) {
  return Array.isArray(x) && x.length <= MAX_NOTES && x.every(isNote);
}

// Jev's probability that the answer is yes. Throws when the reply is not the
// shape the API documents, so a broken reply pauses the game instead of flying it.
export function readAnswer(body) {
  const p = body?.answers?.flap?.noul;
  if (typeof p !== 'number' || !(p >= 0 && p <= 1)) {
    throw new Error('Jev reply has no usable flap probability');
  }
  return p;
}
