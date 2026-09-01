import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseStatArray,
  applyStatCategories,
  getStatIdLabels,
  getStatMappingSource,
  resetStatCategories,
  FALLBACK_STAT_ID_LABELS
} from '../../src/domain/yahoo-stats.js';

beforeEach(() => resetStatCategories());

describe('Yahoo stat identity', () => {
  it('starts on the unverified fallback map', () => {
    expect(getStatMappingSource()).toBe('fallback');
    expect(getStatIdLabels()).toEqual(FALLBACK_STAT_ID_LABELS);
  });

  it('adopts Yahoo\'s own stat catalogue over the fallback', () => {
    const applied = applyStatCategories({
      fantasy_content: {
        game: [
          {},
          {
            stat_categories: {
              stats: [
                { stat: { stat_id: '1', display_name: 'Goals' } },
                { stat: { stat_id: '2', display_name: 'Assists' } },
                { stat: { stat_id: '14', display_name: 'Shots on Goal' } }
              ]
            }
          }
        ]
      }
    });

    expect(applied).toBe(true);
    expect(getStatMappingSource()).toBe('yahoo');
    // Note stat_id 14 for SOG - the fallback guessed 5
    expect(getStatIdLabels()['14']).toBe('SOG');
  });

  it('handles the keyed-object shape Yahoo also returns', () => {
    const applied = applyStatCategories({
      fantasy_content: {
        game: [{}, { stat_categories: { stats: { count: 1, '0': { stat: { stat_id: '4', display_name: 'Penalty Minutes' } } } } }]
      }
    });

    expect(applied).toBe(true);
    expect(getStatIdLabels()['4']).toBe('PIM');
  });

  it('keeps the fallback when the payload yields nothing usable', () => {
    expect(applyStatCategories({ fantasy_content: {} })).toBe(false);
    expect(getStatMappingSource()).toBe('fallback');
  });

  it('parses a stat array into labelled numbers', () => {
    const parsed = parseStatArray([
      { stat: { stat_id: '1', value: '12' } },
      { stat: { stat_id: '2', value: '18' } }
    ]);

    expect(parsed).toEqual({ G: 12, A: 18 });
  });

  it('drops "did not play" markers instead of coercing them to zero', () => {
    // Coercing '-' to 0 would drag GAA and SV% toward zero and flip verdicts.
    const parsed = parseStatArray([
      { stat: { stat_id: '32', value: '-' } },
      { stat: { stat_id: '33', value: '' } },
      { stat: { stat_id: '1', value: '3' } }
    ]);

    expect(parsed).toEqual({ G: 3 });
    expect(parsed).not.toHaveProperty('GAA');
  });

  it('ignores unmapped stat ids and non-numeric values', () => {
    const parsed = parseStatArray([
      { stat: { stat_id: '9999', value: '5' } },
      { stat: { stat_id: '1', value: 'N/A' } }
    ]);

    expect(parsed).toEqual({});
  });

  it('tolerates empty and malformed input', () => {
    expect(parseStatArray([])).toEqual({});
    expect(parseStatArray(undefined as any)).toEqual({});
  });
});
