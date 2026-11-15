import { sha256Hex } from './hashToken.js';

const RATE_LIMIT_PER_HOUR = 60;

function hourBucket(now = Date.now()) {
  return Math.floor(now / 3600000);
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {string|undefined} authorizationHeader
 * @returns {Promise<{ uid: string, tokenId: string }>}
 */
export async function resolveMcpBearer(db, authorizationHeader) {
  const header = String(authorizationHeader || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    const err = new Error('Autenticazione richiesta');
    err.code = 'unauthorized';
    throw err;
  }
  const token = match[1].trim();
  if (!token || token.length < 32) {
    const err = new Error('Gettone non valido');
    err.code = 'unauthorized';
    throw err;
  }

  const hash = sha256Hex(token);
  const lookupSnap = await db.ref(`mcp_token_lookup/${hash}`).get();
  if (!lookupSnap.exists()) {
    const err = new Error('Gettone non riconosciuto');
    err.code = 'unauthorized';
    throw err;
  }
  const lookup = lookupSnap.val() || {};
  const uid = String(lookup.uid || '').trim();
  const tokenId = String(lookup.tokenId || '').trim();
  if (!uid || !tokenId) {
    const err = new Error('Gettone non valido');
    err.code = 'unauthorized';
    throw err;
  }

  const tokenRef = db.ref(`users/${uid}/mcp_tokens/${tokenId}`);
  const tokenSnap = await tokenRef.get();
  if (!tokenSnap.exists()) {
    const err = new Error('Gettone revocato o assente');
    err.code = 'unauthorized';
    throw err;
  }
  const record = tokenSnap.val() || {};
  if (record.revoked === true) {
    const err = new Error('Gettone revocato');
    err.code = 'unauthorized';
    throw err;
  }
  if (String(record.hash || '') !== hash) {
    const err = new Error('Gettone non valido');
    err.code = 'unauthorized';
    throw err;
  }

  const now = Date.now();
  const bucket = hourBucket(now);
  let count = Number(record.requestCountHour) || 0;
  let storedBucket = Number(record.hourBucket);
  if (!Number.isFinite(storedBucket) || storedBucket !== bucket) {
    storedBucket = bucket;
    count = 0;
  }
  if (count >= RATE_LIMIT_PER_HOUR) {
    const err = new Error('Limite richieste orarie superato');
    err.code = 'rate_limited';
    throw err;
  }

  await tokenRef.update({
    lastUsedAt: now,
    hourBucket: storedBucket,
    requestCountHour: count + 1,
  });

  return { uid, tokenId };
}

export function uidLogTag(uid) {
  return sha256Hex(uid).slice(0, 8);
}
