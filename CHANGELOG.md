# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.3]

### Changed
- **`@modelcontextprotocol/sdk` 1.19.1 → 1.30.0.** Adds support for protocol
  revision **`2025-11-25`**, which the previous SDK did not know; the server now
  negotiates it when a client offers it, and continues to negotiate down to
  `2025-06-18`, `2025-03-26` and `2024-11-05` for older clients. Also aligns this
  server with the SDK version used across the rest of the Cormorant Foraging
  family.

No functional changes. Transport remains stdio, which is correct for a locally
launched MCP server; the SDK's stateless Streamable HTTP transport applies to
remotely hosted servers and is not used here.

---

## [4.0.2]

### Fixed
- **`chirp_draft_pick` could never score a playoff window.** Its resolver still
  read Yahoo league settings, which v4 removed, and the tool exposed no way to
  supply the weeks — so the playoff-schedule component the tool advertises was
  permanently inert. It now accepts `playoff_start_week` and `playoff_end_week`
  and anchors week 1 to the NHL season opener, matching `schedule_value`.
- **The draft chirp claimed figures it had not computed**, rendering
  "plays **?** games in your playoff window". The schedule clause now appears
  only when a window was actually resolved; otherwise the tool says it has not
  scored your playoff weeks and names the parameters that would let it.
- **The draft chirp described a market that does not exist.** It read "the room
  usually takes him at 10" — but v4 has no ADP, and `average_pick` is the
  player's rank by production. It now says "the Nth best producer left", which
  is what the number means.

### Changed
- Default draft pool 150 → 250 players.

---

## [4.0.1]

### Fixed
- **`dotenv` was still declared as a runtime dependency** while the README stated
  the package holds no credentials. It was unused after the v4 rewrite. The only
  runtime dependency is now `@modelcontextprotocol/sdk`.
- **README claims left over from v3**, all visible on the published npm page:
  the Security section still cited "OAuth 2.0"; the Claude Desktop config still
  carried a `DOTENV_CONFIG_QUIET` env block and a paragraph about credentials
  living in `.env`; the project tree listed the deleted `yahoo-stats` module; a
  usage example referenced waiver-add data v4 cannot obtain; and the architecture
  diagram omitted the Breakout, ScheduleValue and DraftPick analyses.

---

## [4.0.0] — "Universal"

CHIRP is no longer a Yahoo tool. It is a players-and-teams intelligence layer that
works with any roster, from any platform, with no account at all.

### Removed — BREAKING

- **The entire Yahoo Fantasy API integration.** No OAuth, no token lifecycle, no
  certificate generation, no credentials of any kind. `YahooApiClient`,
  `authenticate.js`, `scripts/verify-yahoo.mjs`, `src/experimental/`, the
  placeholder-credential machinery and the `.env` requirement are all gone.
- **Dependencies** `selfsigned`, `xml2js` and `dotenv`. The runtime dependency list
  is now the MCP SDK alone.
- **Five tools** that structurally required live platform data no public source
  exposes: `get_current_matchup`, `get_weekly_stats`, `get_trending_players`,
  `debug_api_call`, `semantic_player_comparison`.

**Why.** In 2026 Yahoo put the Fantasy Sports API behind a manual approval process
and revoked existing access — verified on a real account, where three apps
including one that had worked for a full previous season all returned
`403 This application is not authorized`. A working install could stop working
with no change to this code. The intelligence layer was never the part that needed
an account; the data source was.

### Added

- **`set_roster` / `set_opponent_roster`** — paste a roster from anywhere. Names
  resolve against live NHL rosters, so team and position fill themselves in.
  Handles tab-separated rows with lineup slots, bare names, `Lastname, Firstname`,
  numbered lines and bracketed team/position, plus accents (`Stutzle` → `Stützle`)
  and punctuation (`J.T. Miller`).
- **`set_standings`** — paste league standings for league context.
- **`show_stored_data`** — inspect or clear what CHIRP currently knows.
- **`NhlStatsService`** — all 32 club rosters plus season statistics from the NHL
  public API. 1,268 players in ~500ms cold, then a disk cache. Statistics default
  to the previous season, because before opening night the current one has none —
  and a draft is exactly when last season's line matters.
- **`RosterStore`** and **`LeagueDataService`** — paste parsing, persistence, and a
  source-agnostic view of league state in the shape the analyses already consume.
- **`npm run smoke`** — calls every tool and distinguishes "returned data",
  "clean error" and "crash-like".

### Changed

- **ICE's schedule advantage is now a measurement.** `fetchGamesInHand` had always
  returned a hardcoded `0`, in every released version. It now counts each rostered
  player's real club games over the look-ahead window.
- **Pool-based tools** (`get_streaming_recommendations`, `analyze_weekend_streams`,
  `analyze_breakout_players`, `chirp_draft_pick`) rank NHL players *not on the
  rosters you provided*, and state plainly that league availability is private and
  cannot be determined from public data. They no longer imply a waiver wire.
- **`search_players`** searches all 1,200+ NHL players. **`get_player_stats`**
  accepts a name rather than an internal id. **`compare_matchup`** and
  **`chirp_opponent`** work from the pasted opponent roster.
- **A name that does not resolve to exactly one player is reported**, with its
  candidates, rather than guessed. A roster silently holding the wrong player is
  worse than one that says it could not read line 7.

### Migration from 3.x

1. `npm install && npm run build`
2. Delete `.env` and `.yahoo-oauth.json` — neither is read any more
3. Remove the Yahoo `env` block from your MCP client config
4. Paste your roster with `set_roster`

The Yahoo integration is preserved at the
[v3.2.0 tag](https://github.com/semanticintent/semantic-chirp-intelligence-mcp/releases/tag/v3.2.0).

**Tools: 22 → 21. Tests: 110 → 136. Net −1,677 lines.**

---

## [3.2.0] — "Real Ice"

### Added
- **`chirp_draft_pick`** — 🎯 ICE at the draft table. With a pick on the clock, ranks who to take against *your* draft: who is already off the board, what your roster still needs, Yahoo's ADP (`average_pick`, `percent_drafted`), and each club's schedule during your league's playoff weeks. Value is measured as ADP delta, so "value" means the market is wrong at this pick — not "this player is good". Yahoo's REST draft results can lag a fast live draft, so `already_drafted` is a first-class second source of board state, not a fallback.
- **`schedule_value`** — 🗓️ Rates all 32 NHL clubs on what their schedule is worth to a fantasy roster: total games, four-game weeks, light weeks, back-to-backs, and games during **your league's** playoff weeks, read from `playoff_start_week` in your Yahoo league settings. A public schedule grid has to guess when your playoffs are; this reads them.
- **`NhlScheduleService`** — the single source of schedule truth, backed by the NHL's public club-schedule endpoint. No API key, ~350ms for all 32 clubs cold, then a season-scoped disk cache. Exposes games in range, per-week counts, back-to-backs, season profiles, and standings-derived opponent difficulty.
- **`src/domain/nhl-teams.ts`** — Yahoo ↔ NHL abbreviation mapping for all 32 clubs.
- **`src/domain/yahoo-stats.ts`** — shared stat-id identity that prefers Yahoo's own `/game/nhl/stat_categories` catalogue over a hardcoded map.
- **`npm run verify:yahoo`** — read-only script that checks the live Yahoo response shapes against your league, including whether the inherited stat-id map actually agrees with Yahoo's catalogue.
- Tool count: 20 → 22. Tests: 45 → 101.

### Fixed
- **The schedule tools did not use a schedule.** `get_games_in_hand` and `get_streaming_recommendations` both returned the same constant (`players * 3.5 * weeks`), so every player had identical volume and the "4 games this week" branch was unreachable. `analyze_weekend_streams` generated its game counts and back-to-backs with `Math.random()`. All three now read the real NHL schedule per club.
- **Player metrics were synthetic.** `analyze_weekend_streams` used `Math.random()` as recent PPG and TOI, so its advertised 0–100 upside score was mostly noise. `analyze_breakout_players` generated its entire stat line (G/A/GP/PPP/SOG) with `Math.random()` while advertising "data-driven scoring". Both now read Yahoo's real season and last-month stats via a new batched `getPlayersStats`.
- **Matchup quality was `Math.random() * 100`.** Opponent difficulty is now ranked from NHL standings by goals allowed per game.
- **Five clubs never showed a game.** Yahoo and the NHL spell `LA`/`LAK`, `NJ`/`NJD`, `SJ`/`SJS`, `TB`/`TBL` and `StL`/`STL` differently, and `LineupAnalysis` compared the two abbreviations directly — so those five always reported "no game today", silently.
- **Two token-refresh paths wrote the same file.** `index.ts` carried its own copy of the token lifecycle plus a byte-identical duplicate of `request()`, while the analysis classes used `YahooApiClient`. A refresh from a tool handler could race one from an analysis and clobber the newer token. All Yahoo access now goes through the service.

### Changed
- Tools report their data source in their output. When the NHL schedule or Yahoo stats are unreachable, the affected component is dropped from scoring and the response says so — no estimate is substituted for a fact.
- README no longer claims "NHL public API for real schedules" as a blanket feature; there is now a "Where the numbers come from" table naming the source of every figure.

- **Authentication was completely broken since 2026-07-27.** The Dependabot bump `selfsigned` 3.x → 5.5.0 (`e5dae4f`) crossed a major version that made `generate()` async. `authenticate.js` kept calling it synchronously, so `pems.private` and `pems.cert` were both `undefined`. Node starts an HTTPS server with no certificate without complaining, then fails every TLS handshake with `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` — and the browser offers no "Advanced → Proceed" escape hatch, so **nobody who cloned the repo after that commit could authenticate at all**. Now awaited, with a guard that fails loudly if key or cert is ever missing again, and a regression test covering the async contract and a real handshake.
- **`authenticate.js` now rejects an unfilled `.env`.** A `.env` copied from the template but never edited previously failed much later, at Yahoo, with an opaque error.
- **Credentials now live in one place.** `dotenv.config()` resolved `.env` against the current working directory, and MCP clients launch the server with an arbitrary cwd (Claude Desktop uses `/`), so the project's `.env` was never found — which is why setup previously required copying all four Yahoo secrets into the client config as well. The server now resolves `.env` from its own install directory. A client `env` block still overrides the file.

### Documented
- **Yahoo now gates the Fantasy Sports API behind manual approval.** Creating an app and ticking "Fantasy Sports" is no longer sufficient — Yahoo reviews every access request at [sports.yahoo.com/developer/access](https://sports.yahoo.com/developer/access/). Until approved, OAuth completes normally and every API call returns `403 This application is not authorized to perform this action`, including `/game/nhl`. Verified on one account in September 2026 that this applies to **existing** apps as well: three apps, including one from 2025 that worked all of the previous season, all returned the same 403. Existing setups and tutorials predate the gate, which is why none mention it. Documented in the prerequisites, the troubleshooting section and `npm run preflight`, along with Yahoo's attribution requirement.

### Known gaps
- The stat-id map inherited by `analyze_trade` (`1=G, 2=A, 3=+/-, 4=PIM, 5=SOG, 8=PPP, 31=W, 32=GAA, 33=SV%`) has **not** been verified against a live league. If any id is wrong, that tool's category verdicts are wrong. `npm run verify:yahoo` reports the mismatches; at runtime Yahoo's own catalogue overrides the map once loaded.
- `GamesInHandAnalysis`, `LineupAnalysis` and `StreamingAnalysis` still carry `// @ts-nocheck`, so TypeScript does not check them.

---

## [3.1.0]

### Added
- **`chirp_opponent`** — scouts your current matchup opponent's roster for injuries, IR mismanagement, and bench-heavy lineups, then generates savage trash talk via `CHIRP_STYLES` + `PERSONALITY_MODES`. Defaults to `savage` intensity / `roast_master` personality. No required params — just call it.
- **`analyze_trade`** — evaluates trade offers by searching each player by name, fetching season stats, and comparing net category impact across G / A / +\- / PIM / SOG / PPP / W / GAA / SV%. Returns a full category breakdown and an `ACCEPT` / `DECLINE` / `PUSH` verdict with chirp commentary. GAA handled as lower-is-better.
- Tool count: 18 → 20. Both tools registered in `tool-metadata.ts` with full Semantic Anchoring Governance markers.

### Changed
- All devDependencies updated: `vitest` / `@vitest/ui` / `@vitest/coverage-v8` → 4.1.10, `typescript` → 7.0.2, `@types/node` → 26.1.1, `@cloudflare/vitest-pool-workers` → 0.18.8.
- Dependencies updated: `@modelcontextprotocol/sdk` → 1.29.0, `dotenv` → 17.4.2, `selfsigned` → 5.5.0, `agents` → 0.19.0.

---

## [3.0.0]

### Added
- **Template Pattern architecture** — analyses extend a shared `AnalysisTemplate`, standardizing how each intelligence tool produces output (`src/analyses/`, `src/template/`).
- **CHIRP intelligence layer** — semantic, personality-driven analysis on top of raw Yahoo data:
  - `ice` / `get_roster_transaction_recommendations` — the **ICE (Intent Chirp Engine)** roster-optimization advisor.
  - `get_streaming_recommendations` — schedule-aware waiver/streaming picks.
  - `get_games_in_hand` — schedule-advantage analysis.
  - `analyze_weekend_streams` — weekend streaming planner.
  - `governance_dashboard` — surfaces the Semantic Anchoring Governance markers across all tools.
- **Semantic Anchoring Governance** — every tool declares discovery tags, intent category, hockey context, and chirp style in `src/config/tool-metadata.ts`.
- **Personality modes** and configurable **chirp styles** (`src/config/`).

### Changed
- Real game-schedule detection now uses the public NHL API.
- Hardened Yahoo matchup parsing for Yahoo's dynamic JSON structures.

### Security
- Removed hardcoded credentials from the codebase; all secrets now come from `.env` / the MCP client `env` block. See [SECURITY.md](./SECURITY.md).

---

> Versions prior to 3.0.0 predate this changelog. 3.0.0 marks the first public,
> open-source release with the CHIRP intelligence + Template Pattern architecture.
