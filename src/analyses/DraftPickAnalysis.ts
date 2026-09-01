/**
 * 🎯 Draft Pick Analysis — ICE at the draft table
 *
 * Answers one question: with pick N on the clock, who should you take?
 *
 * A public draft board ranks players in the abstract. This ranks them against
 * *your* draft: who is already gone, what your roster is still missing, what
 * your league's categories reward, and what each player's club schedule is
 * worth in the weeks your league plays its playoffs.
 *
 * Value is measured as ADP delta — Yahoo's own average draft position minus
 * the pick actually on the clock — so "value" means the market is wrong here,
 * not "this player is good".
 *
 * Semantic Identity: ICE - Intent Chirp Engine (Draft)
 * Intent: I tell you who to take, and why the board is wrong
 * Chirp Style: ice_cold_truth
 */

import { AnalysisTemplate } from '../template/AnalysisTemplate.js';
import type {
  SemanticChirpContract,
  AnalysisResponse,
  FantasyData,
  AnalysisInsights,
  Recommendation,
  AnalysisMetadata
} from '../domain/types.js';
import { ChirpIntelligence } from '../services/ChirpIntelligence.js';
import { NHL_SCHEDULE, NhlScheduleService } from '../services/NhlScheduleService.js';
import { toNhlTricode } from '../domain/nhl-teams.js';
import { LEAGUE_DATA, LeagueDataService } from '../services/LeagueDataService.js';
import { NHL_STATS } from '../services/NhlStatsService.js';

export interface DraftPickArgs {
  readonly pick_number?: number;
  /** Player names already off the board. Merged with Yahoo's draft results. */
  readonly already_drafted?: string[];
  /** Positions you still need, e.g. ['RW', 'G']. Inferred from your roster otherwise. */
  readonly roster_needs?: string[];
  readonly max_results?: number;
  readonly pool_size?: number;
  /** Fantasy playoff weeks, so schedule can act as a tiebreaker. */
  readonly playoff_start_week?: number;
  readonly playoff_end_week?: number;
  readonly chirp_intensity?: string;
  readonly personality_mode?: string;
}

export interface DraftCandidate {
  readonly player_id: string;
  readonly name: string;
  readonly position: string;
  readonly team: string;
  readonly average_pick: number | null;
  readonly percent_drafted: number | null;
  readonly adp_delta: number | null;
  readonly playoff_games: number | null;
  readonly four_game_weeks: number | null;
  readonly fills_need: boolean;
  readonly draft_score: number;
  readonly verdict: 'REACH' | 'FAIR' | 'VALUE' | 'STEAL';
  readonly reasoning: string;
}

/** Skater and goalie slots this analysis reasons about. */
const TRACKED_POSITIONS = ['C', 'LW', 'RW', 'D', 'G'];

export class DraftPickAnalysis extends AnalysisTemplate {
  constructor() {
    super('chirp_draft_pick', 'draft_pick');
  }

  // ==========================================
  // Hook 1: Fetch
  // ==========================================

  protected async fetchData(args: DraftPickArgs): Promise<any> {
    await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load(), NHL_SCHEDULE.loadStandings()]);

    // v4: the board is every NHL player, ranked on last season's production.
    // Yahoo's ADP is gone, so "value" is measured against production rank
    // rather than against where a market drafts a player.
    return {
      pool: LEAGUE_DATA.getPlayerPool({ limit: Math.min(args.pool_size ?? 250, 400) }),
      roster: LEAGUE_DATA.getRoster(),
      pool_caveat: LeagueDataService.POOL_CAVEAT
    };

  }

  // ==========================================
  // Hook 2: Prepare
  // ==========================================

  protected async prepareData(rawData: any, args: DraftPickArgs): Promise<FantasyData> {
    // Board state comes entirely from what the user tells us — there is no
    // platform to ask. `already_drafted` is therefore the source, not a
    // fallback, and the pick number follows from it unless stated.
    const draftedNames = new Set<string>(
      (args.already_drafted ?? []).map(n => this.normalizeName(n))
    );

    const rosterPositions: Record<string, number> = {};
    for (const p of rawData.roster?.players ?? []) {
      for (const pos of String(p.position ?? '').split(',')) {
        const clean = pos.trim().toUpperCase();
        if (TRACKED_POSITIONS.includes(clean)) {
          rosterPositions[clean] = (rosterPositions[clean] ?? 0) + 1;
        }
      }
    }

    // Rank the pool by production; that rank stands in for a draft board.
    const pool = (rawData.pool ?? []).map((p: any, index: number) => ({
      player_id: p.player_id,
      name: p.name,
      position: p.position,
      positions: String(p.position ?? '').split(',').map((x: string) => x.trim().toUpperCase()).filter(Boolean),
      team: p.team,
      // Production rank is the board position: the Nth best producer is,
      // absent a market, the Nth pick worth making.
      average_pick: index + 1,
      average_round: null,
      percent_drafted: null,
      stats: p.stats ?? null
    }));

    return {
      draftPool: pool,
      draftedIds: new Set<string>(),
      draftedNames,
      draftedCount: draftedNames.size,
      draftResultsAvailable: false,
      manualDraftedCount: draftedNames.size,
      rosterPositions,
      playoffWindow: this.resolvePlayoffWindow(args),
      poolCaveat: rawData.pool_caveat
    } as any;

  }

  // ==========================================
  // Hook 3: Analyze
  // ==========================================

  protected async analyzeData(data: FantasyData, args: DraftPickArgs): Promise<any> {
    const d = data as any;
    const maxResults = args.max_results ?? 8;

    // Pick on the clock: explicit, else inferred from picks already made.
    const pickNumber =
      args.pick_number ?? (Math.max(d.draftedCount, d.draftedNames.size) + 1);

    const needs = args.roster_needs?.length
      ? args.roster_needs.map(p => p.toUpperCase())
      : this.inferNeeds(d.rosterPositions);

    // Yahoo's REST draft results can lag a fast live draft, so `already_drafted`
    // is a first-class second source rather than a fallback: a player is off
    // the board if either source says so.
    const available = d.draftPool.filter(
      (p: any) =>
        !d.draftedIds.has(String(p.player_id)) &&
        !d.draftedNames.has(this.normalizeName(p.name))
    );

    const candidates: DraftCandidate[] = available
      .map((p: any) => this.rateCandidate(p, pickNumber, needs, d.playoffWindow))
      .sort((a: DraftCandidate, b: DraftCandidate) => b.draft_score - a.draft_score)
      .slice(0, maxResults);

    return {
      pick_number: pickNumber,
      pick_number_source: args.pick_number ? 'explicit' : 'inferred from draft results',
      roster_needs: needs,
      pool_size: d.draftPool.length,
      available_count: available.length,
      players_off_board: d.draftedIds.size + d.draftedNames.size,
      draft_results_available: d.draftResultsAvailable,
      manual_drafted_count: d.manualDraftedCount,
      playoff_window: d.playoffWindow,
      pool_caveat: d.poolCaveat,
      schedule_available: NHL_SCHEDULE.isAvailable(),
      candidates
    };
  }

  // ==========================================
  // Hook 4: Chirp
  // ==========================================

  protected async generateChirp(
    analysisResults: any,
    semanticContract: SemanticChirpContract,
    data: FantasyData
  ): Promise<any> {
    const contract = this.mergeContractWithDefaults(semanticContract);
    const enhanced = ChirpIntelligence.enhance(this.toolName, analysisResults, contract);

    const top: DraftCandidate | undefined = analysisResults.candidates[0];

    // The playoff clause is only truthful when a window was actually resolved.
    const windowResolved = analysisResults.playoff_window?.resolved === true;
    const scheduleClause = top && windowResolved && top.playoff_games !== null
      ? `, and ${top.team} plays ${top.playoff_games} games in your playoff window`
      : '';

    let chirp: string;
    if (!top) {
      chirp = 'Nobody left worth chirping about. Either the pool is empty or everyone is drafted.';
    } else if (top.adp_delta !== null && top.adp_delta >= 12) {
      // v4 has no market ADP. average_pick is this player's rank by production,
      // so the claim is "better player than this slot", not "the room drafts
      // him earlier" — nothing here knows what a room does.
      chirp =
        `${top.name} is the ${this.ordinal(top.average_pick ?? 0)} best producer left and you are ` +
        `picking at ${analysisResults.pick_number}. That is ${Math.round(top.adp_delta)} slots of ` +
        `talent above where you are sitting${scheduleClause}.`;
    } else if (top.fills_need) {
      chirp =
        `${top.name} fills the hole you actually have (${top.position})${scheduleClause}. ` +
        `Best available is a luxury; a full lineup is not.`;
    } else {
      chirp =
        `${top.name} is the pick. No bargain, no drama — just the best producer left ` +
        `at ${analysisResults.pick_number}${scheduleClause}.`;
    }

    if (!windowResolved) {
      chirp +=
        ' I have not scored your playoff weeks — pass playoff_start_week and ' +
        'playoff_end_week and the schedule becomes a tiebreaker.';
    }

    if (analysisResults.players_off_board === 0) {
      chirp +=
        ' ⚠️ Nobody is marked as drafted yet — pass `already_drafted` as picks go by ' +
        'and this board stays accurate.';
    }

    return {
      ...enhanced,
      chirp_intelligence: {
        ...enhanced.chirp_intelligence,
        analysis_chirp: chirp
      }
    };
  }

  // ==========================================
  // Hook 5: Format
  // ==========================================

  protected async formatResponse(chirpEnhanced: any, data: FantasyData): Promise<AnalysisResponse> {
    const candidates: DraftCandidate[] = chirpEnhanced.candidates ?? [];

    const recommendations: Recommendation[] = candidates.map((c, index) => ({
      priority: index === 0 ? 'CRITICAL' : index < 3 ? 'HIGH' : 'MEDIUM',
      action: 'draft',
      reasoning: c.reasoning
    })) as any;

    const analysisInsights: AnalysisInsights = {
      pick_number: chirpEnhanced.pick_number,
      pick_number_source: chirpEnhanced.pick_number_source,
      roster_needs: chirpEnhanced.roster_needs,
      players_off_board: chirpEnhanced.players_off_board,
      board_state:
        `${chirpEnhanced.players_off_board} player(s) marked as already drafted. ` +
        'Board state comes from `already_drafted` — there is no platform to read it from, ' +
        'so tell me who has gone and the board updates.',
      board_note: chirpEnhanced.pool_caveat,
      schedule_source: chirpEnhanced.schedule_available
        ? `NHL public API (season ${NHL_SCHEDULE.getSeason()})`
        : `UNAVAILABLE - ${NHL_SCHEDULE.getUnavailableReason()}; schedule value excluded from scoring`,
      playoff_window: chirpEnhanced.playoff_window,
      top_candidates: candidates
    } as any;

    const metadata: AnalysisMetadata = {
      analysis_type: this.analysisType,
      timestamp: new Date().toISOString(),
      team_context: { team_name: 'Draft Board' },
      semantic_contract_applied: true
    } as any;

    return {
      analysis_insights: analysisInsights,
      recommendations,
      chirp_intelligence: chirpEnhanced.chirp_intelligence,
      metadata
    };
  }

  // ==========================================
  // 🎯 Scoring
  // ==========================================

  private rateCandidate(
    player: any,
    pickNumber: number,
    needs: string[],
    window: any
  ): DraftCandidate {
    const averagePick = player.average_pick;
    const adpDelta = averagePick !== null ? pickNumber - averagePick : null;

    const tricode = toNhlTricode(player.team);
    const profile = tricode && NHL_SCHEDULE.isAvailable()
      ? NHL_SCHEDULE.getTeamProfile(tricode)
      : null;

    const playoffGames = profile && window?.start && window?.end
      ? NHL_SCHEDULE.countGamesInRange(tricode!, window.start, window.end)
      : null;

    const fillsNeed = needs.some(need => player.positions.includes(need));

    // --- components, each 0-1 ---

    // Value: how far past his usual draft slot he has fallen. A player going
    // 20 picks later than the market takes him is the whole point.
    const valueComponent = adpDelta === null
      ? 0.5
      : Math.max(0, Math.min(1, (adpDelta + 10) / 40));

    // Board rank: earlier average pick is a better player, all else equal.
    const rankComponent = averagePick === null
      ? 0.3
      : Math.max(0, Math.min(1, 1 - (averagePick / 250)));

    // Schedule: playoff-window volume, normalized against a 4-game week.
    const weekCount = window?.weeks?.length ?? 0;
    const scheduleComponent = playoffGames !== null && weekCount > 0
      ? Math.min(1, (playoffGames / weekCount) / 4)
      : 0.5;

    const needComponent = fillsNeed ? 1 : 0;

    const score =
      (0.40 * valueComponent) +
      (0.30 * rankComponent) +
      (0.18 * needComponent) +
      (0.12 * scheduleComponent);

    return {
      player_id: player.player_id,
      name: player.name,
      position: player.position,
      team: player.team,
      average_pick: averagePick,
      percent_drafted: player.percent_drafted,
      adp_delta: adpDelta === null ? null : Number(adpDelta.toFixed(1)),
      playoff_games: playoffGames,
      four_game_weeks: profile?.weeks_with_4_plus ?? null,
      fills_need: fillsNeed,
      draft_score: Math.round(score * 100),
      verdict: this.verdictFor(adpDelta),
      reasoning: this.reasoningFor(player, adpDelta, playoffGames, weekCount, fillsNeed)
    };
  }

  /** 1 -> "1st", 2 -> "2nd", 23 -> "23rd". */
  private ordinal(n: number): string {
    const rem100 = n % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
    switch (n % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  }

  private verdictFor(adpDelta: number | null): DraftCandidate['verdict'] {
    if (adpDelta === null) return 'FAIR';
    if (adpDelta >= 20) return 'STEAL';
    if (adpDelta >= 8) return 'VALUE';
    if (adpDelta <= -12) return 'REACH';
    return 'FAIR';
  }

  private reasoningFor(
    player: any,
    adpDelta: number | null,
    playoffGames: number | null,
    weekCount: number,
    fillsNeed: boolean
  ): string {
    const parts: string[] = [`${player.name} (${player.position}, ${player.team})`];

    if (adpDelta === null) {
      parts.push('no Yahoo ADP available');
    } else if (adpDelta > 0) {
      parts.push(`${Math.round(adpDelta)} picks past his ADP of ${player.average_pick}`);
    } else if (adpDelta < 0) {
      parts.push(`${Math.abs(Math.round(adpDelta))} picks ahead of his ADP of ${player.average_pick}`);
    } else {
      parts.push(`right at his ADP of ${player.average_pick}`);
    }

    if (playoffGames !== null && weekCount > 0) {
      parts.push(`${playoffGames} games across your ${weekCount} playoff weeks`);
    }

    if (fillsNeed) parts.push('fills a roster hole');

    return parts.join(' — ') + '.';
  }

  // ==========================================
  // 🎯 Roster needs
  // ==========================================

  /** Positions with the thinnest coverage on the current roster. */
  private inferNeeds(rosterPositions: Record<string, number>): string[] {
    const counts = TRACKED_POSITIONS.map(pos => ({ pos, count: rosterPositions[pos] ?? 0 }));
    const minimum = Math.min(...counts.map(c => c.count));

    return counts.filter(c => c.count === minimum).map(c => c.pos);
  }

  // ==========================================
  // 🎯 Yahoo parsing (defensive)
  // ==========================================

  /**
   * Yahoo's fantasy JSON alternates between arrays and count-keyed objects
   * depending on the resource and, in places, the request. Everything below
   * accepts either shape and returns empty rather than throwing, so a shape
   * change degrades one field instead of the whole draft tool.
   */
  private keyedEntries(container: any): any[] {
    if (!container) return [];
    if (Array.isArray(container)) return container;

    return Object.keys(container)
      .filter(k => k !== 'count')
      .map(k => container[k]);
  }

  private parsePlayerPool(poolPages: any[]): any[] {
    const players: any[] = [];

    for (const page of poolPages ?? []) {
      if (!page) continue;

      const container =
        page?.fantasy_content?.league?.[1]?.players ??
        page?.fantasy_content?.league?.players;

      for (const entry of this.keyedEntries(container)) {
        const player = entry?.player;
        if (!player) continue;

        const identity = Array.isArray(player[0]) ? player[0] : [];
        const find = (key: string) => identity.find((item: any) => item?.[key])?.[key];

        const name = find('name')?.full;
        const playerId = find('player_id');
        if (!name || !playerId) continue;

        // draft_analysis rides on the second element, occasionally nested.
        const analysis =
          player[1]?.draft_analysis ??
          player[1]?.[0]?.draft_analysis ??
          (Array.isArray(player[1])
            ? player[1].find((item: any) => item?.draft_analysis)?.draft_analysis
            : undefined);

        const displayPosition = find('display_position') ?? '';

        players.push({
          player_id: String(playerId),
          name,
          position: displayPosition,
          positions: String(displayPosition)
            .split(',')
            .map((p: string) => p.trim().toUpperCase())
            .filter(Boolean),
          team: find('editorial_team_abbr') ?? '',
          average_pick: this.toNumberOrNull(analysis?.average_pick),
          average_round: this.toNumberOrNull(analysis?.average_round),
          percent_drafted: this.toNumberOrNull(analysis?.percent_drafted)
        });
      }
    }

    // Same player can appear across pages; keep one.
    return Array.from(new Map(players.map(p => [p.player_id, p])).values());
  }

  private parseDraftResults(payload: any): {
    available: boolean;
    count: number;
    ids: Set<string>;
  } {
    const container =
      payload?.fantasy_content?.league?.[1]?.draft_results ??
      payload?.fantasy_content?.league?.draft_results;

    const entries = this.keyedEntries(container);
    if (entries.length === 0) {
      return { available: false, count: 0, ids: new Set() };
    }

    const ids = new Set<string>();
    let count = 0;

    for (const entry of entries) {
      const result = entry?.draft_result ?? entry;
      if (!result?.player_key) continue;

      count++;
      // Draft results carry player_key (`nhl.p.1234`), never a name, so the
      // board state is matched to the pool by id.
      const id = String(result.player_key).split('.').pop();
      if (id) ids.add(id);
    }

    return { available: count > 0, count, ids };
  }

  private parseRosterPositions(payload: any): Record<string, number> {
    const counts: Record<string, number> = {};

    const container =
      payload?.fantasy_content?.team?.[1]?.roster?.['0']?.players ??
      payload?.fantasy_content?.team?.[1]?.roster?.players;

    for (const entry of this.keyedEntries(container)) {
      const player = entry?.player;
      if (!player) continue;

      const identity = Array.isArray(player[0]) ? player[0] : [];
      const displayPosition = identity.find((item: any) => item?.display_position)?.display_position;

      for (const pos of String(displayPosition ?? '').split(',')) {
        const clean = pos.trim().toUpperCase();
        if (TRACKED_POSITIONS.includes(clean)) {
          counts[clean] = (counts[clean] ?? 0) + 1;
        }
      }
    }

    return counts;
  }

  /**
   * Resolve the fantasy playoff weeks to calendar dates.
   *
   * v4 has no league settings to read, so the weeks come from the caller and
   * week 1 is anchored to the NHL season's own opening night. Without stated
   * weeks the window is unresolved, and the schedule component stays neutral
   * rather than silently scoring the wrong three weeks.
   */
  private resolvePlayoffWindow(args: DraftPickArgs): any {
    const startWeek = Number(args?.playoff_start_week ?? 0);
    const endWeek = Number(args?.playoff_end_week ?? 0);
    const seasonStart = NHL_SCHEDULE.getSeasonStartDate();

    if (!startWeek || !endWeek || startWeek > endWeek || !seasonStart) {
      return { resolved: false, start: null, end: null, weeks: [] };
    }

    const week1Monday = NhlScheduleService.weekStart(seasonStart);
    const weeks: string[] = [];
    for (let week = startWeek; week <= endWeek; week++) {
      weeks.push(NhlScheduleService.addDays(week1Monday, (week - 1) * 7));
    }

    return {
      resolved: true,
      week_1_anchor: `${week1Monday} (NHL season opener)`,
      playoff_start_week: startWeek,
      end_week: endWeek,
      start: NhlScheduleService.addDays(week1Monday, (startWeek - 1) * 7),
      end: NhlScheduleService.addDays(week1Monday, endWeek * 7 - 1),
      weeks
    };
  }


  private toNumberOrNull(value: any): number | null {
    if (value === undefined || value === null || value === '' || value === '-') return null;
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /** Case- and punctuation-insensitive name key for matching drafted players. */
  private normalizeName(name: string): string {
    return String(name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }
}
