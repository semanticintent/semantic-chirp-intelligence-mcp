# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
