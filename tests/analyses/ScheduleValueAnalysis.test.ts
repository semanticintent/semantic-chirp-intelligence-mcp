import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScheduleValueAnalysis } from '../../src/analyses/ScheduleValueAnalysis.js';
import { NHL_SCHEDULE } from '../../src/services/NhlScheduleService.js';

const contract = {
  chirp_intensity: 'standard' as const,
  personality_mode: 'analytical' as const,
  enable_chirp: true,
  semantic_intent: 'user_requested' as const
};

function leagueSettings(playoffStartWeek = 22, endWeek = 24, startDate = '2026-09-29') {
  return {
    fantasy_content: {
      league: [{ start_date: startDate, end_week: endWeek }, { settings: [{ playoff_start_week: playoffStartWeek }] }]
    }
  };
}

function makeClient(settings: any = leagueSettings()) {
  return { getLeagueSettings: vi.fn(async () => settings) } as any;
}

/** Give TOR a heavy playoff window and SJS a light one. */
function stubSchedule() {
  vi.spyOn(NHL_SCHEDULE, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_SCHEDULE, 'getSeason').mockReturnValue('20262027');
  vi.spyOn(NHL_SCHEDULE, 'getSeasonStartDate').mockReturnValue('2026-09-29');
  vi.spyOn(NHL_SCHEDULE, 'getTeamProfile').mockImplementation((abbr: string) => {
    const heavy = abbr === 'TOR';
    return {
      team: abbr as any,
      total_games: 84,
      weeks_with_4_plus: heavy ? 11 : 4,
      weeks_with_2_or_fewer: heavy ? 1 : 7,
      back_to_backs: 12,
      games_by_week: {}
    };
  });
  vi.spyOn(NHL_SCHEDULE, 'countGamesInRange').mockImplementation((abbr: string) =>
    abbr === 'TOR' ? 12 : 6
  );
}

beforeEach(() => stubSchedule());
afterEach(() => vi.restoreAllMocks());

describe('ScheduleValueAnalysis', () => {
  it('rates all 32 clubs by default', async () => {
    const analysis = new ScheduleValueAnalysis(makeClient(), '12345', '1');
    const result: any = await analysis.executeAnalysis({}, contract);

    expect(result.analysis_insights.all_teams).toHaveLength(32);
  });

  it('ranks the club with the heavier playoff window first', async () => {
    const analysis = new ScheduleValueAnalysis(makeClient(), '12345', '1');
    const result: any = await analysis.executeAnalysis({}, contract);

    const best = result.analysis_insights.all_teams[0];
    expect(best.team).toBe('TOR');
    expect(best.playoff_games).toBe(12);
    expect(best.value_score).toBeGreaterThan(
      result.analysis_insights.all_teams[31].value_score
    );
  });

  it('scores the window the league actually plays, not a generic guess', async () => {
    const analysis = new ScheduleValueAnalysis(makeClient(), '12345', '1');
    const result: any = await analysis.executeAnalysis({}, contract);

    const window = result.analysis_insights.playoff_window;
    expect(window.resolved).toBe(true);
    expect(window.source).toBe('Yahoo league settings');
    expect(window.start).toBe('2027-02-22'); // week 22 of a 2026-09-28 week 1
    expect(window.weeks).toHaveLength(3);
  });

  it('lets an explicit playoff_start_week override the league settings', async () => {
    const analysis = new ScheduleValueAnalysis(makeClient(), '12345', '1');
    const result: any = await analysis.executeAnalysis({ playoff_start_week: 20 }, contract);

    const window = result.analysis_insights.playoff_window;
    expect(window.playoff_start_week).toBe(20);
    expect(window.source).toBe('explicit argument');
    expect(window.weeks).toHaveLength(5); // weeks 20-24
  });

  it('filters to requested clubs, resolving Yahoo abbreviations', async () => {
    const analysis = new ScheduleValueAnalysis(makeClient(), '12345', '1');
    const result: any = await analysis.executeAnalysis({ teams: ['Tor', 'SJ', 'ZZZ'] }, contract);

    const teams = result.analysis_insights.all_teams.map((t: any) => t.team);
    expect(teams).toEqual(['TOR', 'SJS']); // unknown abbreviation dropped, not guessed
  });

  it('anchors week 1 to the NHL opener when Yahoo has no start_date', async () => {
    // An explicit playoff_start_week is an index into nothing without an anchor,
    // so the season's own first game stands in for the league start_date.
    const client = makeClient({ fantasy_content: { league: [{ end_week: 24 }, {}] } });
    const analysis = new ScheduleValueAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis({ playoff_start_week: 22 }, contract);

    const window = result.analysis_insights.playoff_window;
    expect(window.resolved).toBe(true);
    expect(window.week_1_anchor).toContain('NHL season opener');
    expect(window.start).toBe('2027-02-22');
  });

  it('treats an unresolved window as missing information, not a bad schedule', async () => {
    const client = makeClient({ fantasy_content: { league: [{}, {}] } });
    const analysis = new ScheduleValueAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis({ teams: ['TOR'] }, contract);

    const team = result.analysis_insights.all_teams[0];
    // Zero playoff games must not read as a verdict about the playoff window.
    expect(team.playoff_games).toBe(0);
    expect(team.verdict).toContain('Playoff window not resolved');
    expect(result.chirp_intelligence.analysis_chirp).toContain('could not read your playoff weeks');
  });

  it('reports an unresolved window rather than inventing playoff weeks', async () => {
    const analysis = new ScheduleValueAnalysis(
      makeClient({ fantasy_content: { league: [{}, {}] } }), '12345', '1'
    );
    const result: any = await analysis.executeAnalysis({}, contract);

    const window = result.analysis_insights.playoff_window;
    expect(window.resolved).toBe(false);
    expect(window.note).toContain('playoff_start_week');
  });

  it('declines to rate anything when the NHL schedule is unavailable', async () => {
    vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(false);
    vi.spyOn(NHL_SCHEDULE, 'getUnavailableReason').mockReturnValue('NHL API unreachable');

    const analysis = new ScheduleValueAnalysis(makeClient(), '12345', '1');
    const result: any = await analysis.executeAnalysis({}, contract);

    expect(result.analysis_insights.all_teams).toHaveLength(0);
    expect(result.analysis_insights.schedule_source).toContain('UNAVAILABLE');
    expect(result.chirp_intelligence.chirp).toContain('No schedule, no verdict');
  });

  it('survives league settings being unreachable', async () => {
    const client = { getLeagueSettings: vi.fn(async () => { throw new Error('503'); }) } as any;
    const analysis = new ScheduleValueAnalysis(client, '12345', '1');
    const result: any = await analysis.executeAnalysis({}, contract);

    expect(result.analysis_insights.all_teams).toHaveLength(32);
    expect(result.analysis_insights.playoff_window.resolved).toBe(false);
  });

  it('names both the best and worst schedule in the chirp', async () => {
    const analysis = new ScheduleValueAnalysis(makeClient(), '12345', '1');
    const result: any = await analysis.executeAnalysis({ teams: ['TOR', 'SJS'] }, contract);

    expect(result.chirp_intelligence.analysis_chirp).toContain('TOR');
    expect(result.chirp_intelligence.analysis_chirp).toContain('SJS');
  });
});
