/** The one way to call the NHL API: a User-Agent, bounded concurrency, retries on 429 and 5xx. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { nhlFetch, NHL_FETCH_MAX_CONCURRENT } from '../../src/services/nhl-fetch.js';

afterEach(() => vi.unstubAllGlobals());

const ok = (body = {}) => ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as unknown as Response;

describe('nhlFetch', () => {
  it('identifies itself', async () => {
    const spy = vi.fn(async () => ok());
    vi.stubGlobal('fetch', spy);
    await nhlFetch('https://api-web.nhle.com/v1/roster/TOR/20262027');
    expect(spy.mock.calls[0][1].headers['user-agent']).toMatch(/semantic-chirp-intelligence-mcp/);
  });

  it('retries a 429 after backing off, then gives up honestly', async () => {
    vi.useFakeTimers();
    const spy = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'retry-after': '1' }) })
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers() })
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers() });
    vi.stubGlobal('fetch', spy);
    const p = nhlFetch('https://api-web.nhle.com/v1/x');
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2500);
    const res = await p;
    expect(spy).toHaveBeenCalledTimes(3);
    expect(res.status).toBe(429);
    vi.useRealTimers();
  });

  it('recovers when the retry succeeds', async () => {
    vi.useFakeTimers();
    const spy = vi.fn().mockResolvedValueOnce({ ok: false, status: 503, headers: new Headers() }).mockResolvedValueOnce(ok({ fine: true }));
    vi.stubGlobal('fetch', spy);
    const p = nhlFetch('https://api-web.nhle.com/v1/x');
    await vi.advanceTimersByTimeAsync(750);
    expect((await p).status).toBe(200);
    vi.useRealTimers();
  });

  it('never has more than the limit in flight', async () => {
    let inFlight = 0; let peak = 0; const release: (() => void)[] = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      inFlight++; peak = Math.max(peak, inFlight);
      release.push(() => { inFlight--; resolve(ok()); });
    })));
    const all = Promise.all(Array.from({ length: 12 }, (_, i) => nhlFetch(`https://api-web.nhle.com/v1/${i}`)));
    await Promise.resolve();
    expect(peak).toBe(NHL_FETCH_MAX_CONCURRENT);
    while (release.length) { release.shift()!(); await Promise.resolve(); await Promise.resolve(); }
    await all;
    expect(peak).toBe(NHL_FETCH_MAX_CONCURRENT);
  });
});
