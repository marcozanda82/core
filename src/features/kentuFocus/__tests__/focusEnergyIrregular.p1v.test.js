/**
 * P1V — energy_irregular: media a target ≠ aderenza costante.
 * Valori reali 22–28 ottobre (target 2456).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeEnergyIntakeVariability,
  assessEnergyIrregularity,
  formatEnergyExcursionSubtitle,
  findBannedPhrasesInAnalysis,
  buildFocusAiCoachSystemInstruction,
  validateFocusAiCoachResponse,
} from '../product/index.js';

const TARGET = 2456;
const OCT22_28 = Object.freeze([1902, 2166, 3196, 1893, 2577, 2369, 2913]);

describe('Focus energy_irregular P1v', () => {
  it('sette valori 22–28 ott: energy_irregular attivo con min/max/σ/oltre banda', () => {
    const v = computeEnergyIntakeVariability(OCT22_28, TARGET);
    assert.equal(v.recordedDays, 7);
    assert.equal(v.meanIntakeKcal, 2431);
    assert.equal(v.minIntakeKcal, 1893);
    assert.equal(v.maxIntakeKcal, 3196);
    assert.ok(v.stdevKcal != null && v.stdevKcal > TARGET * 0.15, `σ=${v.stdevKcal}`);
    assert.ok(v.daysBeyondBand >= 3, `beyond=${v.daysBeyondBand}`);
    assert.ok(v.daysAboveBand >= 1);
    assert.ok(v.daysBelowBand >= 1);
    assert.equal(v.irregular, true);

    const assessed = assessEnergyIrregularity({
      intakesKcal: OCT22_28,
      targetKcal: TARGET,
    });
    assert.equal(assessed.irregular, true);
    assert.match(formatEnergyExcursionSubtitle(assessed), /giorni tra 1900 e 3200 kcal/);
  });

  it('prompt vieta costante/stabile/regolare se energy_irregular', () => {
    const sys = buildFocusAiCoachSystemInstruction();
    assert.match(sys, /energy_irregular/i);
    assert.match(sys, /costante/i);
    assert.match(sys, /stabile/i);
    assert.match(sys, /regolare/i);
  });

  it('nessuna occorrenza di «costante» ammessa nel testo se irregular', () => {
    const bad = findBannedPhrasesInAnalysis({
      schema: 'kentu.focusAiCoachAnalysis.v4',
      headline: 'Energia ok',
      lead: 'L’aderenza energetica è costante rispetto al target.',
      sections: [],
      recommendedAction: 'Mantieni il ritmo dei pasti.',
      summary: {
        headline: 'Energia ok',
        wentWell: [{ text: 'Media vicina al target', area: 'energia', eventRefs: [] }],
        toImprove: [{ text: 'Cena più leggera', area: 'ritmo', eventRefs: [] }],
        todayAction: { text: 'Domani a cena porzione più contenuta.', toImproveIndex: 0, eventRefs: [] },
      },
      claimLayers: {
        recordedFacts: [],
        generalKnowledge: [],
        foundedInferences: [],
        hypothesesToTest: [],
      },
      quantitativeProposal: null,
    }, { energyIrregular: true });
    assert.equal(bad.ok, false);
    assert.ok(bad.hits.some((h) => h.label === 'costante'));

    const ok = findBannedPhrasesInAnalysis({
      schema: 'kentu.focusAiCoachAnalysis.v4',
      headline: 'Escursioni ampie tra i giorni',
      lead: 'Media 2431 kcal vicino al target, ma i giorni vanno da 1893 a 3196.',
      sections: [{ id: 's1', title: 'Energia', body: 'Quattro giorni fuori banda ±15%.' }],
      recommendedAction: 'Riduci i picchi sopra le 2800 kcal.',
      summary: {
        headline: 'Escursioni ampie tra i giorni',
        wentWell: [{ text: 'Media 2431 vicino a 2456', area: 'energia', eventRefs: [] }],
        toImprove: [{ text: 'Giorni da 1900 a 3200 kcal', area: 'energia', eventRefs: [] }],
        todayAction: { text: 'Domani evita il picco serale.', toImproveIndex: 0, eventRefs: [] },
      },
      claimLayers: {
        recordedFacts: ['Media 2431 kcal'],
        generalKnowledge: [],
        foundedInferences: [],
        hypothesesToTest: [],
      },
      quantitativeProposal: null,
    }, { energyIrregular: true });
    assert.equal(ok.ok, true, JSON.stringify(ok.hits));
  });

  it('validatore rifiuta «costante» con dossier energy_irregular', () => {
    const dossier = {
      periodId: 'ieri',
      eventIndex: { aliases: [], events: [], byId: {}, byAlias: {} },
      deterministicSignals: {
        activeIds: ['energy_irregular'],
        signals: [{ id: 'energy_irregular', active: true }],
      },
      editorialReadingContext: {
        dayVersusRecent: {
          recent7dExcludingAnalysisDay: {
            irregular: true,
            minIntakeKcal: 1893,
            maxIntakeKcal: 3196,
            meanIntakeKcal: 2431,
            stdevKcal: 480,
            daysBeyondBand: 4,
            daysAboveBand: 2,
            daysBelowBand: 2,
          },
        },
      },
    };
    const raw = JSON.stringify({
      schema: 'kentu.focusAiCoachAnalysis.v4',
      summary: {
        headline: 'Media a target ma giorni irregolari',
        wentWell: [{ text: 'Media 2431 kcal vicino al target', area: 'energia', eventRefs: [] }],
        toImprove: [{ text: 'Escursione da 1900 a 3200 kcal', area: 'energia', eventRefs: [] }],
        todayAction: { text: 'Domani tieni la cena sotto le 700 kcal.', toImproveIndex: 0, eventRefs: [] },
      },
      headline: 'Media a target ma giorni irregolari',
      lead: 'Media 2431 kcal vicino al target 2456, ma l’aderenza energetica è costante.',
      sections: [{ id: 'energia', title: 'Energia', body: 'Media ok ma giorni sparsi.' }],
      keyInsight: null,
      recommendedAction: 'Domani tieni la cena sotto le 700 kcal.',
      expectedChange: 'Meno picchi.',
      verifyNext: 'Controlla i prossimi 3 giorni.',
      evidenceRefs: [],
      limits: [],
      claimLayers: {
        recordedFacts: [],
        generalKnowledge: [],
        foundedInferences: [],
        hypothesesToTest: [],
      },
      quantitativeProposal: null,
    });
    const validated = validateFocusAiCoachResponse(raw, { dossier, requireSummary: true });
    assert.equal(validated.ok, false);
    assert.equal(validated.reason, 'banned_user_facing_phrase');
    assert.ok((validated.bannedHits || []).some((h) => /costante/i.test(h.label)));
  });
});
