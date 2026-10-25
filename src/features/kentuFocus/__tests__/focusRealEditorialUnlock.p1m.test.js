/**
 * P1M — Focus editoriale REALE sbloccato (senza mockEditorial).
 * Diario via loader autenticato (get iniettato) → genera con askAi mock → persist → refresh → isolation.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  FOCUS_PAGE_MODE,
  peekFocusDiaryForUser,
  clearFocusDiaryForUser,
  resolveFocusPageSession,
  handoffBelongsToUser,
  loadFocusAuthenticatedDiary,
  buildFocusAiCoachDossier,
  requestFocusAiCoachAnalysis,
  loadFocusAiAnalysisFromStore,
  listFocusAiAnalysisHistory,
  createMemoryFocusAiAnalysisStore,
  normalizeFocusEditorialAnalysis,
  buildFocusEditorialMockAnalysis,
  __resetFocusDiaryHandoffForTests,
  __resetFocusAiCoachMemoryForTests,
  __resetFocusAiAnalysisPersistenceForTests,
} from '../product/index.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';
import { focusLocalIsoDate as localIso } from '../product/loadFocusAuthenticatedDiary.js';

const UID = 'uid-p1m-real';
const UID_B = 'uid-p1m-other';

function richHistory(analysisDate, publicationDate) {
  const h = {
    [`trackerStorico_${analysisDate}`]: {
      data: analysisDate,
      log: [
        {
          type: 'food', id: 'a', name: 'Salmone', mealType: 'pranzo', mealTime: 13,
          grams: 150, kcal: 280, prot: 35, carb: 0, fat: 14,
        },
        {
          type: 'food', id: 'b', name: 'Riso', mealType: 'pranzo', mealTime: 13,
          grams: 180, kcal: 230, prot: 5, carb: 50, fat: 1,
        },
        {
          type: 'workout', id: 'w1', name: 'Pesi · Petto', workoutType: 'pesi',
          duration: 50, time: 17.5, muscles: ['Petto'],
        },
      ],
    },
    [`trackerStorico_${publicationDate}`]: {
      data: publicationDate,
      log: [{ type: 'sleep', id: 's1', hours: 8, wakeTime: 7, bedtime: 23 }],
    },
  };
  for (let i = 1; i <= 6; i += 1) {
    const d = addCalendarDays(analysisDate, -i);
    h[`trackerStorico_${d}`] = {
      data: d,
      log: [
        {
          type: 'food', id: `f${i}`, name: 'Yogurt', mealType: 'colazione', mealTime: 8,
          grams: 150, kcal: 140, prot: 12, carb: 10, fat: 4,
        },
        {
          type: 'workout', id: `w${i}`, name: 'Pesi', workoutType: 'pesi',
          duration: 45, time: 18, muscles: ['Gambe'],
        },
      ],
    };
  }
  return h;
}

function makeGet(uid, fullHistory, profile = {
  targets: { kcal: 2200, prot: 140 },
  profile: { targetCalories: 2200, proteinTarget: 140 },
}) {
  return async (refObj) => {
    const path = String(refObj?.toString?.() || refObj?._path || '');
    if (path.includes(`users/${uid}/profile_targets`)) {
      return { exists: () => true, val: () => profile };
    }
    if (path.includes(`users/${uid}/tracker_data`)) {
      return { exists: () => true, val: () => fullHistory };
    }
    return { exists: () => false, val: () => null };
  };
}

function ref(_db, path) {
  return { toString: () => path, _path: path };
}

function askAiFromPeriod(periodId) {
  const mock = buildFocusEditorialMockAnalysis(periodId);
  const { _mock, _mockLabel, ...payload } = mock;
  return async () => JSON.stringify(payload);
}

describe('Focus real editorial unlock P1M (no mockEditorial)', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
    __resetFocusAiCoachMemoryForTests();
    __resetFocusAiAnalysisPersistenceForTests();
  });

  it('senza handoff RAM: load Firebase-equivalent → real_diary', async () => {
    clearFocusDiaryForUser(UID);
    assert.equal(peekFocusDiaryForUser(UID), null);

    const publicationDate = localIso();
    const analysisDate = addCalendarDays(publicationDate, -1);
    const history = richHistory(analysisDate, publicationDate);

    const loaded = await loadFocusAuthenticatedDiary({
      uid: UID,
      db: {},
      get: makeGet(UID, history),
      ref,
      publicationDate,
      analysisDate,
      stash: true,
    });

    assert.equal(loaded.ok, true);
    assert.ok(loaded.dayNodeCount >= 2);
    assert.ok(handoffBelongsToUser(UID, loaded.snapshot));

    const session = resolveFocusPageSession({
      uid: UID,
      periodId: 'ieri',
      handoff: loaded.snapshot,
    });
    assert.equal(session.mode, FOCUS_PAGE_MODE.real_diary);
    assert.equal(session.uid, UID);
    assert.ok(session.fullHistory);
    assert.notEqual(session.banner, undefined);
  });

  it('flusso normale: genera (askAi mock) → editoriale v3 → persist → refresh client2', async () => {
    const publicationDate = localIso();
    const analysisDate = addCalendarDays(publicationDate, -1);
    const history = richHistory(analysisDate, publicationDate);
    const persistence = createMemoryFocusAiAnalysisStore();

    // 1–3: login UID + load diary senza handoff preesistente
    __resetFocusDiaryHandoffForTests();
    const loaded = await loadFocusAuthenticatedDiary({
      uid: UID,
      db: {},
      get: makeGet(UID, history),
      ref,
      publicationDate,
      analysisDate,
      stash: true,
    });
    assert.equal(loaded.ok, true);

    const session = resolveFocusPageSession({
      uid: UID,
      periodId: 'ieri',
      handoff: peekFocusDiaryForUser(UID),
    });
    assert.equal(session.mode, FOCUS_PAGE_MODE.real_diary);

    // 4–5: Genera analisi con provider mock (NON mockEditorial URL)
    const gen = await requestFocusAiCoachAnalysis({
      session,
      persistence,
      askAiFn: askAiFromPeriod('ieri'),
      force: true,
    });
    assert.equal(gen.ok, true, gen.userMessage || gen.reason);
    assert.equal(gen.analysis.schema, 'kentu.focusAiCoachAnalysis.v3');
    assert.ok(gen.analysis.headline);
    assert.ok((gen.analysis.sections || []).length >= 1);
    assert.ok(gen.analysis.expectedChange);

    const view = normalizeFocusEditorialAnalysis(gen.analysis);
    assert.equal(view.legacyCompat, false);
    assert.ok(view.headline);
    assert.ok(view.recommendedAction);

    // 6–8: refresh / secondo client stesso UID
    __resetFocusAiCoachMemoryForTests();
    clearFocusDiaryForUser(UID);
    const reloaded = await loadFocusAuthenticatedDiary({
      uid: UID,
      db: {},
      get: makeGet(UID, history),
      ref,
      publicationDate,
      analysisDate,
      stash: true,
    });
    const session2 = resolveFocusPageSession({
      uid: UID,
      periodId: 'ieri',
      handoff: reloaded.snapshot,
    });
    const built = buildFocusAiCoachDossier(session2);
    assert.equal(built.ok, true);

    const remote = await loadFocusAiAnalysisFromStore({
      uid: UID,
      periodId: 'ieri',
      windowKey: built.binding.windowKey || built.binding.analysisDate,
      currentDataVersion: built.dataVersion,
      persistence,
    });
    assert.equal(remote.ok, true);
    assert.equal(remote.record.analysis.headline, gen.analysis.headline);

    const hist = await listFocusAiAnalysisHistory({
      uid: UID,
      periodId: 'ieri',
      persistence,
    });
    assert.ok((hist.rows || []).length >= 1);

    // 9–10: UID diverso isolato; demo non contaminata
    const other = await loadFocusAiAnalysisFromStore({
      uid: UID_B,
      periodId: 'ieri',
      windowKey: built.binding.windowKey || built.binding.analysisDate,
      currentDataVersion: built.dataVersion,
      persistence,
    });
    assert.equal(other.ok && other.record?.analysis ? true : false, false);

    const demoSession = resolveFocusPageSession({ uid: null, periodId: 'ieri', handoff: null });
    assert.equal(demoSession.mode, FOCUS_PAGE_MODE.demo_preview);
    const demoGate = await requestFocusAiCoachAnalysis({
      session: demoSession,
      persistence,
      askAiFn: askAiFromPeriod('ieri'),
    });
    assert.equal(demoGate.ok, false);
    assert.match(demoGate.userMessage || '', /diario reale|dimostrativa/i);
  });

  it('settimana: stesso percorso loader → real_diary + editoriale mock provider', async () => {
    const publicationDate = localIso();
    const analysisDate = addCalendarDays(publicationDate, -1);
    const history = richHistory(analysisDate, publicationDate);
    const persistence = createMemoryFocusAiAnalysisStore();

    const loaded = await loadFocusAuthenticatedDiary({
      uid: UID,
      db: {},
      get: makeGet(UID, history),
      ref,
      publicationDate,
      analysisDate,
    });
    const session = resolveFocusPageSession({
      uid: UID,
      periodId: 'settimana',
      handoff: loaded.snapshot,
    });
    assert.equal(session.mode, FOCUS_PAGE_MODE.real_diary);

    const gen = await requestFocusAiCoachAnalysis({
      session,
      persistence,
      askAiFn: askAiFromPeriod('settimana'),
      force: true,
    });
    assert.equal(gen.ok, true, gen.userMessage || gen.reason);
    assert.match(gen.analysis.headline, /forza|energia|supporto/i);
    assert.ok(gen.analysis.sections.some((s) => /cardio|stimolo|pilota|bussola/i.test(s.title)));
  });
});
