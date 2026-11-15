/**
 * create/revoke MCP token sull'emulatore RTDB (Admin bypass regole).
 */
import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import {
  createEmulatorAdminApp,
  deleteEmulatorAdminApp,
} from '../../../src/features/kentuFocus/server/emulator/createEmulatorAdmin.js';
import { createMcpTokenForUid, revokeMcpTokenForUid } from '../tokens.js';
import { resolveMcpBearer } from '../auth.js';
import { sha256Hex } from '../hashToken.js';

const UID = 'mcp_token_test_user';

/** @type {import('firebase-admin/database').Database | null} */
let db = null;

before(async () => {
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST
    || '127.0.0.1:9000';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST
    || '127.0.0.1:9099';
  db = createEmulatorAdminApp().db;
  await db.ref(`users/${UID}/mcp_tokens`).set(null);
  await db.ref('mcp_token_lookup').set(null);
});

after(async () => {
  await deleteEmulatorAdminApp();
});

test('createMcpToken salva solo hash e resolveMcpBearer funziona', async () => {
  const created = await createMcpTokenForUid(db, UID);
  assert.ok(created.token.length >= 40);
  assert.ok(created.tokenId);

  const hash = sha256Hex(created.token);
  const lookup = await db.ref(`mcp_token_lookup/${hash}`).get();
  assert.equal(lookup.val()?.uid, UID);
  assert.equal(lookup.val()?.tokenId, created.tokenId);

  const stored = await db.ref(`users/${UID}/mcp_tokens/${created.tokenId}`).get();
  assert.equal(stored.val()?.hash, hash);
  assert.equal(stored.val()?.revoked, false);
  // plaintext non deve essere in RTDB
  const dumped = JSON.stringify(stored.val());
  assert.equal(dumped.includes(created.token), false);

  const auth = await resolveMcpBearer(db, `Bearer ${created.token}`);
  assert.equal(auth.uid, UID);
  assert.equal(auth.tokenId, created.tokenId);

  await revokeMcpTokenForUid(db, UID, created.tokenId);
  await assert.rejects(
    () => resolveMcpBearer(db, `Bearer ${created.token}`),
    /revocato|non riconosciuto|non valido/i,
  );
});
