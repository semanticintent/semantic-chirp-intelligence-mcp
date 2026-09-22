/** The registry: one list, one entry point, and the pasted-roster override that makes it work without a disk. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TOOL_DEFINITIONS, callTool, setStateless, PASTED_ROSTER_SCHEMA } from '../src/tools.js';
import { NHL_STATS } from '../src/services/NhlStatsService.js';
import { NHL_SCHEDULE } from '../src/services/NhlScheduleService.js';
import { ROSTER_STORE, RosterStore } from '../src/services/RosterStore.js';

const KADRI = { player_id: 'kadri', name: 'Nazem Kadri', team: 'CGY', position: 'C' };

beforeEach(() => {
  vi.restoreAllMocks();
  setStateless(false);
  vi.spyOn(NHL_SCHEDULE, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_SCHEDULE, 'loadStandings').mockResolvedValue(undefined);
  vi.spyOn(NHL_STATS, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_STATS, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_STATS, 'getById').mockImplementation((id) => (id === 'kadri' ? { ...KADRI, team: 'CGY' as any, stats: { games_played: 70, points: 50 } } : null));
  vi.spyOn(ROSTER_STORE, 'parseRoster').mockImplementation((text) => ({
    resolved: text.includes('Kadri') ? [KADRI] : [], unresolved: [], ambiguous: [], lines_read: 1,
  }));
});

describe('TOOL_DEFINITIONS', () => {
  it('lists 23 uniquely named tools with object schemas', () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toHaveLength(24);
    expect(new Set(names).size).toBe(24);
    for (const t of TOOL_DEFINITIONS) expect(t.inputSchema.type).toBe('object');
  });
  it('lets every roster-dependent tool take the roster in its arguments', () => {
    for (const name of ['ice', 'get_games_in_hand', 'draft_kit', 'chirp_opponent', 'get_team_roster']) {
      const t = TOOL_DEFINITIONS.find((x) => x.name === name)!;
      expect(Object.keys(t.inputSchema.properties ?? {})).toEqual(expect.arrayContaining(Object.keys(PASTED_ROSTER_SCHEMA)));
    }
  });
  it('every definition has a handler', async () => {
    for (const t of TOOL_DEFINITIONS) {
      const r = await callTool(t.name, {});
      expect(r, t.name).toHaveProperty('content');
      const text = (r.content[0] as any).text as string;
      expect(text, t.name).not.toMatch(/^Error: Unknown tool/);
    }
  });
});

describe('callTool', () => {
  it('refuses unknown tools as a result, not a throw', async () => {
    const r = await callTool('rank_my_league', {});
    expect(r.isError).toBe(true);
    expect((r.content[0] as any).text).toMatch(/Unknown tool/);
  });
  it('uses a pasted roster for the call and forgets it afterwards', async () => {
    const r = await callTool('get_team_roster', { roster_text: 'Nazem Kadri C' });
    const body = JSON.parse((r.content[0] as any).text);
    expect(JSON.stringify(body)).toContain('Kadri');
    expect(ROSTER_STORE.getRoster('roster')?.label).not.toBe('pasted roster'); // outside the call: the paste is gone
  });
  it('in stateless mode the set_* tools refuse and say what to do instead', async () => {
    setStateless(true);
    const r = await callTool('set_roster', { roster_text: 'Nazem Kadri C' });
    expect(r.isError).toBe(true);
    expect((r.content[0] as any).text).toMatch(/keeps no state.*roster_text/);
    expect(ROSTER_STORE.getRoster('roster')).toBeNull();
  });
});

describe('RosterStore.runWith', () => {
  it('scopes a pasted roster to the async call', async () => {
    const store = new RosterStore('/tmp/chirp-nope-' + Date.now());
    const seenInside = await RosterStore.runWith({ roster: RosterStore.asStored([KADRI], 'x') }, async () => store.getRoster('roster')?.players[0]?.name);
    expect(seenInside).toBe('Nazem Kadri');
    expect(store.getRoster('roster')).toBeNull();
  });
  it('keeps concurrent calls apart', async () => {
    const store = new RosterStore('/tmp/chirp-nope-' + Date.now());
    const a = RosterStore.runWith({ roster: RosterStore.asStored([{ ...KADRI, name: 'A' }], 'a') }, async () => { await new Promise((r) => setTimeout(r, 5)); return store.getRoster('roster')!.players[0].name; });
    const b = RosterStore.runWith({ roster: RosterStore.asStored([{ ...KADRI, name: 'B' }], 'b') }, async () => store.getRoster('roster')!.players[0].name);
    expect(await Promise.all([a, b])).toEqual(['A', 'B']);
  });
});
