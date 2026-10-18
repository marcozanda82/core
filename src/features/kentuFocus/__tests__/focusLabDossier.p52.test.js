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

    assert.equal(classifyActivityHint({ name: 'Camminata' }).kind, 'aerobic_hint');
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
});
