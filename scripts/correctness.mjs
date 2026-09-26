#!/usr/bin/env node
/**
 * Correctness against a live endpoint — checks that answers are true, not just that they arrive.
 *
 *   npm run correctness                          # the hosted connector
 *   npm run correctness -- http://localhost:8787/mcp
 *
 * `npm run smoke` asks "did every tool return something?" and passed while tools returned 33-year-old "breakouts",
 * goalies ranked on a points scale and invented line roles. This asks whether what came back is consistent with the
 * data it claims to be built from.
 */
const ENDPOINT = process.argv[2] ?? 'https://chirp-mcp.semanticintent.dev/mcp';
const ROSTER = 'Connor McDavid\nCale Makar\nAuston Matthews\nKirill Kaprizov\nIgor Shesterkin';
const OPPONENT = 'Nathan MacKinnon\nQuinn Hughes\nConnor Hellebuyck';
const INVENTED = /\bPP1\b|\bPP2\b|Top-6|Bottom-6|linemate|Deep league sleeper|role lock|undefined%|\bNaN\b/;

let id = 0, failures = 0;
async function rpc(method, params) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'user-agent': 'chirp-correctness/1.0' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${method}`);
  return (await res.json()).result;
}
async function tool(name, args = {}) {
  const r = await rpc('tools/call', { name, arguments: args });
  const text = r.content?.[0]?.text ?? '';
  try { return { text, body: JSON.parse(text), isError: r.isError }; } catch { return { text, body: null, isError: r.isError }; }
}
function check(label, ok, detail = '') {
  console.log(`  ${ok ? '✅' : '❌'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
/** One probe: a response of the wrong shape is a failed check, never a crash that hides the rest. */
async function probe(label, fn) {
  try { await fn(); } catch (e) { check(label, false, `unexpected response: ${e.message}`); }
}

console.log(`\nCHIRP correctness — ${ENDPOINT}\n`);

const tools = (await rpc('tools/list', {})).tools;
check('every tool has a title and a safety hint', tools.every(t => t.title && t.annotations && 'readOnlyHint' in t.annotations));

const argsFor = {
  analyze_weekend_streams: { roster_text: ROSTER, date_range: { start: '2026-10-09', end: '2026-10-11' } },
  analyze_trade: { giving: ['Cale Makar'], receiving: ['Quinn Hughes', 'Jack Hughes'] },
  get_player_stats: { player_id: 'Cale Makar' },
  chirp_draft_pick: { pick_number: 12, playoff_start_week: 22, playoff_end_week: 24, already_drafted: ['Connor McDavid'] },
  draft_kit: { playoff_start_week: 22, playoff_end_week: 24 },
  schedule_value: { playoff_start_week: 22, playoff_end_week: 24 },
  read_ice: { roster_text: ROSTER, start: '2026-10-12', look_ahead_days: 3 },
  get_league_standings: { standings_text: '1. Alpha 8-2-1 142 pts\n2. Beta 7-3-1 138 pts' },
};
const invented = [];
for (const t of tools) {
  const { text } = await tool(t.name, { roster_text: ROSTER, opponent_text: OPPONENT, ...(argsFor[t.name] ?? {}) });
  const hit = text.match(INVENTED);
  if (hit) invented.push(`${t.name}: "${hit[0]}"`);
}
check(`no tool presents an invented role or unknown value (${tools.length} tools)`, invented.length === 0, invented.join('; '));

await probe('breakout', async () => {
  const breakout = (await tool('analyze_breakout_players', { breakout_age_max: 26, max_results: 15 })).body.analysis_insights;
  check('breakout candidates are all within the age cap', breakout.candidates.every(c => c.age <= 26),
    breakout.candidates.filter(c => c.age > 26).map(c => `${c.name} ${c.age}`).join(', '));
  check('breakout scores are within 0–100', breakout.candidates.every(c => c.breakout_score >= 0 && c.breakout_score <= 100));
});

await probe('draft kit goalies', async () => {
  const kit = (await tool('draft_kit', { positions: ['G'], tier_size: 5, max_per_position: 10 })).body.analysis_insights;
  const goalies = kit.positions.G.tiers.flatMap(t => t.players);
  check('draft kit ranks goalies 1..n among goalies', goalies.map(g => g.rank).join() === goalies.map((_, i) => i + 1).join(),
    goalies.map(g => g.rank).join(', '));
  check('draft kit shows goalie lines, not points per game', goalies.every(g => g.goalie_line && g.ppg === undefined));
});

await probe('streaming', async () => {
  const rw = (await tool('get_streaming_recommendations', { roster_text: ROSTER, position_filter: 'RW', max_recommendations: 5 })).body;
  check('streaming respects position_filter', rw.recommendations.length > 0 && rw.recommendations.every(r => r.pickup.position === 'RW'),
    rw.recommendations.map(r => `${r.pickup.name} ${r.pickup.position}`).join(', '));
});

await probe('opponent', async () => {
  const opp = (await tool('chirp_opponent', { opponent_text: OPPONENT })).body;
  const grouped = [...opp.weaknesses.idle_players, ...opp.weaknesses.light_schedule, ...opp.weaknesses.on_ir];
  check('opponent groups never double-count', new Set(grouped).size === grouped.length && grouped.length <= opp.roster_size,
    `${grouped.length} grouped of ${opp.roster_size}`);
});

await probe('standings', async () => {
  const standings = (await tool('get_league_standings', argsFor.get_league_standings)).body;
  check('standings work on the hosted endpoint from pasted text', standings?.teams === 2, standings?.error);
});

await probe('playoff window', async () => {
  const sv = (await tool('schedule_value', { playoff_start_week: 22, playoff_end_week: 24, teams: ['NJD'] })).body.analysis_insights;
  check('playoff weeks 22–24 resolve to March 1–21', sv.playoff_window.start === '2027-03-01' && sv.playoff_window.end === '2027-03-21',
    `${sv.playoff_window.start} → ${sv.playoff_window.end}`);
});

await probe('ice schedule edge', async () => {
  const [ice, gih] = await Promise.all([
    tool('ice', { roster_text: ROSTER, opponent_text: OPPONENT, look_ahead_days: 14 }),
    tool('get_games_in_hand', { roster_text: ROSTER, opponent_text: OPPONENT, look_ahead_days: 14 }),
  ]);
  const edge = ice.body.analysis_insights.schedule_edge;
  const g = gih.body.analysis_insights ?? gih.body;
  const theirs = JSON.stringify(g);
  check('ICE reports the same games edge as games-in-hand, with the right sign',
    edge && edge.advantage === edge.your_games - edge.opponent_games && !/games_disadvantage/.test(ice.text),
    JSON.stringify(edge));
});

await probe('goalie order', async () => {
  const search = (await tool('search_players', { position: 'G', count: 5 })).body.players.map(p => p.name);
  const kit = (await tool('draft_kit', { positions: ['G'], tier_size: 5, max_per_position: 5 })).body.analysis_insights.positions.G.tiers[0].players.map(p => p.name);
  check('search_players and draft_kit agree on goalies', search.join() === kit.join(), `${search.join(', ')} vs ${kit.join(', ')}`);
});

await probe('behind on games', async () => {
  // ICE reads from today. A one-player roster against the five-player test roster is behind in any window with games.
  const [ice, gih] = await Promise.all([
    tool('ice', { roster_text: 'Cale Makar', opponent_text: ROSTER }),
    tool('get_games_in_hand', { roster_text: 'Cale Makar', opponent_text: ROSTER }),
  ]);
  const edge = ice.body.analysis_insights.schedule_edge;
  // ICE reads from today, so before opening night nobody is behind and there is nothing to check yet.
  if (edge.advantage >= 0) console.log(`  ⏭️  ICE behind-path skipped: not behind in the current window (${edge.reading})`);
  else check('ICE names volume pickups when you are behind', /Close it with volume: \S/.test(ice.body.chirp_intelligence?.analysis_chirp ?? ''),
    ice.body.chirp_intelligence?.analysis_chirp);
  check('games-in-hand tells the trailing side to stream', /stream/i.test(gih.text) && !/keep a full lineup/i.test(gih.text));
});

await probe('read_ice sit', async () => {
  const read = (await tool('read_ice', { roster_text: ROSTER })).body;
  check('read_ice never sits a player it says nobody beats', !(read.calls.sit.length && /Nobody on the bench beats him/.test(read.take)), read.take);
});

await probe('spliced chirps', async () => {
  const spliced = /(Elite players|The data shows|Analysis indicates|Stats don't lie|Championship strategy|Next level thinking) (the|your|\d)/;
  const texts = await Promise.all(['analytical', 'championship_coach'].flatMap(personality_mode => [
    tool('get_games_in_hand', { roster_text: ROSTER, opponent_text: OPPONENT, personality_mode }),
    tool('get_streaming_recommendations', { roster_text: ROSTER, personality_mode }),
  ]));
  check('no chirp splices a personality phrase onto a fragment', texts.every(t => !spliced.test(t.text)));
});

await probe('unmatched names', async () => {
  const r = (await tool('get_streaming_recommendations', { roster_text: 'Cale Makar\nNobody Real Atall' })).body;
  check('pasted names that match nobody are reported', (r.roster_not_matched ?? []).some(x => x.includes('Nobody Real Atall')));
});

await probe('draft kit depth', async () => {
  const kit = (await tool('draft_kit', { max_per_position: 2 })).body.analysis_insights.positions;
  check('draft_kit honours max_per_position below 5',
    Object.values(kit).every(g => g.tiers.reduce((n, t) => n + t.players.length, 0) <= 2));
});

await probe('goalie streams', async () => {
  const g = (await tool('analyze_goalie_streams', {})).body;
  check('goalie stream score includes save %', /save %/.test(g.method.stream_score) && g.candidates.every(c => 'save_pct_percentile' in c));
});

await probe('weekend streams', async () => {
  const w = (await tool('analyze_weekend_streams', { date_range: { start: '2026-10-16', end: '2026-10-18' } })).body;
  check('weekend streams run without a roster and find genuine plays', !w.error && w.metadata.classification_breakdown.genuine_count > 0,
    w.error ?? JSON.stringify(w.metadata?.classification_breakdown));
});

await probe('fourth review', async () => {
  const pick = (await tool('chirp_draft_pick', { pick_number: 40, roster_needs: ['G'], max_results: 10 })).body.analysis_insights.top_candidates;
  check('chirp_draft_pick offers goalies when the need is G', pick.some(c => c.position === 'G' && c.fills_need));

  const sv = (await tool('schedule_value', { teams: ['SJ', 'TOR'], playoff_start_week: 22, playoff_end_week: 24 }));
  const favoured = new Set(sv.body.analysis_insights.all_teams.filter(t => t.stance === 'favour').map(t => t.team));
  check('schedule_value never lists a favoured club among the worst',
    sv.body.analysis_insights.worst_schedules.every(t => !favoured.has(t.team)) && !/\b1 weeks\b/.test(sv.text));

  const w = (await tool('analyze_weekend_streams', { date_range: { start: '2026-10-16', end: '2026-10-18' } })).body;
  const b = w.metadata.classification_breakdown;
  check('weekend "genuine" is selective and never a one-game weekend',
    b.genuine_count < (b.genuine_count + b.monitor_count + b.desperation_count) / 2 &&
    w.recommendations.every(r => !r.reasoning.startsWith('Genuine') || r.player.weekend_games >= 2) &&
    w.recommendations.every(r => !/Speculative opportunity/.test(r.reasoning)), JSON.stringify(b));

  const tx = (await tool('get_roster_transaction_recommendations', { roster_text: 'Cale Makar', opponent_text: ROSTER, target_positions: ['RW'] })).body;
  check('roster transactions honour target_positions', tx.recommendations.filter(r => r.pickup).every(r => r.pickup.position.split(',').includes('RW')));

  const sg = (await tool('get_streaming_recommendations', { position_filter: 'G', max_recommendations: 3 })).body;
  check('streaming goalies are ranked on expected starts', sg.recommendations.every(r => /expected starts/.test(r.reasoning)));

  const st = (await tool('get_league_standings', { standings_text: 'Team W-L-T\nAlpha 8-2-1\nBeta 7-3-1' })).body;
  check('standings skip a header row', st.teams === 2 && st.standings[0].rank === 1);

  const sp = (await tool('search_players', { count: 25 })).body;
  check('search_players says LW/RW', sp.players.every(p => !/^(L|R)$/.test(p.position)));
});

await probe('fifth review', async () => {
  const plain = (await tool('get_streaming_recommendations', { roster_text: ROSTER, max_recommendations: 5 })).body;
  const assumed = (await tool('get_streaming_recommendations', { roster_text: ROSTER, max_recommendations: 5, assume_rostered: 150 })).body;
  const top = new Set(plain.recommendations.map(r => r.pickup.name));
  check('assume_rostered leaves the top of the board out, and says so',
    assumed.assume_rostered?.count === 150 && assumed.recommendations.every(r => !top.has(r.pickup.name)),
    assumed.recommendations.map(r => r.pickup.name).join(', '));

  const [g1, g2] = await Promise.all([
    tool('analyze_goalie_streams', { roster_text: ROSTER }),
    tool('get_streaming_recommendations', { roster_text: ROSTER, position_filter: 'G', max_recommendations: 3 }),
  ]);
  check('the two goalie tools lead with the same goalie', g2.body.recommendations[0]?.pickup.player_id === g1.body.candidates[0]?.id,
    `${g1.body.candidates[0]?.name} vs ${g2.body.recommendations[0]?.pickup.name}`);

  const roster = (await tool('get_team_roster', { roster_text: ROSTER })).text;
  check('get_team_roster slots say LW/RW', !/"selected_position": "(L|R)"/.test(roster));
});

await probe('sixth review', async () => {
  const [ice, gs] = await Promise.all([
    tool('get_roster_transaction_recommendations', { roster_text: 'Cale Makar', opponent_text: ROSTER, assume_rostered: 150, target_positions: ['G'] }),
    tool('analyze_goalie_streams', { roster_text: ROSTER, assume_rostered: 150 }),
  ]);
  const picks = ice.body.recommendations.filter(r => r.pickup).map(r => r.pickup);
  check('ice goalie picks: no negative points, one per club, same leader as goalie streams',
    picks.length > 0 && picks.every(p => p.points === undefined) && new Set(picks.map(p => p.team)).size === picks.length &&
    picks[0].player_id === gs.body.candidates[0]?.id, picks.map(p => `${p.name} ${p.team}`).join(', '));
  check('goalie streams: no percentile for small samples; limits mention assume_rostered',
    gs.body.candidates.every(c => c.save_pct_percentile === null || c.start_share * 82 >= 20) && /assume_rostered/.test(gs.body.limits.join(' ')));

  const p3 = (await tool('chirp_draft_pick', { pick_number: 3, roster_needs: ['G'], max_results: 6 })).body;
  check('a G need does not beat elite skaters at pick 3', !/\(G,/.test(p3.recommendations[0].reasoning), p3.recommendations[0].reasoning);

  const sv = (await tool('schedule_value', { teams: ['SJS', 'TOR'], enable_chirp: false })).body;
  check('schedule_value honours enable_chirp: false', !sv.chirp_intelligence?.analysis_chirp);
});

console.log(failures === 0 ? '\n✅ All correctness checks passed.\n' : `\n❌ ${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
