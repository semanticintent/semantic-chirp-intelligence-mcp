/**
 * 📊 NHL Stats Service — player identity and statistics, no account required
 *
 * The counterpart to NhlScheduleService. Together they replace every external
 * data source this server used to need:
 *
 *   • who exists, and which club they play for  → club rosters
 *   • what they have actually produced          → club season stats
 *
 * Both come from the NHL's public API: no key, no OAuth, no approval, no
 * per-user account binding. That is the whole point of v4 — the intelligence
 * layer works for anyone, on any fantasy platform, or none at all.
 *
 * 🏛️ Rule 1 (Semantic Over Structural): callers ask for a player by the name a
 * human would type, not by a provider's internal id.
 * 🏛️ Rule 3 (Observable Anchoring): a name that cannot be resolved is reported
 * as unresolved. It is never silently matched to the nearest guess.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import type { JsonCache } from './cache.js';
import { nhlFetch } from './nhl-fetch.js';
import { DiskJsonCache } from './cache-disk.js';
import { NHL_TRICODES, type NhlTricode } from '../domain/nhl-teams.js';

function defaultCacheDir(): string {
  try { return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.nhl-schedule-cache'); }
  catch { return '.nhl-schedule-cache'; }
}

const NHL_API_BASE = 'https://api-web.nhle.com/v1';
const GAME_TYPE_REGULAR_SEASON = 2;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Bump whenever the cached player shape changes.
 *
 * The cache is keyed by season, so adding a field to NhlPlayer would otherwise
 * keep serving records without it until the TTL expired — silently, and looking
 * exactly like the field is unavailable from the NHL. Including the version in
 * the filename makes a shape change invalidate the cache immediately.
 */
const CACHE_SCHEMA_VERSION = 3; // 3: sweater_number

/** A player as the NHL knows them, with their most recent full-season line. */
export interface NhlPlayer {
  readonly player_id: string;
  readonly name: string;
  readonly team: NhlTricode;
  readonly position: string;        // C, L, R, D, G
  /** ISO date, as published by the NHL. */
  readonly birth_date?: string;
  /** Jersey number, as published on the club roster. */
  readonly sweater_number?: number;
  readonly stats?: PlayerStats;
}

/** Season totals, normalized to the categories fantasy leagues actually score. */
export interface PlayerStats {
  readonly games_played: number;
  readonly goals?: number;
  readonly assists?: number;
  readonly points?: number;
  readonly plus_minus?: number;
  readonly penalty_minutes?: number;
  readonly shots?: number;
  readonly power_play_goals?: number;
  readonly short_handed_goals?: number;
  readonly game_winning_goals?: number;
  readonly time_on_ice_per_game?: number;   // seconds
  // Goalies
  readonly wins?: number;
  readonly losses?: number;
  readonly goals_against_average?: number;
  readonly save_percentage?: number;
  readonly shutouts?: number;
  readonly saves?: number;
}

/** Outcome of resolving a human-typed name. */
export interface Resolution {
  readonly input: string;
  readonly player: NhlPlayer | null;
  readonly ambiguous?: NhlPlayer[];
  readonly reason?: string;
}

interface CacheFile {
  readonly roster_season: string;
  readonly stats_season: string;
  readonly fetched_at: number;
  readonly players: NhlPlayer[];
}

export class NhlStatsService {
  private byId: Map<string, NhlPlayer> = new Map();
  private byNameKey: Map<string, NhlPlayer[]> = new Map();
  private byLastName: Map<string, NhlPlayer[]> = new Map();
  private rosterSeason: string | null = null;
  private statsSeason: string | null = null;
  private loaded = false;
  private loadError: string | null = null;
  private inFlight: Promise<void> | null = null;
  private cache: JsonCache;
  /** Why a club could not be fetched, by tricode — so 'unavailable' says what actually happened. */
  private readonly failures = new Map<string, string>();

  /** Pass a directory (disk cache there), a JsonCache (KV, memory), or nothing for the package-root disk cache. */
  constructor(cache?: JsonCache | string) {
    this.cache = typeof cache === 'object' ? cache : new DiskJsonCache(cache ?? defaultCacheDir());
  }

  /** Swap the cache before load(): a Worker hands the singleton its KV binding. */
  public setCache(cache: JsonCache): void { this.cache = cache; }

  // ==========================================
  // 🎯 Loading
  // ==========================================

  /**
   * Load every club's roster and season statistics.
   *
   * @param rosterSeason which season's rosters define current club membership
   * @param statsSeason  which season's numbers to attach. Defaults to the
   *                     previous season, because before opening night the
   *                     current season has no statistics at all — and a draft
   *                     is exactly when you need last season's line.
   */
  public async load(rosterSeason?: string, statsSeason?: string): Promise<void> {
    const roster = rosterSeason ?? NhlStatsService.currentSeason();
    const stats = statsSeason ?? NhlStatsService.previousSeason(roster);

    if (this.loaded && this.rosterSeason === roster && this.statsSeason === stats) return;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.performLoad(roster, stats).finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async performLoad(rosterSeason: string, statsSeason: string): Promise<void> {
    this.rosterSeason = rosterSeason;
    this.statsSeason = statsSeason;
    this.loadError = null;

    const cached = await this.readCache(rosterSeason, statsSeason);
    if (cached) {
      this.index(cached.players);
      this.loaded = true;
      return;
    }

    const results = await Promise.all(
      NHL_TRICODES.map(team => this.fetchClub(team, rosterSeason, statsSeason))
    );

    const failed = NHL_TRICODES.filter((_, i) => results[i] === null);

    // A partial league makes "best available player" quietly wrong, so a
    // partial load is treated as no load at all.
    if (failed.length > 0) {
      this.loaded = false;
      const why = failed.map((t) => `${t}: ${this.failures.get(t) ?? 'no response'}`).join('; ');
      this.loadError = `NHL player data unavailable for ${failed.length} club(s): ${failed.join(', ')} (${why})`;
      return;
    }

    const players = results.flat() as NhlPlayer[];
    this.index(players);
    this.loaded = true;
    await this.writeCache(rosterSeason, statsSeason, players);
  }

  private async fetchClub(
    team: NhlTricode,
    rosterSeason: string,
    statsSeason: string
  ): Promise<NhlPlayer[] | null> {
    try {
      const [rosterRes, statsRes] = await Promise.all([
        nhlFetch(`${NHL_API_BASE}/roster/${team}/${rosterSeason}`),
        nhlFetch(`${NHL_API_BASE}/club-stats/${team}/${statsSeason}/${GAME_TYPE_REGULAR_SEASON}`)
      ]);

      if (!rosterRes.ok) { this.failures.set(team, `HTTP ${rosterRes.status}`); return null; }

      const rosterData = await rosterRes.json() as any;
      // Stats are best-effort: a club with no published line still has players.
      const statsData = statsRes.ok ? await statsRes.json() as any : { skaters: [], goalies: [] };

      const statsById = new Map<string, PlayerStats>();
      for (const s of statsData.skaters ?? []) {
        statsById.set(String(s.playerId), this.skaterStats(s));
      }
      for (const g of statsData.goalies ?? []) {
        statsById.set(String(g.playerId), this.goalieStats(g));
      }

      const players: NhlPlayer[] = [];
      for (const group of ['forwards', 'defensemen', 'goalies'] as const) {
        for (const p of rosterData[group] ?? []) {
          const id = String(p.id);
          players.push({
            player_id: id,
            name: `${p.firstName?.default ?? ''} ${p.lastName?.default ?? ''}`.trim(),
            team,
            position: p.positionCode ?? (group === 'goalies' ? 'G' : '?'),
            birth_date: p.birthDate,
            sweater_number: Number.isInteger(p.sweaterNumber) ? Number(p.sweaterNumber) : undefined,
            stats: statsById.get(id)
          });
        }
      }

      return players;
    } catch (error) {
      this.failures.set(team, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private skaterStats(s: any): PlayerStats {
    return {
      games_played: Number(s.gamesPlayed ?? 0),
      goals: Number(s.goals ?? 0),
      assists: Number(s.assists ?? 0),
      points: Number(s.points ?? 0),
      plus_minus: Number(s.plusMinus ?? 0),
      penalty_minutes: Number(s.penaltyMinutes ?? 0),
      shots: Number(s.shots ?? 0),
      power_play_goals: Number(s.powerPlayGoals ?? 0),
      short_handed_goals: Number(s.shorthandedGoals ?? 0),
      game_winning_goals: Number(s.gameWinningGoals ?? 0),
      time_on_ice_per_game: Number(s.avgTimeOnIcePerGame ?? 0)
    };
  }

  private goalieStats(g: any): PlayerStats {
    return {
      games_played: Number(g.gamesPlayed ?? 0),
      wins: Number(g.wins ?? 0),
      losses: Number(g.losses ?? 0),
      goals_against_average: Number(g.goalsAgainstAverage ?? 0),
      // The NHL feed spells this savePercentage; it can be null for low samples.
      save_percentage: g.savePercentage === null || g.savePercentage === undefined
        ? undefined
        : Number(g.savePercentage),
      shutouts: Number(g.shutouts ?? 0),
      saves: Number(g.saves ?? 0),
      goals_against: Number(g.goalsAgainst ?? 0)
    } as PlayerStats;
  }

  // ==========================================
  // 🎯 Indexing and resolution
  // ==========================================

  private index(players: NhlPlayer[]): void {
    this.byId = new Map();
    this.byNameKey = new Map();
    this.byLastName = new Map();

    for (const p of players) {
      this.byId.set(p.player_id, p);

      const key = NhlStatsService.nameKey(p.name);
      const bucket = this.byNameKey.get(key) ?? [];
      bucket.push(p);
      this.byNameKey.set(key, bucket);

      const last = NhlStatsService.nameKey(p.name.split(/\s+/).slice(-1)[0]);
      const lastBucket = this.byLastName.get(last) ?? [];
      lastBucket.push(p);
      this.byLastName.set(last, lastBucket);
    }
  }

  /**
   * Normalize a name for matching: lower-cased, accents folded, punctuation and
   * spacing removed. Handles "Stützle" vs "Stutzle" and "J.T. Miller" vs
   * "JT Miller", both of which people type either way.
   */
  public static nameKey(name: string): string {
    return String(name)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /**
   * Resolve a human-typed name to a player.
   *
   * Accepts "Auston Matthews", "auston matthews", "MATTHEWS, Auston" and
   * "Matthews". A bare surname resolves only when exactly one player carries
   * it; otherwise the candidates are returned so the caller can ask rather
   * than guess.
   */
  public resolve(input: string): Resolution {
    const raw = String(input ?? '').trim();
    if (!raw) return { input: raw, player: null, reason: 'empty' };

    // "Lastname, Firstname" -> "Firstname Lastname"
    const normalized = raw.includes(',')
      ? raw.split(',').map(s => s.trim()).reverse().join(' ')
      : raw;

    const exact = this.byNameKey.get(NhlStatsService.nameKey(normalized));
    if (exact?.length === 1) return { input: raw, player: exact[0] };
    if (exact && exact.length > 1) {
      return { input: raw, player: null, ambiguous: exact, reason: 'multiple players share this name' };
    }

    // Surname only
    const surnameBucket = this.byLastName.get(NhlStatsService.nameKey(normalized));
    if (surnameBucket?.length === 1) return { input: raw, player: surnameBucket[0] };
    if (surnameBucket && surnameBucket.length > 1) {
      return { input: raw, player: null, ambiguous: surnameBucket, reason: 'surname matches several players' };
    }

    return { input: raw, player: null, reason: 'no NHL player found with that name' };
  }

  // ==========================================
  // 🎯 Queries
  // ==========================================

  public isAvailable(): boolean {
    return this.loaded && this.byId.size > 0;
  }

  public getUnavailableReason(): string | null {
    if (this.isAvailable()) return null;
    return this.loadError ?? 'NHL player data has not been loaded yet';
  }

  public getById(playerId: string): NhlPlayer | null {
    return this.byId.get(String(playerId)) ?? null;
  }

  public getAll(): NhlPlayer[] {
    return [...this.byId.values()];
  }

  public getByTeam(team: string): NhlPlayer[] {
    return this.getAll().filter(p => p.team === team);
  }

  /**
   * Age in years at a given date, or null when the birth date is unknown.
   *
   * Age drives the breakout and decline signals a draft kit needs, and the NHL
   * publishes it on the roster endpoint, so there is no reason to estimate it.
   */
  public static ageOf(player: NhlPlayer, asOf: Date = new Date()): number | null {
    if (!player.birth_date) return null;

    const born = Date.parse(`${player.birth_date}T00:00:00Z`);
    if (!Number.isFinite(born)) return null;

    const years = (asOf.getTime() - born) / (365.2425 * 24 * 60 * 60 * 1000);
    return Number(years.toFixed(1));
  }

  public getPlayerCount(): number {
    return this.byId.size;
  }

  public getSeasons(): { roster: string | null; stats: string | null } {
    return { roster: this.rosterSeason, stats: this.statsSeason };
  }

  // ==========================================
  // 🎯 Seasons
  // ==========================================

  /** Season id for today, rolling over in August. */
  public static currentSeason(date: Date = new Date()): string {
    const year = date.getUTCFullYear();
    const start = date.getUTCMonth() >= 7 ? year : year - 1;
    return `${start}${start + 1}`;
  }

  /** The season before the given one, e.g. 20262027 -> 20252026. */
  public static previousSeason(season: string): string {
    const start = Number(season.slice(0, 4)) - 1;
    return `${start}${start + 1}`;
  }

  // ==========================================
  // 🎯 Cache
  // ==========================================

  private cacheKey(rosterSeason: string, statsSeason: string): string {
    return `players-v${CACHE_SCHEMA_VERSION}-${rosterSeason}-${statsSeason}`;
  }

  private async readCache(rosterSeason: string, statsSeason: string): Promise<CacheFile | null> {
    const parsed = await this.cache.get<CacheFile>(this.cacheKey(rosterSeason, statsSeason));
    if (!parsed) return null;
    if (Date.now() - parsed.fetched_at > CACHE_TTL_MS) return null;
    if (!Array.isArray(parsed.players) || parsed.players.length === 0) return null;
    return parsed;
  }

  private async writeCache(rosterSeason: string, statsSeason: string, players: NhlPlayer[]): Promise<void> {
    const payload: CacheFile = {
      roster_season: rosterSeason,
      stats_season: statsSeason,
      fetched_at: Date.now(),
      players
    };
    await this.cache.set(this.cacheKey(rosterSeason, statsSeason), payload);
  }

}

/** Shared instance — one player index serves every analysis in the process. */
export const NHL_STATS = new NhlStatsService();
