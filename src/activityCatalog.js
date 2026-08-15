/**
 * Catalogo unico: tipi attività / allenamento (timeline + log) e gruppi muscolari (wizard + pesi).
 * Gli `id` restano quelli già persistiti (Firebase / log) per compatibilità.
 */

/** Macro giornata (wizard Step 1) — non confondere con i tipi workout della timeline. */
export const PLANNING_DAY_MACRO_OPTIONS = [
  { id: 'mental', label: 'Lavoro Mentale / PC' },
  { id: 'physical', label: 'Lavoro Fisico' },
  { id: 'training', label: 'Allenamento' },
  { id: 'relax', label: 'Relax/Recupero' },
];

/**
 * @typedef {object} WorkoutMuscleGroupDef
 * @property {string} id — valore salvato su nodi / wizard (italiano, come storico)
 * @property {string} label — etichetta UI
 * @property {string[]} [aliases] — etichette legacy da normalizzare verso `id`
 */

/** Gruppi muscolari: unica lista per PlanningWizard e vista Attività / pesi. */
export const WORKOUT_MUSCLE_GROUP_DEFS = [
  { id: 'Petto', label: 'Petto', macroGroup: 'chest' },
  { id: 'Dorso', label: 'Dorso', aliases: ['Schiena', 'schiena'], macroGroup: 'back_shoulders' },
  { id: 'Gambe', label: 'Gambe', macroGroup: 'legs' },
  { id: 'Spalle', label: 'Spalle', macroGroup: 'back_shoulders' },
  { id: 'abs', label: 'ABS', macroGroup: 'core' },
  { id: 'bicipiti', label: 'Bicipiti', macroGroup: 'arms' },
  { id: 'tricipiti', label: 'Tricipiti', macroGroup: 'arms' },
  { id: 'avambracci', label: 'Avambracci', macroGroup: 'arms' },
  { id: 'Core', label: 'Core', aliases: ['Addominali', 'addominali'], macroGroup: 'core' },
  { id: 'Total Body', label: 'Total Body', aliases: ['Full Body', 'full body', 'totalbody'], macroGroup: 'total' },
];

/** Sezioni UI per chip muscolari (allineate ai 5 sismografi). */
export const WORKOUT_MUSCLE_MACRO_SECTIONS = Object.freeze([
  { id: 'legs', label: 'Gambe' },
  { id: 'chest', label: 'Petto' },
  { id: 'back_shoulders', label: 'Schiena e Spalle' },
  { id: 'arms', label: 'Braccia' },
  { id: 'core', label: 'Abs e Core' },
  { id: 'total', label: 'Full body' },
]);

/**
 * @param {string} macroId
 * @returns {typeof WORKOUT_MUSCLE_GROUP_DEFS}
 */
export function getMuscleGroupsForMacro(macroId) {
  return WORKOUT_MUSCLE_GROUP_DEFS.filter((d) => d.macroGroup === macroId);
}

/** Ordine display selettori muscolo (stesso ordine dei def). */
export const WORKOUT_MUSCLE_GROUP_IDS = WORKOUT_MUSCLE_GROUP_DEFS.map((d) => d.id);

const MUSCLE_ALIAS_TO_ID = new Map();
for (const d of WORKOUT_MUSCLE_GROUP_DEFS) {
  MUSCLE_ALIAS_TO_ID.set(String(d.id).toLowerCase(), d.id);
  for (const a of d.aliases || []) {
    MUSCLE_ALIAS_TO_ID.set(String(a).toLowerCase(), d.id);
  }
}

/**
 * Normalizza un'etichetta muscolo legacy → id canonico del catalogo.
 * Valori sconosciuti restano invariati (dati vecchi nel DB).
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizeMuscleGroupLabel(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return MUSCLE_ALIAS_TO_ID.get(s.toLowerCase()) ?? s;
}

/**
 * @param {string[] | string | null | undefined} muscles
 * @returns {string[]}
 */
export function normalizeMuscleGroupArray(muscles) {
  const list = Array.isArray(muscles)
    ? muscles
    : (muscles != null && String(muscles).trim() !== '' ? [muscles] : []);
  const out = [];
  const seen = new Set();
  for (const m of list) {
    const c = normalizeMuscleGroupLabel(m);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/**
 * Firma univoca per combo tab + muscoli (historical defaults planner).
 * @param {string} workoutType
 * @param {string[]} [musclesArray]
 * @returns {string}
 */
export function generateWorkoutComboSignature(workoutType, musclesArray = []) {
  const type = String(workoutType || 'pesi').trim() || 'pesi';
  const sorted = normalizeMuscleGroupArray(musclesArray)
    .slice()
    .sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
  return `${type}_${sorted.join('_')}`;
}

/**
 * Inferisce gruppi muscolari dal testo workout (log / ghost).
 * @param {{ desc?: string, name?: string, title?: string }} workout
 * @returns {string[]}
 */
export function inferMuscleGroupsFromWorkoutText(workout) {
  const text = `${workout?.desc || ''} ${workout?.name || ''} ${workout?.title || ''}`.toLowerCase();
  if (!text.trim()) return [];
  const found = [];
  const push = (id) => {
    const canon = normalizeMuscleGroupLabel(id) || id;
    if (WORKOUT_MUSCLE_GROUP_IDS.includes(canon) && !found.includes(canon)) found.push(canon);
  };
  if (/total\s*body|full\s*body|fullbody/.test(text)) push('Total Body');
  if (/petto|torace|pectoral|bench|panca/.test(text)) push('Petto');
  if (/dorso|schiena|lat\b|pull|remator|rowing|remata/.test(text)) push('Dorso');
  if (/gambe|quadricip|femorali|leg day|squat|stacco/.test(text)) push('Gambe');
  if (/bicipit/.test(text)) push('bicipiti');
  if (/tricipit/.test(text)) push('tricipiti');
  if (/bracci|curl|dip\b/.test(text)) {
    push('bicipiti');
    push('tricipiti');
  }
  if (/avambracc|forearm/.test(text)) push('avambracci');
  if (/spalle|deltoid|shoulder|lateral/.test(text)) push('Spalle');
  if (/\babs\b|addominal/.test(text)) push('abs');
  if (/\bcore\b/.test(text)) push('Core');
  return found;
}

/**
 * Muscoli per precompilare i toggle del form Attività.
 * Accetta id chip (`Gambe`), alias, macro sismografo (`legs` → chip della sezione),
 * oppure inferenza da `desc`/`name` se l'array manca.
 * @param {object | null | undefined} workout
 * @returns {string[]}
 */
export function resolveWorkoutMusclesForForm(workout) {
  const raw = Array.isArray(workout?.muscles) && workout.muscles.length > 0
    ? workout.muscles
    : Array.isArray(workout?.workoutMuscles) && workout.workoutMuscles.length > 0
      ? workout.workoutMuscles
      : [];

  if (raw.length === 0) {
    return inferMuscleGroupsFromWorkoutText(workout || {});
  }

  const out = [];
  const seen = new Set();
  const pushId = (id) => {
    const canon = normalizeMuscleGroupLabel(id) || String(id || '').trim();
    if (!canon || seen.has(canon)) return;
    seen.add(canon);
    out.push(canon);
  };

  for (const m of raw) {
    const token = String(m || '').trim();
    if (!token) continue;
    const canon = normalizeMuscleGroupLabel(token) || token;
    if (WORKOUT_MUSCLE_GROUP_IDS.includes(canon)) {
      pushId(canon);
      continue;
    }
    const macroChips = getMuscleGroupsForMacro(canon);
    if (macroChips.length > 0) {
      for (const chip of macroChips) pushId(chip.id);
      continue;
    }
    pushId(canon);
  }

  return out.length > 0 ? out : inferMuscleGroupsFromWorkoutText(workout || {});
}

/**
 * @typedef {object} WorkoutActivityTypeDef
 * @property {string} id
 * @property {string} label
 * @property {string} category
 * @property {'workout'|'work'|'cognitive'} nodeKind
 * @property {string} icon
 * @property {string} selectorButtonLabel
 * @property {boolean} [showInActivitySelector]
 * @property {number} [cognitiveMet] — MET stimato per kcal cognitive (solo studio / lavoro_pc)
 */

export const WORKOUT_ACTIVITY_TYPE_DEFS = [
  {
    id: 'pesi',
    label: 'Sollevamento pesi',
    category: 'strength',
    nodeKind: 'workout',
    icon: '🏋️',
    selectorButtonLabel: '🏋️ PESI',
    showInActivitySelector: true,
  },
  {
    id: 'cardio',
    label: 'Cardio',
    category: 'cardio',
    nodeKind: 'workout',
    icon: '💓',
    selectorButtonLabel: '💓 CARDIO',
    showInActivitySelector: true,
  },
  {
    id: 'hiit',
    label: 'HIIT / Circuito',
    category: 'hiit',
    nodeKind: 'workout',
    icon: '🔥',
    selectorButtonLabel: '🔥 HIIT',
    showInActivitySelector: true,
  },
  {
    id: 'camminata',
    label: 'Camminata',
    category: 'cardio',
    nodeKind: 'workout',
    icon: '🚶',
    selectorButtonLabel: '🚶 CAMMINATA',
    showInActivitySelector: true,
  },
  {
    id: 'corsa',
    label: 'Corsa',
    category: 'cardio',
    nodeKind: 'workout',
    icon: '🏃',
    selectorButtonLabel: '🏃 CORSA',
    showInActivitySelector: true,
  },
  {
    id: 'lavoro',
    label: 'Attività lavorativa',
    category: 'work',
    nodeKind: 'work',
    icon: '💼',
    selectorButtonLabel: '💼 LAVORO',
    showInActivitySelector: false,
  },
  {
    id: 'studio',
    label: 'Studio',
    category: 'cognitive',
    nodeKind: 'cognitive',
    icon: '📚',
    selectorButtonLabel: '📚 STUDIO',
    showInActivitySelector: false,
    cognitiveMet: 1.3,
  },
  {
    id: 'lavoro_pc',
    label: 'Lavoro PC',
    category: 'cognitive',
    nodeKind: 'cognitive',
    icon: '💻',
    selectorButtonLabel: '💻 LAVORO PC',
    showInActivitySelector: false,
    cognitiveMet: 1.5,
  },
  {
    id: 'misto',
    label: 'Misto',
    category: 'mixed',
    nodeKind: 'workout',
    icon: '🏋️',
    selectorButtonLabel: '🏋️ MISTO',
    showInActivitySelector: false,
  },
];

const ACTIVITY_BY_ID = new Map(WORKOUT_ACTIVITY_TYPE_DEFS.map((d) => [d.id, d]));

export function getWorkoutActivityTypeDef(id) {
  if (id == null) return undefined;
  return ACTIVITY_BY_ID.get(String(id));
}

/**
 * Tab Scheda Attività (ordine UI). Esclude sedentarie (lavoro/studio/PC).
 * @type {readonly string[]}
 */
export const WORKOUT_ACTIVITY_SELECTOR_IDS = Object.freeze([
  'pesi',
  'cardio',
  'hiit',
  'camminata',
  'corsa',
]);

/**
 * @param {unknown} raw
 * @returns {'pesi'|'cardio'|'hiit'|'camminata'|'corsa'}
 */
export function resolveActivitySheetTab(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (WORKOUT_ACTIVITY_SELECTOR_IDS.includes(s)) return s;
  return 'pesi';
}

/** Sticky in-memory: sopravvive al clear LS durante Strict Mode remount (~8s). */
let stickyActivitySheetTempTab = /** @type {string | null} */ (null);
let stickyActivitySheetTempUntil = 0;

/**
 * Salva il tab scelto dal pulsante rapido (LS + sticky).
 * @param {unknown} raw
 * @returns {'pesi'|'cardio'|'hiit'|'camminata'|'corsa'}
 */
export function stashActivitySheetTempTab(raw) {
  const tab = resolveActivitySheetTab(raw);
  stickyActivitySheetTempTab = tab;
  stickyActivitySheetTempUntil = Date.now() + 8000;
  try {
    localStorage.setItem('temp_activity', tab);
  } catch {
    /* ignore */
  }
  return tab;
}

/**
 * Legge temp_activity con priorità sticky → localStorage.
 * @returns {string | null}
 */
export function peekActivitySheetTempTab() {
  const now = Date.now();
  if (stickyActivitySheetTempTab && now < stickyActivitySheetTempUntil) {
    return stickyActivitySheetTempTab;
  }
  try {
    const raw = localStorage.getItem('temp_activity');
    if (!raw) return null;
    const tab = resolveActivitySheetTab(raw);
    stickyActivitySheetTempTab = tab;
    stickyActivitySheetTempUntil = now + 8000;
    return tab;
  } catch {
    return null;
  }
}

/**
 * Pulisce LS; di default mantiene lo sticky per remount React.
 * @param {{ keepSticky?: boolean }} [opts]
 */
export function clearActivitySheetTempTab(opts = {}) {
  const keepSticky = opts.keepSticky !== false;
  try {
    localStorage.removeItem('temp_activity');
  } catch {
    /* ignore */
  }
  if (!keepSticky) {
    stickyActivitySheetTempTab = null;
    stickyActivitySheetTempUntil = 0;
  }
}

/**
 * Risolve un id attività da dati legacy; sconosciuto → null (il chiamante può fallback).
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function resolveWorkoutActivityTypeId(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim().toLowerCase();
  return ACTIVITY_BY_ID.has(s) ? s : null;
}

/**
 * Descrizione per voce diario (campo `desc` / coerenza con handleSaveWorkout).
 * @param {string} activityId
 * @param {string[]} [muscles]
 */
export function getWorkoutActivityLogDescription(activityId, muscles = []) {
  const def = getWorkoutActivityTypeDef(activityId);
  const m = (muscles || []).filter(Boolean);
  const ms = m.length > 0 ? ` (${m.join(' + ')})` : '';

  if (activityId === 'pesi') return `Sollevamento Pesi${ms}`;
  if (activityId === 'cardio') return 'Cardio';
  if (activityId === 'hiit') return 'HIIT / Circuito';
  if (activityId === 'camminata') return 'Camminata';
  if (activityId === 'corsa') return 'Corsa';
  if (activityId === 'riposo') return 'Riposo';
  if (activityId === 'studio') return 'Studio';
  if (activityId === 'lavoro_pc') return 'Lavoro PC';
  if (activityId === 'lavoro') return 'Attività Lavorativa';
  if (def?.label) return def.label + ms;
  return `Allenamento${ms}`;
}

/**
 * MET per calcolo kcal cognitive (fallback 1.4).
 * @param {string} activityId
 */
export function getCognitiveMetForActivity(activityId) {
  const def = getWorkoutActivityTypeDef(activityId);
  if (def?.nodeKind === 'cognitive' && typeof def.cognitiveMet === 'number') return def.cognitiveMet;
  return 1.4;
}
