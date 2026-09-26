/**
 * analyze_goalie_streams — which goalie to stream for a window, from public data only.
 *
 * For every NHL goalie: his club's games in the window, each opponent's attack (0 weakest, 100 most dangerous, from
 * standings goals-for), his share of his club's games last season, his GAA and save percentage, and a stream score whose
 * formula is stated in the output. Before opening night the standings are last season's final table and the output says
 * so. The honest limit: public data does not announce starters, so start share is a proxy, not a lineup.
 */
import { NHL_SCHEDULE, NhlScheduleService } from './NhlScheduleService.js';
import { NHL_STATS, NhlStatsService } from './NhlStatsService.js';
import type { StoredPlayer } from './RosterStore.js';
import { windowLabel } from './ReadIceService.js';
import { getVersion } from '../version.js';
import { GOALIE_STARTER_GP } from '../domain/goalie-rank.js';

const SEASON_GAMES = 82; // last completed regular season, the denominator for start share
const SOFT = 40;         // an opponent attack below this is a soft night

export interface GoalieNight { date: string; opponent: string; home: boolean; attack: number | null }
export interface GoalieOutlook {
  id: string; name: string; club: string; games: number; nights: GoalieNight[];
  soft_nights: number; avg_opponent_attack: number | null; start_share: number; expected_starts: number;
  gaa: number | null; save_pct: number | null; save_pct_percentile: number | null; wins: number; stream_score: number; reason: string;
}

const round = (n: number, p = 1) => Math.round(n * 10 ** p) / 10 ** p;
const surname = (name: string) => name.trim().split(/\s+/).pop() ?? name;

/**
 * Stream score, 0–100: expected starts against four (55%), how soft the opposition is (25%), and how well he stops the
 * puck (20%). Without the last term a .880 goalie with a busy week outranked a .920 one with the same week.
 * `savePctile` is his last-season save percentage as a percentile of the league's starters (0–100; unknown = 50).
 */
export function streamScore(expectedStarts: number, avgAttack: number | null, savePctile: number | null = null): number {
  return Math.round((Math.min(expectedStarts, 4) / 4) * 55 + (100 - (avgAttack ?? 50)) * 0.25 + (savePctile ?? 50) * 0.2);
}

/** Percentile of a save percentage among goalies who started enough games for theirs to mean something. */
export function savePercentile(starterSvs: number[], sv: number | null): number | null {
  if (sv === null || !starterSvs.length) return null;
  const below = starterSvs.filter((x) => x < sv).length;
  const equal = starterSvs.filter((x) => x === sv).length;
  return Math.round(((below + equal / 2) / starterSvs.length) * 100);
}

export async function goalieStreams(opts: { look_ahead_days?: number; today?: string; roster?: StoredPlayer[]; top_n?: number } = {}) {
  await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load(), NHL_SCHEDULE.loadStandings()]);
  if (!NHL_SCHEDULE.isAvailable()) throw new Error(`analyze_goalie_streams needs the NHL schedule and it is unavailable: ${NHL_SCHEDULE.getUnavailableReason() ?? 'unknown reason'}`);
  if (!NHL_STATS.isAvailable()) throw new Error(`analyze_goalie_streams needs the NHL player index and it is unavailable: ${NHL_STATS.getUnavailableReason() ?? 'unknown reason'}`);
  if (opts.today && !/^\d{4}-\d{2}-\d{2}$/.test(opts.today)) throw new Error(`start must be a date like 2026-10-05, not "${opts.today}".`);

  const days = Math.min(14, Math.max(1, Math.round(opts.look_ahead_days ?? 7)));
  const start = opts.today ?? NhlScheduleService.today();
  const end = NhlScheduleService.addDays(start, days - 1);

  const pool = NHL_STATS.getAll().filter((p) => p.position === 'G');
  const starterSvs = pool
    .filter((p) => Number(p.stats?.games_played ?? 0) >= GOALIE_STARTER_GP && typeof p.stats?.save_percentage === 'number')
    .map((p) => p.stats!.save_percentage as number);

  const outlook = (g: { player_id: string; name: string; team: string; stats?: any }): GoalieOutlook => {
    const nights: GoalieNight[] = NHL_SCHEDULE.getGamesInRange(g.team, start, end).map((game) => ({
      date: game.date, opponent: game.opponent, home: game.home, attack: NHL_SCHEDULE.getTeamStrength(game.opponent)?.attack ?? null,
    }));
    const known = nights.filter((n) => n.attack !== null).map((n) => n.attack as number);
    const avg = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : null;
    const soft = nights.filter((n) => n.attack !== null && (n.attack as number) < SOFT).length;
    const gp = Number(g.stats?.games_played ?? 0);
    const share = round(Math.min(1, gp / SEASON_GAMES), 2);
    const expected = round(nights.length * share, 1);
    const pct = Math.round(share * 100);
    return {
      id: g.player_id, name: surname(g.name), club: g.team, games: nights.length, nights, soft_nights: soft,
      avg_opponent_attack: avg, start_share: share, expected_starts: expected,
      gaa: g.stats?.goals_against_average ?? null, save_pct: g.stats?.save_percentage ?? null, wins: Number(g.stats?.wins ?? 0),
      save_pct_percentile: savePercentile(starterSvs, g.stats?.save_percentage ?? null),
      stream_score: streamScore(expected, avg, savePercentile(starterSvs, g.stats?.save_percentage ?? null)),
      reason: nights.length === 0 ? 'No games in this window.'
        : `${nights.length} game${nights.length === 1 ? '' : 's'}, ${soft} against weak attacks; started ${pct}% of ${g.team}'s games last season`,
    };
  };

  const mineIds = new Set((opts.roster ?? []).map((p) => p.player_id));
  const yours = pool.filter((p) => mineIds.has(p.player_id)).map(outlook).sort((a, b) => b.stream_score - a.stream_score);
  const candidates = pool.filter((p) => !mineIds.has(p.player_id)).map(outlook)
    .filter((o) => o.games > 0 && o.start_share > 0)
    .sort((a, b) => b.stream_score - a.stream_score || b.expected_starts - a.expected_starts)
    .slice(0, Math.max(1, Math.min(25, opts.top_n ?? 8)));

  const best = candidates[0];
  const standingsSeason = NHL_SCHEDULE.getStandingsSeason();
  const currentSeason = NhlScheduleService.seasonForDate(new Date(`${start}T12:00:00Z`));
  const lastSeasonTable = standingsSeason && standingsSeason !== currentSeason;

  return {
    window: { start, end, days, label: windowLabel(start, end) },
    your_goalies: yours,
    candidates,
    take: best
      ? `${best.name} (${best.club}): ${best.games} game${best.games === 1 ? '' : 's'}, ${best.soft_nights} against weak attacks, and he started ${Math.round(best.start_share * 100)}% of his team's games last season${best.save_pct !== null ? ` at ${best.save_pct.toFixed(3).replace(/^0/, '')}` : ''}. Best stream on the board.`
      : 'No goalie has games in this window.',
    method: {
      stream_score: 'expected starts against four × 55, plus (100 − average opponent attack) × 0.25, plus save % percentile × 0.2; expected starts = games in window × last season\'s start share',
      save_pct_percentile: `last season's save % ranked against goalies with ${GOALIE_STARTER_GP}+ games: 0 worst, 100 best; unknown counts as 50`,
      attack: 'opponent goals for per game, ranked across the league: 0 weakest attack, 100 most dangerous',
      soft_night: `an opponent attack below ${SOFT}`,
    },
    limits: [
      'Starting goalies are not announced in public data. Start share is last season\'s, a proxy for who plays, not a lineup.',
      'League availability is unknowable from public data: candidates are every goalie not on the roster you pasted.',
      ...(lastSeasonTable ? ['Opponent strength is last season\'s final standings until the new season has games.'] : []),
    ],
    source: {
      analyst: `chirp@${getVersion()}`,
      data: [
        `NHL api-web club-schedule-season ${NHL_SCHEDULE.getSeason() ?? 'unknown season'}`,
        `NHL standings ${standingsSeason ?? 'unavailable'}${lastSeasonTable ? ' (last season, final)' : ''}`,
        `NHL club stats ${NhlStatsService.previousSeason(NhlStatsService.currentSeason())} (goalie games, wins, GAA, save %)`,
      ],
    },
  };
}
