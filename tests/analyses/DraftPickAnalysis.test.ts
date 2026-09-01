import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DraftPickAnalysis } from '../../src/analyses/DraftPickAnalysis.js';
import { NHL_SCHEDULE } from '../../src/services/NhlScheduleService.js';
import { NHL_STATS } from '../../src/services/NhlStatsService.js';
import { LEAGUE_DATA } from '../../src/services/LeagueDataService.js';

const contract = {
  chirp_intensity: 'ice_cold' as const,
  personality_mode: 'championship_coach' as const,
  enable_chirp: true,
  semantic_intent: 'user_requested' as const
};

/** Pool ordered by production — index 0 is the best player left on the board. */
const POOL = [
  { player_id: '1', name: 'Faller Guy', position: 'RW', team: 'TOR', stats: { points: 110 } },
  { player_id: '2', name: 'On Time', position: 'C', team: 'BOS', stats: { points: 90 } },
  { player_id: '3', name: "Tim Stützle-O'Brien", position: 'C', team: 'OTT', stats: { points: 80 } },
  { player_id: '4', name: 'Way Early', position: 'D', team: 'SJS', stats: { points: 40 } }
];

function stubServices(pool = POOL, roster: any = null) {
  vi.spyOn(NHL_STATS, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'loadStandings').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(false);
  vi.spyOn(NHL_SCHEDULE, 'getUnavailableReason').mockReturnValue('stubbed off in tests');
  vi.spyOn(LEAGUE_DATA, 'getPlayerPool').mockReturnValue(pool as any);
  // already_drafted resolves through NHL_STATS, so back it with the same pool.
  const key = (x: string) => String(x).normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
  vi.spyOn(NHL_STATS, 'resolve').mockImplementation((input: string) => {
    const raw = String(input ?? '').trim();
    if (!raw) return { input: raw, player: null, reason: 'empty' } as any;
    const normalized = raw.includes(',')
      ? raw.split(',').map(v => v.trim()).reverse().join(' ')
      : raw;
    const exact = pool.filter((p: any) => key(p.name) === key(normalized));
    if (exact.length === 1) return { input: raw, player: exact[0] } as any;
    const surname = pool.filter((p: any) => key(p.name.split(/\s+/).slice(-1)[0]) === key(normalized));
    if (surname.length === 1) return { input: raw, player: surname[0] } as any;
    if (surname.length > 1) return { input: raw, player: null, ambiguous: surname, reason: 'surname' } as any;
    return { input: raw, player: null, reason: 'no NHL player found with that name' } as any;
  });
  vi.spyOn(LEAGUE_DATA, 'getRoster').mockReturnValue(roster);
}

beforeEach(() => stubServices());
afterEach(() => vi.restoreAllMocks());

function analysis() {
  return new DraftPickAnalysis({} as any, '12345', '1');
}

describe('draft board', () => {
  it('ranks by production when nothing is off the board', async () => {
    const result: any = await analysis().executeAnalysis({ pick_number: 1 }, contract);

    expect(result.analysis_insights.top_candidates[0].name).toBe('Faller Guy');
  });

  it('treats production rank as the board position', async () => {
    // With no market ADP, the Nth best producer is the Nth pick worth making.
    const result: any = await analysis().executeAnalysis({ pick_number: 1 }, contract);
    const byName = Object.fromEntries(
      result.analysis_insights.top_candidates.map((c: any) => [c.name, c])
    );

    expect(byName['Faller Guy'].average_pick).toBe(1);
    expect(byName['On Time'].average_pick).toBe(2);
  });

  it('removes players passed in already_drafted', async () => {
    const result: any = await analysis().executeAnalysis(
      { pick_number: 2, already_drafted: ['Faller Guy'] },
      contract
    );

    const names = result.analysis_insights.top_candidates.map((c: any) => c.name);
    expect(names).not.toContain('Faller Guy');
    expect(names).toContain('On Time');
  });

  it('matches drafted names past case, accents and punctuation', async () => {
    const result: any = await analysis().executeAnalysis(
      { pick_number: 2, already_drafted: ['tim stutzle obrien'] },
      contract
    );

    const names = result.analysis_insights.top_candidates.map((c: any) => c.name);
    expect(names).not.toContain("Tim Stützle-O'Brien");
  });

  it('infers the pick on the clock from how many are already gone', async () => {
    const result: any = await analysis().executeAnalysis(
      { already_drafted: ['Faller Guy', 'On Time'] },
      contract
    );

    expect(result.analysis_insights.pick_number).toBe(3);
    expect(result.analysis_insights.pick_number_source).toContain('inferred');
  });

  it('says how board state is obtained, since there is no platform to read', async () => {
    const result: any = await analysis().executeAnalysis({ pick_number: 1 }, contract);

    expect(result.analysis_insights.board_state).toContain('already_drafted');
    expect(result.chirp_intelligence.analysis_chirp).toContain('⚠️');
  });

  it('carries the caveat that availability is league-private', async () => {
    const result: any = await analysis().executeAnalysis({ pick_number: 1 }, contract);
    expect(String(result.analysis_insights.board_note ?? '')).toContain('league-private');
  });
});

describe('already_drafted parsing', () => {
  it('removes players pasted straight from a draft board', async () => {
    // The natural draft-day action is to copy rows out of the draft room.
    // Matching those raw against a player name never succeeds, so the board
    // silently kept recommending players who were already gone.
    const result: any = await analysis().executeAnalysis(
      {
        pick_number: 3,
        already_drafted: [
          '1. (1) Faller Guy TOR - RW',
          '2. (2) On Time BOS - C'
        ]
      },
      contract
    );

    const names = result.analysis_insights.top_candidates.map((c: any) => c.name);
    expect(names).not.toContain('Faller Guy');
    expect(names).not.toContain('On Time');
    expect(result.analysis_insights.players_off_board).toBe(2);
  });

  it('still accepts bare names', async () => {
    const result: any = await analysis().executeAnalysis(
      { pick_number: 2, already_drafted: ['Faller Guy'] },
      contract
    );

    expect(result.analysis_insights.top_candidates.map((c: any) => c.name))
      .not.toContain('Faller Guy');
  });

  it('reports lines it could not match instead of counting them as removed', async () => {
    // An unmatched pick means a drafted player is still being recommended.
    // Counting it as removed would hide exactly that.
    const result: any = await analysis().executeAnalysis(
      { pick_number: 2, already_drafted: ['12. (12) Somebody Invented XXX - C'] },
      contract
    );

    expect(result.analysis_insights.players_off_board).toBe(0);
    expect(result.analysis_insights.drafted_not_matched?.length).toBeGreaterThan(0);
  });

  it('infers the pick from how many actually resolved', async () => {
    const result: any = await analysis().executeAnalysis(
      { already_drafted: ['1. (1) Faller Guy TOR - RW', '2. (2) On Time BOS - C'] },
      contract
    );

    expect(result.analysis_insights.pick_number).toBe(3);
  });
});

describe('roster needs', () => {
  it('honours explicitly stated needs', async () => {
    const result: any = await analysis().executeAnalysis(
      { pick_number: 1, roster_needs: ['D'] },
      contract
    );

    const byName = Object.fromEntries(
      result.analysis_insights.top_candidates.map((c: any) => [c.name, c])
    );

    expect(byName['Way Early'].fills_need).toBe(true);
    expect(byName['On Time'].fills_need).toBe(false);
  });

  it('handles multi-position eligibility', async () => {
    stubServices([{ player_id: '9', name: 'Swiss Army', position: 'C,LW,RW', team: 'COL', stats: { points: 70 } }]);

    const result: any = await analysis().executeAnalysis(
      { pick_number: 1, roster_needs: ['RW'] },
      contract
    );

    expect(result.analysis_insights.top_candidates[0].fills_need).toBe(true);
  });

  it('infers needs from the stored roster when none are given', async () => {
    stubServices(POOL, {
      team_key: 'my-team',
      team_name: 'Mine',
      players: [
        { player_id: '90', name: 'A', position: 'C', team: 'TOR', selected_position: 'C', status: '' },
        { player_id: '91', name: 'B', position: 'C', team: 'BOS', selected_position: 'C', status: '' }
      ]
    });

    const result: any = await analysis().executeAnalysis({ pick_number: 1 }, contract);

    // Two centres and nothing else, so C is the one position that is not a need.
    expect(result.analysis_insights.roster_needs).not.toContain('C');
    expect(result.analysis_insights.roster_needs).toContain('D');
  });
});

describe('playoff window', () => {
  it('scores the weeks you name, anchored to the NHL opener', async () => {
    vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(true);
    vi.spyOn(NHL_SCHEDULE, 'getSeasonStartDate').mockReturnValue('2026-09-29');
    vi.spyOn(NHL_SCHEDULE, 'getTeamProfile').mockReturnValue({ team: 'TOR', weeks_with_4_plus: 8 } as any);
    vi.spyOn(NHL_SCHEDULE, 'countGamesInRange').mockReturnValue(11);

    const result: any = await analysis().executeAnalysis(
      { pick_number: 1, playoff_start_week: 22, playoff_end_week: 24 },
      contract
    );

    const window = result.analysis_insights.playoff_window;
    expect(window.resolved).toBe(true);
    expect(window.start).toBe('2027-02-22');
    expect(window.weeks).toHaveLength(3);
    expect(result.analysis_insights.top_candidates[0].playoff_games).toBe(11);
  });

  it('mentions the playoff schedule in the chirp only once resolved', async () => {
    vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(true);
    vi.spyOn(NHL_SCHEDULE, 'getSeasonStartDate').mockReturnValue('2026-09-29');
    vi.spyOn(NHL_SCHEDULE, 'getTeamProfile').mockReturnValue({ team: 'TOR', weeks_with_4_plus: 8 } as any);
    vi.spyOn(NHL_SCHEDULE, 'countGamesInRange').mockReturnValue(11);

    const withWindow: any = await analysis().executeAnalysis(
      { pick_number: 1, playoff_start_week: 22, playoff_end_week: 24 }, contract
    );
    expect(withWindow.chirp_intelligence.analysis_chirp).toContain('11 games in your playoff window');
  });

  it('does not claim a playoff figure it never computed', async () => {
    // This previously rendered "plays ? games in your playoff window".
    const result: any = await analysis().executeAnalysis({ pick_number: 1 }, contract);

    expect(result.chirp_intelligence.analysis_chirp).not.toContain('?');
    expect(result.chirp_intelligence.analysis_chirp).toContain('not scored your playoff weeks');
    expect(result.analysis_insights.playoff_window.resolved).toBe(false);
  });
});

describe('resilience', () => {
  it('returns no candidates rather than failing on an empty pool', async () => {
    stubServices([]);
    const result: any = await analysis().executeAnalysis({ pick_number: 1 }, contract);

    expect(result.analysis_insights.top_candidates).toEqual([]);
    expect(result.chirp_intelligence.analysis_chirp).toBeTruthy();
  });

  it('works with the schedule unavailable', async () => {
    const result: any = await analysis().executeAnalysis({ pick_number: 1 }, contract);

    expect(result.analysis_insights.schedule_source).toContain('UNAVAILABLE');
    expect(result.analysis_insights.top_candidates.length).toBeGreaterThan(0);
  });
});
