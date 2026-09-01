import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NhlScheduleService } from '../../src/services/NhlScheduleService.js';
import { NHL_TRICODES } from '../../src/domain/nhl-teams.js';

/** Two regular-season games plus one preseason game that must be excluded. */
function seasonPayload(team: string) {
  const opponent = team === 'TOR' ? 'MTL' : 'TOR';
  return {
    games: [
      { gameType: 1, gameDate: '2026-09-20', homeTeam: { abbrev: team }, awayTeam: { abbrev: opponent } },
      { gameType: 2, gameDate: '2026-10-06', homeTeam: { abbrev: team }, awayTeam: { abbrev: opponent } },
      { gameType: 2, gameDate: '2026-10-07', homeTeam: { abbrev: opponent }, awayTeam: { abbrev: team } },
      { gameType: 2, gameDate: '2026-10-10', homeTeam: { abbrev: team }, awayTeam: { abbrev: opponent } },
      { gameType: 3, gameDate: '2027-05-01', homeTeam: { abbrev: team }, awayTeam: { abbrev: opponent } }
    ]
  };
}

let tmpDir: string;
let service: NhlScheduleService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chirp-sched-'));
  service = new NhlScheduleService(tmpDir);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function stubFetchOk() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const team = String(url).split('/').slice(-2)[0];
    return { ok: true, json: async () => seasonPayload(team) } as any;
  }));
}

describe('NhlScheduleService season resolution', () => {
  it('rolls the season over in August', () => {
    expect(NhlScheduleService.seasonForDate(new Date('2026-09-01T00:00:00Z'))).toBe('20262027');
    expect(NhlScheduleService.seasonForDate(new Date('2026-08-01T00:00:00Z'))).toBe('20262027');
    expect(NhlScheduleService.seasonForDate(new Date('2026-07-31T00:00:00Z'))).toBe('20252026');
    expect(NhlScheduleService.seasonForDate(new Date('2027-03-15T00:00:00Z'))).toBe('20262027');
  });
});

describe('NhlScheduleService date helpers', () => {
  it('resolves the Monday that starts a fantasy week', () => {
    expect(NhlScheduleService.weekStart('2026-10-07')).toBe('2026-10-05'); // Wednesday
    expect(NhlScheduleService.weekStart('2026-10-05')).toBe('2026-10-05'); // Monday itself
    expect(NhlScheduleService.weekStart('2026-10-11')).toBe('2026-10-05'); // Sunday
  });

  it('adds days across month boundaries', () => {
    expect(NhlScheduleService.addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(NhlScheduleService.addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('NhlScheduleService loading', () => {
  it('loads all 32 clubs and keeps only regular-season games', async () => {
    stubFetchOk();
    await service.load('20262027');

    expect(service.isAvailable()).toBe(true);
    expect(service.getUnavailableReason()).toBeNull();
    // 3 regular-season games; preseason (type 1) and playoffs (type 3) excluded
    expect(service.getTeamGames('TOR')).toHaveLength(3);
  });

  it('reports unavailable rather than serving a partial league', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const team = String(url).split('/').slice(-2)[0];
      if (team === 'BOS') return { ok: false, status: 500 } as any;
      return { ok: true, json: async () => seasonPayload(team) } as any;
    }));

    await service.load('20262027');

    // A half-loaded league produces silently wrong team-vs-team comparisons.
    expect(service.isAvailable()).toBe(false);
    expect(service.getUnavailableReason()).toContain('BOS');
  });

  it('shares one in-flight load between concurrent callers', async () => {
    const spy = vi.fn(async (url: string) => {
      const team = String(url).split('/').slice(-2)[0];
      return { ok: true, json: async () => seasonPayload(team) } as any;
    });
    vi.stubGlobal('fetch', spy);

    await Promise.all([service.load('20262027'), service.load('20262027'), service.load('20262027')]);

    expect(spy).toHaveBeenCalledTimes(NHL_TRICODES.length);
  });

  it('serves a second instance from the disk cache without refetching', async () => {
    stubFetchOk();
    await service.load('20262027');

    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    const warm = new NhlScheduleService(tmpDir);
    await warm.load('20262027');

    expect(warm.isAvailable()).toBe(true);
    expect(warm.getTeamGames('TOR')).toHaveLength(3);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('NhlScheduleService queries', () => {
  beforeEach(async () => {
    stubFetchOk();
    await service.load('20262027');
  });

  it('resolves Yahoo abbreviations to the right club', () => {
    // The whole point of the mapping layer: LA must find LAK's schedule.
    expect(service.getTeamGames('LA')).toHaveLength(3);
    expect(service.getTeamProfile('NJ')?.team).toBe('NJD');
    expect(service.getTeamGames('ZZZ')).toEqual([]);
  });

  it('counts games in an inclusive range', () => {
    expect(service.countGamesInRange('TOR', '2026-10-06', '2026-10-07')).toBe(2);
    expect(service.countGamesInRange('TOR', '2026-10-06', '2026-10-06')).toBe(1);
    expect(service.countGamesInRange('TOR', '2026-11-01', '2026-11-30')).toBe(0);
  });

  it('detects a game on a specific date', () => {
    expect(service.hasGameOn('TOR', '2026-10-06')).toBe(true);
    expect(service.hasGameOn('TOR', '2026-10-08')).toBe(false);
    // Preseason games must not count as a game day
    expect(service.hasGameOn('TOR', '2026-09-20')).toBe(false);
  });

  it('counts only consecutive-day pairs as back-to-backs', () => {
    // Oct 6 -> Oct 7 is a back-to-back; Oct 7 -> Oct 10 is not.
    expect(service.countBackToBacks('TOR', '2026-10-01', '2026-10-31')).toBe(1);
  });

  it('buckets games into Monday-start fantasy weeks', () => {
    const byWeek = service.getGamesByWeek('TOR');
    expect(byWeek['2026-10-05']).toBe(3); // Oct 6, 7 and 10 all fall in one week
  });

  it('builds a season profile for every club', () => {
    const profiles = service.getAllProfiles();
    expect(profiles).toHaveLength(32);
    expect(profiles.every(p => p.total_games === 3)).toBe(true);
  });

  it('records home and away correctly', () => {
    const games = service.getTeamGames('TOR');
    expect(games[0]).toMatchObject({ date: '2026-10-06', opponent: 'MTL', home: true });
    expect(games[1]).toMatchObject({ date: '2026-10-07', opponent: 'MTL', home: false });
  });
});

describe('NhlScheduleService opponent strength', () => {
  it('ranks the stingiest defence as the hardest matchup', async () => {
    stubFetchOk();
    await service.load('20262027');

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        standings: [
          { teamAbbrev: { default: 'BOS' }, gamesPlayed: 82, goalAgainst: 164, pointPctg: 0.7 }, // 2.0 GA/G
          { teamAbbrev: { default: 'TOR' }, gamesPlayed: 82, goalAgainst: 246, pointPctg: 0.6 }, // 3.0 GA/G
          { teamAbbrev: { default: 'SJS' }, gamesPlayed: 82, goalAgainst: 328, pointPctg: 0.3 }  // 4.0 GA/G
        ]
      })
    }) as any));

    await service.loadStandings();

    expect(service.hasStandings()).toBe(true);
    expect(service.getTeamStrength('BOS')!.difficulty).toBe(100);
    expect(service.getTeamStrength('SJS')!.difficulty).toBe(0);
    expect(service.getTeamStrength('BOS')!.goals_against_per_game).toBe(2);
    // Yahoo spelling must resolve here too
    expect(service.getTeamStrength('SJ')!.team).toBe('SJS');
  });

  it('leaves standings absent rather than fabricating strength', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 }) as any));
    await service.loadStandings();

    expect(service.hasStandings()).toBe(false);
    expect(service.getTeamStrength('TOR')).toBeNull();
  });
});
