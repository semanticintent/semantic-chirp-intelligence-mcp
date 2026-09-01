#!/usr/bin/env node
/**
 * 🚦 Preflight — is this server ready to run?
 *
 * v4 needs no credentials, no OAuth and no platform account, so this checks
 * only what actually matters: the build, the NHL public API, and whether a
 * roster has been provided yet.
 */

import fs from 'fs';
import path from 'path';

let failures = 0;
const ok = (m) => console.log(`  ✅ ${m}`);
const bad = (m) => { failures++; console.log(`  ❌ ${m}`); };
const info = (m) => console.log(`  ℹ️  ${m}`);

console.log('\n🚦 CHIRP preflight\n');

console.log('Build');
fs.existsSync('build/index.js')
  ? ok('build/index.js present')
  : bad('build/index.js missing — run `npm run build`');

console.log('\nNHL public API (no key required)');
for (const [label, url, check] of [
  ['schedule', 'https://api-web.nhle.com/v1/club-schedule-season/TOR/20262027',
    d => `${(d.games ?? []).filter(g => g.gameType === 2).length} regular-season games for TOR`],
  ['rosters', 'https://api-web.nhle.com/v1/roster/TOR/20262027',
    d => `${(d.forwards ?? []).length + (d.defensemen ?? []).length + (d.goalies ?? []).length} players on TOR`],
  ['standings', 'https://api-web.nhle.com/v1/standings/now',
    d => `${(d.standings ?? []).length} teams`]
]) {
  try {
    const res = await fetch(url);
    if (!res.ok) { bad(`${label}: HTTP ${res.status}`); continue; }
    ok(`${label} reachable — ${check(await res.json())}`);
  } catch (error) {
    bad(`${label} unreachable: ${error.message}`);
  }
}

for (const [dir, label] of [['.nhl-schedule-cache', 'NHL data cache'], ['.chirp-data', 'stored league data']]) {
  fs.existsSync(dir)
    ? info(`${label}: ${fs.readdirSync(dir).join(', ') || '(empty)'}`)
    : info(`${label}: none yet`);
}

console.log('\nYour league');
const rosterFile = path.join('.chirp-data', 'roster.json');
if (fs.existsSync(rosterFile)) {
  try {
    const r = JSON.parse(fs.readFileSync(rosterFile, 'utf8'));
    ok(`roster stored: "${r.label}" — ${r.players.length} players (updated ${r.updated_at})`);
  } catch {
    bad('roster file present but unreadable');
  }
} else {
  info('no roster yet — paste one with the `set_roster` tool, then everything else works');
}

console.log(
  failures === 0
    ? '\n✅ Preflight clean — no credentials needed.\n'
    : `\n❌ ${failures} check(s) failed.\n`
);
process.exit(failures === 0 ? 0 : 1);
