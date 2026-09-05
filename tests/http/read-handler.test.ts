/** The shared handler behind chirp-http and chirp-edge. */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { handleReadRequest } from '../../src/read-handler.js';
import { NHL_SCHEDULE } from '../../src/services/NhlScheduleService.js';
import { NHL_STATS } from '../../src/services/NhlStatsService.js';
import { ROSTER_STORE } from '../../src/services/RosterStore.js';

beforeAll(() => {
  vi.spyOn(NHL_SCHEDULE, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_SCHEDULE, 'getSeason').mockReturnValue('20262027');
  vi.spyOn(NHL_SCHEDULE, 'hasGameOn').mockReturnValue(false);
  vi.spyOn(NHL_SCHEDULE, 'countBackToBacks').mockReturnValue(0);
  vi.spyOn(NHL_STATS, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_STATS, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_STATS, 'getById').mockReturnValue(null);
  vi.spyOn(ROSTER_STORE, 'parseRoster').mockImplementation((text) => ({
    resolved: text.includes('Kadri') ? [{ player_id: 'kadri', name: 'Nazem Kadri', team: 'CGY', position: 'C' }] : [],
    unresolved: [], ambiguous: [], lines_read: 1,
  }));
});

describe('handleReadRequest', () => {
  it('health', async () => {
    const r = await handleReadRequest('GET', '/health', '');
    expect(r.status).toBe(200);
    expect(r.payload).toMatchObject({ ok: true, season: '20262027' });
  });
  it('read, with a pinned start', async () => {
    const r = await handleReadRequest('POST', '/read', JSON.stringify({ roster_text: 'Nazem Kadri C', start: '2026-10-12', look_ahead_days: 3 }));
    expect(r.status).toBe(200);
    expect((r.payload as any).window).toMatchObject({ start: '2026-10-12', days: 3 });
  });
  it('refuses bad input with the right status', async () => {
    expect((await handleReadRequest('POST', '/read', 'nope')).status).toBe(400);
    expect((await handleReadRequest('POST', '/read', '{}')).status).toBe(400);
    expect((await handleReadRequest('POST', '/read', JSON.stringify({ roster_text: 'Bob' }))).status).toBe(422);
    expect((await handleReadRequest('POST', '/read', JSON.stringify({ roster_text: 'Nazem Kadri', start: 'Monday' }))).status).toBe(422);
    expect((await handleReadRequest('GET', '/nope', '')).status).toBe(404);
  });
});
