/**
 * 🏒 League Data Service — league state from the store, in the shape analyses expect
 *
 * v3 read rosters from Yahoo and parsed them out of deeply nested, irregular
 * fantasy JSON. v4 reads the same information from what the user pasted, and
 * presents it in exactly the shape the existing analyses already consume — so
 * the intelligence layer is untouched by the change of source.
 *
 * 🏛️ Rule 1 (Semantic Over Structural): analyses ask for "my roster", not for a
 * provider's payload. Where that roster comes from is not their concern.
 * 🏛️ Rule 3 (Observable Anchoring): when no roster has been provided, this
 * reports that plainly. It never returns an empty roster that would read as
 * "you have no players" rather than "you have not told me your players".
 */

import { ROSTER_STORE, type StoredPlayer, type StoredRoster } from './RosterStore.js';
import { NHL_STATS } from './NhlStatsService.js';

/** A roster player in the shape the analyses were written against. */
export interface LeaguePlayer {
  readonly player_id: string;
  readonly name: string;
  /** Eligible positions, comma-separated, e.g. "C,LW". */
  readonly position: string;
  readonly team: string;
  /** Lineup slot: a position, "BN", or "IR". */
  readonly selected_position: string;
  readonly status: string;
  readonly stats?: any;
}

export interface LeagueRoster {
  readonly team_key: string;
  readonly team_name: string;
  readonly players: LeaguePlayer[];
}

/** Why a roster could not be produced, phrased for the person reading it. */
export const NO_ROSTER_MESSAGE =
  'No roster has been provided yet. Paste yours with `set_roster` — copy it from ' +
  'any fantasy site, or just list the player names, one per line.';

export const NO_OPPONENT_MESSAGE =
  'No opponent roster has been provided. Paste one with `set_opponent_roster` to ' +
  'enable head-to-head analysis.';

export class LeagueDataService {
  /**
   * The user's roster, or null when none has been stored.
   *
   * Enriches each player with their current NHL club and eligible positions,
   * so a roster pasted weeks ago still reflects trades and call-ups.
   */
  public getRoster(): LeagueRoster | null {
    return this.toLeagueRoster(ROSTER_STORE.getRoster('roster'), 'my-team');
  }

  /** The stored opponent roster, or null. */
  public getOpponentRoster(): LeagueRoster | null {
    return this.toLeagueRoster(ROSTER_STORE.getRoster('opponent'), 'opponent-team');
  }

  public hasRoster(): boolean {
    return (ROSTER_STORE.getRoster('roster')?.players.length ?? 0) > 0;
  }

  public hasOpponent(): boolean {
    return (ROSTER_STORE.getRoster('opponent')?.players.length ?? 0) > 0;
  }

  public getStandings(): { rows: any[]; updated_at: string } | null {
    return ROSTER_STORE.getStandings();
  }

  private toLeagueRoster(stored: StoredRoster | null, keyPrefix: string): LeagueRoster | null {
    if (!stored || stored.players.length === 0) return null;

    return {
      team_key: keyPrefix,
      team_name: stored.label,
      players: stored.players.map(p => this.toLeaguePlayer(p))
    };
  }

  private toLeaguePlayer(stored: StoredPlayer): LeaguePlayer {
    // Re-resolve against the live index so a player traded since the paste
    // reports their current club rather than a stale one.
    const live = NHL_STATS.getById(stored.player_id);

    const team = live?.team ?? stored.team;
    const position = live?.position ?? stored.position;

    return {
      player_id: stored.player_id,
      name: stored.name,
      position: this.eligiblePositions(position),
      team,
      // A paste without slot information means the player is simply rostered;
      // treat that as an active lineup spot rather than inventing a bench.
      selected_position: stored.slot ?? position,
      status: '',
      stats: live?.stats
    };
  }

  /**
   * Map an NHL position code to fantasy-eligible positions.
   *
   * The NHL publishes L / R / C / D / G. Fantasy platforms speak LW / RW, and
   * treat wingers as winger-eligible, so translate rather than pass through.
   */
  private eligiblePositions(positionCode: string): string {
    switch (String(positionCode).toUpperCase()) {
      case 'L': return 'LW';
      case 'R': return 'RW';
      case 'C': return 'C';
      case 'D': return 'D';
      case 'G': return 'G';
      default: return positionCode || '';
    }
  }
}

export const LEAGUE_DATA = new LeagueDataService();
