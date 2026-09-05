#!/usr/bin/env node

// ==========================================
// 📦 Imports - Organized by Domain
// ==========================================

// Core MCP
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Node.js
import * as path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

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
import { LEAGUE_DATA, NO_ROSTER_MESSAGE, NO_OPPONENT_MESSAGE } from './services/LeagueDataService.js';
import { NHL_SCHEDULE, NhlScheduleService } from './services/NhlScheduleService.js';
import { readIce, readIceFromText } from './services/ReadIceService.js';



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


// Helper function to find current matchup by status
function findCurrentMatchup(matchups: any): any {
  console.error('[DEBUG] findCurrentMatchup called');

  if (!matchups || matchups.count === '0') {
    console.error('[DEBUG] No matchups or count is 0');
    return null;
  }

  // Find matchup with status === "midevent" (current week)
  const matchupKeys = Object.keys(matchups).filter(key => key !== 'count');
  console.error(`[DEBUG] Total matchup keys: ${matchupKeys.length}`, matchupKeys);

  const currentMatchup = matchupKeys.find(key => {
    const matchupData = matchups[key]?.matchup;
    // Matchup can be either an object or an array
    const matchup = Array.isArray(matchupData) ? matchupData[0] : matchupData;
    const week = matchup?.week;
    const status = matchup?.status;
    console.error(`[DEBUG] Checking key "${key}": week=${week}, status="${status}"`);
    return matchup?.status === 'midevent';
  });

  console.error(`[DEBUG] Found currentMatchup key: "${currentMatchup}"`);

  // If found, return it; otherwise fallback to last matchup
  if (currentMatchup) {
    const matchupData = matchups[currentMatchup].matchup;
    console.error(`[DEBUG] Returning matchup for key "${currentMatchup}":`, {
      week: matchupData?.week,
      status: matchupData?.status
    });
    return matchupData;
  }

  // Fallback: return the last matchup in the list
  const lastKey = matchupKeys[matchupKeys.length - 1];
  console.error(`[DEBUG] FALLBACK - Using last key: "${lastKey}"`);
  if (!lastKey) return null;

  return matchups[lastKey].matchup;
}


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
async function getLeagueStandings() {
  const standings = LEAGUE_DATA.getStandings();
  if (!standings) {
    return {
      error: 'No standings stored. Paste them with `set_standings` — copy the standings ' +
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

  const players = NHL_STATS.getAll()
    .filter(p => !wanted || p.position === wanted)
    .map(p => ({
      player_id: p.player_id,
      name: p.name,
      team: p.team,
      position: p.position,
      on_your_roster: owned.has(p.player_id),
      season_stats: p.stats ?? null,
      // Rank skaters by production, goalies by wins.
      rank_value: p.position === 'G' ? (p.stats?.wins ?? 0) : (p.stats?.points ?? 0)
    }))
    .sort((a, b) => b.rank_value - a.rank_value)
    .slice(0, Math.max(1, count));

  return {
    position: position ?? 'all',
    returned: players.length,
    players,
    note: 'Ranked by last season production across all NHL players. Whether a player ' +
          'is available in your league is league-private and not knowable here — ' +
          'on_your_roster reflects only the roster you pasted.',
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
      ...(r.ambiguous ? { candidates: r.ambiguous.map((p: any) => `${p.name} (${p.team} ${p.position})`) } : {})
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

async function getRosterTransactionRecommendations(lookAheadDays: number = 7, targetPositions?: string[]) {
  try {
    // Get all the data we need
    const roster = await getTeamRoster();
    // @ts-ignore - Legacy functions removed, but still referenced
    const gamesInHand = null;
    // @ts-ignore - Legacy functions removed, but still referenced
    const streaming = null;
    
    // Analyze current roster
    // @ts-ignore - Legacy function still used here
    const analysis = analyzeRosterStrengths(roster);
    
    // Find transaction opportunities
    const recommendations = [];
    
    // 1. IMMEDIATE FIXES (injured players)
    const injuredActive = (roster.players ?? []).filter((p: any) =>
      p.status && p.status !== "" && !p.selected_position.includes("IR")
    );
    
    for (const player of injuredActive) {
      recommendations.push({
        priority: "CRITICAL",
        action: "move_to_ir",
        player: player.name,
        player_id: player.player_id,
        current_position: player.selected_position,
        status: player.status,
        reason: `${player.name} is ${player.status} but still in active lineup`,
        suggested_action: player.status === "O" ? "Move to IR+" : "Move to IR or bench"
      });
    }
    
    // 2. POSITION WEAKNESS ANALYSIS
    // @ts-ignore - Legacy function, streaming is now null
    const weakPositions = identifyWeakPositions(roster, analysis);

    // @ts-ignore - Legacy streaming data
    for (const position of weakPositions) {
      // @ts-ignore
      const bestAvailable = (streaming?.streaming_targets || [])
        .filter((p: any) => targetPositions ? targetPositions.includes(position.position) : true)
        .filter((p: any) => p.position.includes(position.position))
        .slice(0, 3);
      
      if (bestAvailable.length > 0) {
        const dropCandidate = findBestDropCandidate(roster, position.position);
        
        recommendations.push({
          priority: "HIGH",
          action: "pickup_drop",
          pickup: {
            name: bestAvailable[0].name,
            player_id: bestAvailable[0].player_id,
            position: bestAvailable[0].position,
            team: bestAvailable[0].team,
            reason: bestAvailable[0].reason,
            streaming_score: bestAvailable[0].streaming_score,
            percent_owned: bestAvailable[0].percent_owned
          },
          drop: dropCandidate,
          position_need: position.position,
          reasoning: `Strengthen ${position.position} - ${position.weakness_reason}`
        });
      }
    }
    
 // 3. SCHEDULE OPTIMIZATION
    // @ts-ignore - Legacy null handling
    const gamesDiff = gamesInHand?.games_in_hand_difference || 0;
    if (gamesDiff < 0) {
      // Opponent has more games - prioritize volume players
      // @ts-ignore
      const volumePickups = (streaming?.streaming_targets || [])
        .filter((t: any) => t.team_trending_count >= 3)
        .slice(0, 2);

      for (const pickup of volumePickups) {
        recommendations.push({
          priority: "MEDIUM",
          action: "volume_play",
          pickup: pickup,
          reasoning: `Opponent has ${Math.abs(gamesDiff)} more games - need volume players from teams with favorable schedules`
        });
      }
    }
    // 4. BENCH OPTIMIZATION
    const benchUpgrades = findBenchUpgrades(roster, streaming);
    recommendations.push(...benchUpgrades);
    
    return {
      roster_analysis: analysis,
      immediate_issues: injuredActive.length,
      // @ts-ignore - Legacy null handling
      games_disadvantage: gamesInHand.games_in_hand_difference,
      weak_positions: weakPositions,
      recommendations: recommendations
        .sort((a, b) => {
          const priorityOrder: Record<string, number> = { "CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3 };
          return (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
        })
        .slice(0, 8), // Top 8 recommendations
      // @ts-ignore - Legacy null handling
      optimal_timing: streaming.optimal_timing,
      // @ts-ignore - Legacy null handling
      market_intelligence: streaming.market_intelligence
    };
  } catch (error: any) {
    return {
      error: `Failed to get roster recommendations: ${error.message}`,
      recommendations: []
    };
  }
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
function analyzeRosterStrengths(roster: any) {
  const positions: {
    C: any[]; LW: any[]; RW: any[]; D: any[]; G: any[];
    bench: any[]; ir: any[]; active: any[];
  } = {
    C: [], LW: [], RW: [], D: [], G: [],
    bench: [], ir: [], active: []
  };
  
  roster.roster.forEach((player: any) => {
    if (player.selected_position === "BN") {
      positions.bench.push(player);
    } else if (player.selected_position.includes("IR")) {
      positions.ir.push(player);
    } else {
      positions.active.push(player);
      // Analyze by primary position
      if (player.position.includes("C")) positions.C.push(player);
      if (player.position.includes("LW")) positions.LW.push(player);
      if (player.position.includes("RW")) positions.RW.push(player);
      if (player.position.includes("D")) positions.D.push(player);
      if (player.position.includes("G")) positions.G.push(player);
    }
  });
  
  return {
    ...positions,
    position_counts: {
      C: positions.C.length,
      LW: positions.LW.length, 
      RW: positions.RW.length,
      D: positions.D.length,
      G: positions.G.length,
      bench: positions.bench.length,
      ir: positions.ir.length
    }
  };
}

function identifyWeakPositions(roster: any, analysis: any) {
  const weaknesses = [];
  
  // Check goalies first (most critical)
  const healthyGoalies = analysis.G.filter((p: any) => !p.status || p.status === "");
  if (healthyGoalies.length < 2) {
    weaknesses.push({
      position: "G", 
      weakness_reason: `Only ${healthyGoalies.length} healthy goalie(s) - need backup`,
      severity: "HIGH"
    });
  }
  
  // Check defense depth
  const healthyDefense = analysis.D.filter((p: any) => !p.status || p.status === "");
  if (healthyDefense.length < 4) {
    weaknesses.push({
      position: "D",
      weakness_reason: `Only ${healthyDefense.length} healthy defensemen - need depth`,
      severity: "MEDIUM"
    });
  }
  
  // Check forward positions
  const healthyC = analysis.C.filter((p: any) => !p.status || p.status === "");
  if (healthyC.length < 2) {
    weaknesses.push({
      position: "C",
      weakness_reason: `Only ${healthyC.length} healthy center(s) - need depth`,
      severity: "MEDIUM"
    });
  }
  
  return weaknesses;
}

function findBestDropCandidate(roster: any, positionNeed: string) {
  // Priority order for drops: bench players > injured players > worst performers
  const benchPlayers = roster.roster.filter((p: any) => p.selected_position === "BN");
  
  if (benchPlayers.length > 0) {
    // Find bench player with lowest priority (could be enhanced with stats)
    const dropCandidate = benchPlayers[benchPlayers.length - 1]; // Last bench player
    return {
      name: dropCandidate.name,
      player_id: dropCandidate.player_id,
      position: dropCandidate.position,
      team: dropCandidate.team,
      current_position: dropCandidate.selected_position,
      reason: "Lowest priority bench player for position upgrade"
    };
  }
  
  // If no bench players, suggest dropping injured player not on IR
  const injuredNotOnIR = roster.roster.filter((p: any) => 
    p.status && p.status !== "" && !p.selected_position.includes("IR")
  );
  
  if (injuredNotOnIR.length > 0) {
    const dropCandidate = injuredNotOnIR[0];
    return {
      name: dropCandidate.name,
      player_id: dropCandidate.player_id,
      position: dropCandidate.position,
      team: dropCandidate.team,
      current_position: dropCandidate.selected_position,
      reason: `Injured player (${dropCandidate.status}) - consider dropping if no IR space`
    };
  }
  
  return {
    name: "Manual Review Needed",
    reason: "No obvious drop candidates - review roster manually"
  };
}

function findBenchUpgrades(roster: any, streaming: any) {
  const recommendations = [];
  const benchPlayers = roster.roster.filter((p: any) => p.selected_position === "BN");
  
  // Look for significantly better available players
  for (const benchPlayer of benchPlayers) {
    const betterOptions = streaming.streaming_targets
      .filter((available: any) => {
        // Same position and significantly higher score
        return available.position.includes(benchPlayer.position.split(',')[0]) && 
               available.streaming_score > 75; // High threshold for bench upgrades
      })
      .slice(0, 1);
    
    if (betterOptions.length > 0) {
      recommendations.push({
        priority: "LOW",
        action: "bench_upgrade",
        pickup: betterOptions[0],
        drop: {
          name: benchPlayer.name,
          player_id: benchPlayer.player_id,
          reason: "Upgrade bench depth"
        },
        reasoning: `${betterOptions[0].name} (score: ${betterOptions[0].streaming_score}) could upgrade over ${benchPlayer.name}`
      });
    }
  }
  
  return recommendations;
}

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
  const idle = players.filter(p => p.games_this_week === 0);
  const light = players.filter(p => (p.games_this_week ?? 9) <= 2 && p.slot !== 'IR');
  const totalGames = players.reduce((n, p) => n + (p.games_this_week ?? 0), 0);

  const style = (CHIRP_STYLES as any)[chirpIntensity] ?? (CHIRP_STYLES as any).standard;
  const persona = (PERSONALITY_MODES as any)[personalityMode] ?? (PERSONALITY_MODES as any).analytical;

  const lines: string[] = [];
  if (idle.length) lines.push(`${idle.length} of their players don't play at all this week. Free real estate.`);
  if (light.length) lines.push(`${light.length} more are stuck on two games or fewer.`);
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
      ...(r.ambiguous ? { candidates: r.ambiguous.map(p => `${p.name} (${p.team} ${p.position})`) } : {}),
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
      ? `You win ${wins} categories to ${losses}. Take it before they think twice.`
      : verdict === 'DECLINE'
        ? `You lose ${losses} categories to ${wins}. That's not a trade, that's a donation.`
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
  try {
    const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
    const pkg = JSON.parse(
      readFileSync(path.join(packageRoot, "package.json"), "utf8")
    );
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// Initialize MCP Server
const server = new Server(
  {
    name: "semantic-chirp-intelligence-mcp",
    version: readPackageVersion(),
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
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
        description: "Get current league standings showing all teams and their records",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_players",
        description: "Search for available players (free agents) by position. Returns top available players.",
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
        description: "Get detailed statistics for a specific player using their player ID",
        inputSchema: {
          type: "object",
          properties: {
            player_id: {
              type: "string",
              description: "Player ID (just the number, e.g., '6381')",
            },
          },
          required: ["player_id"],
        },
      },
      {
        name: "compare_matchup",
        description: "Get detailed category-by-category comparison with your current opponent",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "optimize_lineup",
        description: "Get AI-powered recommendations for optimal lineup based on player health and positions",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_streaming_recommendations",
        description: "Get AI-powered streaming recommendations based on team schedules, player trends, and ownership. Identifies players on teams with favorable schedules (more games remaining this week) for optimal waiver pickups.",
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
              description: "Filter by position: C, LW, RW, D, G, or leave empty for all",
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
        description: "Get games in hand analysis with optional chirp intelligence - shows remaining games for you vs opponent to identify schedule advantages",
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
        description: "🏒❄️ Weekend Stream Classifier - Distinguish desperation streams (bye-week fillers, <1 week value) from genuine opportunities (sustainable roles, >2 week upside). Uses binary decision tree and upside scoring (0-100). Chirp style: desperate_or_legit",
        inputSchema: {
          type: "object",
          properties: {
            date_range: {
              type: "object",
              properties: {
                start: {
                  type: "string",
                  description: "Weekend start date (YYYY-MM-DD, e.g., '2025-10-11')"
                },
                end: {
                  type: "string",
                  description: "Weekend end date (YYYY-MM-DD, e.g., '2025-10-13')"
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
            ownership_max: {
              type: "number",
              description: "Maximum ownership percentage (default 50). Players above this are excluded",
              default: 50
            },
            team_needs: {
              type: "array",
              items: { type: "string" },
              description: "Your roster needs: ['bye_fill', 'injury_cover', 'G_volume', 'C_depth']. Helps classification"
            },
            min_upside_score: {
              type: "number",
              description: "Minimum upside score (0-100) to include. Higher = more genuine opportunities",
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
        description: "Scout your current matchup opponent's roster and generate savage trash talk based on their weaknesses — injuries, IR mismanagement, bench-heavy lineups. Pure ChirpIQX energy.",
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
        description: "🗓️ Rate all 32 NHL clubs on what their schedule is worth to a fantasy roster — total games, four-game weeks, light weeks, back-to-backs, and games played during YOUR league's playoff weeks (read from your Yahoo league settings, not guessed). The draft tiebreaker when two players are close.",
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
              description: "Override the fantasy playoff start week. Defaults to playoff_start_week from your Yahoo league settings."
            },
            playoff_end_week: {
              type: "number",
              description: "Override the final fantasy week. Defaults to your league's end_week."
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
        description: "❄️ ICE at the draft table — with a pick on the clock, ranks who to take against YOUR draft: who is already gone, what your roster still needs, Yahoo's ADP (so 'value' means the market is wrong here), and each club's schedule during your league's playoff weeks. Pass already_drafted if Yahoo's draft results lag your live draft.",
        inputSchema: {
          type: "object",
          properties: {
            pick_number: {
              type: "number",
              description: "The pick currently on the clock. Inferred from Yahoo draft results if omitted."
            },
            already_drafted: {
              type: "array",
              items: { type: "string" },
              description: "Player names already off the board. Merged with Yahoo's draft results — use this when Yahoo's API lags a fast live draft."
            },
            roster_needs: {
              type: "array",
              items: { type: "string" },
              description: "Positions you still need, e.g. [\"RW\", \"G\"]. Inferred from your roster if omitted."
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
    ],
  };
});

// Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "get_team_roster": {
        const roster = await getTeamRoster();
        return {
          content: [{ type: "text", text: JSON.stringify(roster, null, 2) }],
        };
      }

      case "get_league_standings": {
        const standings = await getLeagueStandings();
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
          position_filter: args?.position_filter as string[] | undefined,
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
              ownership_max: args?.ownership_max as number | undefined,
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
              note: "Draft pick analysis failed - pass already_drafted explicitly if Yahoo draft results are unavailable"
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
});

// Start Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`🏒❄️ Semantic Chirp Intelligence MCP v${readPackageVersion()} - ICE is ON! (Real schedule, real stats)`);
}

main().catch(console.error);
