// @ts-nocheck
/**
 * StreamingAnalysis - Template Method Pattern Implementation
 *
 * Recommends waiver wire pickups based on schedule advantages and player trends.
 */

import { AnalysisTemplate } from '../template/AnalysisTemplate.js';
import { ChirpIntelligence } from '../services/ChirpIntelligence.js';
import { NHL_SCHEDULE, NhlScheduleService } from '../services/NhlScheduleService.js';
import {
  FantasyData,
  AnalysisResponse,
  SemanticChirpContract,
  Recommendation,
  Player,
  AnalysisInsights,
  AnalysisMetadata
} from '../domain/types.js';
import { LEAGUE_DATA, LeagueDataService, NO_ROSTER_MESSAGE } from '../services/LeagueDataService.js';
import { NHL_STATS } from '../services/NhlStatsService.js';

/** Candidates from any one club, so a single heavy schedule cannot fill the list. */
const MAX_PER_CLUB = 2;

export interface StreamingArgs {
  look_ahead_days?: number;
  /** One position ("RW") or several (["C", "RW"]). */
  position_filter?: string | string[];
  max_recommendations?: number;
}

export interface StreamingPlayerAnalysis {
  player: Player;
  games_this_week: number;
  recent_performance: string;
  pickup_priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  reasoning: string;
}

export class StreamingAnalysis extends AnalysisTemplate {
  constructor() {
    super("get_streaming_recommendations", "streaming_strategy");
  }

  /**
   * Hook 1: Fetch raw data from Yahoo API
   */
  protected async fetchData(args: StreamingArgs): Promise<any> {
    // v4: no waiver wire exists without league-private ownership data, so the
    // pool is "NHL players not on the rosters you gave me", ranked by
    // production. The caveat travels with the results.
    await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load()]);

    // The tool schema has always offered position_filter; it was never applied, so asking for RW returned centres.
    const wanted = (Array.isArray(args.position_filter) ? args.position_filter : args.position_filter ? [args.position_filter] : [])
      .map(p => String(p).trim().toUpperCase()).filter(Boolean);
    const pool = wanted.length
      ? wanted.flatMap(pos => LEAGUE_DATA.getPlayerPool({ position: pos, limit: 120 }))
      : LEAGUE_DATA.getPlayerPool({ limit: 120 });
    const seen = new Set<string>();

    return {
      pool: pool.filter(p => !seen.has(p.player_id) && seen.add(p.player_id)),
      roster: LEAGUE_DATA.getRoster(),
      pool_caveat: LeagueDataService.POOL_CAVEAT
    };

  }

  /**
   * Hook 2: Prepare data into FantasyData structure
   */
  protected async prepareData(rawData: any, args: StreamingArgs): Promise<FantasyData> {
    // The pool is already resolved NHL players; there is no platform payload
    // left to traverse.
    return {
      availablePlayers: rawData.pool ?? [],
      roster: rawData.roster ?? undefined,
      poolCaveat: rawData.pool_caveat
    } as any;

  }

  /**
   * Hook 3: Analyze data to generate streaming recommendations
   */
  protected async analyzeData(data: FantasyData, args: StreamingArgs): Promise<StreamingPlayerAnalysis[]> {
    const lookAheadDays = args.look_ahead_days || 7;
    const maxRecommendations = args.max_recommendations || 5;

    const streamingRecommendations: StreamingPlayerAnalysis[] = [];

    // Analyze each available player
    for (const player of data.availablePlayers || []) {
      // Real games in the look-ahead window for this player's actual club
      const gamesThisWeek = this.countGamesThisWeek(player, lookAheadDays);

      // Priority from facts that exist: games in the window, then last season's production. League ownership is
      // private and unknown here, so it no longer enters the reasoning — it used to report "low ownership
      // (undefined%)" for every player.
      const st = (player as any).stats;
      const gp = st?.games_played ?? 0;
      const ppg = gp > 0 ? ((st?.goals ?? 0) + (st?.assists ?? 0)) / gp : 0;
      const mins = gp > 0 ? (st?.time_on_ice_per_game ?? 0) / 60 : 0;
      const facts = [`${gamesThisWeek} game${gamesThisWeek === 1 ? '' : 's'} in the window`];
      if (player.position !== 'G' && gp > 0) facts.push(`${ppg.toFixed(2)} P/gm`, `${mins.toFixed(1)} min/gm last season`);

      let pickupPriority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      if (gamesThisWeek >= 4) pickupPriority = 'HIGH';
      else if (gamesThisWeek === 3) pickupPriority = 'MEDIUM';
      else pickupPriority = 'LOW';
      const reasoning = facts.join(', ');

      streamingRecommendations.push({
        player,
        games_this_week: gamesThisWeek,
        recent_performance: this.describePerformance(player),
        pickup_priority: pickupPriority,
        reasoning
      });
    }

    // Sort by priority and games
    streamingRecommendations.sort((a, b) => {
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const priorityDiff = priorityOrder[a.pickup_priority] - priorityOrder[b.pickup_priority];
      if (priorityDiff !== 0) return priorityDiff;
      if (b.games_this_week !== a.games_this_week) return b.games_this_week - a.games_this_week;
      return ((b.player as any).stats?.points ?? 0) - ((a.player as any).stats?.points ?? 0);
    });

    // At most two candidates per club. Ranking games-first let one club fill every slot — five NYR depth players,
    // including 0.28 P/gm skaters, ahead of better producers whose clubs play once fewer.
    const perClub = new Map<string, number>();
    const spread = streamingRecommendations.filter(r => {
      const n = perClub.get(r.player.team) ?? 0;
      if (n >= MAX_PER_CLUB) return false;
      perClub.set(r.player.team, n + 1);
      return true;
    });
    return spread.slice(0, maxRecommendations);
  }

  /**
   * Hook 4: Generate chirp-enhanced response
   */
  protected async generateChirp(
    analysisResults: StreamingPlayerAnalysis[],
    semanticContract: SemanticChirpContract,
    data: FantasyData
  ): Promise<any> {
    return ChirpIntelligence.enhance(
      this.toolName,
      // streaming_targets is what the chirp counts; without it the chirp read "0 streaming opportunities" above a list.
      { streaming_recommendations: analysisResults, streaming_targets: analysisResults },
      semanticContract
    );
  }

  /**
   * Hook 5: Format final response
   */
  protected async formatResponse(
    chirpEnhanced: any,
    data: FantasyData
  ): Promise<AnalysisResponse> {
    const streamingData = chirpEnhanced.streaming_recommendations as StreamingPlayerAnalysis[];

    // Convert to standard Recommendation format
    const recommendations: Recommendation[] = streamingData.map(analysis => ({
      priority: analysis.pickup_priority,
      action: 'pickup',
      pickup: analysis.player,
      reasoning: analysis.reasoning
    }));

    const analysisInsights: AnalysisInsights = {
      pool_caveat: (data as any).poolCaveat,
      schedule_source: this.scheduleAvailable()
        ? `NHL public API (season ${NHL_SCHEDULE.getSeason()})`
        : `UNAVAILABLE - ${NHL_SCHEDULE.getUnavailableReason()}; game counts shown as 0`,
      streaming_summary: {
        total_recommendations: streamingData.length,
        high_priority_count: streamingData.filter(s => s.pickup_priority === 'HIGH' || s.pickup_priority === 'CRITICAL').length,
        average_games_per_player: streamingData.reduce((sum, s) => sum + s.games_this_week, 0) / streamingData.length || 0
      },
      top_targets: streamingData.slice(0, 3).map(s => ({
        player: s.player.name,
        games: s.games_this_week,
        reasoning: s.reasoning
      }))
    };

    const metadata: AnalysisMetadata = {
      analysis_type: this.analysisType,
      timestamp: new Date().toISOString(),
      team_context: {
        team_name: data.roster?.team_name || 'Your Team'
      },
      semantic_contract_applied: true
    };

    return {
      analysis_insights: analysisInsights,
      recommendations,
      chirp_intelligence: chirpEnhanced.chirp_intelligence,
      metadata
    };
  }

  /**
   * Helper: Parse roster data
   */
  private parseRoster(rosterData: any): { team_key: string; team_name: string; players: Player[] } {
    const team = rosterData.fantasy_content?.team?.[0] || {};
    const rosterPlayers = rosterData.fantasy_content?.team?.[1]?.roster?.['0']?.players?.['0']?.player || [];

    const players = rosterPlayers.map((playerData: any) => {
      const player = playerData.player?.[0] || playerData;
      return {
        player_id: player.player_id,
        name: player.name?.full || 'Unknown',
        position: player.display_position || player.primary_positions?.[0] || 'Unknown',
        team: player.editorial_team_abbr || '',
        selected_position: player.selected_position || [],
        status: player.status
      };
    });

    return {
      team_key: team.team_key || '',
      team_name: team.name || 'Your Team',
      players
    };
  }

  /**
   * Helper: Parse player stats from API response
   */
  private parsePlayerStats(player: any): any {
    // Simplified - would parse actual stats in production
    return {
      percent_owned: player.percent_owned?.value || 0,
      display_position: player.display_position
    };
  }

  /**
   * Helper: Count this player's real club games in the look-ahead window.
   *
   * Every player used to return the same number here, which made the
   * "4 games this week, low ownership" branch unreachable in practice.
   * Returns 0 when the schedule is unavailable so no player is promoted on
   * imaginary volume; `scheduleAvailable()` reports why.
   */
  private countGamesThisWeek(player: Player, lookAheadDays: number): number {
    if (!NHL_SCHEDULE.isAvailable()) return 0;

    const start = NhlScheduleService.today();
    const end = NhlScheduleService.addDays(start, Math.max(0, lookAheadDays - 1));

    return NHL_SCHEDULE.countGamesInRange(player.team, start, end);
  }

  /** Whether recommendations in this run were backed by the real schedule. */
  private scheduleAvailable(): boolean {
    return NHL_SCHEDULE.isAvailable();
  }

  /**
   * Helper: Describe recent performance
   */
  private describePerformance(player: Player): string {
    // From the stat line, not ownership — which is unknown, and used to label every player a "deep league sleeper".
    const st = (player as any).stats;
    const gp = st?.games_played ?? 0;
    if (player.position === 'G') {
      return gp > 0 ? `${gp} GP, ${(st?.save_percentage ?? 0).toFixed(3).replace(/^0/, '')} SV% last season` : 'No games last season';
    }
    return gp > 0 ? `${st?.points ?? 0} points in ${gp} games last season` : 'No games last season';
  }

}
