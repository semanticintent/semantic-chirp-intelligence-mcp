# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.10.4] — directory policy

### Fixed
- **Tool descriptions no longer refer to other tools or files.** The Claude directory requires descriptions with no
  instructions about other tools and no external instruction sources. `chirp_draft_pick` told the model to use
  `draft_kit` first; `read_ice`, `set_opponent_roster` and a `chirp_draft_pick` parameter pointed at `set_roster`
  (hidden on the hosted endpoint); `read_ice` named a schema file; `get_streaming_recommendations` named
  `analyze_goalie_streams`. Each now describes only itself. A test fails if any description names another tool or
  carries invisible or control characters.

## [4.10.3] — seventh review

A seventh test through Claude, against 4.10.2. The new descriptions matched the tools; this fixes the leftovers.

### Fixed
- **`ice` / `get_roster_transaction_recommendations` filled a pickup list from one club** — four PHI skaters. Pickups
  are now capped across the whole list at two skaters and one goalie per club, as streaming already was.
- **Goalie lists named two goalies from one club**, whose expected starts then added up to more than the club's games.
  `analyze_goalie_streams` and goalie results in `get_streaming_recommendations` list only the best goalie per club,
  and the method says so.
- **`search_players`** returned `on_your_roster` while its schema offered no roster. It now takes `roster_text` (the
  server already honoured it), and the note says how to mark your players.
- **Candidate lines for ambiguous names said `COL L`**; they say LW / RW everywhere now, from one shared helper.
- **Schema text:** `get_player_stats`' example is an unambiguous "Cale Makar"; `analyze_weekend_streams` date examples
  are 2026, `team_needs` says what it actually does, and `min_upside_score` no longer claims a higher bar gives "more
  genuine opportunities" — it returns fewer candidates.

## [4.10.2] — tool descriptions

The descriptions are what a client — and the Claude directory — shows for each tool. Several had drifted from what the
tools do. No behaviour changes.

### Fixed
- `analyze_goalie_streams` said goalies are "ranked by games in the window"; they are ranked on the stated stream score
  (expected starts, opposing attack, save %). It now says so, and mentions `assume_rostered`.
- `search_players` promised "available players (free agents)"; it searches every NHL player, ranked on last season.
- `get_player_stats` said it needs a player ID; it has taken names since v4, and its parameter hint now says so.
- `analyze_weekend_streams` described ">2 week upside" and a "binary decision tree"; it now states what genuine,
  monitor and desperation actually mean.
- `get_streaming_recommendations`, `get_games_in_hand`, `compare_matchup`, `optimize_lineup`, `chirp_opponent` and
  `chirp_draft_pick` now describe what they compute — the goalie score, hold vs. stream, the games-this-week term,
  the actual lineup checks, the idle / light / IR groups, and the need weight that grows over the first three rounds.

## [4.10.1] — sixth review

A sixth test of every hosted tool through Claude, against 4.10.0. `assume_rostered` worked on all six tools and every
4.10.0 fix held; this fixes the goalie and draft-need findings.

### Fixed
- **Three tools, three goalie orders.** `ice` / `get_roster_transaction_recommendations` ranked goalies their own way —
  suggesting .877 and .883 goalies, two from one club (who split its starts), each with a negative `points` standing in
  for a rank. One shared `goalieScore` (expected starts, opposing attack, save %) now drives `analyze_goalie_streams`,
  `get_streaming_recommendations` and `ice`; `ice` offers at most one goalie per club, carries no `points` for goalies,
  and its reasons give expected starts and the stream score.
- **Tiny samples topped the save % scale.** A goalie with five games was ranked at the 100th save % percentile. The
  percentile now applies only to goalies with 20+ games, as the method already said; others count as 50.
- **`analyze_goalie_streams` limits** said candidates are "every goalie not on the roster you pasted" even with
  `assume_rostered`; they now say which top of the board was left out.
- **A stated need beat elite players at the top of the draft.** At pick 3 with a G need, `chirp_draft_pick` made a
  goalie CRITICAL over Kucherov. The need weight now fades in over the first three rounds (full from pick 36), and a
  player flagged REACH is listed after every non-reach and never above LOW.
- **`schedule_value` ignored `enable_chirp: false`.** It now returns no chirp when asked not to.
- **`analyze_trade` called a 4–3 category loss "a donation".** A one-category margin now reads as the close call it is,
  either way.
- **`draft_kit`** listed a player among playoff schedule winners and decline risks without saying so; schedule winners
  now carry `also_decline_risk: true` when both apply.

## [4.10.0] — assume_rostered, fifth review

A fifth test of every hosted tool through Claude, against 4.9.3. Every 4.9.3 fix held and nothing blocked submission;
this adds the option the reviews kept pointing at and clears what was left.

### Added
- **`assume_rostered`** on the pickup tools (`ice`, `get_roster_transaction_recommendations`,
  `get_streaming_recommendations`, `analyze_weekend_streams`, `analyze_goalie_streams`, `analyze_breakout_players`).
  League ownership is private, so without it these tools suggest stars who are certainly taken. Pass a number — e.g.
  150 for a 12-team league — and the top N on the draft board (skaters by last season's points, a goalie every sixth
  slot; the same board `chirp_draft_pick` uses) are treated as rostered for that call. Off by default. When applied,
  the result carries `assume_rostered: { count, note }` saying it is an assumption, not ownership data.

### Fixed
- **The two goalie tools disagreed.** `get_streaming_recommendations` with G left out opponent attack strength, so it
  led with a goalie facing two strong offences while `analyze_goalie_streams` led with another. Both now use the same
  score (expected starts, opposing attack, save %), and name the same goalie first.
- **`read_ice` start, sit and bench calls ignored production.** They ranked on games alone: a 0.28 P/gm depth winger
  was "enough to start" and a 1.1-projected star with one game was the soft spot. Calls now rank on projected points
  (points per game × games). A start needs two or more games, a projection at least the lineup median, and no bench
  player projecting more; the sit and "your bench has…" take compare projections, and say them.
- **`ice` named G as a weak position and suggested no goalie** — its pickup pool held skaters only. Goalies, in the
  shared goalie order, are now offered when G is weak or asked for.
- **`schedule_value`** could leave a favoured club out of both lists. Every favoured club is now in `best_schedules`.
- **`draft_kit`** listed a player as a target and in `decline_risk` at once. Targets now exclude decline risks.
- **Wording:** `get_games_in_hand`'s ahead-case chirp said "Time to capitalize… and improve your game" next to a `hold`
  call — it now says keep every slot filled. A goalie pick is "the Nth player on the board", not "best producer".
  `get_team_roster`'s `selected_position` says LW/RW, not L/R. Weekend results omit an empty `fit_reason`.

## [4.9.3] — fourth review

A fourth test of every hosted tool through Claude, against 4.9.2. All ten 4.9.2 fixes held; this fixes what it found
next.

### Fixed
- **`chirp_draft_pick` never suggested a goalie**, even with `roster_needs: ["G"]`. Its board was one list sorted on
  points for skaters and wins for goalies, so no goalie reached the candidates. The board is now skaters by points with
  goalies — in the shared goalie order `draft_kit` and `search_players` use — one every six slots (about two goalies to
  ten or twelve skaters), and a goalie's slot is described as "on the board", not "best producer".
- **`schedule_value` could put a club it recommends targeting in `worst_schedules`**, and its chirp called that club
  "the one you draft around". Favoured clubs never appear among the worst; when every club asked about is favoured the
  chirp says so. "1 weeks" is now "1 week".
- **`analyze_weekend_streams` called 142 of 200 players "genuine"** after 4.9.2's rescale, including one-game weekends,
  with "Genuine: Speculative opportunity" as the reason and a fixed placeholder as the drop. Genuine now needs two or
  more games in the window, a real role and real production (each 50+ of 100) at low risk; desperation is a small role
  or little production. Reasons are the facts (games, minutes, shots, power-play goals). A drop is named only from the
  roster you pasted, and only a player producing under 70% of the candidate's rate. The chirp no longer calls streams
  "season savers" and says the best of them are probably rostered.
- **`get_roster_transaction_recommendations` ignored `target_positions`** (asked for RW, returned a C and a D) and its
  own weak positions. Its weak-position fixes read a list empty since v4; both paths now draw from one pool of players
  on neither roster, filtered to the positions you asked for, else your weak ones.
- **`get_streaming_recommendations` ranked goalies on club games alone**, putting an .877 goalie near the top. Goalies
  are now ordered on `analyze_goalie_streams`' score — expected starts (club games × last season's start share) and
  save % percentile — and the reasoning shows both.
- **`get_games_in_hand` labelled advice inconsistently with `ice`**: behind is now `volume_play` (add games), ahead is
  `hold` (keep what you have).
- **Pasted standings with a header row** ("Team W-L-T") no longer turn the header into a team, and rows pasted without
  numbers are ranked in the order given.
- **`search_players` said "L" / "R"**; it now says LW / RW like every other tool.
- **`read_ice` ended every light week with "That's the whole problem."**, including players it tells you to start. That
  line is now only for a player it sits.

### Changed
- `npm run correctness` checks `ice` when behind by pasting a one-player roster against the five-player test roster,
  instead of skipping it before the season.

## [4.9.2] — third review

A third test of every hosted tool through Claude, against 4.9.1. The 4.9.1 fixes to `ice`'s sign, `schedule_value` and
the fallback chirp held; this fixes what it found next — including one thing 4.9.1 claimed and did not do.

### Fixed
- **`ice` still named nobody when you were behind.** 4.9.1 said it now names real volume candidates; in practice it
  didn't, because it only considered players whose clubs play three or more games, and a short window rarely has any.
  It now takes the clubs with the most games in the window, whatever that number is, and names their best producers —
  and the chirp leads with the edge and the names ("Close it with volume: …"). When you are ahead it says to keep a full
  lineup rather than suggesting pickups.
- **`get_games_in_hand` gave the advice backwards**: ahead, it said to stream; behind, to protect. Ahead now says keep
  every slot filled; behind says stream the busiest clubs. The `read_ice` games-in-hand line follows.
- **`read_ice` contradicted itself**: it listed a player under `sit` while its own take said "Nobody on the bench beats
  him, so live with it." A sit call is now made only when a bench player has the better schedule; otherwise the soft
  spot is named in the take and nobody is sat.
- **Broken chirp sentences** in `get_games_in_hand`, `get_streaming_recommendations` and others: a personality phrase
  spliced onto a fragment ("Elite players the schedule advantage situation.", "The data shows 5 streaming
  opportunities on the wire."). Every fallback is now a whole sentence. `get_games_in_hand`'s tone-specific lines never
  fired at all — they checked for 'you' / 'opponent' and the tool sends a number — and now do. "On the wire" and
  "better than what you've got" are gone: league ownership is unknown.
- **Pasted names that matched nobody vanished.** A misspelt or ambiguous line was dropped and the analysis ran on a
  shorter roster without saying so. Tools given `roster_text` / `opponent_text` now return `roster_not_matched`,
  naming each line and why (or the candidates, for an ambiguous one).
- **`draft_kit` ignored a small `max_per_position`**: anything under 5 was raised to 5. It is now honoured.
- **`analyze_goalie_streams` ignored how well a goalie stops the puck**: a .880 goalie with a busy week outranked a
  .920 one with the same week. The stream score now includes last season's save % as a percentile of the league's
  starters (55% expected starts, 25% opposition, 20% save %), and the method says so.
- **`analyze_weekend_streams` could never find a "genuine" play**, and crashed without a roster. Its upside score mixed
  points per game ×10 with raw minutes, topping out near 25 against a bar of 55–60. Production and usage are now each
  scored 0–100 on the same scales as `analyze_breakout_players` (goalies on save % and share of starts); players with
  no games in the window are left out; the custom chirp now actually reaches the output, including a plain message when
  the window has no games.

### Known limitation
- Pickup suggestions (`ice`, streaming, weekend streams) can name stars who are certainly rostered in your league.
  League ownership is private; these are candidates to check, and the output says so.

## [4.9.1] — second review

A second test of every hosted tool through Claude, against 4.9.0. All of 4.9.0's fixes held; this fixes what it found next.

### Fixed
- **`ice` reported your advantage as a deficit.** Its `games_disadvantage` field held *your games minus your opponent's*,
  so a +6 edge read as a six-game deficit — the opposite of the right advice, in the flagship tool. It now reports a
  `schedule_edge` with `your_games`, `opponent_games`, a signed `advantage` (positive favours you) and a plain-English
  `reading`. The behind-on-games branch was rewired to draw from the real player pool; *correction in 4.9.2: it still
  named nobody in practice — see 4.9.2.*
- **`schedule_value` contradicted itself for a short team list.** With three clubs, all three appeared as both best and
  worst, and a club whose own verdict said "break the tie the other way" was recommended as a HIGH-priority target
  because of its place in the list. Best and worst no longer overlap, and each recommendation follows its club's verdict:
  `target` for a favourable schedule, `fade` for a light one.
- **`optimize_lineup` (and any tool without its own chirp) produced spliced template text**: "The data shows the data
  patterns. Time to taking action based on these insights. and improve your game". The fallback now writes whole
  sentences about the result.
- **`search_players` and `draft_kit` disagreed on the best goalie** — one ranked on wins, the other on a blend. Both now
  use one shared ranking (`src/domain/goalie-rank.ts`). A search across all positions also no longer sorts goalies' wins
  against skaters' points; goalies are listed separately.
- **`get_streaming_recommendations` could be filled by one club.** Ranking games-first let five depth players from the
  only three-game club take every slot. At most two candidates now come from any one club.
- **A goalie-only `draft_kit` recommended skaters.** Signals and recommendations now follow the positions asked for.
- **"The next seven days" started from the UTC date**, which rolls over at 8 pm Eastern in summer, so a player's game count
  could change between two runs an hour apart. Dates now follow the NHL's Eastern calendar.
- `chirp_opponent` said "3 more play only once or twice" when nothing came before them.
- `analyze_breakout_players` reported its analysis type as `streaming_recommendations`.

### Changed
- `governance_dashboard` states the scope of its counters. On the hosted endpoint they describe one short-lived instance,
  not the connector's traffic.

### Removed
- A dead legacy copy of the roster-transaction logic in `tools.ts`, and four helpers only it used. Both `ice` and
  `get_roster_transaction_recommendations` run `IceAnalysis`, which is why the review found their output identical.

### Tests
- Eight new correctness tests, each failing against 4.9.0. `npm run correctness` also checks ICE's edge against
  games-in-hand and that the two goalie rankings agree.

---

## [4.9.0] — correctness pass

A test of every hosted tool through Claude read the answers rather than checking that they arrived, and found output
that was untrue. Every tool had passed `npm run smoke`, which only checks that something comes back. This release fixes
what it found and adds tests that check content.

### Fixed
- **Invented facts presented as findings.** `analyze_weekend_streams` and `analyze_breakout_players` produced catalysts
  such as "Top-6 linemate upgrade", "Top-6 center opportunity" and "PP1 role lock". Line assignments and power-play units
  are not published by the NHL, so none of these was known. Every such claim is gone; reasons are now the numbers
  themselves — games in the window, minutes, shots, power-play goals.
- **`analyze_breakout_players` rebuilt.** Its age filter was never applied (the code read "in real implementation, would
  filter by age"), so 31- and 33-year-olds came back as "must add" breakouts; scores could exceed 100; projections were
  flat at 1.0; "team strength" came from a hardcoded list of ten clubs; and `favorable_teams` held position averages. It
  now scores skaters at or under the age cap on production, ice time, shot volume, conversion upside against a league
  shooting rate computed from the same season's data, and youth — each component 0–100, with a small-sample penalty.
- **`draft_kit` goalies.** Built from production, the board sorted wins and points on one scale and gave one overall rank,
  so every goalie sat around 200th with "0 points per game". Skaters and goalies are now ranked separately, and goalies
  on a blend of wins, save percentage and GAA among starters — wins alone are largely a team statistic. Goalies show a
  goalie line instead of points per game.
- **Unknown ownership read as a value.** With league ownership unknowable since v4, `get_streaming_recommendations`
  reported "low ownership (undefined%)", described every player — MacKinnon included — as a "deep league sleeper", and
  the weekend classifier added an "unproven" risk penalty to every player. Ownership no longer enters any score or reason.
- **`analyze_weekend_streams` "TOI" was not ice time.** It was a synthetic 0–25 score, which is why it disagreed with the
  minutes in the same response. It is now the real minutes per game.
- **`get_streaming_recommendations` ignored `position_filter`**, and its chirp read "0 streaming opportunities" above a
  list of five.
- **`get_league_standings` could never succeed on the hosted endpoint**, and its error pointed to a tool that is not
  offered there. It now accepts `standings_text`.
- **`chirp_opponent` double-counted**: a player with no games was also counted as "on two games or fewer", and an IR
  player on an idle club was counted twice. The groups are now disjoint.
- `read_ice` cited the roster season as its statistics season.

### Added
- **`minutes_per_game`** on every stat line, beside the NHL's raw `time_on_ice_per_game` seconds. (Player cache schema v5.)
- **`tests/correctness.test.ts`** — assertions on content: no invented roles or unknown values in any tool's output,
  breakout ages within the cap, scores within range, goalies ranked among goalies, filters applied, groups disjoint.
  Run against the previous release it fails 13 of its 14 tests.
- **`npm run correctness`** — the same checks against a live endpoint.

### Changed
- `analyze_weekend_streams` no longer offers `ownership_max`, which could not do anything.
- `read_ice`'s `start` list remains the two strongest schedule edges in the window, not a full lineup — a star on a club
  with fewer games that week will not appear there.

---

## [4.8.2]

### Added
- **The hosted connector serves its icon.** Claude and its connector directory take a connector's icon from the
  server's own URL; `chirp-mcp.semanticintent.dev` answered every icon path with a 404, so the connector would have
  shown a generic placeholder throughout Claude whatever the directory listing carried. The helmeted cormorant is now
  served as a 192×192 PNG at `/favicon.ico`, `/favicon.png`, `/icon.png` and `/apple-touch-icon.png`, and the root
  returns a small page declaring it for fetchers that read HTML.

---

## [4.8.1]

Directory readiness for the hosted connector at `chirp-mcp.semanticintent.dev/mcp`. No change to any analysis.

### Added
- **Every tool now carries a `title` and a safety hint.** The Claude directory requires both on every tool and flags
  any that lack them; all 24 lacked both. Twenty tools only read and are marked `readOnlyHint: true`. The four
  store-backed tools (`set_roster`, `set_opponent_roster`, `set_standings`, `show_stored_data`) overwrite or clear the
  locally saved roster, so they are marked `readOnlyHint: false, destructiveHint: true`. A tool added without a title
  now fails at startup rather than shipping unlabelled.

### Changed
- **The hosted endpoint lists 20 tools, not 24.** On the stateless Worker the four store-backed tools can only refuse,
  so they are no longer offered there — a user browsing the listing should never see a tool that cannot succeed. The
  local server still lists all 24. A client that calls one anyway still gets the same refusal with instructions.
- **`/mcp` has its own rate limit.** Previously one per-address budget of 60 requests/minute covered every POST. That
  suits Sepiola, whose callers are individual browsers — but hosted MCP clients such as claude.ai call remote
  connectors from their own servers, so every one of their users can arrive from the same few addresses and would have
  shared one 60/minute budget. `/mcp` now has a separate 1,500/minute ceiling (`MCP_LIMIT`) meant as an abuse guard, not
  a per-user quota; the NHL data behind it is cron-cached in KV, so a call costs CPU rather than upstream requests.
  `/read` and `/board` keep the per-viewer limit. A limited MCP call returns a JSON-RPC error rather than a bare body.

### Removed
- `findCurrentMatchup`, dead Yahoo-era code with no callers that logged matchup contents.

---

## [4.8.0]

### Added
- **Rank for your league's categories.** `draft_kit`, `chirp_draft_pick` and
  `POST /board` take `categories`, pasted as your platform lists them
  (`G, A, +/-, PPP, SOG, HIT, BLK; W, GAA, SV%, SO`, or the settings page's
  "Goals (G)" form). Each player is measured per category against the league —
  per game for skaters, season totals for goalie counting categories, GAA and
  SV% weighted by starts, 20-game minimum, each capped at ±3 so a rare stat
  cannot decide a player — and ranked by the sum, each
  category counting once as in a matchup. Each prospect carries its category
  line ("A +3.3 · PPP +2.5 · SOG +1.7"); the board carries `scoring` (what it
  ranked for, labels it could not read, the method). Points stay the default.
- **Every category a league scores:** hits, blocks, power-play points,
  shorthanded points, faceoff wins and goalie games started, from the NHL's
  league-wide stats service (four requests).
- `draft_kit` tiers carry each player's NHL `id`.

### Fixed
- **Fantasy playoff weeks were a week early.** Week 1 was counted from the
  Monday of the opener's week, so when the season opens mid-week (2026-27:
  Tuesday September 29) every later week started seven days early and
  playoff-window game counts scored the wrong week. Week 1 now opens with the
  season and a short opening week is folded into it, as Yahoo counts it:
  2026-27 weeks 25–27 are March 22 – April 11, matching a real Yahoo league's
  settings. One rule (`NhlScheduleService.fantasyWindow`) now serves
  `schedule_value`, `draft_kit` and `chirp_draft_pick`.
- **Traded players carried only part of their season.** Lines came from each
  club's stats, so a player traded mid-season counted only his games with his
  current club (Quinn Hughes: 48 games and 53 points instead of 74 and 76; 81
  players last season). Lines are now whole seasons. If the league-wide
  service is down, club lines stand, the gap is reported, and nothing is cached.

## [4.7.1]

### Fixed
- **The board's count missed drafted players outside its columns.** A drafted
  player who resolves but is not in the board's tiers (a short last season, a
  depth pick) was crossed off nowhere and counted nowhere, so "3 off the
  board" could follow four names. The take now counts him ("4 off the board,
  1 of them below the columns.") and the notes name him. `taken` still counts
  the struck-through cards.

## [4.7.0]

### Added
- **The board answers who to take next.** `POST /board` accepts `mine_text`
  (your own picks) and, given it, runs `chirp_draft_pick` against the draft so
  far and adds a `pick` section: the pick on the clock, the positions you still
  need, the analyst's one line, and its top three with a reason each and
  whether each sits on the board's columns. Your picks count as drafted.
  `playoff_start_week` / `playoff_end_week` pass through to the pick. The
  shape is Sepiola's `contracts/board.schema.json` (`pick`, optional).
- `chirp_draft_pick` returns `take`: its line without the advice to the caller.

### Fixed
- Draft pick reasoning said "1 slots".
- **`chirp_draft_pick` described a Yahoo tool.** Its description said it read
  Yahoo's ADP and Yahoo draft results, and its per-player reasoning printed
  "no Yahoo ADP available" or "N picks past his ADP". v4 reads no platform: the
  board is last season's production, and the reasoning now says so — "11th best
  producer, 6 slots below this pick". The description also says when to use it
  (the pick in front of you) versus `draft_kit` (the whole board).
- **`schedule_value` said it read your Yahoo league settings.** It takes the
  playoff weeks from you; the description, parameter text and the no-window
  note now say that.

### Removed
- ~130 lines of unreachable Yahoo JSON parsing in `DraftPickAnalysis`.

## [4.6.0]

### Added
- **`analyze_goalie_streams`** — the first of the three concept tools built on public
  data. Every NHL goalie ranked for a window: games, each opponent's attack (0
  weakest, 100 most dangerous, from standings goals-for), his share of his team's
  games last season, GAA, save % and a stream score whose formula is in the output.
  Paste `roster_text` to see your goalies apart from the candidates. It says what it
  cannot know: starters are not announced in public data, and before opening night
  opponent strength is last season's final standings. 24 tools.
- **`skater.nights` on the read** — per day, the opponent, home or away, and how hard
  that night is for this player (attack for a goalie, defence for a skater). Goalie
  reasons now count soft nights. Contract re-vendored; the field is optional.
- Team strength carries `goals_for_per_game` and `attack` beside the defence rating.
- **`POST /board`** — the draft board a screen can draw (`src/services/BoardService.ts`):
  `draft_kit`'s tiers per position with NHL ids, one note per prospect, players in
  `drafted_text` crossed off (unresolved lines reported in `notes`), where each position
  thins out, and what the board cannot know. Stateless; validates against Sepiola's
  `contracts/board.schema.json`. `/health` lists it.



### Added
- **`games_in_hand.detail` and `games_in_hand.counted`** — both rosters as the analyst
  counted them (per skater: games, back-to-back, projected points) and a sentence saying
  who is counted, so a screen can open the comparison without doing any arithmetic.
- **`window.label`, `window.previous`, `window.next` on the read** — the window in
  words ("Sep 29 – Oct 5") and the first days of the adjacent windows, so a screen
  can say which week it shows and offer previous/next controls without formatting a
  date or doing arithmetic itself. Contract re-vendored (still 0.1; the fields are optional).

## [4.4.0]

### Added
- **A remote MCP face.** `POST https://chirp-mcp.semanticintent.dev/mcp` speaks the
  Model Context Protocol over Streamable HTTP — the same 23 tools as the stdio
  server, served by the same registry, from the same Cloudflare Worker that serves
  `/read`. Stateless: one server per request, JSON responses, no sessions, no
  accounts. `GET /health` reports it (`mcp: { endpoint, tools, stateless }`).
- **The roster travels in the call.** Every roster-dependent tool (`ice`,
  `get_games_in_hand`, `draft_kit`, `chirp_opponent`, `analyze_trade`, …) accepts
  `roster_text` and `opponent_text`. A pasted lineup stands in for the stored one
  for that call only — request-scoped, so concurrent callers never see each
  other's rosters. On the hosted endpoint this is how every call works; the
  `set_*` tools there refuse and say so. Locally nothing changes.
- **`src/tools.ts`, the tool registry.** The 23 definitions and their handlers,
  defined once; `src/index.ts` (stdio) and `src/edge.ts` (HTTP) both derive from it.
- **`CHIRP_DATA_DIR`** overrides where the stdio server keeps its store. Tests run
  against a throwaway directory and can no longer touch a real one.

### Changed
- `src/index.ts` is now a thin stdio entry; everything it used to inline lives in
  `src/tools.ts` and `src/server.ts`.

## [4.3.1]

### Fixed
- **A position pasted after a player's name is now his slot.** `Matvei Gridin LW`
  used to be slotted by the NHL's listing (RW); the paste's own position is the
  fantasy eligibility and wins. Initials such as `J.T.` are never read as positions.
  `read_ice` already preferred the pasted position when present.

## [4.3.0]

### Added
- **`chirp-edge`** — the analyst on Cloudflare Workers (`src/edge.ts`, `wrangler.jsonc`,
  `npm run edge:deploy`), so the telestrator page can read without a local server.
  Same core as the MCP server and `chirp-http`; stateless; CORS pinned by
  `CORS_ORIGIN`; a per-address rate limit; `AUTH_MODE` reserved for a Signet
  JWT check. The NHL's edge throttles shared egress addresses (429), so the
  96 club requests are never made on a viewer's clock: a cron warms KV every
  six hours, and a request that finds KV cold starts the warm-up in the
  background and answers 503 with `warming: true`.
- **A JSON cache interface** (`src/services/cache.ts`) behind both NHL services:
  disk for the CLI and MCP server (unchanged behaviour), KV for the Worker,
  memory for tests. Constructors still accept a directory; `setCache()` swaps it.
- **`nhlFetch`** — the one way to call the NHL API: a User-Agent, at most four
  requests in flight, two retries with backoff on 429 / 502 / 503 / 504.
- **The unavailable reason now says why.** "NHL player data unavailable for 5
  clubs" became "... (UTA: HTTP 429; ...)". It found the throttling in a minute.

### Changed
- `chirp-http` and `chirp-edge` share one request handler (`src/read-handler.ts`).
- `.env` is no longer loaded by `npm run edge:dev`; the retired Yahoo variables
  in a local `.env` must never reach a Worker.

## [4.2.0]

### Added
- **`read_ice`** — the read as a drawing, not a paragraph. One structured Read that
  a screen can render without forming an opinion of its own: per skater, the game
  bits for the window, back-to-back, a schedule value 0–100, a flag, a one-line
  reason, points per game and projected points; plus the start / sit / stream / IR
  calls, games in hand, the closing line for every replay, and the take. It
  validates against `contracts/read.schema.json`, the contract vendored from the
  telestrator ([semantic-chirp-telestrator](https://github.com/semanticintent/semantic-chirp-telestrator)),
  which is the first screen built for it.

  Real sources only: the NHL schedule for game bits and back-to-backs, club stats
  for production, club rosters for jersey numbers. When the schedule is
  unavailable the read is refused, not estimated. Lines from a paste that do not
  resolve are returned in `notes`, never dropped. `start` (YYYY-MM-DD) moves the
  window, so a week can be read ahead of time — or demoed before opening night.

  Two faces, one core:
  - **MCP tool `read_ice`** — pass `roster_text`, or omit it to use the roster set
    with `set_roster`. Returns the Read as text and as `structuredContent`.
  - **`chirp-http`** (`src/http.ts`, `npm run serve:http`) — a stateless
    `POST /read { roster_text, look_ahead_days?, opponent_text?, start? }` on
    `localhost:3200` with CORS, for the telestrator page. The roster travels in the
    request; nothing is stored. `GET /health` reports the loaded season.

- **`sweater_number` on every player**, from the NHL roster endpoint. The screen
  puts it on the jersey.

- **`contracts/read.schema.json`** with a drift test against a sibling checkout of
  the telestrator, and Ajv-backed validation of every `read_ice` output in tests.

### Changed
- **Player cache schema version 2 → 3** (for `sweater_number`). Old cache files
  are ignored, not misread.

## [4.1.0]

### Added
- **`draft_kit`** — positional tiers, a printable cheat sheet, and the flags that
  come from facts rather than forecasts. One engine, two entry points:

  - **called plain**, it builds the board from last completed season production
    (skaters ranked on points, goalies on wins, because those are not comparable)
  - **given `rankings`**, it keeps *that* order as the baseline and annotates it

  The second mode is the useful one. A published draft kit does the projection
  work, which ChirpIQX cannot; ChirpIQX adds what a published kit cannot know —
  the schedule during *your* playoff weeks.

  Signals, all computed from real data:
  - **playoff-window games** per club, against the weeks you name
  - **shooting-luck rebounds** — young, high shot volume, low conversion
  - **decline risk** — 33+ still carrying heavy minutes
  - **category specialists** — PIM and shot volume for niche leagues, plus
    goalies whose rate stats beat their win total
  - **tier breaks** per position, so you can see when a position dries up

  The response states plainly what it does **not** include: projections, ADP,
  line combinations, injuries, and league availability. Naming the gap is the
  point — the overlay mode exists precisely because those come from elsewhere.

- **`birth_date` on every player**, from the NHL roster endpoint, with
  `NhlStatsService.ageOf()`. Age drives the breakout and decline signals; it was
  available all along and did not need estimating.

### Fixed
- **The player cache is now schema-versioned.** Adding `birth_date` kept serving
  cached records without it until the TTL expired — silently, and looking exactly
  like the NHL does not publish birth dates. The cache filename now carries a
  schema version, so a shape change invalidates it immediately.

**Tools: 21 → 22. Tests: 135 → 153.**

---

## [4.0.4]

### Fixed
- **`chirp_draft_pick` silently ignored picks pasted from a draft board.** Entries
  in `already_drafted` were matched by stripping the string to alphanumerics, so a
  row copied out of a draft room — `1. (1) Connor McDavid EDM - C` — normalized to
  `11connormcdavidedmc` and never matched `connormcdavid`. Nothing was removed,
  yet `players_off_board` counted every line, so the tool reported success while
  continuing to recommend players who were already gone. On draft day that is the
  worst possible failure: confidently wrong, under a clock.

  `already_drafted` now runs through the same forgiving parser `set_roster` uses,
  resolving each line to an NHL player id. Pick numbers, clubs, positions and
  bracketed text around a name are all handled.

- **Lines that cannot be matched are now reported**, under `drafted_not_matched`,
  rather than counted as removed. An unmatched pick means a drafted player is
  still on your board, which is exactly what must not be hidden.

---

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
