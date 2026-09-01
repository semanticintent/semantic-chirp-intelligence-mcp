/**
 * Tool Metadata Configuration
 *
 * Semantic Anchoring Governance markers for all tools
 */

export const TOOL_METADATA: Record<string, any> = {
  get_team_roster: {
    chirp_style: "analytical_assessment",
    discovery_tags: ["roster", "lineup", "players", "status", "team"],
    intent_category: "team_assessment",
    hockey_context: "roster_analysis",
    chirp_potential: "roster_weaknesses"
  },
  get_league_standings: {
    chirp_style: "competitive_reality",
    discovery_tags: ["standings", "league", "competition", "rankings", "position"],
    intent_category: "league_awareness",
    hockey_context: "competitive_landscape",
    chirp_potential: "standings_truth"
  },
  get_current_matchup: {
    chirp_style: "matchup_assessment",
    discovery_tags: ["matchup", "opponent", "week", "competition", "stats"],
    intent_category: "weekly_strategy",
    hockey_context: "head_to_head_battle",
    chirp_potential: "matchup_reality"
  },
  get_games_in_hand: {
    chirp_style: "strategic_advantage",
    discovery_tags: ["schedule", "advantage", "games", "strategy", "matchup"],
    intent_category: "competitive_intelligence",
    hockey_context: "schedule_warfare",
    chirp_potential: "schedule_domination",
    // 🆕 Template Pattern Metadata
    uses_template_pattern: true,
    analysis_class: "GamesInHandAnalysis",
    template_version: "1.0.0",
    analysis_type: "schedule_advantage"
  },
  get_streaming_recommendations: {
    chirp_style: "opportunity_hunter",
    discovery_tags: ["pickups", "waivers", "streaming", "schedule", "trends"],
    intent_category: "acquisition_strategy",
    hockey_context: "waiver_wire_mastery",
    chirp_potential: "pickup_strategy",
    // 🆕 Template Pattern Metadata
    uses_template_pattern: true,
    analysis_class: "StreamingAnalysis",
    template_version: "1.0.0",
    analysis_type: "streaming_strategy"
  },
  get_roster_transaction_recommendations: {
    chirp_style: "ice_cold_truth",
    discovery_tags: ["optimization", "ICE", "championship", "decisions", "transactions"],
    intent_category: "ultimate_advisor",
    hockey_context: "league_domination",
    chirp_potential: "brutal_optimization",
    is_ice_engine: true,
    tool_semantic_identity: "ICE - Intent Chirp Engine",
    // 🆕 Template Pattern Metadata
    uses_template_pattern: true,
    analysis_class: "IceAnalysis",
    template_version: "1.0.0",
    analysis_type: "ice_roster"
  },
  get_weekly_stats: {
    chirp_style: "performance_review",
    discovery_tags: ["stats", "weekly", "performance", "matchup", "analysis"],
    intent_category: "performance_tracking",
    hockey_context: "stat_battle",
    chirp_potential: "weekly_performance"
  },
  compare_matchup: {
    chirp_style: "head_to_head_analysis",
    discovery_tags: ["comparison", "matchup", "opponent", "strategy", "categories"],
    intent_category: "tactical_analysis",
    hockey_context: "category_warfare",
    chirp_potential: "matchup_insights"
  },
  optimize_lineup: {
    chirp_style: "lineup_optimization",
    discovery_tags: ["lineup", "optimization", "active", "bench", "strategy"],
    intent_category: "daily_management",
    hockey_context: "lineup_strategy",
    chirp_potential: "lineup_fixes",
    // 🆕 Template Pattern Metadata
    uses_template_pattern: true,
    analysis_class: "LineupAnalysis",
    template_version: "1.0.0",
    analysis_type: "lineup_optimization"
  },
  search_players: {
    chirp_style: "player_discovery",
    discovery_tags: ["search", "players", "available", "free_agents", "discovery"],
    intent_category: "player_research",
    hockey_context: "talent_scouting",
    chirp_potential: "player_insights"
  },
  get_player_stats: {
    chirp_style: "player_evaluation",
    discovery_tags: ["stats", "player", "performance", "evaluation", "analysis"],
    intent_category: "player_analysis",
    hockey_context: "individual_assessment",
    chirp_potential: "player_reality"
  },
  get_trending_players: {
    chirp_style: "trend_hunting",
    discovery_tags: ["trends", "hot", "cold", "momentum", "pickups"],
    intent_category: "market_intelligence",
    hockey_context: "waiver_trends",
    chirp_potential: "trend_opportunities"
  },
  chirp_opponent: {
    chirp_style: "savage_trash_talk",
    discovery_tags: ["opponent", "chirp", "trash_talk", "weaknesses", "rivalry"],
    intent_category: "psychological_warfare",
    hockey_context: "head_to_head_dominance",
    chirp_potential: "opponent_destruction"
  },
  schedule_value: {
    chirp_style: "strategic_advantage",
    discovery_tags: ["draft", "schedule", "playoff_weeks", "games_per_week", "tiebreaker"],
    intent_category: "draft_intelligence",
    hockey_context: "schedule_warfare",
    chirp_potential: "schedule_domination",
    // 🆕 Template Pattern Metadata
    uses_template_pattern: true,
    analysis_class: "ScheduleValueAnalysis",
    template_version: "1.0.0",
    analysis_type: "schedule_advantage"
  },
  chirp_draft_pick: {
    chirp_style: "ice_cold_truth",
    discovery_tags: ["draft", "pick", "ADP", "value", "roster_build"],
    intent_category: "draft_intelligence",
    hockey_context: "draft_day_decisions",
    chirp_potential: "draft_reality",
    is_ice_engine: true,
    tool_semantic_identity: "ICE - Intent Chirp Engine (Draft)",
    // 🆕 Template Pattern Metadata
    uses_template_pattern: true,
    analysis_class: "DraftPickAnalysis",
    template_version: "1.0.0",
    analysis_type: "draft_pick"
  },
  analyze_trade: {
    chirp_style: "trade_verdict",
    discovery_tags: ["trade", "analysis", "value", "categories", "decision"],
    intent_category: "trade_intelligence",
    hockey_context: "roster_maneuvering",
    chirp_potential: "trade_reality"
  }
};
