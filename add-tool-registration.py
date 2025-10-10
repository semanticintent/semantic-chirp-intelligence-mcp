import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open('src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the governance_dashboard tool registration and add semantic tool after it
pattern = r'(name: "governance_dashboard",\s+description: .*?\},\s+\},)'
replacement = r'''\1
      {
        name: SEMANTIC_PLAYER_COMPARISON.name,
        description: `${SEMANTIC_PLAYER_COMPARISON.description} - Auto-configured from semantic intent!`,
        inputSchema: getPlayerComparisonInputSchema()
      },'''

if 'SEMANTIC_PLAYER_COMPARISON.name' not in content:
    content = re.sub(pattern, replacement, content, flags=re.DOTALL)
    print("[OK] Added semantic tool registration")
else:
    print("[INFO] Tool registration already exists")

with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("[OK] Complete!")
