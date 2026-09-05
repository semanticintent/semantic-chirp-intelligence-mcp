/**
 * read_ice emits the vendored contract from real service calls (mocked here), and every opinion in the Read is CHIRP's.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NHL_SCHEDULE } from '../../src/services/NhlScheduleService.js';
import { NHL_STATS } from '../../src/services/NhlStatsService.js';
import { ROSTER_STORE, type StoredPlayer } from '../../src/services/RosterStore.js';
import { readIce, readIceFromText, assignSlots, scheduleValue } from '../../src/services/ReadIceService.js';

const schema = JSON.parse(readFileSync(resolve(__dirname, '../../contracts/read.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

// Week of Mon 2026-10-05. CGY plays four, spaced. EDM plays two, back to back. TOR plays three.
const GAMES: Record<string, string[]> = {
  CGY: ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11'],
  EDM: ['2026-10-09', '2026-10-10'],
  TOR: ['2026-10-06', '2026-10-08', '2026-10-10'],
};
const inRange = (abbr: string, start: string, end: string) => (GAMES[abbr] ?? []).filter((d) => d >= start && d <= end).sort();
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

const P = (id: string, name: string, team: string, position: string, slot?: string): StoredPlayer => ({ player_id: id, name, team, position, slot });
const ROSTER: StoredPlayer[] = [
  P('gridin', 'Matvei Gridin', 'CGY', 'L'), P('frost', 'Morgan Frost', 'CGY', 'C'), P('coronato', 'Matt Coronato', 'CGY', 'R'),
  P('zary', 'Connor Zary', 'EDM', 'L'), P('backlund', 'Mikael Backlund', 'CGY', 'C'), P('farabee', 'Joel Farabee', 'CGY', 'R'),
  P('weegar', 'MacKenzie Weegar', 'CGY', 'D'), P('andersson', 'Rasmus Andersson', 'CGY', 'D'), P('bahl', 'Kevin Bahl', 'CGY', 'D'), P('miromanov', 'Daniil Miromanov', 'CGY', 'D'),
  P('wolf', 'Dustin Wolf', 'CGY', 'G'),
  P('strome', 'Ryan Strome', 'CGY', 'C', 'BN'), P('huberdeau', 'Jonathan Huberdeau', 'CGY', 'L', 'IR'),
];
const STATS: Record<string, { games_played: number; points?: number }> = { gridin: { games_played: 80, points: 58 }, zary: { games_played: 70, points: 40 }, strome: { games_played: 82, points: 40 }, wolf: { games_played: 50 } };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(NHL_SCHEDULE, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_SCHEDULE, 'getSeason').mockReturnValue('20262027');
  vi.spyOn(NHL_SCHEDULE, 'hasGameOn').mockImplementation((abbr, date) => (GAMES[abbr] ?? []).includes(date));
  vi.spyOn(NHL_SCHEDULE, 'countGamesInRange').mockImplementation((abbr, s, e) => inRange(abbr, s, e).length);
  vi.spyOn(NHL_SCHEDULE, 'countBackToBacks').mockImplementation((abbr, s, e) => {
    const g = inRange(abbr, s, e); let n = 0;
    for (let i = 1; i < g.length; i++) if (dayDiff(g[i - 1], g[i]) === 1) n++;
    return n;
  });
  vi.spyOn(NHL_STATS, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_STATS, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_STATS, 'getById').mockImplementation((id) => {
    const p = ROSTER.find((r) => r.player_id === id);
    return p ? { player_id: id, name: p.name, team: p.team as any, position: p.position, sweater_number: id === 'gridin' ? 92 : undefined, stats: STATS[id] ?? { games_played: 60, points: 20 } } : null;
  });
});

const OPTS = { today: '2026-10-05', now: new Date('2026-10-05T12:00:00Z') };

describe('readIce', () => {
  it('validates against the vendored read contract', async () => {
    const read = await readIce(ROSTER, OPTS);
    expect(validate(read), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('draws the window from the schedule: one bit per day, labels in order', async () => {
    const read = await readIce(ROSTER, OPTS);
    expect(read.window).toEqual({ start: '2026-10-05', end: '2026-10-11', days: 7, labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] });
    const gridin = read.skaters.find((s) => s.id === 'gridin')!;
    expect(gridin.games).toEqual([true, false, true, false, true, false, true]);
    expect(gridin.b2b).toBe(false);
    const zary = read.skaters.find((s) => s.id === 'zary')!;
    expect(zary.games).toEqual([false, false, false, false, true, true, false]);
    expect(zary.b2b).toBe(true);
  });

  it('places the lineup and honours BN and IR from the paste', async () => {
    const read = await readIce(ROSTER, OPTS);
    const slot = Object.fromEntries(read.skaters.map((s) => [s.id, s.slot]));
    expect(slot).toMatchObject({ gridin: 'L1', frost: 'L1', coronato: 'L1', zary: 'L2', backlund: 'L2', farabee: 'L2', weegar: 'D1', andersson: 'D1', bahl: 'D2', miromanov: 'D2', wolf: 'G', strome: 'BN', huberdeau: 'IR' });
    expect(read.skaters.find((s) => s.id === 'gridin')!.pos).toBe('LW');
    expect(read.skaters.find((s) => s.id === 'coronato')!.pos).toBe('RW');
  });

  it('scores the ice and flags it in the analyst\'s words', async () => {
    const read = await readIce(ROSTER, OPTS);
    const by = Object.fromEntries(read.skaters.map((s) => [s.id, s]));
    expect(by.gridin.schedule_value).toBe(100);
    expect(by.gridin.flag).toBeNull();
    expect(by.gridin.reason).toBe('4 games this week');
    expect(by.zary.schedule_value).toBe(30);
    expect(by.zary.flag).toBe('warn');
    expect(by.zary.reason).toBe('2 games, back-to-back');
    expect(by.strome.flag).toBe('stream');
    expect(by.huberdeau).toMatchObject({ flag: 'ir', schedule_value: 0, games: Array(7).fill(false), projected_pts: 0, note: 'on injured reserve' });
    expect(by.wolf.ppg).toBe(0);
  });

  it('computes production from club stats, so the screen never multiplies', async () => {
    const read = await readIce(ROSTER, OPTS);
    const gridin = read.skaters.find((s) => s.id === 'gridin')!;
    expect(gridin.num).toBe(92);
    expect(read.skaters.find((s) => s.id === 'zary')!.num).toBeNull();
    expect(gridin.ppg).toBe(0.73);   // 58 / 80
    expect(gridin.projected_pts).toBe(2.9); // 0.73 × 4
  });

  it('makes the calls and writes the lines the screen will drop', async () => {
    const read = await readIce(ROSTER, OPTS);
    expect(read.calls.start).toHaveLength(2);
    expect(read.calls.start).toContain('gridin');
    expect(read.calls.sit).toEqual(['zary']);
    expect(read.calls.stream).toEqual(['strome']);
    expect(read.calls.ir).toEqual(['huberdeau']);
    const pair = read.verdicts.find((v) => v.ids.length === 2 && v.ids.includes('strome') && v.ids.includes('zary'))!;
    expect(pair.line).toBe('Strome skates 2 more. Start him.');
    expect(read.verdicts.find((v) => v.ids.length === 1 && v.ids[0] === 'gridin')!.line).toBe("4 games. That's the whole argument.");
    expect(read.take).toBe('Your bench has Strome at 4 games and your lineup is carrying Zary at 2. Fix it before puck drop.');
  });

  it('counts games in hand, opponent only when given', async () => {
    const alone = await readIce(ROSTER, OPTS);
    expect(alone.games_in_hand).toEqual({ you: 46, opp: null, take: "46 games on the board. Paste the other guy's roster and I'll tell you the edge." });
    const opponent = [P('m', 'Auston Matthews', 'TOR', 'C'), P('n', 'William Nylander', 'TOR', 'R'), P('r', 'Morgan Rielly', 'TOR', 'D'), P('x', 'Someone Hurt', 'TOR', 'C', 'IR')];
    const versus = await readIce(ROSTER, { ...OPTS, opponent });
    expect(versus.games_in_hand.opp).toBe(9);
    expect(versus.games_in_hand.take).toMatch(/^Edge \+37\./);
  });

  it('honours the window length and says so', async () => {
    const read = await readIce(ROSTER, { ...OPTS, look_ahead_days: 3 });
    expect(read.window.days).toBe(3);
    expect(read.window.labels).toEqual(['Mon', 'Tue', 'Wed']);
    expect(read.skaters.find((s) => s.id === 'gridin')!.reason).toBe('2 games in the next 3 days');
    expect(validate(read)).toBe(true);
  });

  it('refuses rather than fakes when the schedule is unavailable', async () => {
    vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(false);
    vi.spyOn(NHL_SCHEDULE, 'getUnavailableReason').mockReturnValue('NHL API unreachable');
    await expect(readIce(ROSTER, OPTS)).rejects.toThrow(/schedule.*unavailable: NHL API unreachable/);
  });

  it('names its sources', async () => {
    const read = await readIce(ROSTER, OPTS);
    expect(read.source.analyst).toMatch(/^chirp@\d+\.\d+\.\d+$/);
    expect(read.source.data[0]).toBe('NHL api-web club-schedule-season 20262027');
  });
});

describe('readIce, edge cases', () => {
  it('slots by the position the paste named, not the NHL\'s', async () => {
    const read = await readIce([P('a', 'A Winger', 'CGY', 'R', 'LW'), P('b', 'B Center', 'CGY', 'C')], OPTS);
    const a = read.skaters.find((s) => s.id === 'a')!;
    expect(a.pos).toBe('LW');
    expect(a.slot).toBe('L1');
  });
  it('calls nothing when nobody plays, and says so', async () => {
    const read = await readIce(ROSTER, { ...OPTS, today: '2026-09-07' });
    expect(read.calls.start).toEqual([]);
    expect(read.calls.sit).toEqual([]);
    expect(read.take).toMatch(/^Nobody in your lineup plays this week\./);
    expect(validate(read), JSON.stringify(validate.errors)).toBe(true);
  });
  it('never calls Start on a skater below half value', async () => {
    const read = await readIce([P('z', 'Only Zary', 'EDM', 'L'), P('w', 'A Goalie', 'CGY', 'G')], OPTS);
    expect(read.calls.start).toEqual([]);
  });
  it('refuses a malformed start date', async () => {
    await expect(readIce(ROSTER, { today: 'Monday' })).rejects.toThrow(/start must be a date/);
  });
});

describe('readIceFromText', () => {
  it('resolves the paste, notes what it could not, and validates', async () => {
    vi.spyOn(ROSTER_STORE, 'parseRoster').mockImplementation((text) => ({
      resolved: ROSTER.filter((p) => text.includes(p.name)),
      unresolved: text.includes('Bob Nobody') ? [{ line: 'Bob Nobody LW', reason: 'no NHL player found with that name' }] : [],
      ambiguous: [],
      lines_read: text.split('\n').length,
    }));
    const read = await readIceFromText(ROSTER.map((p) => p.name).join('\n') + '\nBob Nobody LW', OPTS);
    expect(validate(read), JSON.stringify(validate.errors)).toBe(true);
    expect(read.notes).toEqual(['Not resolved: "Bob Nobody LW" (no NHL player found with that name)']);
    expect(read.skaters).toHaveLength(ROSTER.length);
  });
  it('refuses a paste with nobody in it', async () => {
    vi.spyOn(ROSTER_STORE, 'parseRoster').mockReturnValue({ resolved: [], unresolved: [{ line: 'x', reason: 'no' }], ambiguous: [], lines_read: 1 });
    await expect(readIceFromText('x', OPTS)).rejects.toThrow(/No players resolved/);
  });
});

describe('helpers', () => {
  it('scheduleValue: games against four, less twenty for a back-to-back, never below zero', () => {
    expect(scheduleValue(4, false)).toBe(100);
    expect(scheduleValue(4, true)).toBe(80);
    expect(scheduleValue(2, true)).toBe(30);
    expect(scheduleValue(0, true)).toBe(0);
    expect(scheduleValue(6, false)).toBe(100);
  });
  it('assignSlots benches the overflow', () => {
    const slots = assignSlots([P('a', 'A', 'CGY', 'C'), P('b', 'B', 'CGY', 'C'), P('c', 'C', 'CGY', 'C')]);
    expect([...slots.values()]).toEqual(['L1', 'L2', 'BN']);
  });
});
