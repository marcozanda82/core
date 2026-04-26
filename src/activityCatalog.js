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
  { id: 'Petto', label: 'Petto' },
  { id: 'Dorso', label: 'Dorso', aliases: ['Schiena', 'schiena'] },
  { id: 'Gambe', label: 'Gambe' },
  { id: 'Spalle', label: 'Spalle' },
  { id: 'Bicipiti', label: 'Bicipiti', aliases: ['Bicipite', 'bicipite', 'biceps'] },
  { id: 'Tricipiti', label: 'Tricipiti', aliases: ['Tricipite', 'tricipite', 'triceps'] },
  { id: 'ABS', label: 'ABS', aliases: ['Addominali', 'addominali', 'Core', 'core'] },
  { id: 'Braccia', label: 'Braccia' },
  { id: 'Total Body', label: 'Total Body', aliases: ['Full Body', 'full body', 'totalbody'] },
];

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
 * @param {string[]} muscles
 * @returns {string[]}
 */
export function normalizeMuscleGroupArray(muscles) {
  if (!Array.isArray(muscles)) return [];
  const out = [];
  const seen = new Set();
  for (const m of muscles) {
    const c = normalizeMuscleGroupLabel(m);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
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
  const hasBiceps = /bicipit|curl/.test(text);
  const hasTriceps = /tricipit|dip\b|pushdown|estensioni/.test(text);
  const hasArmsGeneric = /bracci/.test(text);
  if (hasBiceps) push('Bicipiti');
  if (hasTriceps) push('Tricipiti');
  if (hasArmsGeneric && !hasBiceps && !hasTriceps) push('Braccia');
  if (/spalle|deltoid|shoulder|lateral/.test(text)) push('Spalle');
  if (/addominal|abs\b|core/.test(text)) push('ABS');
  return found;
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
    label: 'Cardio / Corsa',
    category: 'cardio',
    nodeKind: 'workout',
    icon: '🏃',
    selectorButtonLabel: '🏃 CARDIO',
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
    id: 'lavoro',
    label: 'Attività lavorativa',
    category: 'work',
    nodeKind: 'work',
    icon: '💼',
    selectorButtonLabel: '💼 LAVORO',
    showInActivitySelector: true,
  },
  {
    id: 'studio',
    label: 'Studio',
    category: 'cognitive',
    nodeKind: 'cognitive',
    icon: '📚',
    selectorButtonLabel: '📚 STUDIO',
    showInActivitySelector: true,
    cognitiveMet: 1.3,
  },
  {
    id: 'lavoro_pc',
    label: 'Lavoro PC',
    category: 'cognitive',
    nodeKind: 'cognitive',
    icon: '💻',
    selectorButtonLabel: '💻 LAVORO PC',
    showInActivitySelector: true,
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

/** Id mostrati nel selettore vista Attività (ordine stabile). */
export const WORKOUT_ACTIVITY_SELECTOR_IDS = WORKOUT_ACTIVITY_TYPE_DEFS.filter(
  (d) => d.showInActivitySelector !== false
).map((d) => d.id);

/**
 * Risolve un id attività da dati legacy; sconosciuto → null (il chiamante può fallback).
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function resolveWorkoutActivityTypeId(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
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
  if (activityId === 'cardio') return 'Cardio / Corsa';
  if (activityId === 'hiit') return 'HIIT / Circuito';
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
