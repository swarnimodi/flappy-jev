// The game itself: physics, pipes, collisions, scoring. Pure functions over
// plain data, so the browser, the server-side tests and a replay all get the
// same run from the same seed and the same flaps.
import {
  WORLD_W, GROUND_Y, BIRD_X, BIRD_R, BIRD_START_Y,
  GRAVITY, FLAP_VY, MAX_FALL_VY, SUBSTEP_MS,
  PIPE_SPEED, PIPE_W, GAP_H, PIPE_SPACING, FIRST_PIPE_X, GAP_MIN_Y, GAP_MAX_Y,
} from './constants.js';

const DT = SUBSTEP_MS / 1000;

// mulberry32, with its whole state kept in state.rng so a cloned game
// continues with the same pipes.
function random(state) {
  const a = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function newPipe(state, x) {
  const gapY = GAP_MIN_Y + Math.floor(random(state) * (GAP_MAX_Y - GAP_MIN_Y + 1));
  return { x, gapY, passed: false };
}

export function createGame(seed = 1) {
  const state = {
    t: 0,
    bird: { y: BIRD_START_Y, vy: 0 },
    pipes: [],
    score: 0,
    alive: true,
    cause: null,
    rng: seed >>> 0,
  };
  state.pipes.push(newPipe(state, FIRST_PIPE_X));
  return state;
}

export function nextPipe(state) {
  return state.pipes.find((p) => !p.passed);
}

// Move the game forward by `ms` (a multiple of SUBSTEP_MS). A flap applies
// once, at the start. Stops at the substep where the bird dies.
export function advance(state, ms, flap = false) {
  if (!state.alive) return state;
  const { bird, pipes } = state;
  if (flap) bird.vy = FLAP_VY;

  for (let n = Math.round(ms / SUBSTEP_MS); n > 0; n--) {
    bird.vy = Math.min(bird.vy + GRAVITY * DT, MAX_FALL_VY);
    bird.y += bird.vy * DT;
    if (bird.y < BIRD_R) {
      bird.y = BIRD_R;
      bird.vy = 0;
    }

    for (const p of pipes) p.x -= PIPE_SPEED * DT;
    let lastX = pipes.at(-1).x;
    while (pipes.length && pipes[0].x + PIPE_W < 0) pipes.shift();
    while (lastX < WORLD_W) {
      lastX += PIPE_SPACING;
      pipes.push(newPipe(state, lastX));
    }

    state.t += SUBSTEP_MS;

    if (bird.y + BIRD_R >= GROUND_Y) {
      state.alive = false;
      state.cause = 'ground';
      return state;
    }
    for (const p of pipes) {
      const overlaps = p.x < BIRD_X + BIRD_R && p.x + PIPE_W > BIRD_X - BIRD_R;
      if (overlaps && (bird.y - BIRD_R < p.gapY - GAP_H / 2 || bird.y + BIRD_R > p.gapY + GAP_H / 2)) {
        state.alive = false;
        state.cause = 'pipe';
        return state;
      }
    }

    for (const p of pipes) {
      if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
        p.passed = true;
        state.score += 1;
      }
    }
  }
  return state;
}
