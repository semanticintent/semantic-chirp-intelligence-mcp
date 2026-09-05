/**
 * The package version for `source.analyst`. Node reads package.json next to build/; a bundled Worker has no
 * import.meta.url and no filesystem, so src/edge.ts sets it explicitly from the JSON it bundles.
 */
import fs from 'fs';

let version: string | null = null;

export function setVersion(v: string): void { version = v; }

export function getVersion(): string {
  if (version) return version;
  try {
    const url = new URL('../package.json', import.meta.url);
    version = String(JSON.parse(fs.readFileSync(url, 'utf8')).version ?? '0.0.0');
  } catch {
    version = '0.0.0';
  }
  return version;
}
