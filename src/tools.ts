/**
 * The tool registry: every tool ChirpIQX offers, defined once, served by two transports.
 *
 *   - src/index.ts  → stdio, for Claude Desktop / Codex / any local MCP client
 *   - src/edge.ts   → Streamable HTTP at /mcp on Cloudflare Workers, stateless
 *
 * TOOL_DEFINITIONS is the list; callTool(name, args) runs one. Both transports derive from these and nothing else,
 * so a tool exists in exactly one place.
 */
// ==========================================
// 📦 Imports - Organized by Domain
// ==========================================

// Core MCP
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

import { getVersion } from './version.js';
import { RosterStore, type TransientRosters } from './services/RosterStore.js';

// Domain layer
import type {
  ChirpParameters,
  SemanticChirpContract
} from './domain/types.js';

import {
  GOVERNANCE_MONITOR,
  validateSemanticChirpContract,
  auditSemanticContract,
  checkGovernanceHealth
} from './domain/governance.js';

// Config layer
import { CHIRP_STYLES } from './config/chirp-styles.js';
import { PERSONALITY_MODES } from './config/personality-modes.js';
import { TOOL_METADATA } from './config/tool-metadata.js';

// Services layer
import { ChirpIntelligence } from './services/ChirpIntelligence.js';

// Analysis layer
import { IceAnalysis } from './analyses/IceAnalysis.js';
import { GamesInHandAnalysis } from './analyses/GamesInHandAnalysis.js';
import { StreamingAnalysis } from './analyses/StreamingAnalysis.js';
import { LineupAnalysis } from './analyses/LineupAnalysis.js';
import { WeekendStreamAnalysis } from './analyses/WeekendStreamAnalysis.js';

import { BreakoutAnalysis } from './analyses/BreakoutAnalysis.js';
import { ScheduleValueAnalysis } from './analyses/ScheduleValueAnalysis.js';
import { DraftPickAnalysis } from './analyses/DraftPickAnalysis.js';
import { DraftKitAnalysis } from './analyses/DraftKitAnalysis.js';
import { NHL_STATS } from './services/NhlStatsService.js';
import { ROSTER_STORE } from './services/RosterStore.js';
import { rankGoalies } from './domain/goalie-rank.js';
import { LEAGUE_DATA, LeagueDataService, NO_ROSTER_MESSAGE, NO_OPPONENT_MESSAGE } from './services/LeagueDataService.js';
import { NHL_SCHEDULE, NhlScheduleService } from './services/NhlScheduleService.js';
import { readIce, readIceFromText } from './services/ReadIceService.js';
import { goalieStreams } from './services/GoalieStreamService.js';
import { candidateLine, fantasyPosition } from './domain/positions.js';



// Configuration


// ==========================================
// 🔧 MCP Tool Schema Base
// ==========================================

// Base chirp schema for MCP tool definitions
const baseChirpSchema = {
  chirp_intensity: {
    type: "string",
    enum: ["gentle", "standard", "savage", "ice_cold"],
    description: "Level of chirp intensity in responses (default: standard)"
  },
  personality_mode: {
    type: "string",
    enum: ["analytical", "motivational", "roast_master", "championship_coach"],
    description: "Chirp personality style for responses (default: analytical)"
  },
  enable_chirp: {
    type: "boolean",
    description: "Enable chirp intelligence in responses (default: true)"
  }
};

// ==========================================
// 🏗️ Service Initialization
// ==========================================


// Initialize analysis instances
const iceAnalysis = new IceAnalysis();
const gamesInHandAnalysis = new GamesInHandAnalysis();
const streamingAnalysis = new StreamingAnalysis();
const lineupAnalysis = new LineupAnalysis();
const breakoutAnalysis = new BreakoutAnalysis();
const scheduleValueAnalysis = new ScheduleValueAnalysis();
const draftPickAnalysis = new DraftPickAnalysis();
const draftKitAnalysis = new DraftKitAnalysis();
const weekendStreamAnalysis = new WeekendStreamAnalysis();




// Tool: Get Team Roster
async function getTeamRoster() {
  await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load()]);

  const roster = LEAGUE_DATA.getRoster();
  if (!roster) return { error: NO_ROSTER_MESSAGE };

  const today = NhlScheduleService.today();
  const weekEnd = NhlScheduleService.addDays(today, 6);

  return {
    team_name: roster.team_name,
    player_count: roster.players.length,
    players: roster.players.map((p: any) => ({
      ...p,
      games_next_7_days: NHL_SCHEDULE.isAvailable()
        ? NHL_SCHEDULE.countGamesInRange(p.team, today, weekEnd)
        : null,
      season_stats: p.stats ?? null
    })),
    data_source: `NHL public API (rosters ${NHL_STATS.getSeasons().roster}, stats ${NHL_STATS.getSeasons().stats})`
  };
}

// Tool: Get League Standings
async function getLeagueStandings(standingsText?: string) {
  // Pasted standings win, and are the only route on the stateless hosted endpoint, which stores nothing.
  if (standingsText && standingsText.trim()) {
    const rows = ROSTER_STORE.parseStandings(standingsText);
    if (rows.length === 0) return { error: 'No standings rows could be read from that text — paste one team per line.' };
    return { teams: rows.length, standings: rows, source: 'pasted in this call' };
  }

  const standings = isStateless() ? null : LEAGUE_DATA.getStandings();
  if (!standings) {
    return {
      error: isStateless()
        ? 'This endpoint keeps no state. Pass your league standings as standings_text — copy the standings table ' +
          'from your league, one team per line.'
        : 'No standings stored. Pass them as standings_text, or save them with `set_standings` — copy the standings ' +
          'table from your league, one team per line.'
    };
  }

  return {
    teams: standings.rows.length,
    standings: standings.rows,
    updated_at: standings.updated_at
  };
}

// Tool: Get Current Matchup
// Removed in v4: getCurrentMatchup required live fantasy-platform data
// (live matchup scoring, weekly results, or league ownership) that no
// public source exposes. See CHANGELOG for the full list.

// Tool: Search Players
async function searchPlayers(position?: string, count: number = 25) {
  await NHL_STATS.load();
  if (!NHL_STATS.isAvailable()) {
    return { error: 'NHL player data unavailable', reason: NHL_STATS.getUnavailableReason() };
  }

  // Fantasy platforms say LW/RW; the NHL says L/R.
  const wanted = String(position ?? '').toUpperCase()
    .replace(/^LW$/, 'L').replace(/^RW$/, 'R');

  const owned = new Set((LEAGUE_DATA.getRoster()?.players ?? []).map((p: any) => p.player_id));

  const shape = (p: any) => ({
    player_id: p.player_id,
    name: p.name,
    team: p.team,
    // Every other tool says LW/RW; this one returned the NHL's L/R.
    position: fantasyPosition(p.position),
    on_your_roster: owned.has(p.player_id),
    season_stats: p.stats ?? null,
  });
  const n = Math.max(1, count);

  // Skaters rank on points; goalies on the shared wins/SV%/GAA blend. The two are never sorted on one scale — a
  // 39-win goalie is not comparable to a 39-point skater — so a search across all positions lists them separately.
  const all = NHL_STATS.getAll();
  const skaters = all.filter(p => p.position !== 'G' && (!wanted || p.position === wanted))
    .sort((a, b) => (b.stats?.points ?? 0) - (a.stats?.points ?? 0));
  const goalies = rankGoalies(all.filter(p => p.position === 'G'));

  const players = (wanted === 'G' ? goalies : skaters).slice(0, n).map(shape);
  const extra = wanted ? {} : { goalies: goalies.slice(0, Math.min(n, 10)).map(shape) };

  return {
    position: position ?? 'all',
    returned: players.length,
    players,
    ...extra,
    ranking: wanted === 'G'
      ? 'Goalies with 20+ games on a blend of wins, save percentage and GAA; lighter workloads follow.'
      : 'Skaters by points' + (wanted ? '.' : '; goalies listed separately on a blend of wins, SV% and GAA.'),
    note: 'Ranked by last season production across all NHL players. Whether a player ' +
          'is available in your league is league-private and not knowable here — ' +
          (LEAGUE_DATA.getRoster() ? 'on_your_roster marks players on the roster you gave.' : 'Pass roster_text to mark your own players.'),
    data_source: `NHL public API (stats ${NHL_STATS.getSeasons().stats})`
  };
}

// Tool: Get Player Stats
async function getPlayerStats(playerId: string) {
  await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load()]);

  // Accept an NHL id or, far more usefully, a name a human would type.
  const direct = NHL_STATS.getById(playerId);
  const resolution = direct ? { player: direct } : NHL_STATS.resolve(playerId);

  if (!resolution.player) {
    const r = resolution as any;
    return {
      error: `Could not resolve "${playerId}" to a single NHL player`,
      reason: r.reason,
      ...(r.ambiguous ? { candidates: r.ambiguous.map(candidateLine) } : {})
    };
  }

  const p = resolution.player;
  const today = NhlScheduleService.today();

  return {
    player_id: p.player_id,
    name: p.name,
    team: p.team,
    position: p.position,
    season_stats: p.stats ?? null,
    stats_season: NHL_STATS.getSeasons().stats,
    games_next_7_days: NHL_SCHEDULE.isAvailable()
      ? NHL_SCHEDULE.countGamesInRange(p.team, today, NhlScheduleService.addDays(today, 6))
      : null,
    upcoming: NHL_SCHEDULE.isAvailable()
      ? NHL_SCHEDULE.getGamesInRange(p.team, today, NhlScheduleService.addDays(today, 13)).slice(0, 6)
      : []
  };
}

// Tool: Get Weekly Stats
// Removed in v4: getWeeklyStats required live fantasy-platform data
// (live matchup scoring, weekly results, or league ownership) that no
// public source exposes. See CHANGELOG for the full list.

// Tool: Compare Matchup
async function compareMatchup() {
  await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load()]);

  const mine = LEAGUE_DATA.getRoster();
  const theirs = LEAGUE_DATA.getOpponentRoster();

  if (!mine) return { error: NO_ROSTER_MESSAGE };
  if (!theirs) return { error: NO_OPPONENT_MESSAGE };

  const today = NhlScheduleService.today();
  const weekEnd = NhlScheduleService.addDays(today, 6);

  const summarize = (roster: any) => {
    const totals: Record<string, number> = { G: 0, A: 0, P: 0, '+/-': 0, PIM: 0, SOG: 0, PPG: 0, W: 0 };
    let games = 0;

    for (const p of roster.players) {
      if (p.selected_position === 'IR') continue;
      const s = p.stats ?? {};
      totals.G += s.goals ?? 0;
      totals.A += s.assists ?? 0;
      totals.P += s.points ?? 0;
      totals['+/-'] += s.plus_minus ?? 0;
      totals.PIM += s.penalty_minutes ?? 0;
      totals.SOG += s.shots ?? 0;
      totals.PPG += s.power_play_goals ?? 0;
      totals.W += s.wins ?? 0;
      games += NHL_SCHEDULE.isAvailable() ? NHL_SCHEDULE.countGamesInRange(p.team, today, weekEnd) : 0;
    }

    return { team_name: roster.team_name, totals, games_this_week: games };
  };

  const you = summarize(mine);
  const them = summarize(theirs);

  const categories = Object.keys(you.totals).map(cat => {
    const a = you.totals[cat];
    const b = them.totals[cat];
    return { category: cat, you: Math.round(a * 10) / 10, opponent: Math.round(b * 10) / 10,
             edge: a === b ? 'EVEN' : a > b ? 'YOU' : 'OPPONENT' };
  });

  const won = categories.filter(c => c.edge === 'YOU').length;

  return {
    your_team: you.team_name,
    opponent: them.team_name,
    categories,
    category_edge: `${won}-${categories.filter(c => c.edge === 'OPPONENT').length}`,
    schedule: {
      your_games_this_week: you.games_this_week,
      opponent_games_this_week: them.games_this_week,
      advantage: you.games_this_week - them.games_this_week
    },
    basis: `Last season totals (${NHL_STATS.getSeasons().stats}) as a proxy for current strength, ` +
           'plus real games scheduled this week. Not live scoring — this compares roster ' +
           'quality and volume, not what has actually happened in your matchup.'
  };
}


// ==========================================
// 🏒 Chirp Intelligence Engine
// ==========================================

function generateContextualChirp(
  toolName: string,
  data: any,
  chirpStyle: any,
  personality: any
): string {
  const metadata = TOOL_METADATA[toolName];

  if (!metadata) return "";

  switch (metadata.chirp_potential) {
    case "roster_weaknesses":
      return generateRosterChirp(data, chirpStyle, personality);
    case "schedule_domination":
      return generateScheduleChirp(data, chirpStyle, personality);
    case "brutal_optimization":
      return generateOptimizationChirp(data, chirpStyle, personality);
    case "weekly_performance":
      return generateWeeklyPerformanceChirp(data, chirpStyle, personality);
    case "pickup_strategy":
      return generatePickupStrategyChirp(data, chirpStyle, personality);
    default:
      return generateGenericChirp(data, chirpStyle, personality);
  }
}

function generateRosterChirp(data: any, chirpStyle: any, personality: any): string {
  const injured = data.roster?.filter((p: any) => p.status && p.status !== "").length || 0;

  if (injured > 0 && chirpStyle.tone === "brutal_truth") {
    return `${chirpStyle.prefix} you've got ${injured} injured players mucking up your lineup. That's not championship material! ${chirpStyle.suffix}`;
  }

  if (injured > 0 && chirpStyle.tone === "encouraging") {
    return `${chirpStyle.prefix} moving those ${injured} injured players to IR to optimize your roster. ${chirpStyle.suffix}`;
  }

  if (injured > 0 && chirpStyle.tone === "championship_enforcer") {
    return `${chirpStyle.prefix} ${injured} injured players dragging down your roster. Champions handle their IR like pros. ${chirpStyle.suffix}`;
  }

  return `${personality.phrases[0]} your team composition looks solid.`;
}

function generateScheduleChirp(data: any, chirpStyle: any, personality: any): string {
  const advantage = data.advantage;
  const diff = Math.abs(data.games_in_hand_difference || 0);

  if (advantage === "opponent" && chirpStyle.tone === "brutal_truth") {
    return `${chirpStyle.prefix} your opponent has ${diff} more games than you and you're just sitting there? Time to drop the mittens and get aggressive! ${chirpStyle.suffix}`;
  }

  if (advantage === "you" && chirpStyle.tone === "championship_enforcer") {
    return `${chirpStyle.prefix} You've got ${diff} more games. This is where champions separate from the pretenders. ${chirpStyle.suffix}`;
  }

  if (advantage === "you" && chirpStyle.tone === "direct_honest") {
    return `${chirpStyle.prefix} capitalize on your ${diff}-game advantage ${chirpStyle.suffix}`;
  }

  return `${personality.phrases[0]} the schedule advantage situation.`;
}

function generateOptimizationChirp(data: any, chirpStyle: any, personality: any): string {
  const criticalIssues = data.immediate_issues || 0;
  const recommendations = data.recommendations?.length || 0;

  if (criticalIssues > 0 && chirpStyle.tone === "brutal_truth") {
    return `${chirpStyle.prefix} you've got ${criticalIssues} critical lineup issues and ${recommendations} ways to fix them. Stop window shopping and start dominating! ${chirpStyle.suffix}`;
  }

  if (criticalIssues === 0 && chirpStyle.tone === "championship_enforcer") {
    return `${chirpStyle.prefix} Your lineup is solid but ICE found ${recommendations} ways to push you over the top. ${chirpStyle.suffix}`;
  }

  if (recommendations > 5 && chirpStyle.tone === "direct_honest") {
    return `${chirpStyle.prefix} execute these ${recommendations} optimizations ${chirpStyle.suffix}`;
  }

  return `${personality.phrases[0]} ${recommendations} optimization opportunities to consider.`;
}

function generateWeeklyPerformanceChirp(data: any, chirpStyle: any, personality: any): string {
  const yourGames = data.games_in_hand?.your_remaining || 0;
  const oppGames = data.games_in_hand?.opponent_remaining || 0;

  if (yourGames > oppGames && chirpStyle.tone === "championship_enforcer") {
    return `${chirpStyle.prefix} You've got more games left - time to bury them. ${chirpStyle.suffix}`;
  }

  if (yourGames < oppGames && chirpStyle.tone === "brutal_truth") {
    return `${chirpStyle.prefix} they've got more games - every stat matters now! ${chirpStyle.suffix}`;
  }

  return `${personality.phrases[0]} your weekly matchup positioning.`;
}

function generatePickupStrategyChirp(data: any, chirpStyle: any, personality: any): string {
  const targets = data.streaming_targets?.length || 0;
  const hotTeam = data.market_intelligence?.top_trending_team || "unknown";

  if (targets > 10 && chirpStyle.tone === "championship_enforcer") {
    return `${chirpStyle.prefix} ${targets} targets identified. Focus on ${hotTeam} players for maximum impact. ${chirpStyle.suffix}`;
  }

  if (targets > 10 && chirpStyle.tone === "brutal_truth") {
    return `${chirpStyle.prefix} ${targets} players better than what you've got - are you here to compete or participate? ${chirpStyle.suffix}`;
  }

  return `${personality.phrases[0]} ${targets} streaming opportunities on the wire.`;
}

function generateGenericChirp(data: any, chirpStyle: any, personality: any): string {
  return `${personality.phrases[0]} the data patterns. ${chirpStyle.prefix} taking action based on these insights. ${chirpStyle.suffix}`;
}

function generateIntentSummary(data: any, personality: any): string {
  switch (personality.focus) {
    case "championship_mindset":
      return "Championship strategy: Execute these moves for league domination";
    case "data_driven":
      return "Statistical analysis: Data-driven recommendations for optimal performance";
    case "entertainment_value":
      return "Bottom line: Time to separate the contenders from the pretenders";
    case "winning_strategy":
      return "Elite strategy: Next-level moves for next-level results";
    default:
      return "Action required: Strategic improvements identified";
  }
}

function generateICETruth(data: any, chirpStyle: any): string {
  if (chirpStyle.tone === "championship_enforcer") {
    return "❄️ ICE Cold Truth: Champions make moves, pretenders make excuses.";
  }
  if (chirpStyle.tone === "brutal_truth") {
    return "🔥 Savage Reality: Your competition isn't waiting - neither should you.";
  }
  if (chirpStyle.tone === "direct_honest") {
    return "💪 Real Talk: Smart players act on good intel.";
  }
  return "🧠 Smart Play: Optimal decisions lead to optimal results.";
}

function enhanceWithChirpIntelligence(
  toolName: string,
  originalData: any,
  chirpOptions: ChirpParameters = {}
) {
  // 🏛️ Semantic Anchoring (Rule 2): Validate semantic contract before processing
  const semanticContract: SemanticChirpContract = {
    ...chirpOptions,
    semantic_intent: chirpOptions.enable_chirp === false ? "user_requested" : "system_default",
    tool_context: toolName
  };

  validateSemanticChirpContract(semanticContract, toolName);

  // 🛡️ Semantic Anchoring (Rule 4): Freeze semantic contract to prevent violations
  const frozenChirpOptions = Object.freeze({...chirpOptions});

  // 🔍 Phase 5: Audit immutability enforcement
  auditSemanticContract(semanticContract, toolName, "enforcement");

  // 🛡️ Protected semantic contract with Proxy for runtime enforcement
  const protectedChirpOptions = new Proxy(frozenChirpOptions, {
    set() {
      // 📊 Phase 5: Track immutability violation
      GOVERNANCE_MONITOR.trackViolation({
        rule: "Rule 4 - Immutability Protection",
        severity: "error",
        tool_name: toolName,
        violation_type: "attempted_mutation",
        details: "Attempted to set property on immutable ChirpParameters"
      });
      throw new Error('🚨 Semantic contract violation: ChirpParameters are immutable after creation');
    },
    deleteProperty() {
      // 📊 Phase 5: Track immutability violation
      GOVERNANCE_MONITOR.trackViolation({
        rule: "Rule 4 - Immutability Protection",
        severity: "error",
        tool_name: toolName,
        violation_type: "attempted_property_deletion",
        details: "Attempted to delete property from immutable ChirpParameters"
      });
      throw new Error('🚨 Semantic contract violation: Cannot delete ChirpParameters properties');
    }
  });

  if (protectedChirpOptions.enable_chirp === false) {
    return originalData;
  }

  const metadata = TOOL_METADATA[toolName];
  if (!metadata) {
    return originalData;
  }

  const chirpStyle = CHIRP_STYLES[protectedChirpOptions.chirp_intensity || 'standard'];
  const personality = PERSONALITY_MODES[protectedChirpOptions.personality_mode || 'analytical'];

  return {
    // Original data preserved
    ...originalData,

    // NEW: Chirp Intelligence Layer
    chirp_intelligence: {
      // 🎯 Semantic Anchoring (Rule 1): Use observable semantic property instead of string comparison
      tool_identity: metadata.is_ice_engine
        ? metadata.tool_semantic_identity
        : `${toolName} with chirp intelligence`,
      style: chirpStyle.tone,
      personality: personality.voice,
      intensity: protectedChirpOptions.chirp_intensity || 'standard',
      semantic_context: metadata.hockey_context,

      // Dynamic chirp based on data
      analysis_chirp: generateContextualChirp(toolName, originalData, chirpStyle, personality),

      // Intent-driven one-liner
      intent_summary: generateIntentSummary(originalData, personality),

      // Hockey wisdom
      ice_cold_truth: generateICETruth(originalData, chirpStyle)
    },

    // Discovery metadata
    metadata: {
      tool_tags: metadata.discovery_tags,
      intent_category: metadata.intent_category,
      chirp_energy: chirpStyle.energy,
      hockey_wisdom_level: "ICE_tier",
      semantic_depth: "enhanced"
    }
  };
}

// Helper functions




// Tool: Get Games In Hand
// ==========================================
// 🗑️ Legacy Functions Removed - Phase 4
// ==========================================
// The following functions have been migrated to Template Method Pattern classes:
// - getGamesInHand() → GamesInHandAnalysis
// - optimizeLineup() → LineupAnalysis
// - getStreamingRecommendations() → StreamingAnalysis
// ==========================================

// Tool: Get Trending Players
// Removed in v4: getTrendingPlayers required live fantasy-platform data
// (live matchup scoring, weekly results, or league ownership) that no
// public source exposes. See CHANGELOG for the full list.

// Tool: Chirp Opponent
async function chirpOpponent(chirpIntensity = 'savage', personalityMode = 'roast_master') {
  await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load()]);

  const theirs = LEAGUE_DATA.getOpponentRoster();
  if (!theirs) return { error: NO_OPPONENT_MESSAGE };

  const today = NhlScheduleService.today();
  const weekEnd = NhlScheduleService.addDays(today, 6);

  const players = theirs.players.map((p: any) => ({
    name: p.name,
    team: p.team,
    position: p.position,
    slot: p.selected_position,
    points_last_season: p.stats?.points ?? null,
    games_this_week: NHL_SCHEDULE.isAvailable()
      ? NHL_SCHEDULE.countGamesInRange(p.team, today, weekEnd)
      : null
  }));

  const onIr = players.filter(p => p.slot === 'IR');
  const idle = players.filter(p => p.games_this_week === 0 && p.slot !== 'IR');
  // Disjoint from `idle`: a player with no games was previously also counted as light, so three players could
  // produce "1 don't play … 3 more on two games or fewer".
  const light = players.filter(p => p.games_this_week !== null && p.games_this_week >= 1 && p.games_this_week <= 2 && p.slot !== 'IR');
  const totalGames = players.reduce((n, p) => n + (p.games_this_week ?? 0), 0);

  const style = (CHIRP_STYLES as any)[chirpIntensity] ?? (CHIRP_STYLES as any).standard;
  const persona = (PERSONALITY_MODES as any)[personalityMode] ?? (PERSONALITY_MODES as any).analytical;

  const lines: string[] = [];
  if (idle.length) lines.push(`${idle.length} of their players ${idle.length === 1 ? "doesn't" : "don't"} play at all this week. Free real estate.`);
  if (light.length) {
    const lead = idle.length ? `${light.length} more` : `${light.length} of their players`;
    lines.push(`${lead} ${light.length === 1 ? 'plays' : 'play'} only once or twice.`);
  }
  if (onIr.length) lines.push(`${onIr.length} parked on IR — that roster is holding a hospital ward.`);
  if (!lines.length) lines.push(`${theirs.team_name} is actually well set up this week. Annoying, but true.`);

  return {
    opponent: theirs.team_name,
    roster_size: players.length,
    total_games_this_week: totalGames,
    weaknesses: { idle_players: idle.map(p => p.name), light_schedule: light.map(p => p.name), on_ir: onIr.map(p => p.name) },
    players,
    chirp: lines.join(' '),
    chirp_style: style?.tone,
    personality: persona?.voice,
    basis: 'Real NHL schedule for this week, plus the opponent roster you pasted.'
  };
}

// Tool: Analyze Trade
async function analyzeTradeImpact(giving: string[], receiving: string[], chirpIntensity = 'standard') {
  await Promise.all([NHL_STATS.load(), NHL_SCHEDULE.load()]);

  if (!NHL_STATS.isAvailable()) {
    return { error: 'NHL player data unavailable', reason: NHL_STATS.getUnavailableReason() };
  }

  const categories = ['G', 'A', 'P', '+/-', 'PIM', 'SOG', 'PPG', 'W', 'GAA', 'SV%'];
  const lowerIsBetter = new Set(['GAA']);

  const resolveSide = (names: string[]) => names.map(n => {
    const r = NHL_STATS.resolve(n);
    return {
      input: n,
      found: Boolean(r.player),
      name: r.player?.name ?? n,
      team: r.player?.team ?? '?',
      position: r.player?.position ?? '?',
      stats: r.player?.stats ?? null,
      ...(r.ambiguous ? { candidates: r.ambiguous.map(candidateLine) } : {}),
      ...(r.player ? {} : { reason: r.reason })
    };
  });

  const sum = (side: any[]) => {
    const totals: Record<string, number> = {};
    const rates: Record<string, number[]> = {};

    for (const p of side.filter(x => x.found && x.stats)) {
      const s = p.stats;
      totals.G = (totals.G ?? 0) + (s.goals ?? 0);
      totals.A = (totals.A ?? 0) + (s.assists ?? 0);
      totals.P = (totals.P ?? 0) + (s.points ?? 0);
      totals['+/-'] = (totals['+/-'] ?? 0) + (s.plus_minus ?? 0);
      totals.PIM = (totals.PIM ?? 0) + (s.penalty_minutes ?? 0);
      totals.SOG = (totals.SOG ?? 0) + (s.shots ?? 0);
      totals.PPG = (totals.PPG ?? 0) + (s.power_play_goals ?? 0);
      totals.W = (totals.W ?? 0) + (s.wins ?? 0);
      // Rate stats average rather than sum, and only across goalies who have them.
      if (s.goals_against_average !== undefined) (rates.GAA ??= []).push(s.goals_against_average);
      if (s.save_percentage !== undefined) (rates['SV%'] ??= []).push(s.save_percentage);
    }

    for (const [cat, values] of Object.entries(rates)) {
      if (values.length) totals[cat] = values.reduce((a, b) => a + b, 0) / values.length;
    }
    return totals;
  };

  const givingPlayers = resolveSide(giving);
  const receivingPlayers = resolveSide(receiving);
  const out = sum(givingPlayers);
  const inn = sum(receivingPlayers);

  let wins = 0, losses = 0;
  const breakdown = categories.map(cat => {
    const g = out[cat], r = inn[cat];
    if (g === undefined && r === undefined) return null;

    const gv = g ?? 0, rv = r ?? 0;
    const better = lowerIsBetter.has(cat) ? rv < gv : rv > gv;
    const same = Math.abs(rv - gv) < 1e-9;
    if (!same) better ? wins++ : losses++;

    const round = (n: number) => Math.round(n * 1000) / 1000;
    return { category: cat, giving_up: round(gv), receiving: round(rv),
             net: round(rv - gv), verdict: same ? 'PUSH' : better ? 'GAIN' : 'LOSS' };
  }).filter(Boolean);

  const verdict = wins > losses ? 'ACCEPT' : wins < losses ? 'DECLINE' : 'PUSH';
  const unresolved = [...givingPlayers, ...receivingPlayers].filter(p => !p.found);

  return {
    giving: givingPlayers,
    receiving: receivingPlayers,
    category_breakdown: breakdown,
    categories_gained: wins,
    categories_lost: losses,
    verdict,
    chirp: verdict === 'ACCEPT'
      ? wins - losses <= 1
        ? `You win ${wins} categories to ${losses}. Narrow — make sure the ones you win are the ones you need.`
        : `You win ${wins} categories to ${losses}. Take it before they think twice.`
      : verdict === 'DECLINE'
        // A one-category loss is a close call, not a donation.
        ? losses - wins <= 1
          ? `You lose ${losses} categories to ${wins}. Close — it comes down to which categories you need.`
          : `You lose ${losses} categories to ${wins}. That's not a trade, that's a donation.`
        : `Dead even at ${wins}-${losses}. Decide on need, not numbers.`,
    ...(unresolved.length ? { unresolved } : {}),
    basis: `Last full season totals (${NHL_STATS.getSeasons().stats}) from the NHL public API. ` +
           'GAA and SV% are averaged across goalies; counting stats are summed. ' +
           'This measures past production, not your league\'s scoring settings.',
    chirp_intensity: chirpIntensity
  };
}



/**
 * Version reported in the MCP handshake.
 *
 * Read from package.json rather than hardcoded — this string had drifted to
 * 3.0.0 while the package was on 3.2.0, so clients were told the wrong version.
 */
function readPackageVersion(): string {
  return getVersion();
}

// Register Tools
export const TOOL_DEFINITIONS: Tool[] = [
      {
        name: "get_team_roster",
        description: "Get your current fantasy hockey roster with all players and their positions",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_league_standings",
        description: "Read your league standings — rank, team, record and points. Paste them as standings_text, one team per line, copied from any fantasy platform.",
        inputSchema: {
          type: "object",
          properties: {
            standings_text: {
              type: "string",
              description: "Your league standings, pasted — one team per line, e.g. \"1. TeamDestroyersz 8-2-1 142 pts\". Required on the hosted (stateless) endpoint."
            }
          },
        },
      },
      {
        name: "search_players",
        description: "Search NHL players by position, ranked on last season: skaters by points, goalies on wins, save % and GAA together. A search across all positions lists skaters and goalies separately. Pass roster_text to mark your own players; league availability is private and not shown.",
        inputSchema: {
          type: "object",
          properties: {
            position: {
              type: "string",
              description: "Player position: C, LW, RW, D, G, or leave empty for all",
            },
            count: {
              type: "number",
              description: "Number of players to return (default 25, max 100)",
              default: 25,
            },
          },
        },
      },
      {
        name: "get_player_stats",
        description: "Last season's NHL statistics and upcoming schedule for one player. Pass a name as you would type it (\"Cale Makar\", \"Makar COL\") or an NHL player ID; an ambiguous name returns the candidates.",
        inputSchema: {
          type: "object",
          properties: {
            player_id: {
              type: "string",
              description: "Player name (e.g. 'Cale Makar') or NHL player ID",
            },
          },
          required: ["player_id"],
        },
      },
      {
        name: "compare_matchup",
        description: "Category-by-category comparison of your roster against your opponent's — last season's NHL totals as a proxy for strength, plus each side's real games this week. Pass both rosters as roster_text and opponent_text.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "optimize_lineup",
        description: "Lineup check from your roster: injured players in active slots, bench players who should be active, and empty or mismatched slots.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_streaming_recommendations",
        description: "Schedule-aware pickup candidates: NHL players not on the rosters you provided, ranked by games in the look-ahead window and then last season's production, at most two per club. Goalies rank on the same stream score as analyze_goalie_streams (expected starts, opposing attack, save %). League ownership is private, so check availability before adding — or pass assume_rostered to leave out the top of the board.",
        inputSchema: {
          type: "object",
          properties: {
            days_ahead: {
              type: "number",
              description: "Look ahead window in days (default 7)",
              default: 7,
            },
            position_filter: {
              type: "string",
              description: "Limit to one position: C, LW, RW, D or G. Leave empty for all.",
            },
            strategy_type: {
              type: "string",
              description: "Streaming strategy: 'weekly' (full week holds), 'weekend' (Fri-Sun pickups), or 'daily' (day-to-day streaming)",
              enum: ["weekly", "weekend", "daily"],
              default: "weekly",
            },
            ...baseChirpSchema
          },
        },
      },
      {
        name: "get_games_in_hand",
        description: "Games left in the window for you and your opponent, from the NHL schedule. Ahead: hold and keep every slot filled. Behind: stream players from the clubs that play most. Pass both rosters as roster_text and opponent_text.",
        inputSchema: {
          type: "object",
          properties: {
            ...baseChirpSchema
          },
        },
      },
      {
        name: "get_roster_transaction_recommendations",
        description: "🏒 ICE - Intent Chirp Engine: Get championship-level roster optimization with savage analysis and brutal honesty about your lineup decisions",
        inputSchema: {
          type: "object",
          properties: {
            look_ahead_days: {
              type: "number",
              description: "Days to look ahead for schedule analysis (default 7)",
              default: 7,
            },
            target_positions: {
              type: "array",
              items: { type: "string" },
              description: "Specific positions to focus on (C, LW, RW, D, G)",
            },
            ...baseChirpSchema
          },
        },
      },
      {
        name: "ice",
        description: "❄️ ICE - Intent Chirp Engine: The ultimate fantasy hockey advisor with ice-cold analysis and championship-level chirp intelligence. Multi-mode analysis tool that combines all insights.",
        inputSchema: {
          type: "object",
          properties: {
            analysis_type: {
              type: "string",
              enum: ["full_roster", "weekly_matchup", "pickup_strategy", "lineup_optimization"],
              description: "Type of ICE analysis to perform (default: full_roster)"
            },
            ...baseChirpSchema,
            look_ahead_days: {
              type: "number",
              default: 7,
              description: "Days ahead for schedule analysis"
            }
          },
        },
      },
      {
        name: "governance_dashboard",
        description: "🏛️ View Semantic Anchoring Governance health metrics and analysis performance statistics. Monitor violations, contract validations, and template pattern execution metrics.",
        inputSchema: {
          type: "object",
          properties: {
            report_type: {
              type: "string",
              enum: ["health", "analyses", "violations", "full"],
              description: "Type of report: 'health' (governance status), 'analyses' (performance metrics), 'violations' (error logs), 'full' (complete report)",
              default: "full"
            }
          }
        }
      },
      {
        name: "analyze_breakout_players",
        description: "📈 Find breakout candidates among NHL players not on the rosters you have provided, scored on real season production, opportunity and risk. Availability in your league is league-private and cannot be determined here — treat these as candidates to check.",
        inputSchema: {
          type: "object",
          properties: {
            position_filter: { type: "array", items: { type: "string" }, description: "Limit to positions, e.g. [\"C\", \"D\"]" },
            breakout_age_max: { type: "number", description: "Maximum age for a breakout candidate (default 26)" },
            min_score: { type: "number", description: "Minimum breakout score to include" },
            max_results: { type: "number", description: "How many candidates to return (default 10)" },
            ...baseChirpSchema
          }
        }
      },
      {
        name: "analyze_weekend_streams",
        description: "🏒❄️ Weekend Stream Classifier — sorts pickup candidates for a date range into genuine (two or more games, real minutes and real production), monitor, and desperation (a small role or little production, bought for games alone), with a stated 0–100 upside score and the facts behind it. Players with no games in the window are left out. Pass assume_rostered to skip the top of the board.",
        inputSchema: {
          type: "object",
          properties: {
            date_range: {
              type: "object",
              properties: {
                start: {
                  type: "string",
                  description: "Weekend start date (YYYY-MM-DD, e.g., '2026-10-16')"
                },
                end: {
                  type: "string",
                  description: "Weekend end date (YYYY-MM-DD, e.g., '2026-10-18')"
                }
              },
              required: ["start", "end"],
              description: "Weekend date range to analyze (typically Fri-Sun or Sat-Sun)"
            },
            position_filter: {
              type: "array",
              items: { type: "string" },
              description: "Filter by positions: ['C', 'LW', 'RW', 'D', 'G']. Leave empty for all positions"
            },
            team_needs: {
              type: "array",
              items: { type: "string" },
              description: "Your roster needs, e.g. ['C_depth', 'G_volume', 'bye_fill', 'injury_cover']. A position need marks candidates at that position as filling it (said in the reason), and a need-driven pick with a low score is classed desperation; 'bye_fill' and 'injury_cover' count as roster gaps."
            },
            min_upside_score: {
              type: "number",
              description: "Minimum upside score (0-100) to include. A higher bar returns fewer candidates; it does not change their class.",
              default: 0
            },
            max_results: {
              type: "number",
              description: "Maximum results per classification (default 10)",
              default: 10
            },
            ...baseChirpSchema
          },
          required: ["date_range"]
        }
      },
      {
        name: "chirp_opponent",
        description: "Scout your opponent's roster for the week: who doesn't play at all, who plays only once or twice, and who is parked on IR — with trash talk to match. Pass their roster as opponent_text.",
        inputSchema: {
          type: "object",
          properties: {
            ...baseChirpSchema,
          },
        },
      },
      {
        name: "analyze_trade",
        description: "Evaluate a trade offer by comparing the net category impact of players you're giving vs receiving. Returns a category-by-category breakdown and an ACCEPT / DECLINE / PUSH verdict with chirp commentary.",
        inputSchema: {
          type: "object",
          properties: {
            giving: {
              type: "array",
              items: { type: "string" },
              description: "Player names you are giving away (e.g. [\"Nathan MacKinnon\", \"Mitch Marner\"])",
            },
            receiving: {
              type: "array",
              items: { type: "string" },
              description: "Player names you are receiving (e.g. [\"Auston Matthews\"])",
            },
            ...baseChirpSchema,
          },
          required: ["giving", "receiving"],
        },
      },
      {
        name: "set_roster",
        description: "📋 Paste your team's roster to teach CHIRP who you own. Works with text copied from any fantasy platform — Yahoo, ESPN, Sleeper, a spreadsheet, or just a list of names. Player names are resolved against live NHL rosters, so team and position fill themselves in. Anything that can't be resolved to exactly one player is reported back rather than guessed. No account or API key needed.",
        inputSchema: {
          type: "object",
          properties: {
            roster_text: {
              type: "string",
              description: "The pasted roster. One player per line, in whatever shape you copied it — \"Auston Matthews\", \"MATTHEWS, Auston\", or a full row like \"C  Auston Matthews  TOR - C  Q\". BN and IR slots are preserved if present."
            },
            team_name: {
              type: "string",
              description: "What to call this team (default: \"My Team\")"
            }
          },
          required: ["roster_text"]
        }
      },
      {
        name: "set_opponent_roster",
        description: "📋 Paste your weekly opponent's roster, so head-to-head tools (games-in-hand, matchup comparison, opponent scouting) can work without a league account. Same forgiving format as set_roster.",
        inputSchema: {
          type: "object",
          properties: {
            roster_text: { type: "string", description: "The pasted opponent roster, one player per line" },
            team_name: { type: "string", description: "Opponent's team name (default: \"Opponent\")" }
          },
          required: ["roster_text"]
        }
      },
      {
        name: "set_standings",
        description: "📊 Paste your league standings to give CHIRP league context. Extracts rank, team name, record and points from rows like \"1. TeamDestroyersz 8-2-1 142 pts\".",
        inputSchema: {
          type: "object",
          properties: {
            standings_text: { type: "string", description: "The pasted standings, one team per line" }
          },
          required: ["standings_text"]
        }
      },
      {
        name: "show_stored_data",
        description: "🗂️ Show what CHIRP currently knows about your league — stored roster, opponent roster and standings, with when each was last updated. Use `clear` to forget one of them.",
        inputSchema: {
          type: "object",
          properties: {
            clear: {
              type: "string",
              enum: ["roster", "opponent", "standings"],
              description: "Optionally forget one stored item instead of showing everything"
            }
          }
        }
      },
      {
        name: "schedule_value",
        description: "🗓️ Rate all 32 NHL clubs on what their schedule is worth to a fantasy roster — total games, four-game weeks, light weeks, back-to-backs, and games played during YOUR league's playoff weeks (pass playoff_start_week and playoff_end_week; week 1 opens with the NHL season and, when that is mid-week, runs to the second Sunday, as Yahoo counts it). The draft tiebreaker when two players are close.",
        inputSchema: {
          type: "object",
          properties: {
            teams: {
              type: "array",
              items: { type: "string" },
              description: "Limit to specific clubs (NHL or Yahoo abbreviations, e.g. [\"TOR\", \"SJ\"]). Omit to rate all 32."
            },
            playoff_start_week: {
              type: "number",
              description: "First week of your fantasy playoffs, from your league settings. Supply with playoff_end_week to score each club's playoff window."
            },
            playoff_end_week: {
              type: "number",
              description: "Final week of your fantasy playoffs (commonly your league's last week)."
            },
            top_n: {
              type: "number",
              description: "How many clubs to highlight (default 8)",
              default: 8
            },
            ...baseChirpSchema
          }
        }
      },
      {
        name: "read_ice",
        description: "📺 Read the ice for Sepiola, the telestrator: one drawable Read. Per skater — game bits for the window, back-to-back, schedule value 0–100, flag, a one-line reason, points per game and projected points. Plus the start/sit/stream/IR calls, games in hand, the closing line for each replay, and the take. Validates against the vendored read contract (contracts/read.schema.json). Real NHL schedule and club stats only; refuses rather than estimates when they are unavailable. Pass roster_text, or omit it to use the roster set with set_roster.",
        inputSchema: {
          type: "object",
          properties: {
            roster_text: {
              type: "string",
              description: "Pasted lineup, one player per line, any format. Omit to use the stored roster."
            },
            look_ahead_days: {
              type: "number",
              description: "Window length in days, 1–14 (default 7)."
            },
            opponent_text: {
              type: "string",
              description: "Opponent's pasted lineup, for games in hand. Omit to use the stored opponent, if any."
            },
            start: {
              type: "string",
              description: "First day of the window, YYYY-MM-DD. Defaults to today. Use it to read a future week, or to demo before opening night."
            }
          }
        }
      },
      {
        name: "analyze_goalie_streams",
        description: "🥅 Which goalie to stream this week, from public data: every NHL goalie ranked on a stream score whose formula is stated — expected starts (games in the window × last season's start share), how dangerous each opponent's attack is, and save % against the league's starters — with GAA, wins and the nights he plays. Pass roster_text to see your own goalies and exclude them from the candidates, and assume_rostered to skip goalies high on the draft board. Starters are not announced in public data; the output says so.",
        inputSchema: {
          type: "object",
          properties: {
            look_ahead_days: { type: "number", description: "Window length in days, 1–14 (default 7)." },
            start: { type: "string", description: "First day of the window, YYYY-MM-DD. Defaults to today." },
            top_n: { type: "number", description: "How many candidates to return (default 8, max 25)." }
          }
        }
      },
      {
        name: "draft_kit",
        description: "📋 A full draft kit — positional tiers, a cheat sheet, and flags you cannot get elsewhere: playoff-window schedule per club, shooting-luck rebound candidates, age-based decline risk, and category specialists. Works two ways: call it plain and it builds the board from last season's NHL production, or paste a ranked list (from any published kit) and it keeps that order while annotating it with schedule and flags. States plainly what it does not include — no projections, no ADP, no line combos, no injuries.",
        inputSchema: {
          type: "object",
          properties: {
            playoff_start_week: {
              type: "number",
              description: "First week of your fantasy playoffs. Supply this with playoff_end_week and every player gets their club's playoff-window game count."
            },
            playoff_end_week: {
              type: "number",
              description: "Final week of your fantasy playoffs."
            },
            categories: {
              type: "string",
              description: "Your league's scoring categories, pasted as your platform lists them, e.g. \"G, A, +/-, PPP, SOG, HIT, BLK; W, GAA, SV%, SO\". Given, players are ranked for those categories (per-game z-scores over last season, 20-game minimum) instead of points, and each carries a category line. Labels it cannot read are named back."
            },
            rankings: {
              type: "string",
              description: "Optional. Paste a ranked player list — from NHL.com, Dobber, FantasyPros, anywhere — one per line. Its order becomes the baseline rank and CHIRP annotates it rather than replacing it. Omit to have the board built from NHL production instead."
            },
            positions: {
              type: "array",
              items: { type: "string" },
              description: "Limit to positions, e.g. [\"C\", \"G\"] (default: all)"
            },
            tier_size: { type: "number", description: "Players per tier (default 6)", default: 6 },
            max_per_position: { type: "number", description: "How deep to go per position (default 24)", default: 24 },
            ...baseChirpSchema
          }
        }
      },
      {
        name: "chirp_draft_pick",
        description: "❄️ ICE at the draft table — with a pick on the clock, ranks who to take against YOUR draft: the best producers still available (last season's NHL production, since there is no market ADP), weighted toward the positions your roster still needs (a weight that grows over the first three rounds, so elite players come first) and each club's schedule during your league's playoff weeks. Pass already_drafted as picks go by, in whatever shape your draft room shows them; nothing is read from a fantasy platform. Use draft_kit for the whole board before the draft, this for the pick in front of you.",
        inputSchema: {
          type: "object",
          properties: {
            pick_number: {
              type: "number",
              description: "The pick currently on the clock. Defaults to one after the players in already_drafted."
            },
            already_drafted: {
              type: "array",
              items: { type: "string" },
              description: "Every player drafted so far, by anyone, one per entry. Pick numbers, clubs and positions around the name are fine; lines that do not resolve to one NHL player are reported back."
            },
            roster_needs: {
              type: "array",
              items: { type: "string" },
              description: "Positions you still need, e.g. [\"RW\", \"G\"]. If omitted, inferred from the roster you set with set_roster (the thinnest positions)."
            },
            max_results: {
              type: "number",
              description: "How many candidates to return (default 8)",
              default: 8
            },
            pool_size: {
              type: "number",
              description: "How deep to pull the player pool (default 250, max 400)",
              default: 250
            },
            categories: {
              type: "string",
              description: "Your league's scoring categories, pasted as your platform lists them, e.g. \"G, A, +/-, PPP, SOG, HIT, BLK; W, GAA, SV%, SO\". Given, players are ranked for those categories (per-game z-scores over last season, 20-game minimum) instead of points, and each carries a category line. Labels it cannot read are named back."
            },
            playoff_start_week: {
              type: "number",
              description: "First week of your fantasy playoffs. Supply this with playoff_end_week and each club's playoff-window schedule becomes a tiebreaker between similar players."
            },
            playoff_end_week: {
              type: "number",
              description: "Final week of your fantasy playoffs (commonly your league's last week)."
            },
            ...baseChirpSchema
          }
        }
      },
];

/** Run one tool by name. Every case returns a CallToolResult; unknown names and thrown errors become isError results. */
async function dispatchTool(name: string, args: Record<string, unknown> | undefined): Promise<CallToolResult> {
  try {
    switch (name) {
      case "get_team_roster": {
        const roster = await getTeamRoster();
        return {
          content: [{ type: "text", text: JSON.stringify(roster, null, 2) }],
        };
      }

      case "get_league_standings": {
        const standings = await getLeagueStandings(args?.standings_text as string | undefined);
        return {
          content: [{ type: "text", text: JSON.stringify(standings, null, 2) }],
        };
      }


      case "search_players": {
        const position = args?.position as string | undefined;
        const count = (args?.count as number) || 25;
        const players = await searchPlayers(position, count);
        return {
          content: [{ type: "text", text: JSON.stringify(players, null, 2) }],
        };
      }

      case "get_player_stats": {
        const playerId = args?.player_id as string;
        if (!playerId) {
          throw new Error("player_id is required");
        }
        const stats = await getPlayerStats(playerId);
        return {
          content: [{ type: "text", text: JSON.stringify(stats, null, 2) }],
        };
      }


      case "compare_matchup": {
        const comparison = await compareMatchup();
        return {
          content: [{ type: "text", text: JSON.stringify(comparison, null, 2) }],
        };
      }

      case "optimize_lineup": {
        // 🎯 Template Method Pattern: Use LineupAnalysis class
        const semanticContract: SemanticChirpContract = {
          chirp_intensity: args?.chirp_intensity as any,
          personality_mode: args?.personality_mode as any,
          enable_chirp: args?.enable_chirp as boolean,
          semantic_intent: "user_requested",
          tool_context: "optimize_lineup"
        };

        const result = await lineupAnalysis.executeAnalysis({}, semanticContract);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }



      case "get_streaming_recommendations": {
        // 🎯 Template Method Pattern: Use StreamingAnalysis class
        const semanticContract: SemanticChirpContract = {
          chirp_intensity: args?.chirp_intensity as any,
          personality_mode: args?.personality_mode as any,
          enable_chirp: args?.enable_chirp as boolean,
          semantic_intent: "user_requested",
          tool_context: "get_streaming_recommendations"
        };

        const analysisArgs = {
          look_ahead_days: (args?.days_ahead as number) || 7,
          position_filter: args?.position_filter as string | string[] | undefined,
          max_recommendations: (args?.max_recommendations as number) || 5
        };

        const result = await streamingAnalysis.executeAnalysis(analysisArgs, semanticContract);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_games_in_hand": {
        // 🎯 Template Method Pattern: Use GamesInHandAnalysis class
        const semanticContract: SemanticChirpContract = {
          chirp_intensity: args?.chirp_intensity as any,
          personality_mode: args?.personality_mode as any,
          enable_chirp: args?.enable_chirp as boolean,
          semantic_intent: "user_requested",
          tool_context: "get_games_in_hand"
        };

        const analysisArgs = {
          look_ahead_days: (args?.look_ahead_days as number) || 7
        };

        const result = await gamesInHandAnalysis.executeAnalysis(analysisArgs, semanticContract);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "get_roster_transaction_recommendations": {
        // 🎯 Template Method Pattern: Use IceAnalysis class
        const semanticContract: SemanticChirpContract = {
          chirp_intensity: args?.chirp_intensity as any,
          personality_mode: args?.personality_mode as any,
          enable_chirp: args?.enable_chirp as boolean,
          semantic_intent: "user_requested",
          tool_context: "get_roster_transaction_recommendations"
        };

        const analysisArgs = {
          look_ahead_days: (args?.look_ahead_days as number) || 7,
          target_positions: args?.target_positions as string[] | undefined
        };

        const result = await iceAnalysis.executeAnalysis(analysisArgs, semanticContract);

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "ice": {
        // 🎯 Template Method Pattern: All analysis modes use dedicated classes
        const analysisType = (args?.analysis_type as string) || "full_roster";
        const lookAheadDays = (args?.look_ahead_days as number) || 7;

        const semanticContract: SemanticChirpContract = {
          chirp_intensity: (args?.chirp_intensity as any) || "ice_cold",
          personality_mode: (args?.personality_mode as any) || "championship_coach",
          enable_chirp: true,
          semantic_intent: "tool_override",
          tool_context: "ice"
        };

        let result;
        switch (analysisType) {
          case "full_roster":
            // ✅ IceAnalysis class
            result = await iceAnalysis.executeAnalysis(
              { look_ahead_days: lookAheadDays },
              semanticContract
            );
            break;
          case "weekly_matchup":
            // ✅ GamesInHandAnalysis class
            result = await gamesInHandAnalysis.executeAnalysis(
              { look_ahead_days: lookAheadDays },
              semanticContract
            );
            break;
          case "pickup_strategy":
            // ✅ StreamingAnalysis class
            result = await streamingAnalysis.executeAnalysis(
              { look_ahead_days: lookAheadDays },
              semanticContract
            );
            break;
          case "lineup_optimization":
            // ✅ LineupAnalysis class
            result = await lineupAnalysis.executeAnalysis(
              {},
              semanticContract
            );
            break;
          default:
            // Default to full roster analysis
            result = await iceAnalysis.executeAnalysis(
              { look_ahead_days: lookAheadDays },
              semanticContract
            );
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "governance_dashboard": {
        // 🏛️ Governance Dashboard: View health metrics and analysis performance
        const reportType = (args?.report_type as string) || "full";
        const health = checkGovernanceHealth();

        let reportData: any;

        switch (reportType) {
          case "health":
            reportData = {
              status: health.status,
              total_violations: health.report.total_violations,
              warnings: health.report.warnings,
              errors: health.report.errors,
              contracts_validated: health.report.contracts_validated,
              recommendations: health.recommendations
            };
            break;

          case "analyses":
            reportData = {
              total_analyses: health.report.analyses_executed,
              by_type: health.report.analysis_by_type,
              performance: {
                avg_duration_ms: health.report.avg_duration_ms,
                slowest_analysis: health.report.slowest_analysis
              }
            };
            break;

          case "violations":
            reportData = {
              total_violations: health.report.total_violations,
              warnings: health.report.warnings,
              errors: health.report.errors,
              recent_violations: health.report.recent_violations
            };
            break;

          case "full":
          default:
            reportData = {
              governance_health: {
                status: health.status,
                recommendations: health.recommendations
              },
              metrics: {
                violations: {
                  total: health.report.total_violations,
                  warnings: health.report.warnings,
                  errors: health.report.errors,
                  recent: health.report.recent_violations
                },
                governance: {
                  contracts_validated: health.report.contracts_validated,
                  immutability_enforced: health.report.immutability_enforced,
                  semantic_decisions: health.report.semantic_decisions
                },
                analyses: {
                  total_executed: health.report.analyses_executed,
                  by_type: health.report.analysis_by_type,
                  avg_duration_ms: health.report.avg_duration_ms,
                  slowest: health.report.slowest_analysis
                }
              }
            };
            break;
        }

        // Counters live in memory. The hosted endpoint serves each request from a fresh or recycled isolate, so its
        // numbers describe that instance only — not the whole connector's traffic.
        reportData = {
          ...reportData,
          counter_scope: isStateless()
            ? 'This server instance only. The hosted endpoint handles requests on many short-lived instances, so these counts do not total the connector\'s traffic.'
            : 'This server process since it started.'
        };

        return {
          content: [{ type: "text", text: JSON.stringify(reportData, null, 2) }]
        };
      }

      case "analyze_breakout_players": {
        try {
          const result = await breakoutAnalysis.executeAnalysis(
            {
              position_filter: args?.position_filter as string[] | undefined,
              breakout_age_max: args?.breakout_age_max as number | undefined,
              min_score: args?.min_score as number | undefined,
              max_results: args?.max_results as number | undefined
            } as any,
            {
              chirp_intensity: (args?.chirp_intensity as any) || 'standard',
              personality_mode: (args?.personality_mode as any) || 'analytical',
              enable_chirp: args?.enable_chirp !== false,
              semantic_intent: 'user_requested' as const
            }
          );

          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: JSON.stringify({
              error: errorMessage,
              note: "Breakout analysis failed - this is a semantic intent-driven tool with comprehensive scoring"
            }, null, 2) }],
            isError: true
          };
        }
      }

      case "analyze_weekend_streams": {
        try {
          // Build semantic contract
          const semanticContract: SemanticChirpContract = {
            chirp_intensity: args?.chirp_intensity as any || 'ice_cold',
            personality_mode: args?.personality_mode as any || 'analytical',
            enable_chirp: args?.enable_chirp !== false,
            semantic_intent: "user_requested",
            tool_context: "weekend_stream_classification"
          };

          // Execute weekend stream analysis through template method
          const result = await weekendStreamAnalysis.executeAnalysis(
            {
              date_range: args?.date_range as { start: string; end: string },
              position_filter: args?.position_filter as string[] | undefined,
              team_needs: args?.team_needs as string[] | undefined,
              min_upside_score: args?.min_upside_score as number | undefined,
              max_results: args?.max_results as number | undefined
            },
            semanticContract
          );

          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: JSON.stringify({
              error: errorMessage,
              note: "Weekend stream analysis failed - binary classification for desperation vs genuine opportunities"
            }, null, 2) }],
            isError: true
          };
        }
      }

      case "chirp_opponent": {
        const intensity = (args?.chirp_intensity as string) || 'savage';
        const mode = (args?.personality_mode as string) || 'roast_master';
        const result = await chirpOpponent(intensity, mode);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "analyze_trade": {
        const giving = args?.giving as string[];
        const receiving = args?.receiving as string[];
        if (!giving || !receiving || giving.length === 0 || receiving.length === 0) {
          throw new Error("Both 'giving' and 'receiving' arrays are required and must not be empty.");
        }
        const intensity = (args?.chirp_intensity as string) || 'standard';
        const result = await analyzeTradeImpact(giving, receiving, intensity);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "set_roster":
      case "set_opponent_roster": {
        const key = name === "set_roster" ? "roster" as const : "opponent" as const;
        const text = args?.roster_text as string;

        if (!text || !text.trim()) {
          throw new Error("roster_text is required — paste your roster, one player per line.");
        }

        await NHL_STATS.load();
        if (!NHL_STATS.isAvailable()) {
          return { content: [{ type: "text", text: JSON.stringify({
            error: "NHL player data unavailable",
            reason: NHL_STATS.getUnavailableReason(),
            note: "Names are resolved against live NHL rosters; retry shortly."
          }, null, 2) }], isError: true };
        }

        const report = ROSTER_STORE.parseRoster(text);
        const label = (args?.team_name as string) || (key === "roster" ? "My Team" : "Opponent");

        if (report.resolved.length === 0) {
          return { content: [{ type: "text", text: JSON.stringify({
            saved: false,
            reason: "No player names could be resolved from that text.",
            lines_read: report.lines_read,
            unresolved: report.unresolved,
            ambiguous: report.ambiguous
          }, null, 2) }], isError: true };
        }

        const stored = ROSTER_STORE.saveRoster(key, report.resolved, label);

        return { content: [{ type: "text", text: JSON.stringify({
          saved: true,
          team: label,
          players_resolved: report.resolved.length,
          lines_read: report.lines_read,
          roster: stored.players,
          // Surfaced, never silently dropped - the user decides what to do.
          needs_attention: {
            unresolved: report.unresolved,
            ambiguous: report.ambiguous
          },
          note: report.unresolved.length || report.ambiguous.length
            ? "Some lines could not be matched to exactly one NHL player. Re-run set_roster with corrected names to include them."
            : "All lines resolved.",
          data_source: `NHL public API (rosters ${NHL_STATS.getSeasons().roster}, stats ${NHL_STATS.getSeasons().stats})`
        }, null, 2) }] };
      }

      case "set_standings": {
        const text = args?.standings_text as string;
        if (!text || !text.trim()) {
          throw new Error("standings_text is required — paste your league standings, one team per line.");
        }

        const rows = ROSTER_STORE.parseStandings(text);
        if (rows.length === 0) {
          return { content: [{ type: "text", text: JSON.stringify({
            saved: false,
            reason: "No standings rows could be read from that text."
          }, null, 2) }], isError: true };
        }

        ROSTER_STORE.saveStandings(rows);
        return { content: [{ type: "text", text: JSON.stringify({
          saved: true, teams: rows.length, standings: rows
        }, null, 2) }] };
      }

      case "show_stored_data": {
        const clearKey = args?.clear as 'roster' | 'opponent' | 'standings' | undefined;

        if (clearKey) {
          const removed = ROSTER_STORE.clear(clearKey);
          return { content: [{ type: "text", text: JSON.stringify({
            cleared: clearKey, existed: removed
          }, null, 2) }] };
        }

        const roster = ROSTER_STORE.getRoster('roster');
        const opponent = ROSTER_STORE.getRoster('opponent');
        const standings = ROSTER_STORE.getStandings();

        return { content: [{ type: "text", text: JSON.stringify({
          roster: roster ?? "not set — paste yours with set_roster",
          opponent: opponent ?? "not set — paste one with set_opponent_roster",
          standings: standings ?? "not set — paste them with set_standings",
          storage: ROSTER_STORE.getDataDir()
        }, null, 2) }] };
      }

      case "analyze_goalie_streams": {
        const result = await goalieStreams({
          look_ahead_days: typeof args?.look_ahead_days === "number" ? (args.look_ahead_days as number) : undefined,
          today: (args?.start as string | undefined)?.trim() || undefined,
          top_n: typeof args?.top_n === "number" ? (args.top_n as number) : undefined,
          roster: ROSTER_STORE.getRoster("roster")?.players,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result as unknown as Record<string, unknown> };
      }

      case "read_ice": {
        const rosterText = (args?.roster_text as string | undefined)?.trim();
        const lookAhead = typeof args?.look_ahead_days === "number" ? (args.look_ahead_days as number) : undefined;
        const opponentText = (args?.opponent_text as string | undefined)?.trim();
        const startDay = (args?.start as string | undefined)?.trim() || undefined;
        let read;
        if (rosterText) {
          read = await readIceFromText(rosterText, { look_ahead_days: lookAhead, opponent_text: opponentText, today: startDay });
        } else {
          const stored = ROSTER_STORE.getRoster("roster");
          if (!stored?.players.length) throw new Error(NO_ROSTER_MESSAGE);
          let opponent = ROSTER_STORE.getRoster("opponent")?.players;
          if (opponentText) {
            await NHL_STATS.load();
            opponent = ROSTER_STORE.parseRoster(opponentText).resolved;
          }
          read = await readIce(stored.players, { look_ahead_days: lookAhead, opponent, today: startDay });
        }
        return { content: [{ type: "text", text: JSON.stringify(read, null, 2) }], structuredContent: read as unknown as Record<string, unknown> };
      }

      case "schedule_value": {
        try {
          const semanticContract = {
            chirp_intensity: (args?.chirp_intensity as any) || 'standard',
            personality_mode: (args?.personality_mode as any) || 'analytical',
            enable_chirp: args?.enable_chirp !== false,
            semantic_intent: 'user_requested' as const
          };

          const result = await scheduleValueAnalysis.executeAnalysis(
            {
              teams: args?.teams as string[] | undefined,
              playoff_start_week: args?.playoff_start_week as number | undefined,
              playoff_end_week: args?.playoff_end_week as number | undefined,
              top_n: args?.top_n as number | undefined
            },
            semanticContract
          );

          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: JSON.stringify({
              error: errorMessage,
              note: "Schedule value analysis failed - rates NHL club schedules against your league's playoff weeks"
            }, null, 2) }],
            isError: true
          };
        }
      }

      case "draft_kit": {
        try {
          const result = await draftKitAnalysis.executeAnalysis(
            {
              playoff_start_week: args?.playoff_start_week as number | undefined,
              playoff_end_week: args?.playoff_end_week as number | undefined,
              rankings: args?.rankings as string | undefined,
              categories: args?.categories as string | undefined,
              positions: args?.positions as string[] | undefined,
              tier_size: args?.tier_size as number | undefined,
              max_per_position: args?.max_per_position as number | undefined
            },
            {
              chirp_intensity: (args?.chirp_intensity as any) || 'standard',
              personality_mode: (args?.personality_mode as any) || 'analytical',
              enable_chirp: args?.enable_chirp !== false,
              semantic_intent: 'user_requested' as const
            }
          );

          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: JSON.stringify({
              error: errorMessage,
              note: "Draft kit failed - it needs only the NHL public API, so retry shortly"
            }, null, 2) }],
            isError: true
          };
        }
      }

      case "chirp_draft_pick": {
        try {
          const semanticContract = {
            chirp_intensity: (args?.chirp_intensity as any) || 'ice_cold',
            personality_mode: (args?.personality_mode as any) || 'championship_coach',
            enable_chirp: args?.enable_chirp !== false,
            semantic_intent: 'user_requested' as const
          };

          const result = await draftPickAnalysis.executeAnalysis(
            {
              pick_number: args?.pick_number as number | undefined,
              already_drafted: args?.already_drafted as string[] | undefined,
              roster_needs: args?.roster_needs as string[] | undefined,
              max_results: args?.max_results as number | undefined,
              pool_size: args?.pool_size as number | undefined,
              categories: args?.categories as string | undefined,
              playoff_start_week: args?.playoff_start_week as number | undefined,
              playoff_end_week: args?.playoff_end_week as number | undefined
            },
            semanticContract
          );

          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: JSON.stringify({
              error: errorMessage,
              note: "Draft pick analysis failed - check the already_drafted lines and retry; it needs only the NHL public API"
            }, null, 2) }],
            isError: true
          };
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
}

// ==========================================
// 🎯 The registry's public face: pasted rosters, statelessness
// ==========================================

/** Tools whose analyses read the stored roster; each also accepts the roster pasted into the call. */
const ROSTER_TOOLS = new Set([
  'get_team_roster', 'search_players', 'compare_matchup', 'optimize_lineup', 'get_streaming_recommendations', 'get_games_in_hand',
  'get_roster_transaction_recommendations', 'ice', 'analyze_breakout_players', 'analyze_weekend_streams',
  'chirp_opponent', 'analyze_trade', 'draft_kit', 'chirp_draft_pick', 'analyze_goalie_streams',
]);

export const PASTED_ROSTER_SCHEMA = {
  roster_text: {
    type: "string",
    description: "Your lineup, pasted — one player per line, any format. Used instead of the stored roster for this call. Required on the hosted (stateless) endpoint."
  },
  opponent_text: {
    type: "string",
    description: "Your opponent's lineup, pasted. Used instead of the stored opponent for this call."
  }
};

for (const tool of TOOL_DEFINITIONS) {
  if (ROSTER_TOOLS.has(tool.name)) {
    tool.inputSchema.properties = { ...PASTED_ROSTER_SCHEMA, ...(tool.inputSchema.properties ?? {}) };
  }
}

/** Tools that suggest players to add, and so can take an assumption about who is already rostered in the league. */
const ASSUME_ROSTERED_TOOLS = new Set([
  'ice', 'get_roster_transaction_recommendations', 'get_streaming_recommendations', 'analyze_weekend_streams',
  'analyze_goalie_streams', 'analyze_breakout_players',
]);
for (const tool of TOOL_DEFINITIONS) {
  if (!ASSUME_ROSTERED_TOOLS.has(tool.name)) continue;
  tool.inputSchema.properties = {
    ...(tool.inputSchema.properties ?? {}),
    assume_rostered: {
      type: "number",
      description: "Optional. Treat the top N players on the draft board as already rostered in your league and leave " +
        "them out of the suggestions — e.g. 150 for a 12-team league. League ownership is private, so without this " +
        "the suggestions can include stars who are certainly taken. Off by default; the output says when it was applied.",
    },
  };
}

/** Tools that write or read the on-disk store. Meaningless where there is no disk. */
const STATEFUL_TOOLS = new Set(['set_roster', 'set_opponent_roster', 'set_standings', 'show_stored_data']);
const STATELESS_REFUSAL =
  'This endpoint keeps no state. Pass roster_text (and opponent_text) with each tool call instead of set_roster / set_opponent_roster.';

/**
 * Directory annotations: a human-readable title and the safety hint for every tool.
 *
 * The Claude directory requires both on every tool and flags any that lack them. Almost everything here only reads —
 * NHL data plus a roster supplied in the call. The set_* tools overwrite the locally stored roster, and
 * show_stored_data can clear it, so those are marked as writes that replace earlier data.
 */
const TOOL_TITLES: Record<string, string> = {
  get_team_roster: 'Your roster, with NHL stats and games this week',
  get_league_standings: 'League standings you pasted',
  search_players: 'Search NHL players by position',
  get_player_stats: 'Player stats and upcoming schedule',
  compare_matchup: 'Compare your roster with your opponent\'s',
  optimize_lineup: 'Lineup check for tonight',
  get_streaming_recommendations: 'Schedule-aware pickup candidates',
  get_games_in_hand: 'Games in hand vs. your opponent',
  get_roster_transaction_recommendations: 'ICE roster moves',
  ice: 'ICE — Intent Chirp Engine',
  governance_dashboard: 'Governance dashboard',
  analyze_breakout_players: 'Breakout candidates',
  analyze_weekend_streams: 'Weekend stream classifier',
  chirp_opponent: 'Scout your opponent',
  analyze_trade: 'Trade evaluator',
  set_roster: 'Save your roster',
  set_opponent_roster: 'Save your opponent\'s roster',
  set_standings: 'Save league standings',
  show_stored_data: 'Show or clear saved league data',
  schedule_value: 'Club schedule value for your playoff weeks',
  read_ice: 'Read the ice (Sepiola)',
  analyze_goalie_streams: 'Goalie streaming',
  draft_kit: 'Draft kit — tiers, cheat sheet, flags',
  chirp_draft_pick: 'Who to take at your pick',
};

const WRITE_TOOLS = new Set(['set_roster', 'set_opponent_roster', 'set_standings', 'show_stored_data']);

for (const tool of TOOL_DEFINITIONS) {
  const title = TOOL_TITLES[tool.name];
  if (!title) throw new Error(`Tool "${tool.name}" has no directory title — add it to TOOL_TITLES.`);
  tool.title = title;
  tool.annotations = WRITE_TOOLS.has(tool.name)
    ? { ...tool.annotations, title, readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }
    : { ...tool.annotations, title, readOnlyHint: true, openWorldHint: false };
}

let stateless = false;
/** The hosted Worker sets this: no disk, so the set_* tools refuse and every call carries its own roster. */
export function setStateless(value: boolean): void { stateless = value; }
export function isStateless(): boolean { return stateless; }

/**
 * The tools this endpoint actually offers. On the hosted, stateless endpoint the store-backed tools can only ever
 * refuse, so they are not listed there at all — a directory user should never see a tool that cannot succeed.
 */
export function listTools(): Tool[] {
  return stateless ? TOOL_DEFINITIONS.filter(t => !STATEFUL_TOOLS.has(t.name)) : TOOL_DEFINITIONS;
}

/**
 * The one entry point both transports use. A pasted roster_text / opponent_text in the arguments overrides the stored
 * roster for the duration of this call only (request-scoped, safe under concurrency), so the same analyses serve a
 * stdio client with a saved roster and a remote client that sends it every time.
 */
export async function callTool(name: string, args: Record<string, unknown> | undefined): Promise<CallToolResult> {
  if (stateless && STATEFUL_TOOLS.has(name)) {
    return { content: [{ type: "text", text: STATELESS_REFUSAL }], isError: true };
  }
  const assume = typeof args?.assume_rostered === 'number' && ASSUME_ROSTERED_TOOLS.has(name) ? Math.floor(args.assume_rostered) : 0;
  if (assume > 0) {
    await NHL_STATS.load();
    const result = await LeagueDataService.runWithAssumption(assume, () => callWithRosters(name, args));
    return withField(result, 'assume_rostered', {
      count: assume,
      note: `The top ${assume} on the draft board (skaters by last season's points, a goalie every sixth slot) were ` +
        'treated as rostered in your league and left out of the suggestions. This is an assumption, not ownership data.',
    });
  }
  return callWithRosters(name, args);
}

async function callWithRosters(name: string, args: Record<string, unknown> | undefined): Promise<CallToolResult> {
  const rosterText = typeof args?.roster_text === 'string' ? args.roster_text.trim() : '';
  const opponentText = typeof args?.opponent_text === 'string' ? args.opponent_text.trim() : '';
  if (!rosterText && !opponentText) return dispatchTool(name, args);

  await NHL_STATS.load();
  const pasted: TransientRosters = {};
  // Lines that match no player, or several, used to vanish here: the analysis ran on a shorter roster and said nothing.
  const notMatched: string[] = [];
  const parse = (text: string, who: string) => {
    const report = ROSTER_STORE.parseRoster(text);
    notMatched.push(
      ...report.unresolved.map(u => `${who}: "${u.line}" not matched (${u.reason})`),
      ...report.ambiguous.map(a => `${who}: "${a.line}" is ambiguous — could be ${a.candidates.join(', ')}; add the team to pick one`),
    );
    return report.resolved;
  };
  if (rosterText) pasted.roster = RosterStore.asStored(parse(rosterText, 'Roster'), 'pasted roster');
  if (opponentText) pasted.opponent = RosterStore.asStored(parse(opponentText, 'Opponent'), 'pasted opponent');
  const result = await RosterStore.runWith(pasted, () => dispatchTool(name, args));
  // read_ice reports these in its own notes, and its body must match the Sepiola read contract exactly.
  return notMatched.length && name !== 'read_ice'
    ? withField(result, 'roster_not_matched', notMatched, `Left out of this analysis — ${notMatched.join('; ')}`)
    : result;
}

/** Add a field to a JSON result, or a trailing note when the result is not a JSON object. */
function withField(result: CallToolResult, key: string, value: unknown, note = `${key}: ${JSON.stringify(value)}`): CallToolResult {
  const first = result.content?.[0];
  if (first?.type === 'text') {
    try {
      const body = JSON.parse(first.text);
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const text = JSON.stringify({ ...body, [key]: value }, null, 2);
        return { ...result, content: [{ ...first, text }, ...result.content.slice(1)] };
      }
    } catch { /* not JSON — fall through to a note */ }
  }
  return { ...result, content: [...(result.content ?? []), { type: 'text', text: note }] };
}
