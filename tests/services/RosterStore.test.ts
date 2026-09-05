import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RosterStore } from '../../src/services/RosterStore.js';
import { NHL_STATS } from '../../src/services/NhlStatsService.js';

/** A small stand-in league so parsing tests never touch the network. */
const PLAYERS = [
  { player_id: '1', name: 'Auston Matthews', team: 'TOR', position: 'C' },
  { player_id: '2', name: 'Cale Makar', team: 'COL', position: 'D' },
  { player_id: '3', name: 'Tim Stützle', team: 'OTT', position: 'C' },
  { player_id: '4', name: 'J.T. Miller', team: 'NYR', position: 'C' },
  { player_id: '5', name: 'Igor Shesterkin', team: 'NYR', position: 'G' },
  { player_id: '6', name: 'Will Smith', team: 'SJS', position: 'C' },
  { player_id: '7', name: 'Cole Smith', team: 'CHI', position: 'R' }
] as any[];

function stubResolver() {
  const key = (s: string) =>
    String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  vi.spyOn(NHL_STATS, 'resolve').mockImplementation((input: string) => {
    const raw = String(input ?? '').trim();
    if (!raw) return { input: raw, player: null, reason: 'empty' };

    const normalized = raw.includes(',')
      ? raw.split(',').map(s => s.trim()).reverse().join(' ')
      : raw;

    const exact = PLAYERS.filter(p => key(p.name) === key(normalized));
    if (exact.length === 1) return { input: raw, player: exact[0] };

    const surname = PLAYERS.filter(p => key(p.name.split(/\s+/).slice(-1)[0]) === key(normalized));
    if (surname.length === 1) return { input: raw, player: surname[0] };
    if (surname.length > 1) {
      return { input: raw, player: null, ambiguous: surname, reason: 'surname matches several players' };
    }

    return { input: raw, player: null, reason: 'no NHL player found with that name' };
  });
}

let dir: string;
let store: RosterStore;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chirp-store-'));
  store = new RosterStore(dir);
  stubResolver();
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('roster paste parsing', () => {
  it('reads tab-separated rows with slot, team and status', () => {
    const r = store.parseRoster('C\tAuston Matthews\tTOR - C\tQ\nD\tCale Makar\tCOL - D');

    expect(r.resolved.map(p => p.name)).toEqual(['Auston Matthews', 'Cale Makar']);
    expect(r.resolved[0].slot).toBe('C');
    expect(r.resolved[0].team).toBe('TOR');
  });

  it('reads bare names', () => {
    const r = store.parseRoster('Auston Matthews\nCale Makar');
    expect(r.resolved).toHaveLength(2);
  });

  it('reads "Lastname, Firstname"', () => {
    const r = store.parseRoster('MATTHEWS, Auston\nMAKAR, Cale');
    expect(r.resolved.map(p => p.name)).toEqual(['Auston Matthews', 'Cale Makar']);
  });

  it('reads numbered lines with bracketed team and position', () => {
    const r = store.parseRoster('1. Auston Matthews (TOR - C)\n2. Cale Makar (COL - D)');
    expect(r.resolved).toHaveLength(2);
  });

  it('matches names typed without accents', () => {
    // "Stutzle" is how most people type "Stützle".
    const r = store.parseRoster('Tim Stutzle');
    expect(r.resolved[0].name).toBe('Tim Stützle');
  });

  it('matches names containing punctuation', () => {
    const r = store.parseRoster('J.T. Miller');
    expect(r.resolved[0].name).toBe('J.T. Miller');
  });

  it('takes a position named after the player as his slot, and never mistakes an initial for one', () => {
    const r = store.parseRoster('Auston Matthews LW\nCale Makar - D\nIgor Shesterkin G\nJ.T. Miller\nWill Smith RW');
    expect(r.resolved.map(p => [p.name, p.slot])).toEqual([
      ['Auston Matthews', 'LW'], ['Cale Makar', 'D'], ['Igor Shesterkin', 'G'], ['J.T. Miller', undefined], ['Will Smith', 'RW'],
    ]);
  });

  it('preserves BN and IR slots', () => {
    const r = store.parseRoster('BN\tTim Stützle\tOTT - C\nIR\tCale Makar\tCOL - D');
    expect(r.resolved.map(p => p.slot)).toEqual(['BN', 'IR']);
  });

  it('reports an unknown name instead of guessing', () => {
    const r = store.parseRoster('Bobby Nonexistent');
    expect(r.resolved).toHaveLength(0);
    expect(r.unresolved[0].reason).toContain('no NHL player found');
  });

  it('reports an ambiguous surname with its candidates', () => {
    // Silently picking one Smith would put the wrong player on the roster.
    const r = store.parseRoster('Smith');
    expect(r.resolved).toHaveLength(0);
    expect(r.ambiguous[0].candidates).toHaveLength(2);
    expect(r.ambiguous[0].candidates.join(' ')).toContain('Will Smith');
  });

  it('deduplicates a player listed twice', () => {
    const r = store.parseRoster('Auston Matthews\nMATTHEWS, Auston');
    expect(r.resolved).toHaveLength(1);
  });

  it('skips headers and decoration without reporting them as failures', () => {
    const r = store.parseRoster('Forwards\nPlayer\tPos\tTeam\nAuston Matthews\tTOR - C');
    expect(r.resolved).toHaveLength(1);
    expect(r.unresolved).toHaveLength(0);
  });

  it('handles empty input', () => {
    const r = store.parseRoster('');
    expect(r).toMatchObject({ resolved: [], unresolved: [], ambiguous: [], lines_read: 0 });
  });
});

describe('standings paste parsing', () => {
  it('extracts rank, team, record and points', () => {
    const rows = store.parseStandings('1. TeamDestroyersz 8-2-1 142 pts\n2. Waffles Anyone 7-3-1 138 pts');

    expect(rows[0]).toMatchObject({ rank: 1, team_name: 'TeamDestroyersz', record: '8-2-1', points: 142 });
    expect(rows[1].team_name).toBe('Waffles Anyone');
  });

  it('tolerates rows without points', () => {
    const rows = store.parseStandings('3. Bixby Barbarians 6-4-1');
    expect(rows[0]).toMatchObject({ rank: 3, team_name: 'Bixby Barbarians', record: '6-4-1' });
    expect(rows[0].points).toBeUndefined();
  });

  it('skips header rows', () => {
    const rows = store.parseStandings('Rank\nTeam\n1. Waffles Anyone 7-3-1');
    expect(rows).toHaveLength(1);
  });
});

describe('persistence', () => {
  it('round-trips a roster', () => {
    const { resolved } = store.parseRoster('Auston Matthews\nCale Makar');
    store.saveRoster('roster', resolved, 'My Team');

    const loaded = store.getRoster('roster');
    expect(loaded?.label).toBe('My Team');
    expect(loaded?.players).toHaveLength(2);
    expect(loaded?.updated_at).toBeTruthy();
  });

  it('keeps roster and opponent separate', () => {
    store.saveRoster('roster', store.parseRoster('Auston Matthews').resolved, 'Mine');
    store.saveRoster('opponent', store.parseRoster('Cale Makar').resolved, 'Theirs');

    expect(store.getRoster('roster')?.players[0].name).toBe('Auston Matthews');
    expect(store.getRoster('opponent')?.players[0].name).toBe('Cale Makar');
  });

  it('returns null before anything is saved', () => {
    expect(store.getRoster('roster')).toBeNull();
    expect(store.getStandings()).toBeNull();
  });

  it('clears stored data', () => {
    store.saveRoster('roster', store.parseRoster('Auston Matthews').resolved, 'Mine');

    expect(store.clear('roster')).toBe(true);
    expect(store.getRoster('roster')).toBeNull();
    expect(store.clear('roster')).toBe(false);
  });
});
