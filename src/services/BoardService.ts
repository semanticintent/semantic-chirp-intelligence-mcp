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
export interface Board {
  contract_version: '0.1'; kind: 'board'; generated_at: string;
  positions: Record<Pos, { tier: number; players: Prospect[] }[]>;
  dries_up: Record<Pos, string>;
  taken: number; take: string; not_included: string[];
  source: { analyst: string; data: string[] }; notes?: string[];
}

const surname = (n: string) => n.trim().split(/\s+/).pop() ?? n;

export async function buildBoard(opts: { drafted_text?: string; now?: Date } = {}): Promise<Board> {
  const kit = await callTool('draft_kit', {});
  const text = (kit.content[0] as { text: string }).text;
  const ai = JSON.parse(text)?.analysis_insights;
  if (!ai?.positions) throw new Error(`draft_kit did not return a board: ${text.slice(0, 200)}`);

  await NHL_STATS.load();
  const notes: string[] = [];
  const takenIds = new Set<string>();
  if (opts.drafted_text?.trim()) {
    const report = ROSTER_STORE.parseRoster(opts.drafted_text);
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
  return board;
}
