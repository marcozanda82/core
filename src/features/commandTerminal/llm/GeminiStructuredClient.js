import {
  addFoodPayloadSchema,
  logSleepPayloadSchema,
  addWorkoutPayloadSchema,
  terminalCommandEnvelopeSchema,
  consultantResponseSchema,
} from '../contracts/commandSchemas.js';
import { askAI } from '../../../services/aiService.js';
import { generateConsultantSystemInstruction } from '../../../conversation/ConsultantEngine.js';
import {
  buildCombinedConversationText,
  buildGeminiContentsFromChatHistory,
} from '../conversation/mealRegistrationSlots.js';
import {
  formatCurrentSystemTimeContext,
  MEAL_SMART_DEFAULTS_PROMPT_RULES,
} from '../conversation/mealSmartDefaults.js';
import {
  normalizeExactTime,
  parseConsumedMealFromNaturalText,
  parseExactTimeFromUserText,
} from '../conversation/mealLogIntent.js';

const DEFAULT_MODEL = 'gemini-2.5-flash-001';
const CONSULTANT_MODEL = 'gemini-2.5-flash-001';

function asTrimmedString(value) {
  return String(value ?? '').trim();
}

function unwrapJsonText(rawText) {
  const text = asTrimmedString(rawText);
  if (!text) return '';
  if (text.startsWith('```')) {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return text;
}

/** True se il testo utente menziona una quantità numerica esplicita. */
function userTextMentionsExplicitQuantity(userText) {
  const t = asTrimmedString(userText).toLowerCase();
  if (!t) return false;
  return (
    /(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)\b/.test(t)
    || /\b(\d+(?:[.,]\d+)?)\s*(?:porzioni?|fette?|pezzi|uova?)\b/.test(t)
    || /\b(?:mangiato|mangiata|preso|presa|bevuto|bevuta)\s+(?:circa\s+)?(\d+)/.test(t)
    || /\b(\d+)\s*(?:grammi|g)\b/.test(t)
  );
}

const MEAL_TYPES = ['colazione', 'snack', 'pranzo', 'cena'];

function userTextMentionsExplicitMealType(userText) {
  const t = asTrimmedString(userText).toLowerCase();
  if (!t) return false;
  return (
    /\bcolaz/.test(t)
    || /\b(pranzo|mezzogiorno)\b/.test(t)
    || /\b(cena|sera|serale)\b/.test(t)
    || /\b(snack|spuntino|merenda)\b/.test(t)
    || MEAL_TYPES.some((slot) => new RegExp(`\\b${slot}\\b`).test(t))
  );
}

function userTextMentionsExplicitTime(userText) {
  return Boolean(parseExactTimeFromUserText(userText));
}

function normalizeFoodToken(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/^di\s+/, '')
    .replace(/[^\w\sàèéìòù]/gi, ' ');
}

/** Nomi alimento attestati nel testo utente (parser + match lessicale). */
function foodNamesAttestedInUserText(combinedText) {
  const attested = new Set();
  const raw = asTrimmedString(combinedText);
  if (!raw) return attested;

  const parsed = parseConsumedMealFromNaturalText(raw);
  (parsed?.items || []).forEach((item) => {
    const name = normalizeFoodToken(item.foodName);
    if (name) attested.add(name);
  });

  return attested;
}

function isFoodNameAttestedInUserText(foodName, combinedText, attestedNames) {
  const name = normalizeFoodToken(foodName);
  const text = normalizeFoodToken(combinedText);
  if (!name || !text) return false;
  if (!attestedNames || typeof attestedNames[Symbol.iterator] !== 'function') {
    return text.includes(name);
  }

  for (const attested of attestedNames) {
    if (name === attested || name.includes(attested) || attested.includes(name)) return true;
    const nameTokens = name.split(/\s+/).filter((t) => t.length >= 4);
    const attestedTokens = attested.split(/\s+/).filter((t) => t.length >= 4);
    if (nameTokens.some((t) => attested.includes(t) || attestedTokens.some((a) => name.includes(a)))) {
      return true;
    }
  }

  const significant = name.split(/\s+/).filter((t) => t.length >= 4);
  if (significant.length > 0) {
    return significant.some((t) => text.includes(t));
  }
  return text.includes(name);
}

/** Estrazione a prova di errore: array piatto di nomi alimento dalle abitudini. */
function collectHabitFoodNamesFromContext(contextBundle) {
  const names = [];
  try {
    const habits = contextBundle?.contextSlices?.USER_HABITS_FOR_CURRENT_MEAL;
    if (!habits || typeof habits !== 'object') return names;

    const proposals = Array.isArray(habits?.proposals) ? habits.proposals : [];
    const flatItems = proposals.flatMap((proposal) => {
      if (!proposal || typeof proposal !== 'object') return [];
      return Array.isArray(proposal?.items) ? proposal.items : [];
    });

    flatItems.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const raw = item.foodName ?? item.name ?? item.desc ?? item.label;
      const normalized = normalizeFoodToken(raw);
      if (normalized && !names.includes(normalized)) {
        names.push(normalized);
      }
    });
  } catch (error) {
    console.warn('[GeminiStructuredClient] collectHabitFoodNamesFromContext failed', error);
  }
  return names;
}

function normalizeHabitNamesCollection(habitNames) {
  if (habitNames instanceof Set) {
    return [...habitNames].map((name) => normalizeFoodToken(name)).filter(Boolean);
  }
  if (Array.isArray(habitNames)) {
    return habitNames.map((name) => normalizeFoodToken(name)).filter(Boolean);
  }
  return [];
}

/** Ripristina un nome generico citato dall'utente quando il match abitudine fallisce. */
function resolveGenericFoodFallback(foodName, combinedText) {
  const specific = asTrimmedString(foodName);
  const text = normalizeFoodToken(combinedText);
  if (!specific) return '';
  if (!text) return specific;

  const userWords = text.split(/\s+/).filter((word) => word.length >= 3);
  const specificNorm = normalizeFoodToken(specific);
  const matchedWord = userWords.find((word) => specificNorm.includes(word));
  if (matchedWord) return matchedWord;

  try {
    const parsed = parseConsumedMealFromNaturalText(combinedText);
    const parsedName = asTrimmedString(parsed?.items?.[0]?.foodName);
    if (parsedName) return parsedName;
  } catch {
    // ignore parser failures
  }

  const firstToken = specificNorm.split(/\s+/).find((token) => token.length >= 3);
  return firstToken || specific;
}

/**
 * Deroga guardrails: nome specifico da abitudine se l'utente ha usato un termine generico
 * contenuto nel nome abituale (es. utente "pasta" → "pasta integrale la molisana").
 */
function isHabitExpandedFoodName(foodName, combinedText, habitNames) {
  try {
    const name = normalizeFoodToken(foodName);
    const text = normalizeFoodToken(combinedText);
    const habits = normalizeHabitNamesCollection(habitNames);
    if (!name || !text || habits.length === 0) return false;

    const matchedHabit = habits.find(
      (habit) => habit === name || name.includes(habit) || habit.includes(name),
    );
    if (!matchedHabit) return false;

    const userWords = text.split(/\s+/).filter((word) => word.length >= 3);
    return userWords.some((word) => matchedHabit.includes(word));
  } catch {
    return false;
  }
}

/** Rimuove voci items[] non citate dall'utente, con deroga per risoluzione abitudini. */
function filterItemsToUserMentions(items, combinedText, habitNames = []) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => item && typeof item === 'object')
    : [];
  if (safeItems.length === 0) return [];

  const text = asTrimmedString(combinedText);
  if (!text) return safeItems;

  const safeHabitNames = normalizeHabitNamesCollection(habitNames);
  let attested;
  try {
    attested = foodNamesAttestedInUserText(text);
  } catch {
    attested = new Set();
  }

  const filtered = safeItems.filter((item) => {
    const foodName = asTrimmedString(item?.foodName || item?.name);
    if (!foodName) return false;
    try {
      if (isFoodNameAttestedInUserText(foodName, text, attested)) return true;
      if (safeHabitNames.length > 0 && isHabitExpandedFoodName(foodName, text, safeHabitNames)) {
        return true;
      }
    } catch {
      return false;
    }
    return false;
  });

  if (filtered.length > 0) return filtered;

  const fallbackItems = safeItems
    .map((item) => {
      const originalName = asTrimmedString(item?.foodName || item?.name);
      if (!originalName) return null;
      const fallbackName = resolveGenericFoodFallback(originalName, text) || originalName;
      return { ...item, foodName: fallbackName };
    })
    .filter(Boolean);

  return fallbackItems.length > 0 ? fallbackItems : safeItems;
}

const LEADING_CONJUNCTION_PATTERN = /^(?:(?:e|ed|con|più|piu|anche|oppure)\s+|,\s*)+/i;

function stripLeadingConjunctions(foodName) {
  let name = asTrimmedString(foodName);
  if (!name) return '';
  let prev = '';
  while (name !== prev) {
    prev = name;
    name = name.replace(LEADING_CONJUNCTION_PATTERN, '').trim();
  }
  return name;
}

function normalizeFoodNameForDedup(name) {
  return normalizeFoodToken(name).replace(/\s+/g, ' ').trim();
}

function foodNamesOverlap(nameA, nameB) {
  const a = normalizeFoodNameForDedup(nameA);
  const b = normalizeFoodNameForDedup(nameB);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function pickMergedFoodName(nameA, nameB) {
  const cleanA = stripLeadingConjunctions(nameA);
  const cleanB = stripLeadingConjunctions(nameB);
  const normA = normalizeFoodNameForDedup(cleanA);
  const normB = normalizeFoodNameForDedup(cleanB);
  if (!normA) return cleanB;
  if (!normB) return cleanA;
  if (normA === normB) return cleanA.length >= cleanB.length ? cleanA : cleanB;
  if (normA.includes(normB)) return cleanA;
  if (normB.includes(normA)) return cleanB;
  return cleanA.length >= cleanB.length ? cleanA : cleanB;
}

function pickMergedGrams(itemA, itemB) {
  const gramsA = Number(itemA?.grams);
  const gramsB = Number(itemB?.grams);
  const hasA = Number.isFinite(gramsA) && gramsA > 0;
  const hasB = Number.isFinite(gramsB) && gramsB > 0;
  if (hasA && !hasB) return Math.round(gramsA);
  if (hasB && !hasA) return Math.round(gramsB);
  if (hasA && hasB) return Math.round(Math.max(gramsA, gramsB));
  return null;
}

function mergeOverlappingFoodItems(itemA, itemB) {
  const foodName = pickMergedFoodName(itemA?.foodName, itemB?.foodName);
  const merged = { ...itemA, ...itemB, foodName };
  const grams = pickMergedGrams(itemA, itemB);
  if (grams != null) merged.grams = grams;
  else delete merged.grams;
  return merged;
}

/** Pulisce congiunzioni iniziali e fonde duplicati / voci fantasma da sdoppiamento LLM. */
function deduplicateAndCleanFoodItems(items) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => item && typeof item === 'object')
    : [];
  if (safeItems.length === 0) return [];

  const cleaned = safeItems
    .map((item) => {
      const foodName = stripLeadingConjunctions(item?.foodName || item?.name);
      if (!foodName) return null;
      return { ...item, foodName };
    })
    .filter(Boolean);

  const merged = [];
  cleaned.forEach((item) => {
    const duplicateIndex = merged.findIndex((existing) =>
      foodNamesOverlap(existing.foodName, item.foodName),
    );
    if (duplicateIndex >= 0) {
      merged[duplicateIndex] = mergeOverlappingFoodItems(merged[duplicateIndex], item);
      return;
    }
    merged.push(item);
  });

  return merged;
}

function normalizeExerciseToken(value) {
  return normalizeFoodToken(value);
}

function userTextMentionsExplicitWorkoutDuration(userText) {
  const t = asTrimmedString(userText).toLowerCase();
  if (!t) return false;
  return (
    /\d+\s*(?:min|minut|minuti)\b/.test(t)
    || /\d+\s*(?:ore|h)\b/.test(t)
    || /\b(?:durata|allenamento di|per)\s+\d+/.test(t)
  );
}

function userTextMentionsExplicitSetsReps(userText) {
  const t = asTrimmedString(userText).toLowerCase();
  if (!t) return false;
  return (
    /\d+\s*x\s*\d+/.test(t)
    || /\b\d+\s*serie\b/.test(t)
    || /\bserie\s+(?:da|di)\s+\d+/.test(t)
    || /\bripet/.test(t)
  );
}

function userTextMentionsExplicitWeight(userText) {
  const t = asTrimmedString(userText).toLowerCase();
  if (!t) return false;
  return /\d+(?:[.,]\d+)?\s*(?:kg|chil)/.test(t);
}

function collectWorkoutHabitsFromContext(contextBundle) {
  const habits = [];
  try {
    const raw = contextBundle?.contextSlices?.USER_WORKOUT_HABITS;
    if (!Array.isArray(raw)) return habits;
    raw.forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const exerciseName = asTrimmedString(entry.exerciseName || entry.desc || entry.name);
      if (!exerciseName) return;
      habits.push({
        exerciseName,
        sets: Number.isFinite(Number(entry.sets)) ? Number(entry.sets) : null,
        reps: Number.isFinite(Number(entry.reps)) ? Number(entry.reps) : null,
        weightKg: Number.isFinite(Number(entry.weightKg ?? entry.weight))
          ? Number(entry.weightKg ?? entry.weight)
          : null,
        durationMinutes: Number.isFinite(Number(entry.durationMinutes))
          ? Number(entry.durationMinutes)
          : null,
      });
    });
  } catch (error) {
    console.warn('[GeminiStructuredClient] collectWorkoutHabitsFromContext failed', error);
  }
  return habits;
}

function normalizeHabitExercisesCollection(habitExercises) {
  if (!Array.isArray(habitExercises)) return [];
  return habitExercises
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const exerciseName = normalizeExerciseToken(entry.exerciseName || entry.desc || entry.name);
      if (!exerciseName) return null;
      return { ...entry, exerciseName };
    })
    .filter(Boolean);
}

function isExerciseNameAttestedInUserText(exerciseName, combinedText) {
  const name = normalizeExerciseToken(exerciseName);
  const text = normalizeExerciseToken(combinedText);
  if (!name || !text) return false;
  if (text.includes(name)) return true;

  const significant = name.split(/\s+/).filter((token) => token.length >= 3);
  if (significant.length > 0) {
    return significant.some((token) => text.includes(token));
  }
  return text.includes(name);
}

function resolveGenericExerciseFallback(exerciseName, combinedText) {
  const specific = asTrimmedString(exerciseName);
  const text = normalizeExerciseToken(combinedText);
  if (!specific) return '';
  if (!text) return specific;

  const userWords = text.split(/\s+/).filter((word) => word.length >= 3);
  const specificNorm = normalizeExerciseToken(specific);
  const matchedWord = userWords.find((word) => specificNorm.includes(word));
  if (matchedWord) return matchedWord;

  const firstToken = specificNorm.split(/\s+/).find((token) => token.length >= 3);
  return firstToken || specific;
}

function isHabitExpandedExerciseName(exerciseName, combinedText, habitExercises = []) {
  try {
    const name = normalizeExerciseToken(exerciseName);
    const text = normalizeExerciseToken(combinedText);
    const habits = normalizeHabitExercisesCollection(habitExercises);
    if (!name || !text || habits.length === 0) return false;

    const matchedHabit = habits.find((habit) => {
      const habitName = normalizeExerciseToken(habit.exerciseName);
      return habitName === name || name.includes(habitName) || habitName.includes(name);
    });
    if (!matchedHabit) return false;

    const userWords = text.split(/\s+/).filter((word) => word.length >= 3);
    const habitName = normalizeExerciseToken(matchedHabit.exerciseName);
    return userWords.some((word) => habitName.includes(word));
  } catch {
    return false;
  }
}

function applyHabitDefaultsToExercise(item, combinedText, habitExercises = []) {
  const habits = normalizeHabitExercisesCollection(habitExercises);
  if (habits.length === 0) return item;

  const name = normalizeExerciseToken(item?.exerciseName);
  const matched = habits.find((habit) => {
    const habitName = normalizeExerciseToken(habit.exerciseName);
    return habitName === name || name.includes(habitName) || habitName.includes(name);
  });
  if (!matched) return item;

  const next = { ...item };
  if (!userTextMentionsExplicitSetsReps(combinedText)) {
    if (next.sets == null && matched.sets != null) next.sets = matched.sets;
    if (next.reps == null && matched.reps != null) next.reps = matched.reps;
  }
  if (!userTextMentionsExplicitWeight(combinedText) && next.weightKg == null && matched.weightKg != null) {
    next.weightKg = matched.weightKg;
  }
  if (
    !userTextMentionsExplicitWorkoutDuration(combinedText)
    && next.durationMinutes == null
    && matched.durationMinutes != null
  ) {
    next.durationMinutes = matched.durationMinutes;
  }
  return next;
}

/** Rimuove esercizi non citati dall'utente, con deroga per SMART RESOLUTION dallo storico. */
function filterExercisesToUserMentions(exercises, combinedText, habitExercises = []) {
  const safeExercises = Array.isArray(exercises)
    ? exercises.filter((item) => item && typeof item === 'object')
    : [];
  if (safeExercises.length === 0) return [];

  const text = asTrimmedString(combinedText);
  if (!text) return safeExercises;

  const safeHabits = normalizeHabitExercisesCollection(habitExercises);
  const filtered = safeExercises.filter((item) => {
    const exerciseName = asTrimmedString(item?.exerciseName || item?.name);
    if (!exerciseName) return false;
    try {
      if (isExerciseNameAttestedInUserText(exerciseName, text)) return true;
      if (safeHabits.length > 0 && isHabitExpandedExerciseName(exerciseName, text, safeHabits)) {
        return true;
      }
    } catch {
      return false;
    }
    return false;
  });

  if (filtered.length > 0) return filtered;

  const fallbackExercises = safeExercises
    .map((item) => {
      const originalName = asTrimmedString(item?.exerciseName || item?.name);
      if (!originalName) return null;
      const fallbackName = resolveGenericExerciseFallback(originalName, text) || originalName;
      return { ...item, exerciseName: fallbackName };
    })
    .filter(Boolean);

  return fallbackExercises.length > 0 ? fallbackExercises : safeExercises;
}

function mergeOverlappingExerciseItems(itemA, itemB) {
  const exerciseName = pickMergedFoodName(itemA?.exerciseName, itemB?.exerciseName);
  const merged = { ...itemA, ...itemB, exerciseName };
  const preferred =
    String(itemA?.exerciseName || '').length >= String(itemB?.exerciseName || '').length
      ? itemA
      : itemB;
  const fallback = preferred === itemA ? itemB : itemA;

  ['sets', 'reps', 'weightKg', 'durationMinutes'].forEach((field) => {
    const preferredValue = Number(preferred?.[field]);
    const fallbackValue = Number(fallback?.[field]);
    if (Number.isFinite(preferredValue) && preferredValue > 0) {
      merged[field] = field === 'weightKg'
        ? Math.round(preferredValue * 10) / 10
        : Math.round(preferredValue);
      return;
    }
    if (Number.isFinite(fallbackValue) && fallbackValue > 0) {
      merged[field] = field === 'weightKg'
        ? Math.round(fallbackValue * 10) / 10
        : Math.round(fallbackValue);
      return;
    }
    delete merged[field];
  });

  delete merged.name;
  delete merged.weight;
  return merged;
}

function deduplicateExerciseItems(exercises) {
  const safeExercises = Array.isArray(exercises)
    ? exercises.filter((item) => item && typeof item === 'object')
    : [];
  if (safeExercises.length === 0) return [];

  const cleaned = safeExercises
    .map((item) => {
      const exerciseName = stripLeadingConjunctions(item?.exerciseName || item?.name);
      if (!exerciseName) return null;
      return { ...item, exerciseName };
    })
    .filter(Boolean);

  const merged = [];
  cleaned.forEach((item) => {
    const duplicateIndex = merged.findIndex((existing) =>
      foodNamesOverlap(existing.exerciseName, item.exerciseName),
    );
    if (duplicateIndex >= 0) {
      merged[duplicateIndex] = mergeOverlappingExerciseItems(merged[duplicateIndex], item);
      return;
    }
    merged.push(item);
  });

  return merged;
}

/** Normalizza payload ADD_WORKOUT: anti-allucinazione esercizi + SMART RESOLUTION storico. */
function sanitizeAddWorkoutCommand(command, userText, conversationText = '', contextBundle = null) {
  if (!command || typeof command !== 'object') return command;
  if (asTrimmedString(command.commandType).toUpperCase() !== 'ADD_WORKOUT') return command;

  const combinedText = asTrimmedString(conversationText) || asTrimmedString(userText);
  let habitExercises = [];
  try {
    habitExercises = collectWorkoutHabitsFromContext(contextBundle);
  } catch (error) {
    console.warn('[GeminiStructuredClient] workout habits extraction failed', error);
  }

  const payload = { ...(command.payload || {}) };

  const sanitizeExercise = (item) => {
    const next = { ...(item || {}) };
    const exerciseName = stripLeadingConjunctions(next.exerciseName || next.name);
    if (!exerciseName) return null;
    next.exerciseName = exerciseName;
    delete next.name;

    const sets = Number(next.sets);
    const reps = Number(next.reps);
    const weightKg = Number(next.weightKg ?? next.weight);
    const durationMinutes = Number(next.durationMinutes);

    if (!userTextMentionsExplicitSetsReps(combinedText)) {
      delete next.sets;
      delete next.reps;
    } else {
      if (Number.isFinite(sets) && sets > 0) next.sets = Math.round(sets);
      else delete next.sets;
      if (Number.isFinite(reps) && reps > 0) next.reps = Math.round(reps);
      else delete next.reps;
    }

    if (!userTextMentionsExplicitWeight(combinedText)) {
      delete next.weightKg;
      delete next.weight;
    } else if (Number.isFinite(weightKg) && weightKg > 0) {
      next.weightKg = Math.round(weightKg * 10) / 10;
      delete next.weight;
    } else {
      delete next.weightKg;
      delete next.weight;
    }

    if (!userTextMentionsExplicitWorkoutDuration(combinedText)) {
      delete next.durationMinutes;
    } else if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
      next.durationMinutes = Math.round(durationMinutes);
    } else {
      delete next.durationMinutes;
    }

    return applyHabitDefaultsToExercise(next, combinedText, habitExercises);
  };

  const applyExerciseFilter = (rawExercises) => {
    const sanitized = rawExercises.map(sanitizeExercise).filter(Boolean);
    if (sanitized.length === 0) return sanitized;
    let filtered = sanitized;
    try {
      filtered = filterExercisesToUserMentions(sanitized, combinedText, habitExercises);
    } catch (error) {
      console.warn('[GeminiStructuredClient] filterExercisesToUserMentions failed', error);
    }
    try {
      return deduplicateExerciseItems(filtered);
    } catch (error) {
      console.warn('[GeminiStructuredClient] deduplicateExerciseItems failed', error);
      return filtered;
    }
  };

  if (Array.isArray(payload.exercises) && payload.exercises.length > 0) {
    payload.exercises = applyExerciseFilter(payload.exercises);
    if (payload.exercises.length > 0) {
      const joined = payload.exercises.map((item) => item.exerciseName).join(', ');
      const workoutName = asTrimmedString(payload.workoutName);
      if (
        !workoutName
        || !isExerciseNameAttestedInUserText(workoutName, combinedText)
      ) {
        payload.workoutName = joined;
      }
    }
  } else {
    const workoutName = stripLeadingConjunctions(payload.workoutName);
    if (workoutName) {
      const attested =
        isExerciseNameAttestedInUserText(workoutName, combinedText)
        || isHabitExpandedExerciseName(workoutName, combinedText, habitExercises);
      if (attested) {
        payload.workoutName = workoutName;
      } else {
        const fallback = resolveGenericExerciseFallback(workoutName, combinedText);
        if (fallback && isExerciseNameAttestedInUserText(fallback, combinedText)) {
          payload.workoutName = fallback;
        }
      }
    }
  }

  const durationMinutes = Number(payload.durationMinutes);
  if (!userTextMentionsExplicitWorkoutDuration(combinedText)) {
    delete payload.durationMinutes;
  } else if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
    payload.durationMinutes = Math.round(durationMinutes);
  } else {
    delete payload.durationMinutes;
  }

  const estimatedKcal = Number(payload.estimatedKcal);
  if (!/\d+\s*(?:kcal|calor)/i.test(combinedText)) {
    delete payload.estimatedKcal;
  } else if (Number.isFinite(estimatedKcal) && estimatedKcal > 0) {
    payload.estimatedKcal = Math.round(estimatedKcal);
  } else {
    delete payload.estimatedKcal;
  }

  const timeFromPayload = normalizeExactTime(payload.exactTime || payload.timeString);
  const timeFromUser = parseExactTimeFromUserText(combinedText);
  if (userTextMentionsExplicitTime(combinedText)) {
    const resolvedTime = timeFromPayload || timeFromUser;
    if (resolvedTime) {
      payload.timeString = resolvedTime;
      payload.exactTime = resolvedTime;
    } else {
      delete payload.timeString;
      delete payload.exactTime;
    }
  } else {
    delete payload.timeString;
    delete payload.exactTime;
  }

  return { ...command, payload };
}

/** Normalizza payload ADD_FOOD dal modello: niente grammi/pasto/orario inventati; supporta items[]. */
function sanitizeAddFoodCommand(command, userText, conversationText = '', contextBundle = null) {
  if (!command || typeof command !== 'object') return command;
  if (asTrimmedString(command.commandType).toUpperCase() !== 'ADD_FOOD') return command;

  const combinedText = asTrimmedString(conversationText) || asTrimmedString(userText);
  let habitNames = [];
  try {
    habitNames = collectHabitFoodNamesFromContext(contextBundle);
  } catch (error) {
    console.warn('[GeminiStructuredClient] habit names extraction failed', error);
  }

  const payload = { ...(command.payload || {}) };
  const hasItems = Array.isArray(payload.items) && payload.items.length > 0;

  const sanitizeItem = (item) => {
    const next = { ...(item || {}) };
    const foodName = asTrimmedString(next.foodName || next.name);
    if (!foodName) return null;
    next.foodName = foodName;

    const gramsNum = Number(next.grams ?? next.qty ?? next.weight);
    if (!Number.isFinite(gramsNum) || gramsNum <= 0) {
      delete next.grams;
    } else if (!userTextMentionsExplicitQuantity(combinedText)) {
      delete next.grams;
    } else {
      next.grams = Math.round(gramsNum);
    }
    delete next.name;
    delete next.qty;
    delete next.weight;
    return next;
  };

  const applyItemFilter = (rawItems) => {
    const sanitized = rawItems.map(sanitizeItem).filter(Boolean);
    if (sanitized.length === 0) return sanitized;
    let filtered = sanitized;
    try {
      filtered = filterItemsToUserMentions(sanitized, combinedText, habitNames);
    } catch (error) {
      console.warn('[GeminiStructuredClient] filterItemsToUserMentions failed', error);
    }
    try {
      return deduplicateAndCleanFoodItems(filtered);
    } catch (error) {
      console.warn('[GeminiStructuredClient] deduplicateAndCleanFoodItems failed', error);
      return filtered;
    }
  };

  if (hasItems) {
    payload.items = applyItemFilter(payload.items);
  } else {
    const single = sanitizeItem({
      foodName: payload.foodName,
      grams: payload.grams,
    });
    if (single) {
      payload.items = applyItemFilter([single]);
    } else {
      payload.items = [];
    }
    delete payload.foodName;
    delete payload.grams;
  }

  const mealRaw = asTrimmedString(payload.mealType).toLowerCase();
  if (!mealRaw || !MEAL_TYPES.includes(mealRaw) || !userTextMentionsExplicitMealType(combinedText)) {
    delete payload.mealType;
  } else {
    payload.mealType = mealRaw;
  }

  const timeFromPayload = normalizeExactTime(payload.exactTime || payload.timeString);
  const timeFromUser = parseExactTimeFromUserText(combinedText);
  if (userTextMentionsExplicitTime(combinedText)) {
    const resolvedTime = timeFromPayload || timeFromUser;
    if (resolvedTime) {
      payload.timeString = resolvedTime;
      payload.exactTime = resolvedTime;
    } else {
      delete payload.timeString;
      delete payload.exactTime;
    }
  } else {
    delete payload.timeString;
    delete payload.exactTime;
  }

  return { ...command, payload };
}

function getEnvelopeSchemaForIntent(commandHint) {
  if (commandHint === 'ADD_FOOD') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: { type: 'string', enum: ['ADD_FOOD'] },
        payload: addFoodPayloadSchema,
      },
    };
  }
  if (commandHint === 'ADD_WORKOUT') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: { type: 'string', enum: ['ADD_WORKOUT'] },
        payload: addWorkoutPayloadSchema,
      },
    };
  }
  if (commandHint === 'LOG_SLEEP') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: { type: 'string', enum: ['LOG_SLEEP'] },
        payload: logSleepPayloadSchema,
      },
    };
  }
  return terminalCommandEnvelopeSchema;
}

function imageDataUrlToInlinePart(imageSrc) {
  const imgBase64 = asTrimmedString(imageSrc);
  if (!imgBase64) return null;

  const base64Data = asTrimmedString(
    imgBase64.includes(',') ? imgBase64.split(',')[1] : imgBase64,
  );
  if (!base64Data) return null;

  const mimeType =
    asTrimmedString(((imgBase64.split(';')[0] || '').split(':')[1] || '')) || 'image/jpeg';

  return {
    inlineData: {
      mimeType,
      data: base64Data,
    },
  };
}

export class GeminiStructuredClient {
  constructor({ model = DEFAULT_MODEL } = {}) {
    this.model = model || DEFAULT_MODEL;
  }

  buildSystemInstruction(commandHint, { hasImages = false } = {}) {
    const fixedHint = asTrimmedString(commandHint).toUpperCase();
    const includeSleepRules = fixedHint === 'LOG_SLEEP' || hasImages;
    const includeFoodRules = fixedHint === 'ADD_FOOD' || fixedHint === 'UNKNOWN';
    const includeWorkoutRules = fixedHint === 'ADD_WORKOUT' || fixedHint === 'UNKNOWN';
    const parts = [
      'Sei Kentu Command Terminal.',
      'Rispondi SOLO con JSON valido e conforme allo schema fornito.',
      'Non aggiungere markdown, spiegazioni o testo fuori dal JSON.',
    ];

    if (includeFoodRules) {
      parts.push(
        "VINCOLO ADD_FOOD — ESTRAZIONE ESCLUSIVA (CONTEGGIO VOCI): Estrai SOLO gli alimenti ESPLICITAMENTE citati dall utente (e nella cronologia conversazione). E VIETATO aggiungere contorni, condimenti, completamenti, ingredienti impliciti o piatti extra non menzionati. SE l utente cita 2 alimenti, payload.items[] DEVE contenere ESATTAMENTE 2 voci — ne piu ne meno. Questo vincolo riguarda il NUMERO e la PRESENZA delle voci, NON il livello di dettaglio del foodName di una voce gia citata.",
        "ECCEZIONE ALL ESTRAZIONE LETTERALE — SMART RESOLUTION (PRIORITA SU [USER_HABITS_FOR_CURRENT_MEAL]): Se l utente digita un termine generico (es. 'pasta', 'latte', 'yogurt') e in [USER_HABITS_FOR_CURRENT_MEAL] esiste una variante specifica che usa abitualmente (es. 'pasta integrale la molisana', 'latte parzialmente scremato', 'yogurt greco fage'), DEVI OBBLIGATORIAMENTE restituire in payload.items[].foodName il nome specifico completo dell abitudine corrispondente. Arricchire il nome di un SINGOLO alimento gia citato basandosi sullo storico NON viola Estrazione Esclusiva: non stai aggiungendo voci, stai risolvendo l entita. Se piu abitudini contengono il termine generico, scegli quella piu frequente o piu plausibile per il pasto corrente. Se [USER_HABITS] e vuoto o non contiene match, usa il termine grezzo dell utente.",
        "REGOLA ADD_FOOD (multi-alimento): Se l'utente elenca PIU alimenti, devi estrarre TUTTI in payload.items[] — uno oggetto per ciascun alimento. Non troncare al primo.",
        "PULIZIA CONGIUNZIONI E NO DUPLICATI: I foodName estratti NON devono mai iniziare con congiunzioni ('e ', 'ed ', 'con ', 'più ', ', '). Se l'utente scrive 'X e Y', estrai 'X' e 'Y', senza la 'e'. È severamente vietato sdoppiare lo stesso alimento in due voci diverse.",
        "REGOLA ADD_FOOD (orario): Se l'utente indica un orario esplicito (es. 'ore 14.45', 'alle 20:30'), estrailo in HH:mm in payload.timeString ed exactTime. Se NON indica orario, ometti exactTime — il sistema usera l'ora corrente.",
        "REGOLA ADD_FOOD (entity resolution): Per ogni alimento citato, compila foodName (grezzo o risolto via SMART RESOLUTION sopra) e grams. NON inventare foodDbKey ne macronutrienti: li risolve il codice locale dal DB.",
        "REGOLA ADD_FOOD (pasto gia consumato): Se l'utente descrive un pasto gia mangiato con grammature esplicite (es. 'per pranzo ho mangiato 230g di gnocchi, 100g di passato di pomodoro'), estrai OGNI alimento con il suo peso in items[].",
        "REGOLA ADD_FOOD: Se l'utente dichiara di aver mangiato qualcosa MA NON specifica la quantità in grammi/porzioni, NON DEVI in alcun modo inventare, dedurre o stimare il peso. Devi obbligatoriamente restituire il campo 'grams' vuoto (null/undefined/omesso). Sarà il sistema a richiedere il dato mancante all'utente.",
        "Includi grams SOLO se l'utente ha scritto un numero esplicito (es. 200g, 150 grammi). Valori tipici come 100g di default sono VIETATI se non detti dall'utente.",
        MEAL_SMART_DEFAULTS_PROMPT_RULES,
        "REGOLA ADD_FOOD [USER_HABITS_FOR_CURRENT_MEAL] — GRAMMI: Usa lo storico per grammatura abituale SOLO se l utente non ha indicato grammi e ha citato esplicitamente quell alimento. NON aggiungere alimenti dalle abitudini se l utente non li ha menzionati.",
        "REGOLA ADD_FOOD [METABOLIC_BUDGET] e [UPCOMING_WORKOUT]: Confronta il pasto estratto con [METABOLIC_BUDGET] residuo e con [UPCOMING_WORKOUT] se presente. NON modificare mai le grammature in payload.items[]. Se il pasto devia gravemente dai macro residui o e sbilanciato rispetto al contesto (es. allenamento imminente entro 2-3 ore), compila adviceMessage con un avviso breve e diretto (max 1 frase, italiano). Altrimenti ometti adviceMessage.",
        "Se l'utente indica esplicitamente tipo pasto o orario, estraili nel payload. Se omette tipo pasto o orario, ometti i campi — il codice applica Smart Defaults da [CURRENT_SYSTEM_TIME].",
        "Questa logica NON si applica a richieste di consiglio pasto (ADVICE): quelle sono gestite dal consulente, non da ADD_FOOD.",
      );
    }

    if (includeWorkoutRules) {
      parts.push(
        "VINCOLO ASSOLUTO — ESTRAZIONE ESCLUSIVA: DEVI ESTRARRE ESCLUSIVAMENTE GLI ESERCIZI ESPLICITAMENTE CITATI. VIETATO AGGIUNGERE ESERCIZI DI RISCALDAMENTO, DEFATICAMENTO O SERIE NON MENZIONATE.",
        "ECCEZIONE — SMART RESOLUTION: Se l'utente digita un termine generico (es. 'panca', 'corsa', 'tapis') e nel contesto (es. [USER_WORKOUT_HABITS] o storico allenamenti) esiste una variante specifica o un esercizio abituale, DEVI restituire il nome completo dell'esercizio. Se lo storico contiene serie, ripetizioni o carichi abituali per quell'esercizio, usali come default SOLO se l'utente non li ha specificati.",
        "REGOLA ADD_WORKOUT (multi-esercizio): Se l'utente elenca PIU esercizi, devi estrarre TUTTI in payload.exercises[] — uno oggetto per ciascun esercizio. Non troncare al primo.",
        "PULIZIA CONGIUNZIONI E NO DUPLICATI: I exerciseName estratti NON devono mai iniziare con congiunzioni ('e ', 'ed ', 'con ', 'più ', ', '). Se l'utente scrive 'X e Y', estrai 'X' e 'Y', senza la 'e'. Vietato sdoppiare lo stesso esercizio in due voci diverse.",
        "REGOLA ADD_WORKOUT (durata): Includi durationMinutes SOLO se l'utente ha indicato esplicitamente minuti o ore (es. '45 min', '1 ora'). NON inventare durate di default.",
        "REGOLA ADD_WORKOUT (serie/ripetizioni/carico): Includi sets, reps e weightKg SOLO se l'utente li ha scritti esplicitamente oppure se provieno da SMART RESOLUTION sullo storico abituale per un esercizio gia citato.",
        "REGOLA ADD_WORKOUT (workoutName): Compila workoutName come etichetta sintetica dell'allenamento (es. 'Pesi — panca e trazioni'). Se citi esercizi in exercises[], workoutName puo riassumerli.",
      );
    }

    if (includeSleepRules) {
      parts.push(
        "Se l'utente carica lo screenshot di un'app di monitoraggio del sonno (es. Xiaomi Fitness, smartwatch), analizza l'immagine e restituisci l'intento LOG_SLEEP con payload numerico.",
        `REGOLA DI ESTRAZIONE SONNO (FORMATO ITALIANO):
- Trova il tempo totale di sonno espresso come 'X h Y min' o 'X ore Y min' (es. 5 h 55 min).
- Converti OBBLIGATORIAMENTE questo valore in un numero decimale usando la formula: Ore + (Minuti / 60). Esempio: 5 ore e 55 min diventa 5.91. Usa questo valore numerico per 'durationHours'.
- Cerca la voce 'Profondo' (es. 1 ora 43 min) e fai la stessa conversione decimale per 'deepSleepPhase' (es. 1.71).
- Cerca il numero grande dei punti (es. '80 punti') e inseriscilo come intero in 'qualityScore'.`,
        "Non restituire MAI durationHours = 0. Se non riesci a leggere i valori, imposta uiMessage con un messaggio chiaro e NON inventare numeri.",
      );
    }

    parts.push(
      fixedHint
        ? `Intent target prioritario: ${fixedHint}.`
        : 'Se l intent non e chiaro, usa il comando piu plausibile e segnala requiresConfirmation=true.',
    );

    return parts.join(' ');
  }

  async generateStructuredCommand({
    userText,
    contextBundle,
    commandHint = 'UNKNOWN',
    temperature = 0,
    images = [],
    chatHistory = [],
  }) {
    const responseSchema = getEnvelopeSchemaForIntent(asTrimmedString(commandHint).toUpperCase());
    const imageParts = Array.isArray(images)
      ? images
          .map((src) => imageDataUrlToInlinePart(src))
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const normalizedUserText = asTrimmedString(userText);
    const contents = buildGeminiContentsFromChatHistory(chatHistory);
    const conversationText = buildCombinedConversationText(normalizedUserText, chatHistory);
    const systemTimeCtx = formatCurrentSystemTimeContext();
    const userPromptText =
      normalizedUserText ||
      (imageParts.length > 0
        ? 'Analizza lo screenshot allegato (app fitness/sonno in italiano, es. Xiaomi Fitness) ed estrai durata sonno, fase Profondo e punteggio punti per LOG_SLEEP.'
        : '');
    const systemInstruction = this.buildSystemInstruction(commandHint, { hasImages: imageParts.length > 0 });
    const userPrompt = [
      systemTimeCtx.header,
      `Richiesta utente: ${userPromptText}`,
      `Contesto modulare: ${JSON.stringify(contextBundle?.contextSlices || {})}`,
      asTrimmedString(commandHint).toUpperCase() === 'ADD_FOOD'
        ? 'Registrazione pasto context-aware: contesto modulare include [METABOLIC_BUDGET], [USER_HABITS_FOR_CURRENT_MEAL], [UPCOMING_WORKOUT]. payload.items[] = SOLO alimenti citati dall utente (stesso conteggio voci). OBBLIGATORIO: se l utente usa un termine generico e [USER_HABITS_FOR_CURRENT_MEAL] ha la variante abituale specifica, restituisci il nome completo dell abitudine in foodName (SMART RESOLUTION). Vietato aggiungere voci extra non citate. adviceMessage opzionale (max 1 frase) solo se budget/workout lo richiedono.'
        : null,
      asTrimmedString(commandHint).toUpperCase() === 'ADD_WORKOUT'
        ? 'Registrazione allenamento context-aware: contesto modulare include [USER_WORKOUT_HABITS]. payload.exercises[] = SOLO esercizi citati dall utente. OBBLIGATORIO: se l utente usa un termine generico e [USER_WORKOUT_HABITS] ha la variante abituale, restituisci il nome completo in exerciseName (SMART RESOLUTION). Vietato aggiungere riscaldamento, defaticamento o esercizi extra non citati. Serie/ripetizioni/carico solo se espliciti o da storico abituale.'
        : null,
      'Produci esclusivamente l envelope commandType/payload/adviceMessage/uiMessage/confidence/requiresConfirmation.',
    ]
      .filter(Boolean)
      .join('\n');
    const generationConfig = {
      temperature,
      response_mime_type: 'application/json',
      responseMimeType: 'application/json',
      response_schema: responseSchema,
      responseSchema,
    };
    const rawText = await askAI(userPrompt, systemInstruction, {
      temperature,
      images: imageParts.length > 0 ? images : undefined,
      responseSchema,
      generationConfig,
      contents: contents.length > 0 ? contents : undefined,
    });
    console.log('RAW_GEMINI_RESPONSE:', rawText);
    const cleaned = unwrapJsonText(rawText);
    if (!cleaned) throw new Error('Gemini returned empty structured response');
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('Gemini returned malformed JSON');
    }
    parsed = sanitizeAddFoodCommand(parsed, normalizedUserText, conversationText, contextBundle);
    parsed = sanitizeAddWorkoutCommand(parsed, normalizedUserText, conversationText, contextBundle);
    return {
      command: parsed,
      rawText,
      model: this.model,
    };
  }

  /**
   * Risposta strutturata consulente (JSON): adviceMessage + suggestedAction opzionale.
   * @param {{ prompt: string, systemInstruction?: string, temperature?: number }} params
   */
  async generateConsultantResponse({ prompt, systemInstruction, temperature = 0.35, chatHistory = [] } = {}) {
    const userPrompt = asTrimmedString(prompt);
    if (!userPrompt) throw new Error('Consultant prompt is empty');

    const system =
      asTrimmedString(systemInstruction)
      || generateConsultantSystemInstruction();

    const contents = buildGeminiContentsFromChatHistory(chatHistory);
    const systemTimeCtx = formatCurrentSystemTimeContext();

    const generationConfig = {
      temperature,
      response_mime_type: 'application/json',
      responseMimeType: 'application/json',
      response_schema: consultantResponseSchema,
      responseSchema: consultantResponseSchema,
    };

    const rawText = await askAI(
      `${systemTimeCtx.header}\n${userPrompt}`,
      system,
      {
        model: CONSULTANT_MODEL,
        temperature,
        responseSchema: consultantResponseSchema,
        generationConfig,
        contents: contents.length > 0 ? contents : undefined,
      },
    );

    const cleaned = unwrapJsonText(rawText);
    if (!cleaned) throw new Error('Consultant LLM returned empty response');

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('Consultant LLM returned malformed JSON');
    }

    const adviceMessage = asTrimmedString(parsed?.adviceMessage);
    if (!adviceMessage) throw new Error('Consultant response missing adviceMessage');

    let suggestedAction = null;
    if (parsed?.suggestedAction && typeof parsed.suggestedAction === 'object') {
      suggestedAction = parsed.suggestedAction;
    }

    let mealProposals = [];
    if (Array.isArray(parsed?.mealProposals)) {
      mealProposals = parsed.mealProposals;
    }

    return {
      adviceMessage,
      suggestedAction,
      mealProposals,
      rawText,
      model: CONSULTANT_MODEL,
    };
  }
}

export const geminiStructuredClient = new GeminiStructuredClient();
