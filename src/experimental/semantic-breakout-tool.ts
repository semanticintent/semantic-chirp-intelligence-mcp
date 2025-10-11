/**
 * Semantic Breakout Tool Integration
 *
 * Implements breakout player analysis using semantic intent pattern.
 * This tool uses natural language intent to auto-configure the MCP tool.
 */

import { SemanticIntentParser } from './semantic-intent-parser.js';
import { BreakoutAnalysis } from '../analyses/BreakoutAnalysis.js';
import type { SemanticChirpContract } from '../domain/types.js';

/**
 * Semantic tool definition for breakout player analysis
 *
 * This comprehensive prompt integrates:
 * - Data-driven predictability (40% recent, 30% projections, 20% opportunity, 10% risk)
 * - External source references (Rotowire, NHL EDGE, DobberHockey)
 * - Position-specific filtering
 * - League context awareness
 */
export const SEMANTIC_BREAKOUT_ANALYSIS = {
  name: "analyze_breakout_players",
  description: "Analyze free agents to identify top pickups and breakout candidates using comprehensive data-driven scoring",
  semanticIntent: `
    I analyze free agents in Yahoo Fantasy Hockey to recommend top 5-10 pickups and 3-5 breakout candidates.
    I use a predictable scoring formula: 40% recent performance + 30% projections + 20% opportunity - 10% risk.
    I focus on players under 50% owned and provide position-specific analysis.

    I need: position filter (optional array of strings like ["C", "RW"]),
            ownership threshold (optional number, default 50),
            breakout age max (optional number, default 26),
            minimum score (optional number, default 0),
            max results (optional number, default 10),
            chirp intensity (optional string),
            personality mode (optional string),
            enable chirp (optional boolean)

    I will: Yahoo API calls, statistical analysis, trend detection, opportunity scoring, risk assessment

    I return: Top pickups with scores, breakout candidates, position breakdown, market intelligence

    I estimate: moderate complexity, 3000 tokens
  `
};

/**
 * Parse semantic intent for breakout analysis
 */
export function parseBreakoutAnalysisIntent() {
  const parser = new SemanticIntentParser();
  return parser.parseIntent(SEMANTIC_BREAKOUT_ANALYSIS.semanticIntent);
}

/**
 * Get MCP input schema from semantic intent
 */
export function getBreakoutAnalysisInputSchema() {
  const parsed = parseBreakoutAnalysisIntent();

  // Build schema from parsed parameters
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

  // Add enum constraints for specific parameters
  if (properties.chirp_intensity) {
    properties.chirp_intensity.enum = ['gentle', 'standard', 'savage', 'ice_cold'];
  }
  if (properties.personality_mode) {
    properties.personality_mode.enum = ['analytical', 'motivational', 'roast_master', 'championship_coach'];
  }
  if (properties.position_filter) {
    properties.position_filter.items = { type: 'string' };
  }

  return {
    type: "object" as const,
    properties,
    required: required.length > 0 ? required : undefined
  };
}

/**
 * Execute breakout analysis with semantic configuration
 */
export async function executeBreakoutAnalysis(
  args: {
    position_filter?: string[];
    ownership_threshold?: number;
    breakout_age_max?: number;
    min_score?: number;
    max_results?: number;
    chirp_intensity?: string;
    personality_mode?: string;
    enable_chirp?: boolean;
  },
  breakoutAnalysis: BreakoutAnalysis
): Promise<any> {
  const parsed = parseBreakoutAnalysisIntent();

  // Build semantic contract
  const semanticContract: SemanticChirpContract = {
    chirp_intensity: args.chirp_intensity as any || 'standard',
    personality_mode: args.personality_mode as any || 'analytical',
    enable_chirp: args.enable_chirp !== false,
    semantic_intent: 'user_requested',
    tool_context: 'analyze_breakout_players'
  };

  // Build analysis args
  const analysisArgs = {
    position_filter: args.position_filter,
    ownership_threshold: args.ownership_threshold,
    breakout_age_max: args.breakout_age_max,
    min_score: args.min_score,
    max_results: args.max_results
  };

  try {
    // Execute analysis using template pattern
    const result = await breakoutAnalysis.executeAnalysis(
      analysisArgs,
      semanticContract
    );

    // Enhance with semantic metadata
    return {
      ...result,
      _semantic_metadata: {
        tool_name: SEMANTIC_BREAKOUT_ANALYSIS.name,
        parsed_capabilities: parsed.capabilities,
        parse_confidence: `${(parsed.confidence * 100).toFixed(0)}%`,
        message: '✅ Tool auto-configured from semantic intent!',
        prompt_integration: {
          scoring_formula: '40% recent + 30% projections + 20% opportunity - 10% risk',
          external_sources: 'Ready for: Rotowire, NHL EDGE, DobberHockey integration',
          data_driven: 'Predictable rankings with confidence scores'
        }
      }
    };
  } catch (error) {
    throw new Error(
      `Breakout analysis failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Improved prompt recommendations for Claude Desktop integration
 */
export const BREAKOUT_PROMPT_IMPROVEMENTS = {
  semantic_clarity: {
    original: "Complex multi-paragraph template with embedded formulas",
    improved: "Structured semantic intent with clear I need/I will/I return sections",
    benefit: "Claude Desktop can better understand tool purpose and auto-suggest when user asks about breakouts"
  },

  parameter_discovery: {
    original: "Parameters embedded in prose",
    improved: "Explicit parameter definitions with types and optionality",
    benefit: "MCP can auto-generate input schema, reducing manual configuration"
  },

  capability_mapping: {
    original: "References to external sources without integration plan",
    improved: "Capability tags (yahoo_api, data_analysis) that map to available functions",
    benefit: "Tool knows what it can and cannot do, preventing hallucination"
  },

  predictability_enhancement: {
    original: "Scoring formula mentioned in prose",
    improved: "Formula implemented in code with observable weights",
    benefit: "Consistent, repeatable results that users can trust"
  },

  integration_points: {
    yahoo_api: "Direct integration via YahooApiClient",
    rotowire: "Placeholder for future web scraping capability",
    nhl_edge: "Placeholder for NHL API integration",
    dobber_hockey: "Placeholder for prospect data integration"
  },

  usage_with_claude_desktop: `
When user asks: "tell me about breakout players" or "who should I pick up?"

Claude Desktop will:
1. Recognize semantic intent matches analyze_breakout_players tool
2. Auto-extract parameters from conversation context (league format, roster needs)
3. Call tool with appropriate chirp settings (analytical by default)
4. Present results in conversational format with player tables and reasoning

Example interaction:
User: "I need a right wing, who are the best breakout candidates?"

Claude: *uses analyze_breakout_players with position_filter=["RW"]*

        "Based on data-driven analysis, here are the top RW breakout candidates:

        🏒 Must-Adds (Score 80+):
        1. [Player Name] (Team) - 85 score
           - Catalyst: Top-6 center opportunity
           - Recent: 0.9 PPG | Projected: 0.7 FPG
           - Risk: Low (15%)
           - Confidence: High

        2. [Player Name] (Team) - 82 score
           ...

        📊 Position Analysis:
        - RW pool strength: 15 candidates with 65+ scores
        - Market trend: RW pickups trending up 23%
        - Recommendation: Act fast on must-adds

        💡 Next steps: Should I analyze your roster to see who you could drop?"
  `
};
