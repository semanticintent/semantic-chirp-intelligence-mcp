import re
import sys

# Force UTF-8 output
sys.stdout.reconfigure(encoding='utf-8')

# Read index.ts
with open('src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Step 1: Add import after LineupAnalysis import
import_pattern = r"(import { LineupAnalysis } from './analyses/LineupAnalysis\.js';)\n"
import_replacement = r"\1\n\n// Experimental: Semantic Intent Parser\nimport {\n  SEMANTIC_PLAYER_COMPARISON,\n  getPlayerComparisonInputSchema,\n  executePlayerComparison\n} from './experimental/semantic-tool-integration.js';\n"

if "semantic-tool-integration" not in content:
    content = re.sub(import_pattern, import_replacement, content)
    print("[OK] Added import")
else:
    print("[INFO] Import already exists")

# Step 2: Add tool registration (find the tools array and add before the closing bracket)
# Find a good anchor point - let's add it after get_governance_dashboard
tool_registration_pattern = r'(name: "get_governance_dashboard",\s+description:.*?inputSchema:.*?\},\s+\},)'
tool_registration_addition = r'''\1
      {
        name: SEMANTIC_PLAYER_COMPARISON.name,
        description: `${SEMANTIC_PLAYER_COMPARISON.description} - Intent: "${SEMANTIC_PLAYER_COMPARISON.semanticIntent.trim().split('\n')[1].trim()}"`,
        inputSchema: getPlayerComparisonInputSchema()
      },'''

if "semantic_player_comparison" not in content:
    content = re.sub(tool_registration_pattern, tool_registration_addition, content, flags=re.DOTALL)
    print("[OK] Added tool registration")
else:
    print("[INFO] Tool registration already exists")

# Step 3: Add handler (find a good place in the switch statement)
# Let's add it right before the default case
handler_pattern = r'(\s+default:\s+throw new Error\(`Unknown tool: \${name}`\);)'
handler_addition = r'''
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

\1'''

if 'case "semantic_player_comparison"' not in content:
    content = re.sub(handler_pattern, handler_addition, content)
    print("[OK] Added handler")
else:
    print("[INFO] Handler already exists")

# Write back
with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("\n[OK] Integration complete!")
