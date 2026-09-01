# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
