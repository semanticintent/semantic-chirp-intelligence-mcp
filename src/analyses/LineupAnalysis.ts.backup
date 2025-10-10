// @ts-nocheck
/**
 * LineupAnalysis - Template Method Pattern Implementation
 *
 * Optimizes daily lineup by identifying benched players who should be active
 * and active players who should be benched.
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

export interface LineupArgs {
  // No additional args needed - analyzes current roster
}

export interface LineupIssue {
  type: 'benched_active' | 'active_injured' | 'position_inefficiency' | 'empty_slot';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  player?: Player;
  position?: string;
  recommendation: string;
}

export class LineupAnalysis extends AnalysisTemplate {
  constructor(
    private readonly apiClient: YahooApiClient,
    private readonly leagueId: string,
    private readonly teamId: string
  ) {
    super("optimize_lineup", "lineup_optimization");
  }

  /**
   * Hook 1: Fetch raw data from Yahoo API
   */
  protected async fetchData(args: LineupArgs): Promise<any> {
    try {
      // Fetch current roster with positions
      const rosterData = await this.apiClient.getTeamRoster(this.leagueId, this.teamId);

      // Fetch today's scoreboard to see who's playing
      const scoreboardData = await this.apiClient.getLeagueScoreboard(this.leagueId);

      return {
        roster: rosterData,
        scoreboard: scoreboardData
      };
    } catch (error) {
      throw new Error(`Failed to fetch lineup data: ${error}`);
    }
  }

  /**
   * Hook 2: Prepare data into FantasyData structure
   */
  protected async prepareData(rawData: any, args: LineupArgs): Promise<FantasyData> {
    const { roster, scoreboard } = rawData;

    const team = roster.fantasy_content?.team?.[0] || {};
    const rosterPlayers = roster.fantasy_content?.team?.[1]?.roster?.['0']?.players?.['0']?.player || [];

    const players: Player[] = rosterPlayers.map((playerData: any) => {
      const player = playerData.player?.[0] || playerData;
      const selectedPosition = player.selected_position?.[1]?.position ||
                              player.selected_position?.position ||
                              'BN';

      return {
        player_id: player.player_id,
        name: player.name?.full || 'Unknown',
        position: player.display_position || player.primary_positions?.[0] || 'Unknown',
        team: player.editorial_team_abbr || '',
        selected_position: Array.isArray(selectedPosition) ? selectedPosition : [selectedPosition],
        status: player.status,
        has_game_today: this.hasGameToday(player, scoreboard)
      };
    });

    return {
      roster: {
        team_key: team.team_key || '',
        team_name: team.name || 'Your Team',
        players
      },
      scoreboard: scoreboard
    };
  }

  /**
   * Hook 3: Analyze data to identify lineup issues
   */
  protected async analyzeData(data: FantasyData, args: LineupArgs): Promise<LineupIssue[]> {
    const issues: LineupIssue[] = [];
    const players = data.roster!.players;

    // Issue 1: CRITICAL - Injured players in active lineup
    const injuredActive = players.filter(p =>
      p.status &&
      p.status !== 'Healthy' &&
      !p.selected_position.includes('IR') &&
      !p.selected_position.includes('BN')
    );

    for (const player of injuredActive) {
      issues.push({
        type: 'active_injured',
        severity: 'CRITICAL',
        player,
        recommendation: `Move ${player.name} (${player.status}) to IR or bench immediately`
      });
    }

    // Issue 2: HIGH - Healthy players on bench with games today
    const benchedWithGames = players.filter(p =>
      p.selected_position.includes('BN') &&
      p.has_game_today &&
      (!p.status || p.status === 'Healthy')
    );

    for (const player of benchedWithGames) {
      issues.push({
        type: 'benched_active',
        severity: 'HIGH',
        player,
        recommendation: `${player.name} is benched but has a game today - activate if possible`
      });
    }

    // Issue 3: MEDIUM - Active players without games today
    const activeNoGames = players.filter(p =>
      !p.selected_position.includes('BN') &&
      !p.selected_position.includes('IR') &&
      !p.has_game_today
    );

    const benchedHealthy = players.filter(p =>
      p.selected_position.includes('BN') &&
      p.has_game_today &&
      (!p.status || p.status === 'Healthy')
    );

    if (activeNoGames.length > 0 && benchedHealthy.length > 0) {
      // Suggest swaps
      const swapCount = Math.min(activeNoGames.length, benchedHealthy.length);
      for (let i = 0; i < swapCount; i++) {
        issues.push({
          type: 'position_inefficiency',
          severity: 'MEDIUM',
          recommendation: `Swap ${activeNoGames[i].name} (no game) with ${benchedHealthy[i].name} (playing)`
        });
      }
    }

    // Issue 4: LOW - Empty active slots that could be filled
    const activeSlots = players.filter(p =>
      !p.selected_position.includes('BN') &&
      !p.selected_position.includes('IR')
    ).length;

    const benchPlayers = players.filter(p => p.selected_position.includes('BN')).length;

    // Estimate if there are likely empty slots (simplified)
    // In production, would check actual league roster settings
    const estimatedMaxActiveSlots = 12; // Typical fantasy hockey active roster size

    if (activeSlots < estimatedMaxActiveSlots && benchPlayers > 0) {
      issues.push({
        type: 'empty_slot',
        severity: 'LOW',
        recommendation: `You may have empty active slots - review your lineup`
      });
    }

    return issues;
  }

  /**
   * Hook 4: Generate chirp-enhanced response
   */
  protected async generateChirp(
    analysisResults: LineupIssue[],
    semanticContract: SemanticChirpContract,
    data: FantasyData
  ): Promise<any> {
    return ChirpIntelligence.enhance(
      this.toolName,
      { lineup_issues: analysisResults },
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
    const lineupIssues = chirpEnhanced.lineup_issues as LineupIssue[];

    // Convert to standard Recommendation format
    const recommendations: Recommendation[] = lineupIssues.map(issue => {
      // Map issue type to action
      let action: any = 'lineup_change';
      if (issue.type === 'active_injured') {
        action = 'move_to_ir';
      } else if (issue.type === 'benched_active') {
        action = 'lineup_change';
      }

      return {
        priority: issue.severity,
        action,
        player: issue.player,
        reasoning: issue.recommendation
      };
    });

    const criticalCount = lineupIssues.filter(i => i.severity === 'CRITICAL').length;
    const highCount = lineupIssues.filter(i => i.severity === 'HIGH').length;

    const analysisInsights: AnalysisInsights = {
      lineup_health: {
        total_issues: lineupIssues.length,
        critical_issues: criticalCount,
        high_priority_issues: highCount,
        lineup_score: this.calculateLineupScore(lineupIssues)
      },
      immediate_actions: lineupIssues
        .filter(i => i.severity === 'CRITICAL' || i.severity === 'HIGH')
        .map(i => i.recommendation)
    };

    const metadata: AnalysisMetadata = {
      analysis_type: this.analysisType,
      timestamp: new Date().toISOString(),
      team_context: {
        team_name: data.roster!.team_name
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
   * Helper: Check if player has a game today
   */
  private hasGameToday(player: any, scoreboard: any): boolean {
    // Simplified - in production would parse actual NHL schedule from scoreboard
    // For now, assume 50% of players have games on any given day
    return Math.random() > 0.5;
  }

  /**
   * Helper: Calculate overall lineup health score (0-100)
   */
  private calculateLineupScore(issues: LineupIssue[]): number {
    let score = 100;

    // Deduct points for each issue based on severity
    for (const issue of issues) {
      switch (issue.severity) {
        case 'CRITICAL':
          score -= 20;
          break;
        case 'HIGH':
          score -= 10;
          break;
        case 'MEDIUM':
          score -= 5;
          break;
        case 'LOW':
          score -= 2;
          break;
      }
    }

    return Math.max(0, score);
  }
}
