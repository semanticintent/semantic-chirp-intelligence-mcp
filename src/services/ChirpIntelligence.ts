/**
 * 🏒 Chirp Intelligence Service
 *
 * Generates contextual hockey chirp commentary based on:
 * - Semantic chirp contracts (intensity, personality, intent)
 * - Tool metadata and semantic identity
 * - Analysis data and context
 * - Governance enforcement (immutability, validation)
 */

import type { SemanticChirpContract, ChirpIntensity, PersonalityMode } from '../domain/types.js';
import {
  GOVERNANCE_MONITOR,
  validateSemanticChirpContract,
  auditSemanticContract
} from '../domain/governance.js';
import { CHIRP_STYLES } from '../config/chirp-styles.js';
import { PERSONALITY_MODES } from '../config/personality-modes.js';
import { TOOL_METADATA } from '../config/tool-metadata.js';

export class ChirpIntelligence {
  /**
   * Generate chirp-enhanced analysis results
   *
   * @param toolName - Name of the tool generating the analysis
   * @param originalData - Raw analysis data to enhance
   * @param semanticContract - Chirp parameters with semantic intent
   * @returns Enhanced data with chirp intelligence layer
   */
  public static enhance(
    toolName: string,
    originalData: any,
    semanticContract: SemanticChirpContract
  ): any {
    // 🏛️ Governance: Validate semantic contract
    validateSemanticChirpContract(semanticContract, toolName);

    // 🏛️ Governance: Freeze contract to prevent violations
    const frozenContract = Object.freeze({ ...semanticContract });

    // 🔍 Audit immutability enforcement
    auditSemanticContract(frozenContract, toolName, "enforcement");

    // 🛡️ Protected contract with Proxy for runtime enforcement
    const protectedContract = this.createProtectedContract(frozenContract, toolName);

    // If chirp disabled, return original data
    if (protectedContract.enable_chirp === false) {
      return originalData;
    }

    const metadata = TOOL_METADATA[toolName];
    if (!metadata) {
      return originalData;
    }

    const chirpStyle = CHIRP_STYLES[protectedContract.chirp_intensity || 'standard'];
    const personality = PERSONALITY_MODES[protectedContract.personality_mode || 'analytical'];

    return {
      // Original data preserved
      ...originalData,

      // NEW: Chirp Intelligence Layer
      chirp_intelligence: {
        // 🎯 Semantic Anchoring (Rule 1): Use observable semantic property
        tool_identity: metadata.is_ice_engine
          ? metadata.tool_semantic_identity
          : `${toolName} with chirp intelligence`,
        style: chirpStyle.tone,
        personality: personality.voice,
        intensity: protectedContract.chirp_intensity || 'standard',
        semantic_context: metadata.hockey_context,

        // Dynamic chirp based on data
        analysis_chirp: this.generateContextualChirp(toolName, originalData, chirpStyle, personality),

        // Intent-driven one-liner
        intent_summary: this.generateIntentSummary(originalData, personality),

        // Hockey wisdom
        ice_cold_truth: this.generateICETruth(originalData, chirpStyle)
      },

      // Discovery metadata
      metadata: {
        tool_tags: metadata.discovery_tags,
        intent_category: metadata.intent_category,
        chirp_energy: chirpStyle.energy,
        hockey_wisdom_level: "ICE_tier",
        semantic_depth: "enhanced"
      }
    };
  }

  /**
   * Create protected contract with Proxy for immutability enforcement
   */
  private static createProtectedContract(
    frozen: SemanticChirpContract,
    toolName: string
  ): SemanticChirpContract {
    return new Proxy(frozen, {
      set() {
        GOVERNANCE_MONITOR.trackViolation({
          rule: "Rule 4 - Immutability Protection",
          severity: "error",
          tool_name: toolName,
          violation_type: "attempted_mutation",
          details: "Attempted to set property on immutable ChirpParameters"
        });
        throw new Error('🚨 Semantic contract violation: ChirpParameters are immutable after creation');
      },
      deleteProperty() {
        GOVERNANCE_MONITOR.trackViolation({
          rule: "Rule 4 - Immutability Protection",
          severity: "error",
          tool_name: toolName,
          violation_type: "attempted_property_deletion",
          details: "Attempted to delete property from immutable ChirpParameters"
        });
        throw new Error('🚨 Semantic contract violation: Cannot delete ChirpParameters properties');
      }
    });
  }

  /**
   * Generate contextual chirp based on tool's chirp potential
   */
  private static generateContextualChirp(
    toolName: string,
    data: any,
    chirpStyle: any,
    personality: any
  ): string {
    const metadata = TOOL_METADATA[toolName];

    if (!metadata) return "";

    switch (metadata.chirp_potential) {
      case "roster_weaknesses":
        return this.generateRosterChirp(data, chirpStyle, personality);
      case "schedule_domination":
        return this.generateScheduleChirp(data, chirpStyle, personality);
      case "brutal_optimization":
        return this.generateOptimizationChirp(data, chirpStyle, personality);
      case "weekly_performance":
        return this.generateWeeklyPerformanceChirp(data, chirpStyle, personality);
      case "pickup_strategy":
        return this.generatePickupStrategyChirp(data, chirpStyle, personality);
      default:
        return this.generateGenericChirp(data, chirpStyle, personality);
    }
  }

  private static generateRosterChirp(data: any, chirpStyle: any, personality: any): string {
    const injured = data.roster?.filter((p: any) => p.status && p.status !== "").length || 0;

    if (injured > 0 && chirpStyle.tone === "brutal_truth") {
      return `${chirpStyle.prefix} you've got ${injured} injured players mucking up your lineup. That's not championship material! ${chirpStyle.suffix}`;
    }

    if (injured > 0 && chirpStyle.tone === "encouraging") {
      return `${chirpStyle.prefix} moving those ${injured} injured players to IR to optimize your roster. ${chirpStyle.suffix}`;
    }

    if (injured > 0 && chirpStyle.tone === "championship_enforcer") {
      return `${chirpStyle.prefix} ${injured} injured players dragging down your roster. Champions handle their IR like pros. ${chirpStyle.suffix}`;
    }

    return injured > 0
      ? `${injured} player${injured === 1 ? ' is' : 's are'} flagged injured. Move them to IR if your league has the slots.`
      : 'Nobody on your roster is flagged injured.';
  }

  private static generateScheduleChirp(data: any, chirpStyle: any, personality: any): string {
    // get_games_in_hand sends a signed number (yours − theirs); older callers sent 'you' / 'opponent' with a separate
    // difference. Reading only the strings meant every branch below was skipped for the number.
    const signed = typeof data.advantage === 'number' ? data.advantage : null;
    const advantage = signed === null ? data.advantage : signed > 0 ? 'you' : signed < 0 ? 'opponent' : 'even';
    const diff = Math.abs(signed ?? data.games_in_hand_difference ?? 0);

    if (advantage === "opponent" && chirpStyle.tone === "brutal_truth") {
      return `${chirpStyle.prefix} your opponent has ${diff} more games than you and you're just sitting there? Time to drop the mittens and get aggressive! ${chirpStyle.suffix}`;
    }

    if (advantage === "you" && chirpStyle.tone === "championship_enforcer") {
      return `${chirpStyle.prefix} You've got ${diff} more games. This is where champions separate from the pretenders. ${chirpStyle.suffix}`;
    }

    if (advantage === "you" && chirpStyle.tone === "direct_honest") {
      // Ahead means hold: keep the lineup full. "Time to capitalize … and improve your game" read as a call to act.
      return `You have ${diff} more game${diff === 1 ? '' : 's'}. Keep every slot filled and let them work.`;
    }

    // Fallbacks are whole sentences: splicing a personality phrase onto a noun phrase read "Elite players the schedule
    // advantage situation."
    const games = (n: number) => `${n} more game${n === 1 ? '' : 's'}`;
    if (advantage === 'you' && diff > 0) return `You have ${games(diff)} than your opponent. Keep every slot filled.`;
    if (advantage === 'opponent' && diff > 0) return `Your opponent has ${games(diff)} than you. Stream the busiest clubs to close it.`;
    return 'Even on games. It comes down to who plays better.';
  }

  private static generateOptimizationChirp(data: any, chirpStyle: any, personality: any): string {
    const criticalIssues = data.immediate_issues || 0;
    const recommendations = data.recommendations?.length || 0;

    if (criticalIssues > 0 && chirpStyle.tone === "brutal_truth") {
      return `${chirpStyle.prefix} you've got ${criticalIssues} critical lineup issues and ${recommendations} ways to fix them. Stop window shopping and start dominating! ${chirpStyle.suffix}`;
    }

    if (criticalIssues === 0 && chirpStyle.tone === "championship_enforcer") {
      return `${chirpStyle.prefix} Your lineup is solid but ICE found ${recommendations} ways to push you over the top. ${chirpStyle.suffix}`;
    }

    if (recommendations > 5 && chirpStyle.tone === "direct_honest") {
      return `${chirpStyle.prefix} execute these ${recommendations} optimizations ${chirpStyle.suffix}`;
    }

    return recommendations === 0
      ? 'No lineup changes needed.'
      : `${recommendations} lineup change${recommendations === 1 ? '' : 's'} worth making, listed above.`;
  }

  private static generateWeeklyPerformanceChirp(data: any, chirpStyle: any, personality: any): string {
    const yourGames = data.games_in_hand?.your_remaining || 0;
    const oppGames = data.games_in_hand?.opponent_remaining || 0;

    if (yourGames > oppGames && chirpStyle.tone === "championship_enforcer") {
      return `${chirpStyle.prefix} You've got more games left - time to bury them. ${chirpStyle.suffix}`;
    }

    if (yourGames < oppGames && chirpStyle.tone === "brutal_truth") {
      return `${chirpStyle.prefix} they've got more games - every stat matters now! ${chirpStyle.suffix}`;
    }

    return `You have ${yourGames} game${yourGames === 1 ? '' : 's'} left; your opponent has ${oppGames}.`;
  }

  private static generatePickupStrategyChirp(data: any, chirpStyle: any, personality: any): string {
    const targets = data.streaming_targets?.length || 0;
    const hotTeam = data.market_intelligence?.top_trending_team || "unknown";

    if (targets > 10 && chirpStyle.tone === "championship_enforcer") {
      const focus = hotTeam !== 'unknown' ? ` Focus on ${hotTeam} players for maximum impact.` : '';
      return `${chirpStyle.prefix} ${targets} targets identified.${focus} ${chirpStyle.suffix}`;
    }

    if (targets > 10 && chirpStyle.tone === "brutal_truth") {
      return `${chirpStyle.prefix} ${targets} streaming candidates sitting there - are you here to compete or participate? ${chirpStyle.suffix}`;
    }

    // Ownership is league-private, so these are candidates to check, not players known to be on the wire.
    return targets === 0
      ? 'No streaming candidates in that window.'
      : `${targets} streaming candidate${targets === 1 ? '' : 's'} listed above. Check they're free in your league.`;
  }

  /**
   * Fallback chirp for tools without a specific one.
   *
   * It used to splice style fragments around a fixed phrase, which rendered as "The data shows the data patterns. Time
   * to taking action based on these insights. and improve your game". It now says something about the result, in whole
   * sentences, with a closing line chosen by tone.
   */
  private static generateGenericChirp(data: any, chirpStyle: any, personality: any): string {
    const n = Array.isArray(data?.recommendations) ? data.recommendations.length : 0;
    const opening = n === 0
      ? 'Nothing needs changing right now.'
      : `${n} ${n === 1 ? 'move' : 'moves'} worth making, listed above.`;
    const closing: Record<string, string> = {
      encouraging: n === 0 ? 'Nicely done.' : "Take them when you're ready.",
      direct_honest: n === 0 ? 'Check back before the next game day.' : 'Make them before your opponent does.',
      brutal_truth: n === 0 ? "Don't get comfortable." : 'Get it together.',
      championship_enforcer: n === 0 ? 'Stay sharp.' : "That's how legends are made.",
    };
    return `${opening} ${closing[chirpStyle?.tone] ?? ''}`.trim();
  }

  private static generateIntentSummary(data: any, personality: any): string {
    switch (personality.focus) {
      case "championship_mindset":
        return "Championship strategy: Execute these moves for league domination";
      case "data_driven":
        return "Statistical analysis: Data-driven recommendations for optimal performance";
      case "entertainment_value":
        return "Bottom line: Time to separate the contenders from the pretenders";
      case "winning_strategy":
        return "Elite strategy: Next-level moves for next-level results";
      default:
        return "Action required: Strategic improvements identified";
    }
  }

  private static generateICETruth(data: any, chirpStyle: any): string {
    if (chirpStyle.tone === "championship_enforcer") {
      return "❄️ ICE Cold Truth: Champions make moves, pretenders make excuses.";
    }
    if (chirpStyle.tone === "brutal_truth") {
      return "🔥 Savage Reality: Your competition isn't waiting - neither should you.";
    }
    if (chirpStyle.tone === "direct_honest") {
      return "💪 Real Talk: Smart players act on good intel.";
    }
    return "🧠 Smart Play: Optimal decisions lead to optimal results.";
  }
}
