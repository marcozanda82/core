/**
 * P5.2 / P5.2.2 — laboratorio JSON Focus (offline, nessuna I/O).
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildFocusLabDossier,
  buildSimulatedAnalysisDayNode,
  classifyActivityHint,
  FOCUS_LAB_DOSSIER_SCHEMA,
  summarizeFocusLabDossier,
} from '../lab/buildFocusLabDossier.js';
import {
  resolveFocusLabEditionDates,
  resolveFocusLabHistoryGate,
} from '../lab/focusLabHistoryGate.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
} from './fixtures/focusDayFixtures.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';

function buildHistoryTreeFromFixture(fixture, historyDays = 12) {
  /** @type {Record<string, object>} */
  const fullHistory = {};
  fullHistory[`trackerStorico_${fixture.analysisDate}`] = fixture.analysisDayNode;
  fullHistory[`trackerStorico_${fixture.publicationDate}`] = fixture.publicationDayNode;

  for (let i = 1; i < historyDays; i += 1) {
    const date = addCalendarDays(fixture.analysisDate, -i);
    fullHistory[`trackerStorico_${date}`] = {
      data: date,
      log: [
        {
          type: 'food',
          id: `food_${date}`,
          mealType: 'pranzo',
          mealTime: 13,
          name: `Pasto ${date}`,
          kcal: 600 + i,
          prot: 40,
          carb: 50,
          fat: 20,
          fibre: 5,
          note: `nota privata ${date}`,
        },
        {
          type: 'workout',
          id: `w_${date}`,
          name: i % 2 === 0 ? 'Camminata' : 'Pesi full body',
          duration: 40,
          kcal: 200,
          notes: `allenamento ${date}`,
        },
      ],
    };
    const sleepDate = addCalendarDays(date, 1);
    if (!fullHistory[`trackerStorico_${sleepDate}`]) {
      fullHistory[`trackerStorico_${sleepDate}`] = {
        data: sleepDate,
        log: [
          {
            type: 'sleep',
            id: `sleep_${sleepDate}`,
            hours: 7,
            wakeTime: 7,
            bedtime: 23,
            quality: 4,
            deepMin: 60,
            remMin: 60,
          },
        ],
      };
    }
  }
  return fullHistory;
}

const READY = { historyLoadState: 'ready' };

describe('P5.2.2 focusLabDossier', () => {
  it('date Focus standard: publication=reference, analysis=giorno prima', () => {
    const dates = resolveFocusLabEditionDates({
      editionMode: 'focus_standard',
      referenceDate: '2026-10-18',
    });
    assert.equal(dates.publicationDate, '2026-10-18');
    assert.equal(dates.analysisDate, '2026-10-17');
    assert.equal(dates.analyzedDayRole, 'calendar_yesterday_vs_publication');
  });

  it('scenario simulato: analysis=giorno tracker, non chiamato yesterday', () => {
    const dates = resolveFocusLabEditionDates({
      editionMode: 'simulated_scenario',
      referenceDate: '2026-10-18',
      simulatedAnalysisDate: '2026-10-18',
    });
    assert.equal(dates.analysisDate, '2026-10-18');
    assert.equal(dates.publicationDate, '2026-10-19');
    assert.equal(dates.analyzedDayRole, 'simulated_tracker_day');
  });

  it('origine reale: no simulatedLog; notte su publicationDate', () => {
    const fixture = buildFullDayFixture();
    const fullHistory = buildHistoryTreeFromFixture(fixture, 35);
    const dossier = buildFocusLabDossier({
      ...READY,
      editionMode: 'focus_standard',
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      dataOrigin: 'real',
      fullHistory,
      simulatedLog: [{ type: 'food', id: 'should_not_appear', name: 'SIM ONLY', kcal: 1 }],
      exportTier: 'essential',
      exportedAt: '2026-10-18T12:00:00.000Z',
    });

    assert.equal(dossier.schema, FOCUS_LAB_DOSSIER_SCHEMA);
    assert.equal(dossier.dataSource.dataOrigin, 'real');
    assert.equal(dossier.dataSource.containsSimulatedData, false);
    assert.equal(dossier.dataSource.firebaseWrites, 0);
    assert.equal(dossier.dataSource.gemini, false);
    assert.equal(dossier.dataSource.publish, false);
    assert.ok(dossier.analysisDay);
    assert.equal(dossier.yesterday, undefined);
    assert.equal(dossier.analysisDay.role, 'calendar_yesterday_vs_publication');
    assert.equal(dossier.lastCompletedNight.storageDate, PUBLICATION_DATE);
    assert.equal(dossier.lastCompletedNight.stagesNote, 'placeholder_stages_detected');
    assert.equal(JSON.stringify(dossier).includes('SIM ONLY'), false);
    assert.equal(dossier.history.d10.dailySummaries.length, 10);
    assert.equal(dossier.history.d30.presentedAsComplete, true);
    assert.ok(dossier.history.d30.workoutHistory.length > 0);
  });

  it('origine simulata: dichiara simulated; nodo puro senza merge reale', () => {
    const fixture = buildFullDayFixture();
    const fullHistory = buildHistoryTreeFromFixture(fixture, 12);
    // Nodo reale con mealTimes/manualNodes che NON devono entrare nel giorno simulato
    fullHistory[`trackerStorico_${ANALYSIS_DATE}`] = {
      ...fixture.analysisDayNode,
      mealTimes: { colazione: 5 },
      manualNodes: [{ type: 'food', id: 'manual_real', name: 'Manual REAL', kcal: 999, mealType: 'snack' }],
    };

    const simulatedLog = [
      {
        type: 'food',
        id: 'sim_food',
        mealType: 'colazione',
        mealTime: 9,
        name: 'Sim yogurt',
        kcal: 300,
        prot: 20,
        carb: 30,
        fat: 8,
        fibre: 2,
        note: 'nota sim',
      },
    ];

    const pure = buildSimulatedAnalysisDayNode(ANALYSIS_DATE, simulatedLog);
    assert.equal(pure.manualNodes.length, 0);
    assert.deepEqual(pure.mealTimes, {});
    assert.equal(pure._labOrigin.log, 'simulatedLog');

    const dossier = buildFocusLabDossier({
      ...READY,
      editionMode: 'simulated_scenario',
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      dataOrigin: 'simulated',
      fullHistory,
      simulatedLog,
      exportTier: 'deep',
      consent: { includePersonalNotes: true, includeSensitiveFields: true },
    });

    assert.equal(dossier.dataSource.containsSimulatedData, true);
    assert.equal(dossier.dataSource.analysisDayFields.inheritedFromRealNode, false);
    assert.equal(dossier.analysisDay.role, 'simulated_tracker_day');
    const json = JSON.stringify(dossier);
    assert.equal(json.includes('Sim yogurt'), true);
    assert.equal(json.includes('Manual REAL'), false);
    assert.equal(json.includes('nota sim'), true);
  });

  it('storico non pronto: blocca senza partial; partial senza d30 completo', () => {
    const gate = resolveFocusLabHistoryGate({ historyLoadState: 'loading' });
    assert.equal(gate.canExport, false);
    assert.equal(gate.d30CompleteAllowed, false);

    const fixture = buildFullDayFixture();
    const fullHistory = buildHistoryTreeFromFixture(fixture, 5);

    assert.throws(
      () => buildFocusLabDossier({
        historyLoadState: 'loading',
        allowPartialHistory: false,
        analysisDate: ANALYSIS_DATE,
        publicationDate: PUBLICATION_DATE,
        dataOrigin: 'real',
        fullHistory,
      }),
      /export bloccato/,
    );

    const partial = buildFocusLabDossier({
      historyLoadState: 'loading',
      allowPartialHistory: true,
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      dataOrigin: 'real',
      fullHistory,
    });
    assert.equal(partial.historyCompleteness.exportScope, 'partial_explicit');
    assert.equal(partial.history.d30.presentedAsComplete, false);
    assert.equal(partial.history.d30.available, false);
    assert.ok(partial.history.d10.dailySummaries.length <= 10);
  });

  it('giorni vuoti con storico ready: missingDays coverage, d30 completo consentito', () => {
    const fixture = buildFullDayFixture();
    // Solo analysis + publication: molti giorni senza nodo
    const fullHistory = {
      [`trackerStorico_${ANALYSIS_DATE}`]: fixture.analysisDayNode,
      [`trackerStorico_${PUBLICATION_DATE}`]: fixture.publicationDayNode,
    };
    const dossier = buildFocusLabDossier({
      ...READY,
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      dataOrigin: 'real',
      fullHistory,
      historyDays: 60,
    });
    assert.equal(dossier.historyCompleteness.loadState, 'ready');
    assert.equal(dossier.history.d30.presentedAsComplete, true);
    assert.ok(dossier.evidenceQuality.missingDays > 0);
    assert.match(
      dossier.historyCompleteness.emptyDaysMean,
      /no_registration/,
    );
  });

  it('privacy essential: redige nomi/note; deep+consenso li include', () => {
    const fixture = buildFullDayFixture();
    fixture.analysisDayNode.log[0].note = 'segreto pasto';
    fixture.analysisDayNode.log[0].name = 'Yogurt SECRET';
    const w = fixture.analysisDayNode.log.find((e) => e.type === 'workout');
    w.notes = 'segreto workout';
    w.name = 'Pesi SECRET';
    const fullHistory = buildHistoryTreeFromFixture(fixture, 12);

    const essential = buildFocusLabDossier({
      ...READY,
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      dataOrigin: 'real',
      fullHistory,
      exportTier: 'essential',
    });
    const ej = JSON.stringify(essential);
    assert.equal(essential.consent.notesIncluded, false);
    assert.equal(essential.consent.freeTextLabelsIncluded, false);
    assert.equal(ej.includes('segreto'), false);
    assert.equal(ej.includes('SECRET'), false);
    assert.equal(essential.analysisDay.nutrition.meals[0].items[0].labelRedacted, true);
    assert.equal(essential.analysisDay.nutrition.meals[0].items[0].name, null);

    const deep = buildFocusLabDossier({
      ...READY,
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      dataOrigin: 'real',
      fullHistory,
      exportTier: 'deep',
      consent: { includePersonalNotes: true, includeSensitiveFields: true },
    });
    const dj = JSON.stringify(deep);
    assert.equal(deep.consent.notesIncluded, true);
    assert.equal(dj.includes('segreto pasto'), true);
    assert.equal(dj.includes('Yogurt SECRET'), true);

    assert.equal(classifyActivityHint({ name: 'Camminata' }).kind, 'aerobic');
    assert.equal(classifyActivityHint({ name: 'Sollevamento Pesi (bicipiti)' }).kind, 'strength');
    const summary = summarizeFocusLabDossier(essential);
    assert.equal(summary.freeTextLabelsIncluded, false);
  });

  it('esclusioni privacy e nessuna side-effect dichiarata', () => {
    const fixture = buildFullDayFixture();
    const dossier = buildFocusLabDossier({
      ...READY,
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      dataOrigin: 'real',
      fullHistory: buildHistoryTreeFromFixture(fixture, 5),
    });
    assert.equal(dossier.exclusions.uid, true);
    assert.equal(dossier.exclusions.email, true);
    assert.equal(dossier.exclusions.tokens, true);
    assert.equal(dossier.exclusions.firebasePaths, true);
    assert.equal(dossier.dataSource.rtdbReads, 0);
  });

  it('micronutrienti: present / absent / real_zero / unverified_zero + totali incompleti', () => {
    const analysisDate = ANALYSIS_DATE;
    const publicationDate = PUBLICATION_DATE;
    const fullHistory = {
      [`trackerStorico_${analysisDate}`]: {
        data: analysisDate,
        mealTimes: { pranzo: 13 },
        log: [
          {
            type: 'food',
            id: 'micro_present',
            mealType: 'pranzo',
            mealTime: 13,
            name: 'Salmone SECRET',
            foodDbKey: 'salmone_fresco',
            dbSource: 'kentu_it',
            dbProvidedNutrientKeys: ['omega3', 'omega6', 'fibre', 'vitB12', 'k', 'mg'],
            grams: 150,
            kcal: 280,
            prot: 40,
            carb: 0,
            fat: 12,
            fibre: 2.6,
            omega3: 1.8,
            omega6: 0.4,
            vitB12: 3.2,
            k: 450,
            mg: 40,
            note: 'nota privata salmone',
          },
          {
            type: 'food',
            id: 'micro_real_zero',
            mealType: 'pranzo',
            mealTime: 13.1,
            name: 'Tonno al naturale',
            foodDbKey: 'tonno_naturale',
            dbSource: 'kentu_it',
            dbProvidedNutrientKeys: ['omega3', 'fibre', 'vitB12'],
            grams: 100,
            kcal: 110,
            prot: 25,
            carb: 0,
            fat: 1,
            fibre: 0,
            omega3: 0,
            vitB12: 2.1,
          },
          {
            type: 'food',
            id: 'micro_zero_fill',
            mealType: 'pranzo',
            mealTime: 13.2,
            name: 'Pollo petto',
            foodDbKey: 'pollo_petto',
            grams: 120,
            kcal: 160,
            prot: 35,
            carb: 0,
            fat: 2,
            fibre: 0,
            // zero-fill tipico senza evidenza DB
            omega3: 0,
            omega6: 0,
            vitB12: 0,
            k: 0,
            mg: 0,
          },
          {
            type: 'food',
            id: 'micro_absent',
            mealType: 'pranzo',
            mealTime: 13.3,
            name: 'Riso bianco',
            grams: 80,
            kcal: 100,
            prot: 2,
            carb: 22,
            fat: 0.3,
            fibre: 0.4,
            // nessun campo micro
          },
        ],
        manualNodes: [],
      },
      [`trackerStorico_${publicationDate}`]: {
        data: publicationDate,
        log: [
          {
            type: 'sleep',
            id: 'sleep_main',
            hours: 7,
            wakeTime: 7,
            bedtime: 23,
            quality: 4,
            deepMin: 60,
            remMin: 60,
          },
        ],
      },
    };

    const essential = buildFocusLabDossier({
      ...READY,
      analysisDate,
      publicationDate,
      dataOrigin: 'real',
      fullHistory,
      exportTier: 'essential',
    });

    const ej = JSON.stringify(essential);
    assert.equal(ej.includes('SECRET'), false);
    assert.equal(ej.includes('nota privata'), false);
    assert.equal(ej.includes('users/'), false);
    // Privacy: nessun foodDbKey ricostruibile in essential
    assert.equal(ej.includes('salmone_fresco'), false);
    assert.equal(ej.includes('tonno_naturale'), false);
    assert.equal(ej.includes('pollo_petto'), false);
    assert.equal(essential.exclusions.foodDbKeysInEssential, true);

    const items = essential.analysisDay.nutrition.meals.flatMap((m) => m.items || []);
    assert.equal(items.length, 4);
    assert.equal(items.every((it) => it.name === null && it.labelRedacted === true), true);
    assert.equal(items.every((it) => it.notes === undefined), true);
    assert.equal(items.every((it) => it.catalogRef?.foodDbKey == null), true);

    const present = items.find((it) => it.micronutrients?.omega3?.value === 1.8);
    assert.ok(present);
    assert.equal(present.micronutrients.omega3.availability, 'present');
    assert.equal(present.micronutrients.omega3.provenance, 'recorded');
    assert.equal(present.catalogRef.foodDbKeyRedacted, true);
    assert.equal(present.catalogRef.dbSource, 'kentu_it');
    assert.equal(present.catalogRef.nutrientPresenceEvidence, 'db_provided_keys');
    // fibre su pesce: valore conservato ma non usabile per giudizi
    assert.equal(present.macros.fiberG.value, 2.6);
    assert.equal(present.macros.fiberG.usableForJudgement, false);

    const realZero = items.find((it) => it.micronutrients?.omega3?.availability === 'real_zero');
    assert.ok(realZero);
    assert.equal(realZero.micronutrients.omega3.value, 0);
    assert.equal(realZero.micronutrients.omega3.provenance, 'recorded');
    assert.equal(realZero.catalogRef.foodDbKey, null);
    assert.equal(realZero.catalogRef.foodDbKeyRedacted, true);

    const zeroFill = items.find((it) => (
      it.micronutrients?.omega3?.availability === 'unverified_zero'
      && it.catalogRef?.nutrientPresenceEvidence === 'none'
      && it.macros?.proteinG?.value === 35
    ));
    assert.ok(zeroFill);
    assert.equal(zeroFill.micronutrients.omega3.value, null);
    assert.equal(zeroFill.micronutrients.omega3.provenance, 'ambiguous');
    assert.equal(zeroFill.micronutrients.omega3.usableForJudgement, false);
    assert.equal(zeroFill.catalogRef.dbSource, null);

    const absent = items.find((it) => it.opaqueId === 'food_item_4');
    assert.ok(absent);
    assert.equal(absent.micronutrients.omega3.availability, 'absent');
    assert.equal(absent.micronutrients.vitB12.provenance, 'missing');
    assert.equal(absent.micronutrients.vitB12.usableForJudgement, false);
    assert.equal(absent.catalogRef.foodDbKeyRedacted, false);

    const omegaTot = essential.analysisDay.nutrition.totals.micronutrients.byKey.omega3;
    assert.equal(omegaTot.value, 1.8);
    assert.equal(omegaTot.itemsKnown, 2);
    assert.equal(omegaTot.itemsTotal, 4);
    assert.equal(omegaTot.itemsUnverifiedZero, 1);
    assert.equal(omegaTot.itemsAbsent, 1);
    assert.equal(omegaTot.judgement, null);
    assert.match(omegaTot.limits, /unverified/);

    const coachEv = essential.analysisDay.nutrition.coachEvidence;
    assert.equal(coachEv.schema, 'kentu.focusNutritionCoachEvidence.v1');
    assert.equal(coachEv.policy.noDeficiencyClaims, true);
    assert.equal(coachEv.micronutrients.vitB12.judgement, null);
    assert.equal(coachEv.foodContributions.every((c) => c.name === null), true);
    assert.ok(coachEv.excludedFromAdvice.some((e) => e.reason === 'fibre_on_fish_like_name'));

    assert.equal(ej.includes('"epa"'), false);
    assert.equal(ej.includes('"dha"'), false);
    assert.equal(ej.includes('"ala"'), false);

    const flags = essential.analysisDay.plausibility?.flags || [];
    assert.ok(flags.some((f) => f.code === 'fibre_on_fish_like_name'));

    const deepNamesOnly = buildFocusLabDossier({
      ...READY,
      analysisDate,
      publicationDate,
      dataOrigin: 'real',
      fullHistory,
      exportTier: 'deep',
      consent: { includeSensitiveFields: true, includePersonalNotes: false },
    });
    const dj = JSON.stringify(deepNamesOnly);
    assert.equal(deepNamesOnly.consent.freeTextLabelsIncluded, true);
    assert.equal(deepNamesOnly.consent.notesIncluded, false);
    assert.equal(dj.includes('Salmone SECRET'), true);
    assert.equal(dj.includes('nota privata salmone'), false);
    assert.equal(dj.includes('salmone_fresco'), true);
    const deepItem = deepNamesOnly.analysisDay.nutrition.meals
      .flatMap((m) => m.items || [])
      .find((it) => it.name === 'Salmone SECRET');
    assert.ok(deepItem);
    assert.equal(deepItem.notes, undefined);
    assert.equal(deepItem.catalogRef.foodDbKey, 'salmone_fresco');
    assert.equal(deepItem.catalogRef.foodDbKeyRedacted, false);
    assert.ok(
      deepNamesOnly.analysisDay.nutrition.coachEvidence.foodContributions
        .some((c) => c.name === 'Salmone SECRET'),
    );
  });

  it('micronutrienti: giorno fibre sospette ~92.6g senza auto-correzione', () => {
    const analysisDate = ANALYSIS_DATE;
    const publicationDate = PUBLICATION_DATE;
    const fullHistory = {
      [`trackerStorico_${analysisDate}`]: {
        data: analysisDate,
        log: [
          {
            type: 'food',
            id: 'fish_fibre_bug',
            mealType: 'cena',
            mealTime: 20,
            name: 'Salmone grigliato',
            foodDbKey: 'salmone',
            dbProvidedNutrientKeys: ['omega3', 'fibre'],
            grams: 200,
            kcal: 350,
            prot: 40,
            carb: 0,
            fat: 20,
            fibre: 70,
            omega3: 2.5,
          },
          {
            type: 'food',
            id: 'side',
            mealType: 'cena',
            mealTime: 20.1,
            name: 'Verdure miste',
            grams: 200,
            kcal: 80,
            prot: 3,
            carb: 12,
            fat: 1,
            fibre: 22.6,
            mg: 50,
          },
        ],
        manualNodes: [],
      },
      [`trackerStorico_${publicationDate}`]: {
        data: publicationDate,
        log: [{
          type: 'sleep',
          id: 's1',
          hours: 7,
          wakeTime: 7,
          bedtime: 23,
          quality: 3,
          deepMin: 60,
          remMin: 60,
        }],
      },
    };

    const dossier = buildFocusLabDossier({
      ...READY,
      analysisDate,
      publicationDate,
      dataOrigin: 'real',
      fullHistory,
      exportTier: 'essential',
    });

    assert.equal(dossier.analysisDay.nutrition.totals.fiberG.value, 92.6);
    assert.equal(dossier.analysisDay.nutrition.totals.fiberG.usableForJudgement, false);
    const flags = dossier.analysisDay.plausibility.flags || [];
    assert.ok(flags.some((f) => f.code === 'daily_fiber_unusually_high' && f.fiberG === 92.6));
    assert.ok(flags.some((f) => f.code === 'fibre_on_fish_like_name' && f.fibreG === 70));
    // essential: foodDbKey redatto — identificare via omega3
    assert.equal(JSON.stringify(dossier).includes('"salmone"'), false);
    const fish = dossier.analysisDay.nutrition.meals
      .flatMap((m) => m.items || [])
      .find((it) => it.micronutrients?.omega3?.value === 2.5);
    assert.ok(fish);
    assert.equal(fish.macros.fiberG.value, 70);
    assert.equal(fish.macros.fiberG.usableForJudgement, false);
    assert.equal(fish.micronutrients.omega3.value, 2.5);
    const coach = dossier.analysisDay.nutrition.coachEvidence;
    assert.ok(coach.excludedFromAdvice.some((e) => e.reason === 'fibre_on_fish_like_name'));
    assert.ok(coach.excludedFromAdvice.some((e) => e.reason === 'daily_fiber_unusually_high'));
    // nessuna falsa carenza su micro incompleti
    assert.equal(coach.micronutrients.vitB12.judgement, null);
    assert.equal(coach.policy.noDeficiencyClaims, true);
  });
});
