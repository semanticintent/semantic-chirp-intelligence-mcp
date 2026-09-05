/**
 * 🗓️ NHL Schedule Service
 *
 * The single source of real game-schedule truth for every analysis.
 *
 * Before this service existed, the schedule-aware tools estimated games with a
 * constant (`players * 3.5 * weeks`) or invented them with `Math.random()`.
 * Everything schedule-shaped now resolves through here, against the NHL's
 * public club-schedule endpoint:
 *
 *   https://api-web.nhle.com/v1/club-schedule-season/{TRICODE}/{SEASON}
 *
 * No API key, no auth, ~8s for all 32 clubs cold, then served from a
 * season-scoped disk cache.
 *
 * 🏛️ Rule 1 (Semantic Over Structural): callers ask domain questions
 * ("how many games in this window?"), not HTTP questions.
 * 🏛️ Rule 3 (Observable Anchoring): when the schedule cannot be loaded the
 * service reports `available: false`. It never substitutes an estimate for a
 * fact — an analysis that cannot see the schedule must say so.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import type { JsonCache } from './cache.js';
import { nhlFetch } from './nhl-fetch.js';
import { DiskJsonCache } from './cache-disk.js';
import { NHL_TRICODES, toNhlTricode, type NhlTricode } from '../domain/nhl-teams.js';

/** `<package root>/.nhl-schedule-cache` when this module has a file URL; a relative directory when bundled (Workers). */
function defaultCacheDir(): string {
  try { return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.nhl-schedule-cache'); }
  catch { return '.nhl-schedule-cache'; }
}

const NHL_API_BASE = 'https://api-web.nhle.com/v1';

/** Regular season. Preseason is gameType 1, playoffs 3 — neither counts for fantasy. */
const GAME_TYPE_REGULAR_SEASON = 2;

/** Cache lifetime. The schedule shifts rarely (postponements), so a day is plenty. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** A single scheduled game, reduced to what fantasy analysis actually needs. */
export interface ScheduledGame {
  readonly date: string;      // YYYY-MM-DD
  readonly opponent: NhlTricode;
  readonly home: boolean;
}

/** Per-club season profile used by draft and streaming analysis. */
export interface TeamScheduleProfile {
  readonly team: NhlTricode;
  readonly total_games: number;
  readonly weeks_with_4_plus: number;
  readonly weeks_with_2_or_fewer: number;
  readonly back_to_backs: number;
  readonly games_by_week: Record<string, number>; // Monday ISO date -> count
}

/** Defensive strength of an opponent, used to rate matchup difficulty. */
export interface TeamStrength {
  readonly team: NhlTricode;
  readonly goals_against_per_game: number;
  readonly point_pctg: number;
  /** 0 = easiest opponent to score on, 100 = hardest. */
  readonly difficulty: number;
}

interface CacheFile {
  readonly season: string;
  readonly fetched_at: number;
  readonly teams: Record<string, ScheduledGame[]>;
}

export class NhlScheduleService {
  private schedules: Map<NhlTricode, ScheduledGame[]> = new Map();
  private season: string | null = null;
  private loaded = false;
  private loadError: string | null = null;
  private inFlight: Promise<void> | null = null;
  private strengths: Map<NhlTricode, TeamStrength> = new Map();
  private strengthsInFlight: Promise<void> | null = null;
  private cache: JsonCache;

  /** Pass a directory (disk cache there), a JsonCache (KV, memory), or nothing for the package-root disk cache. */
  constructor(cache?: JsonCache | string) {
    this.cache = typeof cache === 'object' ? cache : new DiskJsonCache(cache ?? defaultCacheDir());
  }

  /** Swap the cache before load(): a Worker hands the singleton its KV binding. */
  public setCache(cache: JsonCache): void { this.cache = cache; }

  // ==========================================
  // 🎯 Season resolution
  // ==========================================

  /**
   * NHL season id for a date, e.g. 2026-09-01 -> "20262027".
   * The season rolls over in August: anything from August onward belongs to the
   * season that starts that calendar year.
   */
  public static seasonForDate(date: Date = new Date()): string {
    const year = date.getUTCFullYear();
    const startYear = date.getUTCMonth() >= 7 ? year : year - 1; // month 7 = August
    return `${startYear}${startYear + 1}`;
  }

  // ==========================================
  // 🎯 Loading
  // ==========================================

  /**
   * Load the full season schedule for all 32 clubs.
   * Safe to call repeatedly — concurrent callers share one in-flight load.
   */
  public async load(season?: string): Promise<void> {
    const target = season ?? NhlScheduleService.seasonForDate();

    if (this.loaded && this.season === target) return;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.performLoad(target).finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async performLoad(season: string): Promise<void> {
    this.season = season;
    this.loadError = null;

    const cached = await this.readCache(season);
    if (cached) {
      this.schedules = new Map(
        Object.entries(cached.teams) as [NhlTricode, ScheduledGame[]][]
      );
      this.loaded = true;
      return;
    }

    const results = await Promise.all(
      NHL_TRICODES.map(async (team) => ({
        team,
        games: await this.fetchTeamSeason(team, season)
      }))
    );

    const failed = results.filter(r => r.games === null).map(r => r.team);

    // A partial schedule produces silently wrong comparisons between two teams,
    // so treat any failure as a failed load rather than serving half the league.
    if (failed.length > 0) {
      this.loaded = false;
      this.loadError =
        `NHL schedule unavailable for ${failed.length} club(s): ${failed.join(', ')}`;
      return;
    }

    this.schedules = new Map(
      results.map(r => [r.team, r.games as ScheduledGame[]])
    );
    this.loaded = true;
    await this.writeCache(season);
  }

  private async fetchTeamSeason(
    team: NhlTricode,
    season: string
  ): Promise<ScheduledGame[] | null> {
    try {
      const response = await nhlFetch(
        `${NHL_API_BASE}/club-schedule-season/${team}/${season}`
      );
      if (!response.ok) return null;

      const payload = await response.json() as any;
      const games: any[] = payload?.games ?? [];

      return games
        .filter(g => g?.gameType === GAME_TYPE_REGULAR_SEASON && g?.gameDate)
        .map(g => {
          const homeAbbr = toNhlTricode(g?.homeTeam?.abbrev);
          const awayAbbr = toNhlTricode(g?.awayTeam?.abbrev);
          const isHome = homeAbbr === team;
          const opponent = isHome ? awayAbbr : homeAbbr;

          return opponent
            ? { date: g.gameDate as string, opponent, home: isHome }
            : null;
        })
        .filter((g): g is ScheduledGame => g !== null)
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return null;
    }
  }

  // ==========================================
  // 🎯 Availability — never fake a schedule
  // ==========================================

  /** Whether real schedule data is loaded and safe to reason from. */
  public isAvailable(): boolean {
    return this.loaded && this.schedules.size === NHL_TRICODES.length;
  }

  /** Human-readable reason the schedule is unavailable, if it is. */
  public getUnavailableReason(): string | null {
    if (this.isAvailable()) return null;
    return this.loadError ?? 'NHL schedule has not been loaded yet';
  }

  public getSeason(): string | null {
    return this.season;
  }

  // ==========================================
  // 🎯 Queries
  // ==========================================

  /** All regular-season games for a club, in date order. */
  public getTeamGames(abbr: string): ScheduledGame[] {
    const tricode = toNhlTricode(abbr);
    if (!tricode) return [];
    return this.schedules.get(tricode) ?? [];
  }

  /** Games for a club within an inclusive YYYY-MM-DD date range. */
  public getGamesInRange(abbr: string, start: string, end: string): ScheduledGame[] {
    return this.getTeamGames(abbr).filter(g => g.date >= start && g.date <= end);
  }

  /** Game count for a club within an inclusive date range. */
  public countGamesInRange(abbr: string, start: string, end: string): number {
    return this.getGamesInRange(abbr, start, end).length;
  }

  /** Whether a club plays on a given YYYY-MM-DD date. */
  public hasGameOn(abbr: string, date: string): boolean {
    return this.getTeamGames(abbr).some(g => g.date === date);
  }

  /** Count of back-to-back game pairs for a club in a range. */
  public countBackToBacks(abbr: string, start: string, end: string): number {
    const games = this.getGamesInRange(abbr, start, end);
    let count = 0;

    for (let i = 1; i < games.length; i++) {
      const previous = Date.parse(`${games[i - 1].date}T00:00:00Z`);
      const current = Date.parse(`${games[i].date}T00:00:00Z`);
      if (current - previous === 24 * 60 * 60 * 1000) count++;
    }

    return count;
  }

  /**
   * Games per fantasy week for a club, keyed by the Monday that starts the week.
   * Yahoo fantasy hockey weeks run Monday through Sunday.
   */
  public getGamesByWeek(abbr: string): Record<string, number> {
    const byWeek: Record<string, number> = {};

    for (const game of this.getTeamGames(abbr)) {
      const monday = NhlScheduleService.weekStart(game.date);
      byWeek[monday] = (byWeek[monday] ?? 0) + 1;
    }

    return byWeek;
  }

  /** Full season profile for one club. */
  public getTeamProfile(abbr: string): TeamScheduleProfile | null {
    const tricode = toNhlTricode(abbr);
    if (!tricode) return null;

    const games = this.getTeamGames(tricode);
    const byWeek = this.getGamesByWeek(tricode);
    const counts = Object.values(byWeek);
    const firstDate = games[0]?.date ?? '';
    const lastDate = games[games.length - 1]?.date ?? '';

    return {
      team: tricode,
      total_games: games.length,
      weeks_with_4_plus: counts.filter(c => c >= 4).length,
      weeks_with_2_or_fewer: counts.filter(c => c <= 2).length,
      back_to_backs: this.countBackToBacks(tricode, firstDate, lastDate),
      games_by_week: byWeek
    };
  }

  /**
   * Earliest regular-season game date across the league (YYYY-MM-DD).
   *
   * Used as the fantasy week-1 anchor when Yahoo's league `start_date` is
   * unavailable — fantasy hockey week 1 begins with the NHL season.
   */
  public getSeasonStartDate(): string | null {
    if (!this.isAvailable()) return null;

    let earliest: string | null = null;
    for (const games of this.schedules.values()) {
      const first = games[0]?.date;
      if (first && (earliest === null || first < earliest)) earliest = first;
    }

    return earliest;
  }

  /** Season profiles for all 32 clubs. */
  public getAllProfiles(): TeamScheduleProfile[] {
    return NHL_TRICODES
      .map(t => this.getTeamProfile(t))
      .filter((p): p is TeamScheduleProfile => p !== null);
  }

  /** The Monday (YYYY-MM-DD) that starts the fantasy week containing `date`. */
  public static weekStart(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    const dayOfWeek = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - dayOfWeek);
    return d.toISOString().split('T')[0];
  }

  /** Add `days` to a YYYY-MM-DD date, returning YYYY-MM-DD. */
  public static addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
  }

  /** Today as YYYY-MM-DD (UTC). */
  public static today(): string {
    return new Date().toISOString().split('T')[0];
  }

  // ==========================================
  // 🎯 Opponent strength
  // ==========================================

  /**
   * Load league-wide defensive strength from the NHL standings.
   *
   * Matchup difficulty used to be `Math.random() * 100`. This anchors it to
   * goals allowed per game, ranked across the league. During the offseason the
   * endpoint returns the last completed season, which is the right baseline for
   * draft-time analysis anyway.
   */
  public async loadStandings(): Promise<void> {
    if (this.strengths.size > 0) return;
    if (this.strengthsInFlight) return this.strengthsInFlight;

    this.strengthsInFlight = this.performStandingsLoad().finally(() => {
      this.strengthsInFlight = null;
    });

    return this.strengthsInFlight;
  }

  private async performStandingsLoad(): Promise<void> {
    try {
      const response = await nhlFetch(`${NHL_API_BASE}/standings/now`);
      if (!response.ok) return;

      const payload = await response.json() as any;
      const rows: any[] = payload?.standings ?? [];

      const parsed = rows
        .map(row => {
          const tricode = toNhlTricode(row?.teamAbbrev?.default ?? row?.teamAbbrev);
          const gamesPlayed = Number(row?.gamesPlayed ?? 0);
          if (!tricode || gamesPlayed <= 0) return null;

          return {
            team: tricode,
            gaPerGame: Number(row?.goalAgainst ?? 0) / gamesPlayed,
            pointPctg: Number(row?.pointPctg ?? 0)
          };
        })
        .filter((r): r is { team: NhlTricode; gaPerGame: number; pointPctg: number } => r !== null);

      if (parsed.length === 0) return;

      // Rank by goals allowed: the stingiest defence is the hardest matchup.
      const ranked = [...parsed].sort((a, b) => a.gaPerGame - b.gaPerGame);
      const lastIndex = Math.max(1, ranked.length - 1);

      ranked.forEach((row, index) => {
        this.strengths.set(row.team, {
          team: row.team,
          goals_against_per_game: Number(row.gaPerGame.toFixed(3)),
          point_pctg: row.pointPctg,
          difficulty: Math.round(100 - (index / lastIndex) * 100)
        });
      });
    } catch (error) {
      console.error('[DEBUG] Could not load NHL standings:', error);
    }
  }

  /** Whether opponent-strength data is loaded. */
  public hasStandings(): boolean {
    return this.strengths.size > 0;
  }

  /** Defensive profile for a club, or null when standings are unavailable. */
  public getTeamStrength(abbr: string): TeamStrength | null {
    const tricode = toNhlTricode(abbr);
    if (!tricode) return null;
    return this.strengths.get(tricode) ?? null;
  }

  // ==========================================
  // 🎯 Cache
  // ==========================================

  private async readCache(season: string): Promise<CacheFile | null> {
    const parsed = await this.cache.get<CacheFile>(season);
    if (!parsed) return null;
    if (Date.now() - parsed.fetched_at > CACHE_TTL_MS) return null;
    if (Object.keys(parsed.teams ?? {}).length !== NHL_TRICODES.length) return null;
    return parsed;
  }

  private async writeCache(season: string): Promise<void> {
    const payload: CacheFile = {
      season,
      fetched_at: Date.now(),
      teams: Object.fromEntries(this.schedules)
    };
    await this.cache.set(season, payload);
  }

}

/** Shared instance — one schedule load serves every analysis in the process. */
export const NHL_SCHEDULE = new NhlScheduleService();
