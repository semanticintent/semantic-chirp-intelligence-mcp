/**
 * 📋 Draft Kit Analysis — tiers, flags, and the schedule nobody else knows
 *
 * A conventional draft kit ranks players in the abstract: rankings, tiers,
 * projections, ADP, sleepers. ChirpIQX cannot produce half of that — there is
 * no public source of projections, draft-market consensus, line combinations
 * or injuries, and inventing them would be the same sin as the constants and
 * random numbers this codebase spent v3.2 removing.
 *
 * What it can do is the half that depends on facts: real production, real ages,
 * and the real schedule — including the weeks *your* league plays its playoffs,
 * which no published kit can know.
 *
 * So this tool works two ways, from one engine:
 *
 *   • no `rankings` given  — builds the board from last season's production
 *   • `rankings` pasted    — keeps that order as the baseline and annotates it
 *
 * The second mode is the useful one: bring a kit you trust for projections,
 * and let ChirpIQX overlay schedule and flags onto it.
 *
 * 🏛️ Rule 3 (Observable Anchoring): every figure names the season it came from,
 * and the response states plainly what a draft kit normally contains that this
 * one does not.
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
import { NHL_STATS, NhlStatsService, type NhlPlayer } from '../services/NhlStatsService.js';
import { ROSTER_STORE } from '../services/RosterStore.js';
import { LEAGUE_DATA } from '../services/LeagueDataService.js';

export interface DraftKitArgs {
  readonly playoff_start_week?: number;
  readonly playoff_end_week?: number;
  /** Paste a ranked list to annotate it instead of generating one. */
  readonly rankings?: string;
  readonly positions?: string[];
  readonly tier_size?: number;
  readonly max_per_position?: number;
  readonly chirp_intensity?: string;
  readonly personality_mode?: string;
}

interface KitPlayer {
  readonly rank: number;
  readonly player_id: string;
  readonly name: string;
  readonly team: string;
  readonly position: string;
  readonly age: number | null;
  readonly games_played: number;
  readonly points: number;
  readonly points_per_game: number;
  readonly playoff_games: number | null;
  readonly four_game_weeks: number | null;
  readonly flags: string[];
}

/** Positions a kit is organised by, in the order people draft them. */
const KIT_POSITIONS = ['C', 'LW', 'RW', 'D', 'G'];

/** NHL position codes map to the winger labels fantasy platforms use. */
const NHL_TO_FANTASY: Record<string, string> = { C: 'C', L: 'LW', R: 'RW', D: 'D', G: 'G' };

export class DraftKitAnalysis extends AnalysisTemplate {
  constructor() {
    super('draft_kit', 'draft_pick');
  }

  // ==========================================
  // Hook 1: Fetch
  // ==========================================

  protected async fetchData(args: DraftKitArgs): Promise<any> {
    await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load()]);
    return {};
  }

  // ==========================================
  // Hook 2: Prepare
  // ==========================================

  protected async prepareData(rawData: any, args: DraftKitArgs): Promise<FantasyData> {
    const window = this.resolvePlayoffWindow(args);

    // Two entry points, one engine.
    const pasted = String(args.rankings ?? '').trim();
    const source = pasted ? 'pasted rankings' : 'NHL production';

    const { players, unresolved } = pasted
      ? this.fromPastedRankings(pasted)
      : { players: this.fromProduction(), unresolved: [] as any[] };

    return { kitPlayers: players, unresolved, window, source } as any;
  }

  /**
   * Resolve a pasted ranked list, preserving its order.
   *
   * The list's own ordering is the baseline rank — that is the whole point of
   * the overlay mode. Someone else did the projection work; this adds what
   * they could not know.
   */
  private fromPastedRankings(text: string): { players: NhlPlayer[]; unresolved: any[] } {
    const report = ROSTER_STORE.parseRoster(text);

    const players = report.resolved
      .map(p => NHL_STATS.getById(p.player_id))
      .filter((p): p is NhlPlayer => p !== null);

    return { players, unresolved: [...report.unresolved, ...report.ambiguous] };
  }

  /** Build a board from last season's production when no list is given. */
  private fromProduction(): NhlPlayer[] {
    return NHL_STATS.getAll()
      .filter(p => (p.stats?.games_played ?? 0) > 0)
      .sort((a, b) => this.productionValue(b) - this.productionValue(a));
  }

  /** Skaters rank on points, goalies on wins — they are not comparable. */
  private productionValue(p: NhlPlayer): number {
    return p.position === 'G' ? (p.stats?.wins ?? 0) : (p.stats?.points ?? 0);
  }

  // ==========================================
  // Hook 3: Analyze
  // ==========================================

  protected async analyzeData(data: FantasyData, args: DraftKitArgs): Promise<any> {
    const d = data as any;
    const window = d.window;
    const tierSize = Math.max(3, args.tier_size ?? 6);
    const maxPerPosition = Math.max(5, args.max_per_position ?? 24);

    const wanted = (args.positions?.length ? args.positions : KIT_POSITIONS)
      .map(p => p.toUpperCase());

    const annotated: KitPlayer[] = d.kitPlayers.map((p: NhlPlayer, index: number) =>
      this.annotate(p, index + 1, window)
    );

    // Tiers are per position, because "when does C dry up" is the question a
    // draft kit exists to answer.
    const byPosition: Record<string, any> = {};
    for (const pos of wanted) {
      const group = annotated.filter(p => p.position === pos).slice(0, maxPerPosition);
      if (group.length === 0) continue;

      byPosition[pos] = {
        count: group.length,
        tiers: this.buildTiers(group, tierSize),
        // Where the position stops being replaceable.
        dries_up_after: group.length >= tierSize ? `tier ${Math.ceil(group.length / tierSize)}` : 'one tier'
      };
    }

    return {
      source: d.source,
      stats_season: NHL_STATS.getSeasons().stats,
      playoff_window: window,
      unresolved: d.unresolved,
      positions: byPosition,
      signals: {
        shooting_rebounds: this.shootingRebounds(annotated),
        decline_risk: this.declineRisk(annotated),
        playoff_schedule_winners: this.playoffWinners(annotated, window),
        category_specialists: this.categorySpecialists(annotated)
      },
      cheat_sheet: this.cheatSheet(byPosition),
      not_included: [
        'Projections for the coming season — ChirpIQX reports the last completed season, it does not forecast',
        'ADP or value-vs-market — there is no public source of draft-market consensus',
        'Line combinations and power-play units — the NHL does not publish them',
        'Injury status — no public feed',
        'Whether a player is available in your league — ownership is league-private'
      ]
    };
  }

  private annotate(p: NhlPlayer, rank: number, window: any): KitPlayer {
    const s = p.stats;
    const gp = s?.games_played ?? 0;
    const points = s?.points ?? 0;
    const profile = NHL_SCHEDULE.isAvailable() ? NHL_SCHEDULE.getTeamProfile(p.team) : null;

    const playoffGames = window?.resolved && NHL_SCHEDULE.isAvailable()
      ? NHL_SCHEDULE.countGamesInRange(p.team, window.start, window.end)
      : null;

    return {
      rank,
      player_id: p.player_id,
      name: p.name,
      team: p.team,
      position: NHL_TO_FANTASY[p.position] ?? p.position,
      age: NhlStatsService.ageOf(p),
      games_played: gp,
      points,
      points_per_game: gp > 0 ? Number((points / gp).toFixed(2)) : 0,
      playoff_games: playoffGames,
      four_game_weeks: profile?.weeks_with_4_plus ?? null,
      flags: this.flagsFor(p, playoffGames)
    };
  }

  /** Short, human-readable notes that survive being read at speed. */
  private flagsFor(p: NhlPlayer, playoffGames: number | null): string[] {
    const flags: string[] = [];
    const s = p.stats;
    const age = NhlStatsService.ageOf(p);
    const gp = s?.games_played ?? 0;
    if (!s || gp < 20) return flags;

    if (p.position !== 'G') {
      const shots = s.shots ?? 0;
      const shPct = shots > 0 ? ((s.goals ?? 0) / shots) * 100 : 0;

      if (age !== null && age <= 25 && shots >= 150 && shPct < 8) {
        flags.push(`shooting ${shPct.toFixed(1)}% on ${shots} shots — volume without conversion`);
      }
      if (age !== null && age >= 33 && (s.time_on_ice_per_game ?? 0) / 60 >= 19) {
        flags.push(`age ${age} on ${((s.time_on_ice_per_game ?? 0) / 60).toFixed(1)} min — usage may not hold`);
      }
      if ((s.penalty_minutes ?? 0) / gp >= 1.2) {
        flags.push(`${(( s.penalty_minutes ?? 0) / gp).toFixed(2)} PIM/gm`);
      }
      if ((s.shots ?? 0) / gp >= 3.2) {
        flags.push(`${((s.shots ?? 0) / gp).toFixed(1)} shots/gm`);
      }
    } else if ((s.save_percentage ?? 0) >= 0.915 && (s.wins ?? 0) < 28) {
      flags.push(`${(s.save_percentage ?? 0).toFixed(3)} SV% on only ${s.wins} wins — rate beats the record`);
    }

    if (playoffGames !== null && playoffGames >= 11) flags.push(`${playoffGames} playoff-window games`);
    if (playoffGames !== null && playoffGames <= 8) flags.push(`only ${playoffGames} playoff-window games`);

    return flags;
  }

  private buildTiers(group: KitPlayer[], tierSize: number): any[] {
    const tiers: any[] = [];
    for (let i = 0; i < group.length; i += tierSize) {
      const slice = group.slice(i, i + tierSize);
      tiers.push({
        tier: tiers.length + 1,
        players: slice.map(p => ({
          rank: p.rank,
          name: p.name,
          team: p.team,
          age: p.age,
          ppg: p.points_per_game,
          playoff_games: p.playoff_games,
          flags: p.flags
        }))
      });
    }
    return tiers;
  }

  // ==========================================
  // 🎯 Signals
  // ==========================================

  private shootingRebounds(players: KitPlayer[]): any[] {
    return players
      .filter(p => p.flags.some(f => f.includes('volume without conversion')))
      .slice(0, 8)
      .map(p => ({ name: p.name, team: p.team, position: p.position, age: p.age, note: p.flags[0] }));
  }

  private declineRisk(players: KitPlayer[]): any[] {
    return players
      .filter(p => p.flags.some(f => f.includes('usage may not hold')))
      .slice(0, 8)
      .map(p => ({ name: p.name, team: p.team, position: p.position, age: p.age, note: p.flags.find(f => f.includes('usage')) }));
  }

  private playoffWinners(players: KitPlayer[], window: any): any[] {
    if (!window?.resolved) return [];
    return players
      .filter(p => (p.playoff_games ?? 0) >= 11)
      .sort((a, b) => b.points_per_game - a.points_per_game)
      .slice(0, 10)
      .map(p => ({
        name: p.name, team: p.team, position: p.position,
        ppg: p.points_per_game, playoff_games: p.playoff_games
      }));
  }

  private categorySpecialists(players: KitPlayer[]): any {
    const pick = (needle: string, limit = 5) => players
      .filter(p => p.flags.some(f => f.includes(needle)))
      .slice(0, limit)
      .map(p => ({ name: p.name, team: p.team, position: p.position, note: p.flags.find(f => f.includes(needle)) }));

    return {
      penalty_minutes: pick('PIM/gm'),
      shot_volume: pick('shots/gm'),
      goalie_rate_over_record: pick('rate beats the record')
    };
  }

  /** The condensed board — the format people actually take to a draft. */
  private cheatSheet(byPosition: Record<string, any>): any {
    const sheet: Record<string, string[]> = {};
    for (const [pos, data] of Object.entries(byPosition)) {
      sheet[pos] = (data as any).tiers.map((t: any) =>
        `T${t.tier}: ` + t.players
          .map((p: any) => `${p.name}${p.playoff_games !== null ? ` (${p.playoff_games})` : ''}`)
          .join(', ')
      );
    }
    return {
      note: 'Numbers in brackets are games during your playoff window.',
      board: sheet
    };
  }

  // ==========================================
  // Hooks 4 & 5
  // ==========================================

  protected async generateChirp(
    analysisResults: any,
    semanticContract: SemanticChirpContract,
    data: FantasyData
  ): Promise<any> {
    const contract = this.mergeContractWithDefaults(semanticContract);
    const enhanced = ChirpIntelligence.enhance(this.toolName, analysisResults, contract);

    const winners = analysisResults.signals.playoff_schedule_winners;
    const rebounds = analysisResults.signals.shooting_rebounds;

    const parts: string[] = [];
    parts.push(
      analysisResults.source === 'pasted rankings'
        ? 'Working from your list — the order is theirs, the schedule and flags are mine.'
        : `Board built from ${analysisResults.stats_season} production.`
    );

    if (winners?.length) {
      parts.push(`${winners[0].name} is the best producer on an 11-game playoff club. That is your tiebreaker.`);
    }
    if (rebounds?.length) {
      parts.push(`${rebounds[0].name} is shooting well under his volume — that usually corrects.`);
    }
    if (!analysisResults.playoff_window?.resolved) {
      parts.push('Pass playoff_start_week and playoff_end_week and the schedule half of this becomes real.');
    }

    return {
      ...enhanced,
      chirp_intelligence: { ...enhanced.chirp_intelligence, analysis_chirp: parts.join(' ') }
    };
  }

  protected async formatResponse(chirpEnhanced: any, data: FantasyData): Promise<AnalysisResponse> {
    const recommendations: Recommendation[] =
      (chirpEnhanced.signals?.playoff_schedule_winners ?? []).slice(0, 5).map((p: any, i: number) => ({
        priority: i < 2 ? 'HIGH' : 'MEDIUM',
        action: 'target',
        reasoning: `${p.name} (${p.team} ${p.position}) — ${p.ppg} P/gm and ${p.playoff_games} games in your playoff window`
      })) as any;

    const analysisInsights: AnalysisInsights = {
      source: chirpEnhanced.source,
      stats_season: chirpEnhanced.stats_season,
      schedule_source: NHL_SCHEDULE.isAvailable()
        ? `NHL public API (season ${NHL_SCHEDULE.getSeason()})`
        : `UNAVAILABLE - ${NHL_SCHEDULE.getUnavailableReason()}`,
      playoff_window: chirpEnhanced.playoff_window,
      positions: chirpEnhanced.positions,
      signals: chirpEnhanced.signals,
      cheat_sheet: chirpEnhanced.cheat_sheet,
      not_included: chirpEnhanced.not_included,
      ...(chirpEnhanced.unresolved?.length ? { rankings_not_matched: chirpEnhanced.unresolved } : {})
    } as any;

    const metadata: AnalysisMetadata = {
      analysis_type: this.analysisType,
      timestamp: new Date().toISOString(),
      team_context: { team_name: 'Draft Kit' },
      semantic_contract_applied: true
    } as any;

    return {
      analysis_insights: analysisInsights,
      recommendations,
      chirp_intelligence: chirpEnhanced.chirp_intelligence,
      metadata
    };
  }

  /** Same anchoring as the other draft tools: week 1 is the NHL opener. */
  private resolvePlayoffWindow(args: DraftKitArgs): any {
    const startWeek = Number(args?.playoff_start_week ?? 0);
    const endWeek = Number(args?.playoff_end_week ?? 0);
    const seasonStart = NHL_SCHEDULE.getSeasonStartDate();

    if (!startWeek || !endWeek || startWeek > endWeek || !seasonStart) {
      return { resolved: false, start: null, end: null, weeks: [] };
    }

    const week1Monday = NhlScheduleService.weekStart(seasonStart);
    return {
      resolved: true,
      week_1_anchor: `${week1Monday} (NHL season opener)`,
      playoff_start_week: startWeek,
      end_week: endWeek,
      start: NhlScheduleService.addDays(week1Monday, (startWeek - 1) * 7),
      end: NhlScheduleService.addDays(week1Monday, endWeek * 7 - 1),
      weeks: Array.from({ length: endWeek - startWeek + 1 }, (_, i) =>
        NhlScheduleService.addDays(week1Monday, (startWeek - 1 + i) * 7))
    };
  }
}
