/**
 * Semantic Intent Parser - Proof of Concept
 *
 * Tests the fundamental premise: Can we reliably extract tool configuration
 * from natural language semantic intent?
 *
 * This is a minimal viable test to validate the concept before building
 * the full universal MCP architecture.
 */

export interface ParsedIntent {
  parameters: ParameterDefinition[];
  capabilities: string[];
  confidence: number;
}

export interface ParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
}

/**
 * Basic semantic intent parser using regex patterns
 */
export class SemanticIntentParser {
  private static readonly CAPABILITY_MAPPINGS: Record<string, string> = {
    'web search': 'web_search',
    'search': 'web_search',
    'API calls': 'yahoo_api',
    'api': 'yahoo_api',
    'data analysis': 'data_analysis',
    'analyze': 'data_analysis',
    'statistical analysis': 'data_analysis',
    'advice': 'chirp_generation',
    'recommendations': 'chirp_generation',
  };

  /**
   * Parse semantic intent and extract configuration
   */
  parseIntent(intent: string): ParsedIntent {
    const needsMatch = intent.match(/I need:\s*([^]+?)(?=\nI\s+(?:will|return|estimate)|$)/i);
    const willMatch = intent.match(/I will:\s*([^]+?)(?=\nI\s+(?:need|return|estimate)|$)/i);

    const parameters = needsMatch ? this.extractParameters(needsMatch[1]) : [];
    const capabilities = willMatch ? this.mapCapabilities(willMatch[1]) : [];

    // Calculate confidence based on what we successfully parsed
    let confidence = 0.5;
    if (needsMatch) confidence += 0.25;
    if (willMatch) confidence += 0.25;

    return {
      parameters,
      capabilities,
      confidence
    };
  }

  /**
   * Extract parameter definitions from "I need:" section
   * Handles patterns like:
   * - "player name (required string)"
   * - "date range (optional)"
   * - "analysis depth (optional enum: basic|detailed)"
   */
  private extractParameters(needsSection: string): ParameterDefinition[] {
    const parameters: ParameterDefinition[] = [];
    const paramLines = needsSection.split(',').map(line => line.trim());

    for (const line of paramLines) {
      const param = this.parseParameterLine(line);
      if (param) {
        parameters.push(param);
      }
    }

    return parameters;
  }

  /**
   * Parse a single parameter line
   */
  private parseParameterLine(line: string): ParameterDefinition | null {
    // Match patterns like "player name (required string)" or "date (optional)"
    const match = line.match(/([^(]+)\s*\(([^)]+)\)/);
    if (!match) return null;

    const nameRaw = match[1].trim();
    const specification = match[2].trim().toLowerCase();

    // Convert "player name" to "player_name"
    const name = nameRaw.replace(/\s+/g, '_').toLowerCase();

    // Determine if required
    const required = specification.includes('required');

    // Infer type from specification
    const type = this.inferParameterType(specification);

    return {
      name,
      type,
      required,
      description: line.trim()
    };
  }

  /**
   * Infer parameter type from specification string
   */
  private inferParameterType(specification: string): ParameterDefinition['type'] {
    if (specification.includes('string')) return 'string';
    if (specification.includes('number')) return 'number';
    if (specification.includes('boolean')) return 'boolean';
    if (specification.includes('array')) return 'array';
    if (specification.includes('object')) return 'object';
    return 'string'; // Default to string
  }

  /**
   * Map capability descriptions to capability identifiers
   */
  private mapCapabilities(willSection: string): string[] {
    const capabilities = new Set<string>();
    const text = willSection.toLowerCase();

    for (const [phrase, capability] of Object.entries(SemanticIntentParser.CAPABILITY_MAPPINGS)) {
      if (text.includes(phrase.toLowerCase())) {
        capabilities.add(capability);
      }
    }

    return Array.from(capabilities);
  }
}

/**
 * Test tool definitions for validation
 */
export const TEST_SEMANTIC_TOOLS = {
  quickPlayerStats: {
    name: "test_quick_player_stats",
    semanticIntent: `
      Given a player name, I will get their basic stats from Yahoo API.

      I need: player name (required string)
      I will: API calls
      I return: goals, assists, points
      I estimate: simple, 500 tokens
    `
  },

  injuryCheck: {
    name: "test_injury_check",
    semanticIntent: `
      Given a player name, I will search for injury news and check Yahoo status.

      I need: player name (required string), include historical (optional boolean)
      I will: web search, API calls
      I return: injury status and timeline
      I estimate: moderate, 2000 tokens
    `
  },

  tradeAnalysis: {
    name: "test_trade_analysis",
    semanticIntent: `
      Given player names, I will analyze stats and provide trade recommendation.

      I need: your players (required array), their players (required array)
      I will: API calls, data analysis, recommendations
      I return: trade verdict with confidence score
      I estimate: complex, 5000 tokens
    `
  }
};

/**
 * Validation function to test parser accuracy
 */
export function validateParser(): {
  success: boolean;
  results: Array<{ tool: string; parsed: ParsedIntent; expected: any; match: boolean }>;
} {
  const parser = new SemanticIntentParser();
  const results = [];

  // Test 1: Quick Player Stats
  const test1 = parser.parseIntent(TEST_SEMANTIC_TOOLS.quickPlayerStats.semanticIntent);
  const expected1 = {
    parameters: [{ name: 'player_name', type: 'string', required: true }],
    capabilities: ['yahoo_api']
  };
  const match1 =
    test1.parameters.length === 1 &&
    test1.parameters[0].name === 'player_name' &&
    test1.parameters[0].required === true &&
    test1.capabilities.includes('yahoo_api');

  results.push({
    tool: 'quickPlayerStats',
    parsed: test1,
    expected: expected1,
    match: match1
  });

  // Test 2: Injury Check
  const test2 = parser.parseIntent(TEST_SEMANTIC_TOOLS.injuryCheck.semanticIntent);
  const expected2 = {
    parameters: [
      { name: 'player_name', type: 'string', required: true },
      { name: 'include_historical', type: 'boolean', required: false }
    ],
    capabilities: ['web_search', 'yahoo_api']
  };
  const match2 =
    test2.parameters.length === 2 &&
    test2.parameters[0].name === 'player_name' &&
    test2.parameters[1].name === 'include_historical' &&
    test2.parameters[1].type === 'boolean' &&
    test2.capabilities.includes('web_search') &&
    test2.capabilities.includes('yahoo_api');

  results.push({
    tool: 'injuryCheck',
    parsed: test2,
    expected: expected2,
    match: match2
  });

  // Test 3: Trade Analysis
  const test3 = parser.parseIntent(TEST_SEMANTIC_TOOLS.tradeAnalysis.semanticIntent);
  const expected3 = {
    parameters: [
      { name: 'your_players', type: 'array', required: true },
      { name: 'their_players', type: 'array', required: true }
    ],
    capabilities: ['yahoo_api', 'data_analysis', 'chirp_generation']
  };
  const match3 =
    test3.parameters.length === 2 &&
    test3.parameters[0].name === 'your_players' &&
    test3.parameters[0].type === 'array' &&
    test3.capabilities.includes('yahoo_api') &&
    test3.capabilities.includes('data_analysis');

  results.push({
    tool: 'tradeAnalysis',
    parsed: test3,
    expected: expected3,
    match: match3
  });

  const allMatch = results.every(r => r.match);

  return {
    success: allMatch,
    results
  };
}
