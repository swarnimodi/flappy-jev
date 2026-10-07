// Recorded flights with the REAL Jev, in a real browser, one after another, so
// you can see whether its crash notes make it fly further. Uses the key in .env
// and spends a little API credit (roughly 300 to 700 tokens per question, 140 questions per set of notes).
// Starts with an empty memory, in its own browser, so your own notes are untouched.
// Saves a screenshot and decision log per run, and a summary, to runs/<timestamp>-real/.
//   npm run fly                               (6 runs, up to 60 s each, seed 7)
//   FLY_RUNS=10 FLY_SECONDS=120 FLY_SEED=3 npm run fly
// Every run uses the same pipe layout (the seed), so runs can be compared.
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { createGame, advance } from '../game.js';
import { DECISION_STEP_MS } from '../constants.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-real`);
const SEED = Number(process.env.FLY_SEED) || 7;
const SECONDS = Number(process.env.FLY_SECONDS) || 60;
const RUNS = Number(process.env.FLY_RUNS) || 6;
const PORT = 4794, SESSION = 'flappy-fly';

const ab = (args, input) =>
  execFileSync('agent-browser', ['--session', SESSION, ...args], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const js = (code) => JSON.parse(ab(['--json', 'eval', '--stdin'], code)).data.result;
const press = (name) => ab(['find', 'role', 'button', 'click', '--name', name]);

const server = spawn('node', ['--env-file=.env', 'server.js'], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
let exit = 0;
try {
  let status;
  for (let i = 0; i < 50 && !status; i++) {
    try { status = await (await fetch(`http://127.0.0.1:${PORT}/api/status`)).json(); } catch { await sleep(100); }
  }
  if (!status?.hasKey) throw new Error('No TYPESAFE_API_KEY in .env, so there is no real Jev to fly.');

  mkdirSync(out, { recursive: true });
  ab(['set', 'viewport', '1280', '800']);
  ab(['open', `http://127.0.0.1:${PORT}/?seed=${SEED}`]);
  js('(localStorage.clear(), 1)');
  ab(['open', `http://127.0.0.1:${PORT}/?seed=${SEED}`]);
  ab(['wait', '--fn', "!document.getElementById('primary').disabled"]);

  const results = [];
  for (let n = 1; n <= RUNS; n++) {
    const notesBefore = js('flappy.notes.length');
    await sleep(600); // the crash card ignores taps for its first half second
    press(n === 1 || results.at(-1).stopped ? 'Let Jev fly' : 'Fly again');
    ab(['wait', '--fn', "flappy.mode !== 'over' && flappy.mode !== 'idle'"]); // the run really started
    const started = Date.now();
    let mode = 'jev';
    while (mode === 'jev' && Date.now() - started < SECONDS * 1000) {
      await sleep(1000);
      mode = js('flappy.mode');
    }
    // Exact floats cross the browser tool as text: its JSON layer can change the last digit of a number.
    const f = js(`({ mode: flappy.mode, score: flappy.score, alive: flappy.alive, cause: flappy.cause, lastError: flappy.lastError,
      pace: flappy.pace, birdY: String(flappy.birdY), notes: flappy.notes,
      noted: flappy.mode === 'over' && !document.getElementById('learned').hidden ? document.getElementById('learned').textContent : '',
      log: flappy.log.map((e) => ({ ...e, y: String(e.y), vy: String(e.vy) })) })`);
    ab(['screenshot', path.join(out, `run-${n}.png`)]);
    writeFileSync(path.join(out, `run-${n}-log.json`), JSON.stringify(f.log, null, 1));

    // The log must replay to the same flight through game.js, or the record is not trustworthy.
    const g = createGame(SEED);
    for (const e of f.log) advance(g, DECISION_STEP_MS, e.flap);
    const replays = g.score === f.score && String(g.bird.y) === f.birdY && g.alive === f.alive;
    const times = f.log.filter((e) => !e.remembered).map((e) => e.jevMs).sort((a, b) => a - b);
    const result = {
      run: n,
      outcome: f.mode === 'over' ? `crashed into ${f.cause === 'ground' ? 'the ground' : 'a pipe'}`
        : f.mode === 'paused' ? `paused: ${f.lastError}` : `still flying when the ${SECONDS} s were up`,
      pipesPassed: f.score, answers: f.log.length, gameSeconds: (f.log.length * DECISION_STEP_MS) / 1000,
      notesItFlewWith: notesBefore, noted: f.noted, answersFromMemory: f.log.filter((e) => e.remembered).length,
      gameSpeed: Number((DECISION_STEP_MS / f.pace).toFixed(2)), medianAnswerMs: times[times.length >> 1],
      logReplaysToTheSameFlight: replays,
      stopped: f.mode !== 'over',
    };
    results.push(result);
    console.log(JSON.stringify(result));
    if (!replays || !f.log.length) exit = 1;
    if (f.mode === 'paused') break; // Jev or the network is down; more runs would say nothing
    if (f.mode === 'jev') press('Stop Jev');
  }
  const summary = {
    ranAt: new Date().toISOString(), jev: status.model, seed: SEED, secondsAllowedPerRun: SECONDS,
    pipesPassedPerRun: results.map((r) => r.pipesPassed + (r.stopped ? '+' : '')).join(', '),
    notesAtTheEnd: js('flappy.notes'),
    runs: results,
  };
  writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  console.log(`\nPipes passed per run: ${summary.pipesPassedPerRun}   ("+" = still flying when time was up)`);
  console.log(`Saved to ${path.relative(root, out)}/`);
} catch (err) {
  console.error(err.message, String(err.stdout ?? '').slice(0, 600), String(err.stderr ?? '').slice(0, 600));
  exit = 1;
} finally {
  try { ab(['close']); } catch {}
  server.kill();
}
process.exit(exit);
