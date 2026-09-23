/** League categories (D51): read what a league scores, value players for it, say what could not be read. */
import { describe, it, expect } from 'vitest';
import { parseCategories, valueForCategories, MIN_GAMES, Z_CAP } from '../../src/services/CategoryService.js';

const WAFFLES = 'G, A, +/-, PIM, PPP, SHP, GWG, SOG, HIT, BLK; W, GAA, SV, SV%, SHO';

describe('parseCategories', () => {
  it('reads a Yahoo category list, skaters and goalies apart', () => {
    expect(parseCategories(WAFFLES)).toEqual({
      skater: ['G', 'A', '+/-', 'PIM', 'PPP', 'SHP', 'GWG', 'SOG', 'HIT', 'BLK'],
      goalie: ['W', 'GAA', 'SV', 'SV%', 'SHO'], unread: [],
    });
  });
  it('reads the settings page form, full names and aliases, and names back what it cannot read', () => {
    const p = parseCategories('Goals (G)\nPowerplay Points (PPP)\nBlocked Shots\nSave Percentage (SV%)\nShutouts\nFaceoffs Won\nCorsi');
    expect(p.skater).toEqual(['G', 'PPP', 'BLK', 'FW']);
    expect(p.goalie).toEqual(['SV%', 'SHO']);
    expect(p.unread).toEqual(['Corsi']);
  });
  it('drops duplicates', () => {
    expect(parseCategories('HIT, Hits, hit').skater).toEqual(['HIT']);
  });
});

const sk = (id: string, gp: number, s: Record<string, number>) => ({ player_id: id, name: id, team: 'TOR', position: 'C', stats: { games_played: gp, ...s } }) as any;
const gl = (id: string, gp: number, s: Record<string, number>) => ({ player_id: id, name: id, team: 'TOR', position: 'G', stats: { games_played: gp, ...s } }) as any;

describe('valueForCategories', () => {
  const skaters = [
    sk('scorer', 80, { points: 100, hits: 20, blocks: 10 }),
    sk('banger', 80, { points: 20, hits: 300, blocks: 120 }),
    sk('middle', 80, { points: 50, hits: 100, blocks: 50 }),
    sk('short', MIN_GAMES - 1, { points: 30, hits: 30, blocks: 10 }),
  ];
  it('ranks for the league: hits and blocks lift the banger over the scorer', () => {
    const b = valueForCategories(parseCategories('P, HIT, BLK'), skaters);
    expect(b.values.get('banger')!.value).toBeGreaterThan(b.values.get('scorer')!.value);
    expect(b.values.get('banger')!.line).toMatch(/^(HIT|BLK) \+/);
    expect(b.values.get('scorer')!.line).toMatch(/^P \+.*−/);
  });
  it('points alone keep the scorer first', () => {
    const b = valueForCategories(parseCategories('P'), skaters);
    expect(b.values.get('scorer')!.value).toBeGreaterThan(b.values.get('banger')!.value);
  });
  it(`leaves out players under ${MIN_GAMES} games, and says so`, () => {
    const b = valueForCategories(parseCategories('P, HIT'), skaters);
    expect(b.values.has('short')).toBe(false);
    expect(b.too_few_games.has('short')).toBe(true);
  });
  it('counts GAA against and weights rates by starts, so a hot backup does not outrank a workhorse', () => {
    const goalies = [
      gl('workhorse', 65, { games_started: 64, wins: 38, goals_against_average: 2.5, save_percentage: 0.912, saves: 1800 }),
      gl('backup', 22, { games_started: 20, wins: 12, goals_against_average: 2.1, save_percentage: 0.925, saves: 560 }),
      gl('leaky', 50, { games_started: 50, wins: 20, goals_against_average: 3.4, save_percentage: 0.890, saves: 1300 }),
    ];
    const b = valueForCategories(parseCategories('W, GAA, SV, SV%'), goalies);
    expect(b.values.get('workhorse')!.value).toBeGreaterThan(b.values.get('backup')!.value);
    const leakyGaa = b.values.get('leaky')!.z.find((x) => x.cat === 'GAA')!.z;
    expect(leakyGaa).toBeLessThan(0);
  });
  it('sums across categories, so the side with more categories carries more weight, as in a matchup', () => {
    const b = valueForCategories(parseCategories('P, HIT'), skaters);
    const v = b.values.get('middle')!;
    expect(v.value).toBeCloseTo(v.z.reduce((a, x) => a + x.z, 0), 2);
  });
  it(`caps a rare category at ±${Z_CAP}, so it cannot decide a player alone`, () => {
    const many = Array.from({ length: 40 }, (_, i) => sk(`p${i}`, 80, { short_handed_points: 0, points: 40 + i }));
    many.push(sk('ace', 80, { short_handed_points: 12, points: 40 }));
    const b = valueForCategories(parseCategories('SHP'), many);
    expect(b.values.get('ace')!.z[0].z).toBe(Z_CAP);
  });
  it('names a category the loaded stats do not carry', () => {
    const b = valueForCategories(parseCategories('P, HIT'), [sk('a', 60, { points: 40 }), sk('b', 60, { points: 20 })]);
    expect(b.missing).toEqual(['HIT']);
  });
});
