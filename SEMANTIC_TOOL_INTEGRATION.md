# Adding Semantic Player Comparison Tool

## Quick Integration Guide

Add the experimental semantic tool to your MCP server in 3 simple steps:

### Step 1: Add Import (after line 51)

```typescript
// Experimental: Semantic Intent Parser
import {
  SEMANTIC_PLAYER_COMPARISON,
  getPlayerComparisonInputSchema,
  executePlayerComparison
} from './experimental/semantic-tool-integration.js';
```

### Step 2: Register Tool in ListToolsRequestSchema handler

Find the `tools` array in `server.setRequestHandler(ListToolsRequestSchema, ...)` (around line 1061) and add:

```typescript
{
  name: SEMANTIC_PLAYER_COMPARISON.name,
  description: `${SEMANTIC_PLAYER_COMPARISON.description} - Auto-configured from semantic intent: "${SEMANTIC_PLAYER_COMPARISON.semanticIntent.trim().split('\n')[0]}"`,
  inputSchema: getPlayerComparisonInputSchema()
},
```

### Step 3: Add Handler in CallToolRequestSchema

Find the `switch (name)` statement (around line 1275) and add this case:

```typescript
case "semantic_player_comparison": {
  try {
    const result = await executePlayerComparison(
      args,
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
```

## Testing

After integration:

1. Rebuild: `npm run build`
2. Restart your MCP server
3. In Claude Desktop, try:
   ```
   Compare Connor McDavid and Auston Matthews
   ```

The tool will:
- Parse semantic intent to extract parameters (player1, player2)
- Infer capabilities needed (API calls, data analysis)
- Execute using existing Yahoo API functions
- Return comparison with `_debug` section showing parsed configuration

## What This Proves

✅ **Semantic intent → Working tool** end-to-end
✅ **Auto-generated input schema** from intent
✅ **Integration with existing infrastructure** (no disruption)
✅ **Live validation** with real Yahoo API calls

If this works reliably, the foundation for Universal MCP is proven solid!
