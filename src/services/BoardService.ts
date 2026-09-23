/**
 * The draft board a screen can draw: draft_kit's tiers per position with stable NHL ids, a one-line note per prospect
 * in the analyst's words, players already drafted crossed off, where each position dries up, and what the kit cannot
 * know. Stateless: the drafted list travels in the request. Validates against Sepiola's contracts/board.schema.json.
 */
import { callTool } from '../tools.js';
import { NHL_STATS } from './NhlStatsService.js';
import { ROSTER_STORE } from './RosterStore.js';
import { getVersion } from '../version.js';

export const BOARD_POSITIONS = ['C', 'LW', 'RW', 'D', 'G'] as const;
type Pos = typeof BOARD_POSITIONS[number];

export interface Prospect { id: string; name: string; club: string; pos: Pos; rank: number; age: number | null; ppg: number; flags: string[]; note: string; taken: boolean }
/** The analyst's pick (D49): chirp_draft_pick against this draft, in its own order. `on_board` says whether the id sits in the columns above. */
export interface Pick { id: string; name: string; club: string; pos: Pos; why: string; on_board: boolean }
export interface BoardPick { on_clock: number; needs: Pos[]; take: string; picks: Pick[] }
/** What the board ranked for (D51), present when the request named the league's categories. */
export interface BoardScoring { categories: string[]; unread: string[]; missing: string[]; too_few_games: number; method: string }
export interface Board {
  contract_version: '0.1'; kind: 'board'; generated_at: string;
  positions: Record<Pos, { tier: number; players: Prospect[] }[]>;
  dries_up: Record<Pos, string>;
  taken: number; take: string; not_included: string[];
  source: { analyst: string; data: string[] }; notes?: string[]; pick?: BoardPick; scoring?: BoardScoring;
}

export interface BoardOptions {
  drafted_text?: string;
  /** Your own picks. Given, the analyst also answers who to take next. They count as drafted too. */
  mine_text?: string;
  /** The league's scoring categories. Given, the board and the pick rank for them instead of points. */
  categories?: string;
  playoff_start_week?: number;
  playoff_end_week?: number;
  now?: Date;
}

const surname = (n: string) => n.trim().split(/\s+/).pop() ?? n;

export async function buildBoard(opts: BoardOptions = {}): Promise<Board> {
  const categories = opts.categories?.trim() || undefined;
  const kit = await callTool('draft_kit', categories ? { categories } : {});
  const text = (kit.content[0] as { text: string }).text;
  const ai = JSON.parse(text)?.analysis_insights;
  if (!ai?.positions) throw new Error(`draft_kit did not return a board: ${text.slice(0, 200)}`);

  await NHL_STATS.load();
  const notes: string[] = [];
  const takenIds = new Set<string>();
  const drafted: { player_id: string; name: string; team: string; position: string }[] = [];
  const draftedAll = [opts.drafted_text, opts.mine_text].filter((t) => t?.trim()).join('\n');
  if (draftedAll.trim()) {
    const report = ROSTER_STORE.parseRoster(draftedAll);
    for (const p of report.resolved) { takenIds.add(p.player_id); drafted.push(p); }
    notes.push(...report.unresolved.map((u) => `Drafted, not resolved: "${u.line}" (${u.reason})`));
    notes.push(...report.ambiguous.map((a) => `Drafted, ambiguous: "${a.line}" could be ${a.candidates.join(', ')}`));
  }

  const positions = {} as Board['positions'];
  const dries = {} as Board['dries_up'];
  let taken = 0;
  const available: Prospect[] = [];
  for (const pos of BOARD_POSITIONS) {
    const block = ai.positions[pos === 'LW' ? 'LW' : pos] ?? { tiers: [] };
    positions[pos] = (block.tiers ?? []).map((t: any) => ({
      tier: Number(t.tier),
      players: (t.players ?? []).flatMap((p: any) => {
        const hit = p.id ? NHL_STATS.getById(String(p.id)) ?? NHL_STATS.resolve(p.name).player : NHL_STATS.resolve(p.name).player;
        if (!hit) return [];
        const isTaken = takenIds.has(hit.player_id);
        if (isTaken) taken++;
        const prospect: Prospect = {
          id: hit.player_id, name: surname(p.name), club: p.team, pos, rank: Number(p.rank),
          age: typeof p.age === 'number' ? p.age : null, ppg: Number(p.ppg ?? 0), flags: Array.isArray(p.flags) ? p.flags : [],
          note: p.categories
            ? `${p.categories}${p.flags?.length ? `; ${p.flags[0]}` : ''}.`
            : pos === 'G'
            ? `Tier ${t.tier} goalie, rank ${p.rank}${p.flags?.length ? `; ${p.flags[0]}` : ''}.`
            : `${p.ppg} points a game last season${typeof p.age === 'number' ? `, age ${Math.floor(p.age)}` : ''}${p.flags?.length ? `; ${p.flags[0]}` : ''}.`,
          taken: isTaken,
        };
        if (!isTaken) available.push(prospect);
        return [prospect];
      }),
    }));
    dries[pos] = block.dries_up_after ? `Thins out after ${block.dries_up_after}.` : 'No clear drop-off.';
  }

  // Drafted players the columns do not hold (a short last season, a depth pick) still count, and are named.
  const onBoard = new Set(Object.values(positions).flatMap((tiers) => tiers.flatMap((t) => t.players.map((p) => p.id))));
  const below = drafted.filter((p, i, all) => !onBoard.has(p.player_id) && all.findIndex((q) => q.player_id === p.player_id) === i);
  notes.push(...below.map((p) => `Drafted, below the columns: ${p.name} (${p.position}, ${p.team})`));
  const off = below.length
    ? `${taken + below.length} off the board, ${below.length} of them below the columns.`
    : `${taken} off the board.`;
  const best = available.sort((a, b) => a.rank - b.rank)[0];
  const board: Board = {
    contract_version: '0.1', kind: 'board', generated_at: (opts.now ?? new Date()).toISOString(),
    positions, dries_up: dries, taken,
    take: best ? `${off} Best left: ${best.name} (${best.pos}, ${best.club}), rank ${best.rank}.` : `${off} Nobody left on it.`,
    not_included: Array.isArray(ai.not_included) ? ai.not_included : [],
    source: { analyst: `chirp@${getVersion()}`, data: [ai.source, ai.schedule_source].filter(Boolean).map(String) },
  };
  if (ai.scoring) {
    board.scoring = {
      categories: ai.scoring.categories, unread: ai.scoring.unread ?? [], missing: ai.scoring.missing ?? [],
      too_few_games: Number(ai.scoring.too_few_games ?? 0), method: String(ai.scoring.method ?? ''),
    };
    notes.push(...board.scoring.unread.map((u) => `Category not read: "${u}"`));
    notes.push(...board.scoring.missing.map((m) => `No ${m} numbers in the loaded stats; ranked without it`));
  }
  if (ai.lines_note) notes.push(String(ai.lines_note));
  if (notes.length) board.notes = notes;
  if (opts.mine_text?.trim()) board.pick = await pickFor(opts, draftedAll, positions);
  return board;
}

/** Surname plus the fantasy position the board uses; the NHL says L/R, a candidate may list several. */
const boardPos = (position: string): Pos => {
  const first = String(position).split(',')[0].trim().toUpperCase().replace(/^L$/, 'LW').replace(/^R$/, 'RW');
  return (BOARD_POSITIONS as readonly string[]).includes(first) ? first as Pos : 'C';
};

async function pickFor(opts: BoardOptions, draftedAll: string, positions: Board['positions']): Promise<BoardPick> {
  const result = await callTool('chirp_draft_pick', {
    roster_text: opts.mine_text,
    already_drafted: draftedAll.split('\n').map((l) => l.trim()).filter(Boolean),
    playoff_start_week: opts.playoff_start_week,
    playoff_end_week: opts.playoff_end_week,
    categories: opts.categories?.trim() || undefined,
    max_results: 3,
    enable_chirp: true,
  });
  const text = (result.content[0] as { text: string }).text;
  const ai = JSON.parse(text)?.analysis_insights;
  if (!ai?.top_candidates) throw new Error(`chirp_draft_pick did not return candidates: ${text.slice(0, 200)}`);

  const onBoard = new Set(Object.values(positions).flatMap((tiers) => tiers.flatMap((t) => t.players.map((p) => p.id))));
  return {
    on_clock: Number(ai.pick_number),
    needs: (ai.roster_needs ?? []).map(boardPos).filter((p: Pos, i: number, all: Pos[]) => all.indexOf(p) === i),
    take: String(ai.take ?? ''),
    picks: ai.top_candidates.map((c: any) => ({
      id: String(c.player_id), name: surname(c.name), club: c.team, pos: boardPos(c.position),
      // The reasoning opens with "Name (POS, CLUB) — "; the card already shows those.
      why: String(c.reasoning).split(' — ').slice(1).join(' — ').replace(/^./, (ch) => ch.toUpperCase()),
      on_board: onBoard.has(String(c.player_id)),
    })),
  };
}
