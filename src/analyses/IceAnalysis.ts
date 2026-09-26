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
import { ChirpIntelligence } from '../services/ChirpIntelligence.js';
import { rankGoalies } from '../domain/goalie-rank.js';
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
  constructor() {
    super("get_roster_transaction_recommendations", "ice_roster");
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
      candidatePool: this.candidatePool(lookAheadDays),
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

    // Pickups come from one pool — players on neither roster, with their club's games in the window — filtered to the
    // positions you asked for, else to your weak ones. The weak-position fix read a streaming list that has been empty
    // since v4, and the volume play ignored target_positions: asked for RW, it returned a C and a D.
    const pool: any[] = extendedData.candidatePool ?? [];
    const targets = (args.target_positions ?? []).map(p => p.toUpperCase());
    const recommended = new Set<string>();
    for (const position of weakPositions) {
      if (targets.length && !targets.includes(position.position)) continue;
      const pickup = IceAnalysis.bestFor(pool, [position.position], 1, recommended)[0];
      if (!pickup) continue;
      recommended.add(pickup.player_id);
      recommendations.push({
        priority: "HIGH",
        action: "pickup",  // Aligned with RecommendationAction type
        pickup,
        drop: this.findBestDropCandidate(data, position.position),
        reasoning: `Strengthen ${position.position} - ${position.weakness_reason}. ${pickup.name} (${pickup.team}) plays ` +
          `${pickup.games_in_window} time${pickup.games_in_window === 1 ? '' : 's'} in the window — check he is available in your league.`
      });
    }

    // 3. MEDIUM: Schedule edge.
    // games_in_hand_difference is YOUR games minus your opponent's, so positive is an advantage. It was reported as
    // "games_disadvantage", which turned a +6 edge into a 6-game deficit — the opposite of the right advice.
    const gih = extendedData.gamesInHand ?? {};
    const gamesDiff: number = gih.games_in_hand_difference || 0;
    if (gih.opponent_remaining !== null && gih.opponent_remaining !== undefined && gamesDiff < 0) {
      // Behind on volume: name real candidates — players not on either roster from the clubs that play most in the
      // window, best producers first — at the positions you asked for, else your weak ones, else any.
      const weak = weakPositions.map((w: any) => w.position);
      const wanted = targets.length ? targets : weak;
      let volume = IceAnalysis.bestFor(pool, wanted, 2, recommended);
      if (!volume.length && !targets.length) volume = IceAnalysis.bestFor(pool, [], 2, recommended);
      for (const pickup of volume) {
        recommendations.push({
          priority: "MEDIUM",
          action: "volume_play",
          pickup,
          reasoning: `Opponent has ${Math.abs(gamesDiff)} more games in the window. ${pickup.name} (${pickup.team}) ` +
            `plays ${pickup.games_in_window} times — check he is available in your league.`
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
      schedule_edge: this.describeEdge(gih),
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
    const enhanced = ChirpIntelligence.enhance(this.toolName, analysisResults, semanticContract);
    if (!enhanced?.chirp_intelligence) return enhanced;

    // Say what is actually happening. The generic line read "Your lineup is solid" while the roster trailed by six
    // games, because it only counted recommendations.
    const edge = analysisResults.schedule_edge;
    const recs = analysisResults.recommendations ?? [];
    const volume = recs.filter((r: any) => r.action === 'volume_play');
    const parts: string[] = [];
    if (edge?.reading) parts.push(edge.reading);
    if (edge?.advantage < 0) {
      parts.push(volume.length
        ? `Close it with volume: ${volume.map((r: any) => `${r.pickup.name} (${r.pickup.team}, ${r.pickup.games_in_window} games)`).join(' or ')}.`
        : 'No club plays more than once in this window, so there is no volume to add — set your best lineup and win the rates.');
    } else if (edge?.advantage > 0) {
      parts.push('Keep a full lineup in every night and let the extra games do the work.');
    }
    const other = recs.length - volume.length;
    if (other > 0) parts.push(`${other} other ${other === 1 ? 'move' : 'moves'} listed below.`);
    if (!parts.length) parts.push(recs.length ? `${recs.length} moves listed below.` : 'Nothing needs changing right now.');

    return {
      ...enhanced,
      chirp_intelligence: { ...enhanced.chirp_intelligence, analysis_chirp: parts.join(' ') }
    };
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
      schedule_edge: chirpEnhanced.schedule_edge,
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

  /** A signed, labelled reading of the games-in-hand numbers. Positive is always your advantage. */
  private describeEdge(gih: any): any {
    if (!gih?.available) return { available: false, note: gih?.note ?? 'Schedule unavailable' };
    if (gih.opponent_remaining === null || gih.opponent_remaining === undefined) {
      return { available: true, your_games: gih.your_remaining, opponent_games: null, note: gih.note };
    }
    const edge = gih.games_in_hand_difference;
    return {
      available: true,
      your_games: gih.your_remaining,
      opponent_games: gih.opponent_remaining,
      advantage: edge,
      reading: edge > 0 ? `You have ${edge} more games than your opponent in the window.`
        : edge < 0 ? `Your opponent has ${-edge} more games than you in the window.`
        : 'You and your opponent play the same number of games in the window.',
      window: gih.window,
    };
  }

  /**
   * Players on neither roster whose clubs play the most games in the window, best producers first.
   *
   * This used an absolute cutoff of three games, which no club can reach in a short week — the opening week of
   * 2026-27 has clubs on 0, 1 or 2 games — so it returned nothing whenever it was needed early in a season. "Most
   * games in this window" is the relative fact that actually closes a gap.
   */
  /** Skaters on neither roster, with their club's games in the window. */
  private candidatePool(lookAheadDays: number): any[] {
    if (!NHL_SCHEDULE.isAvailable()) return [];
    const start = NhlScheduleService.today();
    const end = NhlScheduleService.addDays(start, Math.max(0, lookAheadDays - 1));
    const all = LEAGUE_DATA.getPlayerPool({ limit: 5000 });
    const shape = (p: any, value: number) => ({ player_id: p.player_id, name: p.name, team: p.team, position: p.position,
      games_in_window: NHL_SCHEDULE.countGamesInRange(p.team, start, end), points: value });
    // Goalies are ordered by the shared goalie ranking (value falls with rank) and only offered when G is asked for or
    // weak: ICE listed G as a weak position and then suggested no goalie, because this pool held skaters only.
    const goalies = rankGoalies(all.filter(p => p.position === 'G')).map((p, i) => ({ ...shape(p, -i), goalie: true }));
    return [...all.filter(p => p.position !== 'G').slice(0, 400).map(p => shape(p, (p as any).stats?.points ?? 0)), ...goalies];
  }

  /**
   * The best producers at these positions (any, if none given) among the clubs that play most in the window. "Most" is
   * relative to the window: an absolute three-game bar named nobody in a short week.
   */
  static bestFor(pool: any[], positions: string[], n: number, exclude: Set<string> = new Set()): any[] {
    const eligible = pool.filter(p => !exclude.has(p.player_id) && p.games_in_window > 0 &&
      (positions.length
        ? String(p.position).split(',').some((x: string) => positions.includes(x.trim().toUpperCase()))
        : !p.goalie));
    // Skater points and goalie rank are different scales; a mixed request takes each group's best in turn.
    if (positions.includes('G') && positions.some(x => x !== 'G')) {
      const g = IceAnalysis.bestFor(pool, ['G'], n, exclude), sk = IceAnalysis.bestFor(pool, positions.filter(x => x !== 'G'), n, exclude);
      return sk.flatMap((x, i) => (g[i] ? [x, g[i]] : [x])).concat(g.slice(sk.length)).slice(0, n);
    }
    const most = Math.max(0, ...eligible.map(p => p.games_in_window));
    return eligible.filter(p => p.games_in_window === most).sort((a, b) => b.points - a.points).slice(0, n);
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
