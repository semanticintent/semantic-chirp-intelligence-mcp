import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NhlStatsService } from '../../src/services/NhlStatsService.js';
import { NHL_TRICODES } from '../../src/domain/nhl-teams.js';

/**
 * Each club gets uniquely named players so resolution tests are meaningful.
 * TOR additionally carries the awkward real-world names (an accent, a comma
 * form), and two clubs share the surname "Smith" to exercise ambiguity.
 */
function rosterPayload(team: string) {
  const named = team === 'TOR'
    ? [
        { id: 'TOR1', firstName: { default: 'Auston' }, lastName: { default: 'Matthews' }, positionCode: 'C' },
        { id: 'TOR2', firstName: { default: 'Tim' }, lastName: { default: 'Stützle' }, positionCode: 'C' }
      ]
    : [
        { id: `${team}1`, firstName: { default: 'First' }, lastName: { default: `Forward${team}` }, positionCode: 'C' },
        { id: `${team}2`, firstName: { default: 'Second' }, lastName: { default: `Forward${team}` }, positionCode: 'L' }
      ];

  // Two Smiths, on different clubs, so a bare surname is genuinely ambiguous.
  if (team === 'SJS') named.push({ id: 'SJS9', firstName: { default: 'Will' }, lastName: { default: 'Smith' }, positionCode: 'C' } as any);
  if (team === 'CHI') named.push({ id: 'CHI9', firstName: { default: 'Cole' }, lastName: { default: 'Smith' }, positionCode: 'R' } as any);

  return {
    forwards: named,
    defensemen: [
      { id: `${team}3`, firstName: { default: 'Blue' }, lastName: { default: `Liner${team}` }, positionCode: 'D' }
    ],
    goalies: [
      { id: `${team}4`, firstName: { default: 'Net' }, lastName: { default: `Minder${team}` }, positionCode: 'G' }
    ]
  };
}

function statsPayload(team: string) {
  return {
    skaters: [
      { playerId: `${team}1`, gamesPlayed: 60, goals: 27, assists: 26, points: 53, plusMinus: -4,
        penaltyMinutes: 18, shots: 227, powerPlayGoals: 5, shorthandedGoals: 0, gameWinningGoals: 3,
        avgTimeOnIcePerGame: 1248.2 }
    ],
    goalies: [
      { playerId: `${team}4`, gamesPlayed: 51, wins: 25, losses: 19, goalsAgainstAverage: 2.49,
        savePercentage: 0.911, shutouts: 1, saves: 1299, goalsAgainst: 126 }
    ]
  };
}

function stubFetch(opts: { failRosterFor?: string; failStats?: boolean } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const s = String(url);
    const team = s.split('/').slice(-2)[0].length === 3 ? s.split('/').slice(-2)[0] : s.split('/')[s.split('/').length - 3];

    if (s.includes('/roster/')) {
      const t = s.split('/roster/')[1].split('/')[0];
      if (opts.failRosterFor === t) return { ok: false, status: 500 } as any;
      return { ok: true, json: async () => rosterPayload(t) } as any;
    }
    if (s.includes('/club-stats/')) {
      const t = s.split('/club-stats/')[1].split('/')[0];
      if (opts.failStats) return { ok: false, status: 503 } as any;
      return { ok: true, json: async () => statsPayload(t) } as any;
    }
    return { ok: false, status: 404 } as any;
  }));
}

let dir: string;
let service: NhlStatsService;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chirp-stats-'));
  service = new NhlStatsService(dir);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('season resolution', () => {
  it('rolls the season over in August', () => {
    expect(NhlStatsService.currentSeason(new Date('2026-09-01T00:00:00Z'))).toBe('20262027');
    expect(NhlStatsService.currentSeason(new Date('2026-07-31T00:00:00Z'))).toBe('20252026');
  });

  it('defaults stats to the previous season', async () => {
    // Before opening night the current season has no statistics, and a draft is
    // exactly when last season's line matters.
    stubFetch();
    await service.load('20262027');
    expect(service.getSeasons()).toEqual({ roster: '20262027', stats: '20252026' });
  });
});

describe('loading', () => {
  it('indexes every club', async () => {
    stubFetch();
    await service.load('20262027');

    expect(service.isAvailable()).toBe(true);
    // 4 per club, plus the two extra Smiths on SJS and CHI
    expect(service.getPlayerCount()).toBe(NHL_TRICODES.length * 4 + 2);
  });

  it('reports unavailable rather than serving a partial league', async () => {
    stubFetch({ failRosterFor: 'BOS' });
    await service.load('20262027');

    expect(service.isAvailable()).toBe(false);
    expect(service.getUnavailableReason()).toContain('BOS');
  });

  it('keeps players when stats are unavailable', async () => {
    // A club with no published stat line still has a roster.
    stubFetch({ failStats: true });
    await service.load('20262027');

    expect(service.isAvailable()).toBe(true);
    expect(service.getById('TOR1')?.stats).toBeUndefined();
  });

  it('serves a second instance from cache without refetching', async () => {
    stubFetch();
    await service.load('20262027');

    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    const warm = new NhlStatsService(dir);
    await warm.load('20262027');

    expect(warm.isAvailable()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('name resolution', () => {
  beforeEach(async () => {
    stubFetch();
    await service.load('20262027');
  });

  it('folds accents so "Stutzle" finds "Stützle"', () => {
    expect(service.resolve('Tim Stutzle').player?.name).toBe('Tim Stützle');
    expect(service.resolve('Tim Stützle').player?.name).toBe('Tim Stützle');
  });

  it('accepts "Lastname, Firstname"', () => {
    expect(service.resolve('MATTHEWS, Auston').player?.name).toBe('Auston Matthews');
  });

  it('is case-insensitive', () => {
    expect(service.resolve('auston matthews').player?.name).toBe('Auston Matthews');
  });

  it('reports ambiguity instead of guessing', () => {
    // Two clubs carry a Smith; picking one silently would roster the wrong player.
    const r = service.resolve('Smith');
    expect(r.player).toBeNull();
    expect(r.ambiguous?.map(p => p.name).sort()).toEqual(['Cole Smith', 'Will Smith']);
    expect(r.reason).toContain('surname');
  });

  it('resolves a full name that is unique even when the surname is not', () => {
    expect(service.resolve('Will Smith').player?.team).toBe('SJS');
    expect(service.resolve('Cole Smith').player?.team).toBe('CHI');
  });

  it('resolves a unique surname on its own', () => {
    expect(service.resolve('Stutzle').player?.name).toBe('Tim Stützle');
  });

  it('reports an unknown name', () => {
    const r = service.resolve('Bobby Nonexistent');
    expect(r.player).toBeNull();
    expect(r.reason).toContain('no NHL player found');
  });

  it('handles empty input', () => {
    expect(service.resolve('').player).toBeNull();
    expect(service.resolve(undefined as any).player).toBeNull();
  });
});

describe('stats', () => {
  beforeEach(async () => {
    stubFetch();
    await service.load('20262027');
  });

  it('attaches skater categories', () => {
    expect(service.getById('TOR1')?.stats).toMatchObject({
      games_played: 60, goals: 27, assists: 26, points: 53,
      plus_minus: -4, penalty_minutes: 18, shots: 227, power_play_goals: 5
    });
  });

  it('attaches goalie categories', () => {
    expect(service.getById('TOR4')?.stats).toMatchObject({
      wins: 25, losses: 19, goals_against_average: 2.49, save_percentage: 0.911, shutouts: 1
    });
  });

  it('filters players by club', () => {
    expect(service.getByTeam('TOR')).toHaveLength(4);
    expect(service.getByTeam('ZZZ')).toHaveLength(0);
  });
});
