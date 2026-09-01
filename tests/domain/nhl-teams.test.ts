import { describe, it, expect } from 'vitest';
import { toNhlTricode, isKnownTeam, NHL_TRICODES } from '../../src/domain/nhl-teams.js';

describe('NHL team identity', () => {
  it('passes through canonical tricodes', () => {
    for (const code of NHL_TRICODES) {
      expect(toNhlTricode(code)).toBe(code);
    }
  });

  it('resolves the five Yahoo abbreviations that differ from NHL tricodes', () => {
    // These are the ones that silently broke schedule lookups before the map existed.
    expect(toNhlTricode('LA')).toBe('LAK');
    expect(toNhlTricode('NJ')).toBe('NJD');
    expect(toNhlTricode('SJ')).toBe('SJS');
    expect(toNhlTricode('TB')).toBe('TBL');
    expect(toNhlTricode('StL')).toBe('STL');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(toNhlTricode('tor')).toBe('TOR');
    expect(toNhlTricode(' Mtl ')).toBe('MTL');
    expect(toNhlTricode('vgk')).toBe('VGK');
  });

  it('maps the Arizona relocation to Utah', () => {
    expect(toNhlTricode('ARI')).toBe('UTA');
    expect(toNhlTricode('PHX')).toBe('UTA');
  });

  it('returns null rather than guessing for unknown input', () => {
    expect(toNhlTricode('ZZZ')).toBeNull();
    expect(toNhlTricode('')).toBeNull();
    expect(toNhlTricode(undefined)).toBeNull();
    expect(toNhlTricode(null)).toBeNull();
    expect(isKnownTeam('Winnipeg Jets')).toBe(false);
  });

  it('covers all 32 clubs', () => {
    expect(NHL_TRICODES).toHaveLength(32);
    expect(new Set(NHL_TRICODES).size).toBe(32);
  });
});
