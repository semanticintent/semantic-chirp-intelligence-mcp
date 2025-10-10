/**
 * 🏛️ Domain Types - Semantic Chirp Intelligence MCP
 *
 * This file contains all core type definitions and interfaces for the
 * Yahoo Fantasy MCP with Template Method Pattern implementation.
 *
 * Organized by domain:
 * - Analysis Types
 * - Chirp Intelligence
 * - Yahoo API Data
 * - Recommendations
 * - Responses
 */

// ==========================================
// 🎯 Analysis Request & Configuration Types
// ==========================================

/**
 * Analysis type identifiers
 * Maps to concrete analysis implementations
 */
export type AnalysisType =
  | 'ice_roster'
  | 'streaming_recommendations'
  | 'games_in_hand'
  | 'weekly_matchup';

/**
 * Chirp personality modes
 * Defines the voice and focus of chirp intelligence
 */
export type PersonalityMode =
  | 'analytical'
  | 'roast_master'
  | 'championship_coach'
  | 'motivational';

/**
 * Chirp intensity levels
 * Controls tone and energy of responses
 */
export type ChirpIntensity =
  | 'gentle'
  | 'standard'
  | 'savage'
  | 'ice_cold';

/**
 * User intent categories
 * Inferred from request parameters
 */
export type UserIntent =
  | 'quick_status'
  | 'championship_optimization'
  | 'standard_analysis'
  | 'entertainment';

/**
 * Analysis options for specialized behavior
 */
export interface AnalysisOptions {
  readonly quick_check?: boolean;
  readonly strategy_type?: 'weekly' | 'weekend' | 'daily';
  readonly focus_categories?: string[];
  readonly time_horizon?: 'immediate' | 'week' | 'season';
}

/**
 * Complete analysis request
 * Contains all parameters needed to execute an analysis
 */
export interface AnalysisRequest {
  readonly analysis_type: AnalysisType;
  readonly personality_mode: PersonalityMode;
  readonly chirp_intensity: ChirpIntensity;
  readonly enable_chirp?: boolean;
  readonly options?: AnalysisOptions;
}

// ==========================================
// 🏒 Chirp Intelligence Types
// ==========================================

/**
 * 📚 ChirpParameters Interface:
 * Base interface for chirp behavior configuration. Represents the user-facing API
 * for controlling chirp intelligence behavior.
 *
 * Properties:
 * - chirp_intensity: Semantic descriptor of response tone/energy level
 *   Values map to semantic contexts: gentle (encouraging), standard (direct),
 *   savage (aggressive), ice_cold (championship enforcer)
 *   Governance: This is a semantic choice, not technical - drives tone generation
 *
 * - personality_mode: Semantic descriptor of chirp voice and focus
 *   Values map to semantic personas: analytical (data-driven), motivational
 *   (championship mindset), roast_master (entertainment), championship_coach (winning strategy)
 *   Governance: Determines semantic approach to commentary generation
 *
 * - enable_chirp: Semantic toggle for chirp intelligence layer
 *   Governance: When false, preserves raw data without semantic enhancement
 *   This is a semantic intent signal, not just a boolean flag
 */
export interface ChirpParameters {
  chirp_intensity?: ChirpIntensity;
  personality_mode?: PersonalityMode;
  enable_chirp?: boolean;
}

/**
 * 🏛️ SemanticChirpContract Interface:
 * Extended interface that adds semantic intent tracking and validation context.
 * Used internally to enforce Semantic Anchoring Governance Rule 2 (Intent Preservation).
 *
 * Additional Properties (readonly for immutability):
 * - semantic_intent: Tracks the origin and purpose of the chirp configuration
 *   "user_requested": User explicitly set these parameters (highest priority)
 *   "system_default": System-provided defaults (standard behavior)
 *   "tool_override": Tool-specific override (only valid within tool context)
 *   Governance: Ensures semantic intent is preserved through transformations
 *
 * - tool_context: The tool name that created this semantic contract
 *   Governance: Validates that tool_override intent matches actual tool context
 *   Prevents semantic contract violations across tool boundaries
 */
export interface SemanticChirpContract extends ChirpParameters {
  readonly semantic_intent?: "user_requested" | "system_default" | "tool_override";
  readonly tool_context?: string;
}

/**
 * Chirp context for generation
 * Contains all analysis data needed for contextual chirp generation
 */
export interface ChirpContext {
  readonly analysis_type: AnalysisType;
  readonly insights: AnalysisInsights;
  readonly recommendations: Recommendation[];
  readonly critical_issues: number;
  readonly user_intent: UserIntent;
  readonly is_ice_analysis?: boolean;
}

/**
 * Generated chirp response
 * Contains all chirp intelligence output
 */
export interface ChirpResponse {
  readonly tool_identity: string;
  readonly style: string;
  readonly personality: string;
  readonly intensity: ChirpIntensity;
  readonly semantic_context: string;
  readonly analysis_chirp: string;
  readonly intent_summary: string;
  readonly ice_cold_truth: string;
  readonly energy_level: string;
}

// ==========================================
// 🏒 Yahoo Fantasy Data Types
// ==========================================

/**
 * Yahoo API OAuth Token
 */
export interface YahooToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  expires_at?: number;
}

/**
 * Fantasy hockey player
 */
export interface Player {
  readonly player_id: string;
  readonly name: string;
  readonly position: string;
  readonly team: string;
  readonly status?: string;
  readonly selected_position?: string;
  readonly injury_note?: string;
  readonly percent_owned?: number;
  readonly trending?: string;
}

/**
 * Team roster
 */
export interface Roster {
  readonly team_key: string;
  readonly team_name: string;
  readonly players: Player[];
}

/**
 * Opponent data
 */
export interface OpponentData {
  readonly team_name?: string;
  readonly remaining_games?: number;
  readonly schedule?: any;
}

/**
 * Trending player with metadata
 */
export interface TrendingPlayer extends Player {
  readonly trending: 'add' | 'drop';
  readonly count: number;
}

/**
 * Team schedule information
 */
export interface TeamSchedule {
  readonly team_abbr: string;
  readonly games_this_week: number;
  readonly games_remaining: number;
}

/**
 * Weekly schedule information
 */
export interface WeeklySchedule {
  readonly week: number;
  readonly team_schedules: TeamSchedule[];
}

/**
 * Favorable team for streaming
 */
export interface FavorableTeam {
  readonly team_abbr: string;
  readonly games_count: number;
  readonly favorable_score: number;
}

/**
 * Streaming target with scoring
 */
export interface StreamingTarget extends Player {
  readonly streaming_score: number;
  readonly reason: string;
  readonly games_this_week?: number;
}

/**
 * Market intelligence summary
 */
export interface MarketIntelligence {
  readonly total_trending: number;
  readonly favorable_teams_count: number;
  readonly top_trending_team: string;
}

/**
 * Optimal timing recommendation
 */
export interface OptimalTiming {
  readonly pickup_day: string;
  readonly drop_day: string;
  readonly reasoning: string;
}

/**
 * Position weakness analysis
 */
export interface PositionWeakness {
  readonly position: string;
  readonly severity: 'critical' | 'moderate' | 'minor';
  readonly reason: string;
}

/**
 * Position counts summary
 */
export interface PositionCounts {
  readonly C: number;
  readonly LW: number;
  readonly RW: number;
  readonly D: number;
  readonly G: number;
  readonly bench: number;
  readonly ir: number;
}

// ==========================================
// 📊 Fantasy Data & Insights
// ==========================================

/**
 * Aggregated fantasy data fetched for analysis
 * Different analyses will populate different fields
 */
export interface FantasyData {
  readonly roster?: Roster;
  readonly opponent?: OpponentData;
  readonly availablePlayers?: Player[];
  readonly trendingPlayers?: TrendingPlayer[];
  readonly teamSchedules?: TeamSchedule[];
  readonly weeklySchedules?: WeeklySchedule[];
  readonly favorableTeams?: FavorableTeam[];
}

/**
 * Analysis insights extracted from fantasy data
 * Different analyses will populate different fields
 */
export interface AnalysisInsights {
  readonly immediate_issues?: number;
  readonly games_disadvantage?: number;
  readonly weak_positions?: PositionWeakness[];
  readonly position_counts?: PositionCounts;
  readonly favorable_teams?: FavorableTeam[];
  readonly streaming_targets?: StreamingTarget[];
  readonly market_intelligence?: MarketIntelligence;
  readonly games_advantage?: number;
  readonly favorable_players?: Player[];
  readonly optimal_timing?: OptimalTiming;
}

// ==========================================
// 💡 Recommendations
// ==========================================

/**
 * Recommendation priority levels
 */
export type RecommendationPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Recommendation action types
 */
export type RecommendationAction =
  | 'pickup'
  | 'drop'
  | 'move_to_ir'
  | 'bench_upgrade'
  | 'volume_play'
  | 'lineup_change';

/**
 * Actionable recommendation
 */
export interface Recommendation {
  readonly priority: RecommendationPriority;
  readonly action: RecommendationAction;
  readonly player?: Player;
  readonly pickup?: Player;
  readonly drop?: Player;
  readonly reasoning: string;
}

// ==========================================
// 📤 Analysis Response
// ==========================================

/**
 * Analysis metadata
 */
export interface AnalysisMetadata {
  readonly analysis_type: AnalysisType;
  readonly tool_identity?: string;
  readonly generated_at: string;
  readonly tool_tags: string[];
  readonly intent_category: string;
  readonly chirp_energy: string;
  readonly hockey_wisdom_level: string;
  readonly semantic_depth: string;
}

/**
 * Complete analysis response
 * Returned by all analysis implementations
 */
export interface AnalysisResponse {
  readonly analysis_insights: AnalysisInsights;
  readonly recommendations: Recommendation[];
  readonly chirp_intelligence: ChirpResponse;
  readonly metadata: AnalysisMetadata;
}
