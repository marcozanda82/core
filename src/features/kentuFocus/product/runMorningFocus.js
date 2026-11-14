/**
 * Prima apertura della giornata: genera in background i rapporti mancanti
 * e, su Android, programma la notifica. Non blocca la Home.
 */

import { get, ref, set } from 'firebase/database';
import { db } from '../../../firebaseConfig.js';
import { loadKentuDatabases, peekKentuDatabasesSnapshot } from '../../../foodLoader.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { normalizeSleepNight } from '../normalize/normalizeSleepNight.js';
import { focusLocalIsoDate, loadFocusAuthenticatedDiary } from './loadFocusAuthenticatedDiary.js';
import { resolveFocusPageSession } from './buildFocusPageSession.js';
import { buildFocusAiCoachDossier } from './buildFocusAiCoachDossier.js';
import { focusPeriodWindow } from './ui/focusPeriodCursor.js';
import { resolveEmulatorFocusAskAi } from './emulatorFocusAskAi.js';
import { createMovementCheckinStore } from '../score/movementCheckin.js';
import {
  createFirebaseFocusAiAnalysisStore,
  getDefaultMemoryFocusAiAnalysisStore,
} from './focusAiAnalysisPersistence.js';
import {
  loadFocusAiAnalysisFromStore,
  requestFocusAiCoachAnalysis,
} from './requestFocusAiCoachAnalysis.js';
import {
  autoGenerationDecision,
  autoGenerationKey,
  isFirstOpenOfDay,
  periodsToGenerate,
} from './morningFocus.js';
import { patchMorningState, readMorningState } from './morningFocusStore.js';
import {
  listenForFocusNotificationOpen,
  scheduleFocusNotifications,
} from './focusMorningNotifications.js';

let started = false;

export function runMorningFocus({ uid } = {}) {
  const id = String(uid || '').trim();
  if (!id || started) return Promise.resolve();
  const today = focusLocalIsoDate();
  const state = readMorningState();
  const first = isFirstOpenOfDay(state.lastOpenDate, today);
  if (first) patchMorningState({ lastOpenDate: today });
  started = true;
  listenForFocusNotificationOpen();
  return prepare(id, today, first).catch(() => {});
}

async function prepare(uid, today, first) {
  try {
    await loadKentuDatabases();
  } catch {
    /* i cataloghi mancanti non bloccano la Home; la generazione di oggi non riprova */
  }
  const loaded = await loadFocusAuthenticatedDiary({
    uid,
    db,
    get,
    ref,
    stash: true,
    mode: 'recent',
    publicationDate: today,
    analysisDate: addCalendarDays(today, -1),
  });
  const snapshot = loaded.ok ? loaded.snapshot : null;
  await scheduleFocusNotifications({
    wakeHours: collectWakeHours(snapshot?.fullHistory, today),
    today,
  });
  if (!first || !snapshot) return;
  const catalogs = peekKentuDatabasesSnapshot();
  for (const periodId of periodsToGenerate(today)) {
    try {
      await generateOne({ uid, today, periodId, snapshot, catalogs });
    } catch {
      const key = autoGenerationKey(periodId, 'errore');
      if (autoGenerationDecision(readMorningState(), key, today) === 'run') {
        const current = readMorningState();
        patchMorningState({ auto: { ...current.auto, [key]: { status: 'failed', on: today } } });
      }
    }
  }
}

async function generateOne({ uid, today, periodId, snapshot, catalogs }) {
  const window = focusPeriodWindow(periodId, today, 0);
  const session = resolveFocusPageSession({
    uid,
    periodId,
    handoff: {
      ...snapshot,
      analysisDate: window.analysisDate,
      publicationDate: addCalendarDays(window.analysisDate, 1),
    },
  });
  let movementCheckins = {};
  try {
    movementCheckins = await createMovementCheckinStore({ db, uid }).readAll() || {};
  } catch {
    movementCheckins = {};
  }
  const built = buildFocusAiCoachDossier(
    { ...session, foodCatalogs: catalogs, movementCheckins },
    { foodCatalogs: catalogs },
  );
  const key = autoGenerationKey(periodId, built.dataVersion || window.analysisDate);
  if (autoGenerationDecision(readMorningState(), key, today) !== 'run') return;
  if (!built.ok) {
    remember(key, 'failed', today);
    return;
  }
  const persistence = focusPersistence();
  try {
    const existing = await loadFocusAiAnalysisFromStore({
      uid,
      periodId,
      windowKey: built.binding?.windowKey || window.analysisDate,
      currentDataVersion: built.dataVersion,
      persistence,
    });
    if (existing?.ok && existing.record?.analysis?.schema === 'kentu.focusAiCoachAnalysis.v5'
      && existing.record.dataVersion === built.dataVersion) {
      remember(key, 'done', today);
      return;
    }
  } catch {
    /* si prova la generazione */
  }
  try {
    const result = await requestFocusAiCoachAnalysis({
      session: { ...session, foodCatalogs: catalogs },
      persistence,
      force: false,
      askAiFn: resolveEmulatorFocusAskAi(),
    });
    remember(key, result?.ok && result.analysis ? 'done' : 'failed', today);
  } catch {
    remember(key, 'failed', today);
  }
}

function remember(key, status, today) {
  const current = readMorningState();
  patchMorningState({
    auto: { ...current.auto, [key]: { status, on: today } },
  });
}

function focusPersistence() {
  try {
    if (db) return createFirebaseFocusAiAnalysisStore({ db, ref, get, set });
  } catch {
    /* memoria */
  }
  return getDefaultMemoryFocusAiAnalysisStore();
}

function collectWakeHours(fullHistory, today) {
  const hours = [];
  if (!fullHistory) return hours;
  for (let back = 1; back <= 60 && hours.length < 14; back += 1) {
    const date = addCalendarDays(today, -back);
    const node = getTrackerDayNode(fullHistory, date);
    const pack = normalizeSleepNight(node, { publicationDate: date, lastMealHour: null });
    const wake = pack?.sleep?.wakeTime?.value;
    if (Number.isFinite(wake)) hours.push(wake);
  }
  return hours;
}
