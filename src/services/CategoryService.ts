/**
 * League categories (D51 in Sepiola): rank players for the categories a league actually scores, not for points.
 *
 * The viewer pastes the league's categories in whatever form the platform shows them ("G, A, +/-, PPP, HIT, BLK",
 * "Goals (G), Hits (HIT)", one per line). Each category is measured per player against the league:
 *
 *   • Skaters: per game over last season, against every skater with at least MIN_GAMES games.
 *   • Goalies: counting categories (W, SV, SHO, GS) are season totals, because a fantasy goalie's value is his starts;
 *     rate categories (GAA, SV%) are z-scores weighted by starts against the average starter, so a hot backup does
 *     not outrank a workhorse. GAA and L count against.
 *
 * A player's value is the sum of his z-scores over the chosen categories in his group: each category counts once, as
 * it does in a head-to-head matchup, so a goalie carries the goalie categories' share and a skater the skaters'. (A
 * mean overrates goalies: their categories move together, a skater's pull apart.) Players under MIN_GAMES games are
 * left out and said to be.
 * Labels that cannot be read are returned, never guessed.
 */
import { NHL_STATS, type NhlPlayer, type PlayerStats } from './NhlStatsService.js';

export const MIN_GAMES = 20;

type Group = 'skater' | 'goalie';
interface CategoryDef {
  readonly key: string;
  readonly group: Group;
  readonly aliases: readonly string[];
  /** Per-player raw value, or null when the line lacks it. */
  readonly raw: (s: PlayerStats) => number | null;
  /** Higher is better unless false. */
  readonly higherIsBetter?: boolean;
  /** Goalie rate categories are weighted by starts. */
  readonly rate?: boolean;
}

const per = (n: number | undefined, s: PlayerStats) => n === undefined || !s.games_played ? null : n / s.games_played;
const total = (n: number | undefined) => n === undefined ? null : n;

export const CATEGORIES: readonly CategoryDef[] = [
  { key: 'G', group: 'skater', aliases: ['g', 'goals', 'goal'], raw: (s) => per(s.goals, s) },
  { key: 'A', group: 'skater', aliases: ['a', 'assists', 'assist'], raw: (s) => per(s.assists, s) },
  { key: 'P', group: 'skater', aliases: ['p', 'pts', 'points'], raw: (s) => per(s.points, s) },
  { key: '+/-', group: 'skater', aliases: ['+/-', 'plusminus', 'pm', '+-'], raw: (s) => per(s.plus_minus, s) },
  { key: 'PIM', group: 'skater', aliases: ['pim', 'penaltyminutes', 'penalties'], raw: (s) => per(s.penalty_minutes, s) },
  { key: 'PPP', group: 'skater', aliases: ['ppp', 'powerplaypoints', 'ppts'], raw: (s) => per(s.power_play_points, s) },
  { key: 'PPG', group: 'skater', aliases: ['ppg', 'powerplaygoals'], raw: (s) => per(s.power_play_goals, s) },
  { key: 'SHP', group: 'skater', aliases: ['shp', 'shorthandedpoints', 'shortandedpoints'], raw: (s) => per(s.short_handed_points, s) },
  { key: 'SHG', group: 'skater', aliases: ['shg', 'shorthandedgoals'], raw: (s) => per(s.short_handed_goals, s) },
  { key: 'GWG', group: 'skater', aliases: ['gwg', 'gamewinninggoals', 'gamewinners'], raw: (s) => per(s.game_winning_goals, s) },
  { key: 'SOG', group: 'skater', aliases: ['sog', 'shots', 'shotsongoal', 's'], raw: (s) => per(s.shots, s) },
  { key: 'HIT', group: 'skater', aliases: ['hit', 'hits'], raw: (s) => per(s.hits, s) },
  { key: 'BLK', group: 'skater', aliases: ['blk', 'blocks', 'blockedshots', 'bs'], raw: (s) => per(s.blocks, s) },
  { key: 'FW', group: 'skater', aliases: ['fw', 'fow', 'faceoffwins', 'faceoffswon'], raw: (s) => per(s.faceoff_wins, s) },
  { key: 'W', group: 'goalie', aliases: ['w', 'wins', 'win'], raw: (s) => total(s.wins) },
  { key: 'L', group: 'goalie', aliases: ['l', 'losses'], raw: (s) => total(s.losses), higherIsBetter: false },
  { key: 'GAA', group: 'goalie', aliases: ['gaa', 'goalsagainstaverage'], raw: (s) => total(s.goals_against_average), higherIsBetter: false, rate: true },
  { key: 'SV', group: 'goalie', aliases: ['sv', 'saves'], raw: (s) => total(s.saves) },
  { key: 'SV%', group: 'goalie', aliases: ['sv%', 'svpct', 'savepercentage', 'savepct'], raw: (s) => total(s.save_percentage), rate: true },
  { key: 'SHO', group: 'goalie', aliases: ['sho', 'so', 'shutouts', 'shutout'], raw: (s) => total(s.shutouts) },
  { key: 'GS', group: 'goalie', aliases: ['gs', 'gamesstarted', 'starts'], raw: (s) => total(s.games_started) },
];

const norm = (t: string) => t.toLowerCase().replace(/[\s_.\-]/g, '').replace(/percent(age)?/, '%');
const BY_ALIAS = new Map<string, CategoryDef>(CATEGORIES.flatMap((c) => c.aliases.map((a) => [norm(a), c] as const)));

export interface ParsedCategories { skater: string[]; goalie: string[]; unread: string[] }

/** Read a pasted category list. "Goals (G)" reads by its abbreviation; order and duplicates are tidied; unknown labels are kept to be named back. */
export function parseCategories(text: string): ParsedCategories {
  const out: ParsedCategories = { skater: [], goalie: [], unread: [] };
  for (const piece of String(text).split(/[,;\n\t|·]+/)) {
    const label = piece.trim();
    if (!label) continue;
    const abbrev = label.match(/\(([^)]+)\)\s*$/)?.[1];
    const def = (abbrev && BY_ALIAS.get(norm(abbrev))) || BY_ALIAS.get(norm(label.replace(/\([^)]*\)/g, '')));
    if (!def) { out.unread.push(label); continue; }
    if (!out[def.group].includes(def.key)) out[def.group].push(def.key);
  }
  return out;
}

export interface CategoryValue {
  readonly value: number;
  /** z per chosen category, in the order the league lists them. */
  readonly z: { cat: string; z: number }[];
  /** The three that say most about him, strongest first: "HIT +2.1 · BLK +1.4 · PPP −0.3". */
  readonly line: string;
}

export interface CategoryBoard {
  readonly categories: ParsedCategories;
  readonly values: Map<string, CategoryValue>;
  /** Players with a line but under MIN_GAMES games: not ranked for categories. */
  readonly too_few_games: Set<string>;
  readonly method: string;
  /** Categories the loaded stats do not carry (the league-wide service was down). */
  readonly missing: string[];
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const sd = (xs: number[], m: number) => Math.sqrt(mean(xs.map((x) => (x - m) ** 2))) || 1;
const signed = (z: number) => `${z < 0 ? '−' : '+'}${Math.abs(z).toFixed(1)}`;

export const METHOD =
  `Per game over last season for skaters, season totals for goalie counting categories; each category measured against ` +
  `every player in the group with ${MIN_GAMES}+ games (a z-score: 0 is league average, +1 is one standard deviation better). ` +
  `GAA and SV% are weighted by starts. A player's value is the sum across the league's categories, each counting once as in a matchup. No projections.`;

/** Value every player with enough games for these categories. Pure over NHL_STATS; call after NHL_STATS.load(). */
export function valueForCategories(parsed: ParsedCategories, players: NhlPlayer[] = NHL_STATS.getAll()): CategoryBoard {
  const values = new Map<string, CategoryValue>();
  const tooFew = new Set<string>();
  const missing: string[] = [];

  for (const group of ['skater', 'goalie'] as const) {
    const keys = parsed[group];
    if (!keys.length) continue;
    const pool = players.filter((p) => (p.position === 'G') === (group === 'goalie') && p.stats);
    const qualified = pool.filter((p) => (p.stats!.games_played ?? 0) >= MIN_GAMES);
    for (const p of pool) if (!qualified.includes(p)) tooFew.add(p.player_id);
    const avgStarts = mean(qualified.map((p) => p.stats!.games_started ?? p.stats!.games_played ?? 0)) || 1;

    const zs = new Map<string, { cat: string; z: number }[]>(qualified.map((p) => [p.player_id, []]));
    for (const key of keys) {
      const def = CATEGORIES.find((c) => c.key === key)!;
      const raws = qualified.map((p) => def.raw(p.stats!));
      if (raws.every((r) => r === null || r === 0)) { missing.push(key); continue; }
      const present = raws.filter((r): r is number => r !== null);
      const m = mean(present), s = sd(present, m);
      qualified.forEach((p, i) => {
        const r = raws[i];
        let z = r === null ? 0 : (r - m) / s;
        if (def.higherIsBetter === false) z = -z;
        if (def.rate) z *= Math.min(1.5, (p.stats!.games_started ?? p.stats!.games_played ?? 0) / avgStarts);
        zs.get(p.player_id)!.push({ cat: key, z: Number(z.toFixed(2)) });
      });
    }
    for (const [id, list] of zs) {
      if (!list.length) continue;
      const telling = [...list].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 3).sort((a, b) => b.z - a.z);
      values.set(id, {
        value: Number(list.reduce((a, x) => a + x.z, 0).toFixed(3)),
        z: list,
        line: telling.map((x) => `${x.cat} ${signed(x.z)}`).join(' · '),
      });
    }
  }
  return { categories: parsed, values, too_few_games: tooFew, method: METHOD, missing };
}
