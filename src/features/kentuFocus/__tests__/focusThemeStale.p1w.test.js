/**
 * Tema Focus (ui_preferences) non deve entrare in dataVersion né rendere stale le analisi.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildFocusAiCoachDossier,
  markFocusAiAnalysisFreshness,
  resolveFocusPageSession,
  __resetFocusDiaryHandoffForTests,
  __resetFocusAiCoachMemoryForTests,
  __resetFocusAiAnalysisPersistenceForTests,
} from '../product/index.js';
import {
  focusThemeLegacyRtdbPath,
  focusThemeRtdbPath,
  loadFocusThemeFromRtdb,
  normalizeFocusTheme,
  writeFocusThemeToRtdb,
} from '../product/focusTheme.js';

const DAY = '2026-10-23';
const PUB = '2026-10-24';
const __dirname = dirname(fileURLToPath(import.meta.url));

function buildHistory() {
  return {
    [`trackerStorico_${DAY}`]: {
      data: DAY,
      mealTimes: { pranzo: 13, cena: 20 },
      log: [
        {
          type: 'food',
          id: 'f1',
          mealType: 'pranzo',
          mealTime: 13,
          name: 'Yogurt greco',
          grams: 150,
          kcal: 140,
          prot: 12,
          carb: 14,
          fat: 3,
        },
        {
          type: 'workout',
          id: 'w1',
          name: 'Camminata',
          durationMin: 30,
        },
      ],
      manualNodes: [],
    },
    [`trackerStorico_${PUB}`]: {
      data: PUB,
      log: [{
        type: 'sleep',
        id: 's1',
        hours: 7.5,
        wakeTime: 7,
        bedtime: 23.5,
        quality: 4,
      }],
    },
  };
}

function realSession(uid = 'uid_theme_p1w') {
  return resolveFocusPageSession({
    uid,
    periodId: 'ieri',
    handoff: {
      uid,
      fullHistory: buildHistory(),
      analysisDate: DAY,
      publicationDate: PUB,
      userTargets: { kcal: 2200, prot: 140 },
    },
  });
}

function createMemoryRtdb() {
  /** @type {Map<string, unknown>} */
  const store = new Map();
  return {
    db: {},
    ref: (_db, path) => ({ path: String(path) }),
    async get(refObj) {
      const path = refObj.path;
      return {
        val() {
          return store.has(path) ? store.get(path) : null;
        },
      };
    },
    async set(refObj, value) {
      const path = refObj.path;
      if (value == null) store.delete(path);
      else store.set(path, value);
    },
    store,
  };
}

describe('Focus theme path + dataVersion isolation P1w', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
    __resetFocusAiCoachMemoryForTests();
    __resetFocusAiAnalysisPersistenceForTests();
  });

  it('dataVersion hash non include ui_preferences / focusTheme / profile_targets', () => {
    const dossierSrc = readFileSync(
      join(__dirname, '../product/buildFocusAiCoachDossier.js'),
      'utf8',
    );
    const match = dossierSrc.match(
      /const dataVersion = shortHash\(stableStringify\(\{([\s\S]*?)\}\)\);/,
    );
    assert.ok(match, 'blocco dataVersion non trovato');
    const payload = match[1];
    assert.doesNotMatch(payload, /ui_preferences|focusTheme|profile_targets|localStorage/i);
  });

  it('cambiare tema (o attaccare preferenze UI alla session) non cambia dataVersion né rende stale', () => {
    const session = realSession();
    const builtA = buildFocusAiCoachDossier(session);
    assert.equal(builtA.ok, true);
    assert.ok(builtA.dataVersion);

    // Simula “cambio tema” e rumore UI sul session object: non devono entrare nel hash.
    session.focusTheme = 'dark';
    session.ui_preferences = { focusTheme: 'light' };
    session.uiPreferences = { focusTheme: 'system' };
    session.profile_targets = { profile: { focusTheme: 'dark' } };

    const builtB = buildFocusAiCoachDossier(session);
    assert.equal(builtB.ok, true);
    assert.equal(builtB.dataVersion, builtA.dataVersion);

    const record = {
      dataVersion: builtA.dataVersion,
      definitive: true,
      foodQualityCompleteness: 'complete',
      analysis: { schema: 'kentu.focusAiCoachAnalysis.v4' },
      generatedAt: Date.now(),
    };
    const marked = markFocusAiAnalysisFreshness(record, builtB.dataVersion);
    assert.equal(marked.diaryStale, false);

    // Controllo negativo: un vero cambio diario rende stale.
    session.fullHistory[`trackerStorico_${DAY}`].log.push({
      type: 'food',
      id: 'f_extra',
      mealType: 'cena',
      mealTime: 20,
      name: 'Banana',
      grams: 100,
      kcal: 90,
      prot: 1,
      carb: 22,
      fat: 0,
    });
    const builtC = buildFocusAiCoachDossier(session);
    assert.notEqual(builtC.dataVersion, builtA.dataVersion);
    const stale = markFocusAiAnalysisFreshness(record, builtC.dataVersion);
    assert.equal(stale.diaryStale, true);
  });

  it('path RTDB nuovo + migrazione da legacy profile_targets', async () => {
    const uid = 'uid_migrate_theme';
    assert.equal(focusThemeRtdbPath(uid), `users/${uid}/ui_preferences/focusTheme`);
    assert.equal(
      focusThemeLegacyRtdbPath(uid),
      `users/${uid}/profile_targets/profile/focusTheme`,
    );

    const mem = createMemoryRtdb();
    await mem.set(mem.ref(mem.db, focusThemeLegacyRtdbPath(uid)), 'dark');

    const migrated = await loadFocusThemeFromRtdb({
      uid,
      get: mem.get,
      set: mem.set,
      ref: mem.ref,
      db: mem.db,
    });
    assert.equal(migrated, 'dark');
    assert.equal(mem.store.get(focusThemeRtdbPath(uid)), 'dark');
    assert.equal(mem.store.has(focusThemeLegacyRtdbPath(uid)), false);

    const wrote = await writeFocusThemeToRtdb({
      uid,
      pref: 'light',
      set: mem.set,
      ref: mem.ref,
      db: mem.db,
    });
    assert.equal(wrote, true);
    assert.equal(mem.store.get(focusThemeRtdbPath(uid)), 'light');
    assert.equal(normalizeFocusTheme('light'), 'light');
  });
});
