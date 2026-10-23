/**
 * P6.10c — canonicità MemoryEvent vs round-trip RTDB (null / []).
 * Offline + (se emulator) round-trip AdminRtdb.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assessMemoryEventRecoverability,
  buildFocusMemoryEvent,
  canonicalizeMemoryEventSelection,
  computeMemoryEventContentFingerprint,
  materializeLegacyMemoryEventSelection,
  validateFocusMemoryEvent,
} from '../contracts/focusMemoryEvent.v1.js';
import { stableFingerprint } from '../sanitize/rtdbSanitize.js';

const DATE = '2026-10-17';

/**
 * Simula omissione RTDB: null e array vuoti non persistono.
 * @param {unknown} value
 */
function simulateRtdbStrip(value) {
  return JSON.parse(JSON.stringify(value, (_key, v) => {
    if (v === null) return undefined;
    if (Array.isArray(v) && v.length === 0) return undefined;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) {
      return undefined;
    }
    return v;
  }));
}

function minimalSelection() {
  return {
    publicationDate: DATE,
    lead: {
      id: 'L1',
      topicId: 'sleep_debt',
      editorialFamily: 'sleep',
      editorialScale: 'day',
      evidenceFingerprint: 'fp-sleep',
    },
    centerpiece: null,
    goodNews: [],
    features: [],
    continuity: [],
    concerns: [],
    coach: null,
  };
}

function fullSelection() {
  return {
    publicationDate: DATE,
    lead: {
      id: 'L1',
      topicId: 'sleep_debt',
      editorialFamily: 'sleep',
      editorialScale: 'day',
      evidenceFingerprint: 'fp-lead',
    },
    centerpiece: {
      id: 'C1',
      topicId: 'protein_gap',
      editorialFamily: 'nutrition',
      editorialScale: 'week',
      evidenceFingerprint: 'fp-center',
    },
    goodNews: [{
      id: 'G1',
      topicId: 'steps_up',
      editorialFamily: 'activity',
      editorialScale: 'day',
      evidenceFingerprint: 'fp-g',
    }],
    features: [{
      id: 'F1',
      topicId: 'hrv_trend',
      editorialFamily: 'recovery',
      editorialScale: 'week',
      evidenceFingerprint: 'fp-f',
    }],
    continuity: [{
      id: 'N1',
      topicId: 'sleep_debt',
      editorialFamily: 'sleep',
      editorialScale: 'episode',
      evidenceFingerprint: 'fp-c',
    }],
    concerns: [{
      id: 'X1',
      topicId: 'late_meals',
      editorialFamily: 'nutrition',
      editorialScale: 'day',
      evidenceFingerprint: 'fp-x',
    }],
    coach: {
      templateId: 'COACH_SLEEP',
      textSeed: 'seed',
      horizonDays: 7,
      followUp: { metricPaths: ['sleep.duration'] },
    },
  };
}

test('P6.10c canonica: null e [] omessi; lead preservato', () => {
  const canonical = canonicalizeMemoryEventSelection(minimalSelection());
  assert.deepEqual(Object.keys(canonical).sort(), ['lead', 'publicationDate']);
  assert.equal(canonical.lead.topicId, 'sleep_debt');
  assert.equal(canonical.centerpiece, undefined);
  assert.equal(canonical.goodNews, undefined);
  assert.equal(canonical.coach, undefined);
});

test('P6.10c round-trip simulato senza centerpiece/goodNews/coach → validate ok', () => {
  const event = buildFocusMemoryEvent({
    publicationDate: DATE,
    revision: 1,
    selection: minimalSelection(),
  });
  assert.equal(validateFocusMemoryEvent(event).ok, true);
  assert.ok(!('centerpiece' in event.selection));
  assert.ok(!('goodNews' in event.selection));
  assert.ok(!('coach' in event.selection));

  const stripped = simulateRtdbStrip(event);
  const v = validateFocusMemoryEvent(stripped);
  assert.equal(v.ok, true, v.errors?.join(','));
  assert.equal(
    assessMemoryEventRecoverability(stripped, { publicationDate: DATE, revision: 1 }).recoverable,
    true,
  );
  assert.equal(stripped.contentFingerprint, event.contentFingerprint);
});

test('P6.10c evento completo con tutti gli slot → round-trip simulato ok', () => {
  const event = buildFocusMemoryEvent({
    publicationDate: DATE,
    revision: 2,
    selection: fullSelection(),
    capturedAt: '2026-10-17T08:00:00.000Z',
  });
  assert.equal(event.selection.centerpiece.topicId, 'protein_gap');
  assert.equal(event.selection.goodNews.length, 1);
  assert.equal(event.selection.coach.templateId, 'COACH_SLEEP');
  assert.equal(event.selection.coach.followUp.metricPaths[0], 'sleep.duration');

  const stripped = simulateRtdbStrip(event);
  assert.equal(validateFocusMemoryEvent(stripped).ok, true);
  assert.equal(stripped.contentFingerprint, event.contentFingerprint);
});

test('P6.10c alterazione contenuto significativo → fingerprint mismatch', () => {
  const event = buildFocusMemoryEvent({
    publicationDate: DATE,
    revision: 1,
    selection: fullSelection(),
  });
  const tampered = {
    ...event,
    selection: {
      ...event.selection,
      lead: { ...event.selection.lead, topicId: 'tampered_topic' },
    },
  };
  // fingerprint vecchio lasciato → mismatch
  const v = validateFocusMemoryEvent(tampered);
  assert.equal(v.ok, false);
  assert.ok(v.errors.includes('contentFingerprint_mismatch'));

  // anche con ricalcolo malevolo su topic diverso, create-only confronta fingerprint salvato
  const retargeted = {
    ...tampered,
    contentFingerprint: computeMemoryEventContentFingerprint({
      editionKey: tampered.editionKey,
      publicationDate: DATE,
      revision: 1,
      selection: tampered.selection,
    }),
  };
  assert.equal(validateFocusMemoryEvent(retargeted).ok, true);
  assert.notEqual(retargeted.contentFingerprint, event.contentFingerprint);
});

test('P6.10c evento strutturalmente invalido → rifiutato', () => {
  assert.equal(validateFocusMemoryEvent(null).ok, false);
  assert.equal(validateFocusMemoryEvent({}).ok, false);

  const event = buildFocusMemoryEvent({
    publicationDate: DATE,
    revision: 1,
    selection: minimalSelection(),
  });
  const badDate = { ...event, publicationDate: 'not-a-date' };
  assert.equal(validateFocusMemoryEvent(badDate).ok, false);

  const badKind = { ...event, kind: 'Other' };
  assert.equal(validateFocusMemoryEvent(badKind).ok, false);

  const noSelection = { ...event, selection: null };
  assert.equal(validateFocusMemoryEvent(noSelection).ok, false);
});

test('P6.10c compat lettura: fingerprint legacy (null/[]) accettato senza riscrittura', () => {
  const canonical = canonicalizeMemoryEventSelection(minimalSelection());
  const legacySelection = materializeLegacyMemoryEventSelection(canonical, DATE);
  const editionKey = `${DATE}#1`;
  const legacyFp = stableFingerprint({
    editionKey,
    publicationDate: DATE,
    revision: 1,
    selection: legacySelection,
  });
  const legacyEvent = {
    schemaVersion: '1.0.0',
    kind: 'FocusMemoryEvent',
    editionKey,
    publicationDate: DATE,
    revision: 1,
    contentFingerprint: legacyFp,
    // body come dopo RTDB strip (senza null/[])
    selection: simulateRtdbStrip(legacySelection),
  };
  const v = validateFocusMemoryEvent(legacyEvent);
  assert.equal(v.ok, true, v.errors?.join(','));
});

test('P6.10c AdminRtdb round-trip reale', {
  skip: !process.env.FIREBASE_DATABASE_EMULATOR_HOST,
}, async () => {
  const { createEmulatorAdminApp, deleteEmulatorAdminApp } = await import(
    '../emulator/createEmulatorAdmin.js'
  );
  const { AdminRtdbFocusPersistence } = await import(
    '../persist/AdminRtdbFocusPersistence.js'
  );

  const { db } = createEmulatorAdminApp();
  const persistence = new AdminRtdbFocusPersistence(db);
  const uid = 'p610c_rtdb_rt';
  try {
    const sparse = buildFocusMemoryEvent({
      publicationDate: DATE,
      revision: 1,
      selection: minimalSelection(),
    });
    const full = buildFocusMemoryEvent({
      publicationDate: DATE,
      revision: 2,
      selection: fullSelection(),
    });

    const s1 = await persistence.saveMemoryEventImmutable(uid, DATE, sparse);
    assert.equal(s1.ok, true, s1.error);
    const loaded1 = await persistence.getMemoryEvent(uid, DATE, 1);
    assert.equal(validateFocusMemoryEvent(loaded1).ok, true);
    assert.equal(
      assessMemoryEventRecoverability(loaded1, { publicationDate: DATE, revision: 1 }).recoverable,
      true,
    );

    const s2 = await persistence.saveMemoryEventImmutable(uid, DATE, full);
    assert.equal(s2.ok, true, s2.error);
    const loaded2 = await persistence.getMemoryEvent(uid, DATE, 2);
    assert.equal(validateFocusMemoryEvent(loaded2).ok, true);
    assert.equal(loaded2.selection.centerpiece.topicId, 'protein_gap');
    assert.equal(loaded2.selection.coach.templateId, 'COACH_SLEEP');
  } finally {
    await db.ref(`kentu_focus/${uid}`).set(null);
    await deleteEmulatorAdminApp();
  }
});
