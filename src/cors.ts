/**
 * Which browser origins may call the analyst. CORS_ORIGIN is a comma-separated allowlist; `*` opens it; unset means `*`
 * (a local `wrangler dev` without vars) and an empty string means nobody.
 * A request from an origin not on the list gets no CORS header, so the browser refuses the response.
 * Non-browser callers (curl, servers) send no Origin and are unaffected.
 */
export function corsOrigin(requestOrigin: string | null, allowlist: string | undefined): string | null {
  const list = (allowlist ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes('*')) return '*';
  if (requestOrigin && list.includes(requestOrigin.replace(/\/$/, ''))) return requestOrigin;
  return null;
}
