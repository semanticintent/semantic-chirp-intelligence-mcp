/**
 * 📋 Roster Store — league state without a league account
 *
 * v4 gets roster, opponent and standings from what the user pastes, rather than
 * from a platform API. That removes the account binding entirely: the same
 * server works for a Yahoo league, an ESPN league, Sleeper, or a spreadsheet.
 *
 * Pasted text is messy by nature, so parsing is deliberately forgiving about
 * format and deliberately strict about identity:
 *
 *   🏛️ Rule 3 (Observable Anchoring): a name that does not resolve to exactly
 *   one NHL player is reported back as unresolved or ambiguous. It is never
 *   guessed. A roster silently containing the wrong player is worse than a
 *   roster that tells you it could not read line 7.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NHL_STATS, type NhlPlayer, type Resolution } from './NhlStatsService.js';

function defaultDataDir(): string {
  try { return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.chirp-data'); }
  catch { return '.chirp-data'; }
}

export interface StoredPlayer {
  readonly player_id: string;
  readonly name: string;
  readonly team: string;
  readonly position: string;
  /** Lineup slot if the paste indicated one — 'BN', 'IR', or a position. */
  readonly slot?: string;
}

export interface StoredRoster {
  readonly label: string;
  readonly players: StoredPlayer[];
  readonly updated_at: string;
}

export interface StandingsRow {
  readonly rank?: number;
  readonly team_name: string;
  readonly record?: string;
  readonly points?: number;
}

export interface ParseReport {
  readonly resolved: StoredPlayer[];
  readonly unresolved: { line: string; reason: string }[];
  readonly ambiguous: { line: string; candidates: string[] }[];
  readonly lines_read: number;
}

/** Tokens that appear beside names in pasted rosters and are never names. */
const NOISE = new Set([
  'c', 'lw', 'rw', 'd', 'g', 'w', 'f', 'util', 'bn', 'ir', 'ir+', 'na',
  'bench', 'forwards', 'defense', 'defensemen', 'goalies', 'goaltenders',
  'starters', 'reserve', 'injured', 'total', 'player', 'pos', 'team',
  'opp', 'status', 'add', 'drop', 'pre-game', 'final', 'q', 'o', 'dtd'
]);

/** Slot labels worth preserving when a paste includes them. */
const SLOT_TOKENS = new Set(['bn', 'ir', 'ir+', 'na', 'util', 'c', 'lw', 'rw', 'd', 'g']);

export class RosterStore {
  private readonly dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? defaultDataDir();
  }

  // ==========================================
  // 🎯 Parsing pasted text
  // ==========================================

  /**
   * Turn pasted text into resolved players.
   *
   * Handles one player per line in the shapes people actually paste:
   *   Auston Matthews
   *   MATTHEWS, Auston
   *   C  Auston Matthews  TOR - C  Q
   *   1. Auston Matthews (TOR - C)
   *   Auston Matthews, TOR, C, 60 GP, 27 G
   */
  public parseRoster(text: string): ParseReport {
    const resolved: StoredPlayer[] = [];
    const unresolved: { line: string; reason: string }[] = [];
    const ambiguous: { line: string; candidates: string[] }[] = [];
    const seen = new Set<string>();

    const lines = String(text ?? '')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    for (const line of lines) {
      const slot = this.detectSlot(line);
      const candidates = this.candidateNames(line);

      if (candidates.length === 0) continue; // header or decoration

      let resolution: Resolution | null = null;
      for (const candidate of candidates) {
        const attempt = NHL_STATS.resolve(candidate);
        if (attempt.player) { resolution = attempt; break; }
        // Keep the most informative failure to report.
        if (!resolution || attempt.ambiguous) resolution = attempt;
      }

      if (resolution?.player) {
        if (seen.has(resolution.player.player_id)) continue;
        seen.add(resolution.player.player_id);
        resolved.push(this.toStored(resolution.player, slot));
      } else if (resolution?.ambiguous) {
        ambiguous.push({
          line,
          candidates: resolution.ambiguous.map(p => `${p.name} (${p.team} ${p.position})`)
        });
      } else if (resolution) {
        unresolved.push({ line, reason: resolution.reason ?? 'no match' });
      }
    }

    return { resolved, unresolved, ambiguous, lines_read: lines.length };
  }

  /**
   * Extract plausible name strings from one pasted line, most specific first.
   *
   * Pasted rows carry positions, team codes, injury flags and statistics
   * around the name. Rather than trying to write one regex for every fantasy
   * site's layout, this produces a few candidates and lets the NHL index
   * decide which is a real player.
   */
  private candidateNames(line: string): string[] {
    // Drop leading rank numbers, bracketed groups and anything after a stat run.
    let cleaned = line
      .replace(/^\s*\d+[.)]\s*/, '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ');

    // "Lastname, Firstname" is common enough to try verbatim first.
    const candidates: string[] = [];
    const commaForm = cleaned.match(/^\s*([A-Za-zÀ-ÿ'''.\-]+)\s*,\s*([A-Za-zÀ-ÿ'''.\-]+)/);
    if (commaForm) candidates.push(`${commaForm[2]} ${commaForm[1]}`);

    // Split on separators, then keep runs of word-like tokens that are not noise.
    const tokens = cleaned
      .split(/[\t|,;]+|\s{2,}|\s+-\s+/)
      .flatMap(seg => seg.trim())
      .filter(Boolean);

    for (const segment of tokens) {
      const words = segment
        .split(/\s+/)
        .filter(w => /[A-Za-zÀ-ÿ]/.test(w) && !NOISE.has(w.toLowerCase().replace(/[^a-z+]/g, '')));

      if (words.length >= 2) candidates.push(words.slice(0, 3).join(' '));
      if (words.length >= 2) candidates.push(words.slice(0, 2).join(' '));
      if (words.length === 1 && words[0].length > 2) candidates.push(words[0]);
    }

    return [...new Set(candidates)];
  }

  /** Pull a lineup slot out of a line when one is present. */
  private detectSlot(line: string): string | undefined {
    const first = line.trim().split(/[\s\t|,]+/)[0]?.toLowerCase().replace(/[^a-z+]/g, '');
    if (first && SLOT_TOKENS.has(first)) return first.toUpperCase();

    if (/\bIR\+?\b/.test(line)) return 'IR';
    if (/\bBN\b|\bbench\b/i.test(line)) return 'BN';
    return undefined;
  }

  private toStored(player: NhlPlayer, slot?: string): StoredPlayer {
    return {
      player_id: player.player_id,
      name: player.name,
      team: player.team,
      position: player.position,
      ...(slot ? { slot } : {})
    };
  }

  // ==========================================
  // 🎯 Standings
  // ==========================================

  /**
   * Parse pasted league standings. Team names are free text — there is no
   * authority to resolve them against — so this only structures what it reads.
   */
  public parseStandings(text: string): StandingsRow[] {
    const rows: StandingsRow[] = [];

    for (const raw of String(text ?? '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;

      const rankMatch = line.match(/^\s*(\d{1,2})[.)]?\s+(.+)$/);
      const rest = rankMatch ? rankMatch[2] : line;
      const record = rest.match(/\b(\d{1,3}\s*-\s*\d{1,3}(?:\s*-\s*\d{1,3})?)\b/);
      const points = rest.match(/\b(\d{1,4}(?:\.\d+)?)\s*(?:pts?|points)\b/i);

      const teamName = rest
        .replace(record?.[0] ?? '', '')
        .replace(points?.[0] ?? '', '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      if (!teamName || /^(rank|team|record|pts|points)$/i.test(teamName)) continue;

      rows.push({
        ...(rankMatch ? { rank: Number(rankMatch[1]) } : {}),
        team_name: teamName,
        ...(record ? { record: record[1].replace(/\s/g, '') } : {}),
        ...(points ? { points: Number(points[1]) } : {})
      });
    }

    return rows;
  }

  // ==========================================
  // 🎯 Persistence
  // ==========================================

  private filePath(name: string): string {
    return path.join(this.dataDir, `${name}.json`);
  }

  private write(name: string, value: unknown): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.filePath(name), JSON.stringify(value, null, 2));
  }

  private read<T>(name: string): T | null {
    try {
      const file = this.filePath(name);
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch {
      return null;
    }
  }

  public saveRoster(key: 'roster' | 'opponent', players: StoredPlayer[], label: string): StoredRoster {
    const stored: StoredRoster = { label, players, updated_at: new Date().toISOString() };
    this.write(key, stored);
    return stored;
  }

  public getRoster(key: 'roster' | 'opponent'): StoredRoster | null {
    return this.read<StoredRoster>(key);
  }

  public saveStandings(rows: StandingsRow[]): void {
    this.write('standings', { rows, updated_at: new Date().toISOString() });
  }

  public getStandings(): { rows: StandingsRow[]; updated_at: string } | null {
    return this.read<{ rows: StandingsRow[]; updated_at: string }>('standings');
  }

  public clear(key: 'roster' | 'opponent' | 'standings'): boolean {
    try {
      const file = this.filePath(key);
      if (!fs.existsSync(file)) return false;
      fs.unlinkSync(file);
      return true;
    } catch {
      return false;
    }
  }

  public getDataDir(): string {
    return this.dataDir;
  }
}

export const ROSTER_STORE = new RosterStore();
