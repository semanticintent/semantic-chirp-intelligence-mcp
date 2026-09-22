/** The analyst's MCP face on the Worker: JSON-RPC over Streamable HTTP, stateless, one server per request. */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import worker from '../../src/edge.js';
import { NHL_SCHEDULE } from '../../src/services/NhlScheduleService.js';
import { NHL_STATS } from '../../src/services/NhlStatsService.js';
import { ROSTER_STORE } from '../../src/services/RosterStore.js';
import { setStateless } from '../../src/tools.js';

const env = { CORS_ORIGIN: 'https://sepiola.semanticintent.dev' } as any;
const rpc = (body: unknown, origin = 'https://sepiola.semanticintent.dev') =>
  worker.fetch(new Request('https://chirp-mcp.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', origin },
    body: JSON.stringify(body),
  }), env);

beforeAll(() => {
  vi.spyOn(NHL_SCHEDULE, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'loadStandings').mockResolvedValue(undefined);
  vi.spyOn(NHL_SCHEDULE, 'getGamesInRange').mockReturnValue([]);
  vi.spyOn(NHL_SCHEDULE, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_SCHEDULE, 'getSeason').mockReturnValue('20262027');
  vi.spyOn(NHL_SCHEDULE, 'hasGameOn').mockReturnValue(true);
  vi.spyOn(NHL_SCHEDULE, 'countBackToBacks').mockReturnValue(0);
  vi.spyOn(NHL_STATS, 'load').mockResolvedValue(undefined);
  vi.spyOn(NHL_STATS, 'isAvailable').mockReturnValue(true);
  vi.spyOn(NHL_STATS, 'getById').mockReturnValue(null);
  vi.spyOn(ROSTER_STORE, 'parseRoster').mockImplementation((text) => ({
    resolved: text.includes('Kadri') ? [{ player_id: 'kadri', name: 'Nazem Kadri', team: 'CGY', position: 'C' }] : [], unresolved: [], ambiguous: [], lines_read: 1,
  }));
});

describe('/mcp', () => {
  it('initializes', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe('semantic-chirp-intelligence-mcp');
    expect(res.headers.get('access-control-allow-origin')).toBe('https://sepiola.semanticintent.dev');
  });
  it('lists the 24 tools, each roster tool with roster_text', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const body = await res.json();
    expect(body.result.tools).toHaveLength(24);
    const ice = body.result.tools.find((t: any) => t.name === 'ice');
    expect(ice.inputSchema.properties).toHaveProperty('roster_text');
  });
  it('calls read_ice with a pasted roster and returns a Read', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'read_ice', arguments: { roster_text: 'Nazem Kadri C', start: '2026-10-12', look_ahead_days: 3 } } });
    const body = await res.json();
    expect(body.result.isError).toBeFalsy();
    const read = JSON.parse(body.result.content[0].text);
    expect(read.contract_version).toBe('0.1');
    expect(read.skaters[0].name).toBe('Kadri');
    expect(body.result.structuredContent.window.days).toBe(3);
  });
  it('refuses set_roster on the stateless host with instructions', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'set_roster', arguments: { roster_text: 'Nazem Kadri C' } } });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/keeps no state/);
  });
  it('health reports the MCP face', async () => {
    const res = await worker.fetch(new Request('https://chirp-mcp.test/health'), env);
    const body = await res.json();
    expect(body.mcp).toEqual({ endpoint: '/mcp', tools: 24, stateless: true });
    setStateless(false);
  });
});
