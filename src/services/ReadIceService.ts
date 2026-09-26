/**
 * read_ice — the Read that Sepiola (the telestrator) draws.
 *
 * Emits contracts/read.schema.json (vendored from semanticintent/sepiola). Every number and every
 * sentence the screen will show is decided here, in the analyst's voice: the screen has no opinions, so this file has
 * all of them. Real sources only — the NHL schedule for game bits and back-to-backs, NHL club stats for production.
 * Nothing is estimated. When the schedule is unavailable the read is refused, not faked.
 *
 * Stateless: takes players, returns a Read. The MCP tool and the HTTP face both call it.
 */
import { NHL_SCHEDULE, NhlScheduleService } from './NhlScheduleService.js';
import { NHL_STATS, NhlStatsService } from './NhlStatsService.js';
import { ROSTER_STORE, type StoredPlayer } from './RosterStore.js';
import { toNhlTricode } from '../domain/nhl-teams.js';
import { getVersion } from '../version.js';

// ---- the contract, as types ----
export type Slot = 'L1' | 'L2' | 'D1' | 'D2' | 'G' | 'BN' | 'IR';
export type Pos = 'C' | 'LW' | 'RW' | 'D' | 'G';
export type Flag = 'warn' | 'stream' | 'ir' | null;

export interface ReadSkater {
  id: string; name: string; num: number | null; pos: Pos; slot: Slot; club: string | null;
  games: boolean[]; b2b: boolean; schedule_value: number; flag: Flag; reason: string;
  ppg: number; projected_pts: number; note: string | null;
  /** Per day of the window: null, or the opponent and how hard that night is for this player (attack for a goalie, defence for a skater). */
  nights: ({ opponent: string; home: boolean; difficulty: number | null } | null)[];
}
/** One skater's share of games in hand. `games` is the analyst's count; the screen never sums bits. */
export interface Tally { id: string; name: string; games: number; b2b: boolean; projected_pts: number }

export interface Read {
  contract_version: '0.1';
  analysis_id: string;
  generated_at: string;
  window: { start: string; end: string; days: number; labels: string[]; label: string; previous: string; next: string };
  skaters: ReadSkater[];
  calls: { start: string[]; sit: string[]; stream: string[]; ir: string[] };
  games_in_hand: { you: number; opp: number | null; take: string; counted: string; detail: { you: Tally[]; opp: Tally[] | null } };
  verdicts: { ids: string[]; line: string }[];
  take: string;
  source: { analyst: string; data: string[] };
  notes?: string[];
}
export interface ReadIceOptions {
  look_ahead_days?: number;
  /** YYYY-MM-DD; the first day of the window. Defaults to today. */
  today?: string;
  opponent?: StoredPlayer[];
  notes?: string[];
  now?: Date;
}

// ---- small helpers ----
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The window in words: "Oct 5 – 11", "Sep 29 – Oct 5", "Dec 29 – Jan 4". The screen shows this and formats nothing. */
export function windowLabel(start: string, end: string): string {
  const a = new Date(`${start}T12:00:00Z`); const b = new Date(`${end}T12:00:00Z`);
  const am = MONTH[a.getUTCMonth()]; const bm = MONTH[b.getUTCMonth()];
  if (start === end) return `${am} ${a.getUTCDate()}`;
  return am === bm && a.getUTCFullYear() === b.getUTCFullYear() ? `${am} ${a.getUTCDate()} – ${b.getUTCDate()}` : `${am} ${a.getUTCDate()} – ${bm} ${b.getUTCDate()}`;
}
const label = (date: string): string => DAY[new Date(`${date}T12:00:00Z`).getUTCDay()];
const round = (n: number, places: number): number => Math.round(n * 10 ** places) / 10 ** places;
const POS: Record<string, Pos> = { C: 'C', L: 'LW', LW: 'LW', R: 'RW', RW: 'RW', D: 'D', G: 'G' };
export const toPos = (p: string | undefined): Pos => POS[String(p ?? '').toUpperCase()] ?? 'C';
const surname = (name: string): string => name.trim().split(/\s+/).pop() ?? name;
const ACTIVE: Slot[] = ['L1', 'L2', 'D1', 'D2'];
const POS_TOKENS = new Set(['C', 'L', 'LW', 'R', 'RW', 'D', 'G']);
/** The position to slot by: the paste's own, when it named one (fantasy eligibility), else the NHL's. */
export const posOf = (p: StoredPlayer): Pos => {
  const s = String(p.slot ?? '').toUpperCase();
  return POS_TOKENS.has(s) ? toPos(s) : toPos(p.position);
};

function hash(parts: string[]): string {
  let h = 5381;
  for (const ch of parts.join('|')) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 6);
}

/** Schedule value, 0–100: games in the window against four, less twenty for a back-to-back. */
export function scheduleValue(games: number, b2b: boolean): number {
  return Math.max(0, Math.round((Math.min(games, 4) / 4) * 100) - (b2b ? 20 : 0));
}

/**
 * Put a pasted roster into lineup slots. Explicit BN / IR from the paste are honoured; everyone else fills
 * L1 (LW C RW), L2, D1 (D D), D2, G in paste order; the overflow sits on the bench.
 */
export function assignSlots(players: StoredPlayer[]): Map<string, Slot> {
  const slots = new Map<string, Slot>();
  const open: Record<string, Pos[]> = { L1: ['LW', 'C', 'RW'], L2: ['LW', 'C', 'RW'], D1: ['D', 'D'], D2: ['D', 'D'], G: ['G'] };
  for (const p of players) {
    const s = String(p.slot ?? '').toUpperCase();
    if (s === 'BN') slots.set(p.player_id, 'BN');
    else if (s.startsWith('IR')) slots.set(p.player_id, 'IR');
  }
  for (const p of players) {
    if (slots.has(p.player_id)) continue;
    const pos = posOf(p);
    const slot = Object.keys(open).find((k) => open[k].includes(pos));
    if (slot) { open[slot].splice(open[slot].indexOf(pos), 1); slots.set(p.player_id, slot as Slot); }
    else slots.set(p.player_id, 'BN');
  }
  return slots;
}

/** Build the Read for these players. Loads the NHL schedule and stats first; refuses if the schedule is unavailable. */
export async function readIce(players: StoredPlayer[], opts: ReadIceOptions = {}): Promise<Read> {
  await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load(), NHL_SCHEDULE.loadStandings()]);
  if (!NHL_SCHEDULE.isAvailable()) {
    throw new Error(`read_ice needs the NHL schedule and it is unavailable: ${NHL_SCHEDULE.getUnavailableReason() ?? 'unknown reason'}`);
  }
  if (!players.length) throw new Error('read_ice needs at least one resolved player.');

  const days = Math.min(14, Math.max(1, Math.round(opts.look_ahead_days ?? 7)));
  if (opts.today && !/^\d{4}-\d{2}-\d{2}$/.test(opts.today)) throw new Error(`start must be a date like 2026-10-05, not "${opts.today}".`);
  const start = opts.today ?? NhlScheduleService.today();
  const dates = Array.from({ length: days }, (_, i) => NhlScheduleService.addDays(start, i));
  const end = dates[days - 1];
  const span = days === 7 ? 'this week' : `in the next ${days} days`;
  const slots = assignSlots(players);

  const skaters: ReadSkater[] = players.map((p) => {
    const club = toNhlTricode(p.team);
    const slot = slots.get(p.player_id) ?? 'BN';
    const pos = posOf(p);
    const onIr = slot === 'IR';
    const games = dates.map((d) => (!onIr && club ? NHL_SCHEDULE.hasGameOn(club, d) : false));
    const n = games.filter(Boolean).length;
    const b2b = !onIr && club ? NHL_SCHEDULE.countBackToBacks(club, start, end) > 0 : false;
    const nhl = NHL_STATS.getById(p.player_id);
    const stats = nhl?.stats;
    const ppg = pos !== 'G' && stats?.games_played ? round((stats.points ?? 0) / stats.games_played, 2) : 0;
    const flag: Flag = onIr ? 'ir' : slot === 'BN' ? (n >= 4 && !b2b ? 'stream' : null) : n <= 2 || b2b ? 'warn' : null;
    const gamesByDate = new Map((!onIr && club ? NHL_SCHEDULE.getGamesInRange(club, start, end) : []).map((g) => [g.date, g]));
    const nights = dates.map((d) => {
      const g = gamesByDate.get(d);
      if (!g) return null;
      const st = NHL_SCHEDULE.getTeamStrength(g.opponent);
      return { opponent: g.opponent, home: g.home, difficulty: st ? (pos === 'G' ? st.attack : st.difficulty) : null };
    });
    const softNights = nights.filter((x) => x && x.difficulty !== null && (x.difficulty as number) < 40).length;
    const reason = onIr ? 'on injured reserve' : pos === 'G' && n > 0 ? `${n} game${n === 1 ? '' : 's'}${b2b ? ', back-to-back' : ''}, ${softNights} against weak attacks` : b2b ? `${n} games, back-to-back` : `${n} game${n === 1 ? '' : 's'} ${span}`;
    return {
      id: p.player_id, name: surname(p.name), num: nhl?.sweater_number ?? null, pos, slot, club, games, b2b,
      schedule_value: onIr ? 0 : scheduleValue(n, b2b), flag, reason, ppg,
      projected_pts: round(ppg * n, 1), note: onIr ? 'on injured reserve' : null, nights,
    };
  });

  const byId = new Map(skaters.map((s) => [s.id, s]));
  const gp = (s: ReadSkater): number => s.games.filter(Boolean).length;
  const active = skaters.filter((s) => ACTIVE.includes(s.slot));
  const ranked = [...active].sort((a, b) => b.schedule_value - a.schedule_value || b.projected_pts - a.projected_pts);
  const lineGames = active.reduce((a, s) => a + gp(s), 0);
  const startIds = ranked.filter((s) => s.schedule_value >= 50).slice(0, 2).map((s) => s.id);
  const weakest = ranked.length > 2 ? ranked[ranked.length - 1] : undefined;
  const sitIds = lineGames > 0 && weakest && weakest.schedule_value < 50 ? [weakest.id] : [];
  const streamIds = skaters.filter((s) => s.flag === 'stream').sort((a, b) => b.schedule_value - a.schedule_value || b.projected_pts - a.projected_pts).map((s) => s.id);
  const irIds = skaters.filter((s) => s.slot === 'IR').map((s) => s.id);

  const verdicts: Read['verdicts'] = skaters.map((s) => ({
    ids: [s.id],
    line: s.slot === 'IR' ? "He's in the box. Nothing to run back."
      : gp(s) >= 3 ? `${gp(s)} games. That's the whole argument.`
      : `${gp(s)} game${gp(s) === 1 ? '' : 's'}. That's the whole problem.`,
  }));
  const pair = (a: ReadSkater, b: ReadSkater) => {
    const d = gp(a) - gp(b);
    return { ids: [a.id, b.id], line: d > 0 ? `${a.name} skates ${d} more. Start him.` : d < 0 ? `${b.name} actually has more games. Flip it.` : 'Even on games. Go with the hotter stick.' };
  };
  const sit = sitIds[0] ? byId.get(sitIds[0]) : undefined;
  if (sit) {
    for (const id of [...startIds, ...streamIds]) {
      const a = byId.get(id);
      if (a && a.id !== sit.id) verdicts.push(pair(a, sit));
    }
  }

  const bestStream = streamIds[0] ? byId.get(streamIds[0]) : undefined;
  const take = lineGames === 0
    ? `Nobody in your lineup plays ${span}. Either the season hasn't started or you've pasted the wrong team.`
    : sit && bestStream
    ? `Your bench has ${bestStream.name} at ${gp(bestStream)} games and your lineup is carrying ${sit.name} at ${gp(sit)}. Fix it before puck drop.`
    : sit
      ? `${sit.name} is the soft spot at ${gp(sit)} game${gp(sit) === 1 ? '' : 's'}. Nobody on the bench beats him, so live with it.`
      : `Lineup's carrying ${lineGames} games. Keep it, and stop tinkering.`;

  const tallyOf = (s: ReadSkater): Tally => ({ id: s.id, name: s.name, games: gp(s), b2b: s.b2b, projected_pts: s.projected_pts });
  const yours = skaters.filter((s) => s.slot !== 'IR').map(tallyOf);
  const you = yours.reduce((a, t) => a + t.games, 0);
  let theirs: Tally[] | null = null;
  if (opts.opponent) {
    theirs = opts.opponent.flatMap((p) => {
      const club = toNhlTricode(p.team);
      if (!club || String(p.slot ?? '').toUpperCase().startsWith('IR')) return [];
      const games = NHL_SCHEDULE.countGamesInRange(club, start, end);
      const stats = NHL_STATS.getById(p.player_id)?.stats;
      const ppg = toPos(p.position) !== 'G' && stats?.games_played ? round((stats.points ?? 0) / stats.games_played, 2) : 0;
      return [{ id: p.player_id, name: surname(p.name), games, b2b: NHL_SCHEDULE.countBackToBacks(club, start, end) > 0, projected_pts: round(ppg * games, 1) }];
    });
  }
  const opp: number | null = theirs ? theirs.reduce((a, t) => a + t.games, 0) : null;
  const edge = opp == null ? null : you - opp;
  const gihTake = opp == null
    ? `${you} games on the board. Paste the other guy's roster and I'll tell you the edge.`
    : edge! > 0 ? `Edge +${edge}. Volume wins ${span}; stream into it.`
    : edge! < 0 ? `Edge ${edge}. They out-schedule you ${span}. Quality over quantity.`
    : 'Dead even. Win it on the ice, not the calendar.';

  const read: Read = {
    contract_version: '0.1',
    analysis_id: `read-${start}-${days}d-${hash(skaters.map((s) => s.id))}`,
    generated_at: (opts.now ?? new Date()).toISOString(),
    window: {
      start, end, days, labels: dates.map(label),
      label: windowLabel(start, end),
      previous: NhlScheduleService.addDays(start, -days),
      next: NhlScheduleService.addDays(start, days),
    },
    skaters,
    calls: { start: startIds, sit: sitIds, stream: streamIds, ir: irIds },
    games_in_hand: { you, opp, take: gihTake, counted: 'Everyone not on injured reserve, bench included.', detail: { you: yours, opp: theirs } },
    verdicts,
    take,
    source: {
      analyst: `chirp@${getVersion()}`,
      data: [
        `NHL api-web club-schedule-season ${NHL_SCHEDULE.getSeason() ?? 'unknown season'}`,
        NHL_STATS.isAvailable() ? `NHL club stats ${NHL_STATS.getSeasons().stats ?? 'unknown season'}` : 'NHL club stats unavailable; ppg and projected_pts are 0',
        'schedule_value: games in the window against four, less twenty for a back-to-back',
      ],
    },
  };
  if (opts.notes?.length) read.notes = opts.notes;
  return read;
}

/** The pasted-text entry: resolve names, note what did not resolve, build the Read. */
export async function readIceFromText(
  rosterText: string,
  opts: { look_ahead_days?: number; opponent_text?: string; today?: string; now?: Date } = {},
): Promise<Read> {
  await NHL_STATS.load();
  if (!NHL_STATS.isAvailable()) {
    throw new Error(`read_ice needs the NHL player index and it is unavailable: ${NHL_STATS.getUnavailableReason() ?? 'unknown reason'}`);
  }
  const report = ROSTER_STORE.parseRoster(rosterText);
  if (!report.resolved.length) throw new Error('No players resolved from the pasted lineup. One player per line, any format.');
  const notes = [
    ...report.unresolved.map((u) => `Not resolved: "${u.line}" (${u.reason})`),
    ...report.ambiguous.map((a) => `Ambiguous: "${a.line}" could be ${a.candidates.join(', ')}`),
  ];
  let opponent: StoredPlayer[] | undefined;
  if (opts.opponent_text?.trim()) {
    const o = ROSTER_STORE.parseRoster(opts.opponent_text);
    opponent = o.resolved;
    notes.push(...o.unresolved.map((u) => `Opponent, not resolved: "${u.line}" (${u.reason})`));
  }
  return readIce(report.resolved, { look_ahead_days: opts.look_ahead_days, today: opts.today, now: opts.now, opponent, notes });
}
