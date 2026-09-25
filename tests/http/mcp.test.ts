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
  it('lists the 20 tools that can succeed here, each roster tool with roster_text', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const body = await res.json();
    // The four store-backed tools can only refuse on a stateless host, so they are not offered.
    expect(body.result.tools).toHaveLength(20);
    const names = body.result.tools.map((t: any) => t.name);
    for (const hidden of ['set_roster', 'set_opponent_roster', 'set_standings', 'show_stored_data']) {
      expect(names).not.toContain(hidden);
    }
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
  it('gives every listed tool a title and a read-only hint, as the directory requires', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/list' });
    const body = await res.json();
    for (const tool of body.result.tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
    }
  });
  it('limits /mcp on its own budget, separate from the page', async () => {
    const seen: string[] = [];
    const deny = { limit: vi.fn(async () => { seen.push('mcp'); return { success: false }; }) };
    const allow = { limit: vi.fn(async () => { seen.push('read'); return { success: true }; }) };
    const limited = { ...env, MCP_LIMIT: deny, READ_LIMIT: allow };

    const res = await worker.fetch(new Request('https://chirp-mcp.test/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'cf-connecting-ip': '203.0.113.9' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'tools/list' }),
    }), limited);

    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toMatch(/busy/);
    expect(seen).toEqual(['mcp']);            // the page's per-viewer budget was never touched
    expect(deny.limit).toHaveBeenCalledWith({ key: '203.0.113.9' });
  });
  it('health reports the MCP face', async () => {
    const res = await worker.fetch(new Request('https://chirp-mcp.test/health'), env);
    const body = await res.json();
    expect(body.mcp).toEqual({ endpoint: '/mcp', tools: 20, stateless: true });
    setStateless(false);
  });
});

describe('icon', () => {
  it('serves the icon as a PNG at the favicon paths', async () => {
    for (const path of ['/favicon.ico', '/favicon.png', '/apple-touch-icon.png']) {
      const res = await worker.fetch(new Request(`https://chirp-mcp.test${path}`), env);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      const bytes = new Uint8Array(await res.arrayBuffer());
      // PNG signature
      expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
  });

  it('declares the icon from the root page for fetchers that read HTML', async () => {
    const res = await worker.fetch(new Request('https://chirp-mcp.test/'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('rel="icon"');
  });
});
