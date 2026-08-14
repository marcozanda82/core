/**
 * Registro caffè — fuori dal DB alimenti (USDA/locale).
 * Biforcazione Amaro (0 kcal, digiuno OK) vs Zuccherato (+20 kcal, +5g CHO, rompe digiuno).
 */

export const COFFEE_VARIANT = Object.freeze({
  AMARO: 'amaro',
  ZUCCHERATO: 'zuccherato',
});

export const SWEET_COFFEE_KCAL = 20;
export const SWEET_COFFEE_CARB = 5;
export const MIN_FASTING_HOURS_FOR_COFFEE_RULES = 8;

export const COFFEE_VARIANT_QUICK_REPLIES = Object.freeze([
  '☕ Amaro',
  '☕ Zuccherato (+20 kcal)',
]);

const COFFEE_ONLY_RE = /\b(?:caff[eè]|espresso|caffett(?:o|a)|coffee)\b/i;
const COFFEE_LOG_VERB_RE = /\b(?:ho\s+)?(?:pres[oa]|bevut[oa]|fatto|preso)\b/i;
const NON_PURE_COFFEE_RE = /\b(?:cappuccino|macchiato|latte|milk|cornetto|brioche|zucchero|miele|cioccolat)\b/i;

/**
 * @param {string} userText
 * @returns {boolean}
 */
export function isCoffeeLogIntent(userText) {
  const text = String(userText || '').trim();
  if (!text || !COFFEE_ONLY_RE.test(text)) return false;
  if (NON_PURE_COFFEE_RE.test(text)) return false;
  if (COFFEE_LOG_VERB_RE.test(text)) return true;
  if (/^(?:un\s+)?caff[eè]\s*[.!?]*$/i.test(text)) return true;
  if (/^caff[eè]\s*(?:amaro|zuccherato)\b/i.test(text)) return true;
  return COFFEE_VARIANT_QUICK_REPLIES.some((label) => text === label);
}

/**
 * @param {string} userText
 * @returns {'amaro' | 'zuccherato' | null}
 */
export function resolveCoffeeVariantFromText(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return null;

  if (
    /\bamaro\b/.test(text)
    || /\bsenza\s+zucchero\b/.test(text)
    || /\bn\s*black\b/.test(text)
    || text.includes('☕ amaro')
    || text === 'amaro'
  ) {
    return COFFEE_VARIANT.AMARO;
  }

  if (
    /\bzuccherat/.test(text)
    || /\bcon\s+(?:lo\s+)?zucchero\b/.test(text)
    || /\bdolce\b/.test(text)
    || text.includes('zuccherato')
    || text.includes('☕ zuccherato')
  ) {
    return COFFEE_VARIANT.ZUCCHERATO;
  }

  return null;
}

/**
 * @param {number | null | undefined} hoursFasted
 * @returns {boolean}
 */
export function isInActiveFastingWindow(hoursFasted) {
  const h = Number(hoursFasted);
  return Number.isFinite(h) && h >= MIN_FASTING_HOURS_FOR_COFFEE_RULES;
}

/**
 * True se uno stimolante (es. caffè zuccherato) interrompe il digiuno.
 * Caffè amaro / breaksFast:false / 0 kcal → false.
 * @param {object | null | undefined} node
 * @returns {boolean}
 */
export function isStimulantFastingBreaker(node) {
  if (!node || typeof node !== 'object') return false;
  if (String(node.type || '').toLowerCase() !== 'stimulant') return false;
  if (node.breaksFast === false) return false;
  if (node.breaksFast === true) return true;
  if (node.coffeeVariant === COFFEE_VARIANT.AMARO) return false;
  if (node.coffeeVariant === COFFEE_VARIANT.ZUCCHERATO) return true;
  const kcal = Number(node.kcal) || 0;
  const carb = Number(node.carb) || 0;
  return kcal > 10 || carb > 1;
}

/**
 * Bevande/stimolanti che non rompono il digiuno (acqua, caffè amaro, tè senza zucchero).
 * @param {object | null | undefined} node
 * @returns {boolean}
 */
export function isZeroCalorieFastSafeNode(node) {
  if (!node || typeof node !== 'object') return false;
  const type = String(node.type || '').toLowerCase();
  if (type === 'water') return true;
  if (type === 'stimulant') return !isStimulantFastingBreaker(node);
  return false;
}

/**
 * Contesto digiuno esplicito per prompt LLM (Kentu Global State).
 * @param {{
 *   hoursFasted?: number | null,
 *   manualNodes?: Array<object>,
 *   fastingBrokenBySweetCoffee?: boolean,
 *   bitterCoffeeDuringFast?: boolean,
 *   phaseName?: string | null,
 * }} [params]
 */
export function buildFastingContextForLlm(params = {}) {
  const hoursFasted = Number(params.hoursFasted);
  const inActiveWindow = isInActiveFastingWindow(hoursFasted);
  const brokenBySweet = Boolean(params.fastingBrokenBySweetCoffee);
  const bitterDuringFast = Boolean(params.bitterCoffeeDuringFast);
  const isFasting = inActiveWindow && !brokenBySweet;

  let aiGuidance = 'Nessuna finestra di digiuno attiva rilevata.';
  if (brokenBySweet) {
    aiGuidance = 'Digiuno INTERROTTO da caffè zuccherato (+kcal/+CHO). Segnalalo all\'utente.';
  } else if (bitterDuringFast || (isFasting && (params.manualNodes || []).some(
    (n) => n?.type === 'stimulant'
      && String(n?.subtype || '').toLowerCase() === 'caffè'
      && n?.coffeeVariant === COFFEE_VARIANT.AMARO,
  ))) {
    aiGuidance =
      'Utente ANCORA A DIGIUNO: ha registrato caffè amaro (0 kcal, breaksFast=false). '
      + 'NON dire che il digiuno è interrotto — lodalo per la scelta.';
  } else if (isFasting) {
    aiGuidance = 'Utente in finestra di digiuno attiva. Bevande zero-calorie non interrompono il timer.';
  }

  return {
    isFasting,
    hoursFasted: Number.isFinite(hoursFasted) ? Math.round(hoursFasted * 10) / 10 : null,
    fastingDurationHours: Number.isFinite(hoursFasted) ? Math.round(hoursFasted * 10) / 10 : null,
    inActiveFastingWindow: inActiveWindow,
    brokenBySweetCoffee: brokenBySweet,
    bitterCoffeeDuringFast: bitterDuringFast,
    phaseName: params.phaseName || null,
    aiGuidance,
  };
}

/**
 * @param {'amaro' | 'zuccherato'} variant
 * @param {number} [timeDecimal] ore decimali 0–24
 * @param {{ id?: string }} [options]
 * @returns {object}
 */
export function buildCoffeeStimulantNode(variant, timeDecimal, options = {}) {
  const coffeeVariant = variant === COFFEE_VARIANT.ZUCCHERATO
    ? COFFEE_VARIANT.ZUCCHERATO
    : COFFEE_VARIANT.AMARO;
  const time = Number.isFinite(Number(timeDecimal)) ? Number(timeDecimal) : 8;
  const isSweet = coffeeVariant === COFFEE_VARIANT.ZUCCHERATO;

  return {
    id: String(options.id || `stimulant_${Date.now()}`),
    type: 'stimulant',
    subtype: 'caffè',
    coffeeVariant,
    breaksFast: isSweet,
    kcal: isSweet ? SWEET_COFFEE_KCAL : 0,
    carb: isSweet ? SWEET_COFFEE_CARB : 0,
    time,
    label: isSweet ? 'Caffè zuccherato' : 'Caffè amaro',
  };
}

/**
 * @param {Array<object>} manualNodes
 * @returns {{ kcal: number, carb: number }}
 */
export function sumSweetCoffeeMacros(manualNodes = []) {
  let kcal = 0;
  let carb = 0;
  for (const node of manualNodes || []) {
    if (node?.type !== 'stimulant') continue;
    if (String(node?.subtype || '').toLowerCase() !== 'caffè') continue;
    if (node?.coffeeVariant !== COFFEE_VARIANT.ZUCCHERATO && !node?.breaksFast) continue;
    kcal += Number(node?.kcal) || SWEET_COFFEE_KCAL;
    carb += Number(node?.carb) || SWEET_COFFEE_CARB;
  }
  return { kcal, carb };
}

/**
 * @param {Array<object>} manualNodes
 * @param {number | null | undefined} currentHoursFasted
 * @returns {{
 *   fastingBrokenBySweetCoffee: boolean,
 *   bitterCoffeeDuringFast: boolean,
 *   sweetCoffeeCount: number,
 *   bitterCoffeeCount: number,
 * }}
 */
export function analyzeCoffeeForHealthScore(manualNodes = [], currentHoursFasted = null) {
  const todayCoffee = (manualNodes || []).filter(
    (n) => n?.type === 'stimulant' && String(n?.subtype || '').toLowerCase() === 'caffè',
  );

  let fastingBrokenBySweetCoffee = false;
  let bitterCoffeeDuringFast = false;
  let sweetCoffeeCount = 0;
  let bitterCoffeeCount = 0;

  for (const node of todayCoffee) {
    const variant = node?.coffeeVariant === COFFEE_VARIANT.ZUCCHERATO
      || node?.breaksFast === true
      ? COFFEE_VARIANT.ZUCCHERATO
      : COFFEE_VARIANT.AMARO;

    if (variant === COFFEE_VARIANT.ZUCCHERATO) {
      sweetCoffeeCount += 1;
      if (isInActiveFastingWindow(currentHoursFasted)) {
        fastingBrokenBySweetCoffee = true;
      }
    } else {
      bitterCoffeeCount += 1;
      if (isInActiveFastingWindow(currentHoursFasted)) {
        bitterCoffeeDuringFast = true;
      }
    }
  }

  return {
    fastingBrokenBySweetCoffee,
    bitterCoffeeDuringFast,
    sweetCoffeeCount,
    bitterCoffeeCount,
  };
}

/**
 * @param {'amaro' | 'zuccherato'} variant
 * @param {{ hoursFasted?: number | null, inFastingWindow?: boolean }} [context]
 * @returns {string}
 */
export function buildCoffeeLogAckMessage(variant, context = {}) {
  const inFast = context.inFastingWindow ?? isInActiveFastingWindow(context.hoursFasted);
  if (variant === COFFEE_VARIANT.ZUCCHERATO) {
    if (inFast) {
      return `☕ Caffè zuccherato registrato (+${SWEET_COFFEE_KCAL} kcal, +${SWEET_COFFEE_CARB}g CHO). Attenzione: hai interrotto la finestra di digiuno.`;
    }
    return `☕ Caffè zuccherato registrato (+${SWEET_COFFEE_KCAL} kcal, +${SWEET_COFFEE_CARB}g CHO).`;
  }
  if (inFast) {
    return '☕ Caffè amaro registrato (0 kcal). Ottima scelta: il digiuno resta attivo.';
  }
  return '☕ Caffè amaro registrato (0 kcal).';
}

/**
 * True se l'ultimo messaggio AI chiedeva la variante caffè.
 * @param {Array<object>} chatHistory
 */
export function isAwaitingCoffeeVariantReply(chatHistory = []) {
  for (let i = chatHistory.length - 1; i >= 0; i -= 1) {
    const msg = chatHistory[i];
    if (!msg || msg.isTyping) continue;
    if (msg.sender === 'user') return false;
    if (msg.clarification === true && Array.isArray(msg.quickReplies)) {
      return msg.quickReplies.some((r) => /amaro|zuccherato/i.test(String(r)));
    }
    return false;
  }
  return false;
}

export default {
  COFFEE_VARIANT,
  COFFEE_VARIANT_QUICK_REPLIES,
  SWEET_COFFEE_KCAL,
  SWEET_COFFEE_CARB,
  isCoffeeLogIntent,
  resolveCoffeeVariantFromText,
  isInActiveFastingWindow,
  isStimulantFastingBreaker,
  isZeroCalorieFastSafeNode,
  buildFastingContextForLlm,
  buildCoffeeStimulantNode,
  sumSweetCoffeeMacros,
  analyzeCoffeeForHealthScore,
  buildCoffeeLogAckMessage,
  isAwaitingCoffeeVariantReply,
};
