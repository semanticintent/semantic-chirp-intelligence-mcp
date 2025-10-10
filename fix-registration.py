import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Find and fix the governance_dashboard tool registration
# The issue is at lines 1270-1272

# Target pattern to find (with the error)
pattern_to_fix = """            }
          },
          }
        }
      },
      {
        name: SEMANTIC_PLAYER_COMPARISON.name,
        description: `${SEMANTIC_PLAYER_COMPARISON.description} - Auto-configured from semantic intent!`,
        inputSchema: getPlayerComparisonInputSchema()
      }
  };"""

# Correct replacement
correct_pattern = """            }
          }
        }
      },
      {
        name: SEMANTIC_PLAYER_COMPARISON.name,
        description: `${SEMANTIC_PLAYER_COMPARISON.description} - Auto-configured from semantic intent!`,
        inputSchema: getPlayerComparisonInputSchema()
      }
    ],
  };"""

content = content.replace(pattern_to_fix, correct_pattern)

with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("[OK] Fixed tool registration - removed extra closing brace")
