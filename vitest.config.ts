import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'html'],
      exclude: [
        'node_modules/',
        'build/',
        '**/*.test.ts',
        '**/*.config.ts',
        '**/types.ts'
      ]
      // Coverage is reported (and uploaded to Codecov) but not gated.
      // The suite currently covers the core Template/ICE paths; reintroduce
      // realistic per-glob thresholds here as coverage grows.
    }
  }
});
