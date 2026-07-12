import {
  WORKOUT_CONFLICT_QUICK_REPLIES,
  WORKOUT_TIME_QUICK_REPLIES,
} from './workoutRegistrationSlots.js';

export const CONVERSATION_STATE = Object.freeze({
  IDLE: 'IDLE',
  AWAITING_FOOD_GRAMS: 'AWAITING_FOOD_GRAMS',
  AWAITING_TIME: 'AWAITING_TIME',
  AWAITING_EXACT_TIME: 'AWAITING_EXACT_TIME',
  AWAITING_WORKOUT_CONFLICT_RESOLUTION: 'AWAITING_WORKOUT_CONFLICT_RESOLUTION',
  AWAITING_WORKOUT_TIME: 'AWAITING_WORKOUT_TIME',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
});

const MEAL_TYPES = ['colazione', 'snack', 'pranzo', 'cena'];

export function parseGramsFromUserText(text) {
  const raw = String(text || '').trim().toLowerCase().replace(',', '.');
  if (!raw) return null;

  const gramMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:g|grammi|gr)\b/);
  if (gramMatch) {
    const n = Number(gramMatch[1]);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }

  if (/\bporzion/.test(raw)) {
    return 100;
  }

  const plain = Number(raw);
  if (Number.isFinite(plain) && plain > 0) return Math.round(plain);
  return null;
}

/** Estrae coppie nome→grammi da testo libero (es. "pollo 200g, riso 150g"). */
export function parseMultiItemGramsFromUserText(text, pendingItems = []) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const segments = raw.split(/[,;]+|\s+e\s+/i).map((s) => s.trim()).filter(Boolean);
  const updates = [];

  for (const segment of segments) {
    const nameMatch = segment.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)?\s*$/i);
    if (nameMatch) {
      updates.push({
        foodName: nameMatch[1].trim(),
        grams: Math.round(Number(nameMatch[2].replace(',', '.'))),
      });
      continue;
    }
    const gramsOnly = parseGramsFromUserText(segment);
    if (gramsOnly && pendingItems.length === 1) {
      updates.push({ foodName: pendingItems[0].foodName, grams: gramsOnly });
    }
  }

  return updates.length > 0 ? updates : null;
}

export function parseMealTypeFromUserText(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  if (/\bcolaz/.test(t)) return 'colazione';
  if (/\b(cena|serale|sera)\b/.test(t)) return 'cena';
  if (/\b(pranzo|mezzogiorno)\b/.test(t)) return 'pranzo';
  if (/\b(snack|spuntino|merenda)\b/.test(t)) return 'snack';
  if (MEAL_TYPES.includes(t)) return t;
  return null;
}

export function parseConfirmationFromUserText(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  if (
    /^(s[iì](?:\s*,?\s*(?:salva|confermo))?|ok|okay|confermo|va bene|certo|procedi|yes|yep|sure|conferma|inserisci|vai|salva)\b/.test(t)
    || /^s[iì]\s*,\s*salva\b/.test(t)
  ) {
    return 'yes';
  }
  if (/^(no(?:\s*,?\s*annulla)?|nope|annulla|stop|cancel|non confermo|rifiuto)\b/.test(t)) {
    return 'no';
  }
  if (/^modifica\b/.test(t)) {
    return 'modify';
  }
  return null;
}

export function inferDefaultMealType(currentState) {
  const fromState = String(currentState?.mealState?.mealType || '').trim().toLowerCase();
  return MEAL_TYPES.includes(fromState) ? fromState : null;
}

function normalizeFoodItem(item) {
  const foodName = String(item?.foodName || item?.name || '').trim();
  const gramsRaw = item?.grams ?? item?.qty ?? item?.weight;
  const gramsNum =
    gramsRaw === null || gramsRaw === undefined || gramsRaw === ''
      ? NaN
      : Number(gramsRaw);
  return {
    foodName,
    grams: Number.isFinite(gramsNum) && gramsNum > 0 ? Math.round(gramsNum) : null,
  };
}

/** Espande payload singolo o multi-item in struttura normalizzata. */
export function expandFoodPayloadItems(payload) {
  if (Array.isArray(payload?.items) && payload.items.length > 0) {
    return payload.items.map(normalizeFoodItem).filter((item) => item.foodName);
  }
  const foodName = String(payload?.foodName || '').trim();
  if (!foodName) return [];
  return [normalizeFoodItem(payload)];
}

/** Alimenti nel payload senza grammatura valida. */
export function getFoodItemsMissingGrams(payload = {}) {
  return expandFoodPayloadItems(payload).filter(
    (item) => item.foodName && (!Number.isFinite(item.grams) || item.grams <= 0),
  );
}

/** Prompt per richiedere grammature mancanti (un solo alimento vs più alimenti). */
export function buildMissingGramsPrompt(payload = {}) {
  const missing = getFoodItemsMissingGrams(payload);
  if (missing.length === 0) {
    return 'Cosa hai mangiato e in che quantità? (es. 230g di gnocchi, 100g di passato di pomodoro)';
  }
  if (missing.length === 1) {
    return `Quanti grammi di ${missing[0].foodName}?`;
  }
  const exampleGrams = [100, 150, 200];
  const examples = missing
    .slice(0, 3)
    .map((item, index) => `${item.foodName} ${exampleGrams[index] || 150}g`)
    .join(', ');
  return `Quanti grammi per ciascuno? (es. ${examples})`;
}

function applyGramsUpdatesToItems(items, updates) {
  const nextItems = items.map((item) => ({ ...item }));

  for (const update of updates) {
    const targetName = String(update.foodName || '').trim().toLowerCase();
    const idx = nextItems.findIndex(
      (item) => String(item.foodName || '').trim().toLowerCase() === targetName
        || String(item.foodName || '').trim().toLowerCase().includes(targetName)
        || targetName.includes(String(item.foodName || '').trim().toLowerCase()),
    );
    if (idx >= 0) {
      nextItems[idx].grams = update.grams;
    }
  }

  return nextItems;
}

/**
 * Applica la risposta utente allo slot grammature sul payload in sospeso.
 * @returns {{ ok: boolean, payload: object, applied: boolean }}
 */
export function applyGramsSlotResponse(pendingPayload = {}, userText = '') {
  const pending = { ...(pendingPayload || {}) };
  const pendingItems = expandFoodPayloadItems(pending);
  const missingGramsItems = getFoodItemsMissingGrams(pending);

  if (missingGramsItems.length === 0) {
    return { ok: true, payload: pending, applied: false };
  }

  const multiUpdates = parseMultiItemGramsFromUserText(userText, missingGramsItems);
  if (multiUpdates?.length) {
    return {
      ok: true,
      payload: { ...pending, items: applyGramsUpdatesToItems(pendingItems, multiUpdates) },
      applied: true,
    };
  }

  const grams = parseGramsFromUserText(userText);
  if (!grams) {
    return { ok: false, payload: pending, applied: false };
  }

  const missingKeys = new Set(
    missingGramsItems.map((item) => String(item.foodName || '').trim().toLowerCase()),
  );
  const nextItems = pendingItems.map((item) => {
    const key = String(item.foodName || '').trim().toLowerCase();
    if (!missingKeys.has(key)) return { ...item };
    return { ...item, grams };
  });

  return {
    ok: true,
    payload: { ...pending, items: nextItems },
    applied: true,
  };
}

/** Campi mancanti per completare ADD_FOOD (supporta multi-alimento). */
export function getFoodPayloadMissingFields(payload) {
  const missing = [];
  const items = expandFoodPayloadItems(payload);
  if (items.length === 0) missing.push('foodName');
  if (items.some((item) => !Number.isFinite(item.grams) || item.grams <= 0)) {
    missing.push('grams');
  }
  const mealType = String(payload?.mealType || '').trim().toLowerCase();
  if (!MEAL_TYPES.includes(mealType)) missing.push('mealType');
  return missing;
}

export function normalizeFoodPayload(payload, currentState = {}, options = {}) {
  const { inferMealTypeFromContext = true } = options;
  const items = expandFoodPayloadItems(payload);
  const explicitMeal =
    parseMealTypeFromUserText(payload?.mealType)
    || (MEAL_TYPES.includes(String(payload?.mealType || '').trim().toLowerCase())
      ? String(payload.mealType).trim().toLowerCase()
      : null);
  const mealType =
    explicitMeal
    || (inferMealTypeFromContext ? inferDefaultMealType(currentState) : null)
    || null;
  const exactTimeRaw = payload?.exactTime ?? payload?.timeString;
  const exactTime = exactTimeRaw != null ? String(exactTimeRaw).trim() : '';

  return {
    items,
    mealType: MEAL_TYPES.includes(mealType) ? mealType : null,
    ...(exactTime ? { exactTime, timeString: exactTime } : {}),
    ...(payload?.notes ? { notes: String(payload.notes) } : {}),
  };
}

export function slotPromptForState(state, pendingPayload = {}) {
  if (state === CONVERSATION_STATE.AWAITING_FOOD_GRAMS) {
    return buildMissingGramsPrompt(pendingPayload);
  }
  if (state === CONVERSATION_STATE.AWAITING_TIME) {
    return 'Per quale pasto? (colazione, pranzo, cena, snack)';
  }
  if (state === CONVERSATION_STATE.AWAITING_EXACT_TIME) {
    return "A che ora l'hai mangiato? (es. 14:45)";
  }
  return '';
}

const MEAL_TYPE_LABELS = Object.freeze({
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  snack: 'Snack',
});

/** Riepilogo esplicito stile McDrive per la bozza pasto. */
export function buildMealDraftUiMessage(payload = {}) {
  const items = expandFoodPayloadItems(payload);
  const mealType = String(payload?.mealType || '').trim().toLowerCase();
  const mealLabel = MEAL_TYPE_LABELS[mealType] || 'Pasto';
  const time = String(payload?.exactTime || payload?.timeString || '').trim() || '--:--';
  const lines = items.map((item) => {
    const grams = Math.round(Number(item.grams) || 0);
    return `- ${item.foodName} (${grams}g)`;
  });
  return `Riepilogo [${mealLabel}] delle [${time}]:\n${lines.join('\n')}\nConfermi?`;
}

export function buildFoodConfirmationSummary(payload) {
  const normalized = normalizeFoodPayload(payload, {}, { inferMealTypeFromContext: false });
  const lines = (normalized.items || []).map((item) => {
    const grams = Number(item.grams);
    return `${item.foodName} (${grams}g)`;
  });
  const mealLabel = normalized.mealType ? ` — ${normalized.mealType}` : '';
  const timeLabel = normalized.timeString ? ` alle ${normalized.timeString}` : '';
  return `Ho preparato: ${lines.join(', ')}${mealLabel}${timeLabel}. Confermi l'inserimento?`;
}

export function buildWorkoutConfirmationSummary(payload) {
  const name = String(payload?.workoutName || '').trim();
  const mins = Math.round(Number(payload?.durationMinutes) || 0);
  const timeLabel = payload?.timeString ? ` alle ${payload.timeString}` : '';
  return `Ho preparato: allenamento "${name}" (${mins} min)${timeLabel}. Confermi l'inserimento?`;
}

export function expandWorkoutPayloadExercises(payload = {}) {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.exercises) && payload.exercises.length > 0) {
    return payload.exercises
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        exerciseName: String(item.exerciseName || item.name || '').trim(),
        sets: Number.isFinite(Number(item.sets)) ? Math.round(Number(item.sets)) : null,
        reps: Number.isFinite(Number(item.reps)) ? Math.round(Number(item.reps)) : null,
        weightKg: Number.isFinite(Number(item.weightKg ?? item.weight))
          ? Math.round(Number(item.weightKg ?? item.weight) * 10) / 10
          : null,
        durationMinutes: Number.isFinite(Number(item.durationMinutes))
          ? Math.round(Number(item.durationMinutes))
          : null,
      }))
      .filter((item) => item.exerciseName);
  }
  const singleName = String(payload.workoutName || '').trim();
  return singleName ? [{ exerciseName: singleName }] : [];
}

export function normalizeWorkoutPayload(payload = {}) {
  const next = { ...(payload || {}) };
  const exercises = expandWorkoutPayloadExercises(next);
  if (exercises.length > 0) {
    next.exercises = exercises.map((item) => {
      const row = { exerciseName: item.exerciseName };
      if (item.sets != null && item.sets > 0) row.sets = item.sets;
      if (item.reps != null && item.reps > 0) row.reps = item.reps;
      if (item.weightKg != null && item.weightKg > 0) row.weightKg = item.weightKg;
      if (item.durationMinutes != null && item.durationMinutes > 0) {
        row.durationMinutes = item.durationMinutes;
      }
      return row;
    });
  }

  if (!String(next.workoutName || '').trim()) {
    next.workoutName = exercises.map((item) => item.exerciseName).join(', ') || 'Allenamento';
  }

  const mins = Number(next.durationMinutes);
  if (!Number.isFinite(mins) || mins <= 0) {
    next.durationMinutes = 45;
  } else {
    next.durationMinutes = Math.round(mins);
  }

  return next;
}

function formatWorkoutExerciseLine(exercise = {}) {
  const name = String(exercise.exerciseName || exercise.name || '').trim() || 'Esercizio';
  const parts = [];
  const sets = Number(exercise.sets);
  const reps = Number(exercise.reps);
  const weightKg = Number(exercise.weightKg ?? exercise.weight);
  if (Number.isFinite(sets) && sets > 0 && Number.isFinite(reps) && reps > 0) {
    parts.push(`${sets} serie x ${reps} reps`);
  } else if (Number.isFinite(sets) && sets > 0) {
    parts.push(`${sets} serie`);
  } else if (Number.isFinite(reps) && reps > 0) {
    parts.push(`${reps} reps`);
  }
  if (Number.isFinite(weightKg) && weightKg > 0) {
    parts.push(`${weightKg}kg`);
  }
  const suffix = parts.length ? ` (${parts.join(', ')})` : '';
  return `- ${name}${suffix}`;
}

/** Riepilogo esplicito stile McDrive per la bozza allenamento. */
export function buildWorkoutDraftUiMessage(payload = {}) {
  const mins = Math.round(Number(payload?.durationMinutes) || 0);
  const durationLabel = mins > 0 ? `${mins} min` : '-- min';
  const time = String(payload?.exactTime || payload?.timeString || '').trim() || '--:--';
  const kcal = Number(payload?.estimatedKcal ?? payload?.kcal);
  const kcalLabel = Number.isFinite(kcal) && kcal > 0 ? `, ~${Math.round(kcal)} kcal` : '';
  const exercises = expandWorkoutPayloadExercises(payload);
  const lines = exercises.length > 0
    ? exercises.map((item) => formatWorkoutExerciseLine(item))
    : [`- ${String(payload?.workoutName || 'Allenamento').trim()}`];
  return `Riepilogo Allenamento delle [${time}] (${durationLabel}${kcalLabel}):\n${lines.join('\n')}\nConfermi?`;
}

export function buildSleepConfirmationSummary(payload) {
  const hours = Math.round(Number(payload?.durationHours) * 100) / 100;
  const extras = [];
  if (Number.isFinite(Number(payload?.deepSleepPhase))) {
    extras.push(`profondo ${Math.round(Number(payload.deepSleepPhase) * 100) / 100}h`);
  }
  if (Number.isFinite(Number(payload?.qualityScore))) {
    extras.push(`punteggio ${Math.round(Number(payload.qualityScore))}`);
  }
  const suffix = extras.length ? ` (${extras.join(', ')})` : '';
  return `Ho preparato: sonno ${hours} ore${suffix}. Confermi l'inserimento?`;
}

export const GRAMS_SLOT_QUICK_REPLIES = Object.freeze([
  '50g',
  '100g',
  '150g',
  '200g',
  '1 porzione',
]);

export const MEAL_SLOT_QUICK_REPLIES = Object.freeze([
  'Colazione',
  'Pranzo',
  'Cena',
  'Snack',
]);

export const MEAL_DRAFT_CONFIRMATION_QUICK_REPLIES = Object.freeze([
  'Sì, salva',
  'No, annulla',
  'Modifica',
]);

export const WORKOUT_DRAFT_CONFIRMATION_QUICK_REPLIES = MEAL_DRAFT_CONFIRMATION_QUICK_REPLIES;

export {
  WORKOUT_CONFLICT_QUICK_REPLIES,
  WORKOUT_TIME_QUICK_REPLIES,
} from './workoutRegistrationSlots.js';

/** @deprecated Usa MEAL_DRAFT_CONFIRMATION_QUICK_REPLIES */
export const CONFIRMATION_QUICK_REPLIES = MEAL_DRAFT_CONFIRMATION_QUICK_REPLIES;

export const EXACT_TIME_SLOT_QUICK_REPLIES = Object.freeze([
  '12:30',
  '13:00',
  '14:00',
  '20:00',
]);

/** Quick replies da mostrare sopra l'input in base allo stato conversazionale. */
export function quickRepliesForConversationState(state) {
  if (state === CONVERSATION_STATE.AWAITING_FOOD_GRAMS) {
    return [...GRAMS_SLOT_QUICK_REPLIES];
  }
  if (state === CONVERSATION_STATE.AWAITING_TIME) {
    return [...MEAL_SLOT_QUICK_REPLIES];
  }
  if (state === CONVERSATION_STATE.AWAITING_EXACT_TIME) {
    return [...EXACT_TIME_SLOT_QUICK_REPLIES];
  }
  if (state === CONVERSATION_STATE.AWAITING_WORKOUT_CONFLICT_RESOLUTION) {
    return [...WORKOUT_CONFLICT_QUICK_REPLIES];
  }
  if (state === CONVERSATION_STATE.AWAITING_WORKOUT_TIME) {
    return [...WORKOUT_TIME_QUICK_REPLIES];
  }
  if (state === CONVERSATION_STATE.AWAITING_CONFIRMATION) {
    return [...MEAL_DRAFT_CONFIRMATION_QUICK_REPLIES];
  }
  return [];
}
