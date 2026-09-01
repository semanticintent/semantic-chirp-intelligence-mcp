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

    const teamArray = roster.fantasy_content?.team?.[0] || [];
    const rosterData = roster.fantasy_content?.team?.[1]?.roster?.['0']?.players || {};

    // Fetch today's NHL schedule once for all players
    const todaySchedule = await this.fetchTodaySchedule();

    // Use object key iteration like IceAnalysis for consistent player parsing
    const playerKeys = Object.keys(rosterData).filter(key => key !== 'count');

    // Parse player data first (synchronous)
    const parsedPlayers = playerKeys.map(key => {
      // Yahoo API returns player data as nested arrays
      // player[0] is an array of objects, player[1] contains position info
      const player = rosterData[key].player?.[0] || rosterData[key];
      const positionInfo = rosterData[key].player?.[1] || {};

      // Use .find() pattern like IceAnalysis since player is an array of property objects
      const player_id = Array.isArray(player)
        ? player.find((item: any) => item.player_id)?.player_id
        : player.player_id;
      const name = Array.isArray(player)
        ? player.find((item: any) => item.name)?.name?.full
        : player.name?.full;
      const position = Array.isArray(player)
        ? player.find((item: any) => item.display_position)?.display_position ||
          player.find((item: any) => item.primary_positions)?.primary_positions?.[0]
        : player.display_position || player.primary_positions?.[0];
      const team = Array.isArray(player)
        ? player.find((item: any) => item.editorial_team_abbr)?.editorial_team_abbr
        : player.editorial_team_abbr;
      const status = Array.isArray(player)
        ? player.find((item: any) => item.status)?.status
        : player.status;

      const selectedPosition = positionInfo.selected_position?.[1]?.position ||
                              positionInfo.selected_position?.position ||
                              'BN';

      return {
        player_id: player_id || '',
        name: name || 'Unknown',
        position: position || 'Unknown',
        team: team || '',
        selected_position: Array.isArray(selectedPosition) ? selectedPosition : [selectedPosition],
        status: status || ''
      };
    });

    // Add has_game_today flag using the schedule we fetched
    const players: Player[] = parsedPlayers.map((player) => ({
      ...player,
      has_game_today: this.hasGameToday(player, todaySchedule)
    }));

    // Extract team info using .find() pattern like IceAnalysis
    const team_key = Array.isArray(teamArray)
      ? teamArray.find((item: any) => item.team_key)?.team_key
      : teamArray.team_key;
    const team_name = Array.isArray(teamArray)
      ? teamArray.find((item: any) => item.name)?.name
      : teamArray.name;

    return {
      roster: {
        team_key: team_key || '',
        team_name: team_name || 'Your Team',
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
   * Helper: Ensure the season schedule is loaded.
   *
   * Replaces a per-call fetch of a single day with the shared season schedule,
   * which is cached to disk and reused by every other analysis.
   */
  private async fetchTodaySchedule(): Promise<any[]> {
    await NHL_SCHEDULE.load();
    return [];
  }

  /**
   * Helper: Check if a player's club plays today.
   *
   * Yahoo and the NHL spell five clubs differently (`LA`/`LAK`, `NJ`/`NJD`,
   * `SJ`/`SJS`, `TB`/`TBL`, `StL`/`STL`). The previous implementation compared
   * Yahoo's abbreviation to the NHL tricode directly, so those five clubs
   * always reported "no game today" — silently, and only for them.
   * `toNhlTricode` inside the schedule service resolves both spellings.
   */
  private hasGameToday(player: any, _todayGames: any[]): boolean {
    if (!player.team || !NHL_SCHEDULE.isAvailable()) return false;

    return NHL_SCHEDULE.hasGameOn(player.team, NhlScheduleService.today());
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
