#!/usr/bin/env node
/**
 * 🔍 Yahoo shape verification
 *
 * Yahoo's Fantasy JSON is irregular and undocumented in places, so the draft
 * and stats parsers were written defensively against several possible shapes.
 * This script calls the real endpoints against your league and reports which
 * shape actually came back, so those parsers can be tightened.
 *
 * Run after `node authenticate.js`:
 *   npm run verify:yahoo
 *
 * Read-only. It fetches, reports, and writes nothing back to Yahoo.
 * Raw payloads are saved locally to .yahoo-verify/ (git-ignored) so you can
 * inspect or share them — check them for anything you'd rather not paste.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { YahooApiClient } from '../build/services/YahooApiClient.js';
import { applyStatCategories, getStatIdLabels, FALLBACK_STAT_ID_LABELS } from '../build/domain/yahoo-stats.js';

dotenv.config();

const { YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, YAHOO_LEAGUE_ID, YAHOO_TEAM_ID } = process.env;

if (!YAHOO_CLIENT_ID || !YAHOO_CLIENT_SECRET || !YAHOO_LEAGUE_ID) {
  console.error('❌ Missing YAHOO_CLIENT_ID / YAHOO_CLIENT_SECRET / YAHOO_LEAGUE_ID in .env');
  process.exit(1);
}

const OUT_DIR = '.yahoo-verify';
fs.mkdirSync(OUT_DIR, { recursive: true });

const client = new YahooApiClient(YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET);

function save(name, payload) {
  const file = path.join(OUT_DIR, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function describe(value, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return `object{${keys.slice(0, 8).join(', ')}${keys.length > 8 ? ', …' : ''}}`;
  }
  return typeof value;
}

async function step(label, fn) {
  process.stdout.write(`\n── ${label}\n`);
  try {
    await fn();
  } catch (error) {
    console.log(`   ❌ ${error.message}`);
  }
}

console.log('🔍 Verifying Yahoo Fantasy API shapes against your league\n');
console.log(`   League: ${YAHOO_LEAGUE_ID}   Team: ${YAHOO_TEAM_ID ?? '(unset)'}`);

// ── 1. Stat categories: the authoritative stat_id mapping ───────────────────
await step('game/nhl/stat_categories — authoritative stat_id map', async () => {
  const payload = await client.getStatCategories();
  console.log(`   saved: ${save('stat_categories', payload)}`);

  const applied = applyStatCategories(payload);
  if (!applied) {
    console.log('   ⚠️  Could not parse a stat map from this payload — parser needs the real shape.');
    return;
  }

  const live = getStatIdLabels();
  console.log('   ✅ Yahoo stat_id → label:');
  for (const [id, label] of Object.entries(live)) {
    console.log(`      ${id.padStart(3)} = ${label}`);
  }

  console.log('\n   Fallback map comparison (the one analyze_trade has been using):');
  let mismatches = 0;
  for (const [id, label] of Object.entries(FALLBACK_STAT_ID_LABELS)) {
    const actual = live[id];
    if (actual !== label) {
      mismatches++;
      console.log(`      ⚠️  id ${id}: fallback says "${label}", Yahoo says "${actual ?? '(not a category)'}"`);
    }
  }
  console.log(mismatches === 0
    ? '      ✅ fallback map agrees with Yahoo'
    : `      ❌ ${mismatches} mismatch(es) — analyze_trade has been mislabelling these`);
});

// ── 2. League settings: playoff weeks + categories ──────────────────────────
await step('league/settings — playoff_start_week, end_week, start_date', async () => {
  const payload = await client.getLeagueSettings(YAHOO_LEAGUE_ID);
  console.log(`   saved: ${save('league_settings', payload)}`);

  const meta = payload?.fantasy_content?.league?.[0] ?? {};
  const settings = payload?.fantasy_content?.league?.[1]?.settings?.[0] ?? {};

  console.log(`   league[0] shape: ${describe(meta)}`);
  console.log(`   settings[0] shape: ${describe(settings)}`);
  console.log(`   start_date:          ${meta.start_date ?? '❌ NOT FOUND'}`);
  console.log(`   end_week:            ${meta.end_week ?? settings.end_week ?? '❌ NOT FOUND'}`);
  console.log(`   playoff_start_week:  ${settings.playoff_start_week ?? '❌ NOT FOUND'}`);
  console.log(`   num_teams:           ${meta.num_teams ?? '?'}`);

  if (!settings.playoff_start_week) {
    console.log('   ⚠️  schedule_value and chirp_draft_pick will fall back to an unresolved window.');
    console.log('      Search the saved JSON for "playoff_start_week" to find its real path.');
  }
});

// ── 3. Draft results ────────────────────────────────────────────────────────
await step('league/draftresults — board state', async () => {
  const payload = await client.getDraftResults(YAHOO_LEAGUE_ID);
  console.log(`   saved: ${save('draft_results', payload)}`);

  const container =
    payload?.fantasy_content?.league?.[1]?.draft_results ??
    payload?.fantasy_content?.league?.draft_results;

  if (!container) {
    console.log('   ⚠️  No draft_results at either expected path.');
    console.log('      Before your draft this is normal — Yahoo has nothing to return yet.');
    return;
  }

  const keys = Object.keys(container).filter(k => k !== 'count');
  console.log(`   container: ${describe(container)}`);
  console.log(`   picks found: ${container.count ?? keys.length}`);

  if (keys.length > 0) {
    const first = container[keys[0]]?.draft_result ?? container[keys[0]];
    console.log(`   first pick: ${JSON.stringify(first)}`);
    console.log(first?.player_key
      ? '   ✅ player_key present — board state will match the pool by id'
      : '   ❌ no player_key — chirp_draft_pick cannot match picks; pass already_drafted');
  }
});

// ── 4. Draft analysis (ADP) ─────────────────────────────────────────────────
await step('league/players/draft_analysis — ADP', async () => {
  const payload = await client.getPlayersWithDraftAnalysis(5, 0, 'ALL', YAHOO_LEAGUE_ID);
  console.log(`   saved: ${save('draft_analysis', payload)}`);

  const container =
    payload?.fantasy_content?.league?.[1]?.players ??
    payload?.fantasy_content?.league?.players;

  if (!container) {
    console.log('   ❌ No players container at either expected path.');
    return;
  }

  const keys = Object.keys(container).filter(k => k !== 'count');
  console.log(`   players returned: ${keys.length}`);

  let withAdp = 0;
  for (const key of keys) {
    const player = container[key]?.player;
    if (!player) continue;

    const identity = Array.isArray(player[0]) ? player[0] : [];
    const name = identity.find(i => i?.name)?.name?.full ?? '(no name)';

    const analysis =
      player[1]?.draft_analysis ??
      player[1]?.[0]?.draft_analysis ??
      (Array.isArray(player[1]) ? player[1].find(i => i?.draft_analysis)?.draft_analysis : undefined);

    if (analysis) {
      withAdp++;
      console.log(`   ✅ ${name}: avg_pick=${analysis.average_pick} avg_round=${analysis.average_round} pct_drafted=${analysis.percent_drafted}`);
    } else {
      console.log(`   ❌ ${name}: no draft_analysis found — player[1] is ${describe(player[1])}`);
    }
  }

  console.log(withAdp === keys.length
    ? '   ✅ ADP parser matches the live shape'
    : `   ⚠️  ${keys.length - withAdp}/${keys.length} players had no parseable draft_analysis`);
});

// ── 5. Batched player stats ─────────────────────────────────────────────────
await step('league/players/stats — batched season stats', async () => {
  const pool = await client.searchPlayers('C', 3, YAHOO_LEAGUE_ID);
  const ids = (pool.players ?? []).map(p => p.player_id).filter(Boolean);

  if (ids.length === 0) {
    console.log('   ⚠️  No players returned to test stats with.');
    return;
  }

  const stats = await client.getPlayersStats(ids, 'season', YAHOO_LEAGUE_ID);
  console.log(`   saved: ${save('player_stats', stats)}`);
  console.log(`   requested ${ids.length} ids, got stats for ${Object.keys(stats).length}`);

  console.log(Object.keys(stats).length === ids.length
    ? '   ✅ batched stats parser matches the live shape'
    : '   ⚠️  some ids returned no stats — check the saved payload');
});

console.log(`\n✅ Done. Raw payloads in ./${OUT_DIR}/ (git-ignored).`);
console.log('   Review them before sharing — then paste the console output above to tighten the parsers.\n');
