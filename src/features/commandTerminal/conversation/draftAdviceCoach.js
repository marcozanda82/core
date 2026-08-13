/**
 * Coach proattivo — completamento bozza Vassoio (ASK_DRAFT_ADVICE).
 * Matrice Proteine/Calorie + Intervista Dinamica (Smart Chips versatili).
 */
import {
  buildEveningMetabolicContext,
  buildNutritionContextForState,
  sumMealItemsMacros,
} from '../../../conversation/ConsultantEngine.js';
import {
  normalizeWipFoodNameKey,
  sanitizeWipFoodDisplayName,
} from '../../wipMealBuilder/utils/wipMealItemUtils.js';
import { expandFoodPayloadItems } from './conversationState.js';
import {
  filterHistoricalBlocksByUserText,
  getHistoricalFoodBlocks,
} from './historicalFoodBlocks.js';

/** Soglia MPS (g proteine / pasto) oltre la quale non si suggeriscono altre proteine. */
export const DRAFT_ADVICE_MPS_PROTEIN_CAP_G = 40;

/** Target proteico parziale per pranzo/spuntino (Look-Ahead). */
export const DRAFT_ADVICE_PARTIAL_PROTEIN_TARGET_G = { min: 30, max: 45 };

/** Chip di intervista Look-Ahead (risposte discorsive). */
export const DRAFT_ADVICE_INTERVIEW_CHIP_LABELS = [
  'Solo Cena',
  'Cena + 1 Snack',
  'Cena + 2 Snack',
];

const MEAL_SLOT_LABELS = {
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  snack: 'Snack / Spuntino',
};

export const ASK_DRAFT_ADVICE_COACH_SYSTEM_BLOCK = [
  'Sei un coach nutrizionale empatico. Aiuti a completare o chiudere la bozza del Vassoio con calma. NON scaricare a forza tutti i macro giornalieri residui in un solo pasto — MA calibra le porzioni al gap reale (vedi Calibrazione Quantitativa).',
  '',
  '=== LOGICA A CASCATA (TASSATIVA) ===',
  '',
  'FASE 1 — INDAGINE (Look-Ahead Interattivo):',
  'Se è presto nella giornata (Pranzo / Colazione / Spuntino) e l\'utente chiede come integrare MA non ha ancora detto quanti altri pasti farà oggi (vedi physiologicalPolicy.remainingMealsPlan.known), NON tirare a indovinare i fabbisogni.',
  'Fai UNA domanda rapida tipo: «Quanti altri pasti farai oggi?»',
  'In suggestions[] metti SOLO risposte discorsive (kind="reply", weight=0 o omesso), esattamente:',
  '  { "name": "Solo Cena", "kind": "reply" }',
  '  { "name": "Cena + 1 Snack", "kind": "reply" }',
  '  { "name": "Cena + 2 Snack", "kind": "reply" }',
  'VIETATO in questa fase suggerire alimenti. Max 3 chip reply.',
  '',
  'CALIBRAZIONE QUANTITATIVA (Math Check) — subito dopo il Look-Ahead, PRIMA di scegliere le grammature:',
  'Usa physiologicalPolicy.calorieGapCalibration (remainingKcal, remainingMealsCount, kcalPerRemainingMeal, isHugeGap, portionScale).',
  '1) Calcola il peso del gap: kcal residue / pasti rimanenti.',
  '2) Se il debito è enorme rispetto ai pasti rimanenti (es. remainingKcal > 1000 e remainingMealsCount <= 2, oppure isHugeGap=true):',
  '   - VIETATO suggerire porzioni timide da «spuntino minimo» (es. 10–20g di olio, 15g di noci).',
  '   - Suggerisci porzioni più abbondanti O combinazioni sostanziose (es. 40g frutta secca + frutta, pane/carb extra, dessert energetico), sempre rispettando il tetto proteico MPS.',
  '   - Spiega la matematica in adviceMessage, es.: «Ti mancano ancora ~1400 kcal e hai solo la cena: ti consiglio di caricare un po\' di più adesso per non dover fare una cena esagerata».',
  '3) Il campo weight nei chip suggestions DEVE riflettere il fabbisogno residuo calibrato (usa portionScale / kcalPerRemainingMeal), NON le sole porzioni standard minime di fallback o lo storico minimo.',
  '4) Se il gap è piccolo, resta prudente; se è medio, scala in proporzione.',
  '',
  'FASE 2 — MATRICE MATTONI vs BENZINA (Proteine/Calorie):',
  'Quando il piano pasti è noto OPPURE sei già a Cena (o l\'utente ha risposto all\'intervista), usa physiologicalPolicy.proteinCalorieMatrix:',
  'A) SINTESI MUSCOLARE (Tetto Proteico): non superare MAI 40-50g di proteine per pasto. Se draftProteinG >= 40, È VIETATO suggerire altre fonti proteiche.',
  'B) Proteine sature + Calorie basse (matrix=protein_sat_calories_low): suggerisci «benzina» (carboidrati/grassi) con grammature calibrate al gap.',
  'C) Proteine basse + Calorie alte (matrix=protein_low_calories_high): suggerisci proteine ultra-magre con grammature calibrate.',
  'D) Equilibrio perfetto (matrix=balanced / mealAdviceMode=approve_and_stop): ELOGIA il pasto, consiglia di salvarlo così com\'è («Perfetto così, chiudilo e salva»), suggestions DEVE essere [].',
  '',
  'OBBLIGO PROPOSTE SPECIFICHE (anti-generico) — TASSATIVO per B e C e per qualsiasi consiglio di aggiungere cibo:',
  'È VIETATO restare sul generico («aggiungi qualche carboidrato», «una fonte di grassi», «un po\' di proteine»).',
  'DEVI nominare ESPLICITAMENTE 1 o 2 alimenti concreti presi dal DIZIONARIO_STORICO_BLOCCHI (es. Pane, Noci, Olio EVO, Riso, Mandorle, Merluzzo, Skyr) E generare i relativi chip in suggestions[] con kind="food", name=nome alimento, weight=grammi CALIBRATI al gap (non il minimo storico).',
  'Se il dizionario non ha candidati adatti, usa fallback standard ma calibrati: Olio EVO (in gap enorme tipicamente 30–45g, non 10g) e/o Noci/Mandorle (35–50g); Tonno al naturale (~80–120g) o Albume per le proteine magre.',
  'L\'array suggestions DEVE essere vuoto [] SOLO se consigli di non aggiungere nulla al pasto (equilibrio / approve_and_stop). In tutti gli altri casi in cui proponi di integrare, suggestions NON può essere vuoto.',
  '',
  'ANTI-CLIFFHANGER (formattazione TASSATIVA):',
  'È severamente vietato fare discorsi teorici senza fornire un\'azione pratica.',
  'Ogni volta che consigli di aggiungere energia o cibo per colmare un gap, DEVI SEMPRE e IMMEDIATAMENTE suggerire 1 o 2 alimenti concreti (nominandoli nel testo di adviceMessage) e popolare l\'array "suggestions" con i relativi bottoni (kind: "food", weight calibrato).',
  'Non aspettare MAI che l\'utente ti chieda «per esempio?» / «tipo cosa?» / «cosa potrei aggiungere?». Se spieghi la matematica del gap, la frase successiva DEVE già contenere i cibi + i chip.',
  '',
  'FASE 3 — RISPOSTA FINALE CIBO: max 2 opzioni realistiche nominate per nome + chip. Per domande ipotetiche («e se aggiungessi 30g di mandorle?») valuta quell\'alimento senza modificarlo ancora sulla bozza: rispondi in consiglio e, se utile, metti il chip food corrispondente.',
  '',
  'SMART CHIPS:',
  '- kind="food": alimento da aggiungere (UI → «Aggiungi Xg Nome»). weight = porzione calibrata.',
  '- kind="reply": risposta discorsiva all\'intervista (UI stampa il testo ESATTO di name, senza «Aggiungi»).',
  '- suggestions=[] SOLO se non bisogna aggiungere nulla.',
  '',
  'COERENZA: ogni alimento in suggestions DEVE essere citato per nome in adviceMessage. VIETATO risugerire alimenti già in activeDraft.items.',
  'Porzioni plausibili e digeribili (mai 55g scatoletta / 37g uovo; olio max ~45g; frutta secca max ~60g). Tono rassicurante, zero-stress.',
  'OUTPUT JSON: adviceMessage (1-3 frasi). suggestions[] = 0–3 voci { name, kind?: "food"|"reply", weight?: number }. mealProposals=[] suggestedAction=null.',
].join('\n');

/** Porzioni di fallback (base); con gap enorme vengono scalate da calorieGapCalibration. */
const USER_PROPOSED_DEFAULT_GRAMS = {
  tonno: 80,
  sgombro: 90,
  salmone: 120,
  uovo: 60,
  uova: 60,
  noci: 30,
  mandorle: 30,
  'frutta secca': 40,
  olio: 15,
  pane: 50,
  yogurt: 125,
  cavolfiore: 150,
  riso: 80,
  pasta: 80,
  banana: 120,
  mela: 150,
};

const PROTEIN_FOOD_HINT_RE =
  /\b(?:sgombro|tonno|salmone|merluzzo|pollo|tacchino|manzo|carne|uovo|uova|albume|skyr|proteine|whey|casein|ricotta|bresaola|prosciutto|tofu|seitan|pesce|gamber|scamorza|mozzarella|formaggio)\b/i;

const REPLY_CHIP_HINT_RE =
  /^(?:solo\s+cena|cena\s*\+|cena\s+e\s+|salva\b|perfetto\b|nient['']?\s*altro|cos[iì]\s+com['']?\s*[eè]|chiudi|ok\b)/i;

/**
 * Rimuove annotazioni porzione ripetute, anche con parentesi annidate.
 * @param {string} raw
 * @returns {string}
 */
function stripPortionAnnotations(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';

  s = s.replace(/(?:\s*\(\s*\d+\s+Porzione\s*\([^)]*\)\s*\))+/gi, ' ');
  s = s.replace(/(?:\s*\(\s*~?\s*\d+[.,]?\d*\s*g\s*\))+/gi, ' ');

  for (let i = 0; i < 6; i += 1) {
    const next = s
      .replace(/\([^()]*\)/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (next === s) break;
    s = next;
  }

  return sanitizeWipFoodDisplayName(s);
}

/**
 * Nome pulito per chip UI: senza «(1 Porzione (~10 g))» né duplicati.
 * @param {string} name
 * @returns {string}
 */
export function cleanDraftAdviceFoodName(name) {
  const clean = stripPortionAnnotations(name);
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * @param {string} mealTypeRaw
 * @returns {'colazione'|'pranzo'|'cena'|'snack'|null}
 */
function canonicalizeMealSlot(mealTypeRaw) {
  const raw = String(mealTypeRaw || '').trim().toLowerCase().split('_')[0];
  if (!raw) return null;
  if (raw === 'colazione' || raw.startsWith('colaz')) return 'colazione';
  if (raw === 'pranzo' || raw === 'lunch') return 'pranzo';
  if (raw === 'cena' || raw === 'dinner') return 'cena';
  if (
    raw === 'snack'
    || raw === 'spuntino'
    || raw === 'merenda'
    || raw.includes('snack')
  ) {
    return 'snack';
  }
  return null;
}

/**
 * Piano pasti rimanenti dichiarato dall'utente.
 * @param {string} userText
 * @returns {{ known: boolean, plan: string|null, label: string|null }}
 */
export function parseRemainingMealsPlanFromText(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return { known: false, plan: null, label: null };

  if (/\bsolo\s+cena\b/.test(text) || /\bsolo\s+la\s+cena\b/.test(text)) {
    return { known: true, plan: 'dinner_only', label: 'Solo Cena' };
  }
  if (
    /\bcena\s*\+\s*2\s*snack\b/.test(text)
    || /\bcena\s+e\s+(?:due|2)\s+snack\b/.test(text)
    || /\b(?:ancora\s+)?(?:due|2)\s+snack\b/.test(text)
  ) {
    return { known: true, plan: 'dinner_plus_2_snacks', label: 'Cena + 2 Snack' };
  }
  if (
    /\bcena\s*\+\s*1\s*snack\b/.test(text)
    || /\bcena\s+e\s+(?:un\s+)?snack\b/.test(text)
    || /\b(?:ancora\s+)?(?:un|1)\s+snack\b/.test(text)
  ) {
    return { known: true, plan: 'dinner_plus_1_snack', label: 'Cena + 1 Snack' };
  }
  if (/\b(?:nient['']?\s*altro|nessun\s+altro\s+pasto|dopo\s+solo\s+cena)\b/.test(text)) {
    return { known: true, plan: 'dinner_only', label: 'Solo Cena' };
  }
  return { known: false, plan: null, label: null };
}

/**
 * @param {Array<object>} items
 * @param {object} currentState
 * @param {'pro'|'kcal'} field
 * @returns {number}
 */
function estimateDraftMacroField(items = [], currentState = {}, field = 'pro') {
  const fromMacros = sumMealItemsMacros(items);
  if (field === 'pro' && Number(fromMacros.pro) > 0) return Math.round(Number(fromMacros.pro));
  if (field === 'kcal' && Number(fromMacros.kcal) > 0) return Math.round(Number(fromMacros.kcal));

  const personalDb = currentState?.foodDatabase && typeof currentState.foodDatabase === 'object'
    ? currentState.foodDatabase
    : {};
  const globalDb = currentState?.globalFoodDatabase && typeof currentState.globalFoodDatabase === 'object'
    ? currentState.globalFoodDatabase
    : {};
  const kentuDb = currentState?.kentuItDatabase && typeof currentState.kentuItDatabase === 'object'
    ? currentState.kentuItDatabase
    : {};

  let total = 0;
  for (const item of items) {
    const grams = Math.round(Number(item?.grams ?? item?.qta) || 0);
    if (grams <= 0) continue;

    if (field === 'pro') {
      const direct = Number(item?.pro ?? item?.prot);
      if (Number.isFinite(direct) && direct > 0) {
        total += direct;
        continue;
      }
    } else {
      const direct = Number(item?.kcal ?? item?.cal);
      if (Number.isFinite(direct) && direct > 0) {
        total += direct;
        continue;
      }
    }

    const key = String(item?.foodDbKey || item?.matchedKey || '').trim();
    const entry = (key && (personalDb[key] || globalDb[key] || kentuDb[key])) || null;
    if (!entry) continue;
    if (field === 'pro') {
      const per100 = Number(entry?.prot ?? entry?.pro ?? entry?.protein);
      if (Number.isFinite(per100) && per100 > 0) total += (per100 * grams) / 100;
    } else {
      const per100 = Number(entry?.kcal ?? entry?.cal ?? entry?.energy);
      if (Number.isFinite(per100) && per100 > 0) total += (per100 * grams) / 100;
    }
  }
  return Math.round(total);
}

/**
 * Matrice proteine/calorie del pasto vs residuo giornaliero.
 * @returns {'protein_sat_calories_low'|'protein_low_calories_high'|'balanced'|'needs_both'|'unknown'}
 */
function classifyProteinCalorieMatrix({
  draftProteinG,
  draftKcal,
  remainingKcal,
  remainingPro,
  canonicalType,
}) {
  const proteinSaturated = draftProteinG >= DRAFT_ADVICE_MPS_PROTEIN_CAP_G;
  const proteinLow = draftProteinG < DRAFT_ADVICE_PARTIAL_PROTEIN_TARGET_G.min;

  // Residuo calorico «alto» rispetto a quanto ancora ha senso mettere in QUESTO pasto.
  const calorieRoomLarge = remainingKcal >= 350;
  const calorieRoomTight = remainingKcal <= 180;
  const draftAlreadyEnergetic = draftKcal >= (canonicalType === 'cena' ? 550 : 450);

  if (proteinSaturated && (calorieRoomTight || draftAlreadyEnergetic) && remainingPro <= 15) {
    return 'balanced';
  }
  if (proteinSaturated && calorieRoomLarge && !draftAlreadyEnergetic) {
    return 'protein_sat_calories_low';
  }
  if (proteinLow && (draftAlreadyEnergetic || remainingKcal <= 250) && remainingPro >= 20) {
    return 'protein_low_calories_high';
  }
  if (!proteinSaturated && !proteinLow && calorieRoomTight) {
    return 'balanced';
  }
  if (proteinLow && calorieRoomLarge) {
    return 'needs_both';
  }
  if (proteinSaturated) {
    return calorieRoomLarge ? 'protein_sat_calories_low' : 'balanced';
  }
  return 'unknown';
}

/**
 * Quanti pasti restano dopo il piano intervista / slot corrente.
 * @param {{ plan?: string|null, known?: boolean }} remainingMealsPlan
 * @param {string} canonicalType
 * @returns {number}
 */
function resolveRemainingMealsCount(remainingMealsPlan = {}, canonicalType = '') {
  const plan = String(remainingMealsPlan?.plan || '');
  if (plan === 'dinner_only') return 1;
  if (plan === 'dinner_plus_1_snack') return 2;
  if (plan === 'dinner_plus_2_snacks') return 3;
  if (canonicalType === 'cena') return 1;
  // Piano sconosciuto: stima prudente (pasto corrente + cena).
  if (canonicalType === 'pranzo' || canonicalType === 'colazione') return 2;
  if (canonicalType === 'snack') return 2;
  return 2;
}

/**
 * Math check sul gap calorico vs pasti rimanenti.
 * @returns {object}
 */
export function buildCalorieGapCalibration(remainingKcal, remainingMealsCount = 1, remainingMealsPlan = null) {
  const gap = Math.max(0, Math.round(Number(remainingKcal) || 0));
  const mealsLeft = Math.max(1, Math.round(Number(remainingMealsCount) || 1));
  const kcalPerRemainingMeal = Math.round(gap / mealsLeft);
  const isHugeGap = gap >= 1000 && mealsLeft <= 2;
  const isLargeGap = !isHugeGap && gap >= 600 && mealsLeft <= 2;
  let portionScale = 1;
  if (isHugeGap) portionScale = 2.5;
  else if (isLargeGap) portionScale = 1.8;
  else if (kcalPerRemainingMeal >= 700) portionScale = 1.5;
  else if (kcalPerRemainingMeal >= 500) portionScale = 1.25;

  let guidance = `Gap ~${gap} kcal su ~${mealsLeft} pasto/i (~${kcalPerRemainingMeal} kcal/pasto). Usa porzioni proporzionate.`;
  if (isHugeGap) {
    guidance =
      `Debito enorme: ~${gap} kcal e solo ~${mealsLeft} pasto/i. VIETATO porzioni timide (es. 20g olio). `
      + 'Suggerisci porzioni abbondanti o combo (es. 40g frutta secca + carb/frutta) e spiega la matematica all\'utente.';
  } else if (isLargeGap) {
    guidance =
      `Gap elevato (~${gap} kcal / ${mealsLeft} pasto/i). Scala le grammature sopra i minimi storici.`;
  }

  return {
    remainingKcal: gap,
    remainingMealsCount: mealsLeft,
    remainingMealsPlanLabel: remainingMealsPlan?.label || null,
    kcalPerRemainingMeal,
    isHugeGap,
    isLargeGap,
    portionScale,
    guidance,
  };
}

/**
 * Soft-cap digeribilità dopo lo scaling.
 * @param {string} cleanName
 * @param {number} grams
 * @returns {number}
 */
function applyDigestibilitySoftCap(cleanName, grams) {
  const g = Math.round(Number(grams) || 0);
  if (g <= 0) return g;
  const key = normalizeWipFoodNameKey(cleanName);
  if (/olio|evo|extravergine/.test(key)) return Math.min(g, 45);
  if (/noci|mandorl|nocciol|pistacch|frutta\s*secca|anacard/.test(key)) return Math.min(g, 60);
  if (/burro|mayonnaise|maionese/.test(key)) return Math.min(g, 40);
  if (/pane|cracker|fette/.test(key)) return Math.min(g, 150);
  if (/riso|pasta|patat|couscous|avena/.test(key)) return Math.min(g, 200);
  return Math.min(g, 300);
}

/**
 * Policy fisiologica + intervista + matrice.
 */
export function buildDraftAdvicePhysiologicalPolicy(
  draft = {},
  draftTotals = {},
  draftProteinG = 0,
  nutrition = {},
  options = {},
) {
  const userText = String(options?.userText || '').trim();
  const remainingMealsPlan = parseRemainingMealsPlanFromText(userText);

  const canonicalType = canonicalizeMealSlot(
    draft?.mealType || nutrition?.currentMealType || '',
  ) || 'pasto';
  const exactTime = String(draft?.exactTime || draft?.timeString || '').trim() || null;
  const label = MEAL_SLOT_LABELS[canonicalType] || 'Pasto';

  const draftKcal = Math.round(Number(draftTotals?.kcal) || 0);
  const remainingKcal = Math.round(Number(options?.remainingKcal) || 0);
  const remainingPro = Math.round(Number(options?.remainingPro) || 0);
  const remainingMealsCount = resolveRemainingMealsCount(remainingMealsPlan, canonicalType);
  const calorieGapCalibration = buildCalorieGapCalibration(
    remainingKcal,
    remainingMealsCount,
    remainingMealsPlan,
  );

  const proteinCapReached = draftProteinG >= DRAFT_ADVICE_MPS_PROTEIN_CAP_G;
  const partialTarget = DRAFT_ADVICE_PARTIAL_PROTEIN_TARGET_G;
  const earlyDaySlot = canonicalType === 'pranzo'
    || canonicalType === 'snack'
    || canonicalType === 'colazione';

  const needsInterview = earlyDaySlot && !remainingMealsPlan.known;
  // A cena (o piano noto) si può applicare la matrice senza intervista.
  const interviewComplete = !earlyDaySlot || remainingMealsPlan.known;

  const matrix = interviewComplete
    ? classifyProteinCalorieMatrix({
      draftProteinG,
      draftKcal,
      remainingKcal,
      remainingPro,
      canonicalType,
    })
    : 'deferred_until_interview';

  let lookAheadMode = 'balanced';
  let lookAheadGuidance = 'Completa con moderazione; non azzerare il budget giornaliero.';
  if (needsInterview) {
    lookAheadMode = 'interactive_interview';
    lookAheadGuidance =
      'Chiedi quanti altri pasti farà oggi. suggestions = reply chips Solo Cena / Cena + 1 Snack / Cena + 2 Snack. Niente alimenti.';
  } else if (canonicalType === 'pranzo' || canonicalType === 'snack') {
    lookAheadMode = 'partial_target_leave_room_for_dinner';
    lookAheadGuidance =
      `NON azzerare i macro residui. Mira a ~${partialTarget.min}-${partialTarget.max}g proteine qui; ripartisci il resto su ${remainingMealsPlan.label || 'i pasti successivi'}. `
      + calorieGapCalibration.guidance;
  } else if (canonicalType === 'cena') {
    lookAheadMode = 'close_day_gently';
    lookAheadGuidance =
      'Chiudi dolcemente il gap giornaliero rispettando digestione e tetto proteico 40-50g. '
      + calorieGapCalibration.guidance;
  } else if (canonicalType === 'colazione') {
    lookAheadMode = 'moderate_breakfast';
    lookAheadGuidance = 'Completa con moderazione; non scaricare qui tutto il budget della giornata. '
      + calorieGapCalibration.guidance;
  }

  let mealAdviceMode = 'suggest_completion';
  if (needsInterview) {
    mealAdviceMode = 'interview_remaining_meals';
  } else if (matrix === 'balanced') {
    mealAdviceMode = 'approve_and_stop';
  } else if (matrix === 'protein_sat_calories_low') {
    mealAdviceMode = 'suggest_energy_only';
  } else if (matrix === 'protein_low_calories_high') {
    mealAdviceMode = 'suggest_lean_protein';
  } else if (proteinCapReached) {
    mealAdviceMode = 'suggest_energy_only';
  }

  return {
    mealSlot: {
      canonicalType,
      label,
      exactTime,
      display: exactTime ? `${label} (${exactTime})` : label,
    },
    draftMacros: {
      kcal: draftKcal,
      pro: draftProteinG,
      carbo: Math.round(Number(draftTotals?.carbo) || 0),
      fat: Math.round(Number(draftTotals?.fat) || 0),
    },
    remainingMealsPlan,
    calorieGapCalibration,
    interview: {
      needed: needsInterview,
      question: needsInterview ? 'Quanti altri pasti farai oggi?' : null,
      suggestedReplyChips: needsInterview ? [...DRAFT_ADVICE_INTERVIEW_CHIP_LABELS] : [],
    },
    mpsCap: {
      thresholdG: DRAFT_ADVICE_MPS_PROTEIN_CAP_G,
      draftProteinG,
      proteinCapReached,
      rule:
        'Se draftProteinG >= 40 → VIETATO suggerire altre fonti proteiche (si possono ancora suggerire carb/grassi se calorie basse).',
    },
    proteinCalorieMatrix: {
      status: matrix,
      guidance:
        matrix === 'protein_sat_calories_low'
          ? 'Proteine sature, calorie basse → benzina (carb/grassi storico) con grammature calibrate al gap.'
          : matrix === 'protein_low_calories_high'
            ? 'Proteine basse, calorie alte → proteine ultra-magre storico, grammature calibrate.'
            : matrix === 'balanced'
              ? 'Equilibrio raggiunto → elogia e suggestions=[].'
              : matrix === 'deferred_until_interview'
                ? 'Completa prima l\'intervista sui pasti rimanenti.'
                : 'Valuta completamento mirato (max 2 alimenti) con Math Check sul gap.',
    },
    lookAhead: {
      mode: lookAheadMode,
      guidance: lookAheadGuidance,
      partialProteinTargetG: partialTarget,
    },
    mealAdviceMode,
    forceEmptySuggestions: mealAdviceMode === 'approve_and_stop',
    approveAndStop: mealAdviceMode === 'approve_and_stop',
  };
}

/**
 * @param {string} name
 * @param {Array<{ foodName?: string }>} draftItems
 * @returns {boolean}
 */
function isFoodAlreadyInDraft(name, draftItems = []) {
  const key = normalizeWipFoodNameKey(name);
  if (!key) return false;
  return (Array.isArray(draftItems) ? draftItems : []).some((item) => {
    const itemKey = normalizeWipFoodNameKey(item?.foodName || item?.name);
    if (!itemKey) return false;
    return itemKey === key || itemKey.includes(key) || key.includes(itemKey);
  });
}

/**
 * True se il nome alimento compare nel testo (advice o domanda utente).
 */
function isFoodMentionedInCoachText(name, adviceMessage = '', userText = '') {
  const display = cleanDraftAdviceFoodName(name).toLowerCase();
  const key = normalizeWipFoodNameKey(name);
  const haystack = `${String(adviceMessage || '')} ${String(userText || '')}`.toLowerCase();
  if (!haystack.trim() || !key) return false;
  if (display && haystack.includes(display)) return true;
  const tokens = key.split(/\s+/).filter((t) => t.length >= 4);
  return tokens.some((token) => haystack.includes(token));
}

/**
 * Stop-aggiunte solo se il coach elogia/chiude — non se sta facendo l'intervista.
 */
function adviceSaysStopAdding(adviceMessage = '') {
  const text = String(adviceMessage || '').toLowerCase();
  if (!text) return false;
  if (/\bquanti\s+altri\s+pasti\b/.test(text)) return false;
  return (
    /\b(?:perfetto\s+cos[iì]|non\s+aggiung|nient['']?\s*altro|chiudilo\s+e\s+salva|lascia\s+cos[iì]|gi[aà]\s+(?:ottimo|equilibrat|completo|al\s+massimo)|equilibr(?:io|ato)\s+perfett)\b/i
      .test(text)
  );
}

/**
 * Risolve i grammi: preferisci LLM, scala col gap, non restare bloccato sul minimo storico.
 * @param {string} cleanName
 * @param {number} rawWeight
 * @param {object|null} block
 * @param {object|null} calibration
 * @returns {number}
 */
function resolveDraftAdviceWeight(cleanName, rawWeight, block = null, calibration = null) {
  const typical = block?.typicalGrams > 0 ? Math.round(Number(block.typicalGrams)) : 0;
  const key = normalizeWipFoodNameKey(cleanName);
  let fallback = 100;
  for (const [token, grams] of Object.entries(USER_PROPOSED_DEFAULT_GRAMS)) {
    if (key.includes(token)) {
      fallback = grams;
      break;
    }
  }

  // Preferisci il peso LLM se presente; altrimenti tipico storico / fallback.
  let weight = rawWeight > 0 ? rawWeight : (typical || fallback);

  const scale = Number(calibration?.portionScale) || 1;
  if (scale > 1.05) {
    const baseForScale = typical > 0 ? typical : fallback;
    const scaledFloor = Math.round(baseForScale * scale);
    // Con gap grande: non accettare porzioni sotto il pavimento calibrato.
    weight = Math.max(weight, scaledFloor);
  }

  return applyDigestibilitySoftCap(cleanName, weight);
}

function findHistoricalBlock(name, blocks = []) {
  const needleKey = normalizeWipFoodNameKey(name);
  if (!needleKey) return null;
  return (Array.isArray(blocks) ? blocks : []).find((row) => {
    const blockKey = normalizeWipFoodNameKey(row?.foodName);
    if (!blockKey) return false;
    return blockKey === needleKey
      || blockKey.includes(needleKey)
      || needleKey.includes(blockKey);
  }) || null;
}

/**
 * Classifica una suggestion LLM: alimento vs risposta discorsiva.
 * @returns {'food'|'reply'}
 */
export function classifyDraftAdviceSuggestionKind(suggestion, historicalBlocks = []) {
  const explicit = String(suggestion?.kind || suggestion?.type || '').trim().toLowerCase();
  if (explicit === 'reply' || explicit === 'answer' || suggestion?.reply === true) return 'reply';
  if (explicit === 'food' || explicit === 'add' || suggestion?.food === true) return 'food';

  const rawName = String(
    suggestion?.name || suggestion?.label || suggestion?.text || suggestion?.foodName || '',
  ).trim();
  const weight = Math.round(Number(suggestion?.weight ?? suggestion?.grams) || 0);

  if (REPLY_CHIP_HINT_RE.test(rawName)) return 'reply';
  if (DRAFT_ADVICE_INTERVIEW_CHIP_LABELS.some(
    (label) => normalizeWipFoodNameKey(label) === normalizeWipFoodNameKey(rawName),
  )) {
    return 'reply';
  }
  if (findHistoricalBlock(rawName, historicalBlocks)) return 'food';
  if (weight > 0) return 'food';
  if (rawName && weight <= 0) return 'reply';
  return 'food';
}

/**
 * @param {string} userText
 * @param {object} currentState
 * @param {object} draft
 * @returns {Promise<object>}
 */
export async function buildDraftAdviceContext(userText, currentState = {}, draft = {}) {
  void (await Promise.resolve());

  const nutrition = buildNutritionContextForState(currentState);
  const items = expandFoodPayloadItems(draft);
  const draftTotals = sumMealItemsMacros(items);
  const draftProteinG = estimateDraftMacroField(items, currentState, 'pro');
  const draftKcal = estimateDraftMacroField(items, currentState, 'kcal');
  const totalsWithMacros = {
    ...draftTotals,
    pro: draftProteinG > 0 ? draftProteinG : Math.round(Number(draftTotals?.pro) || 0),
    kcal: draftKcal > 0 ? draftKcal : Math.round(Number(draftTotals?.kcal) || 0),
  };

  const remainingBudget = nutrition.remainingBudget || {};
  const dogmaticMacroReceipt = remainingBudget?.dogmaticReceipt || null;
  const remaining = dogmaticMacroReceipt?.remaining || {
    kcal: remainingBudget.kcal,
    pro: remainingBudget.pro,
    carbo: remainingBudget.carbo,
    fat: remainingBudget.fat,
  };

  const historicalFoodBlocks = getHistoricalFoodBlocks(currentState, { limit: 30 })
    .map((row) => ({
      ...row,
      foodName: cleanDraftAdviceFoodName(row.foodName),
    }))
    .filter((row) => row.foodName && row.typicalGrams > 0);

  const filteredBlocks = filterHistoricalBlocksByUserText(historicalFoodBlocks, userText);

  const physiologicalPolicy = buildDraftAdvicePhysiologicalPolicy(
    draft,
    totalsWithMacros,
    totalsWithMacros.pro,
    nutrition,
    {
      userText,
      remainingKcal: Math.round(Number(remaining?.kcal) || 0),
      remainingPro: Math.round(Number(remaining?.pro) || 0),
    },
  );

  const mealType = physiologicalPolicy.mealSlot.canonicalType !== 'pasto'
    ? physiologicalPolicy.mealSlot.canonicalType
    : (draft?.mealType || nutrition.currentMealType || 'pasto');

  return {
    intent: 'ASK_DRAFT_ADVICE',
    rawUserQuery: String(userText || '').trim(),
    currentMealType: mealType,
    mealSlot: physiologicalPolicy.mealSlot,
    physiologicalPolicy,
    activeDraft: {
      mealType: mealType || null,
      mealLabel: physiologicalPolicy.mealSlot.label,
      exactTime: physiologicalPolicy.mealSlot.exactTime,
      targetNodeId: draft?.targetNodeId || null,
      items: items.map((item) => ({
        foodName: cleanDraftAdviceFoodName(item?.foodName || item?.name || ''),
        grams: Math.round(Number(item?.grams ?? item?.qta) || 0),
        foodDbKey: item?.foodDbKey ?? null,
        pro: Number(item?.pro ?? item?.prot) || undefined,
      })).filter((item) => item.foodName && item.grams > 0),
      totals: totalsWithMacros,
    },
    historicalFoodBlocks: filteredBlocks.length > 0 ? filteredBlocks : historicalFoodBlocks.slice(0, 20),
    remainingBudget,
    dogmaticMacroReceipt,
    dailyBudgetRemaining: {
      remainingCalories: Math.round(Number(remaining?.kcal) || 0),
      remainingProtein: Math.round(Number(remaining?.pro) || 0),
      remainingCarbs: Math.round(Number(remaining?.carbo) || 0),
      remainingFat: Math.round(Number(remaining?.fat) || 0),
      target: dogmaticMacroReceipt?.target || null,
      consumed: dogmaticMacroReceipt?.consumed || null,
      remaining,
    },
    eveningMetabolicContext: buildEveningMetabolicContext(currentState),
  };
}

/**
 * @param {object} adviceContext
 * @param {string} userText
 * @returns {string}
 */
export function generateDraftAdvicePrompt(adviceContext, userText) {
  const ctx = adviceContext && typeof adviceContext === 'object' ? adviceContext : {};
  const query = String(userText || ctx.rawUserQuery || '').trim();
  const draftJson = JSON.stringify(ctx.activeDraft || {}, null, 0);
  const blocksJson = JSON.stringify(ctx.historicalFoodBlocks || [], null, 0);
  const budgetJson = JSON.stringify(ctx.dailyBudgetRemaining || {}, null, 0);
  const eveningJson = JSON.stringify(ctx.eveningMetabolicContext || {}, null, 0);
  const physioJson = JSON.stringify(ctx.physiologicalPolicy || {}, null, 0);
  const mealSlot = ctx.mealSlot || ctx.physiologicalPolicy?.mealSlot || {};
  const draftItemNames = (ctx.activeDraft?.items || [])
    .map((item) => item.foodName)
    .filter(Boolean)
    .join(', ') || '(nessuno)';
  const mealDisplay = mealSlot.display
    || (mealSlot.label
      ? (mealSlot.exactTime ? `${mealSlot.label} (${mealSlot.exactTime})` : mealSlot.label)
      : String(ctx.currentMealType || 'pasto'));

  const mode = ctx.physiologicalPolicy?.mealAdviceMode;
  let modeHint = 'Suggerisci max 2 alimenti (kind=food) coerenti con la matrice.';
  if (mode === 'interview_remaining_meals') {
    modeHint =
      'FASE INDAGINE: chiedi «Quanti altri pasti farai oggi?» e suggestions = 3 reply: Solo Cena, Cena + 1 Snack, Cena + 2 Snack. Niente cibo.';
  } else if (mode === 'approve_and_stop') {
    modeHint = 'EQUILIBRIO: elogia, invita a salvare, suggestions=[].';
  } else if (mode === 'suggest_energy_only') {
    modeHint =
      'MATRICE benzina + MATH CHECK + ANTI-CLIFFHANGER: spiega il gap E subito 1-2 cibi nominati + suggestions food. Mai discorso teorico senza chip.';
  } else if (mode === 'suggest_lean_protein') {
    modeHint =
      'MATRICE proteine magre + MATH CHECK + ANTI-CLIFFHANGER: 1-2 cibi SPECIFICI + suggestions food subito. VIETATO «per esempio?» deferred.';
  } else if (mode === 'suggest_completion') {
    modeHint =
      'Completa con max 2 alimenti concreti + chip food. ANTI-CLIFFHANGER: niente teoria senza suggestions.';
  }

  const gap = ctx.physiologicalPolicy?.calorieGapCalibration || null;
  const gapLine = gap
    ? `CALIBRAZIONE_GAP: remainingKcal=${gap.remainingKcal}, pastiRimanenti=${gap.remainingMealsCount}, kcal/pasto≈${gap.kcalPerRemainingMeal}, isHugeGap=${gap.isHugeGap}, portionScale=${gap.portionScale}. ${gap.guidance}`
    : 'CALIBRAZIONE_GAP: n/d';

  return [
    'INTENTO: ASK_DRAFT_ADVICE — coach Vassoio (NO salvataggio automatico).',
    `MOMENTO_DELLA_GIORNATA / PASTO: ${mealDisplay}`,
    `DOMANDA_UTENTE: ${query}`,
    `BOZZA_ATTUALE: ${draftJson}`,
    `ALIMENTI_GIÀ_NEL_VASSOIO (VIETATO risugerirli): ${draftItemNames}`,
    `POLICY (intervista + matrice + MPS + gap): ${physioJson}`,
    gapLine,
    `ISTRUZIONE_TURNO: ${modeHint}`,
    `MACRO_RESIDUI_GIORNATA: ${budgetJson}`,
    `DIZIONARIO_STORICO_BLOCCHI: ${blocksJson}`,
    `CONTESTO_SERALE: ${eveningJson}`,
    'suggestions: food → {name, kind:"food", weight CALIBRATO}; reply → {name, kind:"reply"}; stop → [].',
  ].join('\n');
}

/**
 * Allinea un suggerimento LLM alimento al blocco storico (pesi calibrati al gap).
 * @param {object} suggestion
 * @param {Array<object>} blocks
 * @param {object|null} [calibration]
 * @returns {{ kind: 'food', name: string, weight: number } | null}
 */
export function alignDraftAdviceSuggestion(suggestion, blocks = [], calibration = null) {
  const rawName = String(suggestion?.name || suggestion?.foodName || '').trim();
  const rawWeight = Math.round(Number(suggestion?.weight ?? suggestion?.grams) || 0);
  if (!rawName) return null;

  const block = findHistoricalBlock(rawName, blocks);
  const name = cleanDraftAdviceFoodName(block?.foodName || rawName);
  const weight = resolveDraftAdviceWeight(name, rawWeight, block, calibration);
  if (!name || weight <= 0) return null;
  return { kind: 'food', name, weight };
}

/**
 * Normalizza una reply discorsiva.
 * @returns {{ kind: 'reply', name: string } | null}
 */
export function alignDraftAdviceReplySuggestion(suggestion) {
  const raw = String(
    suggestion?.name || suggestion?.label || suggestion?.text || '',
  ).trim();
  if (!raw) return null;
  // Evita di stampare «Aggiungi …» se l'LLM ha già prefissato.
  const cleaned = raw.replace(/^aggiungi\s+/i, '').trim();
  if (!cleaned || cleaned.length > 48) return null;
  return { kind: 'reply', name: cleaned };
}

/**
 * Filtra suggestions LLM (food + reply).
 * @returns {Array<{ kind: 'food'|'reply', name: string, weight?: number }>}
 */
export function sanitizeDraftAdviceSuggestions(suggestions = [], options = {}) {
  const {
    draftItems = [],
    adviceMessage = '',
    userText = '',
    historicalBlocks = [],
    physiologicalPolicy = null,
  } = options;

  const mode = physiologicalPolicy?.mealAdviceMode;
  if (
    physiologicalPolicy?.forceEmptySuggestions
    || physiologicalPolicy?.approveAndStop
    || mode === 'approve_and_stop'
    || adviceSaysStopAdding(adviceMessage)
  ) {
    return [];
  }

  const interviewMode = mode === 'interview_remaining_meals'
    || physiologicalPolicy?.interview?.needed === true;
  const proteinCapReached = Boolean(physiologicalPolicy?.mpsCap?.proteinCapReached);
  const energyOnly = mode === 'suggest_energy_only';
  const leanProteinOnly = mode === 'suggest_lean_protein';
  const calibration = physiologicalPolicy?.calorieGapCalibration || null;

  const out = [];
  const seen = new Set();
  const maxFood = 2;
  const maxReply = interviewMode ? 3 : 3;
  let foodCount = 0;
  let replyCount = 0;

  const list = Array.isArray(suggestions) ? suggestions : [];

  // Fallback: se in intervista l'LLM non manda chip, usa quelli standard.
  const effectiveList = (interviewMode && list.length === 0)
    ? DRAFT_ADVICE_INTERVIEW_CHIP_LABELS.map((name) => ({ name, kind: 'reply' }))
    : list;

  for (const suggestion of effectiveList) {
    const kind = classifyDraftAdviceSuggestionKind(suggestion, historicalBlocks);

    if (interviewMode && kind === 'food') continue;
    if (!interviewMode && kind === 'reply' && !REPLY_CHIP_HINT_RE.test(String(suggestion?.name || ''))) {
      // Fuori intervista accetta reply solo se sembrano CTA di chiusura utili.
      const name = String(suggestion?.name || '').trim();
      if (!/salva|perfetto|nient/i.test(name)) continue;
    }

    if (kind === 'reply') {
      if (replyCount >= maxReply) continue;
      const row = alignDraftAdviceReplySuggestion(suggestion);
      if (!row) continue;
      const key = `reply:${normalizeWipFoodNameKey(row.name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
      replyCount += 1;
      continue;
    }

    if (foodCount >= maxFood) continue;
    const row = alignDraftAdviceSuggestion(suggestion, historicalBlocks, calibration);
    if (!row) continue;

    const key = `food:${normalizeWipFoodNameKey(row.name)}`;
    if (seen.has(key)) continue;
    if (isFoodAlreadyInDraft(row.name, draftItems)) continue;
    if (!isFoodMentionedInCoachText(row.name, adviceMessage, userText)) continue;

    if ((proteinCapReached || energyOnly) && PROTEIN_FOOD_HINT_RE.test(row.name)) continue;
    if (leanProteinOnly && !PROTEIN_FOOD_HINT_RE.test(row.name)) {
      // Preferisci proteine; se non matcha hint, lascia passare solo se esplicitamente magro nello storico.
    }

    seen.add(key);
    out.push(row);
    foodCount += 1;
  }

  return out;
}

/**
 * Smart chips versatili: «Aggiungi 90g Sgombro» OPPURE testo discorsivo esatto («Solo Cena»).
 *
 * @param {Array<object>} suggestions
 * @param {Array<object>} historicalBlocks
 * @param {{ draftItems?: Array<object>, adviceMessage?: string, userText?: string, physiologicalPolicy?: object }} [options]
 * @returns {string[]}
 */
export function buildDraftAdviceQuickReplies(suggestions = [], historicalBlocks = [], options = {}) {
  const sanitized = sanitizeDraftAdviceSuggestions(suggestions, {
    ...options,
    historicalBlocks,
  });

  const replies = [];
  const seen = new Set();

  for (const entry of sanitized) {
    let label = '';
    if (entry.kind === 'reply') {
      label = String(entry.name || '').trim();
    } else {
      label = `Aggiungi ${entry.weight}g ${entry.name}`;
    }
    if (!label) continue;
    const key = normalizeWipFoodNameKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    replies.push(label);
  }

  return replies;
}
