# Architecture Documentation

## Template Method Pattern Implementation

### Overview

The Yahoo Fantasy MCP server has been refactored to use the **Template Method Pattern** (Gang of Four) to provide a consistent, maintainable architecture for fantasy hockey intelligence analysis tools. This pattern integrates seamlessly with the **Semantic Anchoring Governance** framework to ensure all analyses maintain semantic intent preservation and immutability guarantees.

### Design Pattern: Template Method

**Intent**: Define the skeleton of an algorithm in an operation, deferring some steps to subclasses. Template Method lets subclasses redefine certain steps of an algorithm without changing the algorithm's structure.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    AnalysisTemplate (Abstract)                   │
├─────────────────────────────────────────────────────────────────┤
│ # executeAnalysis() [TEMPLATE METHOD - Final]                   │
│   1. validateContract()        [Governance]                      │
│   2. fetchData()               [Hook - Abstract]                 │
│   3. prepareData()             [Hook - Abstract]                 │
│   4. analyzeData()             [Hook - Abstract]                 │
│   5. generateChirp()           [Hook - Abstract]                 │
│   6. formatResponse()          [Hook - Abstract]                 │
│   7. freezeResponse()          [Governance]                      │
│                                                                   │
│ + getToolMetadata()            [Semantic - Concrete]             │
│ + isIceTool()                  [Semantic - Concrete]             │
│ + getSemanticDefaults()        [Semantic - Concrete]             │
│ + mergeContractWithDefaults()  [Semantic - Concrete]             │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ extends
          ┌───────────────────┴───────────────────┐
          │                                       │
┌─────────┴──────────┐                 ┌─────────┴──────────┐
│   IceAnalysis      │                 │ StreamingAnalysis  │
├────────────────────┤                 ├────────────────────┤
│ Implements:        │                 │ Implements:        │
│ • fetchData()      │                 │ • fetchData()      │
│ • prepareData()    │                 │ • prepareData()    │
│ • analyzeData()    │                 │ • analyzeData()    │
│ • generateChirp()  │                 │ • generateChirp()  │
│ • formatResponse() │                 │ • formatResponse() │
└────────────────────┘                 └────────────────────┘

┌─────────────────────┐                 ┌────────────────────┐
│ GamesInHandAnalysis │                 │  LineupAnalysis    │
├─────────────────────┤                 ├────────────────────┤
│ Implements:         │                 │ Implements:        │
│ • fetchData()       │                 │ • fetchData()      │
│ • prepareData()     │                 │ • prepareData()    │
│ • analyzeData()     │                 │ • analyzeData()    │
│ • generateChirp()   │                 │ • generateChirp()  │
│ • formatResponse()  │                 │ • formatResponse() │
└─────────────────────┘                 └────────────────────┘
```

### Key Components

#### 1. AnalysisTemplate (Abstract Base Class)

**Location**: `src/template/AnalysisTemplate.ts`

**Responsibilities**:
- Defines the invariant template method (`executeAnalysis`)
- Enforces Semantic Anchoring Governance rules
- Provides semantic decision methods
- Ensures immutability and contract validation

**Template Method Flow**:
```typescript
public async executeAnalysis(
  args: any,
  semanticContract: SemanticChirpContract
): Promise<AnalysisResponse> {
  // 1. Validate semantic contract (Governance Rule 2)
  this.validateContract(semanticContract);

  // 2. Track analysis start (Governance Monitoring)
  GOVERNANCE_MONITOR.trackAnalysisStart(this.analysisType);

  try {
    // 3-7. Execute hook methods in fixed order
    const rawData = await this.fetchData(args);
    const preparedData = await this.prepareData(rawData, args);
    const analysisResults = await this.analyzeData(preparedData, args);
    const chirpEnhanced = await this.generateChirp(analysisResults, semanticContract, preparedData);
    const response = await this.formatResponse(chirpEnhanced, preparedData);

    // 8. Freeze response (Governance Rule 4: Immutability)
    const frozenResponse = this.freezeResponse(response);

    // 9. Track completion
    GOVERNANCE_MONITOR.trackAnalysisComplete(this.analysisType, duration);

    return frozenResponse;
  } catch (error) {
    // Track failed analysis
    GOVERNANCE_MONITOR.trackAnalysisComplete(this.analysisType, duration);
    throw error;
  }
}
```

**Hook Methods** (Abstract - Must Implement):

| Method | Purpose | Input | Output |
|--------|---------|-------|--------|
| `fetchData()` | Retrieve raw data from APIs/sources | `args` | Raw API response data |
| `prepareData()` | Transform raw data into `FantasyData` | `rawData`, `args` | `FantasyData` |
| `analyzeData()` | Execute domain-specific analysis logic | `FantasyData`, `args` | Analysis results |
| `generateChirp()` | Add chirp intelligence commentary | Results, contract, data | Chirp-enhanced results |
| `formatResponse()` | Package into `AnalysisResponse` | Chirped results, data | `AnalysisResponse` |

**Governance Methods** (Concrete - Shared):

| Method | Purpose | Governance Rule |
|--------|---------|-----------------|
| `validateContract()` | Validate semantic chirp contract | Rule 2: Intent Preservation |
| `freezeResponse()` | Deep-freeze response object | Rule 4: Immutability Protection |
| `getToolMetadata()` | Get semantic tool properties | Rule 3: Observable Anchoring |
| `isIceTool()` | Check if ICE engine | Rule 1: Semantic Over Structural |
| `getSemanticDefaults()` | Get default chirp params | Rule 2: Intent Preservation |
| `mergeContractWithDefaults()` | Merge user + system defaults | Rule 2: Intent Preservation |

#### 2. Concrete Analysis Implementations

##### IceAnalysis - Intent Chirp Engine

**Location**: `src/analyses/IceAnalysis.ts`

**Purpose**: Championship-level roster transaction recommendations with savage analysis.

**Characteristics**:
- **Analysis Type**: `ice_roster`
- **Default Intensity**: `ice_cold`
- **Semantic Identity**: ICE - Intent Chirp Engine
- **Tool Name**: `get_roster_transaction_recommendations`

**Analysis Logic**:
1. **CRITICAL**: Identify injured players in active lineup
2. **HIGH**: Fix position weaknesses with waiver targets
3. **MEDIUM**: Schedule optimization (games in hand disadvantage)
4. **LOW**: Bench upgrades

**Priority Sorting**: CRITICAL → HIGH → MEDIUM → LOW → Top 8 recommendations

##### StreamingAnalysis

**Location**: `src/analyses/StreamingAnalysis.ts`

**Purpose**: Strategic waiver wire recommendations based on upcoming schedules.

**Characteristics**:
- **Analysis Type**: `streaming_strategy`
- **Default Intensity**: `standard`
- **Tool Name**: `get_streaming_recommendations`

**Analysis Logic**:
- Analyze team schedules for next N days
- Identify high-volume playing teams
- Match available players to schedule opportunities
- Provide optimal timing for pickups

##### GamesInHandAnalysis

**Location**: `src/analyses/GamesInHandAnalysis.ts`

**Purpose**: Competitive advantage analysis based on remaining game differential.

**Characteristics**:
- **Analysis Type**: `schedule_advantage`
- **Default Intensity**: `standard`
- **Tool Name**: `get_games_in_hand`

**Analysis Logic**:
- Calculate remaining games for user team
- Calculate remaining games for opponent
- Identify schedule advantage/disadvantage
- Recommend volume play strategies

##### LineupAnalysis

**Location**: `src/analyses/LineupAnalysis.ts`

**Purpose**: Daily lineup optimization ensuring maximum player utilization.

**Characteristics**:
- **Analysis Type**: `lineup_optimization`
- **Default Intensity**: `standard`
- **Tool Name**: `optimize_lineup`

**Analysis Logic**:
- Identify inactive players with games
- Identify bench players that should start
- Check for lineup rule violations
- Maximize active roster efficiency

### Integration with Semantic Anchoring Governance

#### Governance Rules Enforcement

##### Rule 1: Semantic Over Structural
**Implementation**: `isIceTool()` method checks observable `is_ice_engine` property from metadata, not string comparison.

```typescript
protected isIceTool(): boolean {
  const metadata = this.getToolMetadata();
  return metadata.is_ice_engine === true; // Observable property
}
```

##### Rule 2: Intent Preservation
**Implementation**: Contract validation in `validateContract()`, semantic defaults merge preserves user intent.

```typescript
protected mergeContractWithDefaults(
  userContract: SemanticChirpContract
): SemanticChirpContract {
  const defaults = this.getSemanticDefaults();

  return {
    ...defaults,
    ...userContract, // User values override defaults
    semantic_intent: userContract.semantic_intent ||
      (Object.keys(userContract).length > 0 ? "user_requested" : "system_default")
  };
}
```

##### Rule 3: Observable Anchoring
**Implementation**: `TOOL_METADATA` provides semantic properties for each tool.

```typescript
export const TOOL_METADATA: Record<string, any> = {
  get_roster_transaction_recommendations: {
    chirp_style: "ice_cold_truth",
    is_ice_engine: true,
    uses_template_pattern: true,
    analysis_class: "IceAnalysis",
    template_version: "1.0.0"
  }
};
```

##### Rule 4: Immutability Protection
**Implementation**: `freezeResponse()` deep-freezes all response properties.

```typescript
protected freezeResponse(response: AnalysisResponse): AnalysisResponse {
  Object.freeze(response);
  if (response.analysis_insights) Object.freeze(response.analysis_insights);
  if (response.recommendations) {
    response.recommendations.forEach(rec => Object.freeze(rec));
    Object.freeze(response.recommendations);
  }
  if (response.chirp_intelligence) Object.freeze(response.chirp_intelligence);
  if (response.metadata) Object.freeze(response.metadata);

  GOVERNANCE_MONITOR.immutability_enforced++;
  return response;
}
```

#### Governance Monitoring

The `GOVERNANCE_MONITOR` tracks all analysis executions:

```typescript
export const GOVERNANCE_MONITOR = {
  // Existing governance metrics
  violations: [] as GovernanceViolation[],
  contracts_validated: 0,
  immutability_enforced: 0,
  semantic_decisions: 0,

  // Template Pattern metrics
  analyses_executed: 0,
  analysis_by_type: new Map<AnalysisType, number>(),
  analysis_durations: [] as Array<{
    type: AnalysisType;
    duration_ms: number;
    timestamp: Date;
  }>,

  // Methods
  trackAnalysisStart(type: AnalysisType): void
  trackAnalysisComplete(type: AnalysisType, duration_ms: number): void
  getHealthReport(): GovernanceHealthReport
  calculateAverageDuration(): number
  getSlowestAnalysis(): { type: AnalysisType; duration_ms: number } | null
};
```

### Data Flow

```
User Request
    │
    ├─> MCP Server (index.ts)
    │       │
    │       ├─> Parse tool call
    │       ├─> Extract semantic contract
    │       │
    │       └─> Instantiate concrete analysis class
    │               │
    │               └─> AnalysisTemplate.executeAnalysis()
    │                       │
    │                       ├─> 1. validateContract()
    │                       │      └─> GOVERNANCE_MONITOR.contracts_validated++
    │                       │
    │                       ├─> 2. trackAnalysisStart()
    │                       │
    │                       ├─> 3. fetchData() [Concrete Hook]
    │                       │      └─> Yahoo API / Cache
    │                       │
    │                       ├─> 4. prepareData() [Concrete Hook]
    │                       │      └─> Transform to FantasyData
    │                       │
    │                       ├─> 5. analyzeData() [Concrete Hook]
    │                       │      └─> Business logic + recommendations
    │                       │
    │                       ├─> 6. generateChirp() [Concrete Hook]
    │                       │      └─> ChirpIntelligence.enhance()
    │                       │
    │                       ├─> 7. formatResponse() [Concrete Hook]
    │                       │      └─> Package as AnalysisResponse
    │                       │
    │                       ├─> 8. freezeResponse()
    │                       │      └─> GOVERNANCE_MONITOR.immutability_enforced++
    │                       │
    │                       └─> 9. trackAnalysisComplete()
    │
    └─> Return frozen AnalysisResponse to user
```

### Benefits of Template Method Pattern

#### 1. Consistency
- All analyses follow the same execution flow
- Governance enforcement is automatic
- No forgotten validation or freezing steps

#### 2. Maintainability
- Changes to algorithm flow happen in one place
- Bug fixes in template benefit all analyses
- Governance updates apply uniformly

#### 3. Testability
- Template method tested once
- Concrete implementations test only their logic
- Mock-friendly hook method structure

#### 4. Extensibility
- New analyses: implement 5 hook methods
- No changes to governance or template code
- Semantic defaults automatically applied

#### 5. Governance Integration
- Rule enforcement built into template
- Monitoring automatic and consistent
- Contract validation cannot be skipped

### Testing Strategy

#### Unit Tests (45 tests - All Passing)

**AnalysisTemplate.test.ts** (31 tests):
- Template method execution order
- Hook method parameter passing
- Governance integration (validation, freezing)
- Semantic decision logic
- Error propagation
- Performance tracking

**IceAnalysis.test.ts** (14 tests):
- Constructor initialization
- Data fetching (parallel API calls)
- Roster strength analysis
- Recommendation generation
- Priority sorting
- Chirp intelligence integration
- Helper method logic

#### Coverage Results

| Component | Coverage | Status |
|-----------|----------|--------|
| AnalysisTemplate.ts | 100% | ✅ Complete |
| IceAnalysis.ts | 83.2% | ✅ Excellent |
| governance.ts | 53.93% | ⚠️ Template-specific paths covered |
| tool-metadata.ts | 100% | ✅ Complete |
| chirp-styles.ts | 100% | ✅ Complete |
| personality-modes.ts | 100% | ✅ Complete |

### Migration Status

| Analysis Tool | Status | Location | Tests |
|---------------|--------|----------|-------|
| ICE (Roster Transactions) | ✅ Migrated | `src/analyses/IceAnalysis.ts` | 14 passing |
| Streaming Recommendations | ✅ Migrated | `src/analyses/StreamingAnalysis.ts` | Pending |
| Games In Hand | ✅ Migrated | `src/analyses/GamesInHandAnalysis.ts` | Pending |
| Lineup Optimization | ✅ Migrated | `src/analyses/LineupAnalysis.ts` | Pending |

### Performance Characteristics

**Monitoring Metrics**:
- Average analysis duration: Tracked per analysis type
- Slowest analysis identification: Alerts to performance issues
- Execution count by type: Usage patterns
- Error rate tracking: Reliability monitoring

**Governance Dashboard**:
```bash
# View governance health via MCP tool
call_tool governance_dashboard --report_type=full
```

Returns:
- Total analyses executed
- Average duration by type
- Slowest analysis details
- Governance violations (if any)
- Contract validation counts
- Immutability enforcement counts

### Future Enhancements

1. **Analysis Composition**: Combine multiple analyses (e.g., ICE uses Streaming + GamesInHand internally)
2. **Caching Layer**: Template method can add caching between hooks
3. **A/B Testing**: Compare old vs new implementation performance
4. **Streaming Responses**: Add progressive result streaming
5. **Parallel Analysis**: Execute multiple analyses concurrently

### References

- **Gang of Four Design Patterns**: Template Method (Behavioral Pattern)
- **Semantic Anchoring Governance**: Custom framework for semantic intent preservation
- **TypeScript ESM Modules**: Modern module system with `.js` extensions in imports
- **Vitest Testing Framework**: Fast, modern unit testing
- **Model Context Protocol (MCP)**: Anthropic's AI tool integration protocol

---

**Last Updated**: Phase 6 - Template Pattern Testing & Documentation
**Version**: 3.0.0
**Author**: Template Pattern Migration Team
