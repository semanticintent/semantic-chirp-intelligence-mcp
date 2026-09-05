#!/usr/bin/env node
/**
 * chirp-http — the analyst's second face.
 *
 * Same core as the MCP server, one stateless endpoint for the telestrator: POST /read with the pasted lineup returns a
 * Read (contracts/read.schema.json). `start` (YYYY-MM-DD) moves the window; before opening night, that is how you demo. Nothing is stored; the roster lives in the request. CORS is open by default so the
 * page can call it from any origin; set CHIRP_HTTP_ORIGIN to pin it. Localhost by default: CHIRP_HTTP_PORT (3200).
 *
 *   npm run build && node build/http.js
 *   curl -s localhost:3200/read -H 'content-type: application/json' -d '{"roster_text":"Nazem Kadri C\nConnor Zary LW"}'
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { readIceFromText } from './services/ReadIceService.js';
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
  const send = (res: ServerResponse, status: number, payload: unknown) => {
    cors(res);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }
    if (req.method === 'GET' && url.pathname === '/health') {
      send(res, 200, { ok: true, analyst: 'chirp', season: NHL_SCHEDULE.getSeason(), read: 'POST /read { roster_text, look_ahead_days?, opponent_text?, start? }' });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/read') {
      let input: any;
      try { input = JSON.parse((await body(req)) || '{}'); }
      catch (e) { send(res, 400, { error: e instanceof Error && e.message === 'Body too large.' ? e.message : 'Body must be JSON: { roster_text, look_ahead_days?, opponent_text? }' }); return; }
      if (typeof input.roster_text !== 'string' || !input.roster_text.trim()) {
        send(res, 400, { error: 'roster_text is required — paste your lineup, one player per line.' });
        return;
      }
      try {
        const read = await readIceFromText(input.roster_text, {
          look_ahead_days: typeof input.look_ahead_days === 'number' ? input.look_ahead_days : undefined,
          opponent_text: typeof input.opponent_text === 'string' ? input.opponent_text : undefined,
          today: typeof input.start === 'string' ? input.start : undefined,
        });
        send(res, 200, read);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        send(res, message.startsWith('No players resolved') || message.startsWith('start must be') ? 422 : 503, { error: message });
      }
      return;
    }
    send(res, 404, { error: 'Not found. POST /read or GET /health.' });
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
