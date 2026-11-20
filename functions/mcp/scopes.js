/**
 * Permessi dei gettoni MCP.
 * I gettoni creati prima dei permessi (senza `scopes`) valgono solo `read`.
 */

export const MCP_SCOPE_READ = 'read';
export const MCP_SCOPE_DRAFTS_WRITE = 'drafts:write';

const KNOWN_SCOPES = new Set([MCP_SCOPE_READ, MCP_SCOPE_DRAFTS_WRITE]);

/**
 * RTDB può restituire gli array come `{0: 'read', 1: 'drafts:write'}`.
 * @param {unknown} raw
 * @returns {string[]}
 */
export function normalizeMcpScopes(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') list = Object.values(raw);
  const out = [MCP_SCOPE_READ];
  for (const value of list) {
    const scope = String(value || '').trim();
    if (KNOWN_SCOPES.has(scope) && !out.includes(scope)) out.push(scope);
  }
  return out;
}

/**
 * @param {unknown} scopes
 * @param {string} scope
 */
export function hasMcpScope(scopes, scope) {
  return normalizeMcpScopes(scopes).includes(scope);
}

/** @param {boolean} draftsWrite */
export function buildMcpScopes(draftsWrite) {
  return draftsWrite ? [MCP_SCOPE_READ, MCP_SCOPE_DRAFTS_WRITE] : [MCP_SCOPE_READ];
}
