/**
 * Prima apertura della giornata: genera in background i rapporti mancanti
 * e, su Android, programma la notifica. Non blocca la Home.
 * Lock generazione su RTDB (users/{uid}/focus_ai_locks/{periodId}).
 */

import { get, ref, set, runTransaction } from 'firebase/database';
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
import { periodsToGenerate } from './morningFocus.js';
import { isFirstOpenOfDay } from './morningFocus.js';
import { patchMorningState, readMorningState } from './morningFocusStore.js';
import {
  createFirebaseFocusAiLockStore,
  createMemoryFocusAiLockStore,
} from './focusAiLocks.js';
import {
  listenForFocusNotificationOpen,
  scheduleFocusNotifications,
} from './focusMorningNotifications.js';

let started = false;

export function runMorningFocus({ uid, lockStore: injectedLocks } = {}) {
  const id = String(uid || '').trim();
  if (!id || started) return Promise.resolve();
  const today = focusLocalIsoDate();
  const state = readMorningState();
  const first = isFirstOpenOfDay(state.lastOpenDate, today);
  if (first) patchMorningState({ lastOpenDate: today });
  started = true;
  listenForFocusNotificationOpen();
  return prepare(id, today, first, injectedLocks).catch(() => {});
}

/** Solo test: reset flag in-memory. */
export function __resetMorningFocusStartedForTests() {
  started = false;
}

async function prepare(uid, today, first, injectedLocks) {
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
  const lockStore = injectedLocks || focusLockStore();
  for (const periodId of periodsToGenerate(today)) {
    try {
      await generateOne({ uid, today, periodId, snapshot, catalogs, lockStore });
    } catch {
      /* fallimento già gestito in generateOne / lock finish */
    }
  }
}

async function generateOne({ uid, today, periodId, snapshot, catalogs, lockStore }) {
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
  if (!built.ok) {
    return;
  }

  const claim = await lockStore.claimMorning({
    uid,
    periodId,
    dataVersion: built.dataVersion,
    today,
  });
  if (!claim.ok) return;

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
      await lockStore.finishMorning({
        uid,
        periodId,
        dataVersion: built.dataVersion,
        today,
        status: 'done',
      });
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
    await lockStore.finishMorning({
      uid,
      periodId,
      dataVersion: built.dataVersion,
      today,
      status: result?.ok && result.analysis ? 'done' : 'failed',
    });
  } catch {
    await lockStore.finishMorning({
      uid,
      periodId,
      dataVersion: built.dataVersion,
      today,
      status: 'failed',
    });
  }
}

function focusPersistence() {
  try {
    if (db) return createFirebaseFocusAiAnalysisStore({ db, ref, get, set });
  } catch {
    /* memoria */
  }
  return getDefaultMemoryFocusAiAnalysisStore();
}

function focusLockStore() {
  try {
    if (db) {
      return createFirebaseFocusAiLockStore({ db, ref, runTransaction, get });
    }
  } catch {
    /* memoria */
  }
  return createMemoryFocusAiLockStore();
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
