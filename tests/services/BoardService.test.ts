/** The draft board the screen draws: draft_kit's tiers with ids, the drafted crossed off, the unknowns stated. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as tools from '../../src/tools.js';
import { NHL_STATS } from '../../src/services/NhlStatsService.js';
import { ROSTER_STORE } from '../../src/services/RosterStore.js';
import { buildBoard } from '../../src/services/BoardService.js';

const SCHEMA = resolve(__dirname, '../../../sepiola/contracts/board.schema.json');
const tier = (players: any[]) => [{ tier: 1, players }];
const KIT = { analysis_insights: {
  source: 'NHL club stats 20252026', schedule_source: 'NHL schedule 20262027',
  positions: { C: { tiers: tier([{ rank: 1, name: 'Connor McDavid', team: 'EDM', age: 29.7, ppg: 1.68, playoff_games: null, flags: ['3.7 shots/gm'] }, { rank: 4, name: 'Macklin Celebrini', team: 'SJS', age: 20.3, ppg: 1.4, playoff_games: null, flags: [] }]), dries_up_after: 'tier 4' },
    LW: { tiers: [] }, RW: { tiers: [] }, D: { tiers: [] }, G: { tiers: tier([{ rank: 9, name: 'Dustin Wolf', team: 'CGY', age: 25, ppg: 0, playoff_games: null, flags: [] }]) } },
  not_included: ['Projections for the coming season'],
} };
const IDS: Record<string, string> = { 'Connor McDavid': '8478402', 'Macklin Celebrini': '8484801', 'Dustin Wolf': '8481692' };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(tools, 'callTool').mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(KIT) }] } as any);
  vi.spyOn(NHL_STATS, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_STATS, 'resolve').mockImplementation((n: string) => ({ input: n, player: IDS[n] ? { player_id: IDS[n], name: n } as any : null }));
  vi.spyOn(ROSTER_STORE, 'parseRoster').mockImplementation((text: string) => ({
    resolved: text.includes('McDavid') ? [{ player_id: '8478402', name: 'Connor McDavid', team: 'EDM', position: 'C' }] : [],
    unresolved: text.includes('Bob') ? [{ line: 'Bob Nobody', reason: 'no NHL player found with that name' }] : [], ambiguous: [], lines_read: 2,
  }));
});

describe('buildBoard', () => {
  it('carries ids, crosses off the drafted, names the best left, and reports what it could not resolve', async () => {
    const b = await buildBoard({ drafted_text: 'Connor McDavid\nBob Nobody', now: new Date('2026-09-22T00:00:00Z') });
    expect(b.positions.C[0].players.map((p) => [p.id, p.taken])).toEqual([['8478402', true], ['8484801', false]]);
    expect(b.taken).toBe(1);
    expect(b.take).toBe('1 off the board. Best left: Celebrini (C, SJS), rank 4.');
    expect(b.positions.C[0].players[1].note).toBe('1.4 points a game last season, age 20.');
    expect(b.positions.G[0].players[0].note).toBe('Tier 1 goalie, rank 9.');
    expect(b.dries_up.C).toBe('Thins out after tier 4.');
    expect(b.notes).toEqual(['Drafted, not resolved: "Bob Nobody" (no NHL player found with that name)']);
  });
  it.skipIf(!existsSync(SCHEMA))('validates against Sepiola\'s board contract', async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
    const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA, 'utf8')));
    const b = await buildBoard({});
    expect(validate(b), JSON.stringify(validate.errors)).toBe(true);
  });
});
