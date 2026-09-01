/**
 * 🏒 Weekend Stream Analysis - Desperation vs Genuine Opportunity
 *
 * Distinguishes weekend streaming desperation (bye-week fillers, injury covers, <1-week value)
 * from genuine opportunities (sustainable roles, >2-week upside, PP time, line jumps).
 *
 * Binary Classification Decision Tree:
 * - Desperation: Context-driven (bye/injury), low floor, no role lock
 * - Genuine: Independent catalysts, high ceiling, sustainable hold
 * - Monitor: 50/50 territory, hot hand but risky matchup
 *
 * Upside Score Formula (0-100):
 * Score = (0.30 * Proj FP/G * 10) + (0.30 * Opp TOI) + (0.20 * Schedule Ease) - (0.20 * Risk %)
 * - >60 = Genuine opportunity
 * - <40 = Desperation stream
 *
 * Semantic Identity: Weekend Stream Classifier
 * Intent: I distinguish desperation streams from genuine opportunities
 * Chirp Style: desperate_or_legit
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
import { NHL_SCHEDULE, NhlScheduleService } from '../services/NhlScheduleService.js';
import { parseStatArray } from '../domain/yahoo-stats.js';
import { LEAGUE_DATA, LeagueDataService, NO_ROSTER_MESSAGE } from '../services/LeagueDataService.js';
import { NHL_STATS } from '../services/NhlStatsService.js';

interface WeekendStreamArgs {
  readonly date_range: {
    readonly start: string;  // YYYY-MM-DD
    readonly end: string;    // YYYY-MM-DD
  };
  readonly position_filter?: string[];
  readonly ownership_max?: number;
  readonly team_needs?: string[];  // ['bye_fill', 'injury_cover', 'G_volume']
  readonly min_upside_score?: number;
  readonly max_results?: number;
}

interface StreamCandidate extends Player {
  readonly classification: 'desperation' | 'genuine' | 'monitor';
  readonly upside_score: number;  // 0-100
  readonly weekend_games: number;
  readonly schedule_ease: number;  // 0-100
  readonly context_driven: boolean;  // True if bye/injury driven
  readonly hold_duration: '<1 week' | '1-2 weeks' | '>2 weeks';
  readonly catalyst: string;
  readonly recent_ppg: number;
  readonly projected_fpg: number;
  readonly opportunity_toi: number;
  readonly risk_percentage: number;
  readonly matchup_quality: 'elite' | 'favorable' | 'average' | 'difficult' | 'unknown';
  readonly back_to_back: boolean;
  readonly drop_suggestion?: string;
  readonly fit_reason: string;
}

interface RosterGaps {
  readonly bye_teams: string[];
  readonly injured_players: string[];
  readonly position_needs: string[];
  readonly gaps_count: number;
}

interface WeekendSchedule {
  readonly player_id: string;
  readonly games: Array<{
    readonly date: string;
    readonly opponent: string;
    readonly home: boolean;
  }>;
  readonly game_count: number;
  readonly has_back_to_back: boolean;
}

export class WeekendStreamAnalysis extends AnalysisTemplate {
  constructor() {
    super('analyze_weekend_streams', 'streaming_recommendations');
  }

  /**
   * Semantic Identity for this analysis
   */
  getSemanticIdentity(): string {
    return `
🏒 Weekend Stream Classifier - ICE Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SEMANTIC IDENTITY:
  Tool: analyze_weekend_streams
  Intent: I distinguish desperation streams from genuine opportunities
  Classification: Binary decision tree (Desperation | Genuine | Monitor)
  Time Horizon: Weekend tactical (3-7 day value)

INTELLIGENCE LAYERS:
  1. Schedule Analysis    - Weekend games, back-to-backs, opponents
  2. Context Synthesis    - Team byes, injuries, roster gaps
  3. Metrics Evaluation   - Recent PPG, projected FP/G, TOI trends
  4. Risk Assessment      - Injury %, role volatility, matchup difficulty
  5. Binary Classification - Decision tree logic
  6. Fit Optimization     - Match to roster gaps, suggest drops
  7. Confidence Scoring   - Upside score (0-100)

UPSIDE FORMULA:
  Score = (0.30 × Proj FP/G × 10) + (0.30 × Opp TOI) +
          (0.20 × Schedule Ease) - (0.20 × Risk %)

  Thresholds:
    >60 = Genuine opportunity (sustainable, >2 week hold)
    40-60 = Monitor territory (hot hand, risky matchup)
    <40 = Desperation stream (bye/injury fill, <1 week)

CHIRP STYLE: desperate_or_legit
  "That's not a stream, that's a cry for help" 🆘
  "PP1 lock? Now we're talking genuine upside" 🔥
    `;
  }

  /**
   * Layer 1: Fetch raw data
   * - Free agents (position filtered, ownership capped)
   * - User's roster (check byes/injuries)
   * - Weekend schedule (date filtered)
   * - Trending players
   */
  protected async fetchData(args: WeekendStreamArgs): Promise<any> {
    const positions = args.position_filter || ['C', 'LW', 'RW', 'D', 'G'];

    await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load(), NHL_SCHEDULE.loadStandings()]);

    // One pool per requested position, deduplicated — replaces the Yahoo
    // free-agent search. Ownership is league-private, so these are candidates
    // to check rather than confirmed adds.
    const seen = new Set<string>();
    const freeAgents: any[] = [];
    for (const pos of positions) {
      for (const p of LEAGUE_DATA.getPlayerPool({ position: pos, limit: 40 })) {
        if (seen.has(p.player_id)) continue;
        seen.add(p.player_id);
        freeAgents.push(p);
      }
    }

    return {
      freeAgents,
      roster: LEAGUE_DATA.getRoster(),
      trendingAdds: [],
      dateRange: args.date_range,
      pool_caveat: LeagueDataService.POOL_CAVEAT
    };

  }

  /**
   * Layer 2: Prepare data for analysis
   * - Identify roster gaps (byes, injuries)
   * - Fetch weekend schedules
   * - Structure for analysis
   */
  protected async prepareData(rawData: any, args: WeekendStreamArgs): Promise<FantasyData> {
    // Identify roster gaps
    const rosterGaps = this.identifyRosterGaps(rawData.roster, args);

    // Real weekend schedules from the NHL public API
    const weekendSchedules = this.buildWeekendSchedules(
      rawData.freeAgents,
      rawData.dateRange
    );

    // Return with custom properties attached
    const result: any = {
      availablePlayers: rawData.freeAgents,
      roster: rawData.roster,
      trendingPlayers: rawData.trendingAdds,
      rosterGaps: rosterGaps,
      weekendSchedules: weekendSchedules,
      seasonStats: rawData.seasonStats ?? {},
      recentStats: rawData.recentStats ?? {}
    };

    return result;
  }

  /**
   * Layer 2: Identify roster gaps from user's team
   */
  private identifyRosterGaps(roster: any, args: WeekendStreamArgs): RosterGaps {
    const byeTeams: string[] = [];
    const injuredPlayers: string[] = [];
    const positionNeeds: string[] = [];

    // Check roster for injuries
    if (roster.players) {
      for (const player of roster.players) {
        if (player.status && player.status !== '' && player.status !== 'Healthy') {
          injuredPlayers.push(`${player.name} (${player.team})`);
        }
      }
    }

    // Parse team_needs if provided
    if (args.team_needs) {
      for (const need of args.team_needs) {
        if (need === 'bye_fill') {
          // User indicated bye week gaps
          byeTeams.push('User indicated bye week');
        } else if (need === 'injury_cover') {
          // User indicated injury coverage needed
        } else if (need.includes('_')) {
          // Position needs like "G_volume", "C_depth"
          const pos = need.split('_')[0];
          if (!positionNeeds.includes(pos)) {
            positionNeeds.push(pos);
          }
        }
      }
    }

    return {
      bye_teams: byeTeams,
      injured_players: injuredPlayers,
      position_needs: positionNeeds,
      gaps_count: byeTeams.length + injuredPlayers.length
    };
  }

  /**
   * Layer 3: Real weekend schedules from the NHL public API.
   *
   * Each candidate gets the games their actual club actually plays in the
   * requested window — including whether those games are back-to-back, which
   * is a real signal for goalies rather than a coin flip.
   */
  private buildWeekendSchedules(players: Player[], dateRange: any): Map<string, WeekendSchedule> {
    const schedules = new Map<string, WeekendSchedule>();

    const start = dateRange?.start ?? NhlScheduleService.today();
    const end = dateRange?.end ?? NhlScheduleService.addDays(start, 2);

    for (const player of players) {
      const games = NHL_SCHEDULE.isAvailable()
        ? NHL_SCHEDULE.getGamesInRange(player.team, start, end)
        : [];

      schedules.set(player.player_id, {
        player_id: player.player_id,
        games: games.map(g => ({ date: g.date, opponent: g.opponent, home: g.home })),
        game_count: games.length,
        has_back_to_back:
          NHL_SCHEDULE.isAvailable() && NHL_SCHEDULE.countBackToBacks(player.team, start, end) > 0
      });
    }

    return schedules;
  }

  /**
   * Layer 4: Execute weekend stream analysis
   */
  protected async analyzeData(
    data: FantasyData,
    args: WeekendStreamArgs
  ): Promise<any> {
    const freeAgents = data.availablePlayers || [];
    const dataAny = data as any;
    const rosterGaps = dataAny.rosterGaps as RosterGaps;
    const schedules = dataAny.weekendSchedules as Map<string, WeekendSchedule>;

    // Score and classify each free agent
    const scoredStreams = await Promise.all(
      freeAgents.map(player =>
        this.analyzeStreamCandidate(player, rosterGaps, schedules, data)
      )
    );

    // Filter and sort by upside score
    const minScore = args.min_upside_score || 0;
    const sorted = scoredStreams
      .filter(s => s.upside_score >= minScore)
      .sort((a, b) => b.upside_score - a.upside_score);

    // Separate by classification
    const genuine = sorted.filter(s => s.classification === 'genuine');
    const desperation = sorted.filter(s => s.classification === 'desperation');
    const monitor = sorted.filter(s => s.classification === 'monitor');

    // Top picks per classification
    const maxResults = args.max_results || 10;
    const topGenuine = genuine.slice(0, maxResults);
    const topDesperation = desperation.slice(0, maxResults);
    const topMonitor = monitor.slice(0, Math.floor(maxResults / 2));

    return {
      top_genuine: topGenuine,
      top_desperation: topDesperation,
      top_monitor: topMonitor,
      all_streams: sorted.slice(0, 50),
      classification_breakdown: {
        genuine_count: genuine.length,
        desperation_count: desperation.length,
        monitor_count: monitor.length
      },
      roster_gaps: rosterGaps,
      weekend_analysis: this.summarizeWeekendTrends(sorted, schedules)
    };
  }

  /**
   * Layer 5-7: Analyze single stream candidate through all intelligence layers
   */
  private async analyzeStreamCandidate(
    player: Player,
    gaps: RosterGaps,
    schedules: Map<string, WeekendSchedule>,
    data: FantasyData
  ): Promise<StreamCandidate> {
    // Get weekend schedule
    const schedule = schedules.get(player.player_id) || {
      player_id: player.player_id,
      games: [],
      game_count: 0,
      has_back_to_back: false
    };

    // Layer 3: Metrics Evaluation
    const metrics = await this.evaluateMetrics(player, data);

    // Layer 1: Schedule Analysis
    const scheduleAnalysis = this.analyzeScheduleEase(schedule, player);

    // Layer 4: Risk Assessment
    const risk = this.assessRisk(player, schedule, metrics);

    // Layer 7: Upside Score Calculation
    const upsideScore = this.calculateUpsideScore(
      metrics.projected_fpg,
      metrics.opportunity_toi,
      scheduleAnalysis.ease_score,
      risk.total_risk
    );

    // Layer 2: Context Synthesis (is this driven by user's gaps?)
    const contextDriven = this.isContextDriven(player, gaps);

    // Layer 5: Binary Classification
    const classification = this.classifyStream(
      upsideScore,
      contextDriven,
      metrics,
      risk.total_risk
    );

    // Layer 6: Fit Optimization
    const fitAnalysis = this.analyzeFit(player, gaps, classification);

    return {
      ...player,
      classification,
      upside_score: Math.round(upsideScore),
      weekend_games: schedule.game_count,
      schedule_ease: scheduleAnalysis.ease_score,
      context_driven: contextDriven,
      hold_duration: this.determineHoldDuration(classification, metrics),
      catalyst: this.identifyCatalyst(player, metrics, schedule),
      recent_ppg: metrics.recent_ppg,
      projected_fpg: metrics.projected_fpg,
      opportunity_toi: metrics.opportunity_toi,
      risk_percentage: risk.total_risk,
      matchup_quality: scheduleAnalysis.matchup_quality,
      back_to_back: schedule.has_back_to_back,
      drop_suggestion: fitAnalysis.drop_suggestion,
      fit_reason: fitAnalysis.fit_reason
    };
  }

  /**
   * Layer 7: Calculate upside score (0-100)
   * Formula: (0.30 × Proj FP/G × 10) + (0.30 × Opp TOI) + (0.20 × Schedule Ease) - (0.20 × Risk %)
   */
  private calculateUpsideScore(
    projectedFpg: number,
    oppToi: number,
    scheduleEase: number,
    risk: number
  ): number {
    const score =
      0.30 * (projectedFpg * 10) +
      0.30 * oppToi +
      0.20 * scheduleEase -
      0.20 * risk;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Layer 5: Binary Classification Decision Tree
   */
  private classifyStream(
    upsideScore: number,
    contextDriven: boolean,
    metrics: any,
    risk: number
  ): 'desperation' | 'genuine' | 'monitor' {
    // Desperation: Context-driven + Low floor + High risk
    if (contextDriven && upsideScore < 40) {
      return 'desperation';
    }

    // Desperation: No role lock + Low score
    if (metrics.opportunity_toi < 12 && upsideScore < 45) {
      return 'desperation';
    }

    // Genuine: High upside + Independent catalysts + Low risk
    if (upsideScore >= 60 && !contextDriven && risk < 40) {
      return 'genuine';
    }

    // Genuine: Strong role lock + Good projection
    if (metrics.opportunity_toi >= 16 && upsideScore >= 55) {
      return 'genuine';
    }

    // Monitor: Everything in between (50/50 territory)
    return 'monitor';
  }

  /**
   * Layer 3: Evaluate player metrics from Yahoo's real stats.
   *
   * Season stats give the baseline, last-month stats give the current form,
   * and the projection weights recent form 60/40 over the season line. Where a
   * player has no stats at all (a true unknown), `has_stats` is false and the
   * caller can see the score rests on schedule and role signals only —
   * previously this method returned `Math.random()` and nothing said so.
   */
  private async evaluateMetrics(player: Player, data: FantasyData): Promise<any> {
    const dataAny = data as any;
    const isTrending = data.trendingPlayers?.some((t: any) => t.player_id === player.player_id);

    const season = parseStatArray(dataAny.seasonStats?.[player.player_id] ?? []);
    const recent = parseStatArray(dataAny.recentStats?.[player.player_id] ?? []);

    const seasonPoints = this.pointsFrom(season);
    const recentPoints = this.pointsFrom(recent);
    const seasonGames = season['GP'] ?? 0;
    const recentGames = recent['GP'] ?? 0;

    const hasStats = seasonGames > 0 || recentGames > 0;

    const seasonPpg = seasonGames > 0 ? seasonPoints / seasonGames : 0;
    const recentPpg = recentGames > 0 ? recentPoints / recentGames : seasonPpg;

    // Weight current form over the season baseline, but only when there is
    // enough recent sample to mean anything.
    const formWeight = recentGames >= 3 ? 0.6 : 0;
    const projectedBase = (formWeight * recentPpg) + ((1 - formWeight) * seasonPpg);
    const projected_fpg = isTrending ? projectedBase * 1.15 : projectedBase;

    return {
      has_stats: hasStats,
      recent_ppg: Number(recentPpg.toFixed(3)),
      season_ppg: Number(seasonPpg.toFixed(3)),
      games_sampled: { season: seasonGames, recent: recentGames },
      projected_fpg: Number(projected_fpg.toFixed(3)),
      opportunity_toi: this.estimateOpportunity(player, season, recent),
      pp_role: this.derivePowerPlayRole(season, recent, seasonGames, recentGames),
      line_position: projectedBase >= 0.5 ? 'Top-6' : 'Bottom-6'
    };
  }

  /**
   * Fantasy points proxy from a labelled stat line.
   * Uses Yahoo's own points category when the league reports it, otherwise
   * reconstructs it from goals and assists.
   */
  private pointsFrom(stats: Record<string, number>): number {
    if (stats['P'] !== undefined) return stats['P'];
    return (stats['G'] ?? 0) + (stats['A'] ?? 0);
  }

  /**
   * Opportunity signal on the 0-25 scale the upside formula expects.
   *
   * Yahoo does not expose time on ice in standard league stat lines, so this
   * derives opportunity from observable production volume (shots per game) and
   * power-play involvement rather than inventing a minutes figure.
   */
  private estimateOpportunity(
    player: Player,
    season: Record<string, number>,
    recent: Record<string, number>
  ): number {
    const games = season['GP'] ?? 0;
    if (games === 0) return 0;

    const shotsPerGame = (season['SOG'] ?? 0) / games;
    const ppPointsPerGame = (season['PPP'] ?? 0) / games;

    // Shot volume scaled to ~0-15, power-play involvement worth up to ~10.
    const shotComponent = Math.min(15, shotsPerGame * 5);
    const ppComponent = Math.min(10, ppPointsPerGame * 40);

    return Number((shotComponent + ppComponent).toFixed(1));
  }

  /** Power-play role inferred from actual power-play production. */
  private derivePowerPlayRole(
    season: Record<string, number>,
    recent: Record<string, number>,
    seasonGames: number,
    recentGames: number
  ): string {
    const games = seasonGames || recentGames;
    if (games === 0) return 'Unknown';

    const ppp = (season['PPP'] ?? recent['PPP'] ?? 0);
    const perGame = ppp / games;

    if (perGame >= 0.35) return 'PP1';
    if (perGame >= 0.12) return 'PP2';
    return 'None';
  }

  /**
   * Layer 1: Analyze schedule ease
   */
  private analyzeScheduleEase(schedule: WeekendSchedule, player: Player): any {
    if (schedule.game_count === 0) {
      return { ease_score: 0, matchup_quality: 'unknown' as const };
    }

    // Base score on game count
    let easeScore = schedule.game_count * 30;

    // Bonus for multiple games
    if (schedule.game_count >= 3) easeScore += 15;

    // Penalty for back-to-back
    if (schedule.has_back_to_back) easeScore -= 10;

    // Opponent strength from real NHL standings (goals allowed per game, ranked).
    // 0 = softest defence to face, 100 = stingiest.
    const opponentStrength = this.averageOpponentDifficulty(schedule);

    if (opponentStrength === null) {
      // No standings data - rate on schedule volume alone rather than guessing.
      return {
        ease_score: Math.max(0, Math.min(100, easeScore)),
        matchup_quality: 'unknown' as const
      };
    }

    if (opponentStrength < 30) {
      easeScore += 20; // Weak opponent
    } else if (opponentStrength > 70) {
      easeScore -= 15; // Strong opponent
    }

    const matchup_quality =
      opponentStrength < 30 ? 'elite' :
      opponentStrength < 50 ? 'favorable' :
      opponentStrength < 70 ? 'average' : 'difficult';

    return {
      ease_score: Math.max(0, Math.min(100, easeScore)),
      matchup_quality
    };
  }

  /**
   * Layer 4: Assess risk
   */
  private assessRisk(player: Player, schedule: WeekendSchedule, metrics: any): any {
    let totalRisk = 20; // Base risk

    // Injury status
    if (player.status && player.status !== '' && player.status !== 'Healthy') {
      totalRisk += 30;
    }

    // Low opportunity = higher risk
    if (metrics.opportunity_toi < 12) {
      totalRisk += 25;
    }

    // Back-to-back fatigue
    if (schedule.has_back_to_back) {
      totalRisk += 15;
    }

    // Low ownership = unproven = risk
    const ownership = player.percent_owned || 0;
    if (ownership < 10) totalRisk += 15;
    if (ownership > 30) totalRisk -= 10; // Higher ownership = proven

    return {
      total_risk: Math.max(0, Math.min(100, totalRisk)),
      factors: {
        injury: player.status ? true : false,
        low_toi: metrics.opportunity_toi < 12,
        back_to_back: schedule.has_back_to_back,
        low_ownership: ownership < 10
      }
    };
  }

  /**
   * Layer 2: Check if stream is context-driven (bye/injury)
   */
  private isContextDriven(player: Player, gaps: RosterGaps): boolean {
    // If user has gaps and player fills position need
    if (gaps.position_needs.length > 0) {
      const playerPositions = player.position.split(',');
      for (const pos of playerPositions) {
        if (gaps.position_needs.includes(pos)) {
          return true;
        }
      }
    }

    // If significant roster gaps exist, assume context-driven
    return gaps.gaps_count > 2;
  }

  /**
   * Determine hold duration based on classification
   */
  private determineHoldDuration(
    classification: 'desperation' | 'genuine' | 'monitor',
    metrics: any
  ): '<1 week' | '1-2 weeks' | '>2 weeks' {
    if (classification === 'genuine' && metrics.opportunity_toi >= 16) {
      return '>2 weeks';
    }
    if (classification === 'monitor') {
      return '1-2 weeks';
    }
    return '<1 week';
  }

  /**
   * Identify catalyst for stream opportunity
   */
  private identifyCatalyst(player: Player, metrics: any, schedule: WeekendSchedule): string {
    if (metrics.pp_role === 'PP1') return 'PP1 role lock - power play opportunity';
    if (metrics.line_position === 'Top-6') return 'Top-6 linemate upgrade';
    if (schedule.game_count >= 3) return `${schedule.game_count} games this weekend`;
    if (schedule.has_back_to_back) return 'Back-to-back games - volume play';
    if (metrics.recent_ppg > 0.7) return 'Hot streak - riding momentum';
    return 'Schedule-based streaming opportunity';
  }

  /**
   * Layer 6: Analyze fit to roster gaps
   */
  private analyzeFit(
    player: Player,
    gaps: RosterGaps,
    classification: 'desperation' | 'genuine' | 'monitor'
  ): any {
    let fitReason = '';
    let dropSuggestion: string | undefined;

    // Check position fit
    const playerPositions = player.position.split(',');
    const matchesNeed = playerPositions.some(pos => gaps.position_needs.includes(pos));

    if (matchesNeed) {
      fitReason = `Fills ${gaps.position_needs.join('/')} need`;
    } else if (gaps.gaps_count > 0) {
      fitReason = 'General roster depth add';
    } else {
      fitReason = 'Speculative opportunity';
    }

    // Suggest drop for genuine opportunities
    if (classification === 'genuine') {
      dropSuggestion = 'Drop lowest-scoring player in position';
    }

    return {
      fit_reason: fitReason,
      drop_suggestion: dropSuggestion,
      matches_position_need: matchesNeed
    };
  }

  /**
   * Summarize weekend trends
   */
  private summarizeWeekendTrends(streams: StreamCandidate[], schedules: Map<string, WeekendSchedule>): any {
    const totalGames = Array.from(schedules.values())
      .reduce((sum, s) => sum + s.game_count, 0);

    const avgGamesPerPlayer = schedules.size > 0 ? totalGames / schedules.size : 0;

    const backToBackCount = Array.from(schedules.values())
      .filter(s => s.has_back_to_back).length;

    return {
      total_weekend_games: totalGames,
      avg_games_per_player: Math.round(avgGamesPerPlayer * 10) / 10,
      back_to_back_situations: backToBackCount,
      top_matchup_players: streams
        .filter(s => s.matchup_quality === 'elite' || s.matchup_quality === 'favorable')
        .length
    };
  }

  /**
   * Mean defensive difficulty of the opponents on this weekend slate.
   * Returns null when standings are unavailable, so the caller can decline to
   * rate the matchup rather than invent a rating.
   */
  private averageOpponentDifficulty(schedule: WeekendSchedule): number | null {
    if (!NHL_SCHEDULE.hasStandings() || schedule.games.length === 0) return null;

    const ratings = schedule.games
      .map(game => NHL_SCHEDULE.getTeamStrength(game.opponent)?.difficulty)
      .filter((d): d is number => typeof d === 'number');

    if (ratings.length === 0) return null;

    return ratings.reduce((sum, d) => sum + d, 0) / ratings.length;
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

    // Custom chirp messages for weekend streams
    const chirpMessages = this.generateWeekendChirps(analysisResults);

    const enhanced = ChirpIntelligence.enhance(
      'analyze_weekend_streams',
      {
        ...analysisResults,
        streaming_targets: analysisResults.top_genuine,
        recommendations: analysisResults.top_genuine
      },
      semanticContract
    );

    // Override with custom chirps
    if (enhanced.chirp_intelligence) {
      enhanced.chirp_intelligence.analysis_chirp = chirpMessages.main;
      enhanced.chirp_intelligence.ice_cold_truth = chirpMessages.truth;
      enhanced.chirp_intelligence.style = 'desperate_or_legit';
    }

    return enhanced;
  }

  /**
   * Generate custom chirps for weekend streams
   */
  private generateWeekendChirps(results: any): any {
    const { top_genuine, top_desperation, roster_gaps } = results;

    let mainChirp = '';
    let truth = '';

    if (top_genuine.length === 0 && top_desperation.length > 5) {
      mainChirp = "🆘 That's not a waiver wire, that's a cry for help. Pure desperation plays everywhere.";
      truth = "Weekend streaming desperation detected. You're filling holes, not building wins.";
    } else if (top_genuine.length >= 3) {
      mainChirp = `🔥 Found ${top_genuine.length} genuine opportunities. PP1 locks, top-6 roles, sustainable upside. This is how you dominate.`;
      truth = "These aren't streams, they're season savers. Act fast.";
    } else if (roster_gaps.gaps_count > 3) {
      mainChirp = "⚠️ Multiple roster gaps detected. You're in triage mode - prioritize high-floor plays.";
      truth = "Desperation mode activated. Take the best available, worry about upside later.";
    } else {
      mainChirp = "📊 Mixed bag this weekend. Some genuine plays, some desperation. Choose wisely.";
      truth = "Monitor territory - hot hands with risky matchups. Tread carefully.";
    }

    return { main: mainChirp, truth };
  }

  /**
   * Format final response
   */
  protected async formatResponse(
    chirpEnhanced: any,
    data: FantasyData
  ): Promise<AnalysisResponse> {
    const recommendations: Recommendation[] = [];

    // Add genuine opportunities as HIGH priority
    for (const stream of chirpEnhanced.top_genuine || []) {
      recommendations.push({
        priority: 'HIGH',
        action: 'pickup',
        player: stream,
        reasoning: `Genuine: ${stream.fit_reason} (Score: ${stream.upside_score})`
      });
    }

    // Add monitor targets as MEDIUM priority
    for (const stream of chirpEnhanced.top_monitor || []) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'watch' as any,  // 'monitor' as watch action
        player: stream,
        reasoning: `Monitor: ${stream.fit_reason} (Score: ${stream.upside_score})`
      });
    }

    const insights: AnalysisInsights = {
      streaming_targets: chirpEnhanced.top_genuine,
      favorable_teams: [],
      market_intelligence: {
        total_trending: data.trendingPlayers?.length || 0,
        favorable_teams_count: 0,
        top_trending_team: 'Weekend Focus'
      }
    };

    return {
      analysis_insights: insights,
      recommendations,
      chirp_intelligence: chirpEnhanced.chirp_intelligence || this.getDefaultChirp(),
      metadata: {
        analysis_type: this.analysisType,
        tool_identity: 'weekend_stream_analysis',
        generated_at: new Date().toISOString(),
        semantic_contract_applied: true,
        ...(chirpEnhanced.weekend_analysis && { weekend_summary: chirpEnhanced.weekend_analysis }),
        ...(chirpEnhanced.classification_breakdown && { classification_breakdown: chirpEnhanced.classification_breakdown }),
        ...(chirpEnhanced.roster_gaps && { roster_gaps: chirpEnhanced.roster_gaps })
      } as any
    };
  }

  /**
   * Default chirp when chirp intelligence is disabled
   */
  private getDefaultChirp(): ChirpResponse {
    return {
      tool_identity: 'weekend_stream_analysis',
      style: 'desperate_or_legit',
      personality: 'tactical_analyzer',
      intensity: 'ice_cold',
      semantic_context: 'weekend_streaming_classification',
      analysis_chirp: 'Weekend stream analysis complete - desperation vs genuine classified',
      intent_summary: 'Streaming opportunities identified and categorized',
      ice_cold_truth: 'Smart weekend streams build championships, desperate ones fill holes',
      energy_level: 'tactical'
    };
  }
}
