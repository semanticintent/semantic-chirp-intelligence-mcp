import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('src/index.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Fix lines 1270-1276
# Line 1270: "          }," should become "          }"
# Line 1271: "        }," should become "        }"
# Line 1272: "      {" should become "      },"
# Then add proper semantic tool registration

fixed_lines = lines[:1270]  # Everything up to line 1270

# Close the properties object (was line 1270)
fixed_lines.append("          }\n")
# Close the inputSchema object (was line 1271)
fixed_lines.append("        }\n")
# Close the governance_dashboard tool object (was line 1272)
fixed_lines.append("      },\n")
# Add semantic tool registration
fixed_lines.append("      {\n")
fixed_lines.append("        name: SEMANTIC_PLAYER_COMPARISON.name,\n")
fixed_lines.append("        description: `${SEMANTIC_PLAYER_COMPARISON.description} - Auto-configured from semantic intent!`,\n")
fixed_lines.append("        inputSchema: getPlayerComparisonInputSchema()\n")
fixed_lines.append("      }\n")
# Continue with the rest from line 1277 onwards
fixed_lines.extend(lines[1277:])

with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.writelines(fixed_lines)

print("[OK] Fixed tool registration syntax")
