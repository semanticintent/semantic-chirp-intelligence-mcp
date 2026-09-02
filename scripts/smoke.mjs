#!/usr/bin/env node
/**
 * 💨 Smoke test — call every registered tool over stdio and classify the result.
 *
 * Distinguishes three outcomes:
 *   ✅ returned data      — worked
 *   🟡 clean error        — failed, but reported it properly
 *   💥 crash-like         — leaked a TypeError / undefined access to the client
 *
 * The point is the third category. A tool that throws a raw TypeError at an MCP
 * client during a live draft is unusable; one that says "Yahoo returned 403" is
 * merely blocked. Run this whenever Yahoo is unreachable — an outage is the
 * cheapest way to exercise every failure path at once.
 *
 *   npm run smoke
 */

import { spawn } from 'child_process';

const TOOLS = [
  ['set_roster', { roster_text: 'C\tAuston Matthews\tTOR - C\nD\tCale Makar\tCOL - D\nG\tIgor Shesterkin\tNYR - G\nLW\tKirill Kaprizov\tMIN - LW', team_name: 'Smoke Team' }],
  ['set_opponent_roster', { roster_text: 'Connor McDavid\nNathan MacKinnon\nQuinn Hughes', team_name: 'Smoke Opponent' }],
  ['set_standings', { standings_text: '1. Smoke Team 8-2-1 142 pts\n2. Smoke Opponent 7-3-1 138 pts' }],
  ['show_stored_data', {}],
  ['get_team_roster', {}],
  ['get_league_standings', {}],
  ['search_players', { position: 'C', count: 5 }],
  ['get_player_stats', { player_id: 'Cale Makar' }],
  ['compare_matchup', {}],
  ['optimize_lineup', {}],
  ['get_streaming_recommendations', {}],
  ['get_games_in_hand', {}],
  ['get_roster_transaction_recommendations', {}],
  ['ice', {}],
  ['governance_dashboard', {}],
  ['analyze_breakout_players', { max_results: 5 }],
  ['analyze_weekend_streams', { date_range: { start: '2026-10-09', end: '2026-10-11' } }],
  ['chirp_opponent', {}],
  ['analyze_trade', { giving: ['Cale Makar'], receiving: ['Quinn Hughes'] }],
  ['schedule_value', { teams: ['TOR', 'SEA'], playoff_start_week: 22, playoff_end_week: 24 }],
  ['chirp_draft_pick', { pick_number: 5, max_results: 5 }],
  ['draft_kit', { playoff_start_week: 22, playoff_end_week: 24, positions: ['C'], max_per_position: 6 }],
];

const proc = spawn(process.execPath, ['build/index.js'], { stdio: ['pipe', 'pipe', 'pipe'] });

let buf = '';
const results = new Map();
proc.stdout.on('data', d => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      if (typeof m.id === 'number' && m.id >= 100) results.set(m.id, m);
    } catch {}
  }
});

const send = o => proc.stdin.write(JSON.stringify(o) + '\n');
send({ jsonrpc:'2.0', id:1, method:'initialize', params:{ protocolVersion:'2024-11-05', capabilities:{}, clientInfo:{name:'t',version:'1'} } });
send({ jsonrpc:'2.0', method:'notifications/initialized' });
await new Promise(r => setTimeout(r, 1500));

for (let i = 0; i < TOOLS.length; i++) {
  const [name, args] = TOOLS[i];
  send({ jsonrpc:'2.0', id:100+i, method:'tools/call', params:{ name, arguments: args } });
  // The first four establish the league state everything else reads.
  if (i < 4) { const t0=Date.now(); while (!results.has(100+i) && Date.now()-t0 < 30000) await new Promise(r=>setTimeout(r,150)); }
}
await new Promise(r => setTimeout(r, 40000));

console.log('\nTool behaviour (v4 — no account, NHL public data only):\n');
let crashed = 0, degraded = 0, worked = 0, missing = 0;
TOOLS.forEach(([name], i) => {
  const m = results.get(100 + i);
  if (!m) { console.log(`  ⏳ ${name.padEnd(40)} NO RESPONSE`); missing++; return; }
  const text = m.result?.content?.[0]?.text ?? JSON.stringify(m.error ?? {});
  const isErr = m.result?.isError === true || Boolean(m.error);
  const has403 = /403|not authorized/i.test(text);
  const crashLike = /TypeError|undefined is not|Cannot read|is not a function/i.test(text);
  if (crashLike) { console.log(`  💥 ${name.padEnd(40)} CRASH-LIKE: ${text.slice(0,90).replace(/\n/g,' ')}`); crashed++; }
  else if (has403 || isErr) { console.log(`  🟡 ${name.padEnd(40)} clean error`); degraded++; }
  else { console.log(`  ✅ ${name.padEnd(40)} returned data`); worked++; }
});
console.log(`\n  ✅ ${worked} worked   🟡 ${degraded} degraded cleanly   💥 ${crashed} crash-like   ⏳ ${missing} no response`);
proc.kill();

// Only a crash-like response or a missing one is a failure. A clean error is
// the correct behaviour when the upstream API is unavailable.
process.exit(crashed > 0 || missing > 0 ? 1 : 0);
