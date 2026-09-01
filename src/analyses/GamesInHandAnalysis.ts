// @ts-nocheck
/**
 * GamesInHandAnalysis - Template Method Pattern Implementation
 *
 * Analyzes schedule advantages by calculating games remaining differentials
 * between your team and opponents.
 */

import { AnalysisTemplate } from '../template/AnalysisTemplate.js';
import { ChirpIntelligence } from '../services/ChirpIntelligence.js';
import { NHL_SCHEDULE, NhlScheduleService } from '../services/NhlScheduleService.js';
import { LEAGUE_DATA, NO_ROSTER_MESSAGE, NO_OPPONENT_MESSAGE } from '../services/LeagueDataService.js';
import { NHL_STATS } from '../services/NhlStatsService.js';
import {
  FantasyData,
  AnalysisResponse,
  SemanticChirpContract,
  Recommendation,
  Player,
  AnalysisInsights,
  AnalysisMetadata
} from '../domain/types.js';

export interface GamesInHandArgs {
  look_ahead_days?: number;
}

export interface GamesInHandData {
  your_team: {
    team_name: string;
    games_remaining: number;
    players_with_games: Player[];
  };
  opponent: {
    team_name: string;
    games_remaining: number;
    players_with_games: Player[];
  };
  advantage: number;
  strategic_recommendation: string;
}

export class GamesInHandAnalysis extends AnalysisTemplate {
  constructor() {
    super("get_games_in_hand", "schedule_advantage");
  }

  /**
   * Hook 1: Fetch raw data from Yahoo API
   */
  protected async fetchData(args: GamesInHandArgs): Promise<any> {
    await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load()]);

    const roster = LEAGUE_DATA.getRoster();
    if (!roster) throw new Error(NO_ROSTER_MESSAGE);

    const opponent = LEAGUE_DATA.getOpponentRoster();
    if (!opponent) throw new Error(NO_OPPONENT_MESSAGE);

    return { roster, opponent };

  }

  /**
   * Hook 2: Prepare data into FantasyData structure
   */
  protected async prepareData(rawData: any, args: GamesInHandArgs): Promise<FantasyData> {
    return {
      roster: rawData.roster,
      opponent: {
        team_name: rawData.opponent.team_name,
        players: rawData.opponent.players
      }
    } as any;

  }

  /**
   * Hook 3: Analyze data to calculate games in hand
   */
  protected async analyzeData(data: FantasyData, args: GamesInHandArgs): Promise<GamesInHandData> {
    const lookAheadDays = args.look_ahead_days || 7;

    // Calculate games remaining for each team from the real NHL schedule
    const yourGamesRemaining = this.calculateGamesRemaining(data.roster!.players, lookAheadDays);
    const opponentGamesRemaining = this.calculateGamesRemaining(data.opponent!.players || [], lookAheadDays);

    // 🏛️ Rule 3: without the schedule there is no schedule advantage to report.
    // Say so plainly instead of inventing a differential.
    if (yourGamesRemaining === null || opponentGamesRemaining === null) {
      return {
        schedule_available: false,
        schedule_note: NHL_SCHEDULE.getUnavailableReason() ?? 'NHL schedule unavailable',
        your_team: {
          team_name: data.roster!.team_name,
          games_remaining: null,
          players_with_games: data.roster!.players.filter(p => !p.selected_position.includes('IR'))
        },
        opponent: {
          team_name: data.opponent!.team_name || 'Opponent',
          games_remaining: null,
          players_with_games: (data.opponent!.players || []).filter((p: Player) => !p.selected_position.includes('IR'))
        },
        advantage: null,
        strategic_recommendation:
          'SCHEDULE UNAVAILABLE: could not reach the NHL schedule API, so no games-in-hand edge can be calculated. Retry shortly.'
      } as any;
    }

    const advantage = yourGamesRemaining - opponentGamesRemaining;

    // Generate strategic recommendation based on advantage
    let strategicRecommendation: string;
    if (advantage > 5) {
      strategicRecommendation = "MASSIVE ADVANTAGE: Maximize starts to dominate volume categories";
    } else if (advantage > 2) {
      strategicRecommendation = "SIGNIFICANT ADVANTAGE: Stream aggressively to capitalize";
    } else if (advantage > 0) {
      strategicRecommendation = "SLIGHT ADVANTAGE: Focus on quality streaming targets";
    } else if (advantage === 0) {
      strategicRecommendation = "EVEN MATCHUP: Focus on roster optimization over volume";
    } else if (advantage > -3) {
      strategicRecommendation = "SLIGHT DISADVANTAGE: Prioritize high-quality starts";
    } else if (advantage > -6) {
      strategicRecommendation = "SIGNIFICANT DISADVANTAGE: Focus on efficiency, avoid streaming busts";
    } else {
      strategicRecommendation = "MASSIVE DISADVANTAGE: Quality over quantity - pick your spots carefully";
    }

    return {
      schedule_available: true,
      schedule_source: `NHL public API (season ${NHL_SCHEDULE.getSeason()})`,
      your_team: {
        team_name: data.roster!.team_name,
        games_remaining: yourGamesRemaining,
        players_with_games: data.roster!.players.filter(p => !p.selected_position.includes('IR'))
      },
      opponent: {
        team_name: data.opponent!.team_name || 'Opponent',
        games_remaining: opponentGamesRemaining,
        players_with_games: (data.opponent!.players || []).filter((p: Player) => !p.selected_position.includes('IR'))
      },
      advantage,
      strategic_recommendation: strategicRecommendation
    };
  }

  /**
   * Hook 4: Generate chirp-enhanced response
   */
  protected async generateChirp(
    analysisResults: GamesInHandData,
    semanticContract: SemanticChirpContract,
    data: FantasyData
  ): Promise<any> {
    return ChirpIntelligence.enhance(
      this.toolName,
      analysisResults,
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
    const analysis = chirpEnhanced as GamesInHandData & { chirp_intelligence: any };

    // Create recommendations based on advantage
    const recommendations: Recommendation[] = [];

    if (analysis.advantage > 2) {
      recommendations.push({
        priority: "HIGH",
        action: "volume_play",
        reasoning: `You have ${analysis.advantage} more games than opponent - stream aggressively`
      });
    } else if (analysis.advantage < -2) {
      recommendations.push({
        priority: "HIGH",
        action: "bench_upgrade",
        reasoning: `Opponent has ${Math.abs(analysis.advantage)} more games - focus on quality over quantity`
      });
    } else {
      recommendations.push({
        priority: "MEDIUM",
        action: "lineup_change",
        reasoning: "Games are even - optimize lineup for quality matchups"
      });
    }

    const analysisInsights: AnalysisInsights = {
      schedule_advantage: {
        your_games: analysis.your_team.games_remaining,
        opponent_games: analysis.opponent.games_remaining,
        net_advantage: analysis.advantage,
        strategic_impact: analysis.strategic_recommendation
      }
    };

    const metadata: AnalysisMetadata = {
      analysis_type: this.analysisType,
      timestamp: new Date().toISOString(),
      team_context: {
        team_name: data.roster!.team_name,
        opponent_name: data.opponent!.team_name
      },
      semantic_contract_applied: true
    };

    return {
      analysis_insights: analysisInsights,
      recommendations,
      chirp_intelligence: analysis.chirp_intelligence,
      metadata
    };
  }

  /**
   * Helper: Count real games remaining for a roster over the look-ahead window.
   *
   * Sums each active player's club games from the NHL schedule. A roster of
   * eight MTL skaters and a roster of eight SEA skaters are not the same
   * number of games, which is precisely the edge this tool exists to find.
   *
   * Returns null when the schedule is unavailable — callers must report that
   * rather than fall back to an estimate.
   */
  private calculateGamesRemaining(players: Player[], lookAheadDays: number): number | null {
    if (!NHL_SCHEDULE.isAvailable()) return null;

    const start = NhlScheduleService.today();
    const end = NhlScheduleService.addDays(start, Math.max(0, lookAheadDays - 1));

    const activePlayers = players.filter(p =>
      !p.selected_position.includes('IR') &&
      !p.selected_position.includes('BN')
    );

    return activePlayers.reduce(
      (total, player) => total + NHL_SCHEDULE.countGamesInRange(player.team, start, end),
      0
    );
  }
}
