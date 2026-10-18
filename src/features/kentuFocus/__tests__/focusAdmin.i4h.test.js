/**
 * I4-H — gate sicurezza admin (offline, nessun emulator / DB reale).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertFocusAdminAuthorization,
  assertFocusAdminProjectIdentity,
  assertFocusAdminRuntime,
  assertFocusAdminUidAllowlist,
  maskFocusAdminUid,
  sanitizeFocusAdminCliResult,
} from '../server/admin/runFocusAdminEdition.js';

test('I4-H runtime: emulator ok; non-emulator sempre bloccato', () => {
  const had = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  const hadAllow = process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
  try {
    delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    delete process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
    assert.equal(assertFocusAdminRuntime().error, 'emulator_required');

    process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = '1';
    assert.equal(assertFocusAdminRuntime().error, 'non_emulator_admin_blocked_in_i4h');

    process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
    assert.equal(assertFocusAdminRuntime().ok, true);
  } finally {
    if (had == null) delete process.env.FIREBASE_DATABASE_EMULATOR_HOST;
    else process.env.FIREBASE_DATABASE_EMULATOR_HOST = had;
    if (hadAllow == null) delete process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR;
    else process.env.FOCUS_ADMIN_ALLOW_NON_EMULATOR = hadAllow;
  }
});

test('I4-H auth: token + allowlist UID + project identity', () => {
  assert.equal(assertFocusAdminAuthorization({ adminToken: 'x' }).ok, false);
  assert.equal(
    assertFocusAdminAuthorization({
      adminToken: 'short',
      expectedToken: 'short',
    }).error,
    'admin_token_too_weak',
  );
  assert.equal(
    assertFocusAdminAuthorization({
      adminToken: 'i4h-strong-token-01',
      expectedToken: 'i4h-strong-token-01',
    }).ok,
    true,
  );

  assert.equal(
    assertFocusAdminUidAllowlist({ uid: 'pilot_user_01', allowedUids: '' }).error,
    'admin_uid_allowlist_not_configured',
  );
  assert.equal(
    assertFocusAdminUidAllowlist({ uid: 'other_user', allowedUids: 'pilot_user_01' }).error,
    'admin_uid_not_allowlisted',
  );
  assert.equal(
    assertFocusAdminUidAllowlist({ uid: 'pilot_user_01', allowedUids: 'pilot_user_01' }).ok,
    true,
  );

  assert.equal(
    assertFocusAdminProjectIdentity({ projectId: 'demo-kentu-focus' }).error,
    'admin_expected_project_not_configured',
  );
  assert.equal(
    assertFocusAdminProjectIdentity({
      projectId: 'prod-wrong',
      expectedProjectId: 'demo-kentu-focus',
    }).error,
    'admin_project_mismatch',
  );
  assert.equal(
    assertFocusAdminProjectIdentity({
      projectId: 'demo-kentu-focus',
      expectedProjectId: 'demo-kentu-focus',
    }).ok,
    true,
  );
});

test('I4-H sanitize CLI: maschera UID, niente headline/token/dossier', () => {
  const uid = 'abcdefghijklmnop';
  const masked = maskFocusAdminUid(uid);
  assert.ok(!masked.includes(uid));
  assert.ok(masked.startsWith('uid:'));

  const safe = sanitizeFocusAdminCliResult({
    ok: true,
    error: null,
    publicationDate: '2026-10-17',
    analysisDate: '2026-10-16',
    revision: 1,
    idempotentReplay: false,
    sleepGate: { status: 'selected', available: true, ambiguous: false },
    editionSummary: {
      headline: 'Dettaglio personale sensibile',
      teaser: 'Nota privata',
      currentRevision: 1,
      status: 'published',
    },
    report: {
      kind: 'FocusPipelineReport',
      schemaVersion: '1.0.0',
      publicationDate: '2026-10-17',
      analysisDate: '2026-10-16',
      reads: { dailyRecords: 3 },
      timingsMs: { totalMs: 10 },
      editorial: {},
      prose: { source: 'fallback' },
      sleep: {},
      publish: { ok: true },
      notes: ['horizon:d7:ok'],
    },
  }, { uid, projectId: 'demo-kentu-focus' });

  const blob = JSON.stringify(safe);
  assert.ok(!blob.includes(uid));
  assert.ok(!blob.includes('Dettaglio personale'));
  assert.ok(!blob.includes('Nota privata'));
  assert.equal(safe.edition.headlineChars, 'Dettaglio personale sensibile'.length);
  assert.equal(safe.subject, masked);
  assert.ok(!('dossierInput' in safe));
});
