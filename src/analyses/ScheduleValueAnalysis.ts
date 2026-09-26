/**
 * 🗓️ Schedule Value Analysis — the draft tiebreaker
 *
 * Rates all 32 NHL clubs on what their schedule is actually worth to a fantasy
 * roster: total games, how many weeks give you a 4-game slate, how many
 * strand you on two, and — the part no generic site can do — how many games
 * they play during *your league's* playoff weeks.
 *
 * A public schedule grid has to guess when your playoffs are. This takes
 * `playoff_start_week` and `playoff_end_week` from you, so the window it
 * scores is the one you actually play.
 *
 * Semantic Identity: Schedule Value Rater
 * Intent: I tell you which clubs' schedules are worth a draft pick
 * Chirp Style: strategic_advantage
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
import { NHL_TRICODES, toNhlTricode, type NhlTricode } from '../domain/nhl-teams.js';

export interface ScheduleValueArgs {
  readonly teams?: string[];
  readonly playoff_start_week?: number;
  readonly playoff_end_week?: number;
  readonly top_n?: number;
  readonly chirp_intensity?: string;
  readonly personality_mode?: string;
}

export interface TeamScheduleValue {
  readonly team: NhlTricode;
  readonly total_games: number;
  readonly weeks_with_4_plus: number;
  readonly weeks_with_2_or_fewer: number;
  readonly back_to_backs: number;
  readonly playoff_games: number;
  readonly playoff_weeks: string[];
  readonly value_score: number;   // 0-100
  readonly verdict: string;
  /** What the verdict means for a close draft decision: lean towards, lean away, or no lean. */
  readonly stance: 'favour' | 'avoid' | 'neutral';
}

/** Yahoo fantasy weeks run Monday to Sunday. */
const DAYS_PER_WEEK = 7;

export class ScheduleValueAnalysis extends AnalysisTemplate {
  constructor() {
    super('schedule_value', 'schedule_advantage');
  }

  /**
   * Hook 1: the NHL schedule, plus the league settings that say when this
   * league's playoffs actually are.
   */
  protected async fetchData(args: ScheduleValueArgs): Promise<any> {
    await NHL_SCHEDULE.load();
    return { settings: null };

  }

  protected async prepareData(rawData: any, args: ScheduleValueArgs): Promise<FantasyData> {
    const window = this.resolvePlayoffWindow(rawData.settings, args);

    return {
      playoffWindow: window,
      leagueSettings: rawData.settings
    } as any;
  }

  /**
   * Hook 3: score every requested club.
   */
  protected async analyzeData(data: FantasyData, args: ScheduleValueArgs): Promise<any> {
    if (!NHL_SCHEDULE.isAvailable()) {
      return {
        schedule_available: false,
        schedule_note: NHL_SCHEDULE.getUnavailableReason(),
        teams: []
      };
    }

    const dataAny = data as any;
    const window = dataAny.playoffWindow;

    const requested = args.teams?.length
      ? args.teams
          .map(t => toNhlTricode(t))
          .filter((t): t is NhlTricode => t !== null)
      : [...NHL_TRICODES];

    const rated = requested
      .map(team => this.rateTeam(team, window))
      .filter((t): t is TeamScheduleValue => t !== null)
      .sort((a, b) => b.value_score - a.value_score);

    return {
      schedule_available: true,
      season: NHL_SCHEDULE.getSeason(),
      playoff_window: window,
      teams: rated
    };
  }

  protected async generateChirp(
    analysisResults: any,
    semanticContract: SemanticChirpContract,
    data: FantasyData
  ): Promise<any> {
    const contract = this.mergeContractWithDefaults(semanticContract);

    if (!analysisResults.schedule_available) {
      return {
        ...analysisResults,
        chirp_intelligence: {
          chirp: `No schedule, no verdict. ${analysisResults.schedule_note}`,
          intent_summary: 'Schedule unavailable - nothing rated'
        }
      };
    }

    const best = analysisResults.teams[0];
    const worst = analysisResults.teams[analysisResults.teams.length - 1];

    const windowResolved = analysisResults.playoff_window?.resolved === true;

    let chirp: string;
    if (!best || !worst) {
      chirp = 'Nothing to rate.';
    } else if (windowResolved) {
      chirp =
        `${best.team} is the schedule you want (${best.playoff_games} games in your playoff window, ` +
        `${best.weeks_with_4_plus} four-game weeks). ${worst.team} is the one you draft around ` +
        `(${worst.playoff_games} playoff-window games, ${worst.weeks_with_2_or_fewer} weeks stuck on two or fewer). ` +
        `Same player, different sweater, different season.`;
    } else {
      chirp =
        `On regular season alone, ${best.team} gives you the most playable weeks ` +
        `(${best.weeks_with_4_plus} four-game weeks) and ${worst.team} the fewest ` +
        `(${worst.weeks_with_2_or_fewer} weeks stuck on two or fewer). ` +
        `I could not read your playoff weeks, and that is the half that decides titles — ` +
        `pass playoff_start_week and playoff_end_week and ask again.`;
    }

    const enhanced = ChirpIntelligence.enhance(this.toolName, analysisResults, contract);

    return {
      ...enhanced,
      chirp_intelligence: {
        ...enhanced.chirp_intelligence,
        // The schedule verdict is the point of this tool, so it leads the chirp.
        analysis_chirp: chirp
      }
    };
  }

  protected async formatResponse(chirpEnhanced: any, data: FantasyData): Promise<AnalysisResponse> {
    const teams: TeamScheduleValue[] = chirpEnhanced.teams ?? [];
    // Best and worst are drawn from opposite ends without overlap, however few clubs were asked about — with three
    // clubs, the same three used to appear in both lists.
    const bestCount = Math.min(8, Math.ceil(teams.length / 2));
    const topN = teams.slice(0, bestCount);
    const bottom = teams.slice(bestCount).slice(-5);

    // A recommendation follows the club's own verdict, not its place in the list: a club whose verdict says "break the
    // tie the other way" used to be recommended as a HIGH-priority target because it happened to sort near the top.
    const describe = (t: TeamScheduleValue) =>
      `${t.team}: ${t.playoff_games} games in your playoff window, ${t.weeks_with_4_plus} four-game weeks, ` +
      `${t.total_games} total. ${t.verdict}`;
    const favoured = teams.filter(t => t.stance === 'favour');
    const avoided = teams.filter(t => t.stance === 'avoid');
    const recommendations: Recommendation[] = [
      ...favoured.slice(0, 8).map((t, i) => ({ priority: i < 3 ? 'HIGH' : 'MEDIUM', action: 'target', reasoning: describe(t) })),
      ...avoided.slice(-5).map(t => ({ priority: 'LOW', action: 'fade', reasoning: describe(t) })),
    ] as any;

    const analysisInsights: AnalysisInsights = {
      schedule_source: chirpEnhanced.schedule_available
        ? `NHL public API (season ${chirpEnhanced.season})`
        : `UNAVAILABLE - ${chirpEnhanced.schedule_note}`,
      playoff_window: chirpEnhanced.playoff_window,
      best_schedules: topN.map(t => ({
        team: t.team,
        value_score: t.value_score,
        playoff_games: t.playoff_games,
        four_game_weeks: t.weeks_with_4_plus
      })),
      worst_schedules: bottom.map(t => ({
        team: t.team,
        value_score: t.value_score,
        playoff_games: t.playoff_games,
        light_weeks: t.weeks_with_2_or_fewer
      })),
      all_teams: teams
    } as any;

    const metadata: AnalysisMetadata = {
      analysis_type: this.analysisType,
      timestamp: new Date().toISOString(),
      team_context: { team_name: 'Schedule Value' },
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

  private rateTeam(team: NhlTricode, window: any): TeamScheduleValue | null {
    const profile = NHL_SCHEDULE.getTeamProfile(team);
    if (!profile) return null;

    const playoffGames = window?.start && window?.end
      ? NHL_SCHEDULE.countGamesInRange(team, window.start, window.end)
      : 0;

    const playoffWeeks = window?.weeks ?? [];

    return {
      team,
      total_games: profile.total_games,
      weeks_with_4_plus: profile.weeks_with_4_plus,
      weeks_with_2_or_fewer: profile.weeks_with_2_or_fewer,
      back_to_backs: profile.back_to_backs,
      playoff_games: playoffGames,
      playoff_weeks: playoffWeeks,
      value_score: this.scoreTeam(profile, playoffGames, playoffWeeks.length),
      verdict: this.verdictFor(profile, playoffGames, playoffWeeks.length),
      stance: this.stanceFor(profile, playoffGames, playoffWeeks.length)
    };
  }

  /**
   * Composite 0-100 value.
   *
   * Weighted toward the playoff window, because a schedule edge in March is
   * worth more than the same edge in November — you only need to win the weeks
   * that eliminate people.
   */
  private scoreTeam(profile: any, playoffGames: number, playoffWeekCount: number): number {
    // Playoff-window games per week, normalized against a 4-game week ceiling.
    // With no resolved window this component is neutral, not zero — an
    // unresolved window is missing information, not a bad schedule.
    const playoffRate = playoffWeekCount > 0
      ? Math.min(1, (playoffGames / playoffWeekCount) / 4)
      : 0.5;

    // Heavy weeks are streaming and stacking opportunities.
    const heavyWeekRate = Math.min(1, profile.weeks_with_4_plus / 12);

    // Light weeks are dead roster spots.
    const lightWeekPenalty = Math.min(1, profile.weeks_with_2_or_fewer / 8);

    const score =
      (0.50 * playoffRate) +
      (0.35 * heavyWeekRate) -
      (0.15 * lightWeekPenalty);

    return Math.round(Math.max(0, Math.min(1, score + 0.15)) * 100);
  }

  /** The same thresholds as verdictFor, as a direction a recommendation can follow. */
  private stanceFor(profile: any, playoffGames: number, playoffWeekCount: number): 'favour' | 'avoid' | 'neutral' {
    if (playoffWeekCount === 0) {
      if (profile.weeks_with_4_plus >= 9) return 'favour';
      if (profile.weeks_with_2_or_fewer >= 6) return 'avoid';
      return 'neutral';
    }
    const perWeek = playoffGames / playoffWeekCount;
    if (perWeek >= 3.6 || profile.weeks_with_4_plus >= 9) return 'favour';
    if (perWeek <= 2.8) return 'avoid';
    return 'neutral';
  }

  private verdictFor(profile: any, playoffGames: number, playoffWeekCount: number): string {
    if (playoffWeekCount === 0) {
      // No playoff window resolved - judge only what is actually known.
      if (profile.weeks_with_4_plus >= 9) {
        return 'Streaming-friendly regular season. Playoff window not resolved.';
      }
      if (profile.weeks_with_2_or_fewer >= 6) {
        return 'Lots of light weeks. Playoff window not resolved.';
      }
      return 'Ordinary regular-season schedule. Playoff window not resolved.';
    }

    const perWeek = playoffGames / playoffWeekCount;

    if (perWeek >= 3.6 && profile.weeks_with_4_plus >= 8) {
      return 'Draft tiebreaker in your favour - heavy all year and heavy when it counts.';
    }
    if (perWeek >= 3.6) {
      return 'Playoff-window asset. Take the tiebreaker here.';
    }
    if (profile.weeks_with_4_plus >= 9) {
      return 'Streaming-friendly regular season, ordinary playoff window.';
    }
    if (perWeek <= 2.8) {
      return 'Light exactly when you need games. Break the tie the other way.';
    }
    return 'Neutral schedule - decide on talent, not games.';
  }

  // ==========================================
  // 🎯 League playoff window
  // ==========================================

  /**
   * Resolve the league's fantasy playoff weeks to real calendar dates.
   *
   * Yahoo gives `start_date` for week 1 and `playoff_start_week` as an index.
   * Fantasy weeks run Monday to Sunday, so week N starts at week 1's Monday
   * plus (N-1) weeks. Explicit args win over league settings, and both win
   * over the fallback.
   */
  private resolvePlayoffWindow(settings: any, args: ScheduleValueArgs): any {
    const leagueMeta = settings?.fantasy_content?.league?.[0] ?? {};
    const leagueSettings = settings?.fantasy_content?.league?.[1]?.settings?.[0] ?? {};

    // Yahoo's league start_date is the ideal week-1 anchor. When it is
    // unavailable, the NHL season's own first game is the correct fallback:
    // fantasy week 1 begins with the season. Without one of the two, an
    // explicit playoff_start_week would be an index into nothing.
    const startDate: string | undefined =
      leagueMeta.start_date ?? NHL_SCHEDULE.getSeasonStartDate() ?? undefined;
    const anchorSource = leagueMeta.start_date ? 'Yahoo league start_date' : 'NHL season opener';

    const endWeek = Number(
      args.playoff_end_week ?? leagueMeta.end_week ?? leagueSettings.end_week ?? 0
    );
    const playoffStartWeek = Number(
      args.playoff_start_week ?? leagueSettings.playoff_start_week ?? 0
    );

    if (!startDate || !playoffStartWeek || !endWeek || playoffStartWeek > endWeek) {
      return {
        resolved: false,
        note:
          'No playoff window resolved. Pass playoff_start_week and playoff_end_week ' +
          '(your league settings list them; week 1 opens with the NHL season and, when that is mid-week, runs to the second Sunday, as Yahoo counts it) to score your real playoff window; clubs are rated on their ' +
          'regular-season schedule only until then.',
        start: null,
        end: null,
        weeks: []
      };
    }

    const window = NhlScheduleService.fantasyWindow(startDate, playoffStartWeek, endWeek);
    return {
      resolved: true,
      source: 'explicit argument',
      week_1_anchor: anchorSource === 'NHL season opener' ? window.week_1_anchor : `${startDate} (${anchorSource})`,
      playoff_start_week: playoffStartWeek,
      end_week: endWeek,
      start: window.start,
      end: window.end,
      weeks: window.weeks
    };
  }
}
