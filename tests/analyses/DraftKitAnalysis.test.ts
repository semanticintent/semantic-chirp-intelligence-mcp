import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DraftKitAnalysis } from '../../src/analyses/DraftKitAnalysis.js';
import { NHL_SCHEDULE } from '../../src/services/NhlScheduleService.js';
import { NHL_STATS, NhlStatsService } from '../../src/services/NhlStatsService.js';

const contract = {
  chirp_intensity: 'standard' as const,
  personality_mode: 'analytical' as const,
  enable_chirp: true,
  semantic_intent: 'user_requested' as const
};

/** A small league: a star, a young high-volume shooter, a veteran, a goalie. */
const PLAYERS: any[] = [
  { player_id: '1', name: 'Star Centre', team: 'TOR', position: 'C', birth_date: '1997-01-13',
    stats: { games_played: 80, goals: 50, assists: 70, points: 120, shots: 300, penalty_minutes: 20, time_on_ice_per_game: 1300 } },
  { player_id: '2', name: 'Young Shooter', team: 'CHI', position: 'C', birth_date: '2003-05-01',
    stats: { games_played: 78, goals: 12, assists: 30, points: 42, shots: 200, penalty_minutes: 10, time_on_ice_per_game: 1050 } },
  { player_id: '3', name: 'Old Workhorse', team: 'PIT', position: 'D', birth_date: '1987-04-24',
    stats: { games_played: 75, goals: 8, assists: 30, points: 38, shots: 150, penalty_minutes: 40, time_on_ice_per_game: 1320 } },
  { player_id: '4', name: 'Rate Goalie', team: 'COL', position: 'G', birth_date: '1996-03-03',
    stats: { games_played: 50, wins: 22, save_percentage: 0.921, goals_against_average: 2.02 } },
  { player_id: '5', name: 'Penalty Guy', team: 'BOS', position: 'D', birth_date: '1995-06-06',
    stats: { games_played: 80, goals: 5, assists: 17, points: 22, shots: 90, penalty_minutes: 152, time_on_ice_per_game: 1100 } }
];

function stub(playoffGames: Record<string, number> = {}) {
  vi.spyOn(NHL_STATS, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_SCHEDULE, 'getSeason').mockReturnValue('20262027');
  vi.spyOn(NHL_SCHEDULE, 'getSeasonStartDate').mockReturnValue('2026-09-29');
  vi.spyOn(NHL_SCHEDULE, 'getTeamProfile').mockReturnValue({ weeks_with_4_plus: 8 } as any);
  vi.spyOn(NHL_SCHEDULE, 'countGamesInRange').mockImplementation((t: string) => playoffGames[t] ?? 10);
  vi.spyOn(NHL_STATS, 'getSeasons').mockReturnValue({ roster: '20262027', stats: '20252026' });
  vi.spyOn(NHL_STATS, 'getAll').mockReturnValue(PLAYERS);
  vi.spyOn(NHL_STATS, 'getById').mockImplementation((id: string) => PLAYERS.find(p => p.player_id === id) ?? null);

  const key = (x: string) => String(x).normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
  vi.spyOn(NHL_STATS, 'resolve').mockImplementation((input: string) => {
    const raw = String(input ?? '').trim();
    const exact = PLAYERS.filter(p => key(p.name) === key(raw));
    if (exact.length === 1) return { input: raw, player: exact[0] } as any;
    const surname = PLAYERS.filter(p => key(p.name.split(/\s+/).slice(-1)[0]) === key(raw));
    if (surname.length === 1) return { input: raw, player: surname[0] } as any;
    return { input: raw, player: null, reason: 'no NHL player found with that name' } as any;
  });
}

beforeEach(() => stub());
afterEach(() => vi.restoreAllMocks());

const kit = () => new DraftKitAnalysis();

describe('generated board', () => {
  it('builds positional tiers from production when no list is given', async () => {
    const r: any = await kit().executeAnalysis(
      { playoff_start_week: 22, playoff_end_week: 24, tier_size: 2 }, contract
    );

    expect(r.analysis_insights.source).toBe('NHL production');
    expect(r.analysis_insights.positions.C.tiers[0].players[0].name).toBe('Star Centre');
  });

  it('ranks goalies on wins, not points', async () => {
    // A goalie has no points, so ranking the two on the same scale is meaningless.
    const r: any = await kit().executeAnalysis({ positions: ['G'] }, contract);
    expect(r.analysis_insights.positions.G.tiers[0].players[0].name).toBe('Rate Goalie');
  });

  it('translates NHL position codes to fantasy labels', async () => {
    const r: any = await kit().executeAnalysis({ positions: ['D'] }, contract);
    expect(Object.keys(r.analysis_insights.positions)).toContain('D');
  });

  it('names what a draft kit normally has that this one does not', async () => {
    const r: any = await kit().executeAnalysis({}, contract);
    const missing = r.analysis_insights.not_included.join(' ');

    expect(missing).toContain('Projections');
    expect(missing).toContain('ADP');
    expect(missing).toContain('Injury');
  });
});

describe('annotating a pasted list', () => {
  it('keeps the pasted order as the baseline rank', async () => {
    // The whole point of overlay mode: someone else did the projection work.
    const r: any = await kit().executeAnalysis(
      { rankings: 'Young Shooter\nStar Centre', tier_size: 5 }, contract
    );

    expect(r.analysis_insights.source).toBe('pasted rankings');
    const centres = r.analysis_insights.positions.C.tiers[0].players;
    expect(centres[0].name).toBe('Young Shooter');   // ranked 1 by them, not by us
    expect(centres[0].rank).toBe(1);
  });

  it('reports lines it could not resolve instead of dropping them', async () => {
    const r: any = await kit().executeAnalysis(
      { rankings: 'Star Centre\nSomebody Invented' }, contract
    );

    expect(r.analysis_insights.rankings_not_matched?.length).toBe(1);
  });

  it('reads ranked lines with numbers, clubs and positions', async () => {
    const r: any = await kit().executeAnalysis(
      { rankings: '1. Star Centre, TOR (C)\n2. Young Shooter, CHI (C)' }, contract
    );

    expect(r.analysis_insights.positions.C.tiers[0].players).toHaveLength(2);
  });
});

describe('signals', () => {
  it('flags a young high-volume shooter converting badly', async () => {
    const r: any = await kit().executeAnalysis({}, contract);
    const rebounds = r.analysis_insights.signals.shooting_rebounds;

    expect(rebounds.map((x: any) => x.name)).toContain('Young Shooter');
    expect(rebounds[0].note).toContain('volume without conversion');
  });

  it('flags a veteran on heavy minutes as decline risk', async () => {
    const r: any = await kit().executeAnalysis({}, contract);
    expect(r.analysis_insights.signals.decline_risk.map((x: any) => x.name)).toContain('Old Workhorse');
  });

  it('does not flag the star, who converts his volume', async () => {
    const r: any = await kit().executeAnalysis({}, contract);
    const flagged = r.analysis_insights.signals.shooting_rebounds.map((x: any) => x.name);
    expect(flagged).not.toContain('Star Centre');
  });

  it('surfaces category specialists', async () => {
    const r: any = await kit().executeAnalysis({}, contract);
    const pim = r.analysis_insights.signals.category_specialists.penalty_minutes;
    expect(pim.map((x: any) => x.name)).toContain('Penalty Guy');
  });

  it('flags a goalie whose rate beats his win total', async () => {
    const r: any = await kit().executeAnalysis({ positions: ['G'] }, contract);
    const goalies = r.analysis_insights.signals.category_specialists.goalie_rate_over_record;
    expect(goalies.map((x: any) => x.name)).toContain('Rate Goalie');
  });
});

describe('playoff window', () => {
  it('annotates every player with their club playoff-window games', async () => {
    stub({ TOR: 11, CHI: 8 });
    const r: any = await kit().executeAnalysis(
      { playoff_start_week: 22, playoff_end_week: 24, positions: ['C'], tier_size: 5 }, contract
    );

    const byName = Object.fromEntries(
      r.analysis_insights.positions.C.tiers[0].players.map((p: any) => [p.name, p])
    );
    expect(byName['Star Centre'].playoff_games).toBe(11);
    expect(byName['Young Shooter'].playoff_games).toBe(8);
  });

  it('ranks playoff-schedule winners by production', async () => {
    stub({ TOR: 11 });
    const r: any = await kit().executeAnalysis(
      { playoff_start_week: 22, playoff_end_week: 24 }, contract
    );

    expect(r.analysis_insights.signals.playoff_schedule_winners[0].name).toBe('Star Centre');
  });

  it('reports no playoff games at all when no window is given', async () => {
    // Rather than scoring a window it never resolved.
    const r: any = await kit().executeAnalysis({ positions: ['C'] }, contract);

    expect(r.analysis_insights.playoff_window.resolved).toBe(false);
    expect(r.analysis_insights.positions.C.tiers[0].players[0].playoff_games).toBeNull();
    expect(r.analysis_insights.signals.playoff_schedule_winners).toEqual([]);
    expect(r.chirp_intelligence.analysis_chirp).toContain('playoff_start_week');
  });
});

describe('cheat sheet', () => {
  it('condenses each position into printable tier lines', async () => {
    stub({ TOR: 11 });
    const r: any = await kit().executeAnalysis(
      { playoff_start_week: 22, playoff_end_week: 24, positions: ['C'], tier_size: 2 }, contract
    );

    const line = r.analysis_insights.cheat_sheet.board.C[0];
    expect(line).toContain('T1:');
    expect(line).toContain('Star Centre (11)');   // playoff games in brackets
  });
});

describe('age', () => {
  it('computes age from the published birth date', () => {
    const age = NhlStatsService.ageOf(PLAYERS[0], new Date('2027-01-13T00:00:00Z'));
    expect(age).toBeGreaterThan(29.9);
    expect(age).toBeLessThan(30.1);
  });

  it('returns null rather than guessing when the birth date is missing', () => {
    expect(NhlStatsService.ageOf({ name: 'x' } as any)).toBeNull();
  });
});
