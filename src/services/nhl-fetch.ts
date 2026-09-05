/**
 * One way to call the NHL public API from anywhere this code runs.
 *
 * - A User-Agent: the NHL's edge answers 403 to some clients that send none, and Workers send none by default.
 * - Bounded concurrency: 32 clubs × 2 endpoints fired at once from one egress address invites throttling.
 * - Two retries with backoff on 429 and 5xx, honouring Retry-After when it is short.
 */
const USER_AGENT = 'semantic-chirp-intelligence-mcp (+https://github.com/semanticintent/semantic-chirp-intelligence-mcp)';
const MAX_CONCURRENT = 4;
const BACKOFF_MS = [750, 2500];
const RETRY_STATUSES = new Set([429, 502, 503, 504]); // 500 from the NHL means 'no such thing', not 'try again'

let active = 0;
const queue: (() => void)[] = [];
const acquire = (): Promise<void> => new Promise((resolve) => { if (active < MAX_CONCURRENT) { active++; resolve(); } else queue.push(() => { active++; resolve(); }); });
const release = (): void => { active--; queue.shift()?.(); };
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function nhlFetch(url: string): Promise<Response> {
  await acquire();
  try {
    let res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
    for (const backoff of BACKOFF_MS) {
      if (!RETRY_STATUSES.has(res.status)) break;
      const after = Number(res.headers?.get?.('retry-after'));
      await sleep(Number.isFinite(after) && after > 0 && after <= 10 ? after * 1000 : backoff);
      res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
    }
    return res;
  } finally {
    release();
  }
}

/** For tests: how many requests may be in flight at once. */
export const NHL_FETCH_MAX_CONCURRENT = MAX_CONCURRENT;
