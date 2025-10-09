#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import https from "https";
import { parseString } from "xml2js";
import { promisify } from "util";

dotenv.config();

const parseXML = promisify(parseString);

// ==========================================
// 🏒 ICE - Intent Chirp Engine Configuration
// ==========================================

const CHIRP_STYLES = {
  gentle: {
    tone: "encouraging",
    energy: "supportive",
    prefix: "Consider",
    suffix: "when you're ready"
  },
  standard: {
    tone: "direct_honest",
    energy: "confident",
    prefix: "Time to",
    suffix: "and improve your game"
  },
  savage: {
    tone: "brutal_truth",
    energy: "aggressive",
    prefix: "Bro,",
    suffix: "Get it together!"
  },
  ice_cold: {
    tone: "championship_enforcer",
    energy: "intimidating_confidence",
    prefix: "Listen up, future champion -",
    suffix: "That's how legends are made."
  }
};

const PERSONALITY_MODES = {
  analytical: {
    focus: "data_driven",
    style: "smart chirps with stats backing",
    voice: "hockey_statistician",
    phrases: ["The data shows", "Analysis indicates", "Stats don't lie"]
  },
  motivational: {
    focus: "championship_mindset",
    style: "pump-up chirps that inspire action",
    voice: "championship_coach",
    phrases: ["You've got this", "Championship teams", "Winners do this"]
  },
  roast_master: {
    focus: "entertainment_value",
    style: "savage roasts with hockey humor",
    voice: "locker_room_comedian",
    phrases: ["Buddy,", "That's like", "Even my grandmother"]
  },
  championship_coach: {
    focus: "winning_strategy",
    style: "tough love with clear direction",
    voice: "elite_level_mentor",
    phrases: ["Elite players", "Championship strategy", "Next level thinking"]
  }
};

const TOOL_METADATA: Record<string, any> = {
  get_team_roster: {
    chirp_style: "analytical_assessment",
    discovery_tags: ["roster", "lineup", "players", "status", "team"],
    intent_category: "team_assessment",
    hockey_context: "roster_analysis",
    chirp_potential: "roster_weaknesses"
  },
  get_league_standings: {
    chirp_style: "competitive_reality",
    discovery_tags: ["standings", "league", "competition", "rankings", "position"],
    intent_category: "league_awareness",
    hockey_context: "competitive_landscape",
    chirp_potential: "standings_truth"
  },
  get_current_matchup: {
    chirp_style: "matchup_assessment",
    discovery_tags: ["matchup", "opponent", "week", "competition", "stats"],
    intent_category: "weekly_strategy",
    hockey_context: "head_to_head_battle",
    chirp_potential: "matchup_reality"
  },
  get_games_in_hand: {
    chirp_style: "strategic_advantage",
    discovery_tags: ["schedule", "advantage", "games", "strategy", "matchup"],
    intent_category: "competitive_intelligence",
    hockey_context: "schedule_warfare",
    chirp_potential: "schedule_domination"
  },
  get_streaming_recommendations: {
    chirp_style: "opportunity_hunter",
    discovery_tags: ["pickups", "waivers", "streaming", "schedule", "trends"],
    intent_category: "acquisition_strategy",
    hockey_context: "waiver_wire_mastery",
    chirp_potential: "pickup_strategy"
  },
  get_roster_transaction_recommendations: {
    chirp_style: "ice_cold_truth",
    discovery_tags: ["optimization", "ICE", "championship", "decisions", "transactions"],
    intent_category: "ultimate_advisor",
    hockey_context: "league_domination",
    chirp_potential: "brutal_optimization"
  },
  get_weekly_stats: {
    chirp_style: "performance_review",
    discovery_tags: ["stats", "weekly", "performance", "matchup", "analysis"],
    intent_category: "performance_tracking",
    hockey_context: "stat_battle",
    chirp_potential: "weekly_performance"
  },
  compare_matchup: {
    chirp_style: "head_to_head_analysis",
    discovery_tags: ["comparison", "matchup", "opponent", "strategy", "categories"],
    intent_category: "tactical_analysis",
    hockey_context: "category_warfare",
    chirp_potential: "matchup_insights"
  },
  optimize_lineup: {
    chirp_style: "lineup_optimization",
    discovery_tags: ["lineup", "optimization", "active", "bench", "strategy"],
    intent_category: "daily_management",
    hockey_context: "lineup_strategy",
    chirp_potential: "lineup_fixes"
  },
  search_players: {
    chirp_style: "player_discovery",
    discovery_tags: ["search", "players", "available", "free_agents", "discovery"],
    intent_category: "player_research",
    hockey_context: "talent_scouting",
    chirp_potential: "player_insights"
  },
  get_player_stats: {
    chirp_style: "player_evaluation",
    discovery_tags: ["stats", "player", "performance", "evaluation", "analysis"],
    intent_category: "player_analysis",
    hockey_context: "individual_assessment",
    chirp_potential: "player_reality"
  },
  get_trending_players: {
    chirp_style: "trend_hunting",
    discovery_tags: ["trends", "hot", "cold", "momentum", "pickups"],
    intent_category: "market_intelligence",
    hockey_context: "waiver_trends",
    chirp_potential: "trend_opportunities"
  }
};

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
// 🏒 Chirp Intelligence Interfaces
// ==========================================

interface ChirpParameters {
  chirp_intensity?: "gentle" | "standard" | "savage" | "ice_cold";
  personality_mode?: "analytical" | "motivational" | "roast_master" | "championship_coach";
  enable_chirp?: boolean;
}

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

// Token management
interface YahooToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  expires_at?: number;
}

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
    const gamesInHand = await getGamesInHand();
    const streaming = await getStreamingRecommendations(lookAheadDays, undefined, "weekly");
    
    // Analyze current roster
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
    const weakPositions = identifyWeakPositions(roster, analysis);
    
    for (const position of weakPositions) {
      const bestAvailable = streaming.streaming_targets
        .filter(p => targetPositions ? targetPositions.includes(position.position) : true)
        .filter(p => p.position.includes(position.position))
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
    const gamesDiff = gamesInHand.games_in_hand_difference || 0;
    if (gamesDiff < 0) {
      // Opponent has more games - prioritize volume players
      const volumePickups = streaming.streaming_targets
        .filter(t => t.team_trending_count >= 3)
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
      games_disadvantage: gamesInHand.games_in_hand_difference,
      weak_positions: weakPositions,
      recommendations: recommendations
        .sort((a, b) => {
          const priorityOrder: Record<string, number> = { "CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3 };
          return (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
        })
        .slice(0, 8), // Top 8 recommendations
      optimal_timing: streaming.optimal_timing,
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
  if (chirpOptions.enable_chirp === false) {
    return originalData;
  }

  const metadata = TOOL_METADATA[toolName];
  if (!metadata) {
    return originalData;
  }

  const chirpStyle = CHIRP_STYLES[chirpOptions.chirp_intensity || 'standard'];
  const personality = PERSONALITY_MODES[chirpOptions.personality_mode || 'analytical'];

  return {
    // Original data preserved
    ...originalData,

    // NEW: Chirp Intelligence Layer
    chirp_intelligence: {
      tool_identity: toolName === "get_roster_transaction_recommendations" ? "ICE - Intent Chirp Engine" : `${toolName} with chirp intelligence`,
      style: chirpStyle.tone,
      personality: personality.voice,
      intensity: chirpOptions.chirp_intensity || 'standard',
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
async function getGamesInHand() {
  const data = await yahooApiRequest(`/team/nhl.l.${LEAGUE_ID}.t.${TEAM_ID}/matchups`);

  const matchups = data.fantasy_content.team[1].matchups;

  if (!matchups || matchups.count === '0') {
    return { message: "No current matchup" };
  }

  const currentMatchup = matchups['0'].matchup;
  const teams = currentMatchup[0].teams;

  const yourGames = teams['0'].team[1]?.team_remaining_games?.total;
  const oppGames = teams['1'].team[1]?.team_remaining_games?.total;

  return {
    week: currentMatchup[0].week,
    your_team: teams['0'].team[0][2].name,
    opponent: teams['1'].team[0][2].name,
    your_games_remaining: yourGames?.remaining_games || 0,
    your_games_completed: yourGames?.completed_games || 0,
    your_live_games: yourGames?.live_games || 0,
    opponent_games_remaining: oppGames?.remaining_games || 0,
    opponent_games_completed: oppGames?.completed_games || 0,
    opponent_live_games: oppGames?.live_games || 0,
    games_in_hand_difference: (yourGames?.remaining_games || 0) - (oppGames?.remaining_games || 0),
    advantage: (yourGames?.remaining_games || 0) > (oppGames?.remaining_games || 0) ? "you" : "opponent",
    analysis: getGamesInHandAnalysis(yourGames?.remaining_games || 0, oppGames?.remaining_games || 0)
  };
}

// Helper function for games in hand analysis
function getGamesInHandAnalysis(yourGames: number, oppGames: number): string {
  const diff = yourGames - oppGames;

  if (diff === 0) {
    return "Equal games remaining - no games in hand advantage";
  } else if (diff > 0) {
    return `You have ${diff} more game${diff > 1 ? 's' : ''} remaining - significant advantage for accumulating stats`;
  } else {
    return `Opponent has ${Math.abs(diff)} more game${Math.abs(diff) > 1 ? 's' : ''} remaining - they have the games in hand advantage`;
  }
}

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

// Tool: Optimize Lineup
async function optimizeLineup() {
  const roster = await getTeamRoster();
  
  const activePlayers = roster.roster.filter(p => 
    p.selected_position !== "BN" && p.selected_position !== "IR" && p.selected_position !== "IR+"
  );
  
  const benchPlayers = roster.roster.filter(p => p.selected_position === "BN");
  
  const recommendations = [];
  
  // Check for injured players in active lineup
  for (const player of activePlayers) {
    if (player.status && player.status !== "") {
      recommendations.push({
        action: "bench",
        player_id: player.player_id,
        player: player.name,
        reason: `Player is ${player.status} - should be benched`,
        current_position: player.selected_position,
      });
    }
  }
  
  // Check for healthy bench players
  for (const player of benchPlayers) {
    if (!player.status || player.status === "") {
      recommendations.push({
        action: "start",
        player_id: player.player_id,
        player: player.name,
        reason: "Healthy player on bench - consider starting",
        position: player.position,
      });
    }
  }
  
  return {
    current_active: activePlayers.length,
    current_bench: benchPlayers.length,
    recommendations,
    analysis: recommendations.length === 0
      ? "Lineup looks optimal - all healthy players are active"
      : `Found ${recommendations.length} potential lineup improvements`,
  };
}

// Helper function to calculate streaming score
function calculateStreamingScore(player: any, teamData: any, trendingRank: number | null): number {
  let score = 0;

  // Games remaining bonus (0-40 points)
  score += Math.min(teamData.remaining_games * 2, 40);

  // Low ownership bonus (0-30 points)
  const ownership = parseFloat(player.percent_owned);
  score += Math.max(30 - ownership, 0);

  // Trending bonus (0-20 points)
  if (trendingRank !== null) {
    score += Math.max(20 - trendingRank, 0);
  }

  // Position scarcity bonus (goalies get extra points)
  if (player.position === 'G') {
    score += 10;
  }

  return Math.round(score);
}

// Helper function for timing recommendations
function getOptimalTiming(strategyType: string): any {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

  if (strategyType === "weekend") {
    return {
      pickup_day: "Friday",
      drop_day: "Sunday night",
      reasoning: "Pick up before weekend games, drop after Sunday games complete"
    };
  }

  return {
    pickup_day: dayOfWeek < 3 ? "Tuesday" : "Friday",
    drop_day: "Next Tuesday",
    reasoning: "Pick up early in week or before weekend, reassess weekly"
  };
}

// Tool: Get Streaming Recommendations
async function getStreamingRecommendations(
  daysAhead: number = 7,
  positionFilter?: string,
  strategyType: string = "weekly"
) {
  // Get trending players and available players
  const trending = await getTrendingPlayers("add", 50);
  const availablePlayers = await searchPlayers(positionFilter, 50);

  // Use trending patterns as schedule proxy - teams with multiple trending players
  // likely have favorable schedules (market intelligence)
  const teamTrendingCount = new Map<string, number>();
  const teamTrendingPlayers = new Map<string, any[]>();

  // Count how many trending players each NHL team has
  trending.players.forEach((player, index) => {
    const team = player.team;
    if (team) {
      teamTrendingCount.set(team, (teamTrendingCount.get(team) || 0) + 1);
      if (!teamTrendingPlayers.has(team)) {
        teamTrendingPlayers.set(team, []);
      }
      teamTrendingPlayers.get(team)!.push({...player, trending_rank: index + 1});
    }
  });

  // Teams with multiple trending players likely have schedule advantages
  const favorableTeams = Array.from(teamTrendingCount.entries())
    .filter(([team, count]) => count >= 2) // Teams with 2+ trending players
    .sort((a, b) => b[1] - a[1]) // Sort by trending player count
    .slice(0, 10);

  // Build streaming recommendations
  const streamingTargets: any[] = [];

  // Add trending players from favorable teams
  for (const [team, count] of favorableTeams) {
    const teamPlayers = teamTrendingPlayers.get(team) || [];
    for (const player of teamPlayers) {
      if (!positionFilter || player.position === positionFilter) {
        streamingTargets.push({
          player_id: player.player_id,
          name: player.name,
          position: player.position,
          team: player.team,
          percent_owned: player.percent_owned,
          team_trending_count: count,
          trending_rank: player.trending_rank,
          streaming_score: calculateStreamingScore(player, {remaining_games: count * 10}, player.trending_rank - 1),
          reason: `${player.team} has ${count} trending players, suggesting favorable schedule`
        });
      }
    }
  }

  // Add other highly trending players (top 10)
  trending.players.slice(0, 10).forEach((player, index) => {
    if ((!positionFilter || player.position === positionFilter) &&
        !streamingTargets.find(p => p.player_id === player.player_id)) {
      streamingTargets.push({
        player_id: player.player_id,
        name: player.name,
        position: player.position,
        team: player.team,
        percent_owned: player.percent_owned,
        team_trending_count: teamTrendingCount.get(player.team) || 1,
        trending_rank: index + 1,
        streaming_score: calculateStreamingScore(player, {remaining_games: 25}, index),
        reason: `#${index + 1} most added player - high pickup activity`
      });
    }
  });

  // Add low-owned players (under 5% ownership)
  availablePlayers.players
    .filter(player => parseFloat(player.percent_owned) < 5)
    .slice(0, 10)
    .forEach(player => {
      if ((!positionFilter || player.position === positionFilter) &&
          !streamingTargets.find(p => p.player_id === player.player_id)) {
        streamingTargets.push({
          player_id: player.player_id,
          name: player.name,
          position: player.position,
          team: player.team,
          percent_owned: player.percent_owned,
          team_trending_count: teamTrendingCount.get(player.team) || 0,
          trending_rank: null,
          streaming_score: calculateStreamingScore(player, {remaining_games: 20}, null),
          reason: `Low ownership (${player.percent_owned}%) - potential sleeper pick`
        });
      }
    });

  // Sort by streaming score
  streamingTargets.sort((a, b) => b.streaming_score - a.streaming_score);

  return {
    strategy_type: strategyType,
    analysis_period: `${daysAhead} days`,
    favorable_teams: favorableTeams.map(([team, count]) => ({
      team: team,
      trending_players: count,
      reason: `${count} players trending - likely favorable schedule`
    })),
    streaming_targets: streamingTargets.slice(0, 15),
    optimal_timing: getOptimalTiming(strategyType),
    market_intelligence: {
      total_trending: trending.players.length,
      favorable_teams_count: favorableTeams.length,
      top_trending_team: favorableTeams[0]?.[0] || "None identified"
    }
  };
}

// Initialize MCP Server
const server = new Server(
  {
    name: "semantic-chirp-intelligence-mcp",
    version: "2.0.0", // About to upgrade to 3.0.0 with ICE!
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
        const optimization = await optimizeLineup();
        return {
          content: [{ type: "text", text: JSON.stringify(optimization, null, 2) }],
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
        const daysAhead = (args?.days_ahead as number) || 7;
        const positionFilter = args?.position_filter as string | undefined;
        const strategyType = (args?.strategy_type as string) || "weekly";

        const chirpOptions: ChirpParameters = {
          chirp_intensity: args?.chirp_intensity as any,
          personality_mode: args?.personality_mode as any,
          enable_chirp: args?.enable_chirp as boolean
        };

        const recommendations = await getStreamingRecommendations(daysAhead, positionFilter, strategyType);
        const enhanced = enhanceWithChirpIntelligence("get_streaming_recommendations", recommendations, chirpOptions);

        return {
          content: [{ type: "text", text: JSON.stringify(enhanced, null, 2) }],
        };
      }

      case "get_games_in_hand": {
        const chirpOptions: ChirpParameters = {
          chirp_intensity: args?.chirp_intensity as any,
          personality_mode: args?.personality_mode as any,
          enable_chirp: args?.enable_chirp as boolean
        };

        const gamesInHand = await getGamesInHand();
        const enhanced = enhanceWithChirpIntelligence("get_games_in_hand", gamesInHand, chirpOptions);

        return {
          content: [{ type: "text", text: JSON.stringify(enhanced, null, 2) }],
        };
      }

      case "get_roster_transaction_recommendations": {
        const lookAheadDays = (args?.look_ahead_days as number) || 7;
        const targetPositions = args?.target_positions as string[] | undefined;

        // Extract chirp options
        const chirpOptions: ChirpParameters = {
          chirp_intensity: args?.chirp_intensity as any,
          personality_mode: args?.personality_mode as any,
          enable_chirp: args?.enable_chirp as boolean
        };

        const recommendations = await getRosterTransactionRecommendations(lookAheadDays, targetPositions);

        // Enhance with chirp intelligence
        const enhancedRecommendations = enhanceWithChirpIntelligence(
          "get_roster_transaction_recommendations",
          recommendations,
          chirpOptions
        );

        return {
          content: [{ type: "text", text: JSON.stringify(enhancedRecommendations, null, 2) }],
        };
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
  console.error("🏒 Yahoo Fantasy Hockey MCP Server v2.0 running (Official API)");
}

main().catch(console.error);
