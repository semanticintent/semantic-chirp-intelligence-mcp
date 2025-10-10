/**
 * 🏛️ Analysis Template Base Class
 *
 * Implements the Template Method Pattern with Semantic Anchoring Governance.
 *
 * This abstract class defines the skeleton algorithm for all fantasy hockey analyses,
 * allowing concrete implementations to customize specific steps while preserving
 * the overall structure and governance enforcement.
 *
 * 🎯 Design Pattern: Template Method
 * - Fixed algorithm structure (executeAnalysis)
 * - Customizable hook methods (abstract methods)
 * - Semantic governance integrated at architecture level
 *
 * 🏛️ Governance Integration:
 * - Rule 1 (Semantic Over Structural): Analysis driven by semantic contracts
 * - Rule 2 (Intent Preservation): Chirp parameters validated and preserved
 * - Rule 3 (Observable Anchoring): Metadata provides semantic identity
 * - Rule 4 (Immutability): Results frozen before return
 */

import type {
  AnalysisType,
  SemanticChirpContract,
  AnalysisResponse,
  FantasyData
} from '../domain/types.js';

import {
  GOVERNANCE_MONITOR,
  validateSemanticChirpContract,
  auditSemanticContract
} from '../domain/governance.js';

import { TOOL_METADATA } from '../config/tool-metadata.js';

/**
 * Abstract base class for all fantasy hockey analyses
 */
export abstract class AnalysisTemplate {
  protected readonly toolName: string;
  protected readonly analysisType: AnalysisType;

  constructor(toolName: string, analysisType: AnalysisType) {
    this.toolName = toolName;
    this.analysisType = analysisType;
  }

  /**
   * 🎯 TEMPLATE METHOD: Main algorithm with fixed structure
   *
   * This method defines the invariant steps that all analyses must follow:
   * 1. Validate semantic contract (governance)
   * 2. Fetch and prepare data
   * 3. Execute domain-specific analysis
   * 4. Generate chirp intelligence
   * 5. Format and freeze results
   *
   * Concrete classes CANNOT override this method - they implement the hooks.
   */
  public async executeAnalysis(
    args: any,
    semanticContract: SemanticChirpContract
  ): Promise<AnalysisResponse> {
    const startTime = Date.now();

    // 🏛️ Governance Step 1: Validate semantic contract
    this.validateContract(semanticContract);

    // Track analysis start
    GOVERNANCE_MONITOR.trackAnalysisStart(this.analysisType);

    try {
      // Step 2: Fetch data (hook method)
      const rawData = await this.fetchData(args);

      // Step 3: Prepare data for analysis (hook method)
      const preparedData = await this.prepareData(rawData, args);

      // Step 4: Execute core analysis logic (hook method)
      const analysisResults = await this.analyzeData(preparedData, args);

      // Step 5: Generate chirp intelligence (hook method)
      const chirpEnhanced = await this.generateChirp(
        analysisResults,
        semanticContract,
        preparedData
      );

      // Step 6: Format response (hook method)
      const response = await this.formatResponse(chirpEnhanced, preparedData);

      // 🏛️ Governance Step 7: Freeze response (immutability)
      const frozenResponse = this.freezeResponse(response);

      // Track analysis completion
      const duration = Date.now() - startTime;
      GOVERNANCE_MONITOR.trackAnalysisComplete(this.analysisType, duration);

      return frozenResponse;

    } catch (error) {
      // Track failed analysis
      const duration = Date.now() - startTime;
      GOVERNANCE_MONITOR.trackAnalysisComplete(this.analysisType, duration);

      throw error;
    }
  }

  // ==========================================
  // 🎯 HOOK METHODS (Abstract - Must Override)
  // ==========================================

  /**
   * Hook 1: Fetch raw data from data source
   *
   * Concrete implementations should fetch data from Yahoo API,
   * cache, or other sources.
   */
  protected abstract fetchData(args: any): Promise<any>;

  /**
   * Hook 2: Prepare and transform data for analysis
   *
   * Convert raw API responses into structured FantasyData
   * format suitable for analysis.
   */
  protected abstract prepareData(rawData: any, args: any): Promise<FantasyData>;

  /**
   * Hook 3: Execute core domain analysis logic
   *
   * This is where the business logic lives - calculating insights,
   * generating recommendations, comparing stats, etc.
   */
  protected abstract analyzeData(
    data: FantasyData,
    args: any
  ): Promise<any>;

  /**
   * Hook 4: Generate chirp intelligence commentary
   *
   * Transform analytical results into engaging chirp-enhanced
   * content based on semantic contract.
   */
  protected abstract generateChirp(
    analysisResults: any,
    semanticContract: SemanticChirpContract,
    data: FantasyData
  ): Promise<any>;

  /**
   * Hook 5: Format final response structure
   *
   * Package analysis and chirp content into standard
   * AnalysisResponse format.
   */
  protected abstract formatResponse(
    chirpEnhanced: any,
    data: FantasyData
  ): Promise<AnalysisResponse>;

  // ==========================================
  // 🛡️ GOVERNANCE METHODS (Concrete - Shared)
  // ==========================================

  /**
   * Validate semantic contract and track governance
   */
  protected validateContract(contract: SemanticChirpContract): void {
    // 🏛️ Rule 2: Intent Preservation
    validateSemanticChirpContract(contract, this.toolName);

    // 🔍 Audit contract for debugging
    auditSemanticContract(contract, this.toolName, "validation");
  }

  /**
   * Freeze response to enforce immutability
   *
   * 🏛️ Rule 4: Immutability Protection
   */
  protected freezeResponse(response: AnalysisResponse): AnalysisResponse {
    // Deep freeze the response object
    Object.freeze(response);

    if (response.analysis_insights) {
      Object.freeze(response.analysis_insights);
    }

    if (response.recommendations) {
      response.recommendations.forEach((rec: any) => Object.freeze(rec));
      Object.freeze(response.recommendations);
    }

    if (response.chirp_intelligence) {
      Object.freeze(response.chirp_intelligence);
    }

    if (response.metadata) {
      Object.freeze(response.metadata);
    }

    GOVERNANCE_MONITOR.immutability_enforced++;

    return response;
  }

  /**
   * Get tool metadata for semantic decisions
   *
   * 🏛️ Rule 3: Observable Anchoring
   */
  protected getToolMetadata(): any {
    return TOOL_METADATA[this.toolName] || {};
  }

  /**
   * Check if this is an ICE (Intent Chirp Engine) tool
   *
   * 🏛️ Rule 1: Semantic Over Structural
   * Uses observable property instead of string comparison
   */
  protected isIceTool(): boolean {
    const metadata = this.getToolMetadata();
    return metadata.is_ice_engine === true;
  }

  /**
   * Get semantic defaults for this tool
   */
  protected getSemanticDefaults(): Partial<SemanticChirpContract> {
    const metadata = this.getToolMetadata();

    // ICE tools default to ice_cold intensity
    if (this.isIceTool()) {
      return {
        chirp_intensity: "ice_cold",
        personality_mode: "championship_coach",
        enable_chirp: true,
        semantic_intent: "system_default"
      };
    }

    // Standard tools use standard intensity
    return {
      chirp_intensity: "standard",
      personality_mode: "analytical",
      enable_chirp: true,
      semantic_intent: "system_default"
    };
  }

  /**
   * Merge user contract with semantic defaults
   *
   * 🏛️ Rule 2: Intent Preservation
   * User-provided values take precedence over defaults
   */
  protected mergeContractWithDefaults(
    userContract: SemanticChirpContract
  ): SemanticChirpContract {
    const defaults = this.getSemanticDefaults();

    return {
      ...defaults,
      ...userContract,
      // If user explicitly set values, preserve semantic intent
      semantic_intent: userContract.semantic_intent ||
                      (Object.keys(userContract).length > 0 ? "user_requested" : "system_default")
    };
  }
}
