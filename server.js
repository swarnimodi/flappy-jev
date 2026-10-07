// Serves the game and forwards each "flap now?" question to Jev, so the API
// key stays on this machine and never reaches the browser.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { JEV_MODEL, JEV_TIMEOUT_MS, JEV_PARALLEL } from './constants.js';
import { isSituation, areNotes, buildRequest, readAnswer } from './pilot.js';

const KEY = process.env.TYPESAFE_API_KEY;
const API = process.env.TYPESAFE_API_URL || 'https://api.typesafe.ai';
const PORT = process.env.PORT || 4173;

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/game.js': ['game.js', 'text/javascript; charset=utf-8'],
  '/pilot.js': ['pilot.js', 'text/javascript; charset=utf-8'],
  '/constants.js': ['constants.js', 'text/javascript; charset=utf-8'],
};

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16000) throw new Error('body too large');
  }
  return JSON.parse(raw);
}

// One question to Jev: its answer, or the reason there is none. No retries:
// the game is waiting, and a late answer is worth less than saying Jev is slow.
async function askJev(situation, notes) {
  const started = performance.now();
  let reply;
  try {
    reply = await fetch(`${API}/v1/systemone`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify(buildRequest(situation, notes)),
      signal: AbortSignal.timeout(JEV_TIMEOUT_MS),
    });
  } catch (err) {
    return { error: err.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
  }
  if (reply.status === 401 || reply.status === 403) return { error: 'bad_key' };
  if (reply.status === 429 || reply.status === 529) return { error: 'busy' };
  if (!reply.ok) return { error: 'jev_error', status: reply.status };
  try {
    const body = await reply.json();
    return { p: readAnswer(body), ms: Math.round(performance.now() - started), model: body.model };
  } catch (err) {
    return { error: err.name === 'TimeoutError' ? 'timeout' : 'bad_answer' };
  }
}

// A browser will happily send requests from any web page to a local server, so
// "local only" needs two more checks before anything is spent: the request
// must be addressed to this server by its own name, and a question must come
// from this server's own page as JSON (which other sites cannot send unasked).
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const fromHere = (req) => !req.headers.origin || HOSTS.has(req.headers.origin.replace(/^https?:\/\//, ''));

async function handle(req, res) {
  let pathname;
  try {
    ({ pathname } = new URL(req.url, 'http://localhost'));
  } catch {
    return send(res, 400, { error: 'bad_request' });
  }
  if (!HOSTS.has(req.headers.host)) return send(res, 403, { error: 'forbidden' });

  if (req.method === 'GET' && FILES[pathname]) {
    const [file, type] = FILES[pathname];
    const content = await readFile(new URL(file, import.meta.url));
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    return res.end(content);
  }

  if (req.method === 'GET' && pathname === '/api/status') {
    return send(res, 200, { hasKey: Boolean(KEY), model: JEV_MODEL });
  }

  if (req.method === 'POST' && pathname === '/api/decide') {
    if (!fromHere(req) || !/^application\/json\b/.test(req.headers['content-type'] ?? '')) return send(res, 403, { error: 'forbidden' });
    let body;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, { error: 'bad_request' });
    }
    // Only phrases and crash notes from pilot.js's own word lists go to Jev;
    // the sentences Jev reads are written here, never taken from the request.
    // A request carries up to JEV_PARALLEL situations, asked of Jev all at once.
    const ok = body !== null && typeof body === 'object' && Object.keys(body).length === 2 &&
      Array.isArray(body.situations) && body.situations.length >= 1 && body.situations.length <= JEV_PARALLEL &&
      body.situations.every(isSituation) && areNotes(body.notes);
    if (!ok) return send(res, 400, { error: 'bad_request' });
    if (!KEY) return send(res, 503, { error: 'no_key' });
    return send(res, 200, { answers: await Promise.all(body.situations.map((s) => askJev(s, body.notes))) });
  }

  send(res, 404, { error: 'not_found' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(() => {
    if (res.headersSent) res.destroy();
    else send(res, 500, { error: 'server_error' });
  });
});

// Local only: this endpoint spends the API key, so it is not offered to the network.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Flappy Jev: http://127.0.0.1:${PORT}  (Jev key ${KEY ? 'found' : 'missing: add TYPESAFE_API_KEY to .env'})`);
});
