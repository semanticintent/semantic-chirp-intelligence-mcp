/**
 * chirp-edge — the analyst on Cloudflare Workers, so the telestrator page can read without a local server.
 *
 * Same core as the MCP server and chirp-http; the NHL services cache in KV instead of on disk. Stateless: the roster
 * travels in the request. Anonymous by default with a per-address rate limit and CORS allowlisted to the page (CORS_ORIGIN,
 * comma-separated; add the ChatGPT Site origin there when the single file is published to one).
 * AUTH_MODE=jwt is reserved for a Signet-issued token check, modelled on Wake's JWKS validator, and is not wired yet.
 *
 * The NHL's edge throttles shared egress addresses (429), so the 96 club requests are never made on a viewer's clock:
 * a cron warms KV every six hours, and a request that finds KV cold starts the warm-up in the background and says so.
 *
 *   npm run edge:dev      local Worker on http://localhost:8787
 *   npm run edge:deploy
 */
import { NHL_SCHEDULE } from './services/NhlScheduleService.js';
import { NHL_STATS } from './services/NhlStatsService.js';
import { KvJsonCache, MemoryJsonCache, type KvLike } from './services/cache.js';
import { handleReadRequest } from './read-handler.js';
import { setVersion } from './version.js';
import { corsOrigin } from './cors.js';
import pkg from '../package.json';

export interface Env {
  CACHE?: KvLike;
  CORS_ORIGIN?: string;
  AUTH_MODE?: 'none' | 'jwt';
  READ_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

let wired = false;
const WARM_WAIT_MS = 8000;

function wire(env: Env): void {
  if (wired) return;
  setVersion(String((pkg as { version?: string }).version ?? '0.0.0'));
  const cache = env.CACHE ? new KvJsonCache(env.CACHE) : new MemoryJsonCache();
  NHL_SCHEDULE.setCache(cache);
  NHL_STATS.setCache(cache);
  wired = true;
}

/** Load both NHL indexes; from KV in ~100 ms when warm, from the NHL (paced) when cold. */
const warm = (): Promise<unknown> => Promise.all([NHL_SCHEDULE.load(), NHL_STATS.load()]);

export default {
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    wire(env);
    ctx.waitUntil(warm());
    await warm();
    console.error(`[cron] warmed: schedule ${NHL_SCHEDULE.isAvailable() ? 'ok' : NHL_SCHEDULE.getUnavailableReason()}; players ${NHL_STATS.isAvailable() ? NHL_STATS.getPlayerCount() : NHL_STATS.getUnavailableReason()}`);
  },

  async fetch(request: Request, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    wire(env);
    const origin = corsOrigin(request.headers.get('origin'), env.CORS_ORIGIN);
    const headers: Record<string, string> = {
      ...(origin ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}),
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'content-type': 'application/json',
    };
    const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status, headers });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if ((env.AUTH_MODE ?? 'none') === 'jwt') return json(501, { error: 'AUTH_MODE=jwt is declared but not wired on this analyst yet.' });

    if (request.method === 'POST' && env.READ_LIMIT) {
      const key = request.headers.get('cf-connecting-ip') ?? 'anonymous';
      const { success } = await env.READ_LIMIT.limit({ key });
      if (!success) return json(429, { error: 'Easy. Too many reads from this address; try again in a minute.' });
    }

    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/read') {
      const ready = warm().then(() => 'ready' as const);
      const late = new Promise<'late'>((r) => setTimeout(() => r('late'), WARM_WAIT_MS));
      if ((await Promise.race([ready, late])) === 'late') {
        ctx.waitUntil(ready);
        return json(503, { error: 'The analyst is warming up its NHL data. Try again in a minute.', warming: true });
      }
    }
    const text = request.method === 'POST' ? await request.text() : '';
    if (text.length > 1_000_000) return json(400, { error: 'Body too large.' });
    const { status, payload } = await handleReadRequest(request.method, url.pathname, text);
    return json(status, payload);
  },
};
