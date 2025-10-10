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

    return `${personality.phrases[0]} your team composition looks solid.`;
  }

  private static generateScheduleChirp(data: any, chirpStyle: any, personality: any): string {
    const advantage = data.advantage;
    const diff = Math.abs(data.games_in_hand_difference || 0);

    if (advantage === "opponent" && chirpStyle.tone === "brutal_truth") {
      return `${chirpStyle.prefix} your opponent has ${diff} more games than you and you're just sitting there? Time to drop the mittens and get aggressive! ${chirpStyle.suffix}`;
    }

    if (advantage === "you" && chirpStyle.tone === "championship_enforcer") {
      return `${chirpStyle.prefix} You've got ${diff} more games. This is where champions separate from the pretenders. ${chirpStyle.suffix}`;
    }

    if (advantage === "you" && chirpStyle.tone === "direct_honest") {
      return `${chirpStyle.prefix} capitalize on your ${diff}-game advantage ${chirpStyle.suffix}`;
    }

    return `${personality.phrases[0]} the schedule advantage situation.`;
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

    return `${personality.phrases[0]} ${recommendations} optimization opportunities to consider.`;
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

    return `${personality.phrases[0]} your weekly matchup positioning.`;
  }

  private static generatePickupStrategyChirp(data: any, chirpStyle: any, personality: any): string {
    const targets = data.streaming_targets?.length || 0;
    const hotTeam = data.market_intelligence?.top_trending_team || "unknown";

    if (targets > 10 && chirpStyle.tone === "championship_enforcer") {
      return `${chirpStyle.prefix} ${targets} targets identified. Focus on ${hotTeam} players for maximum impact. ${chirpStyle.suffix}`;
    }

    if (targets > 10 && chirpStyle.tone === "brutal_truth") {
      return `${chirpStyle.prefix} ${targets} players better than what you've got - are you here to compete or participate? ${chirpStyle.suffix}`;
    }

    return `${personality.phrases[0]} ${targets} streaming opportunities on the wire.`;
  }

  private static generateGenericChirp(data: any, chirpStyle: any, personality: any): string {
    return `${personality.phrases[0]} the data patterns. ${chirpStyle.prefix} taking action based on these insights. ${chirpStyle.suffix}`;
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
