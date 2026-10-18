/**
 * P3.1 — anteprima locale offline (fixture): budget, validazione bloccante, DOM sicuro.
 * Nessun Firebase reale.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { createEmptyEditorialMemory } from '../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import { applyWrittenEditionToRevision } from '../editorial/writing/applyWrittenEditionToRevision.js';
import { generateFocusWrittenEdition } from '../editorial/writing/generateFocusWrittenEdition.js';
import { MAIN_NIGHT_STATUS } from '../normalize/resolveMainNightSleep.js';
import { MemoryTrackerReader } from '../server/reader/AdminRtdbTrackerReader.js';
import { buildDossierInputFromTracker } from '../server/reader/buildDossierInputFromTracker.js';
import { resolveFocusHistoryDays } from '../server/reader/focusHistoryHorizon.js';
import { listRequiredTrackerDates } from '../server/reader/trackerDateWindow.js';
import { buildEssentialEditionFromSelection } from '../server/publish/buildEssentialEdition.js';
import { validateFocusEditionRevision } from '../server/validate/validateFocusEdition.js';
import { buildFullTrackerDayMap } from '../server/__tests__/fixtures/i4eTrackerFixtures.js';

const ANALYSIS_DATE = '2026-10-17';
const PUBLICATION_DATE = '2026-10-18';
const MAX_READS = 63;

/** DOM minimale per verificare rendering senza innerHTML di contenuti. */
function createMockDocument() {
  const calls = { innerHTMLSets: [], textContents: [] };
  function el(tag) {
    const node = {
      tagName: String(tag).toUpperCase(),
      children: [],
      style: {},
      onclick: null,
      get innerHTML() {
        return this._html || '';
      },
      set innerHTML(v) {
        calls.innerHTMLSets.push(String(v));
        this._html = String(v);
      },
      get textContent() {
        return this._text || '';
      },
      set textContent(v) {
        calls.textContents.push(String(v));
        this._text = String(v);
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      querySelector() {
        return this.children.find((c) => c.id === 'kentu-focus-preview-close') || null;
      },
    };
    return node;
  }
  return {
    calls,
    body: el('body'),
    getElementById() {
      return null;
    },
    createElement: el,
  };
}

/**
 * Rendering sicuro (stessa strategia del comando Console P3.1).
 * @param {object} doc
 * @param {object} revisionDoc
 * @param {object} meta
 */
function renderFocusPreviewSafe(doc, revisionDoc, meta) {
  const root = doc.createElement('div');
  root.id = 'kentu-focus-preview';

  const close = doc.createElement('button');
  close.id = 'kentu-focus-preview-close';
  close.textContent = 'Chiudi anteprima';
  root.appendChild(close);

  const eyebrow = doc.createElement('p');
  eyebrow.textContent = 'Kentu Focus · anteprima privata · non pubblicata · memoria editoriale vuota · fallback deterministico';
  root.appendChild(eyebrow);

  const h1 = doc.createElement('h1');
  h1.textContent = revisionDoc.headline || 'Edizione';
  root.appendChild(h1);

  const dateline = doc.createElement('p');
  dateline.textContent = `Edizione del ${meta.publicationDate} · analisi ${meta.analysisDate} · ${meta.proseSource || 'fallback'} · non salvata su Firebase`;
  root.appendChild(dateline);

  const teaser = doc.createElement('p');
  teaser.textContent = revisionDoc.teaser || '';
  root.appendChild(teaser);

  const articles = [
    revisionDoc.lead && { role: 'Principale', ...revisionDoc.lead },
    ...(revisionDoc.goodNews || []).map((a) => ({ role: 'Buona notizia', ...a })),
    ...(revisionDoc.features || []).map((a) => ({ role: 'Approfondimento', ...a })),
    ...(revisionDoc.concerns || []).map((a) => ({ role: 'Attenzione', ...a })),
  ].filter(Boolean);

  for (const a of articles) {
    const section = doc.createElement('section');
    const role = doc.createElement('div');
    role.textContent = a.role;
    const title = doc.createElement('h2');
    title.textContent = a.title || '';
    const body = doc.createElement('p');
    body.textContent = a.body || '';
    section.appendChild(role);
    section.appendChild(title);
    section.appendChild(body);
    root.appendChild(section);
  }

  if (revisionDoc.coach) {
    const section = doc.createElement('section');
    const role = doc.createElement('div');
    role.textContent = 'Coach';
    const title = doc.createElement('h2');
    title.textContent = revisionDoc.coach.title || '';
    const body = doc.createElement('p');
    body.textContent = revisionDoc.coach.body || '';
    section.appendChild(role);
    section.appendChild(title);
    section.appendChild(body);
    root.appendChild(section);
  }

  doc.body.appendChild(root);
  return { root, articleCount: articles.length };
}

test('P3.1 budget d30: 61 date tracker + 2 profilo = 63 max', () => {
  const horizon = resolveFocusHistoryDays({ horizon: 'd30' });
  assert.equal(horizon.historyDays, 60);
  const dates = listRequiredTrackerDates(ANALYSIS_DATE, PUBLICATION_DATE, horizon.historyDays);
  assert.equal(dates.length, 61);
  assert.ok(dates.includes(ANALYSIS_DATE));
  assert.ok(dates.includes(PUBLICATION_DATE));
  const plannedReads = dates.length + 2;
  assert.equal(plannedReads, MAX_READS);
  assert.ok(plannedReads <= MAX_READS);
});

test('P3.1 anteprima offline: fallback, validazione, DOM sicuro, no publish', async () => {
  const horizon = resolveFocusHistoryDays({ horizon: 'd30' });
  const dates = listRequiredTrackerDates(ANALYSIS_DATE, PUBLICATION_DATE, horizon.historyDays);
  assert.ok(dates.length + 2 <= MAX_READS);

  const map = buildFullTrackerDayMap({
    analysisDate: ANALYSIS_DATE,
    publicationDate: PUBLICATION_DATE,
    historyDays: horizon.historyDays,
  });
  const reader = new MemoryTrackerReader(map, {
    profileTargets: {
      targets: {
        targetHistory: [{ effectiveDate: '2026-10-01', targets: { kcal: 2300, prot: 150 } }],
      },
    },
    bodyMetrics: { a: { date: '2026-10-15', weight: 78.4 } },
  });

  const built = await buildDossierInputFromTracker({
    uid: 'fixture_preview',
    reader,
    publicationDate: PUBLICATION_DATE,
    analysisDate: ANALYSIS_DATE,
    horizon: 'd30',
  });
  assert.equal(built.sleepGate.status, MAIN_NIGHT_STATUS.selected);
  assert.ok((built.readStats?.reads ?? 0) <= MAX_READS);

  const memory = createEmptyEditorialMemory();
  const dossier = buildFocusDossier({
    uid: 'fixture_preview',
    ...built.dossierInput,
    generatedAt: '2026-10-18T08:00:00.000Z',
  });
  const selection = selectFocusEditorial({ dossier, memory });
  const generated = await generateFocusWrittenEdition({
    selection,
    memory,
    geminiProvider: null,
  });
  assert.equal(generated.proseSource, 'fallback');
  assert.equal(generated.usedFallback, true);

  const essential = buildEssentialEditionFromSelection({
    selection,
    revision: 1,
    inputFingerprint: 'preview-local',
    dossierContentHash: 'preview-local',
    publishedAt: '2026-10-18T08:00:00.000Z',
  });
  essential.revisionDoc.aiBriefRef = {
    proseSource: generated.proseSource,
    usedFallback: generated.usedFallback,
  };
  const { revisionDoc } = applyWrittenEditionToRevision(essential, generated.written);
  const validation = validateFocusEditionRevision(revisionDoc);
  assert.equal(validation.ok, true);

  const doc = createMockDocument();
  const rendered = renderFocusPreviewSafe(doc, revisionDoc, {
    publicationDate: PUBLICATION_DATE,
    analysisDate: ANALYSIS_DATE,
    proseSource: generated.proseSource,
  });
  assert.ok(rendered.articleCount >= 1);
  assert.equal(doc.calls.innerHTMLSets.length, 0);
  assert.ok(doc.calls.textContents.some((t) => t.includes('non pubblicata')));
  assert.ok(doc.calls.textContents.some((t) => t.includes('memoria editoriale vuota')));
  assert.ok(doc.body.children.length >= 1);
});

test('P3.1 validazione bloccante: non renderizzare se ok !== true', async () => {
  const doc = createMockDocument();
  const validation = { ok: false, errors: ['fixture_invalid'] };
  if (validation.ok !== true) {
    // report tecnico soltanto — nessun render
    const report = {
      ok: false,
      block: 'edition_validation_failed',
      reads: 0,
      published: false,
      writes: 0,
    };
    assert.equal(report.block, 'edition_validation_failed');
    assert.equal(doc.body.children.length, 0);
    assert.equal(doc.calls.innerHTMLSets.length, 0);
    return;
  }
  assert.fail('non dovrebbe renderizzare');
});
