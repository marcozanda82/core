/**
 * Prima pagina prodotto Kentu Focus — dashboard V2 view-model.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FOCUS_PRODUCT_DEMO_BANNER,
  FOCUS_PRODUCT_PERIODS,
  buildFocusProductChartSeries,
  buildFocusProductEdition,
  mapWrittenEditionToCoachSections,
  resolveFocusProductPeriod,
} from '../product/index.js';
import {
  buildFocusDemoProfilePack,
  buildFocusDemoTrackerHistory,
} from '../product/buildFocusDemoTrackerHistory.js';
import { buildFocusDossierFromInMemoryHistory } from '../lab/runFocusEditorialBench.js';

describe('Kentu Focus product page P1', () => {
  it('risolve i tre periodi sui preset calendario validati', () => {
    assert.equal(FOCUS_PRODUCT_PERIODS.length, 3);
    const ieri = resolveFocusProductPeriod('ieri');
    const settimana = resolveFocusProductPeriod('settimana');
    const mese = resolveFocusProductPeriod('mese');
    assert.equal(ieri.preset.publicationDate, '2026-10-19');
    assert.equal(settimana.preset.publicationDate, '2026-10-18');
    assert.equal(mese.preset.publicationDate, '2026-10-01');
  });

  it('mappa good/concern/feature e tiene il coach fuori dalle card', () => {
    const mapped = mapWrittenEditionToCoachSections({
      written: {
        mastheadTeaser: 'Titolo masthead ripetibile',
        analysisDate: '2026-10-18',
        publicationDate: '2026-10-19',
        openingMode: 'progress',
        proseSource: 'fallback',
        articles: [
          {
            id: 'lead1',
            role: 'lead',
            title: 'Lead ripetuto',
            body: 'Lead body.',
            evidenceIds: ['path.l'],
            metricsCited: [],
            cautions: [],
          },
          {
            id: 'a1',
            role: 'good',
            title: 'Bene seed',
            body: 'Corpo bene.',
            evidenceIds: ['path.a'],
            metricsCited: [{ path: 'path.a', value: 1, provenance: 'recorded' }],
            cautions: [],
          },
          {
            id: 'a2',
            role: 'concern',
            title: 'Attenzione seed',
            body: 'Corpo attenzione.',
            evidenceIds: [],
            metricsCited: [{ path: 'path.b', value: 2, provenance: 'estimated' }],
            cautions: ['contesto'],
          },
          {
            id: 'cp',
            role: 'centerpiece',
            title: 'Centerpiece week',
            body: 'Storia centrale.',
            evidenceIds: ['path.c'],
            metricsCited: [],
            cautions: [],
          },
        ],
        coach: {
          id: 'coach1',
          templateId: 'SLEEP_ROUTINE',
          title: 'Nota del coach',
          body: 'Invito leggero.',
        },
      },
      selection: { lead: { tone: 'progress' } },
    });

    assert.equal(mapped.sections.bene.primary?.title, 'Bene seed');
    assert.equal(mapped.sections.attenzione.primary?.title, 'Attenzione seed');
    assert.equal(mapped.sections.migliora.primary?.title, 'Centerpiece week');
    assert.equal(mapped.sections.migliora.items.some((i) => i.isCoach), false);
    assert.equal(mapped.coachAdvice?.body, 'Invito leggero.');
    assert.equal(mapped.deepenArticles.length, 4);
  });

  it('costruisce edizioni demo distinte per periodo (headline ≠ masthead ripetuto)', async () => {
    /** @type {Record<string, object>} */
    const byPeriod = {};
    for (const period of FOCUS_PRODUCT_PERIODS) {
      const edition = await buildFocusProductEdition(period.id);
      assert.equal(edition.ok, true, period.id);
      assert.equal(edition.demo, true);
      assert.equal(edition.demoBanner, FOCUS_PRODUCT_DEMO_BANNER);
      assert.ok(edition.headline?.title?.includes(period.label));
      assert.ok(edition.charts?.ok);
      assert.ok((edition.charts.charts || []).length >= 3);
      byPeriod[period.id] = edition;
    }

    // Hero diversi per finestra calendario (non lo stesso masthead sleep)
    assert.notEqual(
      byPeriod.ieri.headline.subtitle,
      byPeriod.settimana.headline.subtitle,
    );
    assert.notEqual(
      byPeriod.settimana.headline.subtitle,
      byPeriod.mese.headline.subtitle,
    );

    // Pezzo "Cosa fare ora" week/month: centerpiece distinti se presenti
    const weekAction = byPeriod.settimana.coachView.sections.migliora.primary?.title || null;
    const monthAction = byPeriod.mese.coachView.sections.migliora.primary?.title || null;
    if (weekAction && monthAction) {
      assert.notEqual(weekAction, monthAction);
    }
  });

  it('serie grafiche: missing ≠ zero; solo valori registrati numerici', () => {
    const fullHistory = buildFocusDemoTrackerHistory();
    const pack = buildFocusDemoProfilePack();
    const built = buildFocusDossierFromInMemoryHistory({
      fullHistory,
      fullHistoryLoadState: 'ready',
      publicationDate: '2026-10-18',
      historyDays: 45,
      ...pack,
    });
    assert.equal(built.ok, true);

    // Giorno senza nodo → missing esplicito
    delete fullHistory['trackerStorico_2026-10-13'];

    const charts = buildFocusProductChartSeries({
      periodId: 'settimana',
      dossier: built.dossier,
      fullHistory,
      dates: {
        analysisDate: '2026-10-17',
        publicationDate: '2026-10-18',
        weekWindow: {
          fromDate: '2026-10-11',
          toDate: '2026-10-17',
          sleepWakeFrom: '2026-10-11',
          sleepWakeTo: '2026-10-17',
        },
      },
    });

    assert.equal(charts.ok, true);
    const protein = charts.charts.find((c) => c.id === 'protein');
    assert.ok(protein);
    const gap = protein.points.find((p) => p.date === '2026-10-13');
    assert.ok(gap);
    assert.equal(gap.value, null);
    assert.notEqual(gap.status, 'recorded');
    for (const p of protein.points) {
      if (p.status !== 'recorded') assert.equal(p.value, null);
    }
  });
});
