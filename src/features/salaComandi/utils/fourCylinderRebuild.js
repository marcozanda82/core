import { getLogFromStoricoTree, TRACKER_STORICO_KEY } from '../../../coreEngine';
import { addDays } from '../../../calendarDateUtils';
import { getWorkoutActivityTypeDef, normalizeMuscleGroupArray } from '../../../activityCatalog';
import {
  applyCognitiveStressPipeline,
  applySleepPipeline,
  applyWorkoutPipeline,
  catchUpDecayToDate,
  createDefaultFourCylinderState,
  FOUR_CYLINDER_ENGINE_VERSION,
  fourCylinderFromPhysiologyModel,
  sanitizeFourCylinderState,
} from '../engines/fourCylinderEngine';
import {
  buildDailyNutritionMap,
  isCurrentlyFasted,
} from './fourCylinderNutritionBridge';
import { resolveSleepRecoveryInput } from './fourCylinderSleepBridge';
import { persistFourCylinderState } from './fourCylinderPersist';
import { MUSCLE_STIMULUS_WINDOW_DAYS } from '../../trendHub/utils/muscleSpillover.js';

/**
 * True se fullHistory ha almeno un nodo tracker (storico idratato con dati).
 * @param {object | null | undefined} fullHistory
 * @returns {boolean}
 */
export function isTrackerHistoryHydrated(fullHistory) {
  return Boolean(fullHistory && typeof fullHistory === 'object' && Object.keys(fullHistory).length > 0);
}

/**
 * True se esiste almeno un allenamento (workout) negli ultimi `lookbackDays` giorni.
 * @param {object | null | undefined} fullHistory
 * @param {string} anchorDateIso
 * @param {number} [lookbackDays=7]
 * @returns {boolean}
 */
export function trackerHistoryHasRecentWorkout(fullHistory, anchorDateIso, lookbackDays = 7) {
  if (!isTrackerHistoryHydrated(fullHistory)) return false;
  const anchor = String(anchorDateIso || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return false;
  const days = Math.max(1, Math.floor(Number(lookbackDays) || 7));

  for (let i = 0; i < days; i += 1) {
    const dateIso = addDays(anchor, -i);
    const log = getLogFromStoricoTree(fullHistory, dateIso);
    const treeNode = fullHistory?.[TRACKER_STORICO_KEY(dateIso)];
    const manualNodes = treeNode?.manualNodes || [];
    const events = collectFourCylinderDayEvents(dateIso, log, manualNodes);
    if (events.some((e) => e.kind === 'workout')) return true;
  }
  return false;
}

/**
 * @param {unknown} item
 * @returns {boolean}
 */
export function isFourCylinderTimelineTarget(item) {
  if (!item || typeof item !== 'object') return false;
  const type = item.type;
  return type === 'workout' || type === 'work' || type === 'cognitive';
}

/**
 * @param {object | null | undefined} fullHistory
 * @param {string} anchorDateIso
 * @returns {string[]}
 */
function collectTrackerDateKeys(fullHistory, anchorDateIso) {
  const dates = new Set([String(anchorDateIso).slice(0, 10)]);
  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};
  for (const key of Object.keys(tree)) {
    const match = /(\d{4}-\d{2}-\d{2})/.exec(String(key));
    if (match) dates.add(match[1]);
  }
  return [...dates].sort();
}

/**
 * @param {string} dateIso
 * @param {Array | null | undefined} log
 * @param {Array | null | undefined} manualNodes
 * @returns {Array<{ sortKey: number, kind: 'workout' | 'cognitive' | 'sleep', payload: object }>}
 */
function collectFourCylinderDayEvents(dateIso, log, manualNodes) {
  /** @type {Array<{ sortKey: number, kind: 'workout' | 'cognitive' | 'sleep', payload: object }>} */
  const events = [];
  const nodeIds = new Set();

  for (const node of manualNodes || []) {
    if (!node || node.isGhost === true) continue;
    if (!isFourCylinderTimelineTarget(node)) continue;

    nodeIds.add(String(node.id));
    const sortKey = Number(node.time ?? node.startTime) || 12;

    if (node.type === 'workout') {
      events.push({
        sortKey,
        kind: 'workout',
        payload: {
          workoutId: node.id,
          workoutType: node.subType || node.workoutType || 'pesi',
          muscles: normalizeMuscleGroupArray(node.muscles || []),
          kcal: Number(node.kcal) || 0,
          duration: Number(node.duration) || 0.5,
          date: dateIso,
        },
      });
      continue;
    }

    events.push({
      sortKey,
      kind: 'cognitive',
      payload: {
        sessionId: node.id,
        workoutType: node.subType || node.workoutType || (node.type === 'work' ? 'lavoro' : 'studio'),
        duration: Number(node.duration) || 0.5,
        date: dateIso,
      },
    });
  }

  for (const entry of log || []) {
    if (!entry || typeof entry !== 'object') continue;

    if (entry.type === 'sleep') {
      events.push({
        sortKey: Number(entry.time ?? entry.mealTime) || 7,
        kind: 'sleep',
        payload: { entry, date: dateIso },
      });
      continue;
    }

    if (entry.type !== 'workout' || nodeIds.has(String(entry.id))) continue;

    const workoutType = entry.workoutType || 'pesi';
    const def = getWorkoutActivityTypeDef(workoutType);
    const nodeKind = def?.nodeKind ?? 'workout';
    const sortKey = Number(entry.time ?? entry.mealTime) || 12;

    if (nodeKind === 'workout') {
      events.push({
        sortKey,
        kind: 'workout',
        payload: {
          workoutId: entry.id,
          workoutType,
          muscles: normalizeMuscleGroupArray(entry.muscles || []),
          kcal: Number(entry.kcal ?? entry.cal) || 0,
          duration: Number(entry.duration) || 0.5,
          date: dateIso,
        },
      });
    } else {
      events.push({
        sortKey,
        kind: 'cognitive',
        payload: {
          sessionId: entry.id,
          workoutType,
          duration: Number(entry.duration) || 0.5,
          date: dateIso,
        },
      });
    }
  }

  events.sort((a, b) => a.sortKey - b.sortKey);
  return events;
}

/**
 * Ricalcola fourCylinder da zero ripercorrendo lo storico tracker (post-cancellazione allenamento).
 *
 * @param {{
 *   fullHistory?: object | null,
 *   anchorDateIso: string,
 *   activeLog?: Array | null,
 *   activeManualNodes?: Array | null,
 *   proteinTarget?: number | null,
 *   seedState?: object | null,
 * }} options
 * @returns {import('../engines/fourCylinderEngine').FourCylinderState}
 */
export function rebuildFourCylinderFromTrackerHistory({
  fullHistory = null,
  anchorDateIso,
  activeLog = null,
  activeManualNodes = null,
  proteinTarget = null,
  seedState = null,
}) {
  const todayIso = String(anchorDateIso).slice(0, 10);
  const allDates = collectTrackerDateKeys(fullHistory, todayIso);
  // Finestra mobile 7gg: solo sessioni recenti alimentano lo stimolo ipertrofico settimanale.
  const windowStart = addDays(todayIso, -(MUSCLE_STIMULUS_WINDOW_DAYS - 1));
  const sortedDates = allDates.filter((d) => d >= windowStart && d <= todayIso);
  const firstDate = sortedDates[0] || todayIso;

  let state = createDefaultFourCylinderState(firstDate);
  if (seedState?.params) {
    state = sanitizeFourCylinderState({
      ...state,
      params: { ...state.params, ...seedState.params },
    }, firstDate);
  }

  const nutritionMap = buildDailyNutritionMap(fullHistory, proteinTarget, {
    activeLog,
    anchorDate: todayIso,
  });

  for (const dateIso of sortedDates) {
    const log = dateIso === todayIso
      ? (Array.isArray(activeLog) ? activeLog : getLogFromStoricoTree(fullHistory, dateIso))
      : getLogFromStoricoTree(fullHistory, dateIso);
    const treeNode = fullHistory?.[TRACKER_STORICO_KEY(dateIso)];
    const manualNodes = dateIso === todayIso
      ? (Array.isArray(activeManualNodes) ? activeManualNodes : (treeNode?.manualNodes || []))
      : (treeNode?.manualNodes || []);

    const dayEvents = collectFourCylinderDayEvents(dateIso, log, manualNodes);
    const dayLogForFasted = dateIso === todayIso
      ? (Array.isArray(activeLog) ? activeLog : log)
      : log;

    for (const event of dayEvents) {
      if (event.kind === 'workout') {
        const isFastedState = isCurrentlyFasted(dayLogForFasted, {
          fullHistory,
          anchorDate: dateIso,
          dayNode: treeNode,
        });
        const { nextState } = applyWorkoutPipeline(
          state,
          { ...event.payload, isFastedState },
          dateIso,
          nutritionMap,
        );
        state = nextState;
        continue;
      }

      if (event.kind === 'cognitive') {
        const { nextState } = applyCognitiveStressPipeline(
          state,
          event.payload,
          dateIso,
          nutritionMap,
        );
        state = nextState;
        continue;
      }

      const { sleepHours, recoveryEfficiency } = resolveSleepRecoveryInput(event.payload.entry);
      const { nextState } = applySleepPipeline(
        state,
        {
          sleepHours,
          recoveryEfficiency,
          sessionId: event.payload.entry?.id,
          date: dateIso,
        },
        dateIso,
        nutritionMap,
      );
      state = nextState;
    }
  }

  // Codino residuo: dal lastProcessedDate dell'ultimo evento fino a oggi (1+ notti di decay),
  // senza forzare lastProcessedDate=today che saltava il decadimento o (in passato) lo moltiplicava.
  const { nextState: caughtUp } = catchUpDecayToDate(state, todayIso, null, nutritionMap);

  return sanitizeFourCylinderState({
    ...caughtUp,
    engineVersion: FOUR_CYLINDER_ENGINE_VERSION,
    lastProcessedDate: todayIso,
    lastUpdatedIso: todayIso,
    updatedAt: Date.now(),
  }, todayIso);
}

/**
 * Calcola stato fourCylinder e snapshot log dopo salvataggio allenamento.
 * - Nuovo workout: pipeline incrementale.
 * - Edit / conversione ghost: rebuild completo + snapshot dell'evento corrente.
 *
 * @param {object} config
 * @returns {{ nextState: import('../engines/fourCylinderEngine').FourCylinderState, snapshot: object } | null}
 */
export function resolveFourCylinderForWorkoutSave({
  userModel,
  fullHistory = null,
  todayIso,
  newLog,
  newNodes,
  editingWorkoutId = null,
  finalId,
  isWork = false,
  isCognitive = false,
  workoutType,
  musclesCanon = [],
  workoutKcal = 0,
  duration = 0.5,
  logData = {},
  proteinTarget = null,
  dailyLog = null,
}) {
  if (!userModel || typeof userModel !== 'object') return null;

  const dateIso = String(todayIso).slice(0, 10);
  const nutritionMap = fullHistory
    ? buildDailyNutritionMap(fullHistory, proteinTarget, {
        activeLog: newLog,
        anchorDate: dateIso,
      })
    : null;

  const isFastedForLog = isCurrentlyFasted(newLog ?? dailyLog, {
    fullHistory,
    anchorDate: dateIso,
  });

  if (editingWorkoutId) {
    const nextState = rebuildFourCylinderFromTrackerHistory({
      fullHistory,
      anchorDateIso: dateIso,
      activeLog: newLog,
      activeManualNodes: newNodes,
      proteinTarget,
      seedState: userModel?.fourCylinder,
    });

    const logExcluding = (newLog || []).filter((e) => String(e?.id) !== String(finalId));
    const nodesExcluding = (newNodes || []).filter((n) => String(n?.id) !== String(finalId));
    const stateBefore = rebuildFourCylinderFromTrackerHistory({
      fullHistory,
      anchorDateIso: dateIso,
      activeLog: logExcluding,
      activeManualNodes: nodesExcluding,
      proteinTarget,
      seedState: userModel?.fourCylinder,
    });

    if (isWork || isCognitive) {
      const { snapshot } = applyCognitiveStressPipeline(
        stateBefore,
        {
          duration: Number(logData.duration) || duration,
          workoutType: String(logData.workoutType || workoutType),
          sessionId: finalId,
          date: dateIso,
        },
        dateIso,
        nutritionMap,
      );
      return { nextState, snapshot };
    }

    const { snapshot } = applyWorkoutPipeline(
      stateBefore,
      {
        workoutId: finalId,
        workoutType,
        muscles: musclesCanon,
        kcal: workoutKcal,
        duration,
        date: dateIso,
        isFastedState: isFastedForLog,
      },
      dateIso,
      nutritionMap,
    );
    return { nextState, snapshot };
  }

  const currentFourCylinder = fourCylinderFromPhysiologyModel(userModel, dateIso);
  const isFastedState = isCurrentlyFasted(dailyLog, {
    fullHistory,
    anchorDate: dateIso,
  });

  if (isWork || isCognitive) {
    const { nextState, snapshot } = applyCognitiveStressPipeline(
      currentFourCylinder,
      {
        duration: Number(logData.duration) || duration,
        workoutType: String(logData.workoutType || workoutType),
        sessionId: finalId,
        date: dateIso,
      },
      dateIso,
      nutritionMap,
    );
    return { nextState, snapshot };
  }

  const { nextState, snapshot } = applyWorkoutPipeline(
    currentFourCylinder,
    {
      workoutId: finalId,
      workoutType,
      muscles: musclesCanon,
      kcal: workoutKcal,
      duration,
      date: dateIso,
      isFastedState,
    },
    dateIso,
    nutritionMap,
  );
  return { nextState, snapshot };
}

/**
 * Aggiorna userModel e persiste solo `fourCylinder` su physiology_model.
 *
 * @param {object} config
 * @param {import('firebase/database').Database | null} [config.db]
 * @param {string | null} [config.userUid]
 * @param {Function} config.setUserModel
 * @param {import('../engines/fourCylinderEngine').FourCylinderState} config.nextFourCylinderState
 */
export function persistFourCylinderRebuild({
  db,
  userUid,
  setUserModel,
  nextFourCylinderState,
  fullHistory = null,
  anchorDateIso = null,
}) {
  persistFourCylinderState({
    db,
    userUid,
    setUserModel,
    nextFourCylinderState,
    fullHistory,
    anchorDateIso,
    source: 'persistFourCylinderRebuild',
  });
}
