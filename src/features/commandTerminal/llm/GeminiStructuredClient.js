import {
  addFoodPayloadSchema,
  logSleepPayloadSchema,
  addWorkoutPayloadSchema,
  terminalCommandEnvelopeSchema,
  consultantResponseSchema,
  createNewFoodPayloadSchema,
  chatResponsePayloadSchema,
  askClarificationPayloadSchema,
  requestFoodPhotoPayloadSchema,
} from '../contracts/commandSchemas.js';
import { askAI } from '../../../services/aiService.js';
import { generateConsultantSystemInstruction, buildDeterministicMealLogFeedback } from '../../../conversation/ConsultantEngine.js';
import {
  buildCombinedConversationText,
  buildGeminiContentsFromChatHistory,
  buildRecentThreadSnippetForPrompt,
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
import { buildChatPersonaSystemBlock } from '../../chat/chatPersona.js';
import { deduplicateWipItems } from '../../wipMealBuilder/utils/wipMealItemUtils.js';
import {
  foldItalianSttConfusables,
  levenshteinDistance,
  maxFuzzyDistanceForQuery,
} from '../../../foodSearch.js';

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

/** True se foodName ha token significativi assenti dal testo utente (es. bauletto su «pane»). */
function foodNameHasUnspokenExtraTokens(foodName, combinedText) {
  const nameNorm = normalizeFoodToken(foodName);
  const textNorm = normalizeFoodToken(combinedText);
  if (!nameNorm || !textNorm) return false;

  const nameTokens = nameNorm.split(/\s+/).filter((t) => t.length >= 3);
  if (nameTokens.length < 2) return false;

  const textTokens = textNorm.split(/\s+/).filter((t) => t.length >= 3);
  const textFold = foldItalianSttConfusables(textNorm);

  const tokenSpokenInUserText = (token) => {
    if (textNorm.includes(token)) return true;
    const tokenFold = foldItalianSttConfusables(token);
    if (tokenFold && textFold.includes(tokenFold)) return true;
    const maxDist = maxFuzzyDistanceForQuery(token);
    return textTokens.some((ut) => {
      if (Math.abs(ut.length - token.length) > maxDist + 1) return false;
      if (levenshteinDistance(token, ut) <= maxDist) return true;
      return (
        levenshteinDistance(
          foldItalianSttConfusables(token),
          foldItalianSttConfusables(ut),
        ) <= maxDist
      );
    });
  };

  const unspoken = nameTokens.filter((t) => !tokenSpokenInUserText(t));
  return unspoken.length > 0;
}

/**
 * Deroga guardrails: l'espansione «pane»→variante abituale avviene SOLO via proposta
 * maggiordomo (conferma esplicita), mai come registrazione silenziosa.
 * Qui non espandiamo: il controller arricchisce dopo con mealButlerProposal.
 */
function isHabitExpandedFoodName(_foodName, _combinedText, _habitNames) {
  return false;
}

/** True se il payload sembra una scomposizione ricetta (bozza stimata multi-ingrediente). */
function looksLikeRecipeMeanValueDecomposition(items, combinedText) {
  const list = Array.isArray(items) ? items.filter((i) => i && typeof i === 'object') : [];
  if (list.length < 2) return false;
  const estimatedCount = list.filter((i) => i.isEstimated === true).length;
  if (estimatedCount < Math.ceil(list.length * 0.75)) return false;
  // Input analitico (grammi/unità esplicite) → filtra come prima; niente bypass.
  if (userTextMentionsExplicitGrams(combinedText) || userTextMentionsUnitQuantity(combinedText)) {
    return false;
  }
  return true;
}

/** Rimuove voci items[] non citate dall'utente. Niente arricchimenti da abitudini. */
function filterItemsToUserMentions(items, combinedText, habitNames = []) {
  const safeItems = Array.isArray(items)
    ? items.filter((item) => item && typeof item === 'object')
    : [];
  if (safeItems.length === 0) return [];

  const text = asTrimmedString(combinedText);
  if (!text) return safeItems;

  // Scomposizione ricetta: tieni tutti gli ingredienti stimati (non sono nel testo utente).
  if (looksLikeRecipeMeanValueDecomposition(safeItems, text)) {
    return safeItems;
  }

  void habitNames;
  let attested;
  try {
    attested = foodNamesAttestedInUserText(text);
  } catch {
    attested = new Set();
  }

  const stripOverSpecific = (item) => {
    const originalName = asTrimmedString(item?.foodName || item?.name);
    if (!originalName) return item;
    if (!foodNameHasUnspokenExtraTokens(originalName, text)) return item;
    const fallbackName = resolveGenericFoodFallback(originalName, text) || originalName;
    if (fallbackName && fallbackName !== originalName) {
      return { ...item, foodName: fallbackName };
    }
    return item;
  };

  const filtered = safeItems.filter((item) => {
    const foodName = asTrimmedString(item?.foodName || item?.name);
    if (!foodName) return false;
    try {
      return isFoodNameAttestedInUserText(foodName, text, attested);
    } catch {
      return false;
    }
  });

  if (filtered.length > 0) {
    return filtered.map(stripOverSpecific);
  }

  const fallbackItems = safeItems
    .map((item) => {
      const originalName = asTrimmedString(item?.foodName || item?.name);
      if (!originalName) return null;
      const fallbackName = resolveGenericFoodFallback(originalName, text) || originalName;
      return { ...item, foodName: fallbackName };
    })
    .filter(Boolean);

  return fallbackItems.length > 0 ? fallbackItems.map(stripOverSpecific) : safeItems.map(stripOverSpecific);
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

/** Pulisce congiunzioni iniziali e fonde duplicati sommando grammi (mai max). */
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

  // Dedup matematico condiviso con WIP: stesso nome / molto simile → somma grammi.
  return deduplicateWipItems(cleaned, { keepZeroGrams: true }).map((item) => {
    const foodName = String(item.foodName || item.name || '').trim();
    const grams = Number(item.grams);
    const next = { ...item, foodName };
    if (!(Number.isFinite(grams) && grams > 0)) {
      delete next.grams;
      delete next.isEstimated;
    } else {
      next.grams = Math.round(grams);
    }
    return next;
  });
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
      // Unita/pezzi OPPURE scomposizione ricetta / porzione media → tieni stima.
      next.grams = Math.round(gramsNum);
      next.isEstimated = true;
    } else if (hasExplicitGrams || hasAnyQty) {
      next.grams = Math.round(gramsNum);
      next.isEstimated = false;
    } else {
      // Nessuna quantita nel testo e modello non ha marcato stima: non inventare grammi.
      delete next.grams;
      delete next.isEstimated;
    }
    delete next.name;
    delete next.qty;
    delete next.weight;

    // Espansione semantica: termine detto + flessioni/sinonimi LLM.
    const rawKeywords = Array.isArray(next.searchKeywords) ? next.searchKeywords : [];
    const keywordSeen = new Set();
    const cleanedKeywords = [];
    const pushKeyword = (value) => {
      const t = asTrimmedString(value);
      if (!t || t.length > 64) return;
      const key = t.toLowerCase();
      if (keywordSeen.has(key)) return;
      keywordSeen.add(key);
      cleanedKeywords.push(t);
    };
    pushKeyword(cleanName);
    rawKeywords.forEach(pushKeyword);
    if (cleanedKeywords.length > 0) {
      next.searchKeywords = cleanedKeywords.slice(0, 8);
    } else {
      delete next.searchKeywords;
    }

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
      icon: payload.icon,
      isEstimated: payload.isEstimated,
      searchKeywords: payload.searchKeywords,
    });
    if (single) {
      payload.items = applyItemFilter([single]);
    } else {
      payload.items = [];
    }
    delete payload.foodName;
    delete payload.grams;
    delete payload.searchKeywords;
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
    // Mute advice/ui: il messaggio informale vive in payload.message (displayName).
    adviceMessage: '',
    uiMessage: '',
  };
}

function getEnvelopeSchemaForIntent(commandHint) {
  // Con hint ADD_FOOD: data entry obbligatorio, ma proposta maggiordomo / foto se serve.
  if (commandHint === 'ADD_FOOD') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: {
          type: 'string',
          enum: ['ADD_FOOD', 'ASK_CLARIFICATION', 'REQUEST_FOOD_PHOTO'],
          description:
            'ADD_FOOD se cibo chiaro (nome + quantita o abitudine da proporre in bozza). '
            + 'ASK_CLARIFICATION = proposta maggiordomo del «solito» + grammi (mai «Che tipo di…?»). '
            + 'REQUEST_FOOD_PHOTO se alimento sconosciuto. Vietato CHAT_RESPONSE.',
        },
        payload: {
          anyOf: [
            addFoodPayloadSchema,
            askClarificationPayloadSchema,
            requestFoodPhotoPayloadSchema,
          ],
        },
        uiMessage: {
          type: 'string',
          description: 'Lascia VUOTO per ADD_FOOD. Per ASK_CLARIFICATION / REQUEST_FOOD_PHOTO: domanda/proposta breve (o usa payload.message).',
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
        commandType: { type: 'string', enum: ['ADD_WORKOUT', 'CHAT_RESPONSE', 'ASK_CLARIFICATION'] },
        payload: {
          anyOf: [addWorkoutPayloadSchema, chatResponsePayloadSchema, askClarificationPayloadSchema],
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
        commandType: { type: 'string', enum: ['CHAT_RESPONSE', 'ASK_CLARIFICATION'] },
        payload: {
          anyOf: [chatResponsePayloadSchema, askClarificationPayloadSchema],
        },
        uiMessage: {
          type: 'string',
          description:
            'OBBLIGATORIO per CHAT_RESPONSE: analisi BREVE (TTS) basata su KENTU_GLOBAL_STATE.',
        },
        adviceMessage: {
          type: 'string',
          nullable: true,
          description: 'Alias opzionale di uiMessage per CHAT_RESPONSE.',
        },
        requiresConfirmation: {
          type: 'boolean',
          description: 'Per CHAT_RESPONSE / ASK_CLARIFICATION deve essere false.',
        },
      },
      required: ['commandType', 'payload'],
    };
  }
  if (commandHint === 'ASK_CLARIFICATION') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: { type: 'string', enum: ['ASK_CLARIFICATION'] },
        payload: askClarificationPayloadSchema,
        requiresConfirmation: {
          type: 'boolean',
          description: 'Per ASK_CLARIFICATION deve essere false.',
        },
      },
      required: ['commandType', 'payload'],
    };
  }
  if (commandHint === 'REQUEST_FOOD_PHOTO') {
    return {
      ...terminalCommandEnvelopeSchema,
      properties: {
        ...terminalCommandEnvelopeSchema.properties,
        commandType: { type: 'string', enum: ['REQUEST_FOOD_PHOTO'] },
        payload: requestFoodPhotoPayloadSchema,
        requiresConfirmation: {
          type: 'boolean',
          description: 'Per REQUEST_FOOD_PHOTO deve essere false.',
        },
      },
      required: ['commandType', 'payload'],
    };
  }
  return {
    ...terminalCommandEnvelopeSchema,
    properties: {
      ...terminalCommandEnvelopeSchema.properties,
      payload: {
        anyOf: [
          addFoodPayloadSchema,
          addWorkoutPayloadSchema,
          logSleepPayloadSchema,
          chatResponsePayloadSchema,
          askClarificationPayloadSchema,
          requestFoodPhotoPayloadSchema,
        ],
      },
    },
  };
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

REGOLA DI ROUTING CRITICA (ASSOLUTA): SE IL MESSAGGIO DELL'UTENTE CONTIENE VERBI COME "HO MANGIATO", "HO BEVUTO", "HO PRESO", "HO CONSUMATO", OPPURE ELENCA CIBI, INGREDIENTI O PASTI (COLAZIONE, SNACK, PRANZO, CENA) — ANCHE IN FORMA DISCORSIVA TIPO "COME SNACK, ALLE ORE 19:00, HO MANGIATO SARDINE..." — DEVI USARE ADD_FOOD (se chiaro) OPPURE ASK_CLARIFICATION (proposta maggiordomo) OPPURE REQUEST_FOOD_PHOTO (sconosciuto). È SEVERAMENTE VIETATO USARE CHAT_RESPONSE O FORNIRE RIASSUNTI DI STATO / CILINDRI / BUDGET QUANDO L'UTENTE DESCRIVE L'ASSUNZIONE DI CIBO. PRIORITÀ: DATA ENTRY, NON CHIACCHIERE.

CASO 1: [AZIONE - INSERIMENTO DATI]
L'utente dichiara un'azione compiuta o descrive cibo assunto (es. 'Ho mangiato una mela', 'come snack alle 19 ho mangiato sardine', 'Ho fatto 45 min di petto').
-> COMPORTAMENTO OBBLIGATORIO: Genera il JSON strutturato (ADD_FOOD / ADD_WORKOUT / LOG_SLEEP). Per ADD_FOOD lascia uiMessage e adviceMessage VUOTI. Non fare il consulente di stato.

CASO 1b: [WIZARD SEQUENZIALE — RISOLUZIONE DB-FIRST]
L'utente elenca uno o più alimenti OPPURE nomina un piatto (es. 'pane e pomodoro', 'ho mangiato yogurt', 'cotoletta', 'pasta al pomodoro').
-> COMPORTAMENTO: commandType ADD_FOOD con items[] già valorizzati seguendo la GERARCHIA DI RISOLUZIONE (vedi blocco dedicato):
0) PRIORITÀ 0 — [userRecentFoods]: variante specifica + OBBLIGO di applicare typicalGrams esatto (DIVIETO di sovrascrivere con 100g o altre stime). Solo se peso/marca espliciti diversi dall'utente.
1) PRIMA match esatto/semantico nel database Kentu ([USER_HABITS], DB personale, elenchi alimenti nel contesto) → UNA sola voce così com'è, SENZA scomporre.
2) SOLO se nessun match DB → fallback scomposizione 2-4 ingredienti base con grams medi (isEstimated:true).
- Input Analitico (ingredienti + grammi): mappa 1:1, isEstimated:false.
VIETATO domande di disambiguazione («Che tipo…?», «Quanti grammi?», «Quali ingredienti?»).
VIETATO scomporre un piatto che esiste nel database (es. «Cotoletta» presente nel DB → items[{foodName:"Cotoletta", …}], NON inventare pane/carne/olio).

ADATTIVE UI — payload.message (lavagna / nota vocale):
- Speed (ESPERTO, items.length >= 2): messaggio BREVE e conclusivo (es. «Aggiunti al carrello.»). Niente domande.
- Step-by-Step (ASSISTITO, items.length === 1): messaggio BREVE e interrogativo che invita ad aggiungere altro (es. «Bresaola aggiunta. Cos'altro hai mangiato?»).
VIETATO budget/cilindri/macro/nome proprio in payload.message.
CASO 1c: [FOLLOW-UP A CONFERMA / CORREZIONE — McDRIVE]
Se nel THREAD_RECENTE c'è una proposta maggiordomo / bozza da confermare e l'utente risponde:
- conferma («Sì», «Va bene», «Confermo») → il sistema usa CONFIRM_MEAL_DRAFT (non inventare un pasto nuovo).
- APPEND/REMOVE COMPLETO (OBBLIGATORIO): se l'utente chiede di aggiungere o togliere alimenti («aggiungi olio», «voglio aggiungere un cucchiaio d'olio», «metti anche 10g di olio», «togli il riso»), DEVI fondere (merge) le voci sull'array items[] della bozza esistente e restituire la bozza completa aggiornata. VIETATO domande intermedie, VIETATO «Dimmi la correzione…», VIETATO ripartire da zero.
- SOURCE OF TRUTH BOZZA ATTIVA: se nel contesto c'è [ACTIVE_PENDING_MEAL_DRAFT] o [EXISTING_MEAL_NODE], quegli items sono l'unica base. Preservali tutti e applica SOLO la mutazione richiesta. VIETATO sostituirli con alimenti presi dal THREAD_RECENTE / chatHistory (es. pasti precedenti «pollo e riso»).
- correzione completa («metti 80 grammi», «togli il pomodoro», «non era bauletto era rosetta», «aggiungi una mela») → UPDATE_MEAL_DRAFT sulla bozza esistente.
- MULTI-REPLACE (OBBLIGATORIO): se l'utente dà PIÙ sostituzioni/modifiche nella stessa frase (es. «al posto di A metti B, e al posto di X metti Y», «togli il pane e metti 80g di riso, e al posto della bresaola metti tacchino»), elabora TUTTE le mutazioni. Applica ogni replace/remove/add all'array items[] della bozza. VIETATO annullare l'operazione, troncare alla prima sostituzione, o ripartire da zero ignorando le altre.
- correzione PARZIALE (target senza valore: «voglio cambiare la quantità del pane», «cambia il tipo di pane») → il sistema chiederà una domanda mirata; NON generare istruzioni generiche tipo «Dimmi la correzione (es. metti 80g…)». Se l'utente ha già indicato l'alimento/valore da aggiungere o modificare, NON è parziale: applica subito.
-> Se sei costretto a produrre JSON: preferisci ASK_CLARIFICATION solo se manca tutto; altrimenti ADD_FOOD / UPDATE con items[] già corretti rispetto alla bozza precedente (dopo TUTTE le mutazioni richieste). VIETATO ricominciare da zero ignorando la bozza.

ANTI-STUTTER (riepilogo testuale): Quando generi payload.message / aiResponseText / messaggio di riepilogo, leggi SOLO l'array items[] FINALE già pulito. Elenca ogni alimento UNA sola volta. Se items.length = N, il testo deve nominare esattamente N alimenti distinti — VIETATO ripetere lo stesso alimento in coda alla frase o mischiare lista pre-edit + post-edit.

CASO 1d: [ALIMENTO SCONOSCIUTO — FOTO]
Se l'utente nomina un prodotto che non riconosci / non è in [USER_HABITS] né nel contesto DB e la confidenza è bassa (es. marchio nuovo, snack commerciale mai visto):
-> COMPORTAMENTO OBBLIGATORIO: commandType REQUEST_FOOD_PHOTO con payload { message: «Questo prodotto non credo di averlo in memoria. Puoi fargli una foto veloce all'etichetta o alla confezione?», foodName, options: ["📷 Scatta foto etichetta", "Te lo descrivo a parole"] }.
VIETATO forzare ricerche complesse o inventare schede nutrizionali.

CASO 2: [CONSULTO - DOMANDA SULLO STATO]
L'utente pone una domanda ESPLICITA sullo stato SENZA descrivere un pasto appena mangiato (es. 'Quante pro mi mancano?', 'Quanto cardio ho fatto?').
-> COMPORTAMENTO OBBLIGATORIO: commandType CHAT_RESPONSE. È VIETATO creare bozze pasto/workout. Analisi BREVE (1-3 frasi, TTS) su KENTU_GLOBAL_STATE.
-> ECCEZIONE: se nel messaggio c'è anche "ho mangiato" / elenco alimenti → vince SEMPRE CASO 1 / 1b / 1d.`;

/**
 * Food Wizard — Gerarchia di risoluzione (memoria abitudini → DB-first → scomposizione fallback).
 * Precompila items[] senza domande di disambiguazione.
 */
export const FOOD_WIZARD_MEAN_VALUE_DECOMPOSITION_BLOCK = `### FOOD WIZARD — GERARCHIA DI RISOLUZIONE (CHAIN OF THOUGHT, OBBLIGATORIA)
Prima di compilare payload.items[] esegui SEMPRE questo ragionamento in ordine. Non saltare i passi. Non fare domande di disambiguazione.

PRIORITÀ 0 — Memoria delle Abitudini:
Ti viene fornita una lista [userRecentFoods] (alias USER_RECENT_FOODS) con gli alimenti consumati di recente dall'utente (nome esatto DB + grammatura tipica).
Se l'utente usa un termine generico (es. 'quinoa', 'tonno') e nella lista recente esiste una variante specifica (es. 'quinoa cotti al vapore valfrutta 140 g'), DEVI assumere automaticamente che intenda quella specifica variante e quella precisa grammatura, a meno che l'utente non indichi esplicitamente un peso o una marca diversa.
→ foodName = nome esatto della variante recente; grams = typicalGrams della lista (copia numerica esatta del campo); isEstimated: false.
→ Se l'utente dice un peso diverso (es. '80g di quinoa'), tieni la variante specifica dal recente ma applica i grammi espliciti (isEstimated: false).
→ VIETATO ignorare [userRecentFoods] quando c'è un match semantico chiaro sul termine generico.

VINCOLO SULLE QUANTITÀ STORICHE (DIVIETO DI 100g): Quando associ un termine generico (es. 'quinoa') a un elemento specifico trovato nella lista [userRecentFoods], è ASSOLUTAMENTE OBBLIGATORIO estrarre e applicare il peso esatto indicato nel campo typicalGrams.
NESSUN DEFAULT: È severamente vietato inserire '100g' di default (o qualsiasi altro peso da tabella nutrizionale / porzione standard) su alimenti presenti nello storico. Se l'utente dice 'quinoa' e nello storico c'è 'quinoa cotti al vapore valfrutta' con typicalGrams: 140, l'output DEVE essere esattamente grams: 140 (NON 100).
Copiare solo il foodName dalla lista e lasciare grams=100 è un ERRORE GRAVE: i due campi vanno applicati INSIEME.
STIMA STANDARD COME EXTREMA RATIO: Usa stime generiche (come i classici 100g) ESCLUSIVAMENTE per alimenti del tutto nuovi di cui non esiste traccia nei recenti né nelle porzioni salvate, e per i quali l'utente non ha specificato il peso a voce.

Priorità 1 — Match nel Database (db Kentu):
Quando l'utente detta un alimento o un piatto (es. 'Cotoletta', 'Pasta al pomodoro', 'Carbonara'), e PRIORITÀ 0 non ha risolto, cerca una corrispondenza esatta o semantica nel database fornito nel contesto ([USER_HABITS], [USER_HABITS_FOR_CURRENT_MEAL], DB personale / elenchi alimenti Kentu nel prompt, porzioni abituali).
Se l'elemento esiste nel database (match esatto, sinonimo, o nome molto vicino), DEVI utilizzare quello.
→ Inseriscilo nel Wizard così com'è: UNA sola voce in items[] con foodName = nome DB (o termine parlato allineato al DB).
→ VIETATO scomporlo. VIETATO inventare ingredienti. VIETATO bypassare il DB per "arricchire" la ricetta.

Priorità 2 — Scomposizione (SOLO come Fallback):
SOLO SE né [userRecentFoods] né la ricerca nel database producono risultati credibili per il piatto/alimento nominato, allora consideralo un piatto generico sconosciuto.
→ Solo in quel caso scomponilo nei suoi 2-4 ingredienti fondamentali base (es. piatto sconosciuto tipo ricetta generica → ingredienti base).
→ Ogni ingrediente scomposto va in items[] separato. Adaptive UI: message Speed se items.length > 1.

Dicotomia input (dopo / insieme alla gerarchia):
- Input Analitico: ingredienti + grammature esplicite (es. '50g di pasta e 50g di passata') → mappa 1:1, grams esatti, isEstimated:false. Non inventare voci extra. Se un nome generico matcha [userRecentFoods], puoi comunque usare la variante specifica ma con i grammi dettati dall'utente.
- Input Generico: nome singolo di alimento/piatto → Priorità 0 → Priorità 1 → Priorità 2.

Gestione Grammature (ordine tassativo, senza saltare):
(1) Se match in [userRecentFoods] con typicalGrams → grams = typicalGrams ESATTO (isEstimated: false). DIVIETO assoluto di sostituirlo con 100g o altre stime.
(2) Altrimenti User_Portions_Dictionary / porzione storica → usa quel peso (isEstimated: false).
(3) STIMA STANDARD (es. 100g) SOLO come extrema ratio: alimento nuovo, assente da recenti e porzioni, senza peso detto dall'utente (isEstimated: true).
Marca isEstimated: false quando i grammi arrivano da recenti/porzioni memorizzate o dall'utente; isEstimated: true SOLO sulle stime standard inventate al passo (3).

Formato di Output: Restituisci items[] valorizzati (variante recente / match DB integro OPPURE, solo in fallback, ingredienti scomposti stimati) per precompilare il form del Wizard senza bloccare l'utente.`;

export class GeminiStructuredClient {
  constructor({ model = DEFAULT_MODEL } = {}) {
    this.model = model || DEFAULT_MODEL;
  }

  buildSystemInstruction(commandHint, { hasImages = false, displayName = '' } = {}) {
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
      buildChatPersonaSystemBlock({ displayName }),
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
        FOOD_WIZARD_MEAN_VALUE_DECOMPOSITION_BLOCK,
        "VINCOLO ADD_FOOD — ESTRAZIONE (CONTEGGIO VOCI): Per Input Analitico estrai SOLO gli alimenti ESPLICITAMENTE citati (N citati → ESATTAMENTE N voci). VIETATO aggiungere contorni/condimenti non menzionati. Per un singolo alimento/piatto nominato: Priorità 0 [userRecentFoods] → variante specifica + grams=typicalGrams obbligatorio (mai 100g di default); altrimenti Priorità 1 DB Kentu → UNA voce così com'è; Priorità 2 scomposizione SOLO se nessun match. VIETATO scomporre bypassando recenti/DB.",
        `ESEMPI DI ESTRAZIONE PASTI MULTIPLI (Input Analitico):
User: "Ho mangiato 90g di sardine all'olio e 160g di pane integrale"
Output Corretto per payload.items:
[
  { "foodName": "sardine all'olio", "grams": 90, "isEstimated": false, "searchKeywords": ["sardine all'olio", "sardina all'olio", "sardine"] },
  { "foodName": "pane integrale", "grams": 160, "isEstimated": false, "searchKeywords": ["pane integrale", "pane"] }
]
ESEMPIO PRIORITÀ 0 — MEMORIA ABITUDINI ([userRecentFoods]):
Contesto userRecentFoods include { foodName: "quinoa cotti al vapore valfrutta", typicalGrams: 140 }
User: "Ho mangiato la quinoa"
Output Corretto (grams DEVE essere 140 = typicalGrams; VIETATO 100):
[
  { "foodName": "quinoa cotti al vapore valfrutta", "grams": 140, "isEstimated": false, "searchKeywords": ["quinoa", "quinoa cotti al vapore valfrutta"] }
]
VIETATO (bias tabella 100g): { "foodName": "quinoa cotti al vapore valfrutta", "grams": 100 }
ESEMPIO PRIORITÀ 1 — MATCH DB (NON scomporre):
User: "Ho mangiato una cotoletta"  (e nel DB Kentu esiste «Cotoletta» / ricetta omonima; nessun match utile in userRecentFoods)
Output Corretto:
[
  { "foodName": "Cotoletta", "grams": 150, "isEstimated": true, "searchKeywords": ["cotoletta", "cotoletta di pollo", "cotoletta di vitello"] }
]
VIETATO inventare pane+carne+olio se il DB ha già Cotoletta.
ESEMPIO PRIORITÀ 2 — FALLBACK SCOMPOSIZIONE (solo se assente da recenti e DB):
User: "Ho mangiato xyz-ricetta-sconosciuta" (nessun match)
Output: 2-4 ingredienti base con grams medi e isEstimated:true.
REGOLA TASSATIVA: Il campo foodName (name) DEVE contenere SOLO il nome dell'alimento da cercare nel database. Rimuovi le congiunzioni (e, con, ed) e rimuovi le quantità dal nome. VIETATO: "e 160 g di pane integrale".`,
        "HARD CONSTRAINT — SANITIZZAZIONE NOMI: foodName = stringa pulita DB (es. \"pane integrale\"). NO grammi, NO congiunzioni.",
        "HARD CONSTRAINT — MAPPATURA GRAMMI 1:1: ogni alimento ha i PROPRI grammi. Mai copiare i grammi del primo sui successivi.",
        "HARD CONSTRAINT — NESSUNA DUPLICAZIONE DA CONGIUNZIONE: 'e'/'ed'/'con' separano alimenti, non entrano nel foodName.",
        "REGOLA ADD_FOOD (searchKeywords — ESPANSIONE SEMANTICA): Per ogni alimento estratto, genera searchKeywords[] con: (1) il termine esatto detto dall utente (o l'ingrediente scomposto in fallback); (2) l opposto singolare/plurale (noci→noce, mela→mele); (3) i sinonimi italiani piu comuni (cocomero→anguria, arachidi→noccioline, brioche→cornetto). Max 8 voci. foodName resta il termine primario / nome DB.",
        "MAGGIORDOMO — PROPOSTA DEL SOLITO (SOLO mono-alimento): se l'utente cita UN solo termine (es. «pane», «cotoletta») e in [USER_HABITS] / DB personale c'è una variante frequente, usa quella in foodName. Preferisci il match DB integro alla scomposizione. VIETATO «Che tipo di pane?». VIETATO inventare marchi non presenti nello storico. VIETATO scomporre se esiste match DB.",
        "REGOLA ADD_FOOD (multi-alimento): Se l'utente elenca PIU alimenti O hai applicato il fallback scomposizione (nessun match DB), estrai TUTTI in payload.items[] (uno per alimento). VIETATO menzionare grammi/varianti di piu alimenti in un unico messaggio di chat.",
        "REGOLA ADD_FOOD (orario): Se l'utente indica un orario esplicito (es. 'ore 14.45', 'alle 20:30'), estrailo in HH:mm in payload.timeString ed exactTime. Se NON indica orario, ometti exactTime — il sistema usera l'ora corrente.",
        "REGOLA ADD_FOOD (entity resolution): Per ogni alimento, compila foodName, searchKeywords e grams. NON inventare foodDbKey ne macronutrienti. Preferisci sempre il nome presente nel DB contesto.",
        "REGOLA ADD_FOOD (pasto gia consumato): Se l'utente descrive un pasto gia mangiato, risolvi OGNI alimento/piatto citato con la gerarchia DB-first (poi fallback scomposizione solo se necessario).",
        "REGOLA ADD_FOOD (isEstimated — STIMA UNITA/PEZZI/GRAMMI MANCANTI): PRIMA [userRecentFoods].typicalGrams se match (isEstimated: false; DIVIETO 100g). Poi User_Portions_Dictionary: se presente USA ESATTAMENTE quel peso (isEstimated: false). Medie standard / 100g (isEstimated: true) SOLO se assente da recenti e porzioni, oppure su ingredienti del fallback scomposizione Priorità 2.",
        "REGOLA ADD_FOOD (nessuna quantita + DIVIETO 100g): Senza grammi detti → (1) OBBLIGO grams = typicalGrams da [userRecentFoods] se match (mai 100 al posto di typicalGrams), (2) porzione storica/User_Portions, (3) stima standard (es. 100g) SOLO extrema ratio su alimento nuovo. Solo prodotti commerciali sconosciuti (marchio mai visto, non una ricetta/alimento DB/recente) → REQUEST_FOOD_PHOTO.",
        "REGOLA ADD_FOOD (FOLLOW-UP CONFERMA / UPDATE): Se THREAD_RECENTE mostra una proposta maggiordomo e l'utente conferma («Sì, va bene») o corregge, DEVI estrarre subito il carrello aggiornato. MULTI-REPLACE: se nella stessa frase ci sono più sostituzioni («al posto di A metti B, e al posto di X metti Y»), applica TUTTE le mutazioni a items[] — VIETATO annullare o fermarti alla prima. Vietato nuove domande aperte e vietato fallire il parsing.",
        "REGOLA ADD_FOOD (adviceMessage/uiMessage): Lascia VUOTI — il testo Adaptive UI va SOLO in payload.message.",
        "ADATTIVE UI — payload.message: Speed (items.length>=2) → frase breve conclusiva («Aggiunti al carrello.»). Step-by-Step (items.length===1) → conferma + domanda («Bresaola aggiunta. Cos'altro hai mangiato?»). VIETATO nome proprio utente. VIETATO «Che tipo di…?». VIETATO budget/cilindri/macro.",
        "ANTI-STUTTER — RIEPILOGO: payload.message / aiResponseText deve leggere SOLO items[] finale. Se la lista ha N elementi, nomina esattamente N alimenti — MAI ripetere lo stesso alimento due volte in coda alla frase.",
        "REGOLA REQUEST_FOOD_PHOTO: se un prodotto commerciale non è associabile (confidenza bassa, marchio nuovo) e non è risolvibile né come match DB né come ricetta scomponibile, usa REQUEST_FOOD_PHOTO. Message: «Questo prodotto non credo di averlo in memoria. Puoi fargli una foto veloce all'etichetta o alla confezione?»",
        "HARD CONSTRAINT — NO DUPLICATI IN items[]: se lo stesso alimento compare due volte (o con nome quasi identico), fondili in UNA sola voce sommando i grammi. Mai due righe uguali. Il testo di riepilogo non deve mai elencare duplicati residui.",
        MEAL_SMART_DEFAULTS_PROMPT_RULES,
        "REGOLA ADD_FOOD [USER_HABITS_FOR_CURRENT_MEAL] — GRAMMI E VARIANTI: Usa lo storico per match DB + grammatura abituale quando l utente non le ha specificate (isEstimated:true). NON aggiungere alimenti dalle abitudini se l utente non li ha menzionati. Se l utente nomina un piatto presente nello storico/DB, usalo integro (Priorità 1), non scomporlo.",
        "HARD CONSTRAINT — SILENZIO COPY SU ADD_FOOD: adviceMessage e uiMessage DEVONO essere vuoti. Solo payload.message Adaptive UI.",
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
        ? `Intent target FORZATO: ${fixedHint}. Per ADD_FOOD e VIETATO rispondere con CHAT_RESPONSE (usa ASK_CLARIFICATION se ambigua).`
        : 'Se l intent non e chiaro, classifica CASO 1 / 1b / 2. Cibo chiaro → ADD_FOOD. Cibo ambiguo → ASK_CLARIFICATION. Solo domande pure di stato → CHAT_RESPONSE.',
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
    const threadSnippet = buildRecentThreadSnippetForPrompt(chatHistory, 4);
    const systemTimeCtx = formatCurrentSystemTimeContext();
    const userPromptText =
      normalizedUserText ||
      (imageParts.length > 0
        ? 'Analizza lo screenshot allegato (app fitness/sonno in italiano, es. Xiaomi Fitness) ed estrai durata sonno, fase Profondo e punteggio punti per LOG_SLEEP.'
        : '');
    const displayName = asTrimmedString(
      contextBundle?.contextSlices?.KENTU_GLOBAL_STATE?.User_Profile?.displayName
      || contextBundle?.userDisplayName
      || '',
    );
    const systemInstruction = appendKentuGlobalStateToSystemInstruction(
      this.buildSystemInstruction(commandHint, {
        hasImages: imageParts.length > 0,
        displayName,
      }),
      contextBundle?.kentuGlobalStateText
        || (contextBundle?.contextSlices?.KENTU_GLOBAL_STATE
          ? JSON.stringify(contextBundle.contextSlices.KENTU_GLOBAL_STATE, null, 2)
          : ''),
    );
    const userPrompt = [
      systemTimeCtx.header,
      threadSnippet || null,
      `Richiesta utente: ${userPromptText}`,
      `Contesto modulare: ${JSON.stringify(contextBundle?.contextSlices || {})}`,
      asTrimmedString(commandHint).toUpperCase() === 'ADD_FOOD'
        ? 'Registrazione pasto: ADD_FOOD. Chain of Thought: (0) [userRecentFoods] variante + grams=typicalGrams ESATTO (DIVIETO 100g al posto dello storico); (1) match DB Kentu senza scomporre; (2) solo se nessun match → fallback scomposizione. Grammi mancanti → recenti → porzioni → stima 100g solo extrema ratio. Mai domande di disambiguazione. UPDATE multi-replace: applica TUTTE le sostituzioni nella stessa frase a items[]. Anti-stutter: payload.message legge solo items[] finale, N alimenti = N nomi senza ripetizioni. Adaptive UI: Speed (multi) «Aggiunti al carrello.»; Step-by-Step (mono) conferma + «Cos\'altro hai mangiato?». adviceMessage/uiMessage VUOTI.'
        : null,
      asTrimmedString(commandHint).toUpperCase() === 'ADD_WORKOUT'
        ? 'Registrazione allenamento context-aware: contesto modulare include [USER_WORKOUT_HABITS]. payload.workoutType OBBLIGATORIO (spinta|trazione|gambe|cardio|altro). Sessione generica senza esercizi citati → exercises=[] ok. durationMinutes solo se esplicita. OBBLIGATORIO: se l utente usa un termine generico e [USER_WORKOUT_HABITS] ha la variante abituale, restituisci il nome completo in exerciseName (SMART RESOLUTION). Vietato aggiungere riscaldamento, defaticamento o esercizi extra non citati. Se la richiesta e un CONSULTO/domanda sullo stato (CASO 2), usa commandType CHAT_RESPONSE invece di ADD_WORKOUT. Se ambigua → ASK_CLARIFICATION.'
        : null,
      asTrimmedString(commandHint).toUpperCase() === 'CHAT_RESPONSE'
        ? 'CASO 2 CONSULTO: commandType CHAT_RESPONSE (o ASK_CLARIFICATION se serve una scelta). Compila uiMessage breve TTS (1-3 frasi) basata SOLO su KENTU_GLOBAL_STATE. requiresConfirmation=false. VIETATO creare payload ADD_FOOD/ADD_WORKOUT o bozze.'
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
