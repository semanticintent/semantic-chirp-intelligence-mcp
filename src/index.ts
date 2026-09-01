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
import * as dotenv from "dotenv";
import * as path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { parseString } from "xml2js";
import { promisify } from "util";

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
import { YahooApiClient } from './services/YahooApiClient.js';
import { ChirpIntelligence } from './services/ChirpIntelligence.js';

// Analysis layer
import { IceAnalysis } from './analyses/IceAnalysis.js';
import { GamesInHandAnalysis } from './analyses/GamesInHandAnalysis.js';
import { StreamingAnalysis } from './analyses/StreamingAnalysis.js';
import { LineupAnalysis } from './analyses/LineupAnalysis.js';
import { WeekendStreamAnalysis } from './analyses/WeekendStreamAnalysis.js';

// Experimental: Semantic Intent Parser
import {
  SEMANTIC_PLAYER_COMPARISON,
  getPlayerComparisonInputSchema,
  executePlayerComparison
} from './experimental/semantic-tool-integration.js';

import {
  SEMANTIC_BREAKOUT_ANALYSIS,
  getBreakoutAnalysisInputSchema,
  executeBreakoutAnalysis
} from './experimental/semantic-breakout-tool.js';

import { BreakoutAnalysis } from './analyses/BreakoutAnalysis.js';
import { ScheduleValueAnalysis } from './analyses/ScheduleValueAnalysis.js';
import { DraftPickAnalysis } from './analyses/DraftPickAnalysis.js';

/**
 * Load .env from the package directory, not the current working directory.
 *
 * MCP clients launch this server with an arbitrary cwd (Claude Desktop uses
 * `/`), so a bare dotenv.config() never finds the project's .env — which is
 * why the setup docs previously required copying all four Yahoo secrets into
 * the client config as well. Resolving against the module's own location means
 * the git-ignored .env is the single place credentials live.
 *
 * Real environment variables still win: dotenv does not overwrite anything
 * already set, so a client `env` block continues to override the file.
 */
const PACKAGE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(PACKAGE_ROOT, ".env") });

const parseXML = promisify(parseString);

// Configuration
const YAHOO_CLIENT_ID = process.env.YAHOO_CLIENT_ID!;
const YAHOO_CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET!;
const LEAGUE_ID = process.env.YAHOO_LEAGUE_ID!;
const TEAM_ID = process.env.YAHOO_TEAM_ID!;

const YAHOO_API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";

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

// Initialize Yahoo API client
const yahooClient = new YahooApiClient(
  YAHOO_CLIENT_ID,
  YAHOO_CLIENT_SECRET,
  YAHOO_API_BASE
);

// Initialize analysis instances
const iceAnalysis = new IceAnalysis(yahooClient, LEAGUE_ID, TEAM_ID);
const gamesInHandAnalysis = new GamesInHandAnalysis(yahooClient, LEAGUE_ID, TEAM_ID);
const streamingAnalysis = new StreamingAnalysis(yahooClient, LEAGUE_ID, TEAM_ID);
const lineupAnalysis = new LineupAnalysis(yahooClient, LEAGUE_ID, TEAM_ID);
const breakoutAnalysis = new BreakoutAnalysis(yahooClient, LEAGUE_ID, TEAM_ID);
const scheduleValueAnalysis = new ScheduleValueAnalysis(yahooClient, LEAGUE_ID, TEAM_ID);
const draftPickAnalysis = new DraftPickAnalysis(yahooClient, LEAGUE_ID, TEAM_ID);
const weekendStreamAnalysis = new WeekendStreamAnalysis(yahooClient, LEAGUE_ID, TEAM_ID);


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

/**
 * All Yahoo access goes through the YahooApiClient service.
 *
 * index.ts previously carried its own copy of the token lifecycle -
 * loadToken / saveToken / refreshAccessToken / getValidAccessToken plus a
 * duplicate request function - while the analysis classes used the service.
 * Two independent refresh paths wrote the same .yahoo-oauth.json, so a
 * refresh triggered by a tool handler could race one triggered by an
 * analysis and clobber the newer token.
 */
async function yahooApiRequest(endpoint: string, format: string = "json"): Promise<any> {
  return yahooClient.request(endpoint, format);
}

// Tool: Get Team Roster
async function getTeamRoster() {
  const data = await yahooApiRequest(`/team/nhl.l.${LEAGUE_ID}.t.${TEAM_ID}/roster`);
  
  const teamArray = data.fantasy_content.team[0];
  const rosterData = data.fantasy_content.team[1].roster["0"].players;
  
  // Extract team info
  const teamKey = teamArray.find((item: any) => item.team_key)?.team_key;
  const teamName = teamArray.find((item: any) => item.name)?.name;
  
  // Parse players
  const playerKeys = Object.keys(rosterData).filter(key => key !== 'count');
  const players = playerKeys.map(key => {
    const playerData = rosterData[key].player[0];
    const positionData = rosterData[key].player[1];
    
    // Find attributes in the array
    const playerId = playerData.find((item: any) => item.player_id)?.player_id;
    const name = playerData.find((item: any) => item.name)?.name?.full;
    const displayPosition = playerData.find((item: any) => item.display_position)?.display_position;
    const team = playerData.find((item: any) => item.editorial_team_abbr)?.editorial_team_abbr;
    const status = playerData.find((item: any) => item.status)?.status || "";
    const selectedPos = positionData?.selected_position?.find((item: any) => item.position)?.position || "BN";
    
    return {
      player_id: playerId,
      name: name,
      position: displayPosition,
      team: team,
      status: status,
      selected_position: selectedPos,
    };
  });

  return {
    team_key: teamKey,
    team_name: teamName,
    roster: players,
  };
}

// Tool: Get League Standings
async function getLeagueStandings() {
  const data = await yahooApiRequest(`/league/nhl.l.${LEAGUE_ID}/standings`);
  
  const teams = data.fantasy_content.league[1].standings[0].teams;
  
  const standings = Object.keys(teams)
    .filter(key => key !== 'count')
    .map(key => {
      const team = teams[key].team[0];
      const standings = teams[key].team[1].team_standings;
      return {
        team_name: team[2].name,
        rank: standings.rank,
        wins: standings.outcome_totals?.wins || 0,
        losses: standings.outcome_totals?.losses || 0,
        ties: standings.outcome_totals?.ties || 0,
        points: standings.points_for,
      };
    });

  return { standings };
}

// Tool: Get Current Matchup
async function getCurrentMatchup() {
  console.error('[DEBUG] getCurrentMatchup called');
  const data = await yahooApiRequest(`/team/nhl.l.${LEAGUE_ID}.t.${TEAM_ID}/matchups`);

  console.error('[DEBUG] API response received');
  const matchups = data.fantasy_content.team[1].matchups;
  console.error('[DEBUG] Matchups count:', matchups?.count);

  // Debug: log first 3 matchup keys and their structure
  if (matchups) {
    const keys = Object.keys(matchups).filter(k => k !== 'count').slice(0, 3);
    keys.forEach(key => {
      const m = matchups[key];
      console.error(`[DEBUG] matchups["${key}"] structure:`, JSON.stringify({
        hasMatchup: !!m?.matchup,
        isArray: Array.isArray(m?.matchup),
        week: m?.matchup?.[0]?.week || m?.matchup?.week,
        status: m?.matchup?.[0]?.status || m?.matchup?.status
      }));
    });
  }

  const currentMatchup = findCurrentMatchup(matchups);

  if (!currentMatchup) {
    console.error('[DEBUG] No current matchup found');
    return { message: "No current matchup (bye week or season not started)" };
  }

  // currentMatchup is the matchup object with structure:
  // matchup = { "0": { teams: {...} }, week: "1", status: "postevent", ... }
  const matchupData = currentMatchup[0];
  const week = currentMatchup.week;
  const status = currentMatchup.status;
  const teams = matchupData?.teams;

  if (!teams) {
    console.error('[DEBUG] No teams found in matchup');
    return { message: "No teams data in current matchup" };
  }

  console.error('[DEBUG] Final result:', {
    week,
    status,
    opponent: teams['1']?.team?.[0]?.[2]?.name
  });

  return {
    week,
    status,
    your_team: teams['0']?.team?.[0]?.[2]?.name || 'Unknown',
    opponent: teams['1']?.team?.[0]?.[2]?.name || 'Unknown',
  };
}

// Tool: Search Players
async function searchPlayers(position?: string, count: number = 25) {
  let endpoint = `/league/nhl.l.${LEAGUE_ID}/players;status=A;count=${count}`;
  if (position) {
    endpoint += `;position=${position}`;
  }

  const data = await yahooApiRequest(endpoint);
  const playersData = data.fantasy_content.league[1].players;

  const players = Object.keys(playersData)
    .filter(key => key !== 'count')
    .map(key => {
      const playerData = playersData[key].player[0];

      // Find attributes in the array using .find() to handle dynamic structure
      const playerId = playerData.find((item: any) => item.player_id)?.player_id;
      const name = playerData.find((item: any) => item.name)?.name?.full;
      const displayPosition = playerData.find((item: any) => item.display_position)?.display_position;
      const team = playerData.find((item: any) => item.editorial_team_abbr)?.editorial_team_abbr;
      const percentOwned = playerData.find((item: any) => item.percent_owned)?.percent_owned?.value || "0";

      return {
        player_id: playerId,
        name: name,
        position: displayPosition,
        team: team,
        percent_owned: percentOwned,
      };
    });

  return { players };
}

// Tool: Get Player Stats
async function getPlayerStats(playerId: string) {
  const data = await yahooApiRequest(`/player/nhl.p.${playerId}/stats`);

  const playerData = data.fantasy_content.player[0];
  const stats = data.fantasy_content.player[1]?.player_stats?.stats || [];

  // Find attributes in the array using .find() to handle dynamic structure
  const playerIdResult = playerData.find((item: any) => item.player_id)?.player_id;
  const name = playerData.find((item: any) => item.name)?.name?.full;
  const displayPosition = playerData.find((item: any) => item.display_position)?.display_position;
  const team = playerData.find((item: any) => item.editorial_team_abbr)?.editorial_team_abbr;

  return {
    player_id: playerIdResult,
    name: name,
    position: displayPosition,
    team: team,
    stats: stats,
  };
}

// Tool: Get Weekly Stats
async function getWeeklyStats() {
  const data = await yahooApiRequest(`/team/nhl.l.${LEAGUE_ID}.t.${TEAM_ID}/matchups`);

  const matchups = data.fantasy_content.team[1].matchups;

  const currentMatchup = findCurrentMatchup(matchups);

  if (!currentMatchup) {
    return { message: "No current matchup" };
  }

  // currentMatchup structure: { "0": { teams: {...} }, week: 5, status: "midevent", ... }
  const teams = currentMatchup["0"]?.teams;
  const week = currentMatchup.week;
  const status = currentMatchup.status;

  if (!teams) {
    return { message: "No teams data in current matchup" };
  }

  // Extract games remaining data
  const yourGames = teams['0']?.team?.[1]?.team_remaining_games?.total;
  const oppGames = teams['1']?.team?.[1]?.team_remaining_games?.total;

  return {
    week,
    status,
    your_team: {
      name: teams['0']?.team?.[0]?.[2]?.name || 'Unknown',
      stats: teams['0']?.team?.[1]?.team_stats?.stats || [],
      games_remaining: yourGames?.remaining_games || 0,
      games_completed: yourGames?.completed_games || 0,
      live_games: yourGames?.live_games || 0,
    },
    opponent: {
      name: teams['1']?.team?.[0]?.[2]?.name || 'Unknown',
      stats: teams['1']?.team?.[1]?.team_stats?.stats || [],
      games_remaining: oppGames?.remaining_games || 0,
      games_completed: oppGames?.completed_games || 0,
      live_games: oppGames?.live_games || 0,
    },
    games_in_hand: {
      your_remaining: yourGames?.remaining_games || 0,
      opponent_remaining: oppGames?.remaining_games || 0,
      difference: (yourGames?.remaining_games || 0) - (oppGames?.remaining_games || 0),
      advantage: (yourGames?.remaining_games || 0) > (oppGames?.remaining_games || 0) ? "You" : "Opponent"
    }
  };
}

// Tool: Compare Matchup
async function compareMatchup() {
  const data = await yahooApiRequest(`/team/nhl.l.${LEAGUE_ID}.t.${TEAM_ID}/matchups`);

  const matchups = data.fantasy_content.team[1].matchups;

  const currentMatchup = findCurrentMatchup(matchups);

  if (!currentMatchup) {
    return { message: "No current matchup" };
  }

  // currentMatchup structure: { "0": { teams: {...} }, week: 5, status: "midevent", ... }
  const teams = currentMatchup["0"]?.teams;
  const week = currentMatchup.week;

  if (!teams) {
    return { message: "No teams data in current matchup" };
  }

  const yourStats = teams['0']?.team?.[1]?.team_stats?.stats || [];
  const oppStats = teams['1']?.team?.[1]?.team_stats?.stats || [];

  const comparison = yourStats.map((stat: any, idx: number) => {
    const yourVal = parseFloat(stat.stat.value) || 0;
    const oppVal = parseFloat(oppStats[idx]?.stat?.value || 0) || 0;

    return {
      category: stat.stat.display_name,
      stat_id: stat.stat.stat_id,
      your_value: yourVal,
      opp_value: oppVal,
      winning: yourVal > oppVal,
    };
  });

  const categoriesWinning = comparison.filter((c: any) => c.winning).length;

  return {
    week,
    your_team: teams['0']?.team?.[0]?.[2]?.name || 'Unknown',
    opponent: teams['1']?.team?.[0]?.[2]?.name || 'Unknown',
    categories_winning: categoriesWinning,
    categories_total: comparison.length,
    category_breakdown: comparison,
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
    const injuredActive = roster.roster.filter(p => 
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
async function getTrendingPlayers(trendType: string = "add", count: number = 25) {
  const sortParam = trendType === "add" ? "AR" : "OR";
  const endpoint = `/league/nhl.l.${LEAGUE_ID}/players;status=A;sort=${sortParam};count=${count}`;

  const data = await yahooApiRequest(endpoint);
  const playersData = data.fantasy_content.league[1].players;

  const players = Object.keys(playersData)
    .filter(key => key !== 'count')
    .map(key => {
      const playerData = playersData[key].player[0];

      // Find attributes in the array using .find() to handle dynamic structure
      const playerId = playerData.find((item: any) => item.player_id)?.player_id;
      const name = playerData.find((item: any) => item.name)?.name?.full;
      const displayPosition = playerData.find((item: any) => item.display_position)?.display_position;
      const team = playerData.find((item: any) => item.editorial_team_abbr)?.editorial_team_abbr;
      const percentOwned = playerData.find((item: any) => item.percent_owned)?.percent_owned?.value || "0";

      return {
        player_id: playerId,
        name: name,
        position: displayPosition,
        team: team,
        percent_owned: percentOwned,
      };
    });

  return { trend_type: trendType, players };
}

// Tool: Chirp Opponent
async function chirpOpponent(chirpIntensity = 'savage', personalityMode = 'roast_master') {
  const data = await yahooApiRequest(`/team/nhl.l.${LEAGUE_ID}.t.${TEAM_ID}/matchups`);
  const matchups = data.fantasy_content.team[1].matchups;
  const currentMatchup = findCurrentMatchup(matchups);

  if (!currentMatchup) {
    return { message: "No active matchup — nobody to chirp right now." };
  }

  const matchupData = currentMatchup["0"];
  const teams = matchupData?.teams;
  if (!teams) return { message: "Could not read matchup teams." };

  const opponentTeamArray = teams['1']?.team?.[0];
  const opponentTeamKey = opponentTeamArray?.find((item: any) => item.team_key)?.team_key;
  const opponentName = opponentTeamArray?.find((item: any) => item.name)?.name || 'Unknown';

  if (!opponentTeamKey) return { message: "Could not find opponent team key." };

  const rosterData = await yahooApiRequest(`/team/${opponentTeamKey}/roster`);
  const rawPlayers = rosterData.fantasy_content.team[1].roster["0"].players;
  const playerKeys = Object.keys(rawPlayers).filter(k => k !== 'count');

  const players = playerKeys.map(key => {
    const pd = rawPlayers[key].player[0];
    const posData = rawPlayers[key].player[1];
    return {
      name: pd.find((item: any) => item.name)?.name?.full || 'Unknown',
      position: pd.find((item: any) => item.display_position)?.display_position || '?',
      team: pd.find((item: any) => item.editorial_team_abbr)?.editorial_team_abbr || '?',
      status: pd.find((item: any) => item.status)?.status || '',
      selected_position: posData?.selected_position?.find((item: any) => item.position)?.position || 'BN',
    };
  });

  const injured = players.filter(p => p.status && p.status !== '');
  const onIR = players.filter(p => p.selected_position === 'IR');
  const onBench = players.filter(p => p.selected_position === 'BN');
  const injuredActive = injured.filter(p => p.selected_position !== 'IR' && p.selected_position !== 'BN');
  const activeCount = players.length - onBench.length - onIR.length;

  const style = CHIRP_STYLES[chirpIntensity as keyof typeof CHIRP_STYLES] || CHIRP_STYLES['savage'];
  const personality = PERSONALITY_MODES[personalityMode as keyof typeof PERSONALITY_MODES] || PERSONALITY_MODES['roast_master'];

  const chirpLines: string[] = [];
  if (injured.length >= 3) {
    chirpLines.push(`${opponentName} is running a hospital roster with ${injured.length} banged-up players. They should rename the team to "The Walking Wounded."`);
  } else if (injured.length > 0) {
    chirpLines.push(`${injured.length} of ${opponentName}'s key players are dinged up. Couldn't happen to a nicer team.`);
  }
  if (injuredActive.length > 0) {
    chirpLines.push(`They've got ${injuredActive.length} injured player${injuredActive.length > 1 ? 's' : ''} still in active slots — not even using their IR correctly. Amateur hour.`);
  }
  if (onBench.length >= 5) {
    chirpLines.push(`${onBench.length} players collecting dust on the bench. That's not a fantasy team, that's a waiting room.`);
  }
  if (chirpLines.length === 0) {
    chirpLines.push(`${opponentName} looks healthy on paper — but paper doesn't win categories. Execution does. That's your edge.`);
  }

  const weaknesses = [
    ...(injured.length >= 3 ? [`${injured.length} players injured`] : []),
    ...(injuredActive.length > 0 ? [`${injuredActive.length} injured players in active slots`] : []),
    ...(onBench.length >= 5 ? [`Heavy bench (${onBench.length} players)`] : []),
  ];

  return {
    opponent: opponentName,
    week: currentMatchup.week,
    opponent_roster_summary: {
      total_players: players.length,
      active_players: activeCount,
      bench_players: onBench.length,
      ir_players: onIR.length,
      injured_players: injured.length,
      injured_active: injuredActive.length,
    },
    weaknesses: weaknesses.length > 0 ? weaknesses : ["No obvious weaknesses detected — they're running a clean roster."],
    chirp: {
      style: style.tone,
      personality: personality.voice,
      main_chirp: `${style.prefix} ${chirpLines.join(' ')} ${style.suffix}`,
      ice_cold_truth: `❄️ Bottom line: know your enemy. ${opponentName} has gaps — your job is to exploit them.`,
    },
    opponent_roster: players,
  };
}

// Tool: Analyze Trade
async function analyzeTradeImpact(giving: string[], receiving: string[], chirpIntensity = 'standard') {
  const statIdLabels: Record<string, string> = {
    '1': 'G', '2': 'A', '3': '+/-', '4': 'PIM', '5': 'SOG',
    '8': 'PPP', '31': 'W', '32': 'GAA', '33': 'SV%',
  };
  const categories = ['G', 'A', '+/-', 'PIM', 'SOG', 'PPP', 'W', 'GAA', 'SV%'];
  const lowerIsBetter = new Set(['GAA']);

  async function findPlayerStats(name: string) {
    const searchData = await yahooApiRequest(
      `/league/nhl.l.${LEAGUE_ID}/players;search=${encodeURIComponent(name)};count=1`
    );
    const playersData = searchData.fantasy_content.league[1].players;
    const playerKeys = Object.keys(playersData).filter(k => k !== 'count');
    if (playerKeys.length === 0) return { name, found: false, stats: {} as Record<string, number>, position: '', team: '' };

    const pd = playersData[playerKeys[0]].player[0];
    const playerId = pd.find((item: any) => item.player_id)?.player_id;
    const foundName = pd.find((item: any) => item.name)?.name?.full || name;
    const position = pd.find((item: any) => item.display_position)?.display_position || '?';
    const team = pd.find((item: any) => item.editorial_team_abbr)?.editorial_team_abbr || '?';

    if (!playerId) return { name, found: false, stats: {} as Record<string, number>, position, team };

    const statsData = await yahooApiRequest(`/player/nhl.p.${playerId}/stats`);
    const statsArray = statsData.fantasy_content.player[1]?.player_stats?.stats || [];

    const stats: Record<string, number> = {};
    statsArray.forEach((sw: any) => {
      const stat = sw.stat;
      if (stat && statIdLabels[stat.stat_id]) {
        stats[statIdLabels[stat.stat_id]] = parseFloat(stat.value) || 0;
      }
    });

    return { name: foundName, found: true, playerId, position, team, stats };
  }

  const [givingPlayers, receivingPlayers] = await Promise.all([
    Promise.all(giving.map(name => findPlayerStats(name))),
    Promise.all(receiving.map(name => findPlayerStats(name))),
  ]);

  function sumStats(players: any[]): Record<string, number> {
    const totals: Record<string, number> = {};
    players.filter(p => p.found).forEach(p => {
      categories.forEach(cat => {
        totals[cat] = (totals[cat] || 0) + (p.stats[cat] || 0);
      });
    });
    return totals;
  }

  const givingStats = sumStats(givingPlayers);
  const receivingStats = sumStats(receivingPlayers);

  let receivingWins = 0;
  let givingWins = 0;
  const categoryBreakdown = categories
    .filter(cat => (givingStats[cat] || 0) !== 0 || (receivingStats[cat] || 0) !== 0)
    .map(cat => {
      const gVal = givingStats[cat] || 0;
      const rVal = receivingStats[cat] || 0;
      const lowerBetter = lowerIsBetter.has(cat);
      let winner: 'receiving' | 'giving' | 'push';
      if (Math.abs(rVal - gVal) < 0.01) {
        winner = 'push';
      } else if (lowerBetter ? rVal < gVal : rVal > gVal) {
        winner = 'receiving';
        receivingWins++;
      } else {
        winner = 'giving';
        givingWins++;
      }
      return { category: cat, giving: gVal, receiving: rVal, winner };
    });

  const verdict = receivingWins > givingWins ? 'ACCEPT' : receivingWins < givingWins ? 'DECLINE' : 'PUSH';
  const style = CHIRP_STYLES[chirpIntensity as keyof typeof CHIRP_STYLES] || CHIRP_STYLES['standard'];

  const chirpText = verdict === 'ACCEPT'
    ? `${style.prefix} you're gaining ${receivingWins} categories vs ${givingWins}. That's not a trade — that's a heist. Pull the trigger. ${style.suffix}`
    : verdict === 'DECLINE'
    ? `${style.prefix} you'd be handing away ${givingWins} categories for only ${receivingWins} back. Your opponent is praying you say yes. Hard pass. ${style.suffix}`
    : `${style.prefix} dead even at ${receivingWins} categories each. Unless this fixes a positional need, don't bother. ${style.suffix}`;

  const iceColdTruth = verdict === 'ACCEPT'
    ? '❄️ ICE Cold Truth: Smart managers see value before their opponent does. This is that moment.'
    : verdict === 'DECLINE'
    ? '🔥 Savage Reality: This trade has "I got played" written all over it. Close the chat.'
    : '💡 Real Talk: Push trades only make sense when they fix a roster hole. Otherwise, pass.';

  return {
    trade: { giving, receiving },
    players: { giving: givingPlayers, receiving: receivingPlayers },
    category_breakdown: categoryBreakdown,
    summary: { receiving_wins: receivingWins, giving_wins: givingWins, verdict },
    chirp: { verdict_chirp: chirpText, ice_cold_truth: iceColdTruth },
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
    const pkg = JSON.parse(
      readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")
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
        name: "get_current_matchup",
        description: "Get information about your current week's matchup",
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
        name: "get_weekly_stats",
        description: "Get your team's current week statistics and compare with opponent",
        inputSchema: {
          type: "object",
          properties: {},
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
        name: "get_trending_players",
        description: "Get trending players (most added or most owned) to identify hot pickups",
        inputSchema: {
          type: "object",
          properties: {
            trend_type: {
              type: "string",
              description: "Type of trending: 'add' for most added, 'own' for most owned",
              enum: ["add", "own"],
              default: "add",
            },
            count: {
              type: "number",
              description: "Number of players to return (default 25)",
              default: 25,
            },
          },
        },
      },
      {
        name: "debug_api_call",
        description: "Debug tool to see raw Yahoo API responses for troubleshooting",
        inputSchema: {
          type: "object",
          properties: {
            endpoint: {
              type: "string",
              description: "API endpoint to call (e.g., '/team/nhl.l.{LEAGUE_ID}.t.{TEAM_ID}/roster')",
            },
          },
          required: ["endpoint"],
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
        name: SEMANTIC_PLAYER_COMPARISON.name,
        description: `${SEMANTIC_PLAYER_COMPARISON.description} - Auto-configured from semantic intent!`,
        inputSchema: getPlayerComparisonInputSchema()
      },
      {
        name: SEMANTIC_BREAKOUT_ANALYSIS.name,
        description: `${SEMANTIC_BREAKOUT_ANALYSIS.description} - 🏒 Comprehensive breakout analysis with data-driven scoring (40% recent, 30% projections, 20% opportunity, 10% risk)`,
        inputSchema: getBreakoutAnalysisInputSchema()
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
              description: "How deep to pull the player pool (default 150, max 300)",
              default: 150
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

      case "get_current_matchup": {
        const matchup = await getCurrentMatchup();
        return {
          content: [{ type: "text", text: JSON.stringify(matchup, null, 2) }],
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

      case "get_weekly_stats": {
        const stats = await getWeeklyStats();
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

      case "get_trending_players": {
        const trendType = (args?.trend_type as string) || "add";
        const count = (args?.count as number) || 25;
        const trending = await getTrendingPlayers(trendType, count);
        return {
          content: [{ type: "text", text: JSON.stringify(trending, null, 2) }],
        };
      }

      case "debug_api_call": {
        const endpoint = args?.endpoint as string;
        if (!endpoint) {
          throw new Error("endpoint is required");
        }
        const rawData = await yahooApiRequest(endpoint);
        return {
          content: [{ type: "text", text: JSON.stringify(rawData, null, 2) }],
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
      case "semantic_player_comparison": {
        try {
          const result = await executePlayerComparison(
            args as { player1?: string; player2?: string },
            getPlayerStats,
            searchPlayers
          );

          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: JSON.stringify({
              error: errorMessage,
              note: "This is an experimental semantic intent-driven tool"
            }, null, 2) }],
            isError: true
          };
        }
      }

      case "analyze_breakout_players": {
        try {
          const result = await executeBreakoutAnalysis(
            args as {
              position_filter?: string[];
              ownership_threshold?: number;
              breakout_age_max?: number;
              min_score?: number;
              max_results?: number;
              chirp_intensity?: string;
              personality_mode?: string;
              enable_chirp?: boolean;
            },
            breakoutAnalysis
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
              pool_size: args?.pool_size as number | undefined
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
