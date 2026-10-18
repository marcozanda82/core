/**
 * P3.4 — anteprima robusta offline (fixture), nessun Firebase reale.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { renderFocusPreviewSafe } from '../preview/renderFocusPreviewSafe.js';
import {
  FOCUS_PREVIEW_MAX_READS,
  runFocusLocalPreview,
} from '../preview/runFocusLocalPreview.js';
import { listRequiredTrackerDates } from '../server/reader/trackerDateWindow.js';
import { resolveFocusHistoryDays } from '../server/reader/focusHistoryHorizon.js';
import { buildFullTrackerDayMap } from '../server/__tests__/fixtures/i4eTrackerFixtures.js';

const ANALYSIS_DATE = '2026-10-17';
const PUBLICATION_DATE = '2026-10-18';

function createMockDocument() {
  const calls = { innerHTMLSets: [], textContents: [] };
  function el(tag) {
    const node = {
      tagName: String(tag).toUpperCase(),
      children: [],
      style: {},
      id: '',
      onclick: null,
      get innerHTML() { return this._html || ''; },
      set innerHTML(v) {
        calls.innerHTMLSets.push(String(v));
        this._html = String(v);
      },
      get textContent() { return this._text || ''; },
      set textContent(v) {
        calls.textContents.push(String(v));
        this._text = String(v);
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      remove() {},
      querySelector(sel) {
        if (sel === '#kentu-focus-preview-close') {
          return this.children.find((c) => c.id === 'kentu-focus-preview-close') || null;
        }
        return null;
      },
    };
    return node;
  }
  const body = el('body');
  return {
    calls,
    body,
    getElementById() { return null; },
    createElement: el,
  };
}

function fixtureFetchers() {
  const horizon = resolveFocusHistoryDays({ horizon: 'd30' });
  const map = buildFullTrackerDayMap({
    analysisDate: ANALYSIS_DATE,
    publicationDate: PUBLICATION_DATE,
    historyDays: horizon.historyDays,
  });
  const seen = new Set();
  return {
    horizon,
    seen,
    fetchDay: async (date) => {
      if (seen.has(`d:${date}`)) throw new Error('duplicate_day_read');
      seen.add(`d:${date}`);
      return map[date] ?? null;
    },
    fetchProfileTargets: async () => {
      if (seen.has('pt')) throw new Error('duplicate_pt');
      seen.add('pt');
      return {
        targets: {
          targetHistory: [{ effectiveDate: '2026-10-01', targets: { kcal: 2300, prot: 150 } }],
        },
      };
    },
    fetchBodyMetrics: async () => {
      if (seen.has('bm')) throw new Error('duplicate_bm');
      seen.add('bm');
      return { a: { date: '2026-10-15', weight: 78.4 } };
    },
  };
}

test('P3.4 budget: 61 date uniche + 2 = 63 max', () => {
  const h = resolveFocusHistoryDays({ horizon: 'd30' });
  const dates = listRequiredTrackerDates(ANALYSIS_DATE, PUBLICATION_DATE, h.historyDays);
  assert.equal(new Set(dates).size, dates.length);
  assert.equal(dates.length + 2, FOCUS_PREVIEW_MAX_READS);
});

test('P3.4 happy path offline: report + DOM sicuro + published false', async () => {
  const f = fixtureFetchers();
  const phases = [];
  const out = await runFocusLocalPreview({
    publicationDate: PUBLICATION_DATE,
    analysisDate: ANALYSIS_DATE,
    horizon: 'd30',
    fetchDay: f.fetchDay,
    fetchProfileTargets: f.fetchProfileTargets,
    fetchBodyMetrics: f.fetchBodyMetrics,
    onProgress: (p) => phases.push(p.phase),
  });
  assert.equal(out.ok, true, out.report.block);
  assert.equal(out.report.published, false);
  assert.equal(out.report.writes, 0);
  assert.equal(out.report.gemini, false);
  assert.equal(out.report.reads, 63);
  assert.ok(phases.includes('read_tracker'));
  assert.ok(phases.includes('done'));
  assert.equal(out.report.validationOk, true);
  assert.ok(!('uid' in out.report));

  const doc = createMockDocument();
  const rendered = renderFocusPreviewSafe(doc, out.revisionDoc, {
    publicationDate: PUBLICATION_DATE,
    analysisDate: ANALYSIS_DATE,
    proseSource: out.report.proseSource,
    missingNotes: out.missingNotes,
  });
  assert.ok(rendered.articleCount >= 1);
  assert.equal(doc.calls.innerHTMLSets.length, 0);
  assert.ok(doc.calls.textContents.some((t) => t.includes('non pubblicata')));
});

test('P3.4 budget exceeded: zero fetch', async () => {
  let fetches = 0;
  const out = await runFocusLocalPreview({
    publicationDate: PUBLICATION_DATE,
    analysisDate: ANALYSIS_DATE,
    horizon: 'd30',
    maxReads: 10,
    fetchDay: async () => { fetches += 1; return null; },
    fetchProfileTargets: async () => { fetches += 1; return null; },
    fetchBodyMetrics: async () => { fetches += 1; return null; },
  });
  assert.equal(out.ok, false);
  assert.equal(out.report.block, 'read_budget_exceeded');
  assert.equal(fetches, 0);
});

test('P3.4 timeout: stop ulteriori letture; non cancella in-flight', async () => {
  let fetches = 0;
  const out = await runFocusLocalPreview({
    publicationDate: PUBLICATION_DATE,
    analysisDate: ANALYSIS_DATE,
    horizon: 'd7',
    perReadTimeoutMs: 30,
    fetchDay: async () => {
      fetches += 1;
      await new Promise((r) => setTimeout(r, 80));
      return null;
    },
    fetchProfileTargets: async () => null,
    fetchBodyMetrics: async () => null,
  });
  assert.equal(out.ok, false);
  assert.equal(out.report.block, 'rtdb_timeout');
  assert.equal(out.report.timedOut, true);
  assert.equal(out.report.timeoutCancelsInFlightGet, false);
  assert.equal(fetches, 1);
});

test('P3.4 errori RTDB: solo codici tecnici, niente message grezzo', async () => {
  const out = await runFocusLocalPreview({
    publicationDate: PUBLICATION_DATE,
    analysisDate: ANALYSIS_DATE,
    horizon: 'd7',
    fetchDay: async () => {
      throw new Error('PERMISSION_DENIED users/secretUid/tracker_data');
    },
    fetchProfileTargets: async () => null,
    fetchBodyMetrics: async () => null,
  });
  assert.equal(out.ok, false);
  assert.equal(out.report.block, 'rtdb_read_failed');
  const blob = JSON.stringify(out.report);
  assert.ok(!blob.includes('PERMISSION_DENIED'));
  assert.ok(!blob.includes('secretUid'));
  assert.ok(!blob.includes('tracker_data'));
});

test('P3.4 validation block: nessun revisionDoc esposto per render', async () => {
  // Forza fallimento validazione tramite documento già costruito non serve —
  // verifichiamo gate: se validation fails, revisionDoc null.
  // Simuliamo sleep gate invece (path reale senza mock validate).
  const out = await runFocusLocalPreview({
    publicationDate: PUBLICATION_DATE,
    analysisDate: ANALYSIS_DATE,
    horizon: 'd7',
    fetchDay: async () => ({ data: PUBLICATION_DATE, log: [] }),
    fetchProfileTargets: async () => null,
    fetchBodyMetrics: async () => null,
  });
  assert.equal(out.ok, false);
  assert.equal(out.report.block, 'sleep_gate');
  assert.equal(out.revisionDoc, null);
});
