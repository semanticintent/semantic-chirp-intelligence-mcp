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
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import https from "https";
import { parseString } from "xml2js";
import { promisify } from "util";

// Domain layer
import type {
  ChirpParameters,
  SemanticChirpContract,
  YahooToken
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

dotenv.config();

const parseXML = promisify(parseString);

// Configuration
const YAHOO_CLIENT_ID = process.env.YAHOO_CLIENT_ID!;
const YAHOO_CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET!;
const LEAGUE_ID = process.env.YAHOO_LEAGUE_ID!;
const TEAM_ID = process.env.YAHOO_TEAM_ID!;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_FILE = path.join(__dirname, "..", ".yahoo-oauth.json");

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

let cachedToken: YahooToken | null = null;

function loadToken(): YahooToken | null {
  try {
    console.error(`[DEBUG] Looking for token at: ${TOKEN_FILE}`);
    if (fs.existsSync(TOKEN_FILE)) {
      const tokenData = fs.readFileSync(TOKEN_FILE, "utf8");
      const token = JSON.parse(tokenData) as YahooToken;
      console.error(`[DEBUG] Token loaded successfully`);
      cachedToken = token;
      return token;
    } else {
      console.error(`[DEBUG] Token file not found`);
    }
  } catch (error) {
    console.error("[ERROR] Error loading token:", error);
  }
  return null;
}

function saveToken(token: YahooToken) {
  token.expires_at = Date.now() + (token.expires_in * 1000);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
  cachedToken = token;
  console.error("[DEBUG] Token saved successfully");
}

async function refreshAccessToken(): Promise<string> {
  const token = cachedToken || loadToken();
  
  if (!token) {
    throw new Error("No refresh token available. Please re-authenticate.");
  }

  console.error("[DEBUG] Refreshing access token...");

  const tokenData = new URLSearchParams({
    client_id: YAHOO_CLIENT_ID,
    client_secret: YAHOO_CLIENT_SECRET,
    redirect_uri: "oob",
    refresh_token: token.refresh_token,
    grant_type: "refresh_token",
  });

  const options = {
    hostname: "api.login.yahoo.com",
    port: 443,
    path: "/oauth2/get_token",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": tokenData.toString().length,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        try {
          const newToken = JSON.parse(data) as YahooToken;
          saveToken(newToken);
          console.error("[DEBUG] Token refreshed successfully");
          resolve(newToken.access_token);
        } catch (error) {
          reject(new Error(`Failed to parse token response: ${error}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(tokenData.toString());
    req.end();
  });
}

async function getValidAccessToken(): Promise<string> {
  const token = cachedToken || loadToken();
  
  if (!token) {
    throw new Error("No authentication token found! Run: node authenticate.js");
  }

  // Check if token is expired (with 5 minute buffer)
  if (token.expires_at && token.expires_at < Date.now() + 300000) {
    console.error("[DEBUG] Token expired or expiring soon, refreshing...");
    return await refreshAccessToken();
  }

  return token.access_token;
}

// Yahoo API helper function
async function yahooApiRequest(endpoint: string, format: string = "json"): Promise<any> {
  const accessToken = await getValidAccessToken();
  
  const url = `${YAHOO_API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}format=${format}`;
  
  console.error(`[DEBUG] API Request: ${endpoint}`);

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        if (res.statusCode === 401) {
          // Token expired, try to refresh and retry
          refreshAccessToken()
            .then(() => yahooApiRequest(endpoint, format))
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`API returned status ${res.statusCode}: ${data}`));
          return;
        }

        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse API response: ${error}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
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
  const data = await yahooApiRequest(`/team/nhl.l.${LEAGUE_ID}.t.${TEAM_ID}/matchups`);
  
  const matchups = data.fantasy_content.team[1].matchups;
  
  if (!matchups || matchups.count === '0') {
    return { message: "No current matchup (bye week or season not started)" };
  }

  const currentMatchup = matchups['0'].matchup[0];
  const teams = currentMatchup.teams;
  
  return {
    week: currentMatchup.week,
    status: currentMatchup.status,
    your_team: teams['0'].team[0][2].name,
    opponent: teams['1'].team[0][2].name,
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
  
  if (!matchups || matchups.count === '0') {
    return { message: "No current matchup" };
  }

    const currentMatchup = matchups['0'].matchup;
  const teams = currentMatchup[0].teams;

  // Extract games remaining data
  const yourGames = teams['0'].team[1]?.team_remaining_games?.total;
  const oppGames = teams['1'].team[1]?.team_remaining_games?.total;

  return {
    week: currentMatchup[0].week,
    status: currentMatchup[0].status,
    your_team: {
      name: teams['0'].team[0][2].name,
      stats: teams['0'].team[1]?.team_stats?.stats || [],
      games_remaining: yourGames?.remaining_games || 0,
      games_completed: yourGames?.completed_games || 0,
      live_games: yourGames?.live_games || 0,
    },
    opponent: {
      name: teams['1'].team[0][2].name,
      stats: teams['1'].team[1]?.team_stats?.stats || [],
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
  
  if (!matchups || matchups.count === '0') {
    return { message: "No current matchup" };
  }

  const currentMatchup = matchups['0'].matchup;
  const teams = currentMatchup[0].teams;
  
  const yourStats = teams['0'].team[1]?.team_stats?.stats || [];
  const oppStats = teams['1'].team[1]?.team_stats?.stats || [];
  
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
    week: currentMatchup[0].week,
    your_team: teams['0'].team[0][2].name,
    opponent: teams['1'].team[0][2].name,
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



// Initialize MCP Server
const server = new Server(
  {
    name: "semantic-chirp-intelligence-mcp",
    version: "3.0.0",
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
              description: "API endpoint to call (e.g., '/team/nhl.l.51154.t.8/roster')",
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
      }
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
  console.error("🏒❄️ Semantic Chirp Intelligence MCP v3.0 - ICE is ON! (Official API)");
}

main().catch(console.error);
