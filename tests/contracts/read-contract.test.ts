/**
 * The vendored read contract (contracts/read.schema.json).
 *
 * Source of truth is semanticintent/sepiola (the telestrator). This test keeps the copy honest:
 * it parses, it pins contract version 0.1, it names the fields read_ice must emit, and when a
 * sibling checkout of the telestrator exists it is byte-identical to the original.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const HERE = resolve(__dirname, '../../contracts/read.schema.json');
const SIBLING = resolve(__dirname, '../../../sepiola/contracts/read.schema.json');

const text = readFileSync(HERE, 'utf8');
const schema = JSON.parse(text);

describe('read contract (vendored)', () => {
  it('pins contract version 0.1', () => {
    expect(schema.properties.contract_version.const).toBe('0.1');
  });

  it('requires everything the telestrator draws', () => {
    expect(schema.required).toEqual(
      expect.arrayContaining(['analysis_id', 'window', 'skaters', 'calls', 'games_in_hand', 'verdicts', 'take', 'source']),
    );
    expect(schema.$defs.skater.required).toEqual(
      expect.arrayContaining(['id', 'games', 'b2b', 'schedule_value', 'flag', 'reason', 'ppg', 'projected_pts']),
    );
  });

  it('carries every sentence the screen may show, so the screen computes none', () => {
    expect(schema.$defs.skater.properties.reason.type).toBe('string');
    expect(schema.properties.take.type).toBe('string');
    expect(schema.properties.games_in_hand.properties.take.type).toBe('string');
    expect(schema.properties.verdicts.items.properties.line.type).toBe('string');
  });

  it.skipIf(!existsSync(SIBLING))('is byte-identical to the telestrator source', () => {
    expect(text).toBe(readFileSync(SIBLING, 'utf8'));
  });
});
