/** The JSON cache the NHL services read through: disk for the CLI, KV for the Worker, memory for tests. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MemoryJsonCache, KvJsonCache, type KvLike } from '../../src/services/cache.js';
import { DiskJsonCache } from '../../src/services/cache-disk.js';

describe('MemoryJsonCache', () => {
  it('round-trips and misses cleanly', async () => {
    const c = new MemoryJsonCache();
    expect(await c.get('x')).toBeNull();
    await c.set('x', { a: 1 });
    expect(await c.get('x')).toEqual({ a: 1 });
    expect(c.size).toBe(1);
  });
});

describe('DiskJsonCache', () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chirp-cache-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  it('writes one file per key and reads it back', async () => {
    const c = new DiskJsonCache(path.join(dir, 'nested'));
    await c.set('20262027', { season: '20262027' });
    expect(fs.existsSync(path.join(dir, 'nested', '20262027.json'))).toBe(true);
    expect(await c.get('20262027')).toEqual({ season: '20262027' });
  });
  it('treats a missing or corrupt file as a miss', async () => {
    const c = new DiskJsonCache(dir);
    expect(await c.get('nope')).toBeNull();
    fs.writeFileSync(path.join(dir, 'bad.json'), '{not json');
    expect(await c.get('bad')).toBeNull();
  });
});

describe('KvJsonCache', () => {
  const fakeKv = (): KvLike & { store: Map<string, string>; ttl?: number } => {
    const store = new Map<string, string>();
    return {
      store,
      ttl: undefined,
      async get(key) { return store.get(key) ?? null; },
      async put(key, value, options) { store.set(key, value); this.ttl = options?.expirationTtl; },
    };
  };
  it('prefixes keys, serialises JSON, and sets a backstop TTL', async () => {
    const kv = fakeKv();
    const c = new KvJsonCache(kv);
    await c.set('players-v3-a-b', { players: [] });
    expect([...kv.store.keys()]).toEqual(['chirp:players-v3-a-b']);
    expect(kv.ttl).toBe(2 * 24 * 60 * 60);
    expect(await c.get('players-v3-a-b')).toEqual({ players: [] });
    expect(await c.get('missing')).toBeNull();
  });
  it('never throws when KV does', async () => {
    const c = new KvJsonCache({ async get() { throw new Error('kv down'); }, async put() { throw new Error('kv down'); } });
    expect(await c.get('x')).toBeNull();
    await expect(c.set('x', 1)).resolves.toBeUndefined();
  });
});
