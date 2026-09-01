/**
 * 🏒 NHL Team Identity — Yahoo ↔ NHL abbreviation mapping
 *
 * 🏛️ Rule 3 (Observable Anchoring): a team's identity is anchored to its NHL
 * tricode, which is the only abbreviation the NHL public API answers to.
 * Yahoo publishes a *different* set of abbreviations for the same 32 clubs
 * (`LA` vs `LAK`, `NJ` vs `NJD`, `SJ` vs `SJS`, `TB` vs `TBL`, `StL` vs `STL`).
 *
 * Comparing Yahoo's abbreviation directly against an NHL tricode silently fails
 * for those five clubs — the player simply looks like they never play. Every
 * crossing of that boundary must go through `toNhlTricode`.
 */

/** The 32 NHL tricodes as the public API spells them. */
export const NHL_TRICODES = [
  'ANA', 'BOS', 'BUF', 'CAR', 'CBJ', 'CGY', 'CHI', 'COL',
  'DAL', 'DET', 'EDM', 'FLA', 'LAK', 'MIN', 'MTL', 'NJD',
  'NSH', 'NYI', 'NYR', 'OTT', 'PHI', 'PIT', 'SEA', 'SJS',
  'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK', 'WPG', 'WSH'
] as const;

export type NhlTricode = typeof NHL_TRICODES[number];

const TRICODE_SET: ReadonlySet<string> = new Set(NHL_TRICODES);

/**
 * Yahoo `editorial_team_abbr` values that differ from the NHL tricode,
 * plus a few historical/alternate spellings seen in the wild.
 * Keys are compared upper-cased.
 */
const ALIAS_TO_TRICODE: Readonly<Record<string, NhlTricode>> = {
  // Yahoo's short forms — the five that silently break naive comparison
  LA: 'LAK',
  NJ: 'NJD',
  SJ: 'SJS',
  TB: 'TBL',
  STL: 'STL', // StL upper-cases cleanly, listed for intent
  // Alternate spellings / other providers
  LV: 'VGK',
  VEG: 'VGK',
  WAS: 'WSH',
  WSH: 'WSH',
  CLS: 'CBJ',
  CLB: 'CBJ',
  MON: 'MTL',
  NAS: 'NSH',
  CAL: 'CGY',
  TBL: 'TBL',
  ARI: 'UTA', // Arizona relocated to Utah
  PHX: 'UTA',
  UTA: 'UTA',
  UTAH: 'UTA'
};

/**
 * Normalize any provider's team abbreviation to an NHL tricode.
 * Returns `null` for unknown or missing input rather than guessing — callers
 * must decide what an unmappable team means for their analysis.
 */
export function toNhlTricode(abbr: string | undefined | null): NhlTricode | null {
  if (!abbr) return null;

  const upper = String(abbr).trim().toUpperCase();
  if (!upper) return null;

  if (TRICODE_SET.has(upper)) return upper as NhlTricode;
  return ALIAS_TO_TRICODE[upper] ?? null;
}

/** True when the abbreviation resolves to a real NHL club. */
export function isKnownTeam(abbr: string | undefined | null): boolean {
  return toNhlTricode(abbr) !== null;
}
