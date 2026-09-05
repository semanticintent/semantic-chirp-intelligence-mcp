#!/usr/bin/env node
/**
 * chirp-http — the analyst's second face.
 *
 * Same core as the MCP server, one stateless endpoint for Sepiola, the telestrator: POST /read with the pasted lineup returns a
 * Read (contracts/read.schema.json). `start` (YYYY-MM-DD) moves the window; before opening night, that is how you demo. Nothing is stored; the roster lives in the request. CORS is open by default so the
 * page can call it from any origin; set CHIRP_HTTP_ORIGIN to pin it. Localhost by default: CHIRP_HTTP_PORT (3200).
 *
 *   npm run build && node build/http.js
 *   curl -s localhost:3200/read -H 'content-type: application/json' -d '{"roster_text":"Nazem Kadri C\nConnor Zary LW"}'
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { handleReadRequest } from './read-handler.js';
import { NHL_SCHEDULE } from './services/NhlScheduleService.js';
import { NHL_STATS } from './services/NhlStatsService.js';

const MAX_BODY = 1_000_000;

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > MAX_BODY) reject(new Error('Body too large.')); });
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}

export function createHttpServer(options: { origin?: string } = {}): Server {
  const origin = options.origin ?? process.env.CHIRP_HTTP_ORIGIN ?? '*';
  const cors = (res: ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  };
  return createServer(async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url ?? '/', 'http://localhost');
    let text = '';
    try { text = req.method === 'POST' ? await body(req) : ''; }
    catch { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Body too large.' })); return; }
    const { status, payload } = await handleReadRequest(req.method ?? 'GET', url.pathname, text);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
}

// Run directly: node build/http.js
if (process.argv[1] && /http\.js$/.test(process.argv[1])) {
  const port = Number(process.env.CHIRP_HTTP_PORT ?? 3200);
  createHttpServer().listen(port, () => {
    console.error(`chirp-http listening on http://localhost:${port} — POST /read, GET /health`);
  });
  // Warm the schedule and the player index so the first read does not wait on the NHL.
  void Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load()]).then(
    () => console.error(`chirp-http ready: season ${NHL_SCHEDULE.getSeason() ?? 'unknown'}, ${NHL_STATS.getPlayerCount()} players`),
    (e) => console.error(`chirp-http: preload failed — ${e instanceof Error ? e.message : String(e)}`),
  );
}
