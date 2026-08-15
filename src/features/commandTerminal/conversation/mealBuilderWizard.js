/**
 * @deprecated Wizard passo-passo «Guidami» (base/proteina/extra) dismesso.
 * L'ingresso Guidami / START_MEAL_BUILDER_WIZARD viene dirottato su McDrive
 * (LiveMealTray + pendingMcDriveDraft). Le funzioni sotto restano solo per
 * compatibilità / eventuale ripristino; non devono più gestire il flusso live.
 */

import { parseMealTypeFromUserText, parseGramsFromUserText, expandFoodPayloadItems } from './conversationState.js';
import { parseConsumedMealFromNaturalText } from './mealLogIntent.js';
import { fastPathResolveFoodItem } from './fastPathMealResolve.js';
import { getCurrentTimeSlot } from '../../mealBuilder/utils/timeSlotUtils.js';

export const MEAL_BUILDER_STEPS = Object.freeze(['base', 'protein', 'extra', 'confirm']);

const SKIP_RE = /^(?:salto|skip|no|niente|nulla|passo|avanti)\b/i;
const CONFIRM_RE = /^(?:s[iì]|ok|confermo|va\s+bene|registra|salva)\b/i;
const CANCEL_RE = /^(?:annulla|cancel|stop|esci|abbandona)\b/i;

const STEP_CHIPS = Object.freeze({
  base: ['Pasta', 'Riso', 'Pane', 'Patate', 'Salto questo step'],
  protein: ['Pollo', 'Tonno', 'Uova', 'Legumi', 'Salto questo step'],
  extra: ['Verdura', 'Insalata', 'Olio EVO', 'Salto questo step'],
  confirm: ['Sì, registra', 'Annulla'],
});

/**
 * @param {{ mealType?: string|null, step?: string, items?: object[] }} [seed]
 * @returns {{ mealType: string, step: string, items: object[], startedAt: number }}
 */
export function createMealBuilderWizardState(seed = {}) {
  const mealType = String(seed.mealType || 'pranzo').trim().toLowerCase() || 'pranzo';
  const step = MEAL_BUILDER_STEPS.includes(seed.step) ? seed.step : 'base';
  return {
    mealType,
    step,
    items: Array.isArray(seed.items) ? seed.items.map((i) => ({ ...i })) : [],
    startedAt: seed.startedAt || Date.now(),
  };
}

/**
 * @param {string} userText
 * @param {object} [currentState]
 * @returns {string}
 */
export function inferMealTypeForMealBuilder(userText, currentState = {}) {
  const fromText = parseMealTypeFromUserText(userText);
  if (fromText) return fromText;
  const slot = getCurrentTimeSlot();
  if (slot?.mealType) return slot.mealType;
  return String(currentState?.nutrition?.currentMealType || 'pranzo').trim().toLowerCase() || 'pranzo';
}

/**
 * @param {string} userText
 * @returns {boolean}
 */
export function isMealBuilderWizardTrigger(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  return (
    /\bguidami\b/i.test(text)
    || /\binserimento\s+guidato\b/i.test(text)
    || /\bcostruiamo\s+(?:il\s+|un\s+)?(?:pranzo|cena|colazione|pasto|snack)\b/i.test(text)
    || /\b(?:compiliamo|costruiamo)\s+.*\bmacro\b/i.test(text)
  );
}

/**
 * @param {string} userText
 * @returns {boolean}
 */
export function isMealBuilderWizardAbortCommand(userText) {
  return CANCEL_RE.test(String(userText || '').trim());
}

/**
 * @param {string} userText
 * @returns {boolean}
 */
export function isUnrelatedCommandDuringMealBuilder(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  if (isMealBuilderWizardAbortCommand(text)) return true;
  if (/\b(?:peso|pesata)\s+\d+/i.test(text) || /\d+(?:[.,]\d+)?\s*kg\b/i.test(text)) return true;
  if (/\b(?:allenament|workout|corri|corsa|palestra|sollevamento)\b/i.test(text)) return true;
  if (/\b(?:glicem|resoconto|fammi\s+il\s+resoconto)\b/i.test(text)) return true;
  // Nuova registrazione pasto completa → esci dal wizard e processa normalmente.
  if (/\b(?:ho\s+)?(?:mangiat|consumat|assunt|bevut)\w*\b/i.test(text)) return true;
  return false;
}

function stepLabel(step) {
  switch (step) {
    case 'base': return 'base carboidrati';
    case 'protein': return 'proteina';
    case 'extra': return 'extra (verdura/grassi)';
    default: return 'pasto';
  }
}

/**
 * @param {object} state
 * @returns {{ text: string, quickReplies: string[], mealWizard: true, mealWizardPhase: string }}
 */
export function buildMealBuilderStepPrompt(state) {
  const mealLabel = String(state?.mealType || 'pasto');
  const step = String(state?.step || 'base');

  if (step === 'confirm') {
    const names = (state.items || [])
      .map((i) => String(i?.spokenFoodName || i?.foodName || '').trim())
      .filter(Boolean);
    const list = names.length > 0 ? names.join(', ') : 'nessun alimento';
    return {
      text: `Ecco il ${mealLabel} che abbiamo composto: ${list}. Confermi il salvataggio?`,
      quickReplies: [...STEP_CHIPS.confirm],
      mealWizard: true,
      mealWizardPhase: 'confirm',
    };
  }

  const prompts = {
    base: `Perfetto, costruiamo il ${mealLabel}. Partiamo dalla base: quale carboidrato preferisci?`,
    protein: `Ottimo. Ora la proteina: cosa mettiamo?`,
    extra: `Ultimo tocco: verdura o grassi buoni? (puoi anche saltare)`,
  };

  return {
    text: prompts[step] || `Scegli un alimento per la ${stepLabel(step)}.`,
    quickReplies: [...(STEP_CHIPS[step] || [])],
    mealWizard: true,
    mealWizardPhase: step,
  };
}

/**
 * @param {string} step
 * @param {string} userText
 * @param {object|null} selection
 * @returns {{ skip?: boolean, confirm?: boolean, cancel?: boolean, foodName?: string, grams?: number|null }}
 */
export function parseMealBuilderStepInput(step, userText, selection = null) {
  const text = String(userText || '').trim();
  if (CANCEL_RE.test(text)) return { cancel: true };
  if (step === 'confirm') {
    if (CONFIRM_RE.test(text)) return { confirm: true };
    if (CANCEL_RE.test(text)) return { cancel: true };
    return {};
  }

  if (selection?.foodName) {
    const grams = Number(selection.grams);
    return {
      foodName: String(selection.foodName).trim(),
      grams: Number.isFinite(grams) && grams > 0 ? Math.round(grams) : null,
    };
  }

  if (SKIP_RE.test(text) || /^salto\s+questo\s+step$/i.test(text)) {
    return { skip: true };
  }

  const parsed = parseConsumedMealFromNaturalText(text);
  if (parsed?.items?.length) {
    const first = parsed.items[0];
    return {
      foodName: String(first.foodName || '').trim(),
      grams: Number.isFinite(Number(first.grams)) ? Math.round(Number(first.grams)) : null,
    };
  }

  const grams = parseGramsFromUserText(text);
  const bare = text
    .replace(/\d+(?:[.,]\d+)?\s*(?:g|grammi|gr)\b/gi, '')
    .replace(/^(?:metti|prendo|scelgo|voglio)\s+/i, '')
    .trim();

  if (bare && bare.length <= 60) {
    return { foodName: bare, grams: grams ?? null };
  }

  return {};
}

/**
 * @param {object} state
 * @param {{ foodName: string, grams?: number|null }} itemInput
 * @param {object} ctx
 * @returns {object}
 */
export function appendItemToMealBuilderDraft(state, itemInput, ctx = {}) {
  const resolved = fastPathResolveFoodItem(
    {
      foodName: itemInput.foodName,
      spokenFoodName: itemInput.foodName,
      grams: itemInput.grams ?? undefined,
    },
    ctx,
  );
  if (!resolved) return state;

  return {
    ...state,
    items: [...(state.items || []), resolved],
  };
}

/**
 * @param {object} state
 * @returns {object}
 */
export function advanceMealBuilderStep(state) {
  const idx = MEAL_BUILDER_STEPS.indexOf(state.step);
  const nextStep = idx >= 0 && idx < MEAL_BUILDER_STEPS.length - 1
    ? MEAL_BUILDER_STEPS[idx + 1]
    : 'confirm';
  return { ...state, step: nextStep };
}

/**
 * @param {object} state
 * @returns {object}
 */
export function buildMealBuilderFinalPayload(state) {
  return {
    mealType: state.mealType || null,
    items: expandFoodPayloadItems({ items: state.items || [] }),
  };
}
