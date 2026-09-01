import { describe, it, expect } from 'vitest';
// @ts-ignore - plain ESM helper shared with authenticate.js
import { isPlaceholder } from '../../scripts/placeholders.mjs';
import fs from 'fs';

describe('placeholder detection', () => {
  it('rejects the template values the setup docs hand out', () => {
    // preflight used to green-tick `paste_here` while authenticate.js refused
    // it, so the two tools disagreed about whether setup was complete.
    expect(isPlaceholder('paste_here')).toBe(true);
    expect(isPlaceholder('your_client_id')).toBe(true);
    expect(isPlaceholder('your_client_secret_here')).toBe(true);
  });

  it('rejects missing and blank values', () => {
    expect(isPlaceholder(undefined)).toBe(true);
    expect(isPlaceholder(null)).toBe(true);
    expect(isPlaceholder('')).toBe(true);
    expect(isPlaceholder('   ')).toBe(true);
  });

  it('accepts values that look like real Yahoo credentials', () => {
    expect(isPlaceholder('dj0yJmk9RXhhbXBsZVRva2VuJmQ9WVdrOU')).toBe(false);
    expect(isPlaceholder('a1b2c3d4e5f60718293a4b5c6d7e8f9012345678')).toBe(false);
    expect(isPlaceholder('63774')).toBe(false);
    expect(isPlaceholder('8')).toBe(false);
  });

  it('covers every placeholder the docs actually print', () => {
    // Anything the templates suggest must be caught, or setup silently proceeds.
    const templates = [
      fs.readFileSync('.env.example', 'utf8'),
      fs.readFileSync('claude-desktop-config.json', 'utf8')
    ].join('\n');

    const suggested = [...templates.matchAll(/(?:=|"\s*)(your_[a-z_]+|paste_here)/g)].map(m => m[1]);

    expect(suggested.length).toBeGreaterThan(0);
    for (const value of suggested) {
      expect(isPlaceholder(value), `${value} is printed in a template but not detected`).toBe(true);
    }
  });

  it('is used by both authenticate.js and preflight', () => {
    // The bug was duplication, so assert neither has its own copy.
    expect(fs.readFileSync('authenticate.js', 'utf8')).toMatch(/isPlaceholder/);
    expect(fs.readFileSync('scripts/preflight.mjs', 'utf8')).toMatch(/isPlaceholder/);
  });
});
