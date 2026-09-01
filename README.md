# 🏒 Semantic CHIRP Intelligence MCP

> **Fantasy hockey intelligence that chirps you into championships.**
> A Model Context Protocol (MCP) server that turns your Yahoo Fantasy Hockey league into an AI advisor — not just a data pipe, but a **Semantic Intent** brain that reads the ice and tells you the cold truth.

[![Docs](https://img.shields.io/badge/docs-chirp.semanticintent.dev-1f6feb)](https://chirp.semanticintent.dev)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)

📖 **Full documentation:** [chirp.semanticintent.dev](https://chirp.semanticintent.dev)

---

## What this is

Most fantasy MCP servers stop at "fetch my roster." This one is a **semantic intelligence layer**: every tool carries intent metadata, analyses run through a shared template, and results come back with a *point of view* — schedule edges, streaming opportunities, and savage roster truths.

It's built on the same **Semantic Intent** philosophy as its sibling project, the temporal-intelligence brain [`@semanticintent/semantic-wake-intelligence-mcp`](https://github.com/semanticintent/semantic-wake-intelligence-mcp) — here applied to the domain of fantasy hockey.

### Highlights

- ❄️ **ICE — the Intent Chirp Engine** — championship-level roster analysis with brutal honesty
- 🎯 **Draft intelligence** — with a pick on the clock, who to take against *your* draft: board state, Yahoo ADP, roster holes, and playoff-week schedule
- 🗓️ **Schedule intelligence** — every game count comes from the NHL's public club-schedule API, per club, per week. Games-in-hand edges, streaming windows, and playoff-week schedule value
- 🌊 **Weekend stream classifier** — tells desperation pickups apart from genuine multi-week opportunities
- 🏛️ **Semantic Anchoring Governance** — every tool declares its intent; a dashboard surfaces the health metrics
- 🧩 **Template Pattern architecture** — analyses are composable, consistent, and testable
- 🔒 **Read-only & local** — OAuth 2.0, minimum permissions, no third-party data egress

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
│    • Ice / Streaming / GamesInHand / WeekendStream / Lineup   │
├─────────────────────────────────────────────────────────────┤
│  Services (src/services/)                                     │
│    • ChirpIntelligence  — turns data into chirp               │
│    • YahooApiClient     — all Yahoo Fantasy API access         │
├─────────────────────────────────────────────────────────────┤
│  Domain (src/domain/)   — types + governance                 │
└─────────────────────────────────────────────────────────────┘
```

- **Semantic Anchoring Governance** — every tool registers intent metadata (intent category, hockey context, discovery tags, chirp potential). See [`SEMANTIC_ANCHORING_GOVERNANCE.md`](./SEMANTIC_ANCHORING_GOVERNANCE.md). The `governance_dashboard` tool reports live health.
- **Template Pattern** — analyses extend `AnalysisTemplate`, so each one produces output the same disciplined way. Adding an analysis is adding one class.

---

## Available Tools

### Core data tools (read-only Yahoo Fantasy)

| Tool | Description |
|------|-------------|
| `get_team_roster` | Your current roster with players, positions, and status |
| `get_league_standings` | League standings — all teams and their records |
| `get_current_matchup` | Your current week's matchup and status |
| `search_players` | Search free agents by position (C, LW, RW, D, G) |
| `get_player_stats` | Detailed stats for a player by ID |
| `get_weekly_stats` | Your week's stats vs. your opponent |
| `compare_matchup` | Category-by-category breakdown of your matchup |
| `optimize_lineup` | Lineup recommendations based on health and positions |
| `get_trending_players` | Most-added / most-owned players — hot pickups |
| `debug_api_call` | Inspect raw Yahoo API responses for troubleshooting |

### CHIRP intelligence tools (Template Pattern + semantic analysis)

| Tool | Description |
|------|-------------|
| `ice` | ❄️ **Intent Chirp Engine** — the flagship multi-mode advisor; ice-cold, championship-level analysis combining all insights |
| `get_roster_transaction_recommendations` | 🏒 ICE roster optimization — savage, brutally honest lineup/transaction calls |
| `get_streaming_recommendations` | Schedule- and trend-aware waiver/streaming picks (weekly / weekend / daily strategies) |
| `get_games_in_hand` | Schedule-advantage analysis — remaining games, you vs. opponent |
| `analyze_weekend_streams` | 🌊 Weekend stream classifier — desperation filler vs. genuine multi-week upside (0–100 upside score) |
| `chirp_opponent` | Scouts your matchup opponent's roster and chirps their weaknesses |
| `analyze_trade` | Category-by-category trade breakdown with an ACCEPT / DECLINE / PUSH verdict |
| `governance_dashboard` | 🏛️ Semantic Anchoring Governance health, analysis metrics, and violations |

### Draft tools

| Tool | Description |
|------|-------------|
| `chirp_draft_pick` | 🎯 **ICE at the draft table** — with pick N on the clock, ranks who to take against *your* draft: who's already gone, what your roster still needs, Yahoo ADP, and playoff-week schedule |
| `schedule_value` | 🗓️ Rates all 32 NHL clubs — total games, four-game weeks, light weeks, back-to-backs, and games during **your league's** playoff weeks. The tiebreaker when two players are close |

---

## Where the numbers come from

Every figure these tools report is fetched, not estimated:

| Signal | Source |
|--------|--------|
| Games per week, back-to-backs, playoff-week volume | NHL public API (`api-web.nhle.com/v1/club-schedule-season`) — all 32 clubs, cached per season |
| Opponent difficulty | NHL standings, ranked by goals allowed per game |
| Player stats (season + last month) | Yahoo Fantasy player stats, batched |
| ADP — average pick, percent drafted | Yahoo `draft_analysis` |
| Draft board state | Yahoo `draftresults`, plus anything you pass in `already_drafted` |
| Your playoff weeks | `playoff_start_week` from your Yahoo league settings |

When a source is unreachable, the tool says so in its output and drops that
component from its scoring — it does not substitute an estimate for a fact.

> **Draft-day note:** Yahoo's REST draft results can lag a fast live draft.
> `chirp_draft_pick` treats `already_drafted` as a first-class second source
> rather than a fallback — a player is off the board if either source says so.
> Run `npm run verify:yahoo` against your league before draft day to confirm
> the live response shapes.

---

## Prerequisites

- **Node.js 20+**
- A **Yahoo account** with a Fantasy Hockey team
- An MCP client — e.g. **Claude Desktop**

## Setup

### 1. Create a Yahoo app

Go to [developer.yahoo.com/apps/create](https://developer.yahoo.com/apps/create/) and create an app:

- **OAuth Client Type:** `Confidential Client`
- **Redirect URI:** `https://localhost:3000/callback` *(must match exactly)*
- **API Permissions:** `Fantasy Sports → Read`

Copy your **Client ID** and **Client Secret**.

> 🔒 Treat the Client Secret like a password. Never commit it. If it ever leaks, **rotate it** by creating a new app and deleting the old one — see [SECURITY.md](./SECURITY.md).

### 2. Find your league and team IDs

From your team URL `https://hockey.fantasysports.yahoo.com/hockey/{LEAGUE_ID}/{TEAM_ID}` — the two numbers are your league and team IDs.

### 3. Install & configure

```bash
git clone https://github.com/semanticintent/semantic-chirp-intelligence-mcp.git
cd semantic-chirp-intelligence-mcp
npm install
cp .env.example .env   # then fill in your credentials
```

`.env`:
```
YAHOO_CLIENT_ID=your_client_id
YAHOO_CLIENT_SECRET=your_client_secret
YAHOO_LEAGUE_ID=your_league_id
YAHOO_TEAM_ID=your_team_id
```

### 4. Build

```bash
npm run build
```

### 5. Authenticate with Yahoo (one time)

```bash
node authenticate.js
```

Open the printed URL, click through the self-signed-certificate warning (it's a local callback), sign in, and authorize. The token is saved to `.yahoo-oauth.json` (git-ignored). The server auto-refreshes it after that.

### 6. Add to Claude Desktop

Edit your Claude Desktop config:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "semantic-chirp-intelligence-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/semantic-chirp-intelligence-mcp/build/index.js"],
      "env": {
        "DOTENV_CONFIG_QUIET": "true"
      }
    }
  }
}
```

Use an **absolute path** to `build/index.js` (forward slashes, even on Windows). Restart Claude Desktop — the CHIRP tools will appear.

Your credentials stay in the project's git-ignored `.env`; the server resolves
it from its own install directory, so it is found regardless of the working
directory the client launches it with. You do **not** need to copy secrets into
the client config. If you prefer to set them there anyway, a client `env` block
still overrides the file.

---

## Usage

Once connected, just talk to Claude about your team:

- *"I'm on the clock at pick 47 — who should I take?"*
- *"Which teams have the best schedule during my league's playoff weeks?"*
- *"Run ICE on my roster — what should I actually do this week?"*
- *"Where do I have a games-in-hand edge over my opponent?"*
- *"Find me streaming goalies for the weekend — real value, not desperation pickups."*
- *"Am I winning my matchup? Which categories am I losing?"*
- *"Who are the hottest waiver adds in my league?"*
- *"Show me the governance dashboard."*

---

## Development

```bash
npm run build        # compile TypeScript -> build/
npm run type-check   # tsc --noEmit
npm test             # run the vitest suite once
npm run test:watch   # watch mode
npm run test:coverage
npm run verify:yahoo # check live Yahoo response shapes against your league
```

### Project structure

```
semantic-chirp-intelligence-mcp/
├── src/
│   ├── index.ts            # MCP server (stdio) + tool registration
│   ├── analyses/           # Template-Pattern analyses (Ice, Streaming, GamesInHand,
│   │                       #   WeekendStream, Lineup, Breakout, ScheduleValue, DraftPick)
│   ├── template/           # AnalysisTemplate base
│   ├── services/           # ChirpIntelligence, YahooApiClient, NhlScheduleService
│   ├── config/             # tool-metadata, personality-modes, chirp-styles
│   ├── domain/             # types, governance, nhl-teams, yahoo-stats
│   └── experimental/       # semantic-intent parser experiments
├── tests/                  # vitest tests
├── scripts/verify-yahoo.mjs # live Yahoo response-shape check
├── authenticate.js         # one-time Yahoo OAuth helper
├── docs/                   # documentation (architecture, setup, dev notes)
└── .env.example
```

---

## Troubleshooting

**`ERR_SSL_VERSION_OR_CIPHER_MISMATCH` when opening `https://localhost:3000/`**
The callback server started without a certificate. Fixed in 3.2.0 — `selfsigned`
5.x made `generate()` async and it was being called synchronously. Note that this
error gives no "Advanced → Proceed" option, unlike a normal self-signed warning.

**`403 This application is not authorized to perform this action` on every endpoint**
Including `/game/nhl`, which needs no user data. Yahoo issued a token that
carries no working Fantasy authorization. (Note: a missing `xoauth_yahoo_guid`
in the token response is *not* a reliable tell — Yahoo only returns that field
when the `openid` scope is requested. Verify with `npm run preflight`, which
makes a real API call.)

1. Confirm at [developer.yahoo.com/apps](https://developer.yahoo.com/apps/) that the
   app has a **Fantasy Sports** permission at all. Yahoo's permission list opens on
   other APIs (TW Auction, Profiles), so it is easy to end up with an app named for
   fantasy that carries an unrelated permission. Such an app rejects every `fspt-*`
   scope with `invalid_scope`, and any token it mints 403s everywhere. If you have
   several similarly named apps, check the **App ID** matches the credentials in
   `.env`. Client type must be **Confidential Client**.
2. If you already consented once under a misconfigured app, Yahoo reissues under
   the **existing grant** and ignores the new scope request — you get a new
   access token with the *same* refresh token, and the same 403. Revoke the app
   at [login.yahoo.com/account/connected-apps](https://login.yahoo.com/account/connected-apps),
   delete `.yahoo-oauth.json`, and authenticate again.
3. A newly created or edited Yahoo app can take 15–60 minutes to propagate.

**`invalid_scope` at the consent screen**
Either the requested scope does not match the app's registered permission
(`fspt-r` for Read, `fspt-w` for Read/Write), or — far more often — the app has no
Fantasy Sports permission at all. See the 403 entry above.

**Yahoo will not delete an app**
A long-standing bug in Yahoo's developer console. Untick every API permission and
save instead: a permission-less app mints tokens that can do nothing. Also revoke
the grant at [connected-apps](https://login.yahoo.com/account/connected-apps).

**`EADDRINUSE: address already in use :::3000`**
A previous `authenticate.js` is still running. `lsof -ti:3000 | xargs kill`.

**Preflight is green but tools return nothing**
Check the league is the current season's. `npm run preflight` prints the league
name, season and start date on success — a stale league ID from last season
resolves but scores your playoff window against the wrong dates.

---

## Security

- **Read-only** integration — requests the minimum Yahoo `Read` permission; never modifies your roster or transactions.
- **Local-only** — runs over stdio; the only network calls are to Yahoo's API (and the NHL public schedule API).
- **Secrets never committed** — `.env` and `.yahoo-oauth.json` are git-ignored. See [SECURITY.md](./SECURITY.md) for the full policy and how to rotate a leaked credential.

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
- [Yahoo Fantasy Sports API](https://developer.yahoo.com/fantasysports/)
- Sibling project: [`semantic-wake-intelligence-mcp`](https://github.com/semanticintent/semantic-wake-intelligence-mcp)

---

**🏒 Now go win your league. ICE doesn't lie.**
