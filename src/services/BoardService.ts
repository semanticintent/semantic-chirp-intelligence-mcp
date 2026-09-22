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
export interface Board {
  contract_version: '0.1'; kind: 'board'; generated_at: string;
  positions: Record<Pos, { tier: number; players: Prospect[] }[]>;
  dries_up: Record<Pos, string>;
  taken: number; take: string; not_included: string[];
  source: { analyst: string; data: string[] }; notes?: string[]; pick?: BoardPick;
}

export interface BoardOptions {
  drafted_text?: string;
  /** Your own picks. Given, the analyst also answers who to take next. They count as drafted too. */
  mine_text?: string;
  playoff_start_week?: number;
  playoff_end_week?: number;
  now?: Date;
}

const surname = (n: string) => n.trim().split(/\s+/).pop() ?? n;

export async function buildBoard(opts: BoardOptions = {}): Promise<Board> {
  const kit = await callTool('draft_kit', {});
  const text = (kit.content[0] as { text: string }).text;
  const ai = JSON.parse(text)?.analysis_insights;
  if (!ai?.positions) throw new Error(`draft_kit did not return a board: ${text.slice(0, 200)}`);

  await NHL_STATS.load();
  const notes: string[] = [];
  const takenIds = new Set<string>();
  const draftedAll = [opts.drafted_text, opts.mine_text].filter((t) => t?.trim()).join('\n');
  if (draftedAll.trim()) {
    const report = ROSTER_STORE.parseRoster(draftedAll);
    for (const p of report.resolved) takenIds.add(p.player_id);
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
        const hit = NHL_STATS.resolve(p.name).player;
        if (!hit) return [];
        const isTaken = takenIds.has(hit.player_id);
        if (isTaken) taken++;
        const prospect: Prospect = {
          id: hit.player_id, name: surname(p.name), club: p.team, pos, rank: Number(p.rank),
          age: typeof p.age === 'number' ? p.age : null, ppg: Number(p.ppg ?? 0), flags: Array.isArray(p.flags) ? p.flags : [],
          note: pos === 'G'
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

  const best = available.sort((a, b) => a.rank - b.rank)[0];
  const board: Board = {
    contract_version: '0.1', kind: 'board', generated_at: (opts.now ?? new Date()).toISOString(),
    positions, dries_up: dries, taken,
    take: best ? `${taken} off the board. Best left: ${best.name} (${best.pos}, ${best.club}), rank ${best.rank}.` : `${taken} off the board. Nobody left on it.`,
    not_included: Array.isArray(ai.not_included) ? ai.not_included : [],
    source: { analyst: `chirp@${getVersion()}`, data: [ai.source, ai.schedule_source].filter(Boolean).map(String) },
  };
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
