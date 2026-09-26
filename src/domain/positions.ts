/**
 * The NHL lists wingers as L and R; every fantasy platform, and every other CHIRP output, says LW and RW.
 */
export function fantasyPosition(nhl: string): string {
  return ({ L: 'LW', R: 'RW' } as Record<string, string>)[String(nhl).toUpperCase()] ?? nhl;
}

/** "Cale Makar (COL D)" — how a candidate for an ambiguous name is shown. */
export function candidateLine(p: { name: string; team: string; position: string }): string {
  return `${p.name} (${p.team} ${fantasyPosition(p.position)})`;
}
