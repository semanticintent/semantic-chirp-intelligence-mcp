/** chirp-http: POST /read answers with a Read and CORS; everything else is refused with a reason. */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createHttpServer } from '../../src/http.js';
import { NHL_SCHEDULE, NhlScheduleService } from '../../src/services/NhlScheduleService.js';

const today = NhlScheduleService.today();
const GAME_DAYS = [NhlScheduleService.addDays(today, 1), NhlScheduleService.addDays(today, 3)];
import { NHL_STATS } from '../../src/services/NhlStatsService.js';
import { ROSTER_STORE } from '../../src/services/RosterStore.js';

let base: string;
const server = createHttpServer({ origin: 'http://telestrator.test' });

beforeAll(async () => {
  vi.spyOn(NHL_SCHEDULE, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_SCHEDULE, 'getSeason').mockReturnValue('20262027');
  vi.spyOn(NHL_SCHEDULE, 'hasGameOn').mockImplementation((_abbr, date) => GAME_DAYS.includes(date));
  vi.spyOn(NHL_SCHEDULE, 'countBackToBacks').mockReturnValue(0);
  vi.spyOn(NHL_SCHEDULE, 'countGamesInRange').mockReturnValue(2);
  vi.spyOn(NHL_STATS, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_STATS, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_STATS, 'getById').mockReturnValue(null);
  vi.spyOn(ROSTER_STORE, 'parseRoster').mockImplementation((text) => ({
    resolved: text.includes('Kadri') ? [{ player_id: 'kadri', name: 'Nazem Kadri', team: 'CGY', position: 'C' }] : [],
    unresolved: [], ambiguous: [], lines_read: 1,
  }));
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('chirp-http', () => {
  it('answers /health', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, analyst: 'chirp', season: '20262027' });
  });
  it('answers a preflight with CORS for the configured origin', async () => {
    const res = await fetch(`${base}/read`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://telestrator.test');
    expect(res.headers.get('access-control-allow-headers')).toContain('content-type');
  });
  it('POST /read returns a Read for a pasted lineup', async () => {
    const res = await fetch(`${base}/read`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roster_text: 'Nazem Kadri C', look_ahead_days: 7 }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://telestrator.test');
    const read = await res.json();
    expect(read.contract_version).toBe('0.1');
    expect(read.skaters[0]).toMatchObject({ id: 'kadri', name: 'Kadri', pos: 'C', slot: 'L1', club: 'CGY' });
    expect(read.skaters[0].games.filter(Boolean)).toHaveLength(2);
  });
  it('refuses a body without roster_text, a body that is not JSON, and a paste with nobody in it', async () => {
    const post = (body: string) => fetch(`${base}/read`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    expect((await post('{}')).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
    const nobody = await post(JSON.stringify({ roster_text: 'Bob Nobody' }));
    expect(nobody.status).toBe(422);
    expect((await nobody.json()).error).toMatch(/No players resolved/);
  });
  it('404s everything else', async () => {
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
