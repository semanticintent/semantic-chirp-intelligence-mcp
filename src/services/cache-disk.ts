/** The JSON cache on disk: one file per key in a directory. The default for the CLI and the MCP server. */
import fs from 'fs';
import path from 'path';
import type { JsonCache } from './cache.js';

export class DiskJsonCache implements JsonCache {
  constructor(private readonly dir: string) {}
  private file(key: string): string { return path.join(this.dir, `${key}.json`); }
  async get<T>(key: string): Promise<T | null> {
    try {
      const file = this.file(key);
      if (!fs.existsSync(file)) return null;
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch { return null; }
  }
  async set<T>(key: string, value: T): Promise<void> {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.file(key), JSON.stringify(value));
    } catch (error) {
      // A cache miss costs seconds; it is never worth failing the analysis over.
      console.error('[DEBUG] Could not write cache:', error);
    }
  }
}
