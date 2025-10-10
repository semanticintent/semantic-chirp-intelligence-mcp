# Template Pattern Usage Guide

## Creating a New Analysis Tool

This guide shows you how to create a new fantasy hockey analysis tool using the Template Method Pattern.

### Step 1: Define Your Analysis Type

First, add your analysis type to the `AnalysisType` union in `src/domain/types.ts`:

```typescript
export type AnalysisType =
  | "ice_roster"
  | "streaming_strategy"
  | "schedule_advantage"
  | "lineup_optimization"
  | "your_new_analysis_type"; // Add here
```

### Step 2: Create Tool Metadata

Add semantic metadata to `src/config/tool-metadata.ts`:

```typescript
export const TOOL_METADATA: Record<string, any> = {
  your_new_tool_name: {
    // Semantic properties
    chirp_style: "your_style",
    discovery_tags: ["tag1", "tag2", "tag3"],
    intent_category: "your_category",
    hockey_context: "your_context",
    chirp_potential: "your_potential",

    // Template Pattern metadata
    uses_template_pattern: true,
    analysis_class: "YourAnalysisClassName",
    template_version: "1.0.0",
    analysis_type: "your_new_analysis_type",

    // Optional: Mark as ICE tool for ice_cold defaults
    is_ice_engine: false
  }
};
```

### Step 3: Create Concrete Analysis Class

Create a new file `src/analyses/YourAnalysis.ts`:

```typescript
/**
 * Your Analysis - Brief Description
 *
 * Detailed description of what this analysis does.
 *
 * Analysis Type: your_new_analysis_type
 * Semantic Identity: Your tool's semantic identity
 * Default Intensity: standard (or ice_cold for ICE tools)
 */

import { AnalysisTemplate } from '../template/AnalysisTemplate.js';
import type {
  AnalysisType,
  SemanticChirpContract,
  AnalysisResponse,
  FantasyData
} from '../domain/types.js';
import { YahooApiClient } from '../services/YahooApiClient.js';
import { ChirpIntelligence } from '../services/ChirpIntelligence.js';

interface YourAnalysisArgs {
  // Define your tool's arguments
  arg1?: string;
  arg2?: number;
}

/**
 * Your Analysis - Tool description
 */
export class YourAnalysis extends AnalysisTemplate {
  private apiClient: YahooApiClient;
  private leagueId: string;
  private teamId: string;

  constructor(
    apiClient: YahooApiClient,
    leagueId: string,
    teamId: string
  ) {
    super("your_new_tool_name", "your_new_analysis_type");
    this.apiClient = apiClient;
    this.leagueId = leagueId;
    this.teamId = teamId;
  }

  /**
   * Hook 1: Fetch raw data from data sources
   *
   * @param args - Tool-specific arguments
   * @returns Raw data from API/cache/database
   */
  protected async fetchData(args: YourAnalysisArgs): Promise<any> {
    // Example: Fetch data from Yahoo API
    const data = await this.apiClient.getTeamRoster(this.leagueId, this.teamId);

    // You can also fetch multiple sources in parallel
    const [roster, schedule, stats] = await Promise.all([
      this.apiClient.getTeamRoster(this.leagueId, this.teamId),
      this.apiClient.getTeamSchedule(this.leagueId, this.teamId),
      this.apiClient.getTeamStats(this.leagueId, this.teamId)
    ]);

    return { roster, schedule, stats };
  }

  /**
   * Hook 2: Prepare and transform data for analysis
   *
   * @param rawData - Raw data from fetchData()
   * @param args - Tool-specific arguments
   * @returns Structured FantasyData object
   */
  protected async prepareData(rawData: any, args: YourAnalysisArgs): Promise<FantasyData> {
    // Parse raw Yahoo API format into structured data
    // Example: Extract team info
    const teamArray = rawData.roster.fantasy_content.team[0];
    const teamKey = teamArray.find((item: any) => item.team_key)?.team_key;
    const teamName = teamArray.find((item: any) => item.name)?.name;

    // Parse players
    const players = this.parsePlayersFromRoster(rawData.roster);

    // Return FantasyData structure
    return {
      league_key: this.leagueId,
      team_key: teamKey,
      team_name: teamName,
      game_key: 'nhl.l.12345', // Extract from API
      matchup_week: 1,
      roster: players,
      // Add other required FantasyData fields
      // You can also extend with custom properties
      ...rawData // Include raw data for later use
    };
  }

  /**
   * Hook 3: Execute core analysis logic
   *
   * @param data - Prepared FantasyData
   * @param args - Tool-specific arguments
   * @returns Analysis results with insights and recommendations
   */
  protected async analyzeData(data: FantasyData, args: YourAnalysisArgs): Promise<any> {
    // Your business logic here
    // Example: Analyze roster strengths

    const insights = {
      key_insight_1: "...",
      key_insight_2: "...",
      metrics: {
        score: 100,
        rating: "A+"
      }
    };

    const recommendations = [
      {
        priority: "HIGH",
        action: "pickup",
        player: { name: "Connor McDavid", team: "EDM" },
        reasoning: "Top scorer available"
      }
    ];

    return {
      insights,
      recommendations
    };
  }

  /**
   * Hook 4: Generate chirp intelligence commentary
   *
   * @param analysisResults - Results from analyzeData()
   * @param semanticContract - Chirp parameters (intensity, personality, etc.)
   * @param data - Prepared FantasyData (for context)
   * @returns Chirp-enhanced results
   */
  protected async generateChirp(
    analysisResults: any,
    semanticContract: SemanticChirpContract,
    data: FantasyData
  ): Promise<any> {
    // Use ChirpIntelligence service to enhance with chirp commentary
    return ChirpIntelligence.enhance(
      this.toolName,
      analysisResults,
      semanticContract
    );
  }

  /**
   * Hook 5: Format final response structure
   *
   * @param chirpEnhanced - Chirp-enhanced results
   * @param data - Prepared FantasyData
   * @returns Standard AnalysisResponse format
   */
  protected async formatResponse(
    chirpEnhanced: any,
    data: FantasyData
  ): Promise<AnalysisResponse> {
    return {
      analysis_insights: chirpEnhanced.insights || {},
      recommendations: chirpEnhanced.recommendations || [],
      chirp_intelligence: chirpEnhanced.chirp_intelligence || {},
      metadata: {
        tool_name: this.toolName,
        analysis_type: this.analysisType,
        timestamp: new Date().toISOString(),
        team_name: data.team_name,
        league_key: data.league_key
      }
    };
  }

  // ==========================================
  // Private Helper Methods (Optional)
  // ==========================================

  private parsePlayersFromRoster(rawRoster: any): any[] {
    // Your parsing logic
    return [];
  }
}
```

### Step 4: Register Tool in MCP Server

Add your tool to `src/index.ts`:

#### 4a. Add Tool Definition

In the `ListToolsRequestSchema` handler:

```typescript
{
  name: "your_new_tool_name",
  description: "Brief description of what your tool does",
  inputSchema: {
    type: "object",
    properties: {
      arg1: {
        type: "string",
        description: "Description of arg1"
      },
      arg2: {
        type: "number",
        description: "Description of arg2",
        default: 7
      }
    },
    required: [] // Optional: Mark required args
  }
}
```

#### 4b. Add Tool Handler

In the `CallToolRequestSchema` handler:

```typescript
case "your_new_tool_name": {
  // Extract arguments
  const arg1 = args?.arg1 as string || "default";
  const arg2 = args?.arg2 as number || 7;

  // Extract semantic chirp contract
  const chirpContract: SemanticChirpContract = {
    enable_chirp: args?.enable_chirp !== false,
    chirp_intensity: (args?.chirp_intensity as any) || "standard",
    personality_mode: (args?.personality_mode as any) || "analytical",
    semantic_intent: "user_requested",
    tool_context: "your_new_tool_name"
  };

  // Instantiate your analysis class
  const analysis = new YourAnalysis(
    apiClient,
    leagueId,
    teamId
  );

  // Execute analysis via template method
  const result = await analysis.executeAnalysis(
    { arg1, arg2 },
    chirpContract
  );

  // Return result
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
  };
}
```

### Step 5: Write Unit Tests

Create `tests/analyses/YourAnalysis.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { YourAnalysis } from '../../src/analyses/YourAnalysis.js';
import type { SemanticChirpContract } from '../../src/domain/types.js';

describe('YourAnalysis', () => {
  let analysis: YourAnalysis;
  let mockApiClient: any;

  beforeEach(() => {
    mockApiClient = {
      getTeamRoster: vi.fn(),
      // Mock other API methods
    };

    analysis = new YourAnalysis(mockApiClient, 'league123', 'team456');
  });

  describe('fetchData()', () => {
    it('should fetch data from API', async () => {
      mockApiClient.getTeamRoster.mockResolvedValue({ /* mock data */ });

      const fetchDataMethod = (analysis as any).fetchData.bind(analysis);
      const result = await fetchDataMethod({ arg1: 'test' });

      expect(mockApiClient.getTeamRoster).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('analyzeData()', () => {
    it('should generate recommendations', async () => {
      const mockData = { /* FantasyData */ };

      const analyzeDataMethod = (analysis as any).analyzeData.bind(analysis);
      const result = await analyzeDataMethod(mockData, {});

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Integration', () => {
    it('should execute full analysis workflow', async () => {
      mockApiClient.getTeamRoster.mockResolvedValue({ /* mock data */ });

      const contract: SemanticChirpContract = {
        enable_chirp: true,
        chirp_intensity: 'standard',
        personality_mode: 'analytical'
      };

      const result = await analysis.executeAnalysis({}, contract);

      expect(result).toHaveProperty('analysis_insights');
      expect(result).toHaveProperty('recommendations');
      expect(Object.isFrozen(result)).toBe(true);
    });
  });
});
```

### Step 6: Run Tests

```bash
# Run your specific test file
npm test -- YourAnalysis.test.ts

# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

### Best Practices

#### 1. Error Handling

```typescript
protected async fetchData(args: YourAnalysisArgs): Promise<any> {
  try {
    return await this.apiClient.getData();
  } catch (error) {
    // Template method will catch and track this error
    throw new Error(`Failed to fetch data: ${error.message}`);
  }
}
```

#### 2. Data Validation

```typescript
protected async analyzeData(data: FantasyData, args: YourAnalysisArgs): Promise<any> {
  // Guard: Validate required data
  if (!data.roster || !data.roster.players) {
    throw new Error("No roster data available for analysis");
  }

  // Proceed with analysis
  // ...
}
```

#### 3. Semantic Defaults

The template automatically applies semantic defaults based on tool metadata:

```typescript
// ICE tools get ice_cold defaults
if (metadata.is_ice_engine === true) {
  return {
    chirp_intensity: "ice_cold",
    personality_mode: "championship_coach",
    enable_chirp: true
  };
}

// Standard tools get standard defaults
return {
  chirp_intensity: "standard",
  personality_mode: "analytical",
  enable_chirp: true
};
```

#### 4. Recommendation Priorities

Use consistent priority levels:

```typescript
const recommendations: Recommendation[] = [
  {
    priority: "CRITICAL",  // Immediate action required
    action: "drop",
    player: injuredPlayer,
    reasoning: "Player is injured but in active lineup"
  },
  {
    priority: "HIGH",      // Should act soon
    action: "pickup",
    pickup: targetPlayer,
    reasoning: "Strengthen weak position"
  },
  {
    priority: "MEDIUM",    // Consider for strategy
    action: "volume_play",
    reasoning: "Schedule advantage opportunity"
  },
  {
    priority: "LOW",       // Nice to have
    action: "bench_upgrade",
    reasoning: "Minor roster improvement"
  }
];
```

#### 5. Governance Compliance

The template method automatically enforces:
- ✅ Semantic contract validation
- ✅ Immutability (deep freeze)
- ✅ Performance tracking
- ✅ Error handling
- ✅ Governance monitoring

You don't need to implement these yourself!

### Common Patterns

#### Pattern 1: Parallel Data Fetching

```typescript
protected async fetchData(args: YourAnalysisArgs): Promise<any> {
  const [roster, stats, schedule] = await Promise.all([
    this.apiClient.getTeamRoster(this.leagueId, this.teamId),
    this.apiClient.getTeamStats(this.leagueId, this.teamId),
    this.apiClient.getTeamSchedule(this.leagueId, this.teamId)
  ]);

  return { roster, stats, schedule };
}
```

#### Pattern 2: Sorting Recommendations

```typescript
// Sort by priority
recommendations.sort((a, b) => {
  const priorityOrder: Record<string, number> = {
    "CRITICAL": 0,
    "HIGH": 1,
    "MEDIUM": 2,
    "LOW": 3
  };
  return (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99);
});

// Take top N
return recommendations.slice(0, 8);
```

#### Pattern 3: Conditional Analysis

```typescript
protected async analyzeData(data: FantasyData, args: YourAnalysisArgs): Promise<any> {
  const recommendations: Recommendation[] = [];

  // Conditional analysis based on args
  if (args.include_injured_analysis) {
    recommendations.push(...this.analyzeInjuries(data));
  }

  if (args.include_schedule_analysis) {
    recommendations.push(...this.analyzeSchedule(data));
  }

  return { recommendations };
}
```

### Debugging

#### Enable Governance Logging

Set `NODE_ENV=development` to see governance audit logs:

```bash
NODE_ENV=development npm run dev
```

You'll see logs like:
```
🔍 Semantic Audit [validation]: {
  phase: "validation",
  tool_name: "your_new_tool_name",
  semantic_intent: "user_requested",
  enable_chirp: true,
  chirp_intensity: "standard",
  ...
}

[GOVERNANCE] Analysis started: your_new_analysis_type
[GOVERNANCE] Analysis completed: your_new_analysis_type (1234ms)
```

#### Check Governance Health

Use the governance dashboard tool:

```bash
# Via MCP
call_tool governance_dashboard --report_type=full

# Returns:
{
  "governance_health": {
    "status": "healthy",
    "recommendations": ["System is operating within governance parameters."]
  },
  "metrics": {
    "violations": { "total": 0, "warnings": 0, "errors": 0 },
    "governance": {
      "contracts_validated": 42,
      "immutability_enforced": 42,
      "semantic_decisions": 156
    },
    "analyses": {
      "total_executed": 42,
      "by_type": {
        "your_new_analysis_type": 10,
        "ice_roster": 32
      },
      "avg_duration_ms": 234,
      "slowest": {
        "type": "ice_roster",
        "duration_ms": 456
      }
    }
  }
}
```

### Example: Complete Minimal Analysis

Here's a minimal working example:

```typescript
import { AnalysisTemplate } from '../template/AnalysisTemplate.js';
import type { AnalysisType, SemanticChirpContract, AnalysisResponse, FantasyData } from '../domain/types.js';
import { ChirpIntelligence } from '../services/ChirpIntelligence.js';

export class MinimalAnalysis extends AnalysisTemplate {
  constructor() {
    super("minimal_tool", "minimal_type" as AnalysisType);
  }

  protected async fetchData(args: any): Promise<any> {
    return { data: "raw data from API" };
  }

  protected async prepareData(rawData: any, args: any): Promise<FantasyData> {
    return {
      league_key: "test",
      team_key: "test",
      team_name: "Test Team",
      game_key: "nhl",
      matchup_week: 1,
      roster: []
    } as FantasyData;
  }

  protected async analyzeData(data: FantasyData, args: any): Promise<any> {
    return {
      insights: { message: "Analysis complete" },
      recommendations: []
    };
  }

  protected async generateChirp(results: any, contract: SemanticChirpContract, data: FantasyData): Promise<any> {
    return ChirpIntelligence.enhance(this.toolName, results, contract);
  }

  protected async formatResponse(chirpEnhanced: any, data: FantasyData): Promise<AnalysisResponse> {
    return {
      analysis_insights: chirpEnhanced.insights,
      recommendations: chirpEnhanced.recommendations,
      chirp_intelligence: chirpEnhanced.chirp_intelligence,
      metadata: { tool_name: this.toolName, analysis_type: this.analysisType, timestamp: new Date().toISOString() }
    };
  }
}
```

### Migration Checklist

When migrating an existing tool to the template pattern:

- [ ] Create analysis type in `types.ts`
- [ ] Add tool metadata in `tool-metadata.ts`
- [ ] Create concrete analysis class extending `AnalysisTemplate`
- [ ] Implement 5 hook methods
- [ ] Register tool in MCP server (`index.ts`)
- [ ] Write unit tests
- [ ] Run test suite (`npm test`)
- [ ] Check coverage (`npm run test:coverage`)
- [ ] Update documentation
- [ ] Test end-to-end with MCP client
- [ ] Monitor governance dashboard
- [ ] Deploy and monitor

---

**Last Updated**: Phase 6 - Template Pattern Testing & Documentation
**Version**: 3.0.0
**Need Help?**: Check `docs/ARCHITECTURE.md` for design details
