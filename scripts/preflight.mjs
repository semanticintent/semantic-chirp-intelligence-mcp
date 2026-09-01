#!/usr/bin/env node
/**
 * 🚦 Preflight — is this server ready to talk to Yahoo?
 *
 * Checks configuration and connectivity without making any change.
 * Never prints secret values, only whether they are present and well-formed.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

let failures = 0;
const ok   = (m) => console.log(`  ✅ ${m}`);
const bad  = (m) => { failures++; console.log(`  ❌ ${m}`); };
const warn = (m) => console.log(`  ⚠️  ${m}`);

console.log('\n🚦 CHIRP preflight\n');

// ── 1. Build ────────────────────────────────────────────────────────────────
console.log('Build');
fs.existsSync('build/index.js')
  ? ok('build/index.js present')
  : bad('build/index.js missing — run `npm run build`');

// ── 2. Environment ──────────────────────────────────────────────────────────
console.log('\nEnvironment');
if (!fs.existsSync('.env')) {
  bad('.env missing — copy .env.example and fill it in');
} else {
  ok('.env present');
}

const required = ['YAHOO_CLIENT_ID', 'YAHOO_CLIENT_SECRET', 'YAHOO_LEAGUE_ID', 'YAHOO_TEAM_ID'];
for (const key of required) {
  const value = process.env[key];
  if (!value || value.includes('your_')) {
    bad(`${key} not set`);
    continue;
  }
  // Length only — never the value.
  ok(`${key} set (${value.length} chars)`);
}

const leagueId = process.env.YAHOO_LEAGUE_ID ?? '';
const teamId = process.env.YAHOO_TEAM_ID ?? '';
if (leagueId && !/^\d+$/.test(leagueId.replace(/^nhl\.l\./, ''))) {
  warn(`YAHOO_LEAGUE_ID "${leagueId}" is not numeric — expected the number from your team URL`);
}
if (teamId && !/^\d+$/.test(teamId)) {
  warn(`YAHOO_TEAM_ID "${teamId}" is not numeric — expected the number from your team URL`);
}

// ── 3. OAuth token ──────────────────────────────────────────────────────────
console.log('\nYahoo OAuth token');
const tokenPath = '.yahoo-oauth.json';
if (!fs.existsSync(tokenPath)) {
  bad(`${tokenPath} missing — run \`node authenticate.js\``);
} else {
  try {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    token.access_token ? ok('access_token present') : bad('access_token missing');
    token.refresh_token ? ok('refresh_token present') : bad('refresh_token missing — refresh will fail in 1 hour');

    if (token.expires_at) {
      const minutes = Math.round((token.expires_at - Date.now()) / 60000);
      minutes > 0
        ? ok(`access token valid for ~${minutes} more minute(s)`)
        : warn(`access token expired ${Math.abs(minutes)} minute(s) ago — it will auto-refresh on first call`);
    }
  } catch (error) {
    bad(`${tokenPath} is not valid JSON: ${error.message}`);
  }
}

// ── 4. NHL public API (no auth needed) ──────────────────────────────────────
console.log('\nNHL public API');
try {
  const response = await fetch('https://api-web.nhle.com/v1/club-schedule-season/TOR/20262027');
  if (response.ok) {
    const payload = await response.json();
    const regular = (payload.games ?? []).filter(g => g.gameType === 2);
    ok(`reachable — ${regular.length} regular-season games for TOR in 20262027`);
  } else {
    bad(`returned HTTP ${response.status}`);
  }
} catch (error) {
  bad(`unreachable: ${error.message}`);
}

const cacheDir = '.nhl-schedule-cache';
fs.existsSync(cacheDir)
  ? ok(`schedule cache present (${fs.readdirSync(cacheDir).join(', ')})`)
  : console.log('  ℹ️  no schedule cache yet — first call will build it (~350ms)');

// ── 5. Live Yahoo call ──────────────────────────────────────────────────────
console.log('\nYahoo API (live call)');
if (failures > 0) {
  console.log('  ⏭️  skipped — fix the failures above first');
} else {
  try {
    const { YahooApiClient } = await import('../build/services/YahooApiClient.js');
    const client = new YahooApiClient(process.env.YAHOO_CLIENT_ID, process.env.YAHOO_CLIENT_SECRET);

    const cleanLeague = leagueId.replace(/^nhl\.l\./, '');
    const data = await client.request(`/league/nhl.l.${cleanLeague}`);
    const league = data?.fantasy_content?.league?.[0];

    if (league?.name) {
      ok(`authenticated — league "${league.name}" (${league.num_teams} teams, season ${league.season})`);
      console.log(`     current week: ${league.current_week ?? '?'}   start: ${league.start_date ?? '?'}`);
    } else {
      warn('call succeeded but no league name found — check YAHOO_LEAGUE_ID');
    }
  } catch (error) {
    bad(`live call failed: ${error.message}`);
  }
}

console.log(
  failures === 0
    ? '\n✅ Preflight clean — ready to test.\n'
    : `\n❌ ${failures} check(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
