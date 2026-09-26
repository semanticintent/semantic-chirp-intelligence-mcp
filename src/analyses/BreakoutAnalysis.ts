/**
 * 📈 Breakout Analysis — young skaters whose underlying numbers run ahead of their points
 *
 * A breakout candidate is a young player whose opportunity and process already look like a bigger producer's:
 * real ice time, real shot volume, and a shooting percentage below what the rest of the league converts at. Those
 * inputs tend to persist; a low conversion rate on high volume tends not to. Every input here is a last-completed-season
 * figure from the NHL's club statistics, and the league norms it compares against are computed from the same data at
 * run time rather than asserted.
 *
 * What it deliberately does not claim: line assignments, power-play units, projections or availability in your
 * league. None of those has a public source, so no catalyst, reason or score here depends on them.
 *
 * Score (0–100) = 0.30 production + 0.25 usage + 0.20 shot volume + 0.15 conversion upside + 0.10 youth,
 * less up to 15 points for a small sample. Each component is itself clamped to 0–100.
 */

import { AnalysisTemplate } from '../template/AnalysisTemplate.js';
import type { SemanticChirpContract, AnalysisResponse, FantasyData } from '../domain/types.js';
import { LEAGUE_DATA, LeagueDataService } from '../services/LeagueDataService.js';
import { NHL_STATS, NhlStatsService } from '../services/NhlStatsService.js';

interface BreakoutAnalysisArgs {
  readonly position_filter?: string[];
  readonly breakout_age_max?: number;
  readonly min_score?: number;
  readonly max_results?: number;
}

export interface BreakoutCandidate {
  readonly player_id: string;
  readonly name: string;
  readonly team: string;
  readonly position: string;
  readonly age: number;
  readonly games_played: number;
  readonly points_per_game: number;
  readonly minutes_per_game: number;
  readonly shots_per_game: number;
  readonly shooting_pct: number | null;
  readonly components: Record<string, number>;
  readonly breakout_score: number;
  readonly category: 'strong' | 'watch' | 'longshot';
  readonly reasons: string[];
}

/** Below this many games a season line is too thin to read much into. */
const MIN_GAMES = 20;
const SAMPLE_GAMES = 60;
const DEFAULT_AGE_MAX = 26;

const clamp = (n: number) => Math.max(0, Math.min(100, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

export class BreakoutAnalysis extends AnalysisTemplate {
  constructor() {
    super('analyze_breakout_players', 'breakout_analysis');
  }

  protected async fetchData(_args: BreakoutAnalysisArgs): Promise<any> {
    await NHL_STATS.load();
    return {
      // Skaters across the whole league, so norms are league-wide; the candidates themselves exclude rostered players.
      league: NHL_STATS.getAll().filter(p => p.position !== 'G' && (p.stats?.games_played ?? 0) >= MIN_GAMES),
      pool: LEAGUE_DATA.getPlayerPool(),
      caveat: LeagueDataService.POOL_CAVEAT,
    };
  }

  protected async prepareData(rawData: any, _args: BreakoutAnalysisArgs): Promise<FantasyData> {
    return {
      league: rawData.league,
      pool: rawData.pool,
      caveat: rawData.caveat,
      norms: this.leagueNorms(rawData.league),
    } as any;
  }

  /** League conversion rates by position group, from the same season's data — not a remembered constant. */
  private leagueNorms(league: any[]): { forward: number | null; defence: number | null } {
    const rate = (group: any[]) => {
      const shots = group.reduce((n, p) => n + (p.stats?.shots ?? 0), 0);
      const goals = group.reduce((n, p) => n + (p.stats?.goals ?? 0), 0);
      return shots > 0 ? (goals / shots) * 100 : null;
    };
    return {
      forward: rate(league.filter(p => p.position !== 'D')),
      defence: rate(league.filter(p => p.position === 'D')),
    };
  }

  protected async analyzeData(data: FantasyData, args: BreakoutAnalysisArgs): Promise<any> {
    const d = data as any;
    const ageMax = args.breakout_age_max ?? DEFAULT_AGE_MAX;
    const wanted = (args.position_filter ?? []).map(p => p.toUpperCase());
    const maxResults = Math.max(1, args.max_results ?? 10);

    const candidates: BreakoutCandidate[] = [];
    for (const p of d.pool as any[]) {
      if (p.position === 'G') continue;
      const s = p.stats;
      const gp = s?.games_played ?? 0;
      if (gp < MIN_GAMES) continue;

      // The age filter is the definition of a breakout candidate, so a player without a known age is excluded
      // rather than assumed young.
      const age = NhlStatsService.ageOf(p);
      if (age === null || age > ageMax) continue;

      const positions = String(p.position).split(',').map((x: string) => x.trim().toUpperCase());
      if (wanted.length && !wanted.some(w => positions.includes(w))) continue;

      candidates.push(this.score(p, age, gp, ageMax, d.norms));
    }

    const ranked = candidates
      .filter(c => c.breakout_score >= (args.min_score ?? 0))
      .sort((a, b) => b.breakout_score - a.breakout_score);

    const byPosition: Record<string, { count: number; top: string | null }> = {};
    for (const pos of ['C', 'LW', 'RW', 'D']) {
      const group = ranked.filter(c => c.position.split(',').includes(pos));
      byPosition[pos] = { count: group.length, top: group[0]?.name ?? null };
    }

    return {
      age_max: ageMax,
      stats_season: NHL_STATS.getSeasons().stats,
      league_shooting_pct: {
        forwards: d.norms.forward === null ? null : round1(d.norms.forward),
        defence: d.norms.defence === null ? null : round1(d.norms.defence),
      },
      eligible: ranked.length,
      candidates: ranked.slice(0, maxResults),
      by_position: byPosition,
      caveat: d.caveat,
    };
  }

  private score(p: any, age: number, gp: number, ageMax: number, norms: { forward: number | null; defence: number | null }): BreakoutCandidate {
    const s = p.stats;
    const isD = String(p.position).split(',').includes('D');
    const points = (s.goals ?? 0) + (s.assists ?? 0);
    const ppg = points / gp;
    const toi = (s.time_on_ice_per_game ?? 0) / 60;           // NHL publishes seconds per game
    const spg = (s.shots ?? 0) / gp;
    const shots = s.shots ?? 0;
    const shPct = shots > 0 ? ((s.goals ?? 0) / shots) * 100 : null;
    const norm = isD ? norms.defence : norms.forward;

    const components = {
      production: clamp((ppg / (isD ? 0.8 : 1.1)) * 100),
      usage: clamp(((toi - (isD ? 16 : 11)) / (isD ? 8 : 9)) * 100),
      shot_volume: clamp((spg / (isD ? 2.5 : 3.5)) * 100),
      // Upside only when the player shoots enough for the rate to mean something and converts below the league.
      conversion_upside: shPct !== null && norm && shots >= 80 && shPct < norm ? clamp(((norm - shPct) / norm) * 200) : 0,
      youth: clamp(((ageMax - age) / Math.max(1, ageMax - 19)) * 100),
    };
    const samplePenalty = gp >= SAMPLE_GAMES ? 0 : ((SAMPLE_GAMES - gp) / (SAMPLE_GAMES - MIN_GAMES)) * 15;

    const breakout_score = Math.round(clamp(
      0.30 * components.production + 0.25 * components.usage + 0.20 * components.shot_volume +
      0.15 * components.conversion_upside + 0.10 * components.youth - samplePenalty,
    ));

    // Reasons are the numbers themselves, never an inferred role.
    const reasons = [`age ${age}`, `${round1(toi)} min/gm`, `${round1(spg)} shots/gm`, `${round2(ppg)} P/gm over ${gp} GP`];
    if (components.conversion_upside > 0 && shPct !== null && norm) {
      reasons.push(`shooting ${round1(shPct)}% on ${shots} shots vs a league ${isD ? 'defence' : 'forward'} rate of ${round1(norm)}%`);
    }
    if (gp < SAMPLE_GAMES) reasons.push(`small sample (${gp} GP)`);

    return {
      player_id: p.player_id,
      name: p.name,
      team: p.team,
      position: p.position,
      age,
      games_played: gp,
      points_per_game: round2(ppg),
      minutes_per_game: round1(toi),
      shots_per_game: round1(spg),
      shooting_pct: shPct === null ? null : round1(shPct),
      components: Object.fromEntries(Object.entries(components).map(([k, v]) => [k, Math.round(v)])),
      breakout_score,
      category: breakout_score >= 60 ? 'strong' : breakout_score >= 45 ? 'watch' : 'longshot',
      reasons,
    };
  }

  protected async generateChirp(results: any, semanticContract: SemanticChirpContract, _data: FantasyData): Promise<any> {
    if (semanticContract.enable_chirp === false) return results;
    const top: BreakoutCandidate | undefined = results.candidates[0];
    const rebound = results.candidates.find((c: BreakoutCandidate) => c.components.conversion_upside > 0);
    const parts: string[] = [];
    if (!top) {
      parts.push(`No skater aged ${results.age_max} or under with ${MIN_GAMES}+ games passes those filters.`);
    } else {
      parts.push(`${top.name} leads: ${top.reasons.slice(0, 3).join(', ')}.`);
      if (rebound && rebound !== top) {
        parts.push(`${rebound.name} is the one to watch — ${rebound.reasons.find((r: string) => r.startsWith('shooting'))}. That usually corrects.`);
      }
    }
    return { ...results, chirp_intelligence: { analysis_chirp: parts.join(' ') } };
  }

  protected async formatResponse(chirpEnhanced: any, _data: FantasyData): Promise<AnalysisResponse> {
    return {
      analysis_insights: {
        basis: `Last completed season (${chirpEnhanced.stats_season}) NHL club statistics. League shooting rates are ` +
          'computed from the same data. Skaters only.',
        age_max: chirpEnhanced.age_max,
        league_shooting_pct: chirpEnhanced.league_shooting_pct,
        eligible_candidates: chirpEnhanced.eligible,
        candidates: chirpEnhanced.candidates,
        by_position: chirpEnhanced.by_position,
        availability: chirpEnhanced.caveat,
        not_included: [
          'Projections — this reads last season, it does not forecast',
          'Line assignments and power-play units — not published by the NHL',
          'Whether a player is available in your league — ownership is league-private',
        ],
      } as any,
      recommendations: chirpEnhanced.candidates.slice(0, 5).map((c: BreakoutCandidate) => ({
        priority: c.category === 'strong' ? 'HIGH' : 'MEDIUM',
        action: 'watch',
        reasoning: `${c.name} (${c.team} ${c.position}) — ${c.reasons.join(', ')}`,
      })) as any,
      chirp_intelligence: chirpEnhanced.chirp_intelligence ?? { analysis_chirp: '' },
      metadata: {
        analysis_type: this.analysisType,
        timestamp: new Date().toISOString(),
        semantic_contract_applied: true,
      } as any,
    };
  }
}
