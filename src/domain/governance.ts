/**
 * 🏛️ Semantic Anchoring Governance System
 *
 * This module implements the complete Semantic Anchoring Governance framework
 * across all 5 phases:
 * - Phase 1: Semantic Markers and Tool Identity
 * - Phase 2: Immutability Protection
 * - Phase 3: Semantic Contract Validation
 * - Phase 4: Documentation
 * - Phase 5: Runtime Governance Enforcement
 *
 * Governance Rules:
 * - Rule 1: Semantic Over Structural - Decisions based on semantic properties
 * - Rule 2: Intent Preservation - Semantic intent validated through transformations
 * - Rule 3: Observable Anchoring - Decisions based on observable semantic properties
 * - Rule 4: Immutability Protection - Semantic contracts cannot be mutated
 */

import type { SemanticChirpContract, AnalysisType } from './types.js';

// ==========================================
// 📊 Governance Violation Tracking
// ==========================================

/**
 * Governance violation record
 * Tracks all governance rule violations for monitoring and debugging
 */
export interface GovernanceViolation {
  timestamp: Date;
  rule: string;
  severity: "warning" | "error";
  tool_name: string;
  violation_type: string;
  details: string;
}

// ==========================================
// 📈 Runtime Governance Monitor
// ==========================================

/**
 * 🏛️ GOVERNANCE_MONITOR
 *
 * Central monitoring system for all governance enforcement.
 * Tracks violations, contracts, immutability enforcement, and semantic decisions.
 *
 * Enhanced in Template Pattern Migration:
 * - Added analysis execution tracking
 * - Added performance monitoring
 * - Added analysis-specific metrics
 */
export const GOVERNANCE_MONITOR = {
  // Existing governance metrics (Phases 1-5)
  violations: [] as GovernanceViolation[],
  contracts_validated: 0,
  immutability_enforced: 0,
  semantic_decisions: 0,

  // 🆕 NEW: Analysis tracking (Template Pattern)
  analyses_executed: 0,
  analysis_by_type: new Map<AnalysisType, number>(),
  analysis_durations: [] as Array<{
    type: AnalysisType;
    duration_ms: number;
    timestamp: Date;
  }>,

  /**
   * Track a governance violation
   * Automatically adds timestamp and maintains violation history
   */
  trackViolation(violation: Omit<GovernanceViolation, 'timestamp'>): void {
    this.violations.push({
      ...violation,
      timestamp: new Date()
    });

    // Keep only last 100 violations to prevent memory growth
    if (this.violations.length > 100) {
      this.violations = this.violations.slice(-100);
    }
  },

  /**
   * 🆕 Track analysis start
   * Called when template method begins execution
   */
  trackAnalysisStart(type: AnalysisType): void {
    if (process.env.NODE_ENV === "development") {
      console.log(`[GOVERNANCE] Analysis started: ${type}`);
    }
  },

  /**
   * 🆕 Track analysis completion
   * Records execution time and updates metrics
   */
  trackAnalysisComplete(type: AnalysisType, duration_ms: number): void {
    this.analyses_executed++;
    this.analysis_by_type.set(type, (this.analysis_by_type.get(type) || 0) + 1);
    this.analysis_durations.push({
      type,
      duration_ms,
      timestamp: new Date()
    });

    // Keep only last 100 duration records
    if (this.analysis_durations.length > 100) {
      this.analysis_durations = this.analysis_durations.slice(-100);
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`[GOVERNANCE] Analysis completed: ${type} (${duration_ms}ms)`);
    }
  },

  /**
   * Get governance health report
   * Returns comprehensive metrics about system health
   */
  getHealthReport(): {
    total_violations: number;
    warnings: number;
    errors: number;
    contracts_validated: number;
    immutability_enforced: number;
    semantic_decisions: number;
    recent_violations: GovernanceViolation[];
    // 🆕 Analysis metrics
    analyses_executed: number;
    analysis_by_type: Record<string, number>;
    avg_duration_ms: number;
  } {
    const warnings = this.violations.filter(v => v.severity === "warning").length;
    const errors = this.violations.filter(v => v.severity === "error").length;

    // Calculate average duration
    const avgDuration = this.analysis_durations.length > 0
      ? Math.round(
          this.analysis_durations.reduce((sum, d) => sum + d.duration_ms, 0) /
          this.analysis_durations.length
        )
      : 0;

    return {
      total_violations: this.violations.length,
      warnings,
      errors,
      contracts_validated: this.contracts_validated,
      immutability_enforced: this.immutability_enforced,
      semantic_decisions: this.semantic_decisions,
      recent_violations: this.violations.slice(-10), // Last 10 violations
      // 🆕 Analysis metrics
      analyses_executed: this.analyses_executed,
      analysis_by_type: Object.fromEntries(this.analysis_by_type),
      avg_duration_ms: avgDuration
    };
  },

  /**
   * Reset monitoring counters (for testing)
   */
  reset(): void {
    this.violations = [];
    this.contracts_validated = 0;
    this.immutability_enforced = 0;
    this.semantic_decisions = 0;
    this.analyses_executed = 0;
    this.analysis_by_type.clear();
    this.analysis_durations = [];
  }
};

// ==========================================
// 🔍 Semantic Contract Audit Logger
// ==========================================

/**
 * Audit semantic contract operations
 * Logs contract state during validation, enforcement, and decisions
 *
 * @param contract - The semantic contract being audited
 * @param toolName - Name of the tool processing the contract
 * @param phase - Which phase of processing (validation, enforcement, decision)
 */
export function auditSemanticContract(
  contract: SemanticChirpContract,
  toolName: string,
  phase: "validation" | "enforcement" | "decision"
): void {
  const audit = {
    phase,
    tool_name: toolName,
    semantic_intent: contract.semantic_intent,
    enable_chirp: contract.enable_chirp,
    chirp_intensity: contract.chirp_intensity,
    personality_mode: contract.personality_mode,
    tool_context: contract.tool_context,
    timestamp: new Date().toISOString()
  };

  // Log to console in development mode
  if (process.env.NODE_ENV === "development") {
    console.log(`🔍 Semantic Audit [${phase}]:`, JSON.stringify(audit, null, 2));
  }

  // Update monitoring counters
  if (phase === "validation") {
    GOVERNANCE_MONITOR.contracts_validated++;
  } else if (phase === "enforcement") {
    GOVERNANCE_MONITOR.immutability_enforced++;
  } else if (phase === "decision") {
    GOVERNANCE_MONITOR.semantic_decisions++;
  }
}

// ==========================================
// 🏥 Governance Health Check
// ==========================================

/**
 * Check governance system health
 * Returns status and actionable recommendations
 */
export function checkGovernanceHealth(): {
  status: "healthy" | "degraded" | "critical";
  report: ReturnType<typeof GOVERNANCE_MONITOR.getHealthReport>;
  recommendations: string[];
} {
  const report = GOVERNANCE_MONITOR.getHealthReport();
  const recommendations: string[] = [];

  let status: "healthy" | "degraded" | "critical" = "healthy";

  // Check error rate
  if (report.errors > 10) {
    status = "critical";
    recommendations.push("Critical: High error rate detected. Review recent violations immediately.");
  } else if (report.errors > 0) {
    status = "degraded";
    recommendations.push("Warning: Governance errors detected. Review violation logs.");
  }

  // Check warning rate
  if (report.warnings > 20) {
    if (status !== "critical") status = "degraded";
    recommendations.push("Warning: High warning rate. Review semantic contract usage patterns.");
  }

  // Check validation rate
  if (report.contracts_validated === 0) {
    recommendations.push("Info: No contracts validated yet. System may not be processing requests.");
  }

  // 🆕 Check analysis performance
  if (report.avg_duration_ms > 5000) {
    if (status !== "critical") status = "degraded";
    recommendations.push(`Performance: Average analysis duration is ${report.avg_duration_ms}ms (threshold: 5000ms)`);
  }

  if (recommendations.length === 0) {
    recommendations.push("System is operating within governance parameters.");
  }

  return { status, report, recommendations };
}

// ==========================================
// 📚 Semantic Contract Validation
// ==========================================

/**
 * 🏛️ validateSemanticChirpContract Function:
 * Enforces Semantic Anchoring Governance Rule 2 (Intent Preservation) by validating
 * that semantic intent is preserved through chirp parameter transformations.
 *
 * Purpose:
 * Ensures that chirp parameters maintain semantic coherence and prevents accidental
 * or malicious violations of user intent.
 *
 * Governance Principles:
 * - User intent has highest priority and must never be overridden
 * - System defaults should be semantically consistent
 * - Tool-specific overrides must be confined to their tool context
 * - Conflicting intentions should be detected and reported
 *
 * Validation Cases:
 *
 * Case 1: User-Requested Disable
 *   Scenario: User explicitly sets enable_chirp=false with semantic_intent="user_requested"
 *   Action: Allow and preserve user intent (highest priority)
 *   Governance: Protects user autonomy and semantic control
 *
 * Case 2: Default Behavior
 *   Scenario: enable_chirp is undefined or true (system default)
 *   Action: Allow as valid default semantic behavior
 *   Governance: System defaults are semantically consistent
 *
 * Case 3: Ice Cold Intensity Validation
 *   Scenario: chirp_intensity="ice_cold" without explicit semantic intent
 *   Action: Warn if used on non-ICE tools (may be accidental)
 *   Governance: Prevents unintentional semantic shifts in tool behavior
 *   Rationale: ice_cold is semantically strong and should be intentional
 *
 * Case 4: Conflicting Intent Detection
 *   Scenario: enable_chirp=false but chirp_intensity is specified
 *   Action: Log warning about semantic contradiction
 *   Governance: Detects semantic incoherence in parameters
 *   Rationale: Disabled chirp with intensity setting is semantically inconsistent
 *
 * Case 5: Tool Override Protection
 *   Scenario: semantic_intent="tool_override" with mismatched tool_context
 *   Action: Throw error (strict enforcement)
 *   Governance: Prevents semantic contract violations across tool boundaries
 *   Rationale: Tool overrides must stay within their semantic domain
 *
 * @param contract - The semantic contract to validate
 * @param toolName - Name of the tool requesting validation
 * @param toolMetadata - Optional tool metadata for semantic property checks
 */
export function validateSemanticChirpContract(
  contract: SemanticChirpContract,
  toolName: string,
  toolMetadata?: { is_ice_engine?: boolean }
): void {
  // 🔍 Phase 5: Audit contract validation
  auditSemanticContract(contract, toolName, "validation");

  // Rule 2: Intent Preservation - validate semantic coherence

  // Case 1: User explicitly disabled chirp - valid semantic intent
  if (contract.enable_chirp === false && contract.semantic_intent === "user_requested") {
    return; // Valid: User intent to disable is preserved
  }

  // Case 2: Default behavior - chirp enabled unless explicitly disabled
  if (contract.enable_chirp === undefined || contract.enable_chirp === true) {
    // This is valid default behavior
    return;
  }

  // Case 3: ice_cold intensity should be intentional, not accidental
  if (contract.chirp_intensity === "ice_cold" && !contract.semantic_intent) {
    // Log warning but allow (ICE tool deliberately uses ice_cold as default)
    if (toolMetadata && !toolMetadata.is_ice_engine) {
      const warning = `ice_cold intensity without explicit intent on non-ICE tool '${toolName}'`;
      console.error(`⚠️ Semantic Warning: ${warning}`);

      // 📊 Phase 5: Track governance violation
      GOVERNANCE_MONITOR.trackViolation({
        rule: "Rule 2 - Intent Preservation",
        severity: "warning",
        tool_name: toolName,
        violation_type: "unintentional_intensity",
        details: warning
      });
    }
  }

  // Case 4: Detect conflicting semantic intentions
  if (contract.enable_chirp === false && contract.chirp_intensity) {
    const warning = `Conflicting intent - chirp disabled but intensity specified for '${toolName}'`;
    console.error(`⚠️ Semantic Warning: ${warning}`);

    // 📊 Phase 5: Track governance violation
    GOVERNANCE_MONITOR.trackViolation({
      rule: "Rule 2 - Intent Preservation",
      severity: "warning",
      tool_name: toolName,
      violation_type: "conflicting_intent",
      details: warning
    });
  }

  // Case 5: Tool override should only be used by system, not user input
  if (contract.semantic_intent === "tool_override" && contract.tool_context !== toolName) {
    const error = `tool_override intent mismatch for '${toolName}' - expected context '${toolName}', got '${contract.tool_context}'`;

    // 📊 Phase 5: Track governance violation
    GOVERNANCE_MONITOR.trackViolation({
      rule: "Rule 2 - Intent Preservation",
      severity: "error",
      tool_name: toolName,
      violation_type: "tool_override_mismatch",
      details: error
    });

    throw new Error(`🚨 Semantic contract violation: ${error}`);
  }
}
