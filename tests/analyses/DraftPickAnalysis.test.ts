import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DraftPickAnalysis } from '../../src/analyses/DraftPickAnalysis.js';
import { NHL_SCHEDULE } from '../../src/services/NhlScheduleService.js';

/** Yahoo's players+draft_analysis shape: identity array, then a draft_analysis object. */
function playerEntry(id: string, name: string, pos: string, team: string, avgPick: number | string) {
  return {
    player: [
      [
        { player_id: id },
        { name: { full: name } },
        { display_position: pos },
        { editorial_team_abbr: team }
      ],
      {
        draft_analysis: {
          average_pick: String(avgPick),
          average_round: '3.0',
          percent_drafted: '0.95'
        }
      }
    ]
  };
}

function poolPage(entries: any[]) {
  return {
    fantasy_content: {
      league: [{}, { players: { count: entries.length, ...Object.fromEntries(entries.map((e, i) => [String(i), e])) } }]
    }
  };
}

function leagueSettings() {
  return {
    fantasy_content: {
      league: [
        { start_date: '2026-09-29', end_week: 24, num_teams: 12 },
        { settings: [{ playoff_start_week: 22 }] }
      ]
    }
  };
}

function draftResults(playerIds: string[]) {
  return {
    fantasy_content: {
      league: [
        {},
        {
          draft_results: {
            count: playerIds.length,
            ...Object.fromEntries(
              playerIds.map((id, i) => [
                String(i),
                { draft_result: { pick: i + 1, round: 1, player_key: `nhl.p.${id}`, team_key: 'nhl.l.1.t.1' } }
              ])
            )
          }
        }
      ]
    }
  };
}

function emptyRoster() {
  return { fantasy_content: { team: [{}, { roster: { '0': { players: { count: 0 } } } }] } };
}

function makeClient(overrides: any = {}) {
  return {
    getDraftResults: vi.fn(async () => draftResults([])),
    getLeagueSettings: vi.fn(async () => leagueSettings()),
    getTeamRoster: vi.fn(async () => emptyRoster()),
    getPlayersWithDraftAnalysis: vi.fn(async () =>
      poolPage([
        playerEntry('100', 'Faller Guy', 'RW', 'TOR', 10),   // available deep past ADP
        playerEntry('200', 'On Time', 'C', 'BOS', 40),
        playerEntry('300', 'Way Early', 'D', 'SJ', 120)
      ])
    ),
    ...overrides
  } as any;
}

const contract = {
  chirp_intensity: 'ice_cold' as const,
  personality_mode: 'championship_coach' as const,
  enable_chirp: true,
  semantic_intent: 'user_requested' as const
};

let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chirp-draft-'));
  // Keep the shared schedule out of these tests; scoring must not depend on network.
  vi.spyOn(NHL_SCHEDULE, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'loadStandings').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(false);
  vi.spyOn(NHL_SCHEDULE, 'getUnavailableReason').mockReturnValue('stubbed off in tests');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('DraftPickAnalysis board state', () => {
  it('ranks the player who fell furthest past his ADP first', async () => {
    const analysis = new DraftPickAnalysis(makeClient(), '12345', '1');
    const result: any = await analysis.executeAnalysis({ pick_number: 40 }, contract);

    const top = result.analysis_insights.top_candidates[0];
    expect(top.name).toBe('Faller Guy');
    expect(top.adp_delta).toBe(30);   // pick 40, ADP 10
    expect(top.verdict).toBe('STEAL');
  });

  it('classifies verdicts from the ADP delta, not from talent', async () => {
    const analysis = new DraftPickAnalysis(makeClient(), '12345', '1');
    const result: any = await analysis.executeAnalysis({ pick_number: 40 }, contract);

    const byName = Object.fromEntries(
      result.analysis_insights.top_candidates.map((c: any) => [c.name, c])
    );

    expect(byName['On Time'].adp_delta).toBe(0);
    expect(byName['On Time'].verdict).toBe('FAIR');
    // Taking a 120-ADP player at 40 is an 80-pick reach
    expect(byName['Way Early'].adp_delta).toBe(-80);
    expect(byName['Way Early'].verdict).toBe('REACH');
  });

  it('removes players Yahoo reports as already drafted', async () => {
    const client = makeClient({ getDraftResults: vi.fn(async () => draftResults(['100'])) });
    const analysis = new DraftPickAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis({ pick_number: 40 }, contract);

    const names = result.analysis_insights.top_candidates.map((c: any) => c.name);
    expect(names).not.toContain('Faller Guy');
    expect(names).toContain('On Time');
  });

  it('removes players passed in already_drafted when Yahoo lags the live draft', async () => {
    const analysis = new DraftPickAnalysis(makeClient(), '12345', '1');
    const result: any = await analysis.executeAnalysis(
      { pick_number: 40, already_drafted: ['faller guy'] },
      contract
    );

    const names = result.analysis_insights.top_candidates.map((c: any) => c.name);
    expect(names).not.toContain('Faller Guy');
  });

  it('matches drafted names past case, accents and punctuation', async () => {
    const client = makeClient({
      getPlayersWithDraftAnalysis: vi.fn(async () =>
        poolPage([playerEntry('400', "Tim Stützle-O'Brien", 'C', 'OTT', 15)])
      )
    });
    const analysis = new DraftPickAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis(
      { pick_number: 40, already_drafted: ['tim stutzle obrien'] },
      contract
    );

    expect(result.analysis_insights.top_candidates).toHaveLength(0);
  });

  it('flags that the board state is unknown when Yahoo returns no draft results', async () => {
    const client = makeClient({ getDraftResults: vi.fn(async () => ({ fantasy_content: { league: [{}, {}] } })) });
    const analysis = new DraftPickAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis({ pick_number: 40 }, contract);

    expect(result.analysis_insights.board_state).toContain('no draft results');
    expect(result.chirp_intelligence.analysis_chirp).toContain('⚠️');
  });

  it('infers the pick on the clock from picks already made', async () => {
    const client = makeClient({ getDraftResults: vi.fn(async () => draftResults(['100', '200'])) });
    const analysis = new DraftPickAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis({}, contract);

    expect(result.analysis_insights.pick_number).toBe(3);
    expect(result.analysis_insights.pick_number_source).toContain('inferred');
  });

  it('survives a Yahoo outage on every optional call', async () => {
    const client = makeClient({
      getDraftResults: vi.fn(async () => { throw new Error('503'); }),
      getLeagueSettings: vi.fn(async () => { throw new Error('503'); }),
      getTeamRoster: vi.fn(async () => { throw new Error('503'); })
    });
    const analysis = new DraftPickAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis({ pick_number: 5 }, contract);

    // The pool is what matters; the rest degrades to unknown rather than throwing.
    expect(result.analysis_insights.top_candidates.length).toBeGreaterThan(0);
    expect(result.analysis_insights.playoff_window.resolved).toBe(false);
  });
});

describe('DraftPickAnalysis roster needs', () => {
  it('honours explicitly stated needs', async () => {
    const analysis = new DraftPickAnalysis(makeClient(), '12345', '1');
    const result: any = await analysis.executeAnalysis(
      { pick_number: 40, roster_needs: ['D'] },
      contract
    );

    const byName = Object.fromEntries(
      result.analysis_insights.top_candidates.map((c: any) => [c.name, c])
    );

    expect(byName['Way Early'].fills_need).toBe(true);   // D
    expect(byName['On Time'].fills_need).toBe(false);    // C
  });

  it('handles multi-position eligibility', async () => {
    const client = makeClient({
      getPlayersWithDraftAnalysis: vi.fn(async () =>
        poolPage([playerEntry('500', 'Swiss Army', 'C,LW,RW', 'COL', 20)])
      )
    });
    const analysis = new DraftPickAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis(
      { pick_number: 25, roster_needs: ['RW'] },
      contract
    );

    expect(result.analysis_insights.top_candidates[0].fills_need).toBe(true);
  });
});

describe('DraftPickAnalysis playoff window', () => {
  it('resolves the league playoff weeks to real calendar dates', async () => {
    const analysis = new DraftPickAnalysis(makeClient(), '12345', '1');
    const result: any = await analysis.executeAnalysis({ pick_number: 1 }, contract);

    const window = result.analysis_insights.playoff_window;
    // Season starts Tue 2026-09-29, so fantasy week 1 begins Mon 2026-09-28.
    // Week 22 therefore begins 21 weeks later, on 2027-02-22.
    expect(window.resolved).toBe(true);
    expect(window.playoff_start_week).toBe(22);
    expect(window.start).toBe('2027-02-22');
    expect(window.weeks).toHaveLength(3); // weeks 22, 23, 24
  });

  it('reports the window unresolved instead of guessing', async () => {
    const client = makeClient({ getLeagueSettings: vi.fn(async () => ({ fantasy_content: { league: [{}, {}] } })) });
    const analysis = new DraftPickAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis({ pick_number: 1 }, contract);

    expect(result.analysis_insights.playoff_window.resolved).toBe(false);
  });
});

describe('DraftPickAnalysis Yahoo shape tolerance', () => {
  it('reads draft_analysis from the nested array shape', async () => {
    const client = makeClient({
      getPlayersWithDraftAnalysis: vi.fn(async () => ({
        fantasy_content: {
          league: [{}, {
            players: {
              count: 1,
              '0': {
                player: [
                  [{ player_id: '600' }, { name: { full: 'Nested Shape' } }, { display_position: 'G' }, { editorial_team_abbr: 'NJ' }],
                  [{ draft_analysis: { average_pick: '55', percent_drafted: '0.5' } }]
                ]
              }
            }
          }]
        }
      }))
    });

    const analysis = new DraftPickAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis({ pick_number: 60 }, contract);

    expect(result.analysis_insights.top_candidates[0].average_pick).toBe(55);
  });

  it('keeps a player whose ADP is missing rather than dropping them', async () => {
    const client = makeClient({
      getPlayersWithDraftAnalysis: vi.fn(async () => ({
        fantasy_content: {
          league: [{}, {
            players: {
              count: 1,
              '0': {
                player: [
                  [{ player_id: '700' }, { name: { full: 'No ADP' } }, { display_position: 'LW' }, { editorial_team_abbr: 'VAN' }],
                  { draft_analysis: { average_pick: '-', percent_drafted: '-' } }
                ]
              }
            }
          }]
        }
      }))
    });

    const analysis = new DraftPickAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis({ pick_number: 60 }, contract);

    const top = result.analysis_insights.top_candidates[0];
    expect(top.name).toBe('No ADP');
    expect(top.average_pick).toBeNull();
    expect(top.adp_delta).toBeNull();
    expect(top.verdict).toBe('FAIR');
  });

  it('deduplicates a player returned on more than one page', async () => {
    const client = makeClient({
      getPlayersWithDraftAnalysis: vi.fn(async () =>
        poolPage([playerEntry('100', 'Faller Guy', 'RW', 'TOR', 10)])
      )
    });
    const analysis = new DraftPickAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis({ pick_number: 40, pool_size: 150 }, contract);

    // Three pages all return the same player
    expect(result.analysis_insights.top_candidates).toHaveLength(1);
  });
});
