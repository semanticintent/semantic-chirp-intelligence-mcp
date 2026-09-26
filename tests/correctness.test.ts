/**
 * Correctness — assertions on what the answers say, not on whether an answer came back.
 *
 * Every other suite here passed while tools reported breakout "candidates" aged 31 and 33, ranked goalies on a points
 * scale, called every player a "deep league sleeper", printed "low ownership (undefined%)", presented invented line and
 * power-play roles as findings, double-counted an opponent's roster and ignored a position filter. A smoke test that
 * checks each tool returns data cannot see any of that. These tests read the output and check it is true of the input.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { callTool, setStateless, TOOL_DEFINITIONS } from '../src/tools.js';
import { NHL_STATS } from '../src/services/NhlStatsService.js';
import { NHL_SCHEDULE } from '../src/services/NhlScheduleService.js';

const mk = (id: string, name: string, team: string, position: string, birth: string, stats: Record<string, number>) =>
  ({ player_id: id, name, team, position, birth_date: birth, stats });

/** A small league with the shapes that exposed the bugs: veterans, young volume shooters, starters and a team-stat goalie. */
const LEAGUE = [
  mk('vet1', 'Old Star', 'COL', 'C', '1995-08-01', { games_played: 80, goals: 40, assists: 70, points: 110, shots: 300, time_on_ice_per_game: 1300, power_play_goals: 12, penalty_minutes: 20 }),
  mk('vet2', 'Older Star', 'TBL', 'R', '1993-06-01', { games_played: 78, goals: 35, assists: 65, points: 100, shots: 250, time_on_ice_per_game: 1250, power_play_goals: 10, penalty_minutes: 10 }),
  mk('kid1', 'Young Shooter', 'SEA', 'C', '2004-03-01', { games_played: 75, goals: 12, assists: 30, points: 42, shots: 220, time_on_ice_per_game: 1150, power_play_goals: 3, penalty_minutes: 10 }),
  mk('kid2', 'Young Winger', 'SJS', 'R', '2003-01-01', { games_played: 70, goals: 20, assists: 25, points: 45, shots: 170, time_on_ice_per_game: 1050, power_play_goals: 4, penalty_minutes: 8 }),
  mk('kid3', 'Young Defender', 'NJD', 'D', '2003-05-01', { games_played: 80, goals: 6, assists: 30, points: 36, shots: 160, time_on_ice_per_game: 1300, power_play_goals: 1, penalty_minutes: 20 }),
  mk('mid1', 'Depth Winger', 'BOS', 'R', '1999-01-01', { games_played: 60, goals: 10, assists: 12, points: 22, shots: 90, time_on_ice_per_game: 800, power_play_goals: 0, penalty_minutes: 30 }),
  // Three depth skaters on one heavy-schedule club, to test that one club cannot fill a streaming list.
  mk('sea1', 'Depth One', 'SEA', 'R', '1996-01-01', { games_played: 60, goals: 5, assists: 10, points: 15, shots: 70, time_on_ice_per_game: 750 }),
  mk('sea2', 'Depth Two', 'SEA', 'R', '1996-02-01', { games_played: 60, goals: 4, assists: 9, points: 13, shots: 60, time_on_ice_per_game: 740 }),
  mk('sea3', 'Depth Three', 'SEA', 'R', '1996-03-01', { games_played: 60, goals: 3, assists: 8, points: 11, shots: 50, time_on_ice_per_game: 730 }),
  mk('g1', 'Rate Goalie', 'COL', 'G', '1992-08-01', { games_played: 45, wins: 30, save_percentage: 0.921, goals_against_average: 2.02 }),
  mk('g2', 'Team Goalie', 'CAR', 'G', '1998-01-01', { games_played: 40, wins: 31, save_percentage: 0.895, goals_against_average: 2.47 }),
  mk('g3', 'Starter Goalie', 'TBL', 'G', '1994-03-18', { games_played: 58, wins: 39, save_percentage: 0.912, goals_against_average: 2.31 }),
];

const GAMES: Record<string, number> = { COL: 3, TBL: 2, SEA: 4, SJS: 1, NJD: 0, BOS: 3, CAR: 2 };
const key = (s: string) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

beforeEach(() => {
  vi.restoreAllMocks();
  setStateless(true); // the hosted endpoint's mode: every call carries its own roster, nothing is stored
  vi.spyOn(NHL_STATS, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_STATS, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_STATS, 'getAll').mockReturnValue(LEAGUE as any);
  vi.spyOn(NHL_STATS, 'getSeasons').mockReturnValue({ roster: '20262027', stats: '20252026' } as any);
  vi.spyOn(NHL_STATS, 'getById').mockImplementation((id) => (LEAGUE.find(p => p.player_id === id) as any) ?? null);
  vi.spyOn(NHL_STATS, 'resolve').mockImplementation((input: string) => {
    const hit = LEAGUE.filter(p => key(p.name) === key(input));
    return hit.length === 1 ? { input, player: hit[0] } as any : { input, player: null, reason: 'no NHL player found with that name' } as any;
  });
  vi.spyOn(NHL_SCHEDULE, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'loadStandings').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_SCHEDULE, 'getSeason').mockReturnValue('20262027');
  vi.spyOn(NHL_SCHEDULE, 'getSeasonStartDate').mockReturnValue('2026-09-29');
  vi.spyOn(NHL_SCHEDULE, 'countGamesInRange').mockImplementation((team: string) => GAMES[team] ?? 0);
  vi.spyOn(NHL_SCHEDULE, 'getGamesInRange').mockImplementation((team: string) =>
    Array.from({ length: GAMES[team] ?? 0 }, (_, i) => ({ date: `2026-10-1${i}`, opponent: 'VAN', home: true })) as any);
  vi.spyOn(NHL_SCHEDULE, 'countBackToBacks').mockReturnValue(0);
});

const run = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await callTool(name, args);
  const text = (r.content[0] as any).text as string;
  return { r, text, body: (() => { try { return JSON.parse(text); } catch { return null; } })() };
};

const MY_ROSTER = 'Old Star\nYoung Defender\nRate Goalie';

describe('no tool presents an invented fact', () => {
  // Words that name something no public source provides, or that betray an unknown value printed as if known.
  const INVENTED_ROLE = /\bPP1\b|\bPP2\b|Top-6|Bottom-6|linemate|Deep league sleeper|role lock/i;
  // Case-sensitive: "governance" contains "nan".
  const UNKNOWN_AS_VALUE = /\bNaN\b|undefined%|\bundefined\b(?= (?:games|GP|W|pts|points|min))/;

  it('holds across every tool offered on the hosted endpoint', async () => {
    const args: Record<string, Record<string, unknown>> = {
      analyze_weekend_streams: { roster_text: MY_ROSTER, date_range: { start: '2026-10-09', end: '2026-10-11' } },
      analyze_trade: { giving: ['Old Star'], receiving: ['Young Shooter', 'Young Winger'] },
      get_player_stats: { player_id: 'Old Star' },
      chirp_draft_pick: { pick_number: 3, playoff_start_week: 22, playoff_end_week: 24 },
      draft_kit: { playoff_start_week: 22, playoff_end_week: 24 },
      schedule_value: { playoff_start_week: 22, playoff_end_week: 24 },
      read_ice: { roster_text: MY_ROSTER, start: '2026-10-12', look_ahead_days: 3 },
    };
    const offenders: string[] = [];
    for (const t of TOOL_DEFINITIONS) {
      if (['set_roster', 'set_opponent_roster', 'set_standings', 'show_stored_data'].includes(t.name)) continue;
      const { text } = await run(t.name, { roster_text: MY_ROSTER, opponent_text: 'Older Star\nTeam Goalie', ...(args[t.name] ?? {}) });
      const hit = text.match(INVENTED_ROLE) ?? text.match(UNKNOWN_AS_VALUE);
      if (hit) offenders.push(`${t.name}: "${hit[0]}"`);
    }
    expect(offenders).toEqual([]);
  });
});

describe('analyze_breakout_players', () => {
  it('only returns players at or under the age cap', async () => {
    // Previously the cap was never applied: 31- and 33-year-olds came back as "must add" breakouts.
    const { body } = await run('analyze_breakout_players', { breakout_age_max: 26 });
    const c = body.analysis_insights.candidates;
    expect(c.length).toBeGreaterThan(0);
    for (const p of c) expect(p.age, p.name).toBeLessThanOrEqual(26);
    expect(c.map((p: any) => p.name)).not.toContain('Old Star');
  });

  it('keeps every score within 0–100', async () => {
    const { body } = await run('analyze_breakout_players', {});
    for (const p of body.analysis_insights.candidates) {
      expect(p.breakout_score).toBeGreaterThanOrEqual(0);
      expect(p.breakout_score).toBeLessThanOrEqual(100);
    }
  });

  it('flags conversion upside only against a computed league rate', async () => {
    const { body } = await run('analyze_breakout_players', {});
    const shooter = body.analysis_insights.candidates.find((p: any) => p.name === 'Young Shooter');
    expect(shooter.components.conversion_upside).toBeGreaterThan(0);
    expect(shooter.reasons.join(' ')).toMatch(/shooting 5\.5% on 220 shots vs a league forward rate/);
    expect(body.analysis_insights.league_shooting_pct.forwards).toBeGreaterThan(0);
  });

  it('respects the position filter', async () => {
    const { body } = await run('analyze_breakout_players', { position_filter: ['D'] });
    for (const p of body.analysis_insights.candidates) expect(p.position).toBe('D');
  });
});

describe('draft_kit goalies', () => {
  it('ranks goalies among goalies, and never on a points scale', async () => {
    const { body } = await run('draft_kit', { positions: ['G'], tier_size: 3 });
    const g = body.analysis_insights.positions.G.tiers[0].players;
    expect(g.map((p: any) => p.rank)).toEqual([1, 2, 3]);
    for (const p of g) {
      expect(p.ppg).toBeUndefined();
      expect(p.goalie_line).toMatch(/GP, \d+ W, [\d.]+ GAA, \.\d{3} SV%/);
    }
  });

  it('does not let a team-driven win total outrank better rate stats', async () => {
    // 31 wins on .895 used to beat 30 wins on .921 because only wins were counted.
    const { body } = await run('draft_kit', { positions: ['G'], tier_size: 3 });
    const order = body.analysis_insights.positions.G.tiers[0].players.map((p: any) => p.name);
    expect(order.indexOf('Rate Goalie')).toBeLessThan(order.indexOf('Team Goalie'));
  });
});

describe('get_streaming_recommendations', () => {
  it('applies the position filter it advertises', async () => {
    const { body } = await run('get_streaming_recommendations', { roster_text: MY_ROSTER, position_filter: 'RW', max_recommendations: 5 });
    const picks = body.recommendations.map((r: any) => r.pickup);
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) expect(p.position).toBe('RW');
  });

  it('counts the list it returns in its own chirp', async () => {
    const { body } = await run('get_streaming_recommendations', { roster_text: MY_ROSTER, max_recommendations: 3 });
    const n = body.recommendations.length;
    expect(JSON.stringify(body.chirp_intelligence)).not.toMatch(/\b0 streaming opportunities/);
    expect(n).toBeGreaterThan(0);
  });

  it('orders by games in the window', async () => {
    const { body } = await run('get_streaming_recommendations', { roster_text: MY_ROSTER, max_recommendations: 5 });
    const games = body.recommendations.map((r: any) => Number(r.reasoning.match(/^(\d+) game/)[1]));
    expect([...games].sort((a, b) => b - a)).toEqual(games);
  });
});

describe('chirp_opponent', () => {
  it('never counts one player in two groups', async () => {
    // Three players previously produced "1 don't play … 3 more on two games or fewer".
    const { body } = await run('chirp_opponent', { roster_text: MY_ROSTER, opponent_text: 'Young Defender\nYoung Winger\nOld Star' });
    const w = body.weaknesses;
    const all = [...w.idle_players, ...w.light_schedule, ...w.on_ir];
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeLessThanOrEqual(body.roster_size);
    expect(w.idle_players).toEqual(['Young Defender']);   // NJD: 0 games
    expect(w.light_schedule).toEqual(['Young Winger']);   // SJS: 1 game
  });
});

describe('get_league_standings', () => {
  it('works on the stateless endpoint from pasted standings', async () => {
    const { body } = await run('get_league_standings', { standings_text: '1. Alpha 8-2-1 142 pts\n2. Beta 7-3-1 138 pts' });
    expect(body.teams).toBe(2);
    expect(body.standings[0]).toMatchObject({ rank: 1, team_name: 'Alpha', record: '8-2-1' });
  });

  it('points to an argument that exists here, not to a tool that does not', async () => {
    const { text } = await run('get_league_standings', {});
    expect(text).toMatch(/standings_text/);
    expect(text).not.toMatch(/set_standings/);
  });
});

describe('analyze_weekend_streams', () => {
  it('reports ice time that matches the player\'s own stat line', async () => {
    // "TOI" was a synthetic 0–25 score, so it disagreed with the minutes in the same response.
    const { body } = await run('analyze_weekend_streams', { roster_text: MY_ROSTER, date_range: { start: '2026-10-09', end: '2026-10-11' } });
    const all = [...(body.analysis_insights?.all_streams ?? body.all_streams ?? [])];
    const sample = JSON.stringify(body);
    expect(sample).not.toMatch(/Top-6|PP1/);
    for (const s of all) {
      const own = LEAGUE.find(p => p.player_id === s.player_id)!;
      expect(s.opportunity_toi).toBeCloseTo((own.stats.time_on_ice_per_game ?? 0) / 60, 1);
    }
  });
});

describe('second review', () => {
  it('ICE reads a games edge in your favour as an advantage', async () => {
    // Mine: Old Star (COL 3) + Young Defender (NJD 0) + Rate Goalie (COL 3) = 6. Theirs: Young Winger (SJS 1).
    // This used to be reported as games_disadvantage: 5.
    const { body } = await run('ice', { roster_text: MY_ROSTER, opponent_text: 'Young Winger' });
    const edge = body.analysis_insights.schedule_edge;
    expect(edge).toMatchObject({ your_games: 6, opponent_games: 1, advantage: 5 });
    expect(edge.reading).toMatch(/^You have 5 more games/);
    expect(JSON.stringify(body)).not.toMatch(/games_disadvantage/);
  });

  it('schedule_value never lists a club as both best and worst, and follows its verdicts', async () => {
    const { body } = await run('schedule_value', { teams: ['SEA', 'COL', 'NJD'], playoff_start_week: 22, playoff_end_week: 24 });
    const best = body.analysis_insights.best_schedules.map((t: any) => t.team);
    const worst = body.analysis_insights.worst_schedules.map((t: any) => t.team);
    expect(best.filter((t: string) => worst.includes(t))).toEqual([]);
    for (const r of body.recommendations) {
      if (/Break the tie the other way/.test(r.reasoning)) expect(r.action).toBe('fade');
    }
  });

  it('no tool falls back to spliced template text', async () => {
    const { text } = await run('optimize_lineup', { roster_text: MY_ROSTER });
    expect(text).not.toMatch(/the data patterns|Time to taking/);
  });

  it('search_players and draft_kit agree on the goalie order', async () => {
    const search = (await run('search_players', { position: 'G', count: 3 })).body.players.map((p: any) => p.name);
    const kit = (await run('draft_kit', { positions: ['G'], tier_size: 3 })).body.analysis_insights.positions.G.tiers[0].players.map((p: any) => p.name);
    expect(search).toEqual(kit);
  });

  it('a searched-for-everything list does not mix goalies into the skater ranking', async () => {
    const { body } = await run('search_players', { count: 20 });
    expect(body.players.every((p: any) => p.position !== 'G')).toBe(true);
    expect(body.goalies.every((p: any) => p.position === 'G')).toBe(true);
  });

  it('no club fills more than two streaming slots', async () => {
    const { body } = await run('get_streaming_recommendations', { roster_text: MY_ROSTER, max_recommendations: 6 });
    const teams = body.recommendations.map((r: any) => r.pickup.team);
    for (const t of new Set(teams)) expect(teams.filter((x: string) => x === t).length).toBeLessThanOrEqual(2);
  });

  it('a goalie-only draft kit carries no skater signals', async () => {
    const { body } = await run('draft_kit', { positions: ['G'], playoff_start_week: 22, playoff_end_week: 24 });
    const sig = body.analysis_insights.signals;
    const named = [...sig.shooting_rebounds, ...sig.decline_risk, ...sig.playoff_schedule_winners].map((p: any) => p.position);
    expect(named.filter((p: string) => p !== 'G')).toEqual([]);
    for (const r of body.recommendations) expect(r.reasoning).toMatch(/\bG\b/);
  });

  it('the opponent scout does not say "more" when nothing came before', async () => {
    const { body } = await run('chirp_opponent', { roster_text: MY_ROSTER, opponent_text: 'Young Winger\nDepth Winger' });
    expect(body.chirp).not.toMatch(/^\d+ more/);
  });
});

describe('third review', () => {
  const SPLICED = /(Elite players|The data shows|Analysis indicates|Stats don't lie|You've got this|Championship teams|Winners do this|Buddy,|That's like|Even my grandmother|Championship strategy|Next level thinking) (the|your|\d)/;

  it('ICE names real volume pickups when you are behind on games', async () => {
    // A short window where no club plays three: the old absolute three-game bar named nobody here.
    const SHORT: Record<string, number> = { COL: 2, SEA: 2, TBL: 1, SJS: 1, BOS: 1, CAR: 1 };
    vi.spyOn(NHL_SCHEDULE, 'countGamesInRange').mockImplementation((team: string) => SHORT[team] ?? 0);
    vi.spyOn(NHL_SCHEDULE, 'getGamesInRange').mockImplementation((team: string) =>
      Array.from({ length: SHORT[team] ?? 0 }, (_, i) => ({ date: `2026-10-1${i}`, opponent: 'VAN', home: true })) as any);
    const { body, text } = await run('ice', { roster_text: 'Young Defender', opponent_text: 'Old Star\nRate Goalie' });
    expect(body.analysis_insights.schedule_edge.advantage).toBeLessThan(0);
    expect(text).toMatch(/Young Shooter/);
  });

  it('games in hand says protect when ahead and stream when behind', async () => {
    const ahead = (await run('get_games_in_hand', { roster_text: MY_ROSTER, opponent_text: 'Young Winger' })).text;
    const behind = (await run('get_games_in_hand', { roster_text: 'Young Defender', opponent_text: 'Old Star\nRate Goalie' })).text;
    expect(ahead).toMatch(/keep a full lineup|Keep every slot filled/i);
    expect(ahead).not.toMatch(/stream players whose clubs play more/i);
    expect(behind).toMatch(/stream/i);
  });

  it('read_ice only calls a sit when someone on the bench beats him', async () => {
    // Young Winger (SJS) plays once and is the soft spot. With no bench, nobody replaces him: this used to list him
    // under sit while the take said "Nobody on the bench beats him, so live with it."
    const window = { start: '2026-10-10', look_ahead_days: 7 };
    const nights = (team: string) => Array.from({ length: GAMES[team] ?? 0 }, (_, i) => `2026-10-1${i}`);
    vi.spyOn(NHL_SCHEDULE, 'hasGameOn').mockImplementation((team: string, date: string) => nights(team).includes(date));
    const alone = (await run('read_ice', { roster_text: 'Old Star\nOlder Star\nYoung Winger', ...window })).body;
    expect(alone.take).toMatch(/Nobody on the bench beats him/);
    expect(alone.calls.sit).toEqual([]);
    // Put a four-game SEA skater on the bench and the sit call is earned.
    const benched = (await run('read_ice', { roster_text: 'Old Star\nOlder Star\nYoung Winger\nYoung Shooter BN', ...window })).body;
    expect(benched.calls.sit).toEqual(['kid2']);
    expect(benched.take).toMatch(/Young Shooter|Shooter/);
  });

  it('no chirp splices a personality phrase onto a fragment', async () => {
    for (const personality_mode of ['analytical', 'championship_coach', 'roast_master', 'motivational']) {
      for (const [name, args] of [
        ['get_games_in_hand', { roster_text: MY_ROSTER, opponent_text: 'Young Winger' }],
        ['get_streaming_recommendations', { roster_text: MY_ROSTER }],
        ['optimize_lineup', { roster_text: MY_ROSTER }],
      ] as const) {
        const { text } = await run(name, { ...args, personality_mode });
        expect(text, `${name} / ${personality_mode}`).not.toMatch(SPLICED);
      }
    }
  });

  it('says which pasted names were left out', async () => {
    const { body } = await run('get_streaming_recommendations', { roster_text: 'Old Star\nNobody Real' });
    expect(body.roster_not_matched.join(' ')).toMatch(/Nobody Real/);
  });

  it('draft_kit honours a small max_per_position', async () => {
    const { body } = await run('draft_kit', { max_per_position: 2 });
    for (const [pos, group] of Object.entries<any>(body.analysis_insights.positions)) {
      const n = group.tiers.reduce((sum: number, t: any) => sum + t.players.length, 0);
      expect(n, pos).toBeLessThanOrEqual(2);
    }
  });

  it('goalie stream score accounts for save percentage', async () => {
    const { body } = await run('analyze_goalie_streams', {});
    expect(body.method.stream_score).toMatch(/save %/);
    const rate = body.candidates.find((c: any) => c.name === 'Goalie' && c.club === 'COL');
    const team = body.candidates.find((c: any) => c.club === 'CAR');
    expect(rate.save_pct_percentile).toBeGreaterThan(team.save_pct_percentile);
  });

  it('weekend streams run without a roster and can find a genuine play', async () => {
    const { body } = await run('analyze_weekend_streams', { date_range: { start: '2026-10-09', end: '2026-10-11' } });
    expect(body.error).toBeUndefined();
    expect(body.metadata.classification_breakdown.genuine_count).toBeGreaterThan(0);
    expect(body.chirp_intelligence.analysis_chirp).not.toMatch(/analysis complete/);
    for (const s of body.analysis_insights.streaming_targets) expect(s.weekend_games).toBeGreaterThan(0);
  });
});

describe('fourth review', () => {
  it('chirp_draft_pick offers goalies when the need is G', async () => {
    const { body } = await run('chirp_draft_pick', { pick_number: 5, roster_needs: ['G'], max_results: 10 });
    const goalies = body.analysis_insights.top_candidates.filter((c: any) => c.position === 'G');
    expect(goalies.length).toBeGreaterThan(0);
    expect(goalies.every((c: any) => c.fills_need)).toBe(true);
    expect(goalies[0].reasoning).not.toMatch(/best producer/);
  });

  it('schedule_value never lists a favoured club among the worst', async () => {
    // Two strong regular seasons: both favoured. The lower one used to land in worst_schedules and be called "the one
    // you draft around" while its own recommendation said target it.
    vi.spyOn(NHL_SCHEDULE, 'getTeamProfile').mockImplementation((team: string) => ({
      team, total_games: 82, weeks_with_4_plus: team === 'SEA' ? 12 : team === 'COL' ? 10 : 4,
      weeks_with_2_or_fewer: team === 'NJD' ? 8 : 1,
    }) as any);
    for (const teams of [['SEA', 'COL'], ['SEA', 'COL', 'NJD'], ['TOR', 'SJS']]) {
      const { body, text } = await run('schedule_value', { teams, playoff_start_week: 22, playoff_end_week: 24 });
      const favoured = new Set(body.analysis_insights.all_teams.filter((t: any) => t.stance === 'favour').map((t: any) => t.team));
      expect(body.analysis_insights.worst_schedules.filter((t: any) => favoured.has(t.team))).toEqual([]);
      expect(text).not.toMatch(/\b1 weeks\b|\b1 four-game weeks\b/);
    }
  });

  it('weekend streams keep "genuine" for multi-game weekends with a real role, and say why', async () => {
    const { body } = await run('analyze_weekend_streams', { roster_text: MY_ROSTER, date_range: { start: '2026-10-09', end: '2026-10-11' } });
    for (const r of body.recommendations) {
      expect(r.reasoning).not.toMatch(/Speculative opportunity/);
      if (r.reasoning.startsWith('Genuine')) expect(r.player.weekend_games).toBeGreaterThanOrEqual(2);
      if (r.player.drop_suggestion) expect(r.player.drop_suggestion).not.toMatch(/lowest-scoring player in position/);
    }
    const b = body.metadata.classification_breakdown;
    expect(b.genuine_count).toBeLessThan(b.genuine_count + b.monitor_count + b.desperation_count);
  });

  it('roster transactions honour target_positions for pickups', async () => {
    const { body } = await run('get_roster_transaction_recommendations', { roster_text: 'Young Winger', opponent_text: 'Old Star\nRate Goalie', target_positions: ['RW'] });
    const pickups = body.recommendations.filter((r: any) => r.pickup).map((r: any) => r.pickup.position);
    expect(pickups.length).toBeGreaterThan(0);
    expect(pickups.every((p: string) => p.split(',').includes('RW'))).toBe(true);
  });

  it('streaming goalies are ranked on expected starts, not club games', async () => {
    const { body } = await run('get_streaming_recommendations', { position_filter: 'G', max_recommendations: 3 });
    for (const r of body.recommendations) expect(r.reasoning).toMatch(/expected starts/);
  });

  it('games in hand uses the same action labels as ice', async () => {
    const ahead = (await run('get_games_in_hand', { roster_text: MY_ROSTER, opponent_text: 'Young Winger' })).body;
    const behind = (await run('get_games_in_hand', { roster_text: 'Young Defender', opponent_text: 'Old Star\nRate Goalie' })).body;
    expect(ahead.recommendations[0].action).toBe('hold');
    expect(behind.recommendations[0].action).toBe('volume_play');
  });

  it('standings skip a header row and rank unnumbered rows by order', async () => {
    const { body } = await run('get_league_standings', { standings_text: 'Team W-L-T\nAlpha 8-2-1\nBeta 7-3-1' });
    expect(body.teams).toBe(2);
    expect(body.standings.map((r: any) => [r.rank, r.team_name])).toEqual([[1, 'Alpha'], [2, 'Beta']]);
  });

  it('search_players uses LW/RW like every other tool', async () => {
    const { body } = await run('search_players', { count: 20 });
    expect(body.players.filter((p: any) => /^(L|R)$/.test(p.position))).toEqual([]);
  });

  it('read_ice calls it "the whole problem" only for a player it sits', async () => {
    vi.spyOn(NHL_SCHEDULE, 'hasGameOn').mockImplementation((team: string, date: string) =>
      Array.from({ length: GAMES[team] ?? 0 }, (_, i) => `2026-10-1${i}`).includes(date));
    const { body } = await run('read_ice', { roster_text: 'Old Star\nOlder Star\nYoung Winger', start: '2026-10-10' });
    for (const v of body.verdicts) {
      if (/whole problem/.test(v.line)) expect(body.calls.sit).toContain(v.ids[0]);
    }
  });
});

describe('fifth review', () => {
  it('assume_rostered leaves the top of the board out of pickups, and says so', async () => {
    const plain = (await run('get_streaming_recommendations', { roster_text: 'Young Defender', max_recommendations: 10 })).body;
    expect(plain.recommendations.map((r: any) => r.pickup.name)).toContain('Old Star');
    const { body } = await run('get_streaming_recommendations', { roster_text: 'Young Defender', max_recommendations: 10, assume_rostered: 2 });
    const names = body.recommendations.map((r: any) => r.pickup.name);
    expect(names).not.toContain('Old Star');
    expect(names).not.toContain('Older Star');
    expect(body.assume_rostered).toMatchObject({ count: 2 });
    expect(body.assume_rostered.note).toMatch(/assumption, not ownership data/);
  });

  it('assume_rostered also applies to goalie streams', async () => {
    const all = (await run('analyze_goalie_streams', {})).body.candidates.map((c: any) => c.id);
    const some = (await run('analyze_goalie_streams', { assume_rostered: 6 })).body.candidates.map((c: any) => c.id);
    expect(some.length).toBe(all.length - 1); // the sixth board slot is the top goalie
  });

  it('the two goalie tools name the same goalie first', async () => {
    const a = (await run('analyze_goalie_streams', {})).body.candidates[0];
    const b = (await run('get_streaming_recommendations', { position_filter: 'G', max_recommendations: 3 })).body.recommendations[0].pickup;
    expect(b.player_id).toBe(a.id);
  });

  it('schedule_value puts every favoured club among the best', async () => {
    vi.spyOn(NHL_SCHEDULE, 'getTeamProfile').mockImplementation((team: string) => ({
      team, total_games: 82, weeks_with_4_plus: team === 'SEA' ? 12 : team === 'COL' ? 10 : 4,
      weeks_with_2_or_fewer: 1,
    }) as any);
    const { body } = await run('schedule_value', { teams: ['SEA', 'COL'] });
    const best = body.analysis_insights.best_schedules.map((t: any) => t.team);
    for (const t of body.analysis_insights.all_teams) if (t.stance === 'favour') expect(best).toContain(t.team);
  });

  it('read_ice does not start a low producer on games alone', async () => {
    vi.spyOn(NHL_SCHEDULE, 'hasGameOn').mockImplementation((team: string, date: string) =>
      Array.from({ length: GAMES[team] ?? 0 }, (_, i) => `2026-10-1${i}`).includes(date));
    // Depth One: SEA, 4 games at 0.25 P/gm (1.0 projected). Old Star: COL, 3 at 1.38 (4.1). Young Winger: SJS, 1 at
    // 0.64. Older Star lands on the bench at 2.6 projected — more than Depth One, so Depth One is no start.
    const { body } = await run('read_ice', { roster_text: 'Old Star\nDepth One\nYoung Winger\nOlder Star', start: '2026-10-10' });
    expect(body.calls.start).not.toContain('sea1');
    expect(body.calls.start).toContain('vet1');
  });

  it('get_team_roster says LW/RW for the slot too', async () => {
    const { text } = await run('get_team_roster', { roster_text: 'Young Winger\nOlder Star' });
    expect(text).not.toMatch(/"selected_position": "(L|R)"/);
  });

  it('weekend streams omit an empty fit_reason', async () => {
    const { text } = await run('analyze_weekend_streams', { date_range: { start: '2026-10-09', end: '2026-10-11' } });
    expect(text).not.toMatch(/"fit_reason": ""/);
  });
});

describe('sixth review', () => {
  it('ice suggests goalies on the shared stream score: no negative points, one per club', async () => {
    const { body } = await run('get_roster_transaction_recommendations', {
      roster_text: 'Young Defender', opponent_text: 'Old Star\nRate Goalie', target_positions: ['G'],
    });
    const picks = body.recommendations.filter((r: any) => r.pickup).map((r: any) => r.pickup);
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((p: any) => p.position === 'G' && p.points === undefined)).toBe(true);
    expect(new Set(picks.map((p: any) => p.team)).size).toBe(picks.length);
    for (const r of body.recommendations.filter((r: any) => r.pickup)) expect(r.reasoning).toMatch(/expected starts/);
  });

  it('a goalie with a tiny sample gets no save % percentile', async () => {
    const { savePercentile } = await import('../src/services/GoalieStreamService.js');
    expect(savePercentile([0.9, 0.91, 0.92], 0.95, 5)).toBeNull();
    expect(savePercentile([0.9, 0.91, 0.92], 0.95, 40)).toBe(100);
  });

  it('goalie stream limits say when assume_rostered narrowed the candidates', async () => {
    const { body } = await run('analyze_goalie_streams', { assume_rostered: 6 });
    expect(body.limits.join(' ')).toMatch(/assume_rostered/);
  });

  it('a stated need does not override value at the top of the draft', async () => {
    const { body } = await run('chirp_draft_pick', { pick_number: 2, roster_needs: ['G'], max_results: 6 });
    expect(body.recommendations[0].reasoning).not.toMatch(/\(G,/);
  });

  it('a reach is never the top call', async () => {
    for (const pick_number of [1, 5, 12, 30]) {
      const { body } = await run('chirp_draft_pick', { pick_number, roster_needs: ['G'], max_results: 8 });
      const top = body.analysis_insights.top_candidates[0];
      if (top) expect(top.verdict).not.toBe('REACH');
    }
  });

  it('schedule_value honours enable_chirp: false', async () => {
    const { body } = await run('schedule_value', { teams: ['SEA', 'COL'], enable_chirp: false });
    expect(body.chirp_intelligence?.analysis_chirp).toBeUndefined();
  });
});

describe('seventh review', () => {
  it('ice never takes more than two skaters or one goalie from a club', async () => {
    const { body } = await run('get_roster_transaction_recommendations', { roster_text: 'Young Defender', opponent_text: 'Old Star\nRate Goalie' });
    const picks = body.recommendations.filter((r: any) => r.pickup).map((r: any) => r.pickup);
    const count = (key: (p: any) => string) => picks.reduce((m: Map<string, number>, p: any) => m.set(key(p), (m.get(key(p)) ?? 0) + 1), new Map());
    for (const [, n] of count((p: any) => (p.position === 'G' ? 'G:' : '') + p.team)) expect(n).toBeLessThanOrEqual(2);
    for (const [k, n] of count((p: any) => (p.position === 'G' ? 'G:' : '') + p.team)) if (k.startsWith('G:')) expect(n).toBe(1);
  });

  it('goalie streams list one goalie per club', async () => {
    vi.spyOn(NHL_STATS, 'getAll').mockReturnValue([...LEAGUE,
      mk('g4', 'Backup Goalie', 'COL', 'G', '1997-01-01', { games_played: 30, wins: 15, save_percentage: 0.915, goals_against_average: 2.4 }),
    ] as any);
    const { body } = await run('analyze_goalie_streams', { top_n: 10 });
    const clubs = body.candidates.map((c: any) => c.club);
    expect(new Set(clubs).size).toBe(clubs.length);
  });

  it('search_players marks your pasted roster', async () => {
    const { body } = await run('search_players', { count: 5, roster_text: 'Old Star' });
    expect(body.players.find((p: any) => p.name === 'Old Star').on_your_roster).toBe(true);
    expect(body.note).not.toMatch(/Pass roster_text/);
  });

  it('candidate lines say LW / RW', async () => {
    const { candidateLine } = await import('../src/domain/positions.js');
    expect(candidateLine({ name: 'Cale Makar', team: 'COL', position: 'D' })).toBe('Cale Makar (COL D)');
    expect(candidateLine({ name: 'Kirill Kaprizov', team: 'MIN', position: 'L' })).toBe('Kirill Kaprizov (MIN LW)');
  });
});

describe('directory policy', () => {
  // The directory requires tool descriptions to carry no instructions about other tools and no hidden or encoded text.
  const texts = (t: any) => [t.description, ...Object.values<any>(t.inputSchema.properties ?? {}).map(p => p.description ?? '')];
  const names = TOOL_DEFINITIONS.map(t => t.name).filter(n => n !== 'ice'); // "read the ice" is English, not the tool

  it('no tool description names another tool', () => {
    for (const t of TOOL_DEFINITIONS) for (const d of texts(t)) {
      const other = names.filter(n => n !== t.name && new RegExp(`\\b${n}\\b`).test(d));
      expect(other, `${t.name}: ${d.slice(0, 80)}`).toEqual([]);
    }
  });

  it('no tool description carries invisible or control characters', () => {
    for (const t of TOOL_DEFINITIONS) for (const d of texts(t)) {
      expect(d, t.name).not.toMatch(/[\u0000-\u001F​-‏‪-‮⁠-⁤﻿­]/);
    }
  });
});
