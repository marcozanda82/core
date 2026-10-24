/**
 * Dashboard nutrizionale privata + handoff diario + privacy isolation.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  buildFocusPrivateNutritionView,
  buildFocusProductEdition,
} from '../product/index.js';
import {
  __resetFocusDiaryHandoffForTests,
  clearFocusDiaryForUser,
  peekFocusDiaryForUser,
  stashFocusDiaryForUser,
} from '../product/focusDiaryHandoff.js';
import { buildFocusLabDossier } from '../lab/buildFocusLabDossier.js';
import { ANALYSIS_DATE, PUBLICATION_DATE } from './fixtures/focusDayFixtures.js';

const READY = { historyLoadState: 'ready' };

function buildUserHistory(foodName) {
  return {
    [`trackerStorico_${ANALYSIS_DATE}`]: {
      data: ANALYSIS_DATE,
      mealTimes: { pranzo: 13 },
      log: [
        {
          type: 'food',
          id: 'f1',
          mealType: 'pranzo',
          mealTime: 13,
          name: foodName,
          foodDbKey: 'db_key_should_not_be_name',
          grams: 120,
          kcal: 200,
          prot: 30,
          carb: 5,
          fat: 8,
          fibre: 1,
          omega3: 1.2,
          k: 400,
          mg: 50,
          vitB12: 2,
          dbProvidedNutrientKeys: ['omega3', 'k', 'mg', 'vitB12', 'fibre'],
        },
        {
          type: 'food',
          id: 'fish_bad_fibre',
          mealType: 'cena',
          mealTime: 20,
          name: 'Merluzzo al forno',
          grams: 150,
          kcal: 180,
          prot: 35,
          carb: 0,
          fat: 4,
          fibre: 12,
          omega3: 0.4,
          dbProvidedNutrientKeys: ['omega3', 'fibre'],
        },
      ],
      manualNodes: [],
    },
    [`trackerStorico_${PUBLICATION_DATE}`]: {
      data: PUBLICATION_DATE,
      log: [{
        type: 'sleep', id: 's1', hours: 7, wakeTime: 7, bedtime: 23, quality: 4, deepMin: 60, remMin: 60,
      }],
    },
  };
}

describe('Focus private nutrition + home FOCUS handoff', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
  });

  it('handoff isola gli utenti: A non vede il diario di B', () => {
    stashFocusDiaryForUser('uid_a', {
      fullHistory: buildUserHistory('Pasto di Alice'),
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
    });
    stashFocusDiaryForUser('uid_b', {
      fullHistory: buildUserHistory('Pasto di Bob'),
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
    });

    const a = peekFocusDiaryForUser('uid_a');
    const b = peekFocusDiaryForUser('uid_b');
    assert.ok(a);
    assert.ok(b);
    assert.notEqual(a, b);

    const viewA = buildFocusPrivateNutritionView({
      periodId: 'ieri',
      uid: 'uid_a',
      fullHistory: a.fullHistory,
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      source: 'handoff',
    });
    const viewB = buildFocusPrivateNutritionView({
      periodId: 'ieri',
      uid: 'uid_b',
      fullHistory: b.fullHistory,
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      source: 'handoff',
    });

    const namesA = viewA.ieri.meals.flatMap((m) => m.items.map((i) => i.name));
    const namesB = viewB.ieri.meals.flatMap((m) => m.items.map((i) => i.name));
    assert.ok(namesA.includes('Pasto di Alice'));
    assert.equal(namesA.includes('Pasto di Bob'), false);
    assert.ok(namesB.includes('Pasto di Bob'));
    assert.equal(namesB.includes('Pasto di Alice'), false);

    clearFocusDiaryForUser('uid_a');
    assert.equal(peekFocusDiaryForUser('uid_a'), null);
    assert.ok(peekFocusDiaryForUser('uid_b'));
  });

  it('Ieri: nomi dal diario, non da foodDbKey; fibre sospette solo da verificare', () => {
    const fullHistory = buildUserHistory('Yogurt greco');
    const view = buildFocusPrivateNutritionView({
      periodId: 'ieri',
      uid: 'u1',
      fullHistory,
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      source: 'handoff',
    });

    assert.equal(view.ok, true);
    assert.equal(view.ieri.privacy.catalogKeysNotUsedAsNames, true);
    const allNames = view.ieri.meals.flatMap((m) => m.items.map((i) => i.name));
    assert.ok(allNames.includes('Yogurt greco'));
    assert.ok(allNames.includes('Merluzzo al forno'));
    assert.equal(allNames.includes('db_key_should_not_be_name'), false);

    const fish = view.ieri.meals
      .flatMap((m) => m.items)
      .find((i) => i.name === 'Merluzzo al forno');
    assert.equal(fish.macros.fiberG.usableForJudgement, false);
    assert.ok(view.ieri.toVerify.some((t) => t.nutrient === 'fiberG'));
    const comment = view.ieri.comment.text;
    assert.match(comment, /Yogurt greco/);
    assert.match(comment, /Merluzzo al forno/);
    assert.match(comment, /ricontrolla le fibre|fibre indicate/i);
    assert.equal(/nessuna carenza automatica|dato del diario|copertura sufficiente|copertura \d+%/i.test(comment), false);
    assert.equal(/deficit di|carenza di b12|stato infiammatorio|antinfiammator/i.test(comment), false);
    assert.ok((view.ieri.comment.technicalNotes || []).some((n) => /fibre|copertura/i.test(n)));
    // eslint-disable-next-line no-console
    console.log('COMMENTO_COACH_P1B:', comment);

    // Export essential: nessun nome alimento
    const essential = buildFocusLabDossier({
      ...READY,
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
      dataOrigin: 'real',
      fullHistory,
      exportTier: 'essential',
    });
    const ej = JSON.stringify(essential);
    assert.equal(ej.includes('Yogurt greco'), false);
    assert.equal(ej.includes('Merluzzo'), false);
    assert.equal(ej.includes('db_key_should_not_be_name'), false);
  });

  it('commento coach: limite naturale senza nomi; tecnico fuori dal testo', () => {
    const fullHistory = {
      [`trackerStorico_${ANALYSIS_DATE}`]: {
        data: ANALYSIS_DATE,
        mealTimes: { pranzo: 13 },
        log: [{
          type: 'food',
          id: 'anon1',
          mealType: 'pranzo',
          mealTime: 13,
          // nessun name/desc/label
          grams: 100,
          kcal: 150,
          prot: 10,
          carb: 10,
          fat: 5,
        }],
        manualNodes: [],
      },
      [`trackerStorico_${PUBLICATION_DATE}`]: {
        data: PUBLICATION_DATE,
        log: [{ type: 'sleep', id: 's1', hours: 7, wakeTime: 7, bedtime: 23 }],
      },
    };
    const view = buildFocusPrivateNutritionView({
      periodId: 'ieri',
      uid: 'u1',
      fullHistory,
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
    });
    assert.match(view.ieri.comment.text, /senza i nomi|mi fermo qui/i);
    assert.equal(/copertura \d+%|nessuna carenza automatica/i.test(view.ieri.comment.text), false);
    // eslint-disable-next-line no-console
    console.log('COMMENTO_COACH_NO_NAMES:', view.ieri.comment.text);
  });

  it('Settimana/Mese: andamenti solo su giorni registrati; missing ≠ zero', () => {
    const fullHistory = buildUserHistory('Pasto unico');
    const week = buildFocusPrivateNutritionView({
      periodId: 'settimana',
      uid: 'u1',
      fullHistory,
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
    });
    assert.equal(week.ok, true);
    assert.equal(week.trends.windowDays, 7);
    assert.ok(week.trends.daysWithFood >= 1);
    const missing = week.trends.series.filter((s) => s.status !== 'recorded');
    assert.ok(missing.every((s) => s.kcal == null));
    assert.equal(week.trends.judgement, null);

    const month = buildFocusPrivateNutritionView({
      periodId: 'mese',
      uid: 'u1',
      fullHistory,
      analysisDate: ANALYSIS_DATE,
      publicationDate: PUBLICATION_DATE,
    });
    assert.equal(month.trends.windowDays, 30);
  });

  it('senza handoff: empty gracefully; product edition Ieri/Settimana/Mese resta ok', async () => {
    const empty = buildFocusPrivateNutritionView({ periodId: 'ieri', uid: 'x' });
    assert.equal(empty.ok, false);
    assert.equal(empty.reason, 'no_diary_snapshot');

    for (const id of ['ieri', 'settimana', 'mese']) {
      const edition = await buildFocusProductEdition(id);
      assert.equal(edition.ok, true, id);
    }
  });
});

describe('Pulsantiera FOCUS pillar contract', () => {
  it('PILLARS usa FOCUS; sottomenu report legacy resta nel file', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(
      new URL('../../chat/PulsantieraUniversale.jsx', import.meta.url),
      'utf8',
    );
    assert.match(src, /sigla: 'FOCUS'/);
    assert.match(src, /openFocus:\s*true/);
    assert.match(src, /Ex RPT/);
    assert.equal(/\{ id: 'report', icon:.*sigla: 'RPT'/.test(src), false);
    assert.match(src, /report: \[/);
    assert.match(src, /GENERATE_PERIOD_REPORT/);
    assert.match(src, /id: 'tutti'/);
    assert.match(src, /sigla: 'PAS'/);
    assert.match(src, /sigla: 'RAP'/);
    assert.match(src, /sigla: 'ATT'/);
    assert.match(src, /sigla: 'ALL'/);
  });
});
