/**
 * Semantic Tool Integration - Live Test
 *
 * Adds a semantic intent-driven tool to the existing MCP server
 * for end-to-end validation without disrupting working tools.
 */

import { SemanticIntentParser } from './semantic-intent-parser.js';

/**
 * Semantic test tool definition
 */
export const SEMANTIC_PLAYER_COMPARISON = {
  name: "semantic_player_comparison",
  description: "EXPERIMENTAL: Compare two players using semantic intent parsing",
  semanticIntent: `
    Given two player names, I will get their current season stats from Yahoo API
    and return a simple comparison of goals, assists, points, and plus/minus.

    I need: player1 (required string), player2 (required string)
    I will: API calls, data analysis
    I return: side-by-side player comparison
    I estimate: simple analysis, 1000 tokens
  `
};

/**
 * Parse semantic intent and return configuration
 */
export function parsePlayerComparisonIntent() {
  const parser = new SemanticIntentParser();
  return parser.parseIntent(SEMANTIC_PLAYER_COMPARISON.semanticIntent);
}

/**
 * Helper to get parsed input schema for MCP tool registration
 */
export function getPlayerComparisonInputSchema() {
  const parsed = parsePlayerComparisonIntent();

  // Convert parsed parameters to MCP input schema
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const param of parsed.parameters) {
    properties[param.name] = {
      type: param.type,
      description: param.description
    };

    if (param.required) {
      required.push(param.name);
    }
  }

  return {
    type: "object" as const,
    properties,
    required
  };
}

/**
 * Execute the semantic tool with player comparison logic
 */
export async function executePlayerComparison(
  args: { player1?: string; player2?: string },
  getPlayerStatsFunc: (playerId: string) => Promise<any>,
  searchPlayersFunc: (position?: string, count?: number) => Promise<any>
): Promise<any> {
  const parsed = parsePlayerComparisonIntent();

  // Validate required parameters based on parsed intent
  if (!args.player1 || !args.player2) {
    throw new Error(`Missing required parameters: ${parsed.parameters.filter(p => p.required).map(p => p.name).join(', ')}`);
  }

  try {
    // Step 1: Search for players to get their IDs
    const [player1Search, player2Search] = await Promise.all([
      searchPlayersFunc(undefined, 100),  // Search all positions
      searchPlayersFunc(undefined, 100)
    ]);

    // Find matching players by name
    const findPlayer = (searchResults: any, playerName: string) => {
      const players = searchResults.players || [];
      return players.find((p: any) =>
        p.name.toLowerCase().includes(playerName.toLowerCase()) ||
        playerName.toLowerCase().includes(p.name.toLowerCase())
      );
    };

    const player1Match = findPlayer(player1Search, args.player1);
    const player2Match = findPlayer(player2Search, args.player2);

    if (!player1Match) {
      throw new Error(`Could not find player: ${args.player1}`);
    }
    if (!player2Match) {
      throw new Error(`Could not find player: ${args.player2}`);
    }

    // Step 2: Get detailed stats for both players
    const [player1Stats, player2Stats] = await Promise.all([
      getPlayerStatsFunc(player1Match.player_id),
      getPlayerStatsFunc(player2Match.player_id)
    ]);

    // Step 3: Format comparison
    const comparison = {
      player1: {
        name: player1Stats.name,
        team: player1Stats.team,
        position: player1Stats.position,
        stats: {
          goals: player1Stats.stats.goals || 0,
          assists: player1Stats.stats.assists || 0,
          points: player1Stats.stats.points || 0,
          plus_minus: player1Stats.stats.plus_minus || 0
        }
      },
      player2: {
        name: player2Stats.name,
        team: player2Stats.team,
        position: player2Stats.position,
        stats: {
          goals: player2Stats.stats.goals || 0,
          assists: player2Stats.stats.assists || 0,
          points: player2Stats.stats.points || 0,
          plus_minus: player2Stats.stats.plus_minus || 0
        }
      },
      winner: {
        goals: player1Stats.stats.goals > player2Stats.stats.goals ? player1Stats.name : player2Stats.name,
        assists: player1Stats.stats.assists > player2Stats.stats.assists ? player1Stats.name : player2Stats.name,
        points: player1Stats.stats.points > player2Stats.stats.points ? player1Stats.name : player2Stats.name,
        plus_minus: player1Stats.stats.plus_minus > player2Stats.stats.plus_minus ? player1Stats.name : player2Stats.name
      },
      _debug: {
        semanticIntentParsing: {
          parsedParameters: parsed.parameters,
          parsedCapabilities: parsed.capabilities,
          parseConfidence: `${(parsed.confidence * 100).toFixed(0)}%`,
          message: "✅ Tool configuration auto-generated from semantic intent!"
        }
      }
    };

    return comparison;

  } catch (error) {
    throw new Error(`Player comparison failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
