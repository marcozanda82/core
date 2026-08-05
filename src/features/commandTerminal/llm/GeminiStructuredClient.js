import {
  addFoodPayloadSchema,
  logSleepPayloadSchema,
  addWorkoutPayloadSchema,
  terminalCommandEnvelopeSchema,
  consultantResponseSchema,
  createNewFoodPayloadSchema,
  chatResponsePayloadSchema,
} from '../contracts/commandSchemas.js';
import { askAI } from '../../../services/aiService.js';
import { generateConsultantSystemInstruction, buildDeterministicMealLogFeedback } from '../../../conversation/ConsultantEngine.js';
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
import {
  inferWorkoutTypeFromText,
  normalizeChatWorkoutType,
} from '../conversation/workoutRegistrationSlots.js';
import { appendKentuGlobalStateToSystemInstruction } from '../context/kentuGlobalState.js';

const DEFAULT_MODEL = 'gemini-3.6-flash';
const CONSULTANT_MODEL = 'gemini-3.6-flash';

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

/** True se il testo utente menziona grammi espliciti (non pezzi/unita). */
function userTextMentionsExplicitGrams(userText) {
  const t = asTrimmedString(userText).toLowerCase();
  if (!t) return false;
  return /(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)\b/.test(t);
}

/** True se il testo utente menziona una quantità numerica esplicita (grammi o pezzi). */
function userTextMentionsExplicitQuantity(userText) {
  const t = asTrimmedString(userText).toLowerCase();
  if (!t) return false;
  return (
    userTextMentionsExplicitGrams(t)
    || /\b(\d+(?:[.,]\d+)?)\s*(?:porzioni?|fett[ea]|pezzi?|uova?|slice)\b/.test(t)
    || /\b(?:mangiato|mangiata|preso|presa|bevuto|bevuta)\s+(?:circa\s+)?(\d+)/.test(t)
    || /\b(?:un|una|uno|due|tre|quattro|cinque|mezzo|mezza)\s+(?:di\s+)?[\wàèéìòù-]{3,}/.test(t)
  );
}

/** Unita/pezzi senza grammi espliciti → stima ammessa con isEstimated. */
function userTextMentionsUnitQuantity(userText) {
  const t = asTrimmedString(userText).toLowerCase();
  if (!t) return false;
  if (userTextMentionsExplicitGrams(t) && !/\b(?:fett|pezz|uov|porzion|slice|un|una|uno|due)\b/.test(t)) {
    // Solo grammi, nessuna unita: non e "unit quantity only".
  }
  return (
    /\b\d+\s*(?:porzioni?|fett[ea]|pezzi?|uova?|slice|cucchiai(?:ni)?)\b/.test(t)
    || /\b(?:un|una|uno|due|tre|quattro|cinque|mezzo|mezza)\s+(?:di\s+)?[\wàèéìòù-]{3,}/.test(t)
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

/**
 * Rimuove numeri/grammature/congiunzioni dal foodName prima della ricerca DB.
 * Es: "e 160 g di pane integrale" → { cleanName: "pane integrale", gramsFromName: 160 }
 * @param {string} foodName
 * @returns {{ cleanName: string, gramsFromName: number | null }}
 */
function scrubFoodNameQuantityTokens(foodName) {
  let name = stripLeadingConjunctions(foodName);
  if (!name) return { cleanName: '', gramsFromName: null };

  const gramsMatch = name.match(/(\d+[.,]?\d*)\s*(?:g|gr|grammi)\b/i);
  const gramsFromName = gramsMatch
    ? Math.round(Number(String(gramsMatch[1]).replace(',', '.')))
    : null;

  name = name
    // Pattern tipico LLM: "e 160 g di pane…" / "160g di pane…"
    .replace(/^(?:e|ed|con|più|piu)\s+/i, '')
    .replace(/\b\d+[.,]?\d*\s*(?:g|gr|grammi|kg|ml)\b/gi, ' ')
    .replace(/\(\s*\d+[.,]?\d*\s*(?:g|gr|grammi)?\s*\)/gi, ' ')
    .replace(/\b\d+[.,]?\d*\b/g, ' ')
    // Solo articoli quantitativi in testa o dopo rimozione grammi, non "all'olio"
    .replace(/^(?:di|del|della|dello|dei|degli|delle|un|una|uno)\s+/i, '')
    .replace(/\s+(?:di|del|della|dello|dei|degli|delle)\s+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  name = stripLeadingConjunctions(name);
  return {
    cleanName: name,
    gramsFromName: Number.isFinite(gramsFromName) && gramsFromName > 0 ? gramsFromName : null,
  };
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
  const iconA = asTrimmedString(itemA?.icon);
  const iconB = asTrimmedString(itemB?.icon);
  if (iconA || iconB) merged.icon = iconA || iconB;
  const grams = pickMergedGrams(itemA, itemB);
  if (grams != null) merged.grams = grams;
  else delete merged.grams;
  // Se uno dei due era stimato, mantieni il flag (l'utente potra correggere in UI).
  if (itemA?.isEstimated === true || itemB?.isEstimated === true) {
    merged.isEstimated = true;
  } else if ('isEstimated' in merged) {
    merged.isEstimated = false;
  }
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
    // Sessione generica: exercises=[] e' lecito (es. "allenamento gambe alle 18").
    payload.exercises = [];
    const workoutName = stripLeadingConjunctions(payload.workoutName);
    if (workoutName) {
      payload.workoutName = workoutName;
    }
  }

  const durationMinutes = Number(payload.durationMinutes);
  if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
    payload.durationMinutes = Math.round(durationMinutes);
  } else {
    // Assente o non citata: lascia che normalizeWorkoutPayload applichi il default 45.
    delete payload.durationMinutes;
  }

  const workoutType =
    normalizeChatWorkoutType(payload.workoutType)
    || inferWorkoutTypeFromText(combinedText);
  if (workoutType) {
    payload.workoutType = workoutType;
    if (!asTrimmedString(payload.workoutName)) {
      const labels = {
        spinta: 'Allenamento spinta',
        trazione: 'Allenamento trazione',
        gambe: 'Allenamento gambe',
        cardio: 'Cardio',
        altro: 'Allenamento',
      };
      payload.workoutName = labels[workoutType] || 'Allenamento';
    }
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
    const rawFoodName = asTrimmedString(next.foodName || next.name);
    if (!rawFoodName) return null;

    const { cleanName, gramsFromName } = scrubFoodNameQuantityTokens(rawFoodName);
    if (!cleanName) return null;
    next.foodName = cleanName;

    const icon = asTrimmedString(next.icon);
    if (icon) {
      try {
        const match = icon.match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/u);
        next.icon = match ? match[0] : icon.slice(0, 4);
      } catch {
        next.icon = icon.slice(0, 4);
      }
    } else {
      delete next.icon;
    }

    let gramsNum = Number(next.grams ?? next.qty ?? next.weight);
    // Se il modello ha infilato la grammatura nel foodName ("e 160 g di pane") e ha
    // duplicato i grammi del primo item, preferisci i grammi trovati nel nome grezzo.
    if (gramsFromName != null) {
      gramsNum = gramsFromName;
    }

    const modelSaysEstimated = next.isEstimated === true;
    const hasGrams = Number.isFinite(gramsNum) && gramsNum > 0;
    const hasExplicitGrams = userTextMentionsExplicitGrams(combinedText);
    const hasUnitQty = userTextMentionsUnitQuantity(combinedText);
    const hasAnyQty = userTextMentionsExplicitQuantity(combinedText);

    if (!hasGrams) {
      delete next.grams;
      delete next.isEstimated;
    } else if (gramsFromName != null) {
      next.grams = Math.round(gramsNum);
      next.isEstimated = false;
    } else if (modelSaysEstimated || (hasUnitQty && !hasExplicitGrams)) {
      // Unita/pezzi → tieni la stima media e marca isEstimated.
      next.grams = Math.round(gramsNum);
      next.isEstimated = true;
    } else if (hasExplicitGrams || hasAnyQty) {
      next.grams = Math.round(gramsNum);
      next.isEstimated = false;
    } else {
      // Nessuna quantita nel testo: non inventare grammi.
      delete next.grams;
      delete next.isEstimated;
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

  return {
    ...command,
    payload,
    // Mute & Replace: il controller ignora comunque questi campi; li svuotiamo alla fonte.
    adviceMessage: '',
    uiMessage: '',
  };
}

function getEnvelopeSchemaForIntent(commandHint) {
  // Con hint ADD_FOOD: niente escape CHAT_RESPONSE — data entry obbligatorio.
  if (commandHint === 'ADD_FOOD') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: {
          type: 'string',
          enum: ['ADD_FOOD'],
          description:
            'OBBLIGATORIO ADD_FOOD: l utente sta registrando cibo. Vietato CHAT_RESPONSE.',
        },
        payload: addFoodPayloadSchema,
        uiMessage: {
          type: 'string',
          description: 'Lascia VUOTO per ADD_FOOD.',
        },
        adviceMessage: {
          type: 'string',
          nullable: true,
          description: 'Lascia VUOTO per ADD_FOOD.',
        },
      },
    };
  }
  if (commandHint === 'ADD_WORKOUT') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: { type: 'string', enum: ['ADD_WORKOUT', 'CHAT_RESPONSE'] },
        payload: {
          anyOf: [addWorkoutPayloadSchema, chatResponsePayloadSchema],
        },
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
  if (commandHint === 'CREATE_NEW_FOOD') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: { type: 'string', enum: ['CREATE_NEW_FOOD'] },
        payload: createNewFoodPayloadSchema,
      },
    };
  }
  if (commandHint === 'CHAT_RESPONSE') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: { type: 'string', enum: ['CHAT_RESPONSE'] },
        payload: chatResponsePayloadSchema,
        uiMessage: {
          type: 'string',
          description:
            'OBBLIGATORIO per CHAT_RESPONSE: analisi sintetica basata su KENTU_GLOBAL_STATE.',
        },
        adviceMessage: {
          type: 'string',
          nullable: true,
          description: 'Alias opzionale di uiMessage per CHAT_RESPONSE.',
        },
        requiresConfirmation: {
          type: 'boolean',
          description: 'Per CHAT_RESPONSE deve essere false.',
        },
      },
      required: ['commandType', 'payload'],
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

/** Blocco Intent Routing — massima priorità nel system prompt (anti over-triggering bozze). */
export const INTENT_ROUTING_SYSTEM_BLOCK = `### REGOLA FONDAMENTALE DI INTENT ROUTING (CLASSIFICAZIONE DELL'INTENZIONE)
Prima di generare la risposta e compilare la struttura dati, devi classificare l'intenzione dell'utente.

REGOLA DI ROUTING CRITICA (ASSOLUTA): SE IL MESSAGGIO DELL'UTENTE CONTIENE VERBI COME "HO MANGIATO", "HO BEVUTO", "HO PRESO", "HO CONSUMATO", OPPURE ELENCA CIBI, INGREDIENTI O PASTI (COLAZIONE, SNACK, PRANZO, CENA) — ANCHE IN FORMA DISCORSIVA TIPO "COME SNACK, ALLE ORE 19:00, HO MANGIATO SARDINE..." — DEVI OBBLIGATORIAMENTE USARE IL COMANDO ADD_FOOD. È SEVERAMENTE VIETATO USARE CHAT_RESPONSE O FORNIRE RIASSUNTI DI STATO / CILINDRI / BUDGET QUANDO L'UTENTE DESCRIVE L'ASSUNZIONE DI CIBO. PRIORITÀ: DATA ENTRY, NON CHIACCHIERE.

CASO 1: [AZIONE - INSERIMENTO DATI]
L'utente dichiara un'azione compiuta o descrive cibo assunto (es. 'Ho mangiato una mela', 'come snack alle 19 ho mangiato sardine', 'Ho fatto 45 min di petto').
-> COMPORTAMENTO OBBLIGATORIO: Genera il JSON strutturato (ADD_FOOD / ADD_WORKOUT / LOG_SLEEP). Per ADD_FOOD lascia uiMessage e adviceMessage VUOTI. Non fare il consulente di stato.

CASO 2: [CONSULTO - DOMANDA SULLO STATO]
L'utente pone una domanda ESPLICITA sullo stato SENZA descrivere un pasto appena mangiato (es. 'Quante pro mi mancano?', 'Quanto cardio ho fatto?').
-> COMPORTAMENTO OBBLIGATORIO: commandType CHAT_RESPONSE. È VIETATO creare bozze pasto/workout. Analisi sintetica su KENTU_GLOBAL_STATE.
-> ECCEZIONE: se nel messaggio c'è anche "ho mangiato" / elenco alimenti → vince SEMPRE CASO 1 (ADD_FOOD).`;

export class GeminiStructuredClient {
  constructor({ model = DEFAULT_MODEL } = {}) {
    this.model = model || DEFAULT_MODEL;
  }

  buildSystemInstruction(commandHint, { hasImages = false } = {}) {
    const fixedHint = asTrimmedString(commandHint).toUpperCase();
    const includeSleepRules = fixedHint === 'LOG_SLEEP' || hasImages;
    const includeFoodRules = fixedHint === 'ADD_FOOD' || fixedHint === 'UNKNOWN';
    const includeWorkoutRules = fixedHint === 'ADD_WORKOUT' || fixedHint === 'UNKNOWN';
    const includeNewFoodRules = fixedHint === 'CREATE_NEW_FOOD' || (hasImages && fixedHint === 'UNKNOWN');

    const lead = [
      'Sei Kentu Command Terminal.',
      'Rispondi SOLO con JSON valido e conforme allo schema fornito.',
      'Non aggiungere markdown, spiegazioni o testo fuori dal JSON.',
      INTENT_ROUTING_SYSTEM_BLOCK,
    ].join('\n\n');

    const parts = [];

    if (includeNewFoodRules) {
      parts.push(
        "INTENTO CREATE_NEW_FOOD (VISION ETICHETTA): l'utente ha allegato una foto di un'etichetta nutrizionale.",
        "VINCOLO ASSOLUTO NO-HALLUCINATION: estrai ESCLUSIVAMENTE i valori STAMPATI sull'etichetta. È VIETATO inventare o stimare valori mancanti.",
        "Output per 100g (o per 100 ml se indicato come tale): compila solo desc, kcal, prot, carb, fatTotal (e fibre se è stampata).",
        "Se un valore NON è visibile/assente sulla scatola: restituisci null (o ometti) per quel campo.",
        "Non compilare vitamine/minerali/micro-nutrienti extra: saranno eventualmente stimati dal sistema locale tramite Similarity Match, non da te.",
      );
    }

    if (includeFoodRules) {
      parts.push(
        "VINCOLO ADD_FOOD — ESTRAZIONE ESCLUSIVA (CONTEGGIO VOCI): Estrai SOLO gli alimenti ESPLICITAMENTE citati dall utente (e nella cronologia conversazione). E VIETATO aggiungere contorni, condimenti, completamenti, ingredienti impliciti o piatti extra non menzionati. SE l utente cita N alimenti distinti, payload.items[] DEVE contenere ESATTAMENTE N voci — ne piu ne meno.",
        `ESEMPI DI ESTRAZIONE PASTI MULTIPLI:
User: "Ho mangiato 90g di sardine all'olio e 160g di pane integrale"
Output Corretto per payload.items:
[
  { "foodName": "sardine all'olio", "grams": 90, "isEstimated": false },
  { "foodName": "pane integrale", "grams": 160, "isEstimated": false }
]
REGOLA TASSATIVA: Il campo foodName (name) DEVE contenere SOLO il nome dell'alimento da cercare nel database. Rimuovi le congiunzioni (e, con, ed) e rimuovi le quantità dal nome. VIETATO: "e 160 g di pane integrale".`,
        "HARD CONSTRAINT — SANITIZZAZIONE NOMI: foodName = stringa pulita DB (es. \"pane integrale\"). NO grammi, NO congiunzioni.",
        "HARD CONSTRAINT — MAPPATURA GRAMMI 1:1: ogni alimento ha i PROPRI grammi. Mai copiare i grammi del primo sui successivi.",
        "HARD CONSTRAINT — NESSUNA DUPLICAZIONE DA CONGIUNZIONE: 'e'/'ed'/'con' separano alimenti, non entrano nel foodName.",
        "ECCEZIONE ALL ESTRAZIONE LETTERALE — SMART RESOLUTION (PRIORITA SU [USER_HABITS_FOR_CURRENT_MEAL]): Se l utente digita un termine generico (es. 'pasta', 'latte', 'yogurt') e in [USER_HABITS_FOR_CURRENT_MEAL] esiste una variante specifica che usa abitualmente (es. 'pasta integrale la molisana', 'latte parzialmente scremato', 'yogurt greco fage'), DEVI OBBLIGATORIAMENTE restituire in payload.items[].foodName il nome specifico completo dell abitudine corrispondente. Arricchire il nome di un SINGOLO alimento gia citato basandosi sullo storico NON viola Estrazione Esclusiva: non stai aggiungendo voci, stai risolvendo l entita. Se piu abitudini contengono il termine generico, scegli quella piu frequente o piu plausibile per il pasto corrente. Se [USER_HABITS] e vuoto o non contiene match, usa il termine grezzo dell utente (pulito da grammi e congiunzioni).",
        "REGOLA ADD_FOOD (multi-alimento): Se l'utente elenca PIU alimenti, devi estrarre TUTTI in payload.items[] — uno oggetto per ciascun alimento, ciascuno con la PROPRIA grammatura. Non troncare al primo.",
        "REGOLA ADD_FOOD (orario): Se l'utente indica un orario esplicito (es. 'ore 14.45', 'alle 20:30'), estrailo in HH:mm in payload.timeString ed exactTime. Se NON indica orario, ometti exactTime — il sistema usera l'ora corrente.",
        "REGOLA ADD_FOOD (entity resolution): Per ogni alimento citato, compila foodName (nome puro) e grams. NON inventare foodDbKey ne macronutrienti.",
        "REGOLA ADD_FOOD (pasto gia consumato): Se l'utente descrive un pasto gia mangiato, estrai OGNI alimento in items[].",
        "REGOLA ADD_FOOD (isEstimated — STIMA UNITA/PEZZI): Quando l'utente inserisce quantità unitarie (pezzi, fette, ecc.), DEVI PRIMA controllare il User_Portions_Dictionary nel KENTU_GLOBAL_STATE. Se l'alimento è presente, USA ESATTAMENTE quel peso con isEstimated: false. Usa le medie standard (isEstimated: true) SOLO se assente dal dizionario.",
        "REGOLA ADD_FOOD (nessuna quantita): Se l'utente dichiara un alimento SENZA grammi E SENZA unita/pezzi, lascia grams null — il sistema chiedera i grammi.",
        "REGOLA ADD_FOOD (adviceMessage/uiMessage): Lascia VUOTI.",
        MEAL_SMART_DEFAULTS_PROMPT_RULES,
        "REGOLA ADD_FOOD [USER_HABITS_FOR_CURRENT_MEAL] — GRAMMI: Usa lo storico per grammatura abituale SOLO se l utente non ha indicato grammi/unita e ha citato esplicitamente quell alimento; in quel caso isEstimated:true. NON aggiungere alimenti dalle abitudini se l utente non li ha menzionati.",
        "HARD CONSTRAINT — SILENZIO COPY SU ADD_FOOD: adviceMessage e uiMessage DEVONO essere vuoti.",
        "Se l'utente indica esplicitamente tipo pasto o orario, estraili nel payload. Se omette tipo pasto o orario, ometti i campi — Smart Defaults da [CURRENT_SYSTEM_TIME].",
        "Questa logica NON si applica a richieste di consiglio pasto (ADVICE).",
      );
    }

    if (includeWorkoutRules) {
      parts.push(
        "VINCOLO ASSOLUTO — ESTRAZIONE ESCLUSIVA: DEVI ESTRARRE ESCLUSIVAMENTE GLI ESERCIZI ESPLICITAMENTE CITATI. VIETATO AGGIUNGERE ESERCIZI DI RISCALDAMENTO, DEFATICAMENTO O SERIE NON MENZIONATE.",
        "ECCEZIONE — SMART RESOLUTION: Se l'utente digita un termine generico (es. 'panca', 'corsa', 'tapis') e nel contesto (es. [USER_WORKOUT_HABITS] o storico allenamenti) esiste una variante specifica o un esercizio abituale, DEVI restituire il nome completo dell'esercizio. Se lo storico contiene serie, ripetizioni o carichi abituali per quell'esercizio, usali come default SOLO se l'utente non li ha specificati.",
        "REGOLA ADD_WORKOUT (multi-esercizio): Se l'utente elenca PIU esercizi, devi estrarre TUTTI in payload.exercises[] — uno oggetto per ciascun esercizio. Non troncare al primo.",
        "PULIZIA CONGIUNZIONI E NO DUPLICATI: I exerciseName estratti NON devono mai iniziare con congiunzioni ('e ', 'ed ', 'con ', 'più ', ', '). Se l'utente scrive 'X e Y', estrai 'X' e 'Y', senza la 'e'. Vietato sdoppiare lo stesso esercizio in due voci diverse.",
        "REGOLA ADD_WORKOUT (durata): Includi durationMinutes SOLO se l'utente ha indicato esplicitamente minuti o ore (es. '45 min', '1 ora'). NON inventare durate di default — se assente, ometti il campo.",
        "REGOLA ADD_WORKOUT (workoutType OBBLIGATORIO): Compila sempre payload.workoutType normalizzando: gambe/legs/lower→gambe; spinta/push/petto/spalle→spinta; trazione/pull/dorso→trazione; cardio/corsa/HIIT→cardio; altrimenti altro.",
        "REGOLA ADD_WORKOUT (sessione generica): Per frasi tipo 'ho fatto allenamento gambe alle 18' senza lista esercizi, exercises=[] e workoutName sintetico sono validi. NON inventare esercizi.",
        "REGOLA ADD_WORKOUT (serie/ripetizioni/carico): Includi sets, reps e weightKg SOLO se l'utente li ha scritti esplicitamente oppure se provieno da SMART RESOLUTION sullo storico abituale per un esercizio gia citato.",
        "REGOLA ADD_WORKOUT (workoutName): Compila workoutName come etichetta sintetica dell'allenamento (es. 'Allenamento gambe'). Se citi esercizi in exercises[], workoutName puo riassumerli.",
        "REGOLA ADD_WORKOUT (dati strutturati): Se l'utente registra un allenamento e menziona la fatica da 1 a 10, salvala nel campo rpe. Se menziona l'obiettivo (ipertrofia, forza, resistenza, mantenimento, junk), salvalo in trainingGoal usando uno di: Ipertrofia, Forza, Resistenza, Mantenimento, Junk. Se aggiunge note su carichi, esercizi o variazioni, salvale in progressionNote. Ometti questi campi se non sono citati esplicitamente.",
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
        "REGOLA LOG_SLEEP (dati strutturati): Se l'utente registra il sonno e valuta esplicitamente come ha dormito o menziona una valutazione in stelle, convertila in un numero da 1 a 5 e salvalo in sleepQuality. Esempi: 'ho dormito benissimo' → 5, 'male'/'pessimo' → 1-2, 'così così' → 3, '4 stelle'/'3/5' → numero indicato. Non inventare sleepQuality se non c'è una valutazione esplicita. Non confondere sleepQuality (1-5) con qualityScore (punti wearable).",
        "Non restituire MAI durationHours = 0. Se non riesci a leggere i valori, imposta uiMessage con un messaggio chiaro e NON inventare numeri.",
      );
    }

    parts.push(
      fixedHint && fixedHint !== 'UNKNOWN'
        ? `Intent target FORZATO: ${fixedHint}. Per ADD_FOOD e VIETATO rispondere con CHAT_RESPONSE.`
        : 'Se l intent non e chiaro, classifica CASO 1 vs CASO 2. Se c\'e cibo mangiato → ADD_FOOD. Solo domande pure di stato → CHAT_RESPONSE.',
    );

    return `${lead}\n\n${parts.join(' ')}`;
  }

  async generateStructuredCommand({
    userText,
    contextBundle,
    commandHint = 'UNKNOWN',
    temperature = 0,
    images = [],
    chatHistory = [],
    signal = null,
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
    const systemInstruction = appendKentuGlobalStateToSystemInstruction(
      this.buildSystemInstruction(commandHint, { hasImages: imageParts.length > 0 }),
      contextBundle?.kentuGlobalStateText
        || (contextBundle?.contextSlices?.KENTU_GLOBAL_STATE
          ? JSON.stringify(contextBundle.contextSlices.KENTU_GLOBAL_STATE, null, 2)
          : ''),
    );
    const userPrompt = [
      systemTimeCtx.header,
      `Richiesta utente: ${userPromptText}`,
      `Contesto modulare: ${JSON.stringify(contextBundle?.contextSlices || {})}`,
      asTrimmedString(commandHint).toUpperCase() === 'ADD_FOOD'
        ? 'Registrazione pasto (ADD_FOOD): items[] = un oggetto per alimento. foodName PURO (no "e 160 g di pane"). icon = singola emoji precisa (pomodoro→🍅, passata→🥫, pasta→🍝). grams = SOLO la quantita di QUELL alimento. Esempio: "90g sardine e 160g pane" → [{foodName:"sardine",icon:"🐟",grams:90},{foodName:"pane",icon:"🥖",grams:160}]. adviceMessage/uiMessage VUOTI.'
        : null,
      asTrimmedString(commandHint).toUpperCase() === 'ADD_WORKOUT'
        ? 'Registrazione allenamento context-aware: contesto modulare include [USER_WORKOUT_HABITS]. payload.workoutType OBBLIGATORIO (spinta|trazione|gambe|cardio|altro). Sessione generica senza esercizi citati → exercises=[] ok. durationMinutes solo se esplicita. OBBLIGATORIO: se l utente usa un termine generico e [USER_WORKOUT_HABITS] ha la variante abituale, restituisci il nome completo in exerciseName (SMART RESOLUTION). Vietato aggiungere riscaldamento, defaticamento o esercizi extra non citati. Se la richiesta e un CONSULTO/domanda sullo stato (CASO 2), usa commandType CHAT_RESPONSE invece di ADD_WORKOUT.'
        : null,
      asTrimmedString(commandHint).toUpperCase() === 'CHAT_RESPONSE'
        ? 'CASO 2 CONSULTO: commandType DEVE essere CHAT_RESPONSE. Compila uiMessage (o adviceMessage/payload.message) con analisi sintetica basata SOLO su KENTU_GLOBAL_STATE. requiresConfirmation=false. VIETATO creare payload ADD_FOOD/ADD_WORKOUT o bozze.'
        : null,
      'Produci esclusivamente l envelope commandType/payload/adviceMessage/uiMessage/confidence/requiresConfirmation.',
    ]
      .filter(Boolean)
      .join('\n');

    // --- DIAGNOSTIC TRACE (meal log race) ---
    console.log('🔴 DEBUG - SYSTEM PROMPT INVIATO:', systemInstruction);
    console.log('🔴 DEBUG - USER PROMPT INVIATO:', userPrompt);
    console.log('🔴 DEBUG - COMMAND HINT:', asTrimmedString(commandHint).toUpperCase());
    console.log('🔴 DEBUG - KENTU_GLOBAL_STATE (Nutrition Delta / snapshot):',
      contextBundle?.contextSlices?.KENTU_GLOBAL_STATE?.Nutrition_Context
      || contextBundle?.kentuGlobalStateText?.slice?.(0, 800)
      || '(assente)');

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
      ...(signal ? { signal } : {}),
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

    console.log('🔵 DEBUG - OUTPUT TOOL / STRUCTURED COMMAND:', {
      commandType: parsed?.commandType,
      adviceMessage: parsed?.adviceMessage,
      uiMessage: parsed?.uiMessage,
      payloadPreview: parsed?.payload,
      requiresConfirmation: parsed?.requiresConfirmation,
    });

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
  async generateConsultantResponse({ prompt, systemInstruction, temperature = 0.35, chatHistory = [], signal = null } = {}) {
    const userPrompt = asTrimmedString(prompt);
    if (!userPrompt) throw new Error('Consultant prompt is empty');

    const system =
      asTrimmedString(systemInstruction)
      || generateConsultantSystemInstruction();

    const contents = buildGeminiContentsFromChatHistory(chatHistory);
    const systemTimeCtx = formatCurrentSystemTimeContext();

    console.log('🔴 DEBUG - SYSTEM PROMPT INVIATO (generateConsultantResponse):', system);
    console.log('🔴 DEBUG - USER PROMPT INVIATO (generateConsultantResponse):', userPrompt);

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
        ...(signal ? { signal } : {}),
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

    let suggestions = [];
    if (Array.isArray(parsed?.suggestions)) {
      suggestions = parsed.suggestions;
    }

    return {
      adviceMessage,
      suggestedAction,
      mealProposals,
      suggestions,
      rawText,
      model: CONSULTANT_MODEL,
    };
  }

  /**
   * Copy post-log: override numerico in memoria (niente Context Snapshot / LLM).
   */
  async generateMealRegistrationFeedback({ projection, mealLabel = '' } = {}) {
    const pack = projection && typeof projection === 'object' ? projection : null;
    if (!pack?.budgetRimanente || !pack?.nuoviConsumi) {
      throw new Error('Meal registration feedback missing projection');
    }
    return buildDeterministicMealLogFeedback(pack, mealLabel);
  }
}

export const geminiStructuredClient = new GeminiStructuredClient();
