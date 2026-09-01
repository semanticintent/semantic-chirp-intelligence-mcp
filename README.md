# 🏒 Semantic CHIRP Intelligence MCP

> **Universal fantasy hockey intelligence.**
> A Model Context Protocol (MCP) server that turns any roster into an AI advisor —
> no account, no API key, no platform lock-in. Paste your team, get the cold truth.

[![Docs](https://img.shields.io/badge/docs-chirp.semanticintent.dev-1f6feb)](https://chirp.semanticintent.dev)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)

📖 **Full documentation:** [chirp.semanticintent.dev](https://chirp.semanticintent.dev)

---

## What this is

CHIRP is a **players-and-teams intelligence layer**. You tell it who is on your
roster — by pasting it from anywhere — and it reasons about schedules, statistics,
lineups, trades and draft value using the NHL's public API.

It is not tied to a fantasy platform. Yahoo, ESPN, Sleeper, CBS, a spreadsheet or a
paper league all work the same way, because the only thing CHIRP needs from you is
a list of names.

Every tool carries intent metadata, analyses run through a shared template, and
results come back with a *point of view* — schedule edges, roster truths, and the
occasional chirp.

### Highlights

- 🚀 **Zero setup** — no OAuth, no API key, no application to any platform. Install, paste a roster, done.
- 📋 **Paste from anywhere** — names resolve against live NHL rosters, so team and position fill themselves in. Accents, `Lastname, Firstname` and punctuation all handled.
- ❄️ **ICE — the Intent Chirp Engine** — championship-level roster analysis with brutal honesty
- 🎯 **Draft intelligence** — who to take at pick N, scored on real production and playoff-week schedule
- 🗓️ **Schedule intelligence** — every game count comes from the NHL's public club-schedule API, per club, per week
- 🏛️ **Semantic Anchoring Governance** — every tool declares its intent; a dashboard surfaces the health metrics
- 🧩 **Template Pattern architecture** — analyses are composable, consistent, and testable
- 🔒 **Read-only & local** — no credentials of any kind, no third-party data egress; your roster never leaves your machine

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Server (src/index.ts)  — stdio transport for Claude     │
├─────────────────────────────────────────────────────────────┤
│  Semantic config (src/config/)                               │
│    • tool-metadata.ts   — intent, discovery tags, chirp style │
│    • personality-modes.ts / chirp-styles.ts — the voice       │
├─────────────────────────────────────────────────────────────┤
│  Intelligence layer (src/analyses/ + src/template/)          │
│    • AnalysisTemplate   — shared Template Pattern base         │
│    • Ice / Lineup / GamesInHand / Streaming / WeekendStream    │
│    • Breakout / ScheduleValue / DraftPick                     │
├─────────────────────────────────────────────────────────────┤
│  Services (src/services/)                                     │
│    • ChirpIntelligence  — turns data into chirp               │
│    • NhlScheduleService — schedules, standings (NHL public API)│
│    • NhlStatsService    — player identity + season statistics  │
│    • RosterStore        — parses and stores what you paste     │
│    • LeagueDataService  — league state, source-agnostic        │
├─────────────────────────────────────────────────────────────┤
│  Domain (src/domain/)   — types + governance                 │
└─────────────────────────────────────────────────────────────┘
```

- **Semantic Anchoring Governance** — every tool registers intent metadata (intent category, hockey context, discovery tags, chirp potential). See [`SEMANTIC_ANCHORING_GOVERNANCE.md`](./SEMANTIC_ANCHORING_GOVERNANCE.md). The `governance_dashboard` tool reports live health.
- **Template Pattern** — analyses extend `AnalysisTemplate`, so each one produces output the same disciplined way. Adding an analysis is adding one class.

---

## Available Tools

### Setting up your league (paste-based)

| Tool | Description |
|------|-------------|
| `set_roster` | 📋 Paste your roster. Names resolve against live NHL rosters; team and position fill themselves in |
| `set_opponent_roster` | 📋 Paste your weekly opponent, enabling head-to-head analysis |
| `set_standings` | 📊 Paste league standings for league context |
| `show_stored_data` | 🗂️ Show (or clear) what CHIRP currently knows |

### Core data tools

| Tool | Description |
|------|-------------|
| `get_team_roster` | Your roster with live NHL club, position, season stats and games this week |
| `get_league_standings` | The standings you pasted |
| `search_players` | Search all 1,200+ NHL players by position, ranked by production |
| `get_player_stats` | Full stats for any player — by name, not an internal id |
| `compare_matchup` | Category-by-category comparison of your roster against your opponent's |

### CHIRP intelligence tools

| Tool | Description |
|------|-------------|
| `ice` | ❄️ **Intent Chirp Engine** — the flagship advisor; ice-cold, championship-level roster analysis |
| `get_roster_transaction_recommendations` | 🏒 ICE roster optimization — savage, brutally honest calls |
| `optimize_lineup` | Lineup recommendations from health, position and who actually plays tonight |
| `get_games_in_hand` | Schedule-advantage analysis, you vs. your opponent |
| `get_streaming_recommendations` | Schedule-aware pickup candidates |
| `analyze_weekend_streams` | 🌊 Weekend classifier — desperation filler vs. genuine upside |
| `analyze_breakout_players` | 📈 Breakout candidates scored on real production, opportunity and risk |
| `analyze_trade` | Category-by-category trade breakdown with an ACCEPT / DECLINE / PUSH verdict |
| `chirp_opponent` | Scouts your opponent's roster and chirps its weaknesses |
| `governance_dashboard` | 🏛️ Semantic Anchoring Governance health and analysis metrics |

### Draft tools

| Tool | Description |
|------|-------------|
| `chirp_draft_pick` | 🎯 **ICE at the draft table** — who to take at pick N, given who is gone, what you need, and playoff-week schedule |
| `schedule_value` | 🗓️ All 32 clubs rated — total games, four-game weeks, light weeks, back-to-backs, playoff-window volume |

> **On availability:** CHIRP knows every NHL player, but it cannot know who is
> *unowned in your league* — ownership is league-private and no public source
> exposes it. Pool-based tools therefore return "players not on the rosters you
> provided", ranked by production, and say so. Check availability before adding.

## Where the numbers come from

Every figure is fetched, not estimated — and none of it needs an account:

| Signal | Source |
|--------|--------|
| Games per week, back-to-backs, playoff-window volume | NHL public API (`club-schedule-season`) — all 32 clubs, cached per season |
| Player identity, club, position | NHL public API (`roster`) — 1,268 players |
| Season statistics (skaters and goalies) | NHL public API (`club-stats`) |
| Opponent difficulty | NHL standings, ranked by goals allowed per game |
| Your roster, opponent, standings | What you paste |

When a source is unreachable, the tool says so in its output and drops that
component from its scoring — it does not substitute an estimate for a fact.

---

## Prerequisites

- **Node.js 20+**
- An MCP client — e.g. **Claude Desktop**

That is the whole list. There is no account to create, no application to file, and
no credential to store.

> **Coming from v3?** v3 read your league through the Yahoo Fantasy API. In 2026
> Yahoo put that API behind a manual approval process that also revoked existing
> access, so a working install could stop working without any change to the code.
> v4 removes the dependency entirely: CHIRP now reasons about any roster you paste,
> on any platform. The Yahoo integration is preserved at the
> [v3.2.0 tag](https://github.com/semanticintent/semantic-chirp-intelligence-mcp/releases/tag/v3.2.0).

---

## Setup

```bash
git clone https://github.com/semanticintent/semantic-chirp-intelligence-mcp.git
cd semantic-chirp-intelligence-mcp
npm install
npm run build
npm run preflight    # checks the build and the NHL API — no credentials involved
```

### Add to Claude Desktop

Edit your Claude Desktop config:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "semantic-chirp-intelligence-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/semantic-chirp-intelligence-mcp/build/index.js"]
    }
  }
}
```

Use an **absolute path** to `build/index.js` (forward slashes, even on Windows). Restart Claude Desktop — the CHIRP tools will appear.

There is no `env` block, because there is nothing to configure. Your pasted
roster is stored in the project's git-ignored `.chirp-data/` and never leaves
your machine.

---

## Usage

Once connected, just talk to Claude about your team:

- *"I'm on the clock at pick 47 — who should I take?"*
- *"Which teams have the best schedule during my league's playoff weeks?"*
- *"Run ICE on my roster — what should I actually do this week?"*
- *"Where do I have a games-in-hand edge over my opponent?"*
- *"Find me streaming goalies for the weekend — real value, not desperation pickups."*
- *"Am I winning my matchup? Which categories am I losing?"*
- *"Who are the best players not on my roster right now?"*
- *"Show me the governance dashboard."*

---

## Development

```bash
npm run build        # compile TypeScript -> build/
npm run type-check   # tsc --noEmit
npm test             # run the vitest suite once
npm run test:watch   # watch mode
npm run test:coverage
npm run preflight    # build + NHL API reachability
npm run smoke        # call every tool and flag crash-like responses
```

### Project structure

```
semantic-chirp-intelligence-mcp/
├── src/
│   ├── index.ts            # MCP server (stdio) + tool registration
│   ├── analyses/           # Template-Pattern analyses (Ice, Streaming, GamesInHand,
│   │                       #   WeekendStream, Lineup, Breakout, ScheduleValue, DraftPick)
│   ├── template/           # AnalysisTemplate base
│   ├── services/           # NhlScheduleService, NhlStatsService, RosterStore,
│   │                       #   LeagueDataService, ChirpIntelligence
│   ├── config/             # tool-metadata, personality-modes, chirp-styles
│   ├── domain/             # types, governance, nhl-teams
├── tests/                  # vitest tests
├── scripts/preflight.mjs   # build + NHL API check
├── scripts/smoke.mjs       # calls every tool, flags crash-like responses
├── docs/                   # documentation (architecture, setup, dev notes)
```

---

## Troubleshooting

**A name did not resolve**
`set_roster` reports every line it could not match to exactly one NHL player,
under `needs_attention`. Ambiguous surnames come back with their candidates —
give a full name and re-run. Nothing is ever guessed onto your roster.

**Tools say no roster has been provided**
Paste one with `set_roster`. `show_stored_data` shows what is currently stored.

**Game counts are zero**
Check the dates. Outside the regular season there are genuinely no games to count;
`schedule_value` still works year-round because it reads the whole published season.

**Stats look like last season**
They are. Before opening night the current season has no statistics at all, so
CHIRP attaches the last completed season — which is the right basis at a draft.
Every response names the season it used.

---

## Security

- **No credentials at all** — v4 holds no API keys, tokens or account bindings. There is nothing to leak.
- **Read-only** — the only network calls are GETs to the NHL's public API. CHIRP cannot modify a roster anywhere.
- **Local-only** — runs over stdio. Your pasted roster stays in `.chirp-data/` on your machine and is git-ignored.
- See [SECURITY.md](./SECURITY.md) for the full policy.

## Part of Cormorant Foraging

ChirpIQX is the **Sound** (communication) dimension of [Cormorant Foraging](https://cormorantforaging.dev) — a family of Semantic Intent intelligence systems, each mapping a different dimension:

| System | Dimension | Domain |
|--------|-----------|--------|
| **ChirpIQX** *(this repo)* | Sound | Fantasy hockey intelligence |
| **WakeIQX** | Time | [AI context temporal intelligence](https://github.com/semanticintent/semantic-wake-intelligence-mcp) |
| **PerchIQX** | Space | Database schema intelligence |

📖 Learn more at [chirp.semanticintent.dev](https://chirp.semanticintent.dev) · [cormorantforaging.dev](https://cormorantforaging.dev)

## Contributing

Contributions welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md). New analyses should extend `AnalysisTemplate` and declare intent metadata in `tool-metadata.ts`.

## License

[MIT](./LICENSE) © semanticintent

## Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io) by Anthropic
- [NHL public API](https://api-web.nhle.com) — schedules, rosters, statistics and standings, free and unauthenticated
- Sibling project: [`semantic-wake-intelligence-mcp`](https://github.com/semanticintent/semantic-wake-intelligence-mcp)

---

**🏒 Now go win your league. ICE doesn't lie.**
