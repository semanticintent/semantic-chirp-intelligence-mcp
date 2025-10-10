# 🚀 Template Pattern Migration - Quick Start Guide

**Goal:** Start Phase 1 immediately with clear, actionable steps

---

## ⚡ Getting Started (5 minutes)

### 1. Create Feature Branch
```bash
cd /c/workspace/dev-tools/yahoo-fantasy-mcp
git checkout -b feature/template-pattern-migration
git push -u origin feature/template-pattern-migration
```

### 2. Create Folder Structure
```bash
mkdir -p src/domain
mkdir -p src/services/analyses
mkdir -p src/config
mkdir -p src/tools
mkdir -p tests/domain
mkdir -p tests/services/analyses
mkdir -p docs
```

### 3. Verify Current Build
```bash
npm run build
```
✅ Should succeed - this is your baseline

---

## 📋 Phase 1 Checklist (Day 1-2)

### Task 1.1: Extract Types (2 hours)

**Create:** `src/domain/types.ts`

**Action:** Extract all interfaces from `src/index.ts`:
- [ ] Copy all `interface` declarations
- [ ] Copy all `type` declarations
- [ ] Export everything
- [ ] Add proper JSDoc comments

**Interfaces to extract:**
```typescript
// From index.ts - find and copy these:
- ChirpParameters
- SemanticChirpContract
- YahooToken
- Player
- Roster
- OpponentData
- TrendingPlayer
- StreamingTarget
// ... and all others
```

**New interfaces to add:**
```typescript
export interface AnalysisRequest {
  readonly analysis_type: AnalysisType
  readonly personality_mode: PersonalityMode
  readonly chirp_intensity: ChirpIntensity
  readonly enable_chirp?: boolean
  readonly options?: AnalysisOptions
}

export interface FantasyData {
  readonly roster?: Roster
  readonly opponent?: OpponentData
  readonly availablePlayers?: Player[]
  readonly trendingPlayers?: TrendingPlayer[]
  readonly teamSchedules?: TeamSchedule[]
  readonly weeklySchedules?: WeeklySchedule[]
  readonly favorableTeams?: FavorableTeam[]
}

export interface AnalysisInsights {
  readonly immediate_issues?: number
  readonly games_disadvantage?: number
  readonly weak_positions?: PositionWeakness[]
  readonly position_counts?: PositionCounts
  readonly favorable_teams?: FavorableTeam[]
  readonly streaming_targets?: StreamingTarget[]
  readonly market_intelligence?: MarketIntelligence
  readonly games_advantage?: number
  readonly favorable_players?: Player[]
  readonly optimal_timing?: OptimalTiming
}

export interface Recommendation {
  readonly priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  readonly action: 'pickup' | 'drop' | 'move_to_ir' | 'bench_upgrade' | 'volume_play'
  readonly player?: Player
  readonly pickup?: Player
  readonly drop?: Player
  readonly reasoning: string
}

export interface AnalysisResponse {
  readonly analysis_insights: AnalysisInsights
  readonly recommendations: Recommendation[]
  readonly chirp_intelligence: ChirpResponse
  readonly metadata: AnalysisMetadata
}

export type AnalysisType =
  | 'ice_roster'
  | 'streaming_recommendations'
  | 'games_in_hand'
  | 'weekly_matchup'

export type PersonalityMode =
  | 'analytical'
  | 'roast_master'
  | 'championship_coach'
  | 'motivational'

export type ChirpIntensity =
  | 'gentle'
  | 'standard'
  | 'savage'
  | 'ice_cold'
```

**Test:**
```bash
npm run build
```
✅ Should succeed

**Commit:**
```bash
git add src/domain/types.ts
git commit -m "feat: Extract types to domain layer (Phase 1.1)"
```

---

### Task 1.2: Extract Governance (1.5 hours)

**Create:** `src/domain/governance.ts`

**Action:** Move governance code from `src/index.ts`:
- [ ] Copy `GovernanceViolation` interface
- [ ] Copy `GOVERNANCE_MONITOR` object
- [ ] Copy `auditSemanticContract` function
- [ ] Copy `checkGovernanceHealth` function
- [ ] Copy `validateSemanticChirpContract` function
- [ ] Export everything

**Add new governance methods:**
```typescript
// Add to GOVERNANCE_MONITOR object
export const GOVERNANCE_MONITOR = {
  // ... existing properties

  // 🆕 NEW: Analysis tracking
  analyses_executed: 0,
  analysis_by_type: new Map<AnalysisType, number>(),
  analysis_durations: [] as Array<{
    type: AnalysisType;
    duration_ms: number;
    timestamp: Date
  }>,

  trackAnalysisStart(type: AnalysisType): void {
    // Will be implemented in Phase 5
    console.log(`[GOVERNANCE] Analysis started: ${type}`);
  },

  trackAnalysisComplete(type: AnalysisType, duration_ms: number): void {
    this.analyses_executed++;
    this.analysis_by_type.set(type, (this.analysis_by_type.get(type) || 0) + 1);
    this.analysis_durations.push({ type, duration_ms, timestamp: new Date() });

    if (this.analysis_durations.length > 100) {
      this.analysis_durations = this.analysis_durations.slice(-100);
    }

    console.log(`[GOVERNANCE] Analysis completed: ${type} (${duration_ms}ms)`);
  }
};
```

**Update index.ts:**
```typescript
// At top of index.ts, add:
import {
  GOVERNANCE_MONITOR,
  validateSemanticChirpContract,
  auditSemanticContract,
  checkGovernanceHealth,
  GovernanceViolation
} from './domain/governance.js';

// Remove the old definitions from index.ts
```

**Test:**
```bash
npm run build
```
✅ Should succeed

**Commit:**
```bash
git add src/domain/governance.ts src/index.ts
git commit -m "feat: Extract governance to domain layer (Phase 1.2)"
```

---

### Task 1.3: Extract Config Constants (1 hour)

**Create:** `src/config/chirp-styles.ts`
```typescript
export const CHIRP_STYLES = {
  gentle: {
    tone: "encouraging",
    energy: "supportive",
    prefix: "Consider",
    suffix: "when you're ready"
  },
  standard: {
    tone: "direct_honest",
    energy: "confident",
    prefix: "Time to",
    suffix: "and improve your game"
  },
  savage: {
    tone: "brutal_truth",
    energy: "aggressive",
    prefix: "Bro,",
    suffix: "Get it together!"
  },
  ice_cold: {
    tone: "championship_enforcer",
    energy: "intimidating_confidence",
    prefix: "Listen up, future champion -",
    suffix: "That's how legends are made."
  }
} as const;
```

**Create:** `src/config/personality-modes.ts`
```typescript
export const PERSONALITY_MODES = {
  analytical: {
    focus: "data_driven",
    style: "smart chirps with stats backing",
    voice: "hockey_statistician",
    phrases: ["The data shows", "Analysis indicates", "Stats don't lie"]
  },
  motivational: {
    focus: "championship_mindset",
    style: "pump-up chirps that inspire action",
    voice: "championship_coach",
    phrases: ["You've got this", "Championship teams", "Winners do this"]
  },
  roast_master: {
    focus: "entertainment_value",
    style: "savage roasts with hockey humor",
    voice: "locker_room_comedian",
    phrases: ["Buddy,", "That's like", "Even my grandmother"]
  },
  championship_coach: {
    focus: "winning_strategy",
    style: "tough love with clear direction",
    voice: "elite_level_mentor",
    phrases: ["Elite players", "Championship strategy", "Next level thinking"]
  }
} as const;
```

**Create:** `src/config/tool-metadata.ts`
```typescript
// Copy entire TOOL_METADATA object from index.ts
export const TOOL_METADATA: Record<string, any> = {
  get_team_roster: {
    // ... existing metadata
  },
  // ... all other tools
};
```

**Update index.ts:**
```typescript
// Add imports at top
import { CHIRP_STYLES } from './config/chirp-styles.js';
import { PERSONALITY_MODES } from './config/personality-modes.js';
import { TOOL_METADATA } from './config/tool-metadata.js';

// Remove old definitions
```

**Test:**
```bash
npm run build
```
✅ Should succeed

**Commit:**
```bash
git add src/config/*.ts src/index.ts
git commit -m "feat: Extract config constants (Phase 1.3)"
```

---

### Task 1.4: Verify & Document (0.5 hours)

**Update index.ts imports section:**
```typescript
// ==========================================
// 📦 Imports - Organized by Domain
// ==========================================

// Core MCP
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Node.js
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import https from "https";
import { parseString } from "xml2js";
import { promisify } from "util";

// Domain layer
import {
  ChirpParameters,
  SemanticChirpContract,
  YahooToken
  // ... other types as needed
} from './domain/types.js';

import {
  GOVERNANCE_MONITOR,
  validateSemanticChirpContract,
  auditSemanticContract,
  checkGovernanceHealth
} from './domain/governance.js';

// Config layer
import { CHIRP_STYLES } from './config/chirp-styles.js';
import { PERSONALITY_MODES } from './config/personality-modes.js';
import { TOOL_METADATA } from './config/tool-metadata.js';

dotenv.config();
const parseXML = promisify(parseString);
```

**Verify line count reduction:**
```bash
# Check current index.ts line count
wc -l src/index.ts
```
Should be ~100-200 lines fewer than before

**Test everything:**
```bash
npm run build
npm run dev  # Test in one terminal
# In another terminal, test with MCP client if available
```

**Create Phase 1 completion document:**
```bash
echo "# Phase 1 Complete

✅ Types extracted to domain/types.ts
✅ Governance extracted to domain/governance.ts
✅ Config constants extracted to config/*.ts
✅ Build succeeds
✅ All imports updated

Next: Phase 2 - Template Base & Services
" > PHASE1_COMPLETE.md
```

**Final commit:**
```bash
git add .
git commit -m "docs: Phase 1 complete - Foundation & Types ✅"
git push
```

---

## 🎯 Phase 1 Success Criteria

- [ ] `src/domain/types.ts` exists with all interfaces
- [ ] `src/domain/governance.ts` exists with governance system
- [ ] `src/config/chirp-styles.ts` exists
- [ ] `src/config/personality-modes.ts` exists
- [ ] `src/config/tool-metadata.ts` exists
- [ ] `src/index.ts` imports from new files
- [ ] Build succeeds with `npm run build`
- [ ] No TypeScript errors
- [ ] No runtime errors when running server
- [ ] Git commits clean and descriptive

---

## 📞 What's Next?

After Phase 1 completion:

1. **Review the work** - Make sure everything compiles and runs
2. **Read Phase 2 plan** - Understand template base creation
3. **Take a break** - Phase 1 is foundation work, can be mentally taxing
4. **Start Phase 2** - Create the abstract template base class

---

## 🆘 Troubleshooting

### Build fails with "Cannot find module"
- Check all import paths end with `.js`
- Verify relative paths are correct
- Run `npm run build` to see specific errors

### TypeScript errors about circular dependencies
- Keep types in domain/types.ts minimal
- Don't import from index.ts in domain layer
- Use `import type { ... }` for type-only imports

### Runtime errors
- Check that all exports match imports
- Verify GOVERNANCE_MONITOR is properly initialized
- Look for missing `export` keywords

---

## 💡 Tips for Success

1. **Make small commits** - Each file extraction is a commit
2. **Test frequently** - Run `npm run build` after each change
3. **Read existing code carefully** - Understand before moving
4. **Use TypeScript errors as guide** - They'll tell you what's missing
5. **Don't optimize yet** - Just extract, don't refactor logic

---

**Ready to start? Let's do this! 🚀**

Run: `git checkout -b feature/template-pattern-migration`
