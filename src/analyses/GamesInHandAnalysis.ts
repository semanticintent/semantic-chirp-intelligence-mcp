// @ts-nocheck
/**
 * GamesInHandAnalysis - Template Method Pattern Implementation
 *
 * Analyzes schedule advantages by calculating games remaining differentials
 * between your team and opponents.
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
  constructor(
    private readonly apiClient: YahooApiClient,
    private readonly leagueId: string,
    private readonly teamId: string
  ) {
    super("get_games_in_hand", "schedule_advantage");
  }

  /**
   * Hook 1: Fetch raw data from Yahoo API
   */
  protected async fetchData(args: GamesInHandArgs): Promise<any> {
    try {
      // Fetch current matchup data
      const matchupData = await this.apiClient.getTeamMatchup(this.leagueId, this.teamId);

      // Fetch league scoreboard for schedule data
      const scoreboardData = await this.apiClient.getLeagueScoreboard(this.leagueId);

      return {
        matchup: matchupData,
        scoreboard: scoreboardData
      };
    } catch (error) {
      throw new Error(`Failed to fetch games in hand data: ${error}`);
    }
  }

  /**
   * Hook 2: Prepare data into FantasyData structure
   */
  protected async prepareData(rawData: any, args: GamesInHandArgs): Promise<FantasyData> {
    const { matchup, scoreboard } = rawData;

    // Parse matchup to find opponent - try multiple potential structures
    let teams = matchup.fantasy_content?.team?.[1]?.matchup?.['0']?.teams?.['0']?.team || [];

    // If teams is empty, try alternative structure (matchups array)
    if (teams.length === 0) {
      const matchups = matchup.fantasy_content?.team?.[1]?.matchups;
      if (matchups && matchups['0'] && matchups['0'].matchup && matchups['0'].matchup['0']) {
        teams = matchups['0'].matchup['0'].teams?.['0']?.team || [];
      }
    }

    // Handle both full team IDs (nhl.l.123.t.1) and partial (just the number)
    const cleanLeagueId = this.leagueId.replace(/^nhl\.l\./, '');
    const cleanTeamId = this.teamId.replace(/^.*\.t\./, '');
    const fullTeamKey = `nhl.l.${cleanLeagueId}.t.${cleanTeamId}`;

    const yourTeam = teams.find((t: any) => {
      // Team data can be nested as an array or direct object
      const teamData = Array.isArray(t) ? t[0] : t;
      const teamKey = teamData?.team_key;
      return teamKey === fullTeamKey || teamKey === this.teamId || teamKey?.endsWith(`.t.${cleanTeamId}`);
    });

    const opponentTeam = teams.find((t: any) => {
      const teamData = Array.isArray(t) ? t[0] : t;
      const teamKey = teamData?.team_key;
      return teamKey && teamKey !== fullTeamKey && !teamKey?.endsWith(`.t.${cleanTeamId}`);
    });

    if (!yourTeam || !opponentTeam) {
      throw new Error(`Could not find matchup data. Teams found: ${teams.length}, Structure: ${JSON.stringify(matchup.fantasy_content?.team?.[1], null, 2).substring(0, 500)}`);
    }

    // Extract team data (handle both array and object structures)
    const yourTeamData = Array.isArray(yourTeam) ? yourTeam[0] : yourTeam;
    const opponentTeamData = Array.isArray(opponentTeam) ? opponentTeam[0] : opponentTeam;

    // Extract team rosters
    const yourRoster = yourTeamData.roster?.players || [];
    const opponentRoster = opponentTeamData.roster?.players || [];

    // Parse player data
    const parsePlayer = (playerData: any): Player => {
      const player = playerData.player?.[0] || playerData;
      return {
        player_id: player.player_id,
        name: player.name?.full || 'Unknown',
        position: player.display_position || player.primary_positions?.[0] || 'Unknown',
        team: player.editorial_team_abbr || '',
        selected_position: player.selected_position || [],
        status: player.status
      };
    };

    const yourPlayers = yourRoster.map(parsePlayer);
    const opponentPlayers = opponentRoster.map(parsePlayer);

    return {
      roster: {
        team_key: yourTeam.team_key,
        team_name: yourTeam.name || 'Your Team',
        players: yourPlayers
      },
      opponent: {
        team_key: opponentTeam.team_key,
        team_name: opponentTeam.name || 'Opponent',
        players: opponentPlayers
      } as OpponentData,
      matchup: {
        week: matchup.fantasy_content?.team?.[0]?.matchups?.['0']?.matchup?.week || 'current',
        your_team_key: yourTeam.team_key,
        opponent_team_key: opponentTeam.team_key
      },
      scoreboard: scoreboard
    };
  }

  /**
   * Hook 3: Analyze data to calculate games in hand
   */
  protected async analyzeData(data: FantasyData, args: GamesInHandArgs): Promise<GamesInHandData> {
    const lookAheadDays = args.look_ahead_days || 7;

    // Calculate games remaining for each team
    const yourGamesRemaining = this.calculateGamesRemaining(data.roster!.players, lookAheadDays);
    const opponentGamesRemaining = this.calculateGamesRemaining(data.opponent!.players || [], lookAheadDays);

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
   * Helper: Calculate total games remaining for a roster
   */
  private calculateGamesRemaining(players: Player[], lookAheadDays: number): number {
    // This is a simplified calculation
    // In production, would parse actual NHL schedule data from scoreboard

    // Active players (not on IR) typically play 3-4 games per week
    const activePlayers = players.filter(p =>
      !p.selected_position.includes('IR') &&
      !p.selected_position.includes('BN')
    );

    // Rough estimate: 3.5 games per active player per week
    const weeksInLookAhead = lookAheadDays / 7;
    return Math.round(activePlayers.length * 3.5 * weeksInLookAhead);
  }
}
