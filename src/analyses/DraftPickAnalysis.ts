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
import { YahooApiClient } from '../services/YahooApiClient.js';
import { ChirpIntelligence } from '../services/ChirpIntelligence.js';
import { NHL_SCHEDULE, NhlScheduleService } from '../services/NhlScheduleService.js';
import { toNhlTricode } from '../domain/nhl-teams.js';

export interface DraftPickArgs {
  readonly pick_number?: number;
  /** Player names already off the board. Merged with Yahoo's draft results. */
  readonly already_drafted?: string[];
  /** Positions you still need, e.g. ['RW', 'G']. Inferred from your roster otherwise. */
  readonly roster_needs?: string[];
  readonly max_results?: number;
  readonly pool_size?: number;
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
  constructor(
    private readonly yahooClient: YahooApiClient,
    private readonly leagueId: string,
    private readonly teamId: string
  ) {
    super('chirp_draft_pick', 'draft_pick');
  }

  // ==========================================
  // Hook 1: Fetch
  // ==========================================

  protected async fetchData(args: DraftPickArgs): Promise<any> {
    const poolSize = Math.min(args.pool_size ?? 150, 300);

    // Yahoo caps players per page, so the pool is paged in 50s.
    const pages = Math.ceil(poolSize / 50);
    const poolPromises = Array.from({ length: pages }, (_, i) =>
      this.yahooClient
        .getPlayersWithDraftAnalysis(50, i * 50, 'ALL', this.leagueId)
        .catch(() => null)
    );

    const [draftResults, settings, roster, ...poolPages] = await Promise.all([
      this.yahooClient.getDraftResults(this.leagueId).catch(() => null),
      this.yahooClient.getLeagueSettings(this.leagueId).catch(() => null),
      this.yahooClient.getTeamRoster(this.leagueId, this.teamId).catch(() => null),
      ...poolPromises
    ]);

    await Promise.all([NHL_SCHEDULE.load(), NHL_SCHEDULE.loadStandings()]);

    return { draftResults, settings, roster, poolPages };
  }

  // ==========================================
  // Hook 2: Prepare
  // ==========================================

  protected async prepareData(rawData: any, args: DraftPickArgs): Promise<FantasyData> {
    const pool = this.parsePlayerPool(rawData.poolPages);
    const draftedFromApi = this.parseDraftResults(rawData.draftResults);

    // Merge Yahoo's picks with anything the user told us directly. Yahoo's REST
    // draft results can lag a fast live draft, so the manual list is not a
    // fallback — it is a first-class source that overrides nothing and adds
    // everything.
    const draftedNames = new Set<string>(
      (args.already_drafted ?? []).map(n => this.normalizeName(n))
    );

    const rosterPositions = this.parseRosterPositions(rawData.roster);
    const playoffWindow = this.resolvePlayoffWindow(rawData.settings);

    return {
      draftPool: pool,
      draftedIds: draftedFromApi.ids,
      draftedNames,
      draftedCount: draftedFromApi.count,
      draftResultsAvailable: draftedFromApi.available,
      manualDraftedCount: draftedNames.size,
      rosterPositions,
      playoffWindow
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

    let chirp: string;
    if (!top) {
      chirp = 'Nobody left worth chirping about. Either the pool is empty or everyone is drafted.';
    } else if (top.adp_delta !== null && top.adp_delta >= 12) {
      chirp =
        `${top.name} is still sitting there at ${analysisResults.pick_number} and the room ` +
        `usually takes him at ${top.average_pick}. That is ${Math.round(top.adp_delta)} picks of ` +
        `free value. Take him before someone wakes up.`;
    } else if (top.fills_need) {
      chirp =
        `${top.name} fills the hole you actually have (${top.position}), and ` +
        `${top.team} plays ${top.playoff_games ?? '?'} games in your playoff window. ` +
        `Best available is a luxury; a full lineup is not.`;
    } else {
      chirp =
        `${top.name} is the pick. No bargain, no drama — just the best board-and-schedule ` +
        `combination left at ${analysisResults.pick_number}.`;
    }

    if (!analysisResults.draft_results_available) {
      chirp +=
        ' ⚠️ Yahoo returned no draft results, so this assumes nobody is off the board except ' +
        'the names you passed in `already_drafted`.';
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
      board_state: chirpEnhanced.draft_results_available
        ? `Yahoo draft results returned ${chirpEnhanced.players_off_board} players off the board`
        : 'Yahoo returned no draft results - board state is only what you passed in already_drafted',
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

  private resolvePlayoffWindow(settings: any): any {
    const leagueMeta = settings?.fantasy_content?.league?.[0] ?? {};
    const leagueSettings = settings?.fantasy_content?.league?.[1]?.settings?.[0] ?? {};

    const startDate: string | undefined = leagueMeta.start_date;
    const endWeek = Number(leagueMeta.end_week ?? leagueSettings.end_week ?? 0);
    const playoffStartWeek = Number(leagueSettings.playoff_start_week ?? 0);

    if (!startDate || !playoffStartWeek || !endWeek || playoffStartWeek > endWeek) {
      return { resolved: false, start: null, end: null, weeks: [] };
    }

    const week1Monday = NhlScheduleService.weekStart(startDate);
    const weeks: string[] = [];
    for (let week = playoffStartWeek; week <= endWeek; week++) {
      weeks.push(NhlScheduleService.addDays(week1Monday, (week - 1) * 7));
    }

    return {
      resolved: true,
      playoff_start_week: playoffStartWeek,
      end_week: endWeek,
      start: NhlScheduleService.addDays(week1Monday, (playoffStartWeek - 1) * 7),
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
