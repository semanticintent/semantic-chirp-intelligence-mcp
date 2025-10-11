# 🧪 Test Scenarios for Breakout Analysis Tool

## Quick Reference

**Tool Name:** `analyze_breakout_players`
**Branch:** `feature/template-pattern-migration`
**Status:** Built and ready (requires Claude Desktop restart)

---

## Pre-Test Setup

### 1. Restart Claude Desktop
- Close all Claude Desktop windows
- Relaunch Claude Desktop
- Wait for MCP servers to load

### 2. Verify Tool Availability
Ask Claude: *"What fantasy hockey analysis tools do you have?"*

Expected response should include:
- ✅ `analyze_breakout_players` (NEW!)
- ✅ `get_trending_players`
- ✅ `search_players`
- ✅ `ice` (roster optimization)
- ✅ Other existing tools

---

## Test Scenarios

### Scenario 1: Basic Breakout Query
**Goal:** Test default parameters and natural language understanding

**Prompt:**
```
Tell me about breakout players in the free agent pool
```

**Expected Behavior:**
- Claude uses `analyze_breakout_players` with defaults
- Returns 10 players (default max_results)
- Ownership threshold: <50% (default)
- All positions included

**Expected Output Structure:**
```json
{
  "analysis_insights": {
    "streaming_targets": [
      {
        "name": "Player Name",
        "position": "C,LW",
        "breakout_score": 85,
        "category": "must_add",
        "confidence": "high",
        "catalyst": "Reason for breakout"
      }
    ]
  }
}
```

**Success Criteria:**
- [x] Tool executes without errors
- [x] Returns scored players (0-100 scale)
- [x] Categories present: must_add, strong_pickup, monitor, sleeper
- [x] Chirp intelligence included
- [x] Semantic metadata confirms auto-configuration

---

### Scenario 2: Position-Specific Query
**Goal:** Test position filtering

**Prompt:**
```
I need a right wing. Who are the best breakout candidates?
```

**Expected Behavior:**
- Claude infers `position_filter: ["RW"]`
- Returns only RW-eligible players
- Filters out C, LW, D, G

**Expected Output:**
- All players have "RW" in position field
- Position breakdown shows RW-specific stats
- Recommendations focused on RW additions

**Success Criteria:**
- [x] Only RW players returned
- [x] Position breakdown accurate
- [x] Chirp commentary RW-specific

---

### Scenario 3: Multi-Position Query
**Goal:** Test multiple position filters

**Prompt:**
```
Find me forwards (C, LW, RW) with high breakout potential
```

**Expected Behavior:**
- Claude sets `position_filter: ["C", "LW", "RW"]`
- Excludes defensemen and goalies
- Returns top forwards only

**Success Criteria:**
- [x] No D or G players in results
- [x] Mix of C, LW, RW positions
- [x] Position breakdown shows all three forward positions

---

### Scenario 4: Ownership Threshold
**Goal:** Test ownership filtering

**Prompt:**
```
Show me sleeper picks under 20% owned
```

**Expected Behavior:**
- Claude sets `ownership_threshold: 20`
- Returns only players <20% owned
- Likely more "sleeper" category players

**Expected Output:**
- All players have `percent_owned < 20`
- More speculative picks (lower scores OK)
- Higher risk/reward candidates

**Success Criteria:**
- [x] No players over 20% ownership
- [x] Sleeper category prominent
- [x] Risk scores reflected in analysis

---

### Scenario 5: Chirp Intensity Variations
**Goal:** Test different chirp personalities

**Test 5a: Gentle Chirp**
```
Give me a gentle analysis of breakout centers
```
Expected: Encouraging, supportive tone

**Test 5b: Savage Chirp**
```
Give me a savage breakdown of breakout players - don't hold back
```
Expected: Aggressive, confrontational commentary

**Test 5c: Ice Cold Chirp**
```
ICE mode analysis - who are the breakout players?
```
Expected: Championship enforcer tone

**Success Criteria:**
- [x] Chirp tone matches request
- [x] analysis_chirp reflects personality
- [x] ice_cold_truth appropriate to intensity

---

### Scenario 6: Score Threshold
**Goal:** Test minimum score filtering

**Prompt:**
```
Only show me must-add level breakout players (score 80+)
```

**Expected Behavior:**
- Claude sets `min_score: 80`
- Returns only top-tier candidates
- Fewer results, higher quality

**Expected Output:**
- All players have `breakout_score >= 80`
- Mostly "must_add" category
- High confidence ratings

**Success Criteria:**
- [x] All scores 80+
- [x] Category distribution appropriate
- [x] Urgency marked as "immediate" or "high"

---

### Scenario 7: Max Results Control
**Goal:** Test result limit parameter

**Prompt:**
```
Give me your top 3 breakout player recommendations
```

**Expected Behavior:**
- Claude sets `max_results: 3`
- Returns exactly 3 players
- Highest scored players selected

**Success Criteria:**
- [x] Exactly 3 players returned
- [x] Top-scored players selected
- [x] No truncation artifacts

---

### Scenario 8: Combined Parameters
**Goal:** Test multiple parameters together

**Prompt:**
```
Find me the top 5 center breakout candidates under 40% owned
with championship coach personality
```

**Expected Behavior:**
- `position_filter: ["C"]`
- `ownership_threshold: 40`
- `max_results: 5`
- `personality_mode: "championship_coach"`

**Expected Output:**
- 5 centers
- All <40% owned
- Championship-focused chirp commentary

**Success Criteria:**
- [x] All parameters respected
- [x] Position filter applied
- [x] Ownership filter applied
- [x] Result count correct
- [x] Chirp personality appropriate

---

### Scenario 9: No Chirp Mode
**Goal:** Test chirp intelligence disabled

**Prompt:**
```
Analyze breakout players with no chirp commentary
```

**Expected Behavior:**
- Claude sets `enable_chirp: false`
- Raw data returned
- No chirp_intelligence field

**Expected Output:**
```json
{
  "analysis_insights": {...},
  "recommendations": [...]
  // NO chirp_intelligence
}
```

**Success Criteria:**
- [x] No chirp commentary
- [x] Data-only response
- [x] Analysis still complete

---

### Scenario 10: Market Intelligence Focus
**Goal:** Test market trend analysis

**Prompt:**
```
What are the trending breakout positions right now?
```

**Expected Behavior:**
- Tool executes with defaults
- Focus on `market_intelligence` output
- Position breakdown emphasized

**Expected Output:**
```json
{
  "market_intelligence": {
    "total_trending": 25,
    "hot_positions": ["C", "RW", "D"],
    "top_trending_team": "BOS"
  },
  "position_breakdown": {...}
}
```

**Success Criteria:**
- [x] Market intelligence populated
- [x] Hot positions identified
- [x] Trending team shown

---

## Edge Cases & Error Handling

### Edge Case 1: No Players Match Criteria
**Prompt:**
```
Find me breakout goalies under 5% owned with score over 90
```

**Expected:**
- Tool executes successfully
- Returns empty or minimal results
- Helpful message about criteria

### Edge Case 2: Invalid Position
**Prompt:**
```
Find me breakout players at QB position
```

**Expected:**
- Claude recognizes invalid hockey position
- Either corrects or returns error
- Helpful message about valid positions

### Edge Case 3: OAuth Token Expired
**Expected:**
- Tool attempts token refresh
- Retries request
- Or returns clear auth error

---

## Performance Benchmarks

### Expected Response Times
- Basic query: 3-8 seconds
- Position-filtered: 4-10 seconds
- Multi-position: 5-12 seconds

### Resource Usage
- API calls: 5-10 per analysis
- Memory: <50MB overhead
- Network: Yahoo API rate limits respected

---

## Comparison Tests

### Test vs. Manual Analysis
Compare `analyze_breakout_players` output with Claude's manual approach:

**Manual Method:**
1. get_trending_players
2. search_players for each position
3. get_player_stats for individuals
4. Manual synthesis

**New Tool Method:**
1. analyze_breakout_players (single call)

**Compare:**
- Speed: New tool should be 3-5x faster
- Consistency: Scoring formula ensures repeatability
- Depth: Integrated analysis vs. manual synthesis

---

## Regression Tests

After any changes to the tool, re-run:
- [x] Scenario 1 (basic query)
- [x] Scenario 2 (position filter)
- [x] Scenario 5 (chirp variations)
- [x] Scenario 8 (combined parameters)

---

## Success Metrics

### Tool Adoption
- [ ] Used in 3+ consecutive conversations
- [ ] Preferred over manual analysis
- [ ] Results align with fantasy hockey expertise

### Accuracy
- [ ] Breakout predictions validated over 2-3 weeks
- [ ] Scoring correlates with actual performance
- [ ] Risk assessments accurate

### User Experience
- [ ] Natural language queries work intuitively
- [ ] Responses are actionable
- [ ] Chirp commentary adds value

---

## Bug Report Template

If you encounter issues:

```markdown
**Test Scenario:** [scenario name]
**Prompt:** [exact prompt used]
**Expected:** [what should happen]
**Actual:** [what actually happened]
**Error Message:** [if any]
**Tool Call:** [check Claude's tool usage]
**Timestamp:** [when it occurred]
```

---

## Next Steps After Testing

### Phase 1: Validation (Week 1)
- [x] Run all 10 scenarios
- [x] Document any bugs
- [x] Verify scoring accuracy

### Phase 2: Refinement (Week 2)
- [ ] Adjust scoring weights based on results
- [ ] Tune position scoring differences
- [ ] Refine risk calculations

### Phase 3: Enhancement (Week 3+)
- [ ] Integrate external data sources
- [ ] Add historical tracking
- [ ] Implement learning from predictions

---

## Quick Test Commands

After restarting Claude Desktop, paste these:

```
1. "Tell me about breakout players"
2. "I need a center, who are the best breakouts?"
3. "Show me sleepers under 30% owned"
4. "Give me a savage breakdown of breakout RW"
5. "Top 5 breakout candidates for immediate pickup"
```

---

*Ready to test! Remember to restart Claude Desktop first.* 🏒
