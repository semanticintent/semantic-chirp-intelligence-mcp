/**
 * One goalie ranking, shared by every tool that orders goalies.
 *
 * Wins are largely a team statistic: ranked on wins alone, a .895 goalie on a strong club outranks a .912 goalie on a
 * weak one. Starters — goalies with a starter's workload — are ordered on a blend of wins, save percentage and
 * goals-against average, each standardised against the other starters. Goalies below the workload threshold follow,
 * by games played. search_players and draft_kit disagreed about the best goalie until both used this.
 */
import type { NhlPlayer } from '../services/NhlStatsService.js';

/** A starter's workload: below this many games a goalie's rates say little. */
export const GOALIE_STARTER_GP = 20;

export function rankGoalies<T extends Pick<NhlPlayer, 'stats'>>(goalies: T[]): T[] {
  const starters = goalies.filter(g => (g.stats?.games_played ?? 0) >= GOALIE_STARTER_GP);
  const z = (values: number[]) => {
    const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length)) || 1;
    return (v: number) => (v - mean) / sd;
  };
  const zW = z(starters.map(g => g.stats?.wins ?? 0));
  const zSv = z(starters.map(g => g.stats?.save_percentage ?? 0));
  const zGaa = z(starters.map(g => g.stats?.goals_against_average ?? 0));
  const value = (g: T) =>
    0.4 * zW(g.stats?.wins ?? 0) + 0.35 * zSv(g.stats?.save_percentage ?? 0) - 0.25 * zGaa(g.stats?.goals_against_average ?? 0);
  const backups = goalies.filter(g => (g.stats?.games_played ?? 0) < GOALIE_STARTER_GP)
    .sort((a, b) => (b.stats?.games_played ?? 0) - (a.stats?.games_played ?? 0));
  return [...[...starters].sort((a, b) => value(b) - value(a)), ...backups];
}
