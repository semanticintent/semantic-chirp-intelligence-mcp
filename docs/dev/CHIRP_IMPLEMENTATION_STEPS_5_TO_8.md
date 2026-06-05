# 🏒 ICE Implementation - Steps 5-8
## Manual Implementation Guide

**Status**: Steps 1-4 completed! Foundation is SOLID!
**Next**: Add chirp parameters to schemas, update handlers, add ICE tool, bump version

---

## STEP 5: Update Tool Schemas (Add Chirp Parameters)

### 5.1 Update `get_roster_transaction_recommendations` schema (around line 817-834)

**FIND THIS:**
```typescript
      {
        name: "get_roster_transaction_recommendations",
        description: "Get comprehensive roster optimization recommendations including pickup/drop suggestions, IR management, and position analysis for end-of-week roster decisions",
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
          },
        },
      },
```

**REPLACE WITH:**
```typescript
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
```

### 5.2 Update `get_games_in_hand` schema (around line 809-815)

**FIND THIS:**
```typescript
      {
        name: "get_games_in_hand",
        description: "Get games in hand analysis - shows remaining games for you vs opponent to identify schedule advantages",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
```

**REPLACE WITH:**
```typescript
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
```

### 5.3 Update `get_weekly_stats` schema (find it in the tools list, around line 774-791)

**FIND the get_weekly_stats tool definition**
**ADD** `...baseChirpSchema` to its properties object

### 5.4 Update `get_streaming_recommendations` schema (around line 787-807)

**FIND the properties object inside get_streaming_recommendations**
**ADD at the END of properties** (after strategy_type):
```typescript
            ...baseChirpSchema
```

---

## STEP 6: Update Tool Handlers (Extract Chirp Options & Enhance)

### 6.1 Update `get_roster_transaction_recommendations` handler (around line 917-924)

**FIND THIS:**
```typescript
      case "get_roster_transaction_recommendations": {
        const lookAheadDays = (args?.look_ahead_days as number) || 7;
        const targetPositions = args?.target_positions as string[] | undefined;
        const recommendations = await getRosterTransactionRecommendations(lookAheadDays, targetPositions);
        return {
          content: [{ type: "text", text: JSON.stringify(recommendations, null, 2) }],
        };
      }
```

**REPLACE WITH:**
```typescript
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
```

### 6.2 Update `get_games_in_hand` handler (around line 910-915)

**FIND THIS:**
```typescript
      case "get_games_in_hand": {
        const gamesInHand = await getGamesInHand();
        return {
          content: [{ type: "text", text: JSON.stringify(gamesInHand, null, 2) }],
        };
      }
```

**REPLACE WITH:**
```typescript
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
```

### 6.3 Update `get_weekly_stats` handler (find it in the switch statement)

**ADD chirp enhancement** similar to above pattern

### 6.4 Update `get_streaming_recommendations` handler (around line 901-908)

**FIND THIS:**
```typescript
      case "get_streaming_recommendations": {
        const daysAhead = (args?.days_ahead as number) || 7;
        const positionFilter = args?.position_filter as string | undefined;
        const strategyType = (args?.strategy_type as string) || "weekly";
        const recommendations = await getStreamingRecommendations(daysAhead, positionFilter, strategyType);
        return {
          content: [{ type: "text", text: JSON.stringify(recommendations, null, 2) }],
        };
      }
```

**REPLACE WITH:**
```typescript
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
```

---

## STEP 7: Create ICE Tool

### 7.1 Add ICE tool to the tools array (add AFTER get_roster_transaction_recommendations, around line 835)

**INSERT THIS NEW TOOL:**
```typescript
      {
        name: "ice",
        description: "❄️ ICE - Intent Chirp Engine: The ultimate fantasy hockey advisor with ice-cold analysis and championship-level chirp intelligence. Multi-mode analysis tool.",
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
```

### 7.2 Add ICE handler to switch statement (add BEFORE the default case, around line 925)

**INSERT THIS NEW CASE:**
```typescript
      case "ice": {
        const analysisType = (args?.analysis_type as string) || "full_roster";
        const chirpOptions: ChirpParameters = {
          chirp_intensity: (args?.chirp_intensity as any) || "ice_cold",
          personality_mode: (args?.personality_mode as any) || "championship_coach",
          enable_chirp: true
        };
        const lookAheadDays = (args?.look_ahead_days as number) || 7;

        let result;
        switch (analysisType) {
          case "full_roster":
            result = await getRosterTransactionRecommendations(lookAheadDays);
            break;
          case "weekly_matchup":
            result = await getGamesInHand();
            break;
          case "pickup_strategy":
            result = await getStreamingRecommendations(lookAheadDays);
            break;
          case "lineup_optimization":
            result = await optimizeLineup();
            break;
          default:
            result = await getRosterTransactionRecommendations(lookAheadDays);
        }

        const iceAnalysis = enhanceWithChirpIntelligence(
          "get_roster_transaction_recommendations",
          result,
          chirpOptions
        );

        return {
          content: [{ type: "text", text: JSON.stringify(iceAnalysis, null, 2) }],
        };
      }
```

---

## STEP 8: Update Version to 3.0.0

### 8.1 Update server version (around line 654-658)

**FIND THIS:**
```typescript
const server = new Server(
  {
    name: "semantic-chirp-intelligence-mcp",
    version: "2.0.0", // About to upgrade to 3.0.0 with ICE!
  },
```

**REPLACE WITH:**
```typescript
const server = new Server(
  {
    name: "semantic-chirp-intelligence-mcp",
    version: "3.0.0",
  },
```

### 8.2 Update package.json version

**FIND:**
```json
"version": "2.0.0",
```

**REPLACE WITH:**
```json
"version": "3.0.0",
```

### 8.3 Update console.error message (around line 925)

**FIND:**
```typescript
console.error("🏒 Yahoo Fantasy Hockey MCP Server v2.0 running (Official API)");
```

**REPLACE WITH:**
```typescript
console.error("🏒❄️ Semantic Chirp Intelligence MCP v3.0 - ICE is ON! (Official API)");
```

---

## Testing After Implementation

1. `npm run build` - should compile without errors
2. Test each enhanced tool with different chirp intensities
3. Test the new `ice` tool with different analysis types
4. Verify backwards compatibility (tools work without chirp params)

---

## Summary of Changes

✅ **Step 5**: Added chirp parameters to 4 key tool schemas
✅ **Step 6**: Updated 4 tool handlers to extract chirp options and enhance responses
✅ **Step 7**: Created brand new ICE tool with multi-analysis capability
✅ **Step 8**: Bumped version to 3.0.0 across the board

**Result**: Full chirp intelligence integration with backwards compatibility! 🏒❄️🔥
