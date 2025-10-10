// @ts-nocheck
/**
 * StreamingAnalysis - Template Method Pattern Implementation
 *
 * Recommends waiver wire pickups based on schedule advantages and player trends.
 */

import { AnalysisTemplate } from '../template/AnalysisTemplate.js';
import { YahooApiClient } from '../services/YahooApiClient.js';
import { ChirpIntelligence } from '../services/ChirpIntelligence.js';
import {
  FantasyData,
  AnalysisResponse,
  SemanticChirpContract,
  Recommendation,
  Player,
  AnalysisInsights,
  AnalysisMetadata
} from '../domain/types.js';

export interface StreamingArgs {
  look_ahead_days?: number;
  position_filter?: string[];
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
  constructor(
    private readonly apiClient: YahooApiClient,
    private readonly leagueId: string,
    private readonly teamId: string
  ) {
    super("get_streaming_recommendations", "streaming_strategy");
  }

  /**
   * Hook 1: Fetch raw data from Yahoo API
   */
  protected async fetchData(args: StreamingArgs): Promise<any> {
    try {
      // Fetch trending players (hot pickups)
      const trendingData = await this.apiClient.request(
        `/fantasy/v2/league/${this.leagueId}/players;status=A;sort=AR`
      );

      // Fetch your current roster to avoid recommending owned players
      const rosterData = await this.apiClient.getTeamRoster(this.leagueId, this.teamId);

      // Fetch league scoreboard for schedule data
      const scoreboardData = await this.apiClient.getLeagueScoreboard(this.leagueId);

      return {
        trending: trendingData,
        roster: rosterData,
        scoreboard: scoreboardData
      };
    } catch (error) {
      throw new Error(`Failed to fetch streaming data: ${error}`);
    }
  }

  /**
   * Hook 2: Prepare data into FantasyData structure
   */
  protected async prepareData(rawData: any, args: StreamingArgs): Promise<FantasyData> {
    const { trending, roster, scoreboard } = rawData;

    // Parse current roster to filter out owned players
    const ownedPlayerIds = new Set<string>();
    const rosterPlayers = roster.fantasy_content?.team?.[1]?.roster?.['0']?.players?.['0']?.player || [];

    for (const playerData of rosterPlayers) {
      const player = playerData.player?.[0] || playerData;
      ownedPlayerIds.add(player.player_id);
    }

    // Parse available trending players
    const availablePlayers: Player[] = [];
    const trendingPlayers = trending.fantasy_content?.league?.[1]?.players?.['0']?.player || [];

    for (const playerData of trendingPlayers) {
      const player = playerData.player?.[0] || playerData;
      const playerId = player.player_id;

      // Skip if already owned
      if (ownedPlayerIds.has(playerId)) {
        continue;
      }

      // Apply position filter if specified
      const position = player.display_position || player.primary_positions?.[0] || 'Unknown';
      if (args.position_filter && args.position_filter.length > 0) {
        if (!args.position_filter.includes(position)) {
          continue;
        }
      }

      availablePlayers.push({
        player_id: playerId,
        name: player.name?.full || 'Unknown',
        position: position,
        team: player.editorial_team_abbr || '',
        selected_position: ['FA'], // Free agent
        status: player.status,
        percent_owned: parseFloat(player.percent_owned?.value || '0'),
        stats: this.parsePlayerStats(player)
      });

      // Limit to top available players
      if (availablePlayers.length >= (args.max_recommendations || 10) * 2) {
        break;
      }
    }

    return {
      availablePlayers,
      roster: this.parseRoster(roster),
      scoreboard: scoreboard
    };
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
      // Calculate games this week (simplified - would use actual schedule in production)
      const gamesThisWeek = this.estimateGamesThisWeek(player, lookAheadDays);

      // Determine pickup priority based on games and ownership
      let pickupPriority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      let reasoning: string;

      if (gamesThisWeek >= 4 && (player.percent_owned || 0) < 20) {
        pickupPriority = 'HIGH';
        reasoning = `${gamesThisWeek} games this week, low ownership (${player.percent_owned?.toFixed(1)}%)`;
      } else if (gamesThisWeek >= 3) {
        pickupPriority = 'MEDIUM';
        reasoning = `${gamesThisWeek} games this week, good volume play`;
      } else if ((player.percent_owned || 0) > 50) {
        pickupPriority = 'HIGH';
        reasoning = `High ownership (${player.percent_owned?.toFixed(1)}%) trending player`;
      } else {
        pickupPriority = 'LOW';
        reasoning = `${gamesThisWeek} games this week, speculative add`;
      }

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
      return b.games_this_week - a.games_this_week;
    });

    return streamingRecommendations.slice(0, maxRecommendations);
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
      { streaming_recommendations: analysisResults },
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
   * Helper: Estimate games this week for a player
   */
  private estimateGamesThisWeek(player: Player, lookAheadDays: number): number {
    // Simplified calculation - in production would use actual NHL schedule
    // Average NHL team plays 3-4 games per week
    const gamesPerWeek = 3.5;
    return Math.round((lookAheadDays / 7) * gamesPerWeek);
  }

  /**
   * Helper: Describe recent performance
   */
  private describePerformance(player: Player): string {
    // Simplified - would analyze actual recent stats in production
    const ownership = player.percent_owned || 0;

    if (ownership > 70) {
      return "Widely owned hot player";
    } else if (ownership > 40) {
      return "Trending upward";
    } else if (ownership > 20) {
      return "Under-the-radar option";
    } else {
      return "Deep league sleeper";
    }
  }
}
