/**
 * A JSON cache the NHL services read and write through, so the same code runs on a laptop (disk),
 * in a Worker (KV), and in tests (memory). Freshness is the caller's business: entries carry their
 * own fetched_at and the service decides what is stale. No Node imports here; DiskJsonCache lives in
 * cache-disk.ts so this module is safe anywhere.
 */
export interface JsonCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
}

/** For tests, and for a Worker without a KV binding: lives as long as the process or isolate. */
export class MemoryJsonCache implements JsonCache {
  private readonly store = new Map<string, string>();
  async get<T>(key: string): Promise<T | null> {
    const raw = this.store.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }
  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, JSON.stringify(value));
  }
  get size(): number { return this.store.size; }
}

/** The subset of a Cloudflare KVNamespace we use, typed here so this package does not depend on Workers types. */
export interface KvLike {
  get(key: string, type: 'text'): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Cloudflare KV. Entries expire from KV after two days as a backstop; the services' own TTL is the real one. */
export class KvJsonCache implements JsonCache {
  constructor(private readonly kv: KvLike, private readonly prefix = 'chirp:', private readonly expirationTtl = 2 * 24 * 60 * 60) {}
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.kv.get(this.prefix + key, 'text');
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch { return null; }
  }
  async set<T>(key: string, value: T): Promise<void> {
    try { await this.kv.put(this.prefix + key, JSON.stringify(value), { expirationTtl: this.expirationTtl }); }
    catch (error) { console.error('[DEBUG] Could not write KV cache:', error); }
  }
}
