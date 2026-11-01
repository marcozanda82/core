/**
 * P1Y — heavy_late_meal (soglia assoluta + quota giorno) + energy_low_day
 * + priorità toImprove / todayAction mattina sul fixture 2026-10-30 corretto.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  assessEnergyLowDay,
  assessHeavyLateMeal,
  ENERGY_LOW_DAY_DEFICIT_RATIO,
  HEAVY_LATE_MEAL_ABS_KCAL,
  HEAVY_LATE_MEAL_DAY_SHARE,
} from '../product/focusMealEnergySignals.js';
import {
  resolveFocusPageSession,
  buildFocusAiCoachDossier,
  validateFocusAiCoachResponse,
  buildFocusAiCoachSystemInstruction,
  buildFocusAiCoachUserPrompt,
  __resetFocusDiaryHandoffForTests,
} from '../product/index.js';

const TARGET = 2456;
const OCT30 = '2026-10-30';
const OCT31 = '2026-10-31';
const OCT29 = '2026-10-29';

function food(id, name, { mealType, mealTime, kcal, prot = 10, carb = 20, fat = 5 }) {
  return {
    type: 'food',
    id,
    name,
    desc: name,
    foodName: name,
    label: name,
    mealType,
    mealTime,
    time: mealTime,
    grams: 100,
    qta: 100,
    kcal,
    cal: kcal,
    prot,
    protein: prot,
    carb,
    fat,
    entrySource: 'chat',
    status: 'resolved',
    foodDbKey: `food_${id}`,
  };
}

/**
 * Diario corretto 2026-10-30: 1509 kcal, caffè colazione, pranzo 14:51, cena 752 @ 21:20.
 */
function buildCorrectedOct30History() {
  const coffee = food('caf', 'Caffè', {
    mealType: 'colazione',
    mealTime: 8.5,
    kcal: 5,
    prot: 0,
    carb: 1,
    fat: 0,
  });
  const lunchItems = [
    food('l1', 'Riso', { mealType: 'pranzo', mealTime: 14.85, kcal: 400, carb: 80, prot: 8, fat: 2 }),
    food('l2', 'Pollo', { mealType: 'pranzo', mealTime: 14.85, kcal: 280, prot: 45, carb: 0, fat: 10 }),
    food('l3', 'Verdure', { mealType: 'pranzo', mealTime: 14.85, kcal: 72, prot: 3, carb: 12, fat: 1 }),
  ];
  const dinnerItems = [
    food('d1', 'Pasta', { mealType: 'cena', mealTime: 21.333, kcal: 420, carb: 70, prot: 12, fat: 8 }),
    food('d2', 'Pesce', { mealType: 'cena', mealTime: 21.333, kcal: 250, prot: 35, carb: 0, fat: 12 }),
    food('d3', 'Insalata', { mealType: 'cena', mealTime: 21.333, kcal: 82, prot: 2, carb: 8, fat: 4 }),
  ];
  const dayKcal = [coffee, ...lunchItems, ...dinnerItems]
    .reduce((s, i) => s + (Number(i.kcal) || 0), 0);
  assert.equal(dayKcal, 1509);

  const prevDinner = [
    food('p1', 'Pasta sera', { mealType: 'cena', mealTime: 20.5, kcal: 600, prot: 20, carb: 80, fat: 15 }),
  ];

  return {
    [`trackerStorico_${OCT29}`]: {
      data: OCT29,
      mealTimes: { cena: 20.5 },
      log: [{ type: 'meal', desc: 'Cena', mealId: 'cena', items: prevDinner }],
    },
    [`trackerStorico_${OCT30}`]: {
      data: OCT30,
      mealTimes: {
        colazione: 8.5,
        pranzo: 14.85,
        cena: 21.333,
      },
      log: [
        { type: 'meal', desc: 'Colazione', mealId: 'colazione', items: [coffee] },
        { type: 'meal', desc: 'Pranzo', mealId: 'pranzo', items: lunchItems },
        { type: 'meal', desc: 'Cena', mealId: 'cena', items: dinnerItems },
      ],
    },
    [`trackerStorico_${OCT31}`]: {
      data: OCT31,
      mealTimes: {},
      log: [],
    },
  };
}

/**
 * Bozza rapporto coerente con le nuove regole (senza Gemini).
 * @param {object} dossier
 */
function buildCorrectedOct30ReportJson(dossier) {
  const energy = dossier.deterministicSignals?.energyLowDay
    || (dossier.deterministicSignals?.signals || []).find((s) => s.id === 'energy_low_day');
  const dayKcal = energy?.dayIntakeKcal
    ?? dossier.nutrition?.usableMacros?.kcal
    ?? 1509;
  const target = energy?.targetKcal ?? TARGET;
  const deficit = Math.round(target - dayKcal);
  const firstMeal = energy?.firstMealHour;
  const morningAction = energy?.preferMorningAction !== false;

  const headline = `Sotto target di ${deficit} kcal`;
  const toImprove = [
    {
      text: `Introito a ${dayKcal} kcal contro ${target}: manca energia nella prima parte della giornata.`,
      area: 'energia',
      eventRefs: [],
    },
  ];
  const todayAction = {
    text: morningAction
      ? 'Domani anticipa il pranzo verso le 12:30 e alza l’introito.'
      : 'Domani alza l’introito verso il target con un pasto in più al mattino.',
    toImproveIndex: 0,
    eventRefs: [],
  };

  return {
    schema: 'kentu.focusAiCoachAnalysis.v4',
    summary: {
      headline,
      wentWell: [
        { text: 'Cena moderata, senza picchi serali fuori scala.', area: 'ritmo', eventRefs: [] },
        { text: 'Qualità proteica a pranzo e cena accettabile.', area: 'qualita', eventRefs: [] },
      ],
      toImprove,
      todayAction,
    },
    headline,
    lead: `Il ${OCT30.slice(8)}/10 l’introito è ${dayKcal} kcal (target ${target}); la media recente può restare più vicina al riferimento — dettaglio in approfondimento.`,
    sections: [
      {
        id: 'energia',
        title: 'Energia',
        body: `Giorno a ${dayKcal} kcal contro ${target}. La media dei giorni precedenti va letta qui, non nel titolo.`,
      },
    ],
    keyInsight: null,
    recommendedAction: todayAction.text,
    expectedChange: 'Introito più vicino al target senza concentrare tutto a cena.',
    verifyNext: 'Ora del primo pasto e kcal totali nei prossimi 3 giorni.',
    evidenceRefs: [],
    limits: ['Nessuna attività registrata nel giorno analizzato.'],
    claimLayers: {
      recordedFacts: [
        `Introito ${dayKcal} kcal`,
        `Target ${target} kcal`,
        firstMeal != null ? `Primo pasto verso le ${String(firstMeal).replace('.', ':')}` : 'Primo pasto registrato',
      ].filter(Boolean),
      generalKnowledge: [],
      foundedInferences: ['Deficit giornaliero >25% del target dichiarato.'],
      hypothesesToTest: ['Anticipare il primo pasto alza l’introito senza alzare la cena.'],
    },
    primaryPillarId: 'nutrition',
    quantitativeProposal: null,
  };
}

describe('focusMealEnergySignals P1Y — soglie', () => {
  it('752 kcal in giorno 1509 / target 2456 → NON heavy_late_meal', () => {
    const h = assessHeavyLateMeal(752, 1509, TARGET);
    assert.equal(h.active, false);
    assert.equal(h.absoluteOk, false);
    assert.ok(h.shareOfDay != null && h.shareOfDay >= HEAVY_LATE_MEAL_DAY_SHARE);
    assert.match(h.detail, /sotto la soglia assoluta|non segnalata come abbondante/i);
  });

  it('1126 kcal in giorno 2369 / target 2456 → heavy_late_meal (Oct27)', () => {
    const h = assessHeavyLateMeal(1126, 2369, TARGET);
    assert.equal(h.active, true);
    assert.equal(h.absoluteOk, true);
    assert.equal(h.shareOk, true);
    assert.ok(h.dinnerKcal >= HEAVY_LATE_MEAL_ABS_KCAL);
  });

  it('900 kcal ma solo 30% del giorno → non heavy', () => {
    const h = assessHeavyLateMeal(900, 3000, TARGET);
    assert.equal(h.absoluteOk, true);
    assert.equal(h.shareOk, false);
    assert.equal(h.active, false);
  });

  it('energy_low_day: 1509 vs 2456 (>25%) attivo + preferMorningAction se primo pasto ≥13', () => {
    const e = assessEnergyLowDay(1509, TARGET, {
      firstMealHour: 14.85,
      overnightFastHours: 18,
    });
    assert.equal(e.active, true);
    assert.ok(e.deficitRatio > ENERGY_LOW_DAY_DEFICIT_RATIO);
    assert.equal(e.firstMealAfter13, true);
    assert.equal(e.overnightFastOver14h, true);
    assert.equal(e.preferMorningAction, true);
  });

  it('energy_low_day inattivo se scostamento ≤25%', () => {
    const e = assessEnergyLowDay(TARGET * 0.8, TARGET, { firstMealHour: 8 });
    assert.equal(e.active, false);
  });
});

describe('Focus AI Coach P1Y — fixture 2026-10-30 corretto', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
  });

  it('prompt: regole energy_low / headline / mattina', () => {
    const sys = buildFocusAiCoachSystemInstruction();
    assert.match(sys, /energy_low_day/i);
    assert.match(sys, /PRIMO candidato|prima dei segnali di ritmo/i);
    assert.match(sys, /bilanciare un segnale negativo|media allineata/i);
    assert.match(sys, /preferMorningAction|primo pasto/i);
    assert.match(sys, /900 kcal|45%/i);
  });

  it('dossier: energy_low attivo, heavy_late inattivo; report toImprove energia + azione mattina', () => {
    const fullHistory = buildCorrectedOct30History();
    const session = resolveFocusPageSession({
      uid: 'uid_p1y_oct30',
      periodId: 'ieri',
      handoff: {
        uid: 'uid_p1y_oct30',
        fullHistory,
        analysisDate: OCT30,
        publicationDate: OCT31,
        userTargets: { kcal: TARGET, prot: 127, carb: 282, fat: 65 },
      },
    });
    const built = buildFocusAiCoachDossier(session, {
      foodCatalogs: {
        personalDb: {},
        kentuItDb: {},
        globalDb: {},
        offDb: {},
        offReady: true,
      },
    });
    assert.equal(built.ok, true, built.reason);
    const dossier = built.dossier;
    const dayKcal = dossier.nutrition?.usableMacros?.kcal;
    assert.ok(dayKcal != null && dayKcal >= 1400 && dayKcal <= 1600, `dayKcal=${dayKcal}`);

    const active = new Set(dossier.deterministicSignals?.activeIds || []);
    assert.equal(active.has('energy_low_day'), true);
    assert.equal(active.has('heavy_late_meal'), false);

    const heavy = (dossier.deterministicSignals?.signals || [])
      .find((s) => s.id === 'heavy_late_meal');
    assert.ok(heavy);
    assert.equal(heavy.active, false);

    const energy = dossier.deterministicSignals?.energyLowDay;
    assert.equal(energy?.active, true);
    assert.equal(energy?.preferMorningAction, true);

    const userPrompt = buildFocusAiCoachUserPrompt(dossier);
    assert.match(userPrompt, /PRIORITÀ IERI: energy_low_day/i);
    assert.match(userPrompt, /primo pasto|colazione|antici/i);

    const report = buildCorrectedOct30ReportJson(dossier);
    assert.equal(report.summary.toImprove[0].area, 'energia');
    const blob = [
      report.summary.headline,
      ...report.summary.toImprove.map((x) => x.text),
      report.summary.todayAction.text,
      report.recommendedAction,
    ].join(' ');
    assert.equal(/cena\s+(abbondante|consistente)|abbondante.*cena/i.test(blob), false);
    assert.match(report.summary.todayAction.text, /colazione|antici.*pranzo|mattin/i);
    assert.equal(/cena/i.test(report.summary.todayAction.text), false);

    const validated = validateFocusAiCoachResponse(JSON.stringify(report), {
      dossier,
      requireSummary: true,
    });
    assert.equal(validated.ok, true, validated.reason);
    assert.equal(validated.analysis.summary.toImprove[0].area, 'energia');
  });
});
