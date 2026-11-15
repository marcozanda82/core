import { generateMcpToken } from './hashToken.js';

/**
 * Crea un gettone MCP: restituisce il plaintext una sola volta; in RTDB solo hash.
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 */
export async function createMcpTokenForUid(db, uid) {
  const id = String(uid || '').trim();
  if (!id) {
    const err = new Error('Utente non autenticato');
    err.code = 'unauthenticated';
    throw err;
  }

  const { token, hash } = generateMcpToken();
  const tokenId = `t_${Date.now().toString(36)}_${hash.slice(0, 8)}`;
  const now = Date.now();

  const tokenRecord = {
    hash,
    createdAt: now,
    lastUsedAt: null,
    revoked: false,
    hourBucket: null,
    requestCountHour: 0,
  };

  await db.ref(`users/${id}/mcp_tokens/${tokenId}`).set(tokenRecord);
  await db.ref(`mcp_token_lookup/${hash}`).set({ uid: id, tokenId });

  return {
    tokenId,
    token,
    createdAt: now,
  };
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 * @param {string} tokenId
 */
export async function revokeMcpTokenForUid(db, uid, tokenId) {
  const id = String(uid || '').trim();
  const tid = String(tokenId || '').trim();
  if (!id) {
    const err = new Error('Utente non autenticato');
    err.code = 'unauthenticated';
    throw err;
  }
  if (!tid) {
    const err = new Error('tokenId richiesto');
    err.code = 'invalid-argument';
    throw err;
  }

  const tokenRef = db.ref(`users/${id}/mcp_tokens/${tid}`);
  const snap = await tokenRef.get();
  if (!snap.exists()) {
    const err = new Error('Gettone non trovato');
    err.code = 'not-found';
    throw err;
  }
  const record = snap.val() || {};
  const hash = String(record.hash || '');
  await tokenRef.update({ revoked: true, revokedAt: Date.now() });
  if (hash) {
    await db.ref(`mcp_token_lookup/${hash}`).set(null);
  }
  return { tokenId: tid, revoked: true };
}

/**
 * Elenco metadati gettoni (senza hash) per UI DEV.
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 */
export async function listMcpTokenMeta(db, uid) {
  const snap = await db.ref(`users/${uid}/mcp_tokens`).get();
  if (!snap.exists()) return [];
  const val = snap.val() || {};
  return Object.entries(val).map(([tokenId, row]) => ({
    tokenId,
    createdAt: row?.createdAt ?? null,
    lastUsedAt: row?.lastUsedAt ?? null,
    revoked: row?.revoked === true,
  }));
}
