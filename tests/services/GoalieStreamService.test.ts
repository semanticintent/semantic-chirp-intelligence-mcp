/** analyze_goalie_streams: public data only, formula stated, limits stated. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NHL_SCHEDULE } from '../../src/services/NhlScheduleService.js';
import { NHL_STATS } from '../../src/services/NhlStatsService.js';
import { goalieStreams, streamScore } from '../../src/services/GoalieStreamService.js';

const G = (id: string, name: string, team: string, gp: number) => ({ player_id: id, name, team: team as any, position: 'G', stats: { games_played: gp, wins: 30, goals_against_average: 2.5, save_percentage: 0.912 } });
const GAMES: Record<string, { date: string; opponent: string; home: boolean }[]> = {
  CGY: [{ date: '2026-10-06', opponent: 'SJS', home: true }, { date: '2026-10-08', opponent: 'ANA', home: false }, { date: '2026-10-10', opponent: 'EDM', home: true }],
  TOR: [{ date: '2026-10-07', opponent: 'COL', home: true }],
  SEA: [{ date: '2026-10-06', opponent: 'SJS', home: true }, { date: '2026-10-09', opponent: 'ANA', home: true }],
};
const ATTACK: Record<string, number> = { SJS: 5, ANA: 20, EDM: 95, COL: 100 };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(NHL_SCHEDULE, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'loadStandings').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_SCHEDULE, 'getSeason').mockReturnValue('20262027');
  vi.spyOn(NHL_SCHEDULE, 'getStandingsSeason').mockReturnValue('20252026');
  vi.spyOn(NHL_SCHEDULE, 'getGamesInRange').mockImplementation((t) => GAMES[t] ?? []);
  vi.spyOn(NHL_SCHEDULE, 'getTeamStrength').mockImplementation((t) => (t in ATTACK ? { attack: ATTACK[t] } as any : null));
  vi.spyOn(NHL_STATS, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_STATS, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_STATS, 'getAll').mockReturnValue([G('wolf', 'Dustin Wolf', 'CGY', 62), G('woll', 'Joseph Woll', 'TOR', 41), G('daccord', 'Joey Daccord', 'SEA', 55), G('backup', 'Nobody Plays', 'SEA', 0)] as any);
});

describe('goalieStreams', () => {
  it('ranks candidates by the stated score and keeps your goalies apart', async () => {
    const r = await goalieStreams({ today: '2026-10-05', roster: [{ player_id: 'wolf', name: 'Dustin Wolf', team: 'CGY', position: 'G' }] });
    expect(r.your_goalies.map((g) => g.id)).toEqual(['wolf']);
    expect(r.candidates.map((g) => g.id)).toEqual(['daccord', 'woll']); // the 0-GP backup is left out
    const d = r.candidates[0];
    expect(d).toMatchObject({ games: 2, soft_nights: 2, avg_opponent_attack: 13, start_share: 0.67, expected_starts: 1.3 });
    expect(d.stream_score).toBe(streamScore(1.3, 13, d.save_pct_percentile));
    expect(d.reason).toBe("2 games, 2 against weak attacks; started 67% of SEA's games last season");
    expect(r.take).toMatch(/^Daccord \(SEA\): 2 games, 2 against weak attacks/);
  });
  it('states its formula and its limits, including last season\'s standings', async () => {
    const r = await goalieStreams({ today: '2026-10-05' });
    expect(r.method.stream_score).toMatch(/expected starts against four/);
    expect(r.limits.join(' ')).toMatch(/not announced in public data/);
    expect(r.limits.join(' ')).toMatch(/last season's final standings/);
    expect(r.source.data[1]).toBe('NHL standings 20252026 (last season, final)');
    expect(r.window.label).toBe('Oct 5 – 11');
  });
  it('refuses rather than estimates without a schedule', async () => {
    vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(false);
    vi.spyOn(NHL_SCHEDULE, 'getUnavailableReason').mockReturnValue('down');
    await expect(goalieStreams({})).rejects.toThrow(/schedule and it is unavailable: down/);
  });
  it('streamScore: four expected starts against the weakest attacks by the best save % is 100', () => {
    expect(streamScore(4, 0, 100)).toBe(100);
    expect(streamScore(0, 100, 0)).toBe(0);
    // Same week, same opponents: the better save % ranks higher.
    expect(streamScore(3, 40, 90)).toBeGreaterThan(streamScore(3, 40, 10));
    expect(streamScore(2, null)).toBe(50);
  });
});
