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

// Configuration
const YAHOO_CLIENT_ID = process.env.YAHOO_CLIENT_ID!;
const YAHOO_CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET!;
const LEAGUE_ID = process.env.YAHOO_LEAGUE_ID!;
const TEAM_ID = process.env.YAHOO_TEAM_ID!;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_FILE = path.join(__dirname, "..", ".yahoo-oauth.json");

const YAHOO_API_BASE = "https://fantasysports.yahooapis.com/fantasy/v2";

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
      const player = playersData[key].player[0];
      return {
        player_id: player[0].player_id,
        name: player[1].name.full,
        position: player[2].display_position,
        team: player[3].editorial_team_abbr,
        percent_owned: player[5]?.percent_owned?.value || "0",
      };
    });

  return { players };
}

// Tool: Get Player Stats
async function getPlayerStats(playerId: string) {
  const data = await yahooApiRequest(`/player/nhl.p.${playerId}/stats`);
  
  const player = data.fantasy_content.player[0];
  const stats = data.fantasy_content.player[1]?.player_stats?.stats || [];
  
  return {
    player_id: player[0].player_id,
    name: player[1].name.full,
    position: player[2].display_position,
    team: player[3].editorial_team_abbr,
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
  
  return {
    week: currentMatchup[0].week,
    status: currentMatchup[0].status,
    your_team: {
      name: teams['0'].team[0][2].name,
      stats: teams['0'].team[1]?.team_stats?.stats || [],
    },
    opponent: {
      name: teams['1'].team[0][2].name,
      stats: teams['1'].team[1]?.team_stats?.stats || [],
    },
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

// Tool: Get Trending Players
async function getTrendingPlayers(trendType: string = "add", count: number = 25) {
  const sortParam = trendType === "add" ? "AR" : "OR";
  const endpoint = `/league/nhl.l.${LEAGUE_ID}/players;status=A;sort=${sortParam};count=${count}`;
  
  const data = await yahooApiRequest(endpoint);
  const playersData = data.fantasy_content.league[1].players;
  
  const players = Object.keys(playersData)
    .filter(key => key !== 'count')
    .map(key => {
      const player = playersData[key].player[0];
      return {
        player_id: player[0].player_id,
        name: player[1].name.full,
        position: player[2].display_position,
        team: player[3].editorial_team_abbr,
        percent_owned: player[5]?.percent_owned?.value || "0",
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

// Initialize MCP Server
const server = new Server(
  {
    name: "yahoo-fantasy-hockey",
    version: "2.0.0",
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
