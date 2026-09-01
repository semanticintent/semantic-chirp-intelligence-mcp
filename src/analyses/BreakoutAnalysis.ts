/**
 * 🏒 Breakout Player Analysis - Fantasy Hockey Intelligence
 *
 * Analyzes free agents to identify top pickups and breakout candidates
 * using data-driven predictability with external source integration.
 *
 * Based on comprehensive prompt template with:
 * - 40% recent performance
 * - 30% projections
 * - 20% opportunity metrics
 * - 10% risk factors
 */

import { AnalysisTemplate } from '../template/AnalysisTemplate.js';
import type {
  AnalysisType,
  SemanticChirpContract,
  AnalysisResponse,
  FantasyData,
  AnalysisInsights,
  Recommendation,
  Player,
  StreamingTarget,
  ChirpResponse
} from '../domain/types.js';
import { ChirpIntelligence } from '../services/ChirpIntelligence.js';
import { LEAGUE_DATA, LeagueDataService, NO_ROSTER_MESSAGE } from '../services/LeagueDataService.js';
import { NHL_STATS } from '../services/NhlStatsService.js';
import { NHL_SCHEDULE } from '../services/NhlScheduleService.js';

interface BreakoutAnalysisArgs {
  readonly position_filter?: string[];
  readonly ownership_threshold?: number;
  readonly breakout_age_max?: number;
  readonly min_score?: number;
  readonly max_results?: number;
}

interface BreakoutCandidate extends Player {
  readonly breakout_score: number;
  readonly recent_ppg: number;
  readonly projected_fpg: number;
  readonly opportunity_score: number;
  readonly risk_percentage: number;
  readonly catalyst: string;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly category: 'must_add' | 'strong_pickup' | 'monitor' | 'sleeper';
}

interface PickupCandidate extends StreamingTarget {
  readonly pickup_score: number;
  readonly urgency: 'immediate' | 'high' | 'medium' | 'low';
  readonly fit_reason: string;
}

export class BreakoutAnalysis extends AnalysisTemplate {

  constructor() {
    super('get_breakout_analysis', 'streaming_recommendations');
  }

  /**
   * Fetch raw data: free agents, trending players, roster
   */
  protected async fetchData(args: BreakoutAnalysisArgs): Promise<any> {
    await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load()]);

    // Breakout candidates are drawn from every NHL player not already on a
    // roster you provided, scored on their real season line.
    return {
      freeAgents: LEAGUE_DATA.getPlayerPool({ limit: 200 }),
      trendingAdds: [],
      roster: LEAGUE_DATA.getRoster(),
      pool_caveat: LeagueDataService.POOL_CAVEAT
    };

  }

  /**
   * Prepare data for analysis
   */
  protected async prepareData(rawData: any, args: BreakoutAnalysisArgs): Promise<FantasyData> {
    return {
      availablePlayers: rawData.freeAgents,
      trendingPlayers: rawData.trendingAdds,
      roster: rawData.roster
    };
  }

  /**
   * Execute breakout analysis with predictable scoring
   */
  protected async analyzeData(
    data: FantasyData,
    args: BreakoutAnalysisArgs
  ): Promise<any> {
    const freeAgents = data.availablePlayers || [];
    const trending = data.trendingPlayers || [];

    // Score each free agent using the comprehensive formula
    const scoredPlayers = await Promise.all(
      freeAgents.map(player => this.scorePlayer(player, trending))
    );

    // Sort by score and categorize
    const sorted = scoredPlayers
      .filter(p => p.breakout_score >= (args.min_score || 0))
      .sort((a, b) => b.breakout_score - a.breakout_score);

    // Separate into pickups vs breakouts
    const pickups = this.identifyTopPickups(sorted, args.max_results || 10);
    const breakouts = this.identifyBreakoutCandidates(sorted, args.breakout_age_max || 26);

    return {
      pickups,
      breakouts,
      all_scored: sorted.slice(0, 50),
      position_breakdown: this.analyzeByPosition(sorted),
      market_intelligence: this.analyzeMarketTrends(trending, sorted)
    };
  }

  /**
   * Score a player using the comprehensive formula:
   * Score = (0.4 * Recent PPG) + (0.3 * Proj FP/G) + (0.2 * Opp Score/10) - (0.1 * Risk %)
   */
  private async scorePlayer(
    player: Player,
    trending: any[]
  ): Promise<BreakoutCandidate> {
    // Get detailed stats for scoring
    const stats = await this.getPlayerMetrics(player);

    // Recent performance (0-100 scale)
    const recentPPG = this.calculateRecentPerformance(stats) * 100;

    // Projected fantasy points (0-100 scale, estimated)
    const projectedFPG = this.estimateProjectedPoints(player, stats, trending) * 100;

    // Opportunity score (0-100 scale)
    const opportunityScore = this.calculateOpportunity(player, stats);

    // Risk percentage (0-100)
    const riskPercentage = this.calculateRisk(player, stats);

    // Apply formula
    const breakoutScore =
      0.4 * recentPPG +
      0.3 * projectedFPG +
      0.2 * opportunityScore -
      0.1 * riskPercentage;

    // Determine confidence and category
    const confidence = this.determineConfidence(breakoutScore, riskPercentage);
    const category = this.categorizePlayer(breakoutScore);
    const catalyst = this.identifyCatalyst(player, stats, trending);

    return {
      ...player,
      breakout_score: Math.round(breakoutScore),
      recent_ppg: recentPPG / 100,
      projected_fpg: projectedFPG / 100,
      opportunity_score: opportunityScore,
      risk_percentage: riskPercentage,
      catalyst,
      confidence,
      category
    };
  }

  /**
   * Calculate recent performance score
   */
  private calculateRecentPerformance(stats: any): number {
    // Simplified - in real implementation, would fetch last 5-10 games
    // For now, use season averages as proxy
    const goals = parseFloat(stats.G || 0);
    const assists = parseFloat(stats.A || 0);
    const gamesPlayed = parseFloat(stats.GP || 1);

    if (gamesPlayed === 0) return 0;

    const ppg = (goals + assists) / gamesPlayed;
    return Math.min(ppg, 1.5); // Cap at 1.5 PPG
  }

  /**
   * Estimate projected fantasy points
   */
  private estimateProjectedPoints(player: Player, stats: any, trending: any[]): number {
    // Base projection on current stats + trending momentum
    const isTrending = trending.some(t => t.player_id === player.player_id);
    const baseProjection = this.calculateRecentPerformance(stats);
    const trendingBonus = isTrending ? 0.15 : 0;

    return Math.min(baseProjection + trendingBonus, 1.0);
  }

  /**
   * Calculate opportunity score (TOI, PP role, linemates)
   */
  private calculateOpportunity(player: Player, stats: any): number {
    let score = 50; // Base score

    // Position-based opportunities
    if (player.position.includes('C')) score += 10; // Centers have more opportunity
    if (player.position.includes('LW') || player.position.includes('RW')) score += 5;

    // Check if on good team (more goals = more opportunities)
    const teamScore = this.getTeamStrength(player.team);
    score += teamScore;

    return Math.min(score, 100);
  }

  /**
   * Calculate risk percentage
   */
  private calculateRisk(player: Player, stats: any): number {
    let risk = 20; // Base risk

    // Injury status increases risk
    if (player.status && player.status !== '') {
      risk += 30;
    }

    // Low games played = higher risk
    const gamesPlayed = parseFloat(stats.GP || 0);
    if (gamesPlayed < 10) risk += 20;

    // High ownership = lower risk (proven commodity)
    const ownership = player.percent_owned || 0;
    if (ownership > 30) risk -= 10;
    if (ownership < 10) risk += 15;

    return Math.min(Math.max(risk, 0), 100);
  }

  /**
   * Get team strength score
   */
  private getTeamStrength(teamAbbr: string): number {
    // Simplified team rankings - top teams get bonus
    const topTeams = ['BOS', 'CAR', 'COL', 'DAL', 'EDM', 'FLA', 'NYR', 'TOR', 'VGK', 'WPG'];
    const midTeams = ['CGY', 'LAK', 'MIN', 'NJD', 'NSH', 'NYI', 'SEA', 'TBL', 'VAN'];

    if (topTeams.includes(teamAbbr)) return 20;
    if (midTeams.includes(teamAbbr)) return 10;
    return 0;
  }

  /**
   * Identify catalyst for breakout potential
   */
  private identifyCatalyst(player: Player, stats: any, trending: any[]): string {
    const isTrending = trending.some(t => t.player_id === player.player_id);

    if (isTrending) return 'Hot streak - trending upward';
    if (player.position.includes('C')) return 'Top-6 center opportunity';
    if (this.getTeamStrength(player.team) >= 20) return 'Playing on elite team';

    return 'Solid opportunity available';
  }

  /**
   * Determine confidence level
   */
  private determineConfidence(score: number, risk: number): 'high' | 'medium' | 'low' {
    if (score >= 70 && risk < 30) return 'high';
    if (score >= 50 && risk < 50) return 'medium';
    return 'low';
  }

  /**
   * Categorize player by score
   */
  private categorizePlayer(score: number): 'must_add' | 'strong_pickup' | 'monitor' | 'sleeper' {
    if (score >= 80) return 'must_add';
    if (score >= 65) return 'strong_pickup';
    if (score >= 50) return 'monitor';
    return 'sleeper';
  }

  /**
   * Real season stat line for a candidate, from Yahoo.
   *
   * Missing categories come back as 0 rather than absent so the scoring
   * formula keeps its shape; `has_stats` distinguishes a genuine zero from a
   * player Yahoo returned nothing for.
   */
  private async getPlayerMetrics(player: Player): Promise<any> {
    // v4: the pool carries NHL season statistics on each player already.
    const stats = (player as any).stats ?? null;

    return {
      G: stats?.goals ?? 0,
      A: stats?.assists ?? 0,
      GP: stats?.games_played ?? 0,
      // The NHL feed publishes power-play goals, not power-play points.
      PPP: stats?.power_play_goals ?? 0,
      SOG: stats?.shots ?? 0,
      has_stats: Boolean(stats)
    };
  }

  /**
   * Identify top pickup recommendations
   */
  private identifyTopPickups(
    sorted: BreakoutCandidate[],
    maxResults: number
  ): PickupCandidate[] {
    return sorted
      .filter(p => p.category === 'must_add' || p.category === 'strong_pickup')
      .slice(0, maxResults)
      .map(player => ({
        ...player,
        pickup_score: player.breakout_score,
        urgency: player.category === 'must_add' ? 'immediate' : 'high',
        fit_reason: `${player.catalyst} - Score: ${player.breakout_score}`,
        streaming_score: player.breakout_score,
        reason: player.catalyst
      }));
  }

  /**
   * Identify breakout candidates (young players with upside)
   */
  private identifyBreakoutCandidates(
    sorted: BreakoutCandidate[],
    ageMax: number
  ): BreakoutCandidate[] {
    // In real implementation, would filter by age
    // For now, return top sleepers/monitors
    return sorted
      .filter(p => p.category === 'sleeper' || p.category === 'monitor')
      .filter(p => p.confidence === 'medium' || p.confidence === 'high')
      .slice(0, 5);
  }

  /**
   * Analyze players by position
   */
  private analyzeByPosition(players: BreakoutCandidate[]): any {
    const positions = ['C', 'LW', 'RW', 'D', 'G'];
    const breakdown: any = {};

    for (const pos of positions) {
      const posPlayers = players.filter(p => p.position.includes(pos));
      breakdown[pos] = {
        count: posPlayers.length,
        top_player: posPlayers[0] || null,
        avg_score: posPlayers.length > 0
          ? posPlayers.reduce((sum, p) => sum + p.breakout_score, 0) / posPlayers.length
          : 0
      };
    }

    return breakdown;
  }

  /**
   * Analyze market trends
   */
  private analyzeMarketTrends(trending: any[], scored: BreakoutCandidate[]): any {
    const trendingScored = scored.filter(s =>
      trending.some(t => t.player_id === s.player_id)
    );

    return {
      trending_count: trending.length,
      trending_avg_score: trendingScored.length > 0
        ? trendingScored.reduce((sum, p) => sum + p.breakout_score, 0) / trendingScored.length
        : 0,
      hot_positions: this.identifyHotPositions(trending)
    };
  }

  /**
   * Identify hot positions from trending data
   */
  private identifyHotPositions(trending: any[]): string[] {
    const positionCounts: Record<string, number> = {};

    for (const player of trending) {
      const positions = (player.position || '').split(',');
      for (const pos of positions) {
        positionCounts[pos] = (positionCounts[pos] || 0) + 1;
      }
    }

    return Object.entries(positionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([pos]) => pos);
  }

  /**
   * Generate chirp intelligence
   */
  protected async generateChirp(
    analysisResults: any,
    semanticContract: SemanticChirpContract,
    data: FantasyData
  ): Promise<any> {
    if (semanticContract.enable_chirp === false) {
      return analysisResults;
    }

    // Use ChirpIntelligence static enhance method
    const enhanced = ChirpIntelligence.enhance(
      'get_breakout_analysis',
      {
        ...analysisResults,
        streaming_targets: analysisResults.pickups,
        market_intelligence: analysisResults.market_intelligence,
        recommendations: analysisResults.pickups
      },
      semanticContract
    );

    return enhanced;
  }

  /**
   * Format final response
   */
  protected async formatResponse(
    chirpEnhanced: any,
    data: FantasyData
  ): Promise<AnalysisResponse> {
    const recommendations: Recommendation[] = chirpEnhanced.pickups.map((p: PickupCandidate) => ({
      priority: p.urgency === 'immediate' ? 'CRITICAL' : 'HIGH',
      action: 'pickup',
      player: p,
      reasoning: p.fit_reason
    }));

    const insights: AnalysisInsights = {
      streaming_targets: chirpEnhanced.pickups,
      favorable_teams: Object.entries(chirpEnhanced.position_breakdown)
        .map(([pos, data]: [string, any]) => ({
          team_abbr: pos,
          games_count: data.count,
          favorable_score: data.avg_score
        })),
      market_intelligence: {
        total_trending: chirpEnhanced.market_intelligence.trending_count,
        favorable_teams_count: Object.keys(chirpEnhanced.position_breakdown).length,
        top_trending_team: chirpEnhanced.market_intelligence.hot_positions[0] || 'N/A'
      }
    };

    return {
      analysis_insights: insights,
      recommendations,
      chirp_intelligence: chirpEnhanced.chirp_intelligence || this.getDefaultChirp(),
      metadata: {
        analysis_type: this.analysisType,
        tool_identity: 'breakout_analysis',
        generated_at: new Date().toISOString(),
        semantic_contract_applied: true
      }
    };
  }

  /**
   * Default chirp when chirp intelligence is disabled
   */
  private getDefaultChirp(): ChirpResponse {
    return {
      tool_identity: 'breakout_analysis',
      style: 'analytical',
      personality: 'data_driven',
      intensity: 'standard',
      semantic_context: 'breakout_player_analysis',
      analysis_chirp: 'Data-driven breakout analysis complete',
      intent_summary: 'Breakout player recommendations ready',
      ice_cold_truth: 'Smart pickups win championships',
      energy_level: 'focused'
    };
  }
}
