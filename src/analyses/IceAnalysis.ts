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
import { LEAGUE_DATA, NO_ROSTER_MESSAGE, NO_OPPONENT_MESSAGE } from '../services/LeagueDataService.js';
import { NHL_STATS } from '../services/NhlStatsService.js';
import { NHL_SCHEDULE, NhlScheduleService } from '../services/NhlScheduleService.js';

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

    // v4: the roster comes from what the user pasted, and everything else from
    // the NHL public API. No account, no OAuth, no platform binding.
    await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load()]);

    const roster = LEAGUE_DATA.getRoster();

    return {
      roster,
      gamesInHand: this.calculateGamesInHand(lookAheadDays),
      streaming: this.streamingContext(),
      lookAheadDays
    };
  }

  /**
   * Hook 2: Prepare and transform data for analysis
   */
  protected async prepareData(rawData: any, args: IceAnalysisArgs): Promise<FantasyData> {
    // 🏛️ Rule 3: an absent roster is reported, never treated as an empty one.
    // "You have no players" and "you have not told me your players" are
    // different statements and only one of them is true.
    if (!rawData.roster) {
      throw new Error(NO_ROSTER_MESSAGE);
    }

    const teamKey = rawData.roster.team_key;
    const teamName = rawData.roster.team_name;
    const players = rawData.roster.players;

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
   * Real schedule advantage over the look-ahead window.
   *
   * This was a stub returning zero, so ICE's "games in hand" line was never
   * a measurement. It now counts each rostered player's actual club games
   * from the NHL schedule. Without a stored opponent there is no differential
   * to report, so it reports your own volume and says why.
   */
  private calculateGamesInHand(lookAheadDays: number): any {
    if (!NHL_SCHEDULE.isAvailable()) {
      return {
        available: false,
        note: NHL_SCHEDULE.getUnavailableReason(),
        games_in_hand_difference: 0
      };
    }

    const start = NhlScheduleService.today();
    const end = NhlScheduleService.addDays(start, Math.max(0, lookAheadDays - 1));

    const countFor = (roster: { players: any[] } | null) =>
      (roster?.players ?? [])
        .filter(p => p.selected_position !== 'IR')
        .reduce((total, p) => total + NHL_SCHEDULE.countGamesInRange(p.team, start, end), 0);

    const mine = countFor(LEAGUE_DATA.getRoster());
    const opponent = LEAGUE_DATA.getOpponentRoster();

    if (!opponent) {
      return {
        available: true,
        your_remaining: mine,
        opponent_remaining: null,
        games_in_hand_difference: 0,
        note: NO_OPPONENT_MESSAGE
      };
    }

    const theirs = countFor(opponent);

    return {
      available: true,
      your_remaining: mine,
      opponent_remaining: theirs,
      games_in_hand_difference: mine - theirs,
      window: { start, end }
    };
  }

  /**
   * Streaming context.
   *
   * Waiver-wire targets require knowing which players are unowned in your
   * league, which no public data source can tell us. Rather than fabricate
   * targets, this returns none and names the reason.
   */
  private streamingContext(): any {
    return {
      streaming_targets: [],
      unavailable_reason:
        'Waiver targets need to know who is unowned in your league, which is ' +
        'league-private. Roster, schedule and lineup analysis are unaffected.',
      optimal_timing: { best_days: [], avoid_days: [] },
      market_intelligence: { top_trending_team: 'unknown' }
    };
  }
}
