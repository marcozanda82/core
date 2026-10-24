/**
 * Kentu Focus — tre pilastri benessere (card sintetiche + coach breve).
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  FOCUS_PAGE_MODE,
  buildFocusWellnessPillars,
  buildDeterministicWellnessCoach,
  resolveFocusPageSession,
  stashFocusDiaryForUser,
  __resetFocusDiaryHandoffForTests,
} from '../product/index.js';

const DAY = '2026-10-23';
const PUB = '2026-10-24';

function baseHistory({ withWorkout = false, withSleep = true, shortSleep = false } = {}) {
  const analysisLog = [
    {
      type: 'food',
      id: 'yogurt',
      mealType: 'pranzo',
      mealTime: 13,
      name: 'Yogurt',
      grams: 150,
      kcal: 140,
      prot: 12,
      carb: 14,
      fat: 3,
      fibre: 0,
      omega3: 0.1,
      dbProvidedNutrientKeys: ['omega3'],
    },
  ];
  if (withWorkout) {
    analysisLog.push({
      type: 'workout',
      id: 'w1',
      name: 'Palestra forza',
      durationMin: 45,
      kcal: 220,
    });
  }

  const history = {
    [`trackerStorico_${DAY}`]: {
      data: DAY,
      mealTimes: { pranzo: 13 },
      log: analysisLog,
      manualNodes: [],
    },
  };

  if (withSleep) {
    history[`trackerStorico_${PUB}`] = {
      data: PUB,
      log: [{
        type: 'sleep',
        id: 'sleep1',
        hours: shortSleep ? 5.2 : 7.5,
        wakeTime: 7,
        bedtime: shortSleep ? 1.5 : 23.5,
        quality: 4,
        deepMin: 60,
        remMin: 60,
      }],
    };
  }

  return history;
}

describe('Focus wellness pillars P1d', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
  });

  it('tre card sintetiche: dato principale + frase breve, pari struttura', () => {
    const fullHistory = baseHistory({ withWorkout: true, withSleep: true });
    const pack = buildFocusWellnessPillars({
      periodId: 'ieri',
      uid: 'u1',
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
    });

    assert.equal(pack.ok, true);
    assert.equal(pack.pillars.length, 3);
    assert.deepEqual(pack.pillars.map((p) => p.id), ['nutrition', 'exercise', 'sleep']);
    for (const p of pack.pillars) {
      assert.ok(p.title);
      assert.ok(p.primaryValue);
      assert.ok(p.shortPhrase);
      assert.ok(p.shortPhrase.length < 80);
      assert.equal(typeof p.hasEvidence, 'boolean');
      assert.equal(p.headline, undefined);
      assert.equal(p.observation, undefined);
    }
    assert.match(pack.pillarsById.nutrition.primaryValue, /kcal|Non registrato|Dati insufficienti/i);
    assert.match(pack.pillarsById.exercise.primaryValue, /min|Non registrato|session/i);
    assert.match(pack.pillarsById.sleep.primaryValue, /ore|Non registrato|Registrato/i);

    assert.equal(typeof pack.coach.wentWell, 'string');
    assert.equal(typeof pack.coach.needsAttention, 'string');
    assert.equal(typeof pack.coach.concreteAction, 'string');
    assert.equal(pack.coach.crossPillarNotes.length, 0);
    assert.equal(pack.coach.policy.equalPillars, true);
    assert.equal(pack.coach.policy.noHealthScore, true);
    assert.equal(pack.coach.policy.maxCoachObservations, 3);
  });

  it('Ieri vs Settimana vs Mese: dato principale coerente con la finestra', () => {
    const fullHistory = baseHistory({ withWorkout: true, withSleep: true });
    const ieri = buildFocusWellnessPillars({
      periodId: 'ieri',
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
    });
    const week = buildFocusWellnessPillars({
      periodId: 'settimana',
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
    });
    const month = buildFocusWellnessPillars({
      periodId: 'mese',
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
    });

    // Ieri: totale giornaliero (kcal / min / ore), non N/giorni
    assert.match(ieri.pillarsById.nutrition.primaryValue, /kcal/i);
    assert.equal(/\d+\/\d+ giorni/.test(ieri.pillarsById.nutrition.primaryValue), false);
    assert.match(ieri.pillarsById.exercise.primaryValue, /min/i);
    assert.match(ieri.pillarsById.sleep.primaryValue, /ore/i);

    // Settimana / mese: copertura sulla finestra, non il totale di un solo giorno
    assert.match(week.pillarsById.nutrition.primaryValue, /\/7 giorni/);
    assert.match(month.pillarsById.nutrition.primaryValue, /\/30 giorni/);
    assert.match(week.pillarsById.exercise.primaryValue, /\/7 giorni/);
    assert.match(month.pillarsById.exercise.primaryValue, /\/30 giorni/);
    assert.equal(week.pillarsById.exercise.series.length, 7);
    assert.equal(month.pillarsById.exercise.series.length, 30);
    assert.equal(week.pillarsById.sleep.series.length, 7);
    assert.equal(month.pillarsById.sleep.series.length, 30);

    // Sleep week/month: media o conteggio notti, non le kcal del giorno
    assert.equal(/kcal/i.test(week.pillarsById.sleep.primaryValue), false);
    assert.equal(/kcal/i.test(month.pillarsById.sleep.primaryValue), false);
  });

  it('sonno Ieri: notte conclusa al risveglio D+1', () => {
    const fullHistory = baseHistory({ withSleep: true });
    const pack = buildFocusWellnessPillars({
      periodId: 'ieri',
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
    });
    const sleep = pack.pillarsById.sleep;
    assert.equal(sleep.analysisDay, DAY);
    assert.equal(sleep.nightEndedOn, PUB);
    assert.equal(sleep.hasEvidence, true);
    assert.match(sleep.detailNote, /risveglio del 2026-10-24/);
  });

  it('nessun allenamento registrato ≠ inattività; testo Non registrato', () => {
    const fullHistory = baseHistory({ withWorkout: false });
    const pack = buildFocusWellnessPillars({
      periodId: 'ieri',
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
    });
    const ex = pack.pillarsById.exercise;
    assert.equal(ex.hasEvidence, false);
    assert.equal(ex.primaryValue, 'Non registrato');
    assert.match(ex.detailNote, /non significa inattività|mancano solo le evidenze/i);
    assert.equal(/sei stato inattivo|giornata sedentaria/i.test(`${ex.shortPhrase} ${ex.detailNote}`), false);
  });

  it('sessione reale include wellness; UID coerente; demo non contaminata', () => {
    const fullHistory = baseHistory({ withWorkout: true });
    stashFocusDiaryForUser('alice', {
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
    });

    const real = resolveFocusPageSession({
      uid: 'alice',
      periodId: 'ieri',
      handoff: {
        uid: 'alice',
        fullHistory,
        analysisDate: DAY,
        publicationDate: PUB,
      },
    });
    assert.equal(real.mode, FOCUS_PAGE_MODE.real_diary);
    assert.equal(real.wellness?.ok, true);
    assert.equal(real.wellness.pillars.length, 3);
    assert.equal(real.showDemoEditorial, false);
    assert.equal(real.demoEdition, null);

    const bob = resolveFocusPageSession({
      uid: 'bob',
      periodId: 'ieri',
      handoff: {
        uid: 'alice',
        fullHistory,
        analysisDate: DAY,
        publicationDate: PUB,
      },
    });
    assert.equal(bob.mode, FOCUS_PAGE_MODE.demo_preview);
    assert.equal(bob.wellness, null);
    assert.equal(bob.nutrition, null);
  });

  it('coach può privilegiare sonno; non ripete i numeri delle card', () => {
    const fullHistory = baseHistory({ withWorkout: true, withSleep: true, shortSleep: true });
    const pack = buildFocusWellnessPillars({
      periodId: 'ieri',
      fullHistory,
      analysisDate: DAY,
      publicationDate: PUB,
    });
    assert.equal(pack.pillarsById.sleep.attention, true);
    assert.equal(pack.coach.primaryPillarId, 'sleep');
    assert.match(pack.coach.concreteAction, /sonno|orario|durata/i);
    const blob = `${pack.coach.wentWell} ${pack.coach.needsAttention} ${pack.coach.concreteAction}`;
    assert.equal(/5\.2|140 kcal|45 min/i.test(blob), false);
  });

  it('coach senza evidenze: limite esplicito, niente testi demo', () => {
    const empty = {
      [`trackerStorico_${DAY}`]: { data: DAY, log: [], manualNodes: [] },
    };
    const pack = buildFocusWellnessPillars({
      periodId: 'ieri',
      fullHistory: empty,
      analysisDate: DAY,
      publicationDate: PUB,
    });
    assert.equal(pack.pillars.every((p) => !p.hasEvidence), true);
    assert.match(pack.coach.concreteAction, /basi sufficienti|non ho basi/i);
    assert.equal(/edizione dimostrativa|demo fixture/i.test(JSON.stringify(pack.coach)), false);
  });

  it('buildDeterministicWellnessCoach: equal weight policy', () => {
    const coach = buildDeterministicWellnessCoach({
      nutrition: {
        id: 'nutrition', title: 'Alimentazione', primaryValue: 'ok', hasEvidence: true, positive: true, attention: false,
      },
      exercise: {
        id: 'exercise', title: 'Esercizio', primaryValue: 'ok', hasEvidence: true, positive: true, attention: false,
      },
      sleep: {
        id: 'sleep', title: 'Sonno', primaryValue: 'ok', hasEvidence: true, positive: true, attention: false,
      },
    });
    assert.equal(coach.policy.equalPillars, true);
    assert.equal(coach.schema, 'kentu.focusWellnessCoach.v1');
    assert.equal(typeof coach.wentWell, 'string');
  });
});
