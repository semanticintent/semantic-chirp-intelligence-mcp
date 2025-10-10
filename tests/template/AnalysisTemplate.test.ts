/**
 * Unit Tests for AnalysisTemplate Base Class
 *
 * Tests the Template Method Pattern implementation with comprehensive
 * coverage of:
 * - Template method execution flow
 * - Hook method enforcement
 * - Governance integration
 * - Semantic contract validation
 * - Immutability protection
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnalysisTemplate } from '../../src/template/AnalysisTemplate.js';
import type {
  SemanticChirpContract,
  AnalysisResponse,
  FantasyData,
  AnalysisType
} from '../../src/domain/types.js';
import { GOVERNANCE_MONITOR } from '../../src/domain/governance.js';

// ==========================================
// Test Implementation: Concrete Analysis Class
// ==========================================

/**
 * Concrete implementation for testing
 * Implements all abstract hook methods with spy-friendly behavior
 */
class TestAnalysis extends AnalysisTemplate {
  // Expose methods for testing
  public testValidateContract = this.validateContract.bind(this);
  public testFreezeResponse = this.freezeResponse.bind(this);
  public testGetToolMetadata = this.getToolMetadata.bind(this);
  public testIsIceTool = this.isIceTool.bind(this);
  public testGetSemanticDefaults = this.getSemanticDefaults.bind(this);
  public testMergeContractWithDefaults = this.mergeContractWithDefaults.bind(this);

  // Spy-friendly hook implementations
  protected async fetchData(args: any): Promise<any> {
    return { raw: 'test_data', args };
  }

  protected async prepareData(rawData: any, args: any): Promise<FantasyData> {
    return {
      league_key: 'test_league',
      team_key: 'test_team',
      team_name: 'Test Team',
      game_key: 'nhl.test',
      matchup_week: 1,
      roster: [],
      opponent_roster: [],
      standings: [],
      raw_data: rawData
    } as FantasyData;
  }

  protected async analyzeData(data: FantasyData, args: any): Promise<any> {
    return {
      insights: ['Test insight 1', 'Test insight 2'],
      metrics: { score: 100 }
    };
  }

  protected async generateChirp(
    analysisResults: any,
    semanticContract: SemanticChirpContract,
    data: FantasyData
  ): Promise<any> {
    return {
      ...analysisResults,
      chirp: {
        message: 'Test chirp',
        intensity: semanticContract.chirp_intensity
      }
    };
  }

  protected async formatResponse(
    chirpEnhanced: any,
    data: FantasyData
  ): Promise<AnalysisResponse> {
    return {
      analysis_insights: chirpEnhanced.insights,
      recommendations: [],
      chirp_intelligence: chirpEnhanced.chirp,
      metadata: {
        tool_name: this.toolName,
        analysis_type: this.analysisType,
        timestamp: new Date().toISOString()
      }
    };
  }
}

// ==========================================
// Test Suite
// ==========================================

describe('AnalysisTemplate', () => {
  let analysis: TestAnalysis;
  let validContract: SemanticChirpContract;

  beforeEach(() => {
    // Reset governance monitor before each test
    GOVERNANCE_MONITOR.reset();

    // Create fresh analysis instance
    analysis = new TestAnalysis('test_tool', 'ice_roster' as AnalysisType);

    // Valid semantic contract for testing
    validContract = {
      enable_chirp: true,
      chirp_intensity: 'standard',
      personality_mode: 'analytical',
      semantic_intent: 'user_requested',
      tool_context: 'test_tool'
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // Template Method Execution Flow Tests
  // ==========================================

  describe('executeAnalysis() - Template Method', () => {
    it('should execute all steps in correct order', async () => {
      const executionOrder: string[] = [];

      // Spy on all hook methods
      vi.spyOn(analysis as any, 'validateContract').mockImplementation(() => {
        executionOrder.push('validateContract');
      });
      vi.spyOn(analysis as any, 'fetchData').mockImplementation(async () => {
        executionOrder.push('fetchData');
        return { raw: 'data' };
      });
      vi.spyOn(analysis as any, 'prepareData').mockImplementation(async () => {
        executionOrder.push('prepareData');
        return {} as FantasyData;
      });
      vi.spyOn(analysis as any, 'analyzeData').mockImplementation(async () => {
        executionOrder.push('analyzeData');
        return {};
      });
      vi.spyOn(analysis as any, 'generateChirp').mockImplementation(async () => {
        executionOrder.push('generateChirp');
        return {};
      });
      vi.spyOn(analysis as any, 'formatResponse').mockImplementation(async () => {
        executionOrder.push('formatResponse');
        return {} as AnalysisResponse;
      });
      vi.spyOn(analysis as any, 'freezeResponse').mockImplementation((r) => {
        executionOrder.push('freezeResponse');
        return r;
      });

      await analysis.executeAnalysis({}, validContract);

      expect(executionOrder).toEqual([
        'validateContract',
        'fetchData',
        'prepareData',
        'analyzeData',
        'generateChirp',
        'formatResponse',
        'freezeResponse'
      ]);
    });

    it('should track analysis start and completion in governance monitor', async () => {
      await analysis.executeAnalysis({}, validContract);

      expect(GOVERNANCE_MONITOR.analyses_executed).toBe(1);
      expect(GOVERNANCE_MONITOR.analysis_by_type.get('ice_roster')).toBe(1);
      expect(GOVERNANCE_MONITOR.analysis_durations.length).toBe(1);
      expect(GOVERNANCE_MONITOR.analysis_durations[0].type).toBe('ice_roster');
    });

    it('should record analysis duration', async () => {
      await analysis.executeAnalysis({}, validContract);

      const duration = GOVERNANCE_MONITOR.analysis_durations[0];
      expect(duration.duration_ms).toBeGreaterThanOrEqual(0);
      expect(duration.timestamp).toBeInstanceOf(Date);
    });

    it('should return frozen AnalysisResponse', async () => {
      const result = await analysis.executeAnalysis({}, validContract);

      expect(Object.isFrozen(result)).toBe(true);
      expect(result.analysis_insights).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should track analysis even on error', async () => {
      const testError = new Error('Analysis failed');
      vi.spyOn(analysis as any, 'analyzeData').mockRejectedValue(testError);

      await expect(analysis.executeAnalysis({}, validContract)).rejects.toThrow('Analysis failed');

      // Should still track the analysis attempt
      expect(GOVERNANCE_MONITOR.analyses_executed).toBe(1);
      expect(GOVERNANCE_MONITOR.analysis_durations.length).toBe(1);
    });
  });

  // ==========================================
  // Hook Method Tests
  // ==========================================

  describe('Hook Methods', () => {
    it('fetchData should be called with args', async () => {
      const spy = vi.spyOn(analysis as any, 'fetchData');
      const args = { team_key: 'test.team.123' };

      await analysis.executeAnalysis(args, validContract);

      expect(spy).toHaveBeenCalledWith(args);
    });

    it('prepareData should receive raw data and args', async () => {
      const spy = vi.spyOn(analysis as any, 'prepareData');
      const args = { team_key: 'test.team.123' };

      await analysis.executeAnalysis(args, validContract);

      expect(spy).toHaveBeenCalled();
      const callArgs = spy.mock.calls[0];
      expect(callArgs[0]).toHaveProperty('raw', 'test_data');
      expect(callArgs[1]).toEqual(args);
    });

    it('analyzeData should receive prepared FantasyData', async () => {
      const spy = vi.spyOn(analysis as any, 'analyzeData');

      await analysis.executeAnalysis({}, validContract);

      expect(spy).toHaveBeenCalled();
      const data = spy.mock.calls[0][0];
      expect(data).toHaveProperty('league_key');
      expect(data).toHaveProperty('team_name');
    });

    it('generateChirp should receive analysis results, contract, and data', async () => {
      const spy = vi.spyOn(analysis as any, 'generateChirp');

      await analysis.executeAnalysis({}, validContract);

      expect(spy).toHaveBeenCalled();
      const [results, contract, data] = spy.mock.calls[0];
      expect(results).toHaveProperty('insights');
      expect(contract).toEqual(validContract);
      expect(data).toHaveProperty('team_name');
    });

    it('formatResponse should receive chirp-enhanced results', async () => {
      const spy = vi.spyOn(analysis as any, 'formatResponse');

      await analysis.executeAnalysis({}, validContract);

      expect(spy).toHaveBeenCalled();
      const chirpEnhanced = spy.mock.calls[0][0];
      expect(chirpEnhanced).toHaveProperty('chirp');
    });
  });

  // ==========================================
  // Governance Integration Tests
  // ==========================================

  describe('validateContract()', () => {
    it('should validate contract and track in governance monitor', () => {
      // Reset to ensure clean state
      GOVERNANCE_MONITOR.reset();

      analysis.testValidateContract(validContract);

      expect(GOVERNANCE_MONITOR.contracts_validated).toBe(1);
    });

    it('should log warning on conflicting contract', () => {
      // Reset to ensure clean state
      GOVERNANCE_MONITOR.reset();

      // Mock console.error to capture the warning
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const invalidContract: SemanticChirpContract = {
        enable_chirp: false,
        chirp_intensity: 'standard', // Conflicting! Disabled but intensity specified
        personality_mode: 'analytical',
        semantic_intent: 'system_default', // Not user_requested, so this creates a conflict
        tool_context: 'test_tool'
      };

      // Should log warning but not throw
      expect(() => analysis.testValidateContract(invalidContract)).not.toThrow();

      // Should have logged a warning to console
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Should have added a violation for conflicting intent
      expect(GOVERNANCE_MONITOR.violations.length).toBe(1);
      expect(GOVERNANCE_MONITOR.violations[0].violation_type).toBe('conflicting_intent');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('freezeResponse()', () => {
    it('should freeze all response objects', () => {
      const response: AnalysisResponse = {
        analysis_insights: ['insight 1'],
        recommendations: [{ action: 'test' }],
        chirp_intelligence: { message: 'chirp' },
        metadata: { tool_name: 'test' }
      };

      const frozen = analysis.testFreezeResponse(response);

      expect(Object.isFrozen(frozen)).toBe(true);
      expect(Object.isFrozen(frozen.analysis_insights)).toBe(true);
      expect(Object.isFrozen(frozen.recommendations)).toBe(true);
      expect(Object.isFrozen(frozen.recommendations[0])).toBe(true);
      expect(Object.isFrozen(frozen.chirp_intelligence)).toBe(true);
      expect(Object.isFrozen(frozen.metadata)).toBe(true);
    });

    it('should increment immutability_enforced counter', () => {
      const response: AnalysisResponse = {
        analysis_insights: [],
        recommendations: [],
        chirp_intelligence: {},
        metadata: {}
      };

      expect(GOVERNANCE_MONITOR.immutability_enforced).toBe(0);
      analysis.testFreezeResponse(response);
      expect(GOVERNANCE_MONITOR.immutability_enforced).toBe(1);
    });
  });

  // ==========================================
  // Semantic Decision Tests
  // ==========================================

  describe('getToolMetadata()', () => {
    it('should return metadata for known tools', () => {
      const iceAnalysis = new TestAnalysis('get_roster_transaction_recommendations', 'ice_roster' as AnalysisType);
      const metadata = iceAnalysis.testGetToolMetadata();

      expect(metadata).toHaveProperty('is_ice_engine', true);
      expect(metadata).toHaveProperty('chirp_style');
    });

    it('should return empty object for unknown tools', () => {
      const metadata = analysis.testGetToolMetadata();
      expect(metadata).toEqual({});
    });
  });

  describe('isIceTool()', () => {
    it('should return true for ICE tools', () => {
      const iceAnalysis = new TestAnalysis('get_roster_transaction_recommendations', 'ice_roster' as AnalysisType);
      expect(iceAnalysis.testIsIceTool()).toBe(true);
    });

    it('should return false for non-ICE tools', () => {
      const standardAnalysis = new TestAnalysis('get_team_roster', 'ice_roster' as AnalysisType);
      expect(standardAnalysis.testIsIceTool()).toBe(false);
    });
  });

  describe('getSemanticDefaults()', () => {
    it('should return ice_cold defaults for ICE tools', () => {
      const iceAnalysis = new TestAnalysis('get_roster_transaction_recommendations', 'ice_roster' as AnalysisType);
      const defaults = iceAnalysis.testGetSemanticDefaults();

      expect(defaults.chirp_intensity).toBe('ice_cold');
      expect(defaults.personality_mode).toBe('championship_coach');
      expect(defaults.enable_chirp).toBe(true);
    });

    it('should return standard defaults for normal tools', () => {
      const defaults = analysis.testGetSemanticDefaults();

      expect(defaults.chirp_intensity).toBe('standard');
      expect(defaults.personality_mode).toBe('analytical');
      expect(defaults.enable_chirp).toBe(true);
    });
  });

  describe('mergeContractWithDefaults()', () => {
    it('should preserve user-provided values', () => {
      const userContract: SemanticChirpContract = {
        enable_chirp: false,
        chirp_intensity: 'spicy',
        personality_mode: 'sarcastic',
        semantic_intent: 'user_requested',
        tool_context: 'test'
      };

      const merged = analysis.testMergeContractWithDefaults(userContract);

      expect(merged.enable_chirp).toBe(false);
      expect(merged.chirp_intensity).toBe('spicy');
      expect(merged.personality_mode).toBe('sarcastic');
    });

    it('should use defaults for missing values', () => {
      const userContract: SemanticChirpContract = {
        enable_chirp: true,
        semantic_intent: 'user_requested'
      };

      const merged = analysis.testMergeContractWithDefaults(userContract);

      expect(merged.chirp_intensity).toBe('standard'); // Default
      expect(merged.personality_mode).toBe('analytical'); // Default
    });

    it('should set semantic_intent to user_requested when user provides values', () => {
      const userContract: SemanticChirpContract = {
        enable_chirp: true,
        chirp_intensity: 'spicy'
      };

      const merged = analysis.testMergeContractWithDefaults(userContract);

      expect(merged.semantic_intent).toBe('user_requested');
    });

    it('should set semantic_intent to system_default for empty contract', () => {
      const emptyContract: SemanticChirpContract = {};

      const merged = analysis.testMergeContractWithDefaults(emptyContract);

      expect(merged.semantic_intent).toBe('system_default');
    });
  });

  // ==========================================
  // Error Handling Tests
  // ==========================================

  describe('Error Handling', () => {
    it('should propagate errors from fetchData', async () => {
      const testError = new Error('Fetch failed');
      vi.spyOn(analysis as any, 'fetchData').mockRejectedValue(testError);

      await expect(analysis.executeAnalysis({}, validContract)).rejects.toThrow('Fetch failed');
    });

    it('should propagate errors from prepareData', async () => {
      const testError = new Error('Prepare failed');
      vi.spyOn(analysis as any, 'prepareData').mockRejectedValue(testError);

      await expect(analysis.executeAnalysis({}, validContract)).rejects.toThrow('Prepare failed');
    });

    it('should propagate errors from analyzeData', async () => {
      const testError = new Error('Analysis failed');
      vi.spyOn(analysis as any, 'analyzeData').mockRejectedValue(testError);

      await expect(analysis.executeAnalysis({}, validContract)).rejects.toThrow('Analysis failed');
    });

    it('should propagate errors from generateChirp', async () => {
      const testError = new Error('Chirp generation failed');
      vi.spyOn(analysis as any, 'generateChirp').mockRejectedValue(testError);

      await expect(analysis.executeAnalysis({}, validContract)).rejects.toThrow('Chirp generation failed');
    });

    it('should propagate errors from formatResponse', async () => {
      const testError = new Error('Format failed');
      vi.spyOn(analysis as any, 'formatResponse').mockRejectedValue(testError);

      await expect(analysis.executeAnalysis({}, validContract)).rejects.toThrow('Format failed');
    });
  });

  // ==========================================
  // Performance Tests
  // ==========================================

  describe('Performance Tracking', () => {
    it('should calculate average duration correctly', async () => {
      await analysis.executeAnalysis({}, validContract);
      await analysis.executeAnalysis({}, validContract);
      await analysis.executeAnalysis({}, validContract);

      const avgDuration = GOVERNANCE_MONITOR.calculateAverageDuration();
      expect(avgDuration).toBeGreaterThanOrEqual(0);
    });

    it('should identify slowest analysis', async () => {
      // First analysis - fast
      await analysis.executeAnalysis({}, validContract);

      // Second analysis - add delay
      vi.spyOn(analysis as any, 'analyzeData').mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return {};
      });
      await analysis.executeAnalysis({}, validContract);

      const slowest = GOVERNANCE_MONITOR.getSlowestAnalysis();
      expect(slowest).toBeDefined();
      expect(slowest?.type).toBe('ice_roster');
      expect(slowest?.duration_ms).toBeGreaterThanOrEqual(10);
    });
  });
});
