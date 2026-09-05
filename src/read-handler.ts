/**
 * The analyst's HTTP surface, independent of the server that carries it. Node's http (src/http.ts) and a
 * Cloudflare Worker (src/edge.ts) both hand requests here and get back a status and a JSON payload.
 */
import { readIceFromText } from './services/ReadIceService.js';
import { NHL_SCHEDULE } from './services/NhlScheduleService.js';

export interface HandlerResult { status: number; payload: unknown }

export const READ_SHAPE = 'POST /read { roster_text, look_ahead_days?, opponent_text?, start? }';

export async function handleReadRequest(method: string, pathname: string, bodyText: string): Promise<HandlerResult> {
  if (method === 'GET' && pathname === '/health') {
    return { status: 200, payload: { ok: true, analyst: 'chirp', season: NHL_SCHEDULE.getSeason(), read: READ_SHAPE } };
  }
  if (method === 'POST' && pathname === '/read') {
    let input: any;
    try { input = JSON.parse(bodyText || '{}'); }
    catch { return { status: 400, payload: { error: `Body must be JSON: ${READ_SHAPE.slice(11)}` } }; }
    if (typeof input.roster_text !== 'string' || !input.roster_text.trim()) {
      return { status: 400, payload: { error: 'roster_text is required — paste your lineup, one player per line.' } };
    }
    try {
      const read = await readIceFromText(input.roster_text, {
        look_ahead_days: typeof input.look_ahead_days === 'number' ? input.look_ahead_days : undefined,
        opponent_text: typeof input.opponent_text === 'string' ? input.opponent_text : undefined,
        today: typeof input.start === 'string' ? input.start : undefined,
      });
      return { status: 200, payload: read };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const clientFault = message.startsWith('No players resolved') || message.startsWith('start must be');
      return { status: clientFault ? 422 : 503, payload: { error: message } };
    }
  }
  return { status: 404, payload: { error: 'Not found. POST /read or GET /health.' } };
}
