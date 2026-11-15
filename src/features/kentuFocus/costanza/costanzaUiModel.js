/**
 * Modello UI Costanza — righe gruppi + muscoli da computeCostanzaForza.
 */

import {
  COSTANZA_UI_GROUPS,
  MUSCLE_LABELS,
} from './muscleIds.mm-1.js';
import {
  computeCostanzaForza,
  coverageStatusTo01,
  normalizeWeeklyGoalDays,
} from './costanzaForza.js';

export {
  coverageStatusTo01,
  costanzaSnapToPillarLevels01,
  computeCostanzaPillarLevels01,
} from './costanzaForza.js';

/** ISO locale YYYY-MM-DD senza dipendere da coreEngine (test Node puri). */
function localTodayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Chip catalogo da aprire al tap sul gruppo Costanza. */
export const COSTANZA_GROUP_CHIPS = Object.freeze({
  petto: Object.freeze(['Petto']),
  schiena: Object.freeze(['Dorso']),
  spalle: Object.freeze(['Spalle']),
  braccia: Object.freeze(['bicipiti', 'tricipiti', 'avambracci']),
  gambe: Object.freeze(['Gambe']),
  core: Object.freeze(['Core', 'abs']),
});

/**
 * @param {'coperto'|'toccato'|'vuoto'} status
 * @returns {'good'|'warning'|'critical'}
 */
export function costanzaStatusLevel(status) {
  if (status === 'coperto') return 'good';
  if (status === 'toccato') return 'warning';
  return 'critical';
}

/**
 * @param {object} muscleSnap computeCostanzaForza().muscles[id]
 * @returns {string}
 */
export function formatLastTrainedLabel(muscleSnap) {
  if (!muscleSnap || muscleSnap.neverIn30) return 'mai negli ultimi 30 giorni';
  const days = muscleSnap.daysSinceTrained;
  if (days == null) return 'mai negli ultimi 30 giorni';
  if (days === 0) return 'allenato oggi';
  if (days === 1) return 'allenato 1 giorno fa';
  return `allenato ${days} giorni fa`;
}

/**
 * @param {{
 *   fullHistory?: object|null,
 *   asOfDate?: string|null,
 *   weeklyGoalDays?: number,
 * }} [input]
 */
export function buildCostanzaUiModel(input = {}) {
  const asOfDate = String(input.asOfDate || localTodayIso()).slice(0, 10);
  const snap = computeCostanzaForza({
    fullHistory: input.fullHistory || {},
    asOfDate,
    weeklyGoalDays: normalizeWeeklyGoalDays(input.weeklyGoalDays),
  });

  const groups = COSTANZA_UI_GROUPS.map((g) => {
    const gSnap = snap.groups[g.id] || { status: 'vuoto', muscleIds: g.muscleIds };
    const muscles = g.muscleIds.map((mid) => {
      const m = snap.muscles[mid] || {
        status: 'vuoto',
        neverIn30: true,
        daysSinceTrained: null,
        lastTrained: null,
      };
      return {
        id: mid,
        label: MUSCLE_LABELS[mid] || mid,
        status: m.status,
        level: costanzaStatusLevel(m.status),
        lastLabel: formatLastTrainedLabel(m),
        daysSinceTrained: m.daysSinceTrained,
        neverIn30: m.neverIn30,
      };
    });
    return {
      id: g.id,
      label: g.label,
      status: gSnap.status,
      level: costanzaStatusLevel(gSnap.status),
      chips: COSTANZA_GROUP_CHIPS[g.id] || [],
      muscles,
      // Compat legacy MuscleStimulusDistrictList / tap
      pct: gSnap.status === 'coperto' ? 100 : gSnap.status === 'toccato' ? 40 : 0,
      value: gSnap.status === 'coperto' ? 1 : gSnap.status === 'toccato' ? 0.4 : 0,
      hubLabel: gSnap.status === 'vuoto' ? 'DA STIMOLARE' : gSnap.status === 'toccato' ? 'IN RECUPERO' : 'OTTIMALE',
    };
  });

  // Priorità: vuoti prima
  const ranked = [...groups].sort((a, b) => {
    const rank = { vuoto: 0, toccato: 1, coperto: 2 };
    const ra = rank[a.status] ?? 9;
    const rb = rank[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.label).localeCompare(String(b.label), 'it');
  });

  return {
    snap,
    groups: ranked,
    muscleRows: ranked,
    forceDaysThisWeek: snap.forceDaysThisWeek,
    weeklyGoalDays: snap.weeklyGoalDays,
    weekStreak: snap.weekStreak,
    honestLine: 'Conta i giorni e i gruppi allenati, non le serie.',
  };
}
