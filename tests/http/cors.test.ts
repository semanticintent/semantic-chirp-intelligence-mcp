import { describe, it, expect } from 'vitest';
import { corsOrigin } from '../../src/cors.js';

describe('corsOrigin', () => {
  const list = 'https://chirp-telestrator.pages.dev, http://localhost:5173';
  it('echoes an allowed origin and refuses the rest', () => {
    expect(corsOrigin('https://chirp-telestrator.pages.dev', list)).toBe('https://chirp-telestrator.pages.dev');
    expect(corsOrigin('http://localhost:5173', list)).toBe('http://localhost:5173');
    expect(corsOrigin('https://evil.example', list)).toBeNull();
    expect(corsOrigin(null, list)).toBeNull();
  });
  it('opens up only when told to', () => {
    expect(corsOrigin('https://anything.example', '*')).toBe('*');
    expect(corsOrigin('https://anything.example', undefined)).toBe('*');
    expect(corsOrigin('https://anything.example', '')).toBeNull(); // an empty allowlist allows nobody
  });
});
