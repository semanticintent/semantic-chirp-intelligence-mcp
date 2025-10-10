/**
 * 🏒❄️ ICE Analysis - Intent Chirp Engine
 *
 * Concrete implementation of AnalysisTemplate for roster transaction recommendations.
 * This is the flagship "ICE" tool - championship-level optimization with savage analysis.
 *
 * Analysis Type: ice_roster
 * Semantic Identity: ICE - Intent Chirp Engine
 * Default Intensity: ice_cold
 */

import { AnalysisTemplate } from '../template/AnalysisTemplate.js';
import type {
  AnalysisType,
  SemanticChirpContract,
  AnalysisResponse,
  FantasyData,
  Recommendation,
  AnalysisInsights
} from '../domain/types.js';
import { YahooApiClient } from '../services/YahooApiClient.js';
import { ChirpIntelligence } from '../services/ChirpIntelligence.js';

interface IceAnalysisArgs {
  look_ahead_days?: number;
  target_positions?: string[];
}

interface RosterAnalysis {
  C: any[];
  LW: any[];
  RW: any[];
  D: any[];
  G: any[];
  bench: any[];
  ir: any[];
  active: any[];
  position_counts: {
    C: number;
    LW: number;
    RW: number;
    D: number;
    G: number;
    bench: number;
  };
  strength_score: number;
  weakest_position: string;
}

/**
 * ICE Analysis - The ultimate roster optimization engine
 */
export class IceAnalysis extends AnalysisTemplate {
  private apiClient: YahooApiClient;
  private leagueId: string;
  private teamId: string;

  constructor(
    apiClient: YahooApiClient,
    leagueId: string,
    teamId: string
  ) {
    super("get_roster_transaction_recommendations", "ice_roster");
    this.apiClient = apiClient;
    this.leagueId = leagueId;
    this.teamId = teamId;
  }

  /**
   * Hook 1: Fetch raw data from Yahoo API
   */
  protected async fetchData(args: IceAnalysisArgs): Promise<any> {
    const lookAheadDays = args.look_ahead_days || 7;

    // Fetch all data needed for ICE analysis in parallel
    const [rosterData, gamesInHandData, streamingData] = await Promise.all([
      this.apiClient.getTeamRoster(this.leagueId, this.teamId),
      this.fetchGamesInHand(),
      this.fetchStreamingRecommendations(lookAheadDays)
    ]);

    return {
      roster: rosterData,
      gamesInHand: gamesInHandData,
      streaming: streamingData,
      lookAheadDays
    };
  }

  /**
   * Hook 2: Prepare and transform data for analysis
   */
  protected async prepareData(rawData: any, args: IceAnalysisArgs): Promise<FantasyData> {
    // Parse roster from Yahoo API response
    const teamArray = rawData.roster.fantasy_content.team[0];
    const rosterData = rawData.roster.fantasy_content.team[1].roster["0"].players;

    const teamKey = teamArray.find((item: any) => item.team_key)?.team_key;
    const teamName = teamArray.find((item: any) => item.name)?.name;

    // Parse players
    const playerKeys = Object.keys(rosterData).filter(key => key !== 'count');
    const players = playerKeys.map(key => {
      const playerData = rosterData[key].player[0];
      const positionData = rosterData[key].player[1];

      const player_id = playerData.find((item: any) => item.player_id)?.player_id;
      const name = playerData.find((item: any) => item.name)?.name?.full;
      const position = positionData.eligible_positions?.position.join(',') || '';
      const team = playerData.find((item: any) => item.editorial_team_abbr)?.editorial_team_abbr;
      const selected_position = positionData.selected_position?.position || '';
      const status = playerData.find((item: any) => item.status)?.status || '';

      return {
        player_id,
        name,
        position,
        team,
        selected_position,
        status
      };
    });

    // Return FantasyData with roster structure
    // Store extra context (gamesInHand, streaming) for use in analyzeData
    // Exclude 'roster' from spread to prevent overwriting our parsed roster
    const { roster: _roster, ...extendedData } = rawData;

    return {
      roster: {
        team_key: teamKey,
        team_name: teamName,
        players: players
      },
      // Include extended data (gamesInHand, streaming) without overwriting roster
      ...extendedData
    } as FantasyData;
  }

  /**
   * Hook 3: Execute core ICE analysis logic
   */
  protected async analyzeData(data: FantasyData, args: IceAnalysisArgs): Promise<any> {
    // Guard: Ensure roster exists
    if (!data.roster) {
      throw new Error("No roster data available for analysis");
    }

    // Analyze current roster strengths/weaknesses
    const rosterAnalysis = this.analyzeRosterStrengths(data);

    // Find all transaction opportunities
    const recommendations: Recommendation[] = [];

    // Access extended data properties (gamesInHand, streaming)
    const extendedData = data as any;

    // 1. CRITICAL: Injured players in active lineup
    const injuredActive = (data.roster?.players || []).filter((p: any) =>
      p.status && p.status !== "" && !p.selected_position.includes("IR")
    );

    for (const player of injuredActive) {
      recommendations.push({
        priority: "CRITICAL",
        action: "drop",  // Aligned with RecommendationAction type
        player: player,
        reasoning: `${player.name} is ${player.status} but still in active lineup - move to IR`
      });
    }

    // 2. HIGH: Position weakness fixes
    const weakPositions = this.identifyWeakPositions(data, rosterAnalysis);

    for (const position of weakPositions) {
      const bestAvailable = extendedData.streaming?.streaming_targets
        ?.filter((p: any) => args.target_positions ? args.target_positions.includes(position.position) : true)
        .filter((p: any) => p.position.includes(position.position))
        .slice(0, 3) || [];

      if (bestAvailable.length > 0) {
        const dropCandidate = this.findBestDropCandidate(data, position.position);

        recommendations.push({
          priority: "HIGH",
          action: "pickup",  // Aligned with RecommendationAction type
          pickup: bestAvailable[0],
          drop: dropCandidate,
          reasoning: `Strengthen ${position.position} - ${position.weakness_reason}`
        });
      }
    }

    // 3. MEDIUM: Schedule optimization
    const gamesDiff = extendedData.gamesInHand?.games_in_hand_difference || 0;
    if (gamesDiff < 0) {
      const volumePickups = extendedData.streaming?.streaming_targets
        ?.filter((t: any) => t.team_trending_count >= 3)
        .slice(0, 2) || [];

      for (const pickup of volumePickups) {
        recommendations.push({
          priority: "MEDIUM",
          action: "volume_play",
          pickup: pickup,
          reasoning: `Opponent has ${Math.abs(gamesDiff)} more games - need volume players`
        });
      }
    }

    // 4. Bench optimizations
    const benchUpgrades = this.findBenchUpgrades(data);
    recommendations.push(...benchUpgrades);

    // Sort by priority
    const sortedRecommendations = recommendations
      .sort((a, b) => {
        const priorityOrder: Record<string, number> = {
          "CRITICAL": 0,
          "HIGH": 1,
          "MEDIUM": 2,
          "LOW": 3
        };
        return (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
      })
      .slice(0, 8); // Top 8 recommendations

    return {
      roster_analysis: rosterAnalysis,
      immediate_issues: injuredActive.length,
      games_disadvantage: gamesDiff,
      weak_positions: weakPositions,
      recommendations: sortedRecommendations,
      optimal_timing: extendedData.streaming?.optimal_timing,
      market_intelligence: extendedData.streaming?.market_intelligence
    };
  }

  /**
   * Hook 4: Generate chirp intelligence commentary
   */
  protected async generateChirp(
    analysisResults: any,
    semanticContract: SemanticChirpContract,
    data: FantasyData
  ): Promise<any> {
    // Use ChirpIntelligence service to enhance results
    return ChirpIntelligence.enhance(
      this.toolName,
      analysisResults,
      semanticContract
    );
  }

  /**
   * Hook 5: Format final response structure
   */
  protected async formatResponse(
    chirpEnhanced: any,
    data: FantasyData
  ): Promise<AnalysisResponse> {
    // Format insights according to AnalysisInsights interface
    const insights: AnalysisInsights = {
      immediate_issues: chirpEnhanced.immediate_issues || 0,
      games_disadvantage: chirpEnhanced.games_disadvantage || 0,
      weak_positions: chirpEnhanced.weak_positions || [],
      optimal_timing: chirpEnhanced.optimal_timing,
      market_intelligence: chirpEnhanced.market_intelligence
    };

    return {
      analysis_insights: insights,
      recommendations: chirpEnhanced.recommendations,
      chirp_intelligence: chirpEnhanced.chirp_intelligence,
      metadata: chirpEnhanced.metadata
    };
  }

  // ==========================================
  // Private Helper Methods
  // ==========================================

  private analyzeRosterStrengths(data: FantasyData): RosterAnalysis {
    const positions: RosterAnalysis = {
      C: [], LW: [], RW: [], D: [], G: [],
      bench: [], ir: [], active: [],
      position_counts: { C: 0, LW: 0, RW: 0, D: 0, G: 0, bench: 0 },
      strength_score: 0,
      weakest_position: ""
    };

    if (!data.roster || !data.roster.players) return positions;

    data.roster.players.forEach((player: any) => {
      if (player.selected_position === "BN") {
        positions.bench.push(player);
      } else if (player.selected_position.includes("IR")) {
        positions.ir.push(player);
      } else {
        positions.active.push(player);
        if (player.position.includes("C")) positions.C.push(player);
        if (player.position.includes("LW")) positions.LW.push(player);
        if (player.position.includes("RW")) positions.RW.push(player);
        if (player.position.includes("D")) positions.D.push(player);
        if (player.position.includes("G")) positions.G.push(player);
      }
    });

    positions.position_counts = {
      C: positions.C.length,
      LW: positions.LW.length,
      RW: positions.RW.length,
      D: positions.D.length,
      G: positions.G.length,
      bench: positions.bench.length
    };

    // Calculate strength score (simple heuristic)
    positions.strength_score = Object.values(positions.position_counts).reduce((a, b) => a + b, 0);

    // Find weakest position
    const positionCounts = positions.position_counts;
    positions.weakest_position = Object.entries(positionCounts)
      .filter(([pos]) => pos !== 'bench')
      .sort(([, a], [, b]) => a - b)[0]?.[0] || "";

    return positions;
  }

  private identifyWeakPositions(data: FantasyData, analysis: RosterAnalysis): any[] {
    const weakPositions = [];
    const avgPerPosition = analysis.strength_score / 5;

    for (const [position, count] of Object.entries(analysis.position_counts)) {
      if (position !== 'bench' && count < avgPerPosition * 0.7) {
        weakPositions.push({
          position,
          current_count: count,
          weakness_reason: `Only ${count} players vs average of ${avgPerPosition.toFixed(1)}`
        });
      }
    }

    return weakPositions;
  }

  private findBestDropCandidate(data: FantasyData, position: string): any {
    if (!data.roster || !data.roster.players) return null;
    const benchPlayers = data.roster.players.filter((p: any) => p.selected_position === "BN");
    return benchPlayers.length > 0 ? benchPlayers[0] : null;
  }

  private findBenchUpgrades(data: FantasyData): Recommendation[] {
    const recommendations: Recommendation[] = [];
    if (!data.roster || !data.roster.players) return recommendations;

    const extendedData = data as any;
    const benchPlayers = data.roster.players.filter((p: any) => p.selected_position === "BN");

    // Simple heuristic: suggest top streaming targets for bench slots
    const topTargets = extendedData.streaming?.streaming_targets?.slice(0, Math.min(2, benchPlayers.length)) || [];

    for (let i = 0; i < topTargets.length; i++) {
      const target = topTargets[i];
      const benchPlayer = benchPlayers[i];

      if (benchPlayer) {
        recommendations.push({
          priority: "LOW",
          action: "bench_upgrade",
          pickup: target,
          drop: benchPlayer,
          reasoning: `Upgrade bench: ${target.name} trending better than ${benchPlayer.name}`
        });
      }
    }

    return recommendations;
  }

  /**
   * Temporary stub for games in hand (to be migrated to its own analysis)
   */
  private async fetchGamesInHand(): Promise<any> {
    // TODO: Replace with proper GamesInHandAnalysis when migrated
    return {
      games_in_hand_difference: 0,
      your_remaining: 0,
      opponent_remaining: 0
    };
  }

  /**
   * Temporary stub for streaming recommendations (to be migrated)
   */
  private async fetchStreamingRecommendations(lookAheadDays: number): Promise<any> {
    // TODO: Replace with proper StreamingAnalysis when migrated
    return {
      streaming_targets: [],
      optimal_timing: {
        best_days: [],
        avoid_days: []
      },
      market_intelligence: {
        top_trending_team: "unknown"
      }
    };
  }
}
