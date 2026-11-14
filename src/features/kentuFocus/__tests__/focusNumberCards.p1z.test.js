/**
 * P1Z — Card numeri Focus: qualità Buona/Mista/Da migliorare, energia ±15%, deep-link relativi.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFocusNumberCards,
  resolveFocusQualityCardStatus,
} from '../product/ui/buildFocusNumberCards.js';
import {
  buildFocusKentuDeepLinks,
  toFocusRelativeDeepLink,
} from '../product/focusKentuDeepLinks.js';
import { resolveFocusEvidenceRefs } from '../product/resolveFocusEvidenceRefs.js';
import { ENERGY_IRREGULAR_PCT } from '../product/focusEnergyVariability.js';

describe('Focus number cards P1Z', () => {
  it('qualità: valore stato, conteggi solo in sottotitolo', () => {
    assert.equal(resolveFocusQualityCardStatus({
      hasFood: true,
      nova4Items: [],
      wholeGrainFoods: [{ name: 'Pane integrale' }, { name: 'Avena' }],
    }), 'Buona');
    assert.equal(resolveFocusQualityCardStatus({
      hasFood: true,
      nova4Items: [{ name: 'Fondente', critiqueWorthy: false }],
      wholeGrainFoods: [],
    }), 'Mista');
    assert.equal(resolveFocusQualityCardStatus({
      hasFood: true,
      nova4Items: [{ name: 'Duchessa', critiqueWorthy: true }],
      wholeGrainFoods: [{ name: 'Avena' }],
    }), 'Da migliorare');

    const cards = buildFocusNumberCards({
      analysisDate: '2026-10-30',
      userTargets: { kcal: 2456 },
      nutrition: { ieri: { hasFood: true, totals: { kcal: { value: 1509 } }, meals: [] } },
      fullHistory: null,
    }, 'ieri', { toImproveAreas: ['energia'] });

    assert.equal(cards.energy.flagged, true);
    assert.ok(Math.abs(1509 - 2456) > 2456 * ENERGY_IRREGULAR_PCT);
    assert.match(String(cards.energy.value), /1[\s.]?509/);
  });

  it('1509 su 2456 → energia flagged (fuori ±15%) anche senza toImprove', () => {
    const cards = buildFocusNumberCards({
      analysisDate: '2026-10-30',
      userTargets: { kcal: 2456 },
      nutrition: { ieri: { hasFood: true, totals: { kcal: { value: 1509 } }, meals: [] } },
      fullHistory: null,
    }, 'ieri', { toImproveAreas: [] });
    assert.equal(cards.energy.hasData, true);
    assert.equal(cards.energy.flagged, true);
    assert.equal(cards.energy.outOfBand, true);
  });

  it('deep-link relativi e Forza/Cardio distinti', () => {
    assert.equal(
      toFocusRelativeDeepLink('http://localhost:5173/centro-analisi?area=progressione'),
      '/centro-analisi?area=progressione',
    );
    const links = buildFocusKentuDeepLinks({ analysisDate: '2026-10-30', periodId: 'ieri' });
    assert.equal(links.stimoloMuscolare.label, 'Forza e muscoli');
    assert.equal(links.cardio.label, 'Movimento');
    assert.notEqual(links.stimoloMuscolare.to, links.cardio.to);
    assert.match(links.stimoloMuscolare.to, /^\/centro-analisi/);
    assert.match(links.cardio.to, /^\/centro-analisi/);
    assert.equal(/^https?:/i.test(links.stimoloMuscolare.to), false);
  });

  it('evidenze: dedupe per label + ore in italiano', () => {
    const resolved = resolveFocusEvidenceRefs([
      'nutrition.meals',
      { id: 'nutrition.foodFrequency', label: 'Alimentazione (diario)', value: '2 pasti' },
      { id: 'sleep.day', label: 'Sonno / recupero', value: 'notte al risveglio: 7.5 h' },
    ], {
      dossier: {
        periodId: 'ieri',
        nutrition: { meals: [{}, {}] },
        sleep: { day: { hours: 7.5 } },
      },
    });
    const alimentazione = resolved.filter((r) => /alimentazione/i.test(r.label));
    assert.equal(alimentazione.length, 1);
    const sleep = resolved.find((r) => /sonno/i.test(r.label));
    assert.ok(sleep);
    assert.match(sleep.detail, /7 h 30/);
    assert.equal(/7\.5\s*h/i.test(sleep.detail), false);
  });
});
