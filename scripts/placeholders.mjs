/**
 * Placeholder credential values, shared by authenticate.js and preflight.
 *
 * These lived in two places and drifted: authenticate.js rejected `paste_here`
 * while preflight only knew about `your_*`, so preflight reported a green tick
 * for credentials the auth flow refused to use. One list, imported by both.
 */

export const PLACEHOLDER_VALUES = [
  'paste_here',
  'paste_your_client_id_here',
  'paste_your_client_secret_here',
  'your_client_id',
  'your_client_secret',
  'your_league_id',
  'your_team_id',
  'your_client_id_here',
  'your_client_secret_here',
  'your_league_id_here',
  'your_team_id_here'
];

/** True when a value is missing or still a template placeholder. */
export function isPlaceholder(value) {
  if (value === undefined || value === null) return true;

  const trimmed = String(value).trim();
  if (trimmed === '') return true;

  return PLACEHOLDER_VALUES.includes(trimmed) || trimmed.startsWith('your_');
}
