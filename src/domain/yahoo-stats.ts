/**
 * 📊 Yahoo Fantasy Stat Identity
 *
 * Yahoo returns stats as `{ stat_id, value }` pairs with no labels. Mapping an
 * id to a category is therefore a guess unless it comes from Yahoo itself.
 *
 * 🏛️ Rule 3 (Observable Anchoring): the authoritative mapping is published by
 * Yahoo at `/game/nhl/stat_categories`. `loadStatCategories()` fetches it and
 * replaces the fallback table below. The fallback exists only so the server
 * still runs before that call succeeds — it is NOT verified, and a wrong id
 * here silently corrupts every category comparison built on it.
 */

/**
 * Fallback stat_id -> category label.
 *
 * ⚠️ Inherited unverified from the original inline map in `analyze_trade`.
 * Run `npm run verify:yahoo` against a live league to confirm or correct it;
 * at runtime `loadStatCategories()` overrides it with Yahoo's own names.
 */
export const FALLBACK_STAT_ID_LABELS: Readonly<Record<string, string>> = {
  '1': 'G',
  '2': 'A',
  '3': '+/-',
  '4': 'PIM',
  '5': 'SOG',
  '8': 'PPP',
  '31': 'W',
  '32': 'GAA',
  '33': 'SV%'
};

/** Categories compared by trade and stream analysis. */
export const DEFAULT_CATEGORIES = ['G', 'A', '+/-', 'PIM', 'SOG', 'PPP', 'W', 'GAA', 'SV%'] as const;

/** Categories where a lower number is the better outcome. */
export const LOWER_IS_BETTER: ReadonlySet<string> = new Set(['GAA']);

/** Yahoo display names normalized to this codebase's category labels. */
const DISPLAY_NAME_TO_LABEL: Readonly<Record<string, string>> = {
  'goals': 'G',
  'assists': 'A',
  'points': 'P',
  'plus/minus': '+/-',
  'penalty minutes': 'PIM',
  'powerplay points': 'PPP',
  'power play points': 'PPP',
  'shots on goal': 'SOG',
  'games played': 'GP',
  'wins': 'W',
  'goals against average': 'GAA',
  'save percentage': 'SV%',
  'saves': 'SV',
  'shutouts': 'SHO',
  'time on ice': 'TOI'
};

/** Live mapping, populated by `loadStatCategories`. */
let activeStatIdLabels: Record<string, string> = { ...FALLBACK_STAT_ID_LABELS };
let mappingSource: 'fallback' | 'yahoo' = 'fallback';

/**
 * Replace the fallback map using Yahoo's `/game/nhl/stat_categories` payload.
 * Tolerates the several shapes Yahoo returns; leaves the fallback in place if
 * nothing usable is found.
 */
export function applyStatCategories(payload: any): boolean {
  const groups =
    payload?.fantasy_content?.game?.[1]?.stat_categories?.stats ??
    payload?.fantasy_content?.game?.stat_categories?.stats ??
    [];

  const mapped: Record<string, string> = {};

  const entries: any[] = Array.isArray(groups)
    ? groups
    : Object.keys(groups ?? {})
        .filter(k => k !== 'count')
        .map(k => groups[k]);

  for (const entry of entries) {
    const stat = entry?.stat ?? entry;
    const id = stat?.stat_id;
    const display = stat?.display_name ?? stat?.name;
    if (id === undefined || !display) continue;

    const label =
      DISPLAY_NAME_TO_LABEL[String(display).trim().toLowerCase()] ?? String(display).trim();
    mapped[String(id)] = label;
  }

  if (Object.keys(mapped).length === 0) return false;

  activeStatIdLabels = mapped;
  mappingSource = 'yahoo';
  return true;
}

/** Current stat_id -> label mapping. */
export function getStatIdLabels(): Readonly<Record<string, string>> {
  return activeStatIdLabels;
}

/** Whether the active mapping came from Yahoo or the unverified fallback. */
export function getStatMappingSource(): 'fallback' | 'yahoo' {
  return mappingSource;
}

/** Reset to the fallback map. Test seam. */
export function resetStatCategories(): void {
  activeStatIdLabels = { ...FALLBACK_STAT_ID_LABELS };
  mappingSource = 'fallback';
}

/**
 * Convert a Yahoo `player_stats.stats` array into labelled numbers.
 * Values Yahoo reports as '-' (did not play) are dropped rather than coerced
 * to 0, which would drag rate stats like GAA and SV% toward zero.
 */
export function parseStatArray(statsArray: any[]): Record<string, number> {
  const labels = getStatIdLabels();
  const parsed: Record<string, number> = {};

  for (const wrapper of statsArray ?? []) {
    const stat = wrapper?.stat ?? wrapper;
    const label = labels[String(stat?.stat_id)];
    if (!label) continue;

    const raw = stat?.value;
    if (raw === undefined || raw === null || raw === '-' || raw === '') continue;

    const value = parseFloat(raw);
    if (Number.isFinite(value)) parsed[label] = value;
  }

  return parsed;
}
