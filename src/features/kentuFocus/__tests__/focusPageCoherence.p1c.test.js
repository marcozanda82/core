/**
 * Coerenza date/origine Focus: diario reale vs demo mai mescolati.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  FOCUS_PAGE_MODE,
  formatNutritionVerifyLabel,
  handoffBelongsToUser,
  loadFocusPageDemoEditionIfAllowed,
  resolveFocusPageSession,
  stashFocusDiaryForUser,
  __resetFocusDiaryHandoffForTests,
} from '../product/index.js';
import { buildFocusPrivateNutritionView } from '../product/buildFocusPrivateNutritionView.js';
import { ANALYSIS_DATE, PUBLICATION_DATE } from './fixtures/focusDayFixtures.js';

const REAL_DAY = '2026-10-23';
const REAL_PUB = '2026-10-24';
const DEMO_ANALYSIS = '2026-10-18';

function buildHistory(analysisDate, publicationDate, foodName) {
  return {
    [`trackerStorico_${analysisDate}`]: {
      data: analysisDate,
      mealTimes: { pranzo: 13, cena: 20 },
      log: [
        {
          type: 'food',
          id: 'yogurt',
          mealType: 'pranzo',
          mealTime: 13,
          name: foodName,
          grams: 100,
          kcal: 120,
          prot: 10,
          carb: 12,
          fat: 3,
          fibre: 1,
          omega3: 0.2,
          dbProvidedNutrientKeys: ['omega3', 'fibre'],
        },
        {
          type: 'food',
          id: 'fish1',
          mealType: 'cena',
          mealTime: 20,
          name: 'Merluzzo',
          grams: 150,
          kcal: 180,
          prot: 35,
          carb: 0,
          fat: 4,
          fibre: 40,
          omega3: 0.5,
          dbProvidedNutrientKeys: ['omega3', 'fibre'],
        },
        {
          type: 'food',
          id: 'veg',
          mealType: 'cena',
          mealTime: 20.1,
          name: 'Verdure',
          grams: 200,
          kcal: 60,
          prot: 2,
          carb: 10,
          fat: 1,
          fibre: 30,
        },
      ],
      manualNodes: [],
    },
    [`trackerStorico_${publicationDate}`]: {
      data: publicationDate,
      log: [{
        type: 'sleep',
        id: 'sleep1',
        hours: 7.5,
        wakeTime: 7,
        bedtime: 23.5,
        quality: 4,
        deepMin: 90,
        remMin: 90,
      }],
    },
  };
}

describe('Focus page coherence P1c', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
  });

  it('diario reale 2026-10-23 e fixture 2026-10-18: mai mescolati', async () => {
    const fullHistory = buildHistory(REAL_DAY, REAL_PUB, 'Pasto reale 23');
    stashFocusDiaryForUser('uid_real', {
      fullHistory,
      analysisDate: REAL_DAY,
      publicationDate: REAL_PUB,
    });

    const session = resolveFocusPageSession({
      uid: 'uid_real',
      periodId: 'ieri',
      handoff: {
        uid: 'uid_real',
        fullHistory,
        analysisDate: REAL_DAY,
        publicationDate: REAL_PUB,
      },
    });

    assert.equal(session.mode, FOCUS_PAGE_MODE.real_diary);
    assert.equal(session.analysisDate, REAL_DAY);
    assert.equal(session.publicationDate, REAL_PUB);
    assert.equal(session.showDemoEditorial, false);
    assert.match(session.editorial.message, /analisi editoriale.*non ancora disponibile/i);
    assert.equal(session.nutrition.analysisDate, REAL_DAY);

    const names = session.nutrition.ieri.meals.flatMap((m) => m.items.map((i) => i.name));
    assert.ok(names.includes('Pasto reale 23'));
    assert.equal(names.includes('Pasto demo'), false);

    const loaded = await loadFocusPageDemoEditionIfAllowed(session);
    assert.equal(loaded.demoEdition, null);
    assert.equal(loaded.analysisDate, REAL_DAY);
    // Demo fixture dates must not appear as page analysis
    assert.notEqual(loaded.analysisDate, DEMO_ANALYSIS);
  });

  it('senza handoff: solo demo esplicita, senza diario reale attaccato', async () => {
    const session = resolveFocusPageSession({
      uid: 'uid_demo',
      periodId: 'ieri',
      handoff: null,
    });
    assert.equal(session.mode, FOCUS_PAGE_MODE.demo_preview);
    assert.equal(session.showDemoEditorial, true);
    assert.equal(session.nutrition, null);

    const loaded = await loadFocusPageDemoEditionIfAllowed(session);
    assert.equal(loaded.demoEdition?.demo, true);
    assert.ok(loaded.demoEdition?.dates?.analysisDate);
    // Demo dates are fixture — not mixed with a real nutrition block
    assert.equal(loaded.nutrition, null);
  });

  it('cambio UID: handoff di A non vale per B', () => {
    const histA = buildHistory(REAL_DAY, REAL_PUB, 'Solo Alice');
    stashFocusDiaryForUser('alice', {
      fullHistory: histA,
      analysisDate: REAL_DAY,
      publicationDate: REAL_PUB,
    });

    assert.equal(
      handoffBelongsToUser('bob', {
        uid: 'alice',
        fullHistory: histA,
        analysisDate: REAL_DAY,
        publicationDate: REAL_PUB,
      }),
      false,
    );

    const sessionBob = resolveFocusPageSession({
      uid: 'bob',
      periodId: 'ieri',
      handoff: {
        uid: 'alice',
        fullHistory: histA,
        analysisDate: REAL_DAY,
        publicationDate: REAL_PUB,
      },
    });
    assert.equal(sessionBob.mode, FOCUS_PAGE_MODE.demo_preview);
  });

  it('anomalia item vs giorno: fibre pesce separate dal totale', () => {
    const fullHistory = buildHistory(REAL_DAY, REAL_PUB, 'Base');
    const view = buildFocusPrivateNutritionView({
      periodId: 'ieri',
      uid: 'u',
      fullHistory,
      analysisDate: REAL_DAY,
      publicationDate: REAL_PUB,
    });

    const fish = view.ieri.meals.flatMap((m) => m.items).find((i) => i.name === 'Merluzzo');
    const veg = view.ieri.meals.flatMap((m) => m.items).find((i) => i.name === 'Verdure');
    assert.equal(fish.macros.fiberG.usableForJudgement, false);
    // Verdure: fibre alte ma NON flag item (solo totale giorno se soglia)
    assert.equal((veg.toVerify || []).length, 0);

    const itemFlags = view.ieri.toVerify.filter((t) => t.scope === 'item');
    const dayFlags = view.ieri.toVerify.filter((t) => t.scope === 'day');
    assert.ok(itemFlags.some((f) => f.reason === 'fibre_on_fish_like_name' && f.foodName === 'Merluzzo'));
    assert.ok(dayFlags.some((f) => f.reason === 'daily_fiber_unusually_high'));
    assert.equal(dayFlags.every((f) => !f.foodName), true);

    const label = formatNutritionVerifyLabel(itemFlags[0]);
    assert.match(label, /Merluzzo/);
    assert.match(label, /Fibre|fibre/i);
    assert.equal(label.includes('fiberG'), false);
    assert.equal(label.includes('anomaly_flag'), false);
  });

  it('copertura insufficiente ≠ carenza; sonno D / D+1', () => {
    const fullHistory = buildHistory(REAL_DAY, REAL_PUB, 'Solo un pasto');
    const session = resolveFocusPageSession({
      uid: 'u',
      periodId: 'ieri',
      handoff: {
        uid: 'u',
        fullHistory,
        analysisDate: REAL_DAY,
        publicationDate: REAL_PUB,
      },
    });
    assert.equal(session.sleepNight.analysisDay, REAL_DAY);
    assert.equal(session.sleepNight.nightEndedOn, REAL_PUB);
    assert.match(session.sleepNight.note, /risveglio/);
    const comment = session.nutrition.ieri.comment.text;
    assert.equal(/nessuna carenza automatica|dato del diario|copertura sufficiente/i.test(comment), false);
    assert.equal(/carenza di b12|deficit vitamin|antinfiammator/i.test(comment), false);
    assert.match(comment, /Merluzzo|Verdure|Pasto|diario/i);
  });

  it('Settimana/Mese: stessa analysisDate del handoff, nessuna demo attaccata', () => {
    const fullHistory = buildHistory(REAL_DAY, REAL_PUB, 'Trend');
    const week = resolveFocusPageSession({
      uid: 'u',
      periodId: 'settimana',
      handoff: {
        uid: 'u',
        fullHistory,
        analysisDate: REAL_DAY,
        publicationDate: REAL_PUB,
      },
    });
    assert.equal(week.mode, FOCUS_PAGE_MODE.real_diary);
    assert.equal(week.analysisDate, REAL_DAY);
    assert.equal(week.showDemoEditorial, false);
    assert.equal(week.nutrition.trends.windowDays, 7);

    const month = resolveFocusPageSession({
      uid: 'u',
      periodId: 'mese',
      handoff: {
        uid: 'u',
        fullHistory,
        analysisDate: REAL_DAY,
        publicationDate: REAL_PUB,
      },
    });
    assert.equal(month.nutrition.trends.windowDays, 30);
    assert.equal(month.analysisDate, REAL_DAY);
  });
});
