import {
  generateWorkoutComboSignature,
  getWorkoutActivityTypeDef,
  normalizeMuscleGroupArray,
  resolveActivitySheetTab,
  resolveWorkoutActivityTypeId,
  resolveWorkoutMusclesForForm,
} from '../../activityCatalog';
import { TRACKER_STORICO_KEY, getLogFromStoricoTree } from '../../coreEngine';
import {
  parseDurationMinutesInput,
  WORKOUT_DURATION_DEFAULT,
  WORKOUT_DURATION_MAX,
  WORKOUT_DURATION_MIN,
} from '../../utils/durationMinutesInput';

/** Fallback kcal se non esiste alcuno storico per quella tipologia. */
export const DEFAULT_WORKOUT_KCAL = 300;

const SKIP_ENTRY_TYPES = new Set([
  'food',
  'meal',
  'recipe',
  'single',
  'sleep',
  'nap',
  'work',
  'cognitive',
  'ghost_workout',
  'ghost_meal',
]);

/**
 * @param {unknown} node
 * @returns {object[]}
 */
function logFromHistoryNode(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node.filter(Boolean);
  if (typeof node !== 'object') return [];
  if (Array.isArray(node.dailyLog)) return node.dailyLog.filter(Boolean);
  const nested = node.log ?? node.dati?.log;
  if (Array.isArray(nested)) return nested.filter(Boolean);
  if (nested && typeof nested === 'object') return Object.values(nested).filter(Boolean);
  if (Array.isArray(node.items)) return node.items.filter(Boolean);
  return [];
}

/**
 * @param {string} key
 * @returns {string | null}
 */
function dateFromHistoryKey(key) {
  const raw = String(key || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (raw.startsWith('trackerStorico_')) {
    const d = raw.slice('trackerStorico_'.length);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  return null;
}

/**
 * @param {object} entry
 * @returns {string | null}
 */
function resolvePhysicalWorkoutType(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.isGhost) return null;
  const t = String(entry.type || '').toLowerCase();
  if (SKIP_ENTRY_TYPES.has(t)) return null;
  const rawType = entry.workoutType || entry.subType || (t === 'workout' || t === 'activity' ? 'pesi' : '');
  const typeId = resolveWorkoutActivityTypeId(rawType) || (t === 'workout' || t === 'activity' ? 'pesi' : null);
  if (!typeId) return null;
  const def = getWorkoutActivityTypeDef(typeId);
  if (def?.nodeKind && def.nodeKind !== 'workout') return null;
  return resolveActivitySheetTab(typeId);
}

/**
 * @param {object} entry
 * @returns {number | null}
 */
export function readLoggedWorkoutKcal(entry) {
  const n = Number(entry?.kcal ?? entry?.cal ?? entry?.workoutKcal);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(50, Math.min(750, Math.round(n)));
}

/**
 * Duration in log: ore decimali (salvataggio attuale) oppure minuti legacy (> 24).
 * @param {object} entry
 * @returns {number | null}
 */
export function readLoggedWorkoutDurationMin(entry) {
  const raw = Number(entry?.durationMin ?? entry?.minutes ?? entry?.duration);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const hours = raw > 24 ? raw / 60 : raw;
  const minutes = Math.round(hours * 60);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.max(WORKOUT_DURATION_MIN, Math.min(WORKOUT_DURATION_MAX, minutes));
}

/**
 * @param {object} entry
 * @returns {number}
 */
function entryTimeScore(entry) {
  const t = Number(entry?.time ?? entry?.mealTime);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Elenco allenamenti fisici, più recenti prima (data + orario).
 *
 * @param {{
 *   dailyLog?: object[],
 *   fullHistory?: object | null,
 *   todayIso?: string | null,
 * }} [options]
 * @returns {Array<{ entry: object, date: string, typeId: string, signature: string }>}
 */
export function collectLoggedWorkoutsNewestFirst({
  dailyLog = [],
  fullHistory = null,
  todayIso = null,
} = {}) {
  const seen = new Set();
  const out = [];

  const pushLog = (log, date) => {
    const day = String(date || '').slice(0, 10);
    if (!day) return;
    for (const entry of Array.isArray(log) ? log : []) {
      const typeId = resolvePhysicalWorkoutType(entry);
      if (!typeId) continue;
      const id = String(entry?.id || `${day}:${entryTimeScore(entry)}:${typeId}`);
      if (seen.has(id)) continue;
      seen.add(id);
      const muscles = resolveWorkoutMusclesForForm(entry);
      out.push({
        entry,
        date: day,
        typeId,
        signature: generateWorkoutComboSignature(typeId, muscles),
        time: entryTimeScore(entry),
      });
    }
  };

  const liveDate = String(todayIso || '').slice(0, 10);
  if (liveDate) pushLog(dailyLog, liveDate);

  const tree = fullHistory && typeof fullHistory === 'object' ? fullHistory : {};
  for (const [key, node] of Object.entries(tree)) {
    const date = dateFromHistoryKey(key);
    if (!date || date === liveDate) continue;
    const fromTree = getLogFromStoricoTree(tree, date);
    pushLog(fromTree.length > 0 ? fromTree : logFromHistoryNode(node), date);
  }

  // Giorni in fullHistory senza prefisso, o nodo oggi se dailyLog era vuoto.
  if (liveDate && (!Array.isArray(dailyLog) || dailyLog.length === 0)) {
    const todayNode = tree[TRACKER_STORICO_KEY(liveDate)] || tree[liveDate];
    pushLog(getLogFromStoricoTree(tree, liveDate).length > 0
      ? getLogFromStoricoTree(tree, liveDate)
      : logFromHistoryNode(todayNode), liveDate);
  }

  out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.time !== b.time) return b.time - a.time;
    return 0;
  });
  return out;
}

/**
 * Ultimo valore kcal/durata per tab + distretto/combinazione.
 * Forza: match esatto della combinazione, altrimenti ultimo pesi in generale.
 * Cardio/HIIT: solo la disciplina specifica.
 *
 * @param {{
 *   workoutType?: string,
 *   muscles?: string[],
 *   dailyLog?: object[],
 *   fullHistory?: object | null,
 *   todayIso?: string | null,
 *   index?: ReturnType<typeof collectLoggedWorkoutsNewestFirst> | null,
 * }} [options]
 * @returns {{ kcal: number, durationMin: number, matched: 'combo' | 'type' | 'none' }}
 */
export function resolveLastWorkoutMemory({
  workoutType = 'pesi',
  muscles = [],
  dailyLog = [],
  fullHistory = null,
  todayIso = null,
  index = null,
} = {}) {
  const tab = resolveActivitySheetTab(workoutType);
  const musclesCanon = normalizeMuscleGroupArray(muscles);
  const wantSig = generateWorkoutComboSignature(tab, musclesCanon);
  const rows = Array.isArray(index)
    ? index
    : collectLoggedWorkoutsNewestFirst({ dailyLog, fullHistory, todayIso });

  const comboHit = rows.find((row) => row.signature === wantSig);
  const typeHit = rows.find((row) => row.typeId === tab);
  const hit = comboHit || typeHit;

  const kcal = hit ? readLoggedWorkoutKcal(hit.entry) : null;
  const durationMin = hit ? readLoggedWorkoutDurationMin(hit.entry) : null;

  return {
    kcal: kcal ?? DEFAULT_WORKOUT_KCAL,
    durationMin: parseDurationMinutesInput(durationMin ?? WORKOUT_DURATION_DEFAULT, {
      min: WORKOUT_DURATION_MIN,
      max: WORKOUT_DURATION_MAX,
      fallback: WORKOUT_DURATION_DEFAULT,
    }),
    matched: comboHit ? 'combo' : hit ? 'type' : 'none',
  };
}
