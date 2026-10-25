/**
 * P1O — Qualità editoriale: contesto episodio vs media recente + mandato + validazione.
 * Nessuna Gemini reale. Fixture anonimizzata ispirata al 2026-10-24.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  stashFocusDiaryForUser,
  resolveFocusPageSession,
  buildFocusAiCoachDossier,
  previewFocusAiCoachPayload,
  validateFocusAiCoachResponse,
  normalizeFocusEditorialAnalysis,
  __resetFocusDiaryHandoffForTests,
} from '../product/index.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';

const DAY = '2026-10-24';
const PUB = '2026-10-25';
const TARGET = 2456;
const UID = 'uid-p1o-anon';

function append(history, date, items) {
  const key = `trackerStorico_${date}`;
  if (!history[key]) history[key] = { data: date, log: [] };
  history[key].log.push(...items);
}

/**
 * Giorno analisi: sopra target (~+740), allenamento mattutino, cena tardiva con pane 80 g.
 * Giorni precedenti: media introito ~2460 (vicino al target).
 */
function october24StyleHistory() {
  const h = {};
  // 7 giorni precedenti ≈ 2460 kcal/giorno
  for (let i = 7; i >= 1; i -= 1) {
    const d = addCalendarDays(DAY, -i);
    append(h, d, [
      {
        type: 'food', id: `yf${i}`, name: 'Yogurt', mealType: 'colazione', mealTime: 8,
        grams: 150, kcal: 140, prot: 12, carb: 10, fat: 4,
      },
      {
        type: 'food', id: `pf${i}`, name: 'Pasta', mealType: 'pranzo', mealTime: 13,
        grams: 100, kcal: 350, prot: 12, carb: 70, fat: 2,
      },
      {
        type: 'food', id: `cf${i}`, name: 'Pollo', mealType: 'cena', mealTime: 20,
        grams: 150, kcal: 250, prot: 45, carb: 0, fat: 6,
      },
      {
        type: 'food', id: `af${i}`, name: 'Olio', mealType: 'cena', mealTime: 20,
        grams: 15, kcal: 132, prot: 0, carb: 0, fat: 15,
      },
      {
        type: 'food', id: `sf${i}`, name: 'Snack', mealType: 'spuntino', mealTime: 16,
        grams: 40, kcal: 180, prot: 5, carb: 20, fat: 8,
      },
      // ~140+350+250+132+180 = 1052 — troppo basso; aggiungi base
      {
        type: 'food', id: `rf${i}`, name: 'Riso', mealType: 'pranzo', mealTime: 13,
        grams: 200, kcal: 700, prot: 14, carb: 150, fat: 2,
      },
      {
        type: 'food', id: `bf${i}`, name: 'Pane', mealType: 'colazione', mealTime: 8,
        grams: 60, kcal: 160, prot: 5, carb: 32, fat: 1,
      },
      {
        type: 'food', id: `mf${i}`, name: 'Frutta', mealType: 'spuntino', mealTime: 11,
        grams: 200, kcal: 100, prot: 1, carb: 25, fat: 0,
      },
      {
        type: 'food', id: `df${i}`, name: 'Formaggio', mealType: 'cena', mealTime: 20,
        grams: 40, kcal: 140, prot: 10, carb: 0, fat: 11,
      },
      {
        type: 'food', id: `uf${i}`, name: 'Verdure', mealType: 'cena', mealTime: 20,
        grams: 200, kcal: 50, prot: 2, carb: 8, fat: 0,
      },
      {
        type: 'food', id: `xf${i}`, name: 'Extra', mealType: 'spuntino', mealTime: 18,
        grams: 50, kcal: 258, prot: 4, carb: 30, fat: 12,
      },
    ]);
    // somma ≈ 2460
    append(h, addCalendarDays(d, 1), [
      { type: 'sleep', id: `s${i}`, hours: 7.5, wakeTime: 7, bedtime: 23 },
    ]);
  }

  // Giorno 24: surplus ~+740 vs 2456 → ~3196 kcal
  append(h, DAY, [
    {
      type: 'workout', id: 'w_am', name: 'Pesi · Full', workoutType: 'pesi',
      duration: 55, time: 8.5, muscles: ['Petto', 'Schiena'],
    },
    {
      type: 'food', id: 'b1', name: 'Uova', mealType: 'colazione', mealTime: 10,
      grams: 120, kcal: 180, prot: 15, carb: 1, fat: 12,
    },
    {
      type: 'food', id: 'b2', name: 'Pane', mealType: 'colazione', mealTime: 10,
      grams: 80, kcal: 210, prot: 7, carb: 40, fat: 2,
    },
    {
      type: 'food', id: 'l1', name: 'Riso', mealType: 'pranzo', mealTime: 13.5,
      grams: 220, kcal: 770, prot: 16, carb: 168, fat: 2,
    },
    {
      type: 'food', id: 'l2', name: 'Salmone', mealType: 'pranzo', mealTime: 13.5,
      grams: 180, kcal: 360, prot: 40, carb: 0, fat: 20,
    },
    {
      type: 'food', id: 's1', name: 'Yogurt', mealType: 'spuntino', mealTime: 17,
      grams: 200, kcal: 180, prot: 18, carb: 12, fat: 5,
    },
    {
      type: 'food', id: 'c1', name: 'Pasta', mealType: 'cena', mealTime: 22.5,
      grams: 140, kcal: 500, prot: 18, carb: 100, fat: 3,
    },
    {
      type: 'food', id: 'c2', name: 'Pane', mealType: 'cena', mealTime: 22.5,
      grams: 80, kcal: 210, prot: 7, carb: 40, fat: 2,
    },
    {
      type: 'food', id: 'c3', name: 'Formaggio', mealType: 'cena', mealTime: 22.5,
      grams: 50, kcal: 180, prot: 12, carb: 0, fat: 14,
    },
    {
      type: 'food', id: 'c4', name: 'Olio', mealType: 'cena', mealTime: 22.5,
      grams: 20, kcal: 176, prot: 0, carb: 0, fat: 20,
    },
    {
      type: 'food', id: 'c5', name: 'Verdure', mealType: 'cena', mealTime: 22.5,
      grams: 250, kcal: 60, prot: 3, carb: 10, fat: 0,
    },
    {
      type: 'food', id: 'x1', name: 'Cioccolato', mealType: 'spuntino', mealTime: 21,
      grams: 40, kcal: 210, prot: 3, carb: 22, fat: 12,
    },
    {
      type: 'food', id: 'x2', name: 'Frutta', mealType: 'spuntino', mealTime: 16,
      grams: 200, kcal: 100, prot: 1, carb: 25, fat: 0,
    },
  ]);
  // ~180+210+770+360+180+500+210+180+176+60+210+100 = 3136 ≈ surplus ~680; close enough
  append(h, PUB, [
    { type: 'sleep', id: 's_pub', hours: 7.2, wakeTime: 7, bedtime: 23.5 },
  ]);
  return h;
}

function sessionOct24() {
  stashFocusDiaryForUser(UID, {
    fullHistory: october24StyleHistory(),
    analysisDate: DAY,
    publicationDate: PUB,
    userTargets: { kcal: TARGET, prot: 140 },
  });
  return resolveFocusPageSession({ uid: UID, periodId: 'ieri' });
}

/** MOCK — esempio di risposta editoriale accettabile (non Gemini reale). */
const MOCK_GOOD_V3 = JSON.stringify({
  headline: 'Un giorno generoso sul piatto, mentre la settimana resta in linea',
  lead: 'Il 24 ottobre l’introito supera sensibilmente il target dichiarato, ma la media dei giorni precedenti resta vicina al riferimento: è un episodio, non una nuova traiettoria. L’allenamento è mattutino; la cena arriva tardi e abbondante — da osservare, senza inventare un danno al sonno.',
  sections: [
    {
      id: 'episodio',
      title: 'Episodio e contesto',
      body: 'Il contrasto utile è tra il giorno di analisi e la media recente: il primo è lontano dal target, la seconda no. La Bussola su Ieri legge l’episodio giornaliero; non va confusa con un verdetto settimanale.',
    },
    {
      id: 'timing',
      title: 'Allenamento al mattino, pasti dopo',
      body: 'La forza è in mattinata; gran parte dell’energia alimentare arriva dopo. Ha senso chiedersi se una parte dei carboidrati già registrati possa stare più vicino alla sessione — come ipotesi pratica, non come carenza dimostrata.',
    },
    {
      id: 'sera',
      title: 'Cena tardiva, senza certezze sul sonno',
      body: 'La cena è documentata a orario avanzato e consistente. In generale pasti molto tardivi possono disturbare l’addormentamento in alcune persone; sul diario non abbiamo fasi del sonno né qualità soggettiva, quindi non affermiamo che abbiano compromesso il sonno profondo.',
    },
  ],
  keyInsight: 'Scoperta: surplus giornaliero appariscente con media settimanale ancora allineata — il titolo merita il contrasto, non solo il +kcal del giorno.',
  recommendedAction: 'Se ripeti lo schema, valuta di spostare i 80 g di Pane della cena verso uno spuntino più vicino all’allenamento mattutino, lasciando invariato il resto della giornata.',
  expectedChange: 'Cambia soprattutto il timing del pane; le calorie del giorno restano sostanzialmente le stesse se non aggiungi o togli grammi netti.',
  verifyNext: 'Nelle prossime 1–2 settimane: energia in sala al mattino e comodità della sera, senza forzare digiuni.',
  evidenceRefs: [
    'editorialReadingContext.dayVersusRecent',
    'kentuEngines.energyPilot',
    'kentuEngines.bussola',
    'nutrition.meals',
  ],
  limits: [
    'Media recente su giorni registrati, non TDEE misurato.',
    'Nessuna misura diretta di sonno profondo o termogenesi individuale.',
  ],
  claimLayers: {
    recordedFacts: ['Giorno sopra target', 'Media recente vicina al target', 'Allenamento mattutino', 'Pane 80 g a cena'],
    generalKnowledge: ['Pasti molto tardivi possono influenzare l’addormentamento in alcune persone'],
    foundedInferences: ['Lo scostamento del 24 è un episodio rispetto alla media recente'],
    hypothesesToTest: ['Spostare 80 g di pane verso il peri-allenamento migliora la sensazione in sala'],
  },
  primaryPillarId: 'nutrition',
  quantitativeProposal: {
    foodName: 'Pane',
    grams: 80,
    fromMeal: 'cena',
    toTiming: 'spuntino peri-allenamento mattutino',
    rationale: 'Avvicinare carboidrati già registrati alla sessione',
    dailyKcalUnchanged: true,
  },
});

describe('Focus editorial quality P1O', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
  });

  it('dossier 24/10: giorno sopra target + media recente vicina + pane 80g + timing', () => {
    const built = buildFocusAiCoachDossier(sessionOct24());
    assert.equal(built.ok, true);
    const erc = built.dossier.editorialReadingContext;
    assert.ok(erc);
    const dvr = erc.dayVersusRecent;
    assert.ok(dvr);
    assert.equal(dvr.declaredTargetKcal, TARGET);
    assert.ok(dvr.day.intakeKcal > TARGET + 400, `day intake ${dvr.day.intakeKcal}`);
    assert.ok(
      dvr.recent7dExcludingAnalysisDay.meanIntakeKcal != null
      && Math.abs(dvr.recent7dExcludingAnalysisDay.meanIntakeKcal - TARGET) < 200,
      `recent mean ${dvr.recent7dExcludingAnalysisDay.meanIntakeKcal}`,
    );
    assert.equal(dvr.day.role, 'episode');
    assert.equal(dvr.recent7dExcludingAnalysisDay.role, 'recent_context');
    assert.match(dvr.readingHint || '', /episodio|media|traiettoria/i);

    assert.ok(erc.workoutTiming.morningTraining);
    assert.ok(erc.mealTiming.lateDinnerLikely);

    const pane80 = erc.redistributionCandidates.filter(
      (c) => /pane/i.test(c.foodName) && Number(c.grams) === 80,
    );
    assert.ok(pane80.length >= 1, 'Pane 80 g deve essere candidato verificabile');
    assert.ok(
      pane80.some((c) => /cena/i.test(String(c.fromMeal || ''))),
      'Pane 80 g a cena deve essere tra i candidati',
    );

    // eslint-disable-next-line no-console
    console.log('\n===== P1O_TEMPORAL_CONTEXT =====\n', JSON.stringify({
      day: dvr.day,
      recent: dvr.recent7dExcludingAnalysisDay,
      target: dvr.declaredTargetKcal,
      morningTraining: erc.workoutTiming,
      lateMeal: erc.mealTiming,
      paneCandidates: pane80,
    }, null, 2));
  });

  it('prompt espone contesto temporale e mandato anti-tecnico', () => {
    const preview = previewFocusAiCoachPayload(sessionOct24());
    assert.equal(preview.ok, true);
    assert.match(preview.systemText, /episodio|CONTESTO RECENTE|divulgatore/i);
    assert.match(preview.systemText, /sonno profondo|fisiolog/i);
    assert.match(preview.userText, /CONTESTO TEMPORALE/);
    assert.match(preview.userText, /Media recente 7g/);
    assert.match(preview.userText, /editorialReadingContext/);
    assert.match(preview.userText, /Pane|pane/);
    assert.match(preview.dossier.horizonBrief, /giorno|traiettoria/i);
  });

  it('validazione: rifiuta titolo tecnico e certezza sonno profondo; accetta MOCK buono', () => {
    const dossier = buildFocusAiCoachDossier(sessionOct24()).dossier;

    const badTitle = validateFocusAiCoachResponse(JSON.stringify({
      headline: 'Asimmetria serale e scarto energetico rispetto all’assetto operativo',
      lead: 'Giorno sopra target.',
      sections: [{ id: 'a', title: 'Energia', body: 'Surplus giornaliero.' }],
      recommendedAction: 'Riduci una frazione dell’introito glucidico-proteico.',
      verifyNext: 'Osserva una settimana.',
      primaryPillarId: 'nutrition',
    }), { dossier });
    assert.equal(badTitle.ok, false);
    assert.equal(badTitle.reason, 'technical_headline');

    const badSleep = validateFocusAiCoachResponse(JSON.stringify({
      headline: 'La cena tardi ha lasciato il segno',
      lead: 'La cena abbondante ha compromesso il sonno profondo e la termogenesi notturna.',
      sections: [{ id: 's', title: 'Sonno', body: 'Il sonno profondo risulta alterato dalla cena.' }],
      recommendedAction: 'Anticipa la cena.',
      verifyNext: 'Osserva.',
      primaryPillarId: 'sleep',
    }), { dossier });
    assert.equal(badSleep.ok, false);
    assert.equal(badSleep.reason, 'banned_clinical_or_score_claim');

    const vague = validateFocusAiCoachResponse(JSON.stringify({
      headline: 'Un giorno più carico del solito',
      lead: 'Episodio sopra target con media recente vicina.',
      sections: [{ id: 'a', title: 'Energia', body: 'Contrasto episodio/media.' }],
      recommendedAction: 'Riduci una frazione dell’introito glucidico-proteico serale.',
      verifyNext: 'Osserva.',
      primaryPillarId: 'nutrition',
    }), { dossier });
    assert.equal(vague.ok, false);
    assert.equal(vague.reason, 'vague_food_proposal_with_candidates');

    const good = validateFocusAiCoachResponse(MOCK_GOOD_V3, { dossier });
    assert.equal(good.ok, true, good.reason);
    assert.equal(good.analysis.schema, 'kentu.focusAiCoachAnalysis.v3');
    assert.equal(good.analysis.quantitativeProposal?.foodName, 'Pane');
    assert.equal(good.analysis.quantitativeProposal?.grams, 80);
    assert.equal(good.analysis.quantitativeProposal?.dailyKcalUnchanged, true);
    assert.match(good.analysis.expectedChange, /invariat|stess/i);

    const view = normalizeFocusEditorialAnalysis(good.analysis);
    // eslint-disable-next-line no-console
    console.log('\n===== P1O_MOCK_FULL_ANALYSIS (non Gemini) =====\n', JSON.stringify({
      _label: 'MOCK — esempio di analisi editoriale accettabile, non output Gemini reale',
      headline: view.headline,
      lead: view.lead,
      sections: view.sections,
      keyInsight: view.keyInsight,
      recommendedAction: view.recommendedAction,
      expectedChange: view.expectedChange,
      verifyNext: view.verifyNext,
      evidenceRefs: view.evidenceRefs,
      limits: view.limits,
      quantitativeProposal: view.quantitativeProposal,
    }, null, 2));
  });
});
