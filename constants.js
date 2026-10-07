// Every tuning number for the game lives here, as plain literals.
// The value in this file is the value that runs: nothing reads these from the
// environment. Secrets and per-machine values (API key, port, API host) are in .env.

// --- World (logical pixels; the canvas is scaled to fit the screen) ---
export const WORLD_W = 360;
export const WORLD_H = 640;
export const GROUND_Y = 560; // top of the ground; touching it ends the run

// --- Bird ---
export const BIRD_X = 100; // the bird never moves sideways; the pipes do
export const BIRD_R = 12; // hitbox half-size
export const BIRD_START_Y = 280;

// --- Physics (per second). Stepped in fixed SUBSTEP_MS slices so a run is
// exactly repeatable from its seed. ---
export const GRAVITY = 1400; // px/s^2, downward is positive
export const FLAP_VY = -420; // a flap SETS vertical speed to this (it does not add)
export const MAX_FALL_VY = 480; // capped so the bird cannot drop through a whole
// gap between two of Jev's answers (48 px per decision vs a 180 px gap)
export const SUBSTEP_MS = 10;

// --- Pipes ---
export const PIPE_SPEED = 150; // px/s, leftward
export const PIPE_W = 64;
export const GAP_H = 180; // one flap lifts the bird ~61 px, about a third of this
export const PIPE_SPACING = 220; // left edge to left edge
export const FIRST_PIPE_X = 460; // off-screen, so the run opens with clear air
export const GAP_MIN_Y = 170; // range for the centre of a gap
export const GAP_MAX_Y = 400;

// --- Jev ---
// Game time between two of Jev's answers. The docs say most Jev calls take
// about 100 ms, so at this value the game runs near full speed when Jev is quick.
export const DECISION_STEP_MS = 100;
export const FLAP_THRESHOLD = 0.5; // flap when Jev's "yes" probability is at least this
export const JEV_MODEL = 'jev-latest'; // pin 'jev-1.13.0' to stop answers moving under you
// How long the server waits for Jev before pausing the game. No retries: a
// retried answer would describe a moment that has already been waited for.
export const JEV_TIMEOUT_MS = 4000;
// Jev's answer to each situation is remembered, and at take-off the ones not
// yet known are asked in the background: the page sends them to the server
// this many per request, and the server asks Jev for all of them at once.
// Measured on 6 Oct 2026: 16 at a time gets through all 140 situations in
// about 3.5 s, at roughly half of TypeSafe's limit of 80 requests a second.
export const JEV_PARALLEL = 16;
// After a background batch fails (rate limit, outage), wait this long before
// trying the unanswered situations again, so a failing Jev is not hammered.
export const JEV_RETRY_MS = 3000;
// Crash notes sent back to Jev with every question (how it learns). Each one
// adds about 30 tokens to every question, and Jev gets less accurate as its
// state fills with detail, so only the most recent distinct ones are kept.
export const MAX_NOTES = 12;

// --- How the situation is put into words for Jev (pilot.js) ---
// Jev is weak with raw numbers, so code turns each number into a named band.
// HEIGHT: bird centre minus gap centre, in px. Negative = bird is higher.
// The bird clears the pipes while |offset| <= GAP_H/2 - BIRD_R = 78.
export const HEIGHT_EDGE = 78; // beyond this the bird is level with a pipe
export const HEIGHT_NEAR_EDGE = 35; // beyond this it is "near" the gap's edge
export const HEIGHT_MIDDLE = 10; // within this it is "in the middle"
// MOVEMENT: vertical speed in px/s. Negative = rising.
export const SPEED_FAST_RISE = -200;
export const SPEED_LEVEL = 50; // within +/- this it is "hovering"
export const SPEED_FAST_FALL = 250;
// DISTANCE: from the bird's front edge to the next pipe's left edge, in px.
export const DIST_FAR = 150;
export const DIST_CLOSE = 60;
