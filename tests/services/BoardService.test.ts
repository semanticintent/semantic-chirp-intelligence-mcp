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

describe('the pick (D49)', () => {
  const PICK = { analysis_insights: {
    pick_number: 3, roster_needs: ['G', 'L'], take: 'Wolf fills the hole you actually have (G). Best available is a luxury; a full lineup is not.',
    top_candidates: [
      { player_id: '8481692', name: 'Dustin Wolf', position: 'G', team: 'CGY', reasoning: 'Dustin Wolf (G, CGY) — 9th best producer, 6 slots above this pick — fills a roster hole.' },
      { player_id: '8470000', name: 'Deep Sleeper', position: 'L', team: 'UTA', reasoning: 'Deep Sleeper (LW, UTA) — 180th best producer, 177 slots below this pick.' },
    ],
  } };
  let calls: any[];
  beforeEach(() => {
    calls = [];
    vi.spyOn(tools, 'callTool').mockImplementation(async (name: string, args: any) => {
      calls.push([name, args]);
      return { content: [{ type: 'text', text: JSON.stringify(name === 'chirp_draft_pick' ? PICK : KIT) }] } as any;
    });
  });

  it('asks nothing extra without your picks', async () => {
    const b = await buildBoard({ drafted_text: 'Connor McDavid' });
    expect(b.pick).toBeUndefined();
    expect(calls.map((c) => c[0])).toEqual(['draft_kit']);
  });

  it('carries the analyst\'s pick in its own order, with your picks counted as drafted', async () => {
    const b = await buildBoard({ drafted_text: 'Bob Nobody', mine_text: 'Connor McDavid', playoff_start_week: 23, playoff_end_week: 25 });
    const [, args] = calls.find((c) => c[0] === 'chirp_draft_pick');
    expect(args).toMatchObject({ roster_text: 'Connor McDavid', already_drafted: ['Bob Nobody', 'Connor McDavid'], playoff_start_week: 23, playoff_end_week: 25, max_results: 3 });
    expect(b.positions.C[0].players[0].taken).toBe(true);
    expect(b.pick).toEqual({
      on_clock: 3, needs: ['G', 'LW'], take: PICK.analysis_insights.take,
      picks: [
        { id: '8481692', name: 'Wolf', club: 'CGY', pos: 'G', why: '9th best producer, 6 slots above this pick — fills a roster hole.', on_board: true },
        { id: '8470000', name: 'Sleeper', club: 'UTA', pos: 'LW', why: '180th best producer, 177 slots below this pick.', on_board: false },
      ],
    });
  });

  it.skipIf(!existsSync(SCHEMA))('validates with a pick', async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
    const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA, 'utf8')));
    const b = await buildBoard({ mine_text: 'Connor McDavid' });
    expect(validate(b), JSON.stringify(validate.errors)).toBe(true);
  });
});
