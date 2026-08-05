/**
 * Motore Meal WIP (Work In Progress) — state machine per composizione pasti in chat.
 *
 * Sub-intent: QUERY | UPDATE | CONFIRM
 * Vincoli (es. maxCalories) restano in memoria finché il pasto non è concluso.
 */

export const MEAL_WIP_SUB_INTENTS = Object.freeze({
  QUERY: 'QUERY',
  UPDATE: 'UPDATE',
  CONFIRM: 'CONFIRM',
});

export function createEmptyMealWipConstraints() {
  return {
    maxCalories: null,
    maxProtein: null,
    maxCarbs: null,
    maxFat: null,
  };
}

export function createEmptyMealWip() {
  return {
    active: false,
    constraints: createEmptyMealWipConstraints(),
    items: [],
    mealType: null,
  };
}

/**
 * Estrae vincoli calorici/macro dal testo utente.
 * Es. "snack da 100 kcal", "max 150 calorie", "sotto le 200 kcal".
 *
 * @param {string} userText
 * @returns {{ maxCalories: number|null, maxProtein: number|null, maxCarbs: number|null, maxFat: number|null }}
 */
export function parseMealConstraintsFromText(userText) {
  const text = String(userText || '').trim().toLowerCase();
  const out = createEmptyMealWipConstraints();
  if (!text) return out;

  const kcalPatterns = [
    /(?:da|max|massimo|entro|sotto(?:\s+le)?|meno\s+di|circa)\s*(\d{2,4})\s*(?:kcal|calorie)\b/i,
    /\b(\d{2,4})\s*(?:kcal|calorie)\b(?:\s*(?:max|massimo|di\s+budget))?/i,
    /(?:budget|tetto|limite)\s*(?:di\s+)?(\d{2,4})\s*(?:kcal|calorie)\b/i,
  ];
  for (const re of kcalPatterns) {
    const m = text.match(re);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && n < 5000) {
        out.maxCalories = Math.round(n);
        break;
      }
    }
  }

  const prot = text.match(/(?:max|massimo|entro)\s*(\d{1,3})\s*g?\s*(?:di\s+)?(?:prot|proteine)\b/i);
  if (prot) {
    const n = Number(prot[1]);
    if (Number.isFinite(n) && n > 0) out.maxProtein = n;
  }
  const carb = text.match(/(?:max|massimo|entro)\s*(\d{1,3})\s*g?\s*(?:di\s+)?(?:carb|carbo|carboidrati)\b/i);
  if (carb) {
    const n = Number(carb[1]);
    if (Number.isFinite(n) && n > 0) out.maxCarbs = n;
  }
  const fat = text.match(/(?:max|massimo|entro)\s*(\d{1,3})\s*g?\s*(?:di\s+)?(?:fat|grassi)\b/i);
  if (fat) {
    const n = Number(fat[1]);
    if (Number.isFinite(n) && n > 0) out.maxFat = n;
  }

  return out;
}

export function mergeMealWipConstraints(prev, next) {
  const base = prev && typeof prev === 'object' ? prev : createEmptyMealWipConstraints();
  const incoming = next && typeof next === 'object' ? next : createEmptyMealWipConstraints();
  return {
    maxCalories: incoming.maxCalories != null ? incoming.maxCalories : base.maxCalories,
    maxProtein: incoming.maxProtein != null ? incoming.maxProtein : base.maxProtein,
    maxCarbs: incoming.maxCarbs != null ? incoming.maxCarbs : base.maxCarbs,
    maxFat: incoming.maxFat != null ? incoming.maxFat : base.maxFat,
  };
}

export function hasMealWipConstraints(constraints) {
  if (!constraints || typeof constraints !== 'object') return false;
  return ['maxCalories', 'maxProtein', 'maxCarbs', 'maxFat']
    .some((k) => Number.isFinite(Number(constraints[k])) && Number(constraints[k]) > 0);
}

/** Avvio sessione composizione (anche senza alimenti ancora). */
export function isMealWipSessionStart(userText) {
  const text = String(userText || '').trim().toLowerCase();
  if (!text) return false;
  if (/\b(?:ho\s+)?(?:mangiat|consumat|bevut)\w*\b/i.test(text)) return false;

  const hasConstraint = hasMealWipConstraints(parseMealConstraintsFromText(text));
  const composeCue = [
    /\b(?:voglio|vorrei|preparo|compongo|costruisc\w*|pianific\w*)\b.*\b(?:snack|spuntino|merenda|pasto|colazione|pranzo|cena)\b/i,
    /\b(?:snack|spuntino|merenda|pasto)\b.*\b(?:da|max|entro|sotto)\b/i,
    /\baiutami\s+(?:a\s+)?(?:comporre|costruire|preparare)\b/i,
    /\bcomposizione\s+(?:di\s+)?(?:un\s+)?(?:pasto|snack)\b/i,
  ].some((re) => re.test(text));

  return hasConstraint || composeCue;
}

const CONFIRM_PATTERNS = [
  /\bok\s*,?\s*(?:inserisci|salva|registra|conferma|vai)\b/i,
  /\b(?:inserisci|salva|registra|conferma)\s+(?:il\s+)?(?:pasto|tutto|cos[iì])\b/i,
  /\b(?:confermo|procedi|vai\s+cos[iì]|perfetto\s+inserisci)\b/i,
  /\b(?:chiudi|finalizza)\s+(?:il\s+)?pasto\b/i,
  /\b(?:s[iì]|ok)\s*,?\s*(?:va\s+bene|confermo)\b/i,
];

const QUERY_PATTERNS = [
  /\?\s*$/,
  /\bnon\s+(?:sono|è|e)\s+tropp/i,
  /\btropp[eoa]i?\b/i,
  /\btroppo\s+poch/i,
  /\bquanto\b/i,
  /\bva\s+bene\b/i,
  /\b(?:è|e)\s+ok\b/i,
  /\bdubbio\b/i,
  /\b(?:e\s+se|oppure)\b/i,
  /\bricalcola\b/i,
  /\bcome\s+(?:sono|sto)\b/i,
  /\b(?:spiega|perch[eé]|dimmi)\b/i,
  /\b(?:sforo|rientro)\b/i,
];

const UPDATE_PATTERNS = [
  /\baggiung/i,
  /\bmetti\b/i,
  /\binserisc/i,
  /\btogli\b/i,
  /\brimuov/i,
  /\bcambia\b/i,
  /\bsostituisc/i,
  /\bporta\s+(?:a|da)\s+\d/i,
  /\b(?:pi[uù]|meno)\s+\d+\s*g\b/i,
];

/**
 * Classifica l'input utente durante una sessione Meal WIP.
 *
 * @param {string} userText
 * @param {{ hasActiveWip?: boolean, chatHistory?: Array }} [opts]
 * @returns {'QUERY'|'UPDATE'|'CONFIRM'}
 */
export function classifyMealWipSubIntent(userText, opts = {}) {
  const text = String(userText || '').trim();
  if (!text) return MEAL_WIP_SUB_INTENTS.QUERY;

  if (CONFIRM_PATTERNS.some((re) => re.test(text))) {
    return MEAL_WIP_SUB_INTENTS.CONFIRM;
  }

  // Domande / dubbi: MAI finalizzare
  if (QUERY_PATTERNS.some((re) => re.test(text))) {
    return MEAL_WIP_SUB_INTENTS.QUERY;
  }

  if (UPDATE_PATTERNS.some((re) => re.test(text))) {
    return MEAL_WIP_SUB_INTENTS.UPDATE;
  }

  // Nuovo vincolo o nuovo alimento senza past-tense → UPDATE
  if (hasMealWipConstraints(parseMealConstraintsFromText(text))) {
    return MEAL_WIP_SUB_INTENTS.UPDATE;
  }

  if (opts.hasActiveWip) {
    // In sessione attiva, testo breve con nome alimento → UPDATE
    if (!/\b(?:ho\s+)?(?:mangiat|consumat|bevut)\w*\b/i.test(text)) {
      return MEAL_WIP_SUB_INTENTS.UPDATE;
    }
  }

  return MEAL_WIP_SUB_INTENTS.UPDATE;
}

/**
 * Calorie residue rispetto al vincolo maxCalories del WIP.
 * @returns {number|null}
 */
export function residualCaloriesFromWip(constraints, wipTotals = {}) {
  const max = Number(constraints?.maxCalories);
  if (!Number.isFinite(max) || max <= 0) return null;
  const used = Math.max(0, Number(wipTotals?.kcal) || 0);
  return Math.max(0, Math.round(max - used));
}

/**
 * Grammatura esatta per rientrare in residualKcal dato densità kcal/100g.
 * @param {number} kcalPer100g
 * @param {number} residualKcal
 * @returns {number|null}
 */
export function computeGramsForCalorieBudget(kcalPer100g, residualKcal) {
  const density = Number(kcalPer100g);
  const residual = Number(residualKcal);
  if (!(density > 0) || !(residual > 0)) return null;
  const grams = Math.floor((residual / density) * 100);
  if (!Number.isFinite(grams) || grams <= 0) return null;
  return Math.min(2000, Math.max(1, grams));
}

/**
 * Scala suggestion LLM (o dichiarazione senza grammi) sul residuo calorico WIP.
 *
 * @param {object} suggestion
 * @param {number|null} residualKcal
 * @returns {object}
 */
export function scaleSuggestionToResidualCalories(suggestion, residualKcal) {
  const raw = suggestion && typeof suggestion === 'object' ? suggestion : {};
  const weight = Math.round(Number(raw.weight ?? raw.grams) || 0);
  const calories = Math.round(Number(raw.calories ?? raw.kcal) || 0);
  const residual = Number(residualKcal);

  if (!(residual > 0) || !(weight > 0)) {
    return { ...raw, weight: weight > 0 ? weight : raw.weight, calories: calories > 0 ? calories : raw.calories };
  }

  // Densità da macros già noti sulla porzione proposta
  let kcalPer100g = null;
  if (calories > 0 && weight > 0) {
    kcalPer100g = (calories / weight) * 100;
  }

  if (!(kcalPer100g > 0)) {
    return { ...raw, weight, calories: calories || null };
  }

  if (calories > 0 && calories <= residual * 1.02) {
    return { ...raw, weight, calories };
  }

  const scaledGrams = computeGramsForCalorieBudget(kcalPer100g, residual);
  if (scaledGrams == null) return { ...raw, weight, calories };

  const ratio = scaledGrams / weight;
  const macros = raw.macros && typeof raw.macros === 'object' ? raw.macros : {};
  return {
    ...raw,
    weight: scaledGrams,
    grams: scaledGrams,
    calories: Math.round(calories > 0 ? calories * ratio : (kcalPer100g * scaledGrams) / 100),
    macros: {
      prot: Math.round((Number(macros.prot ?? macros.pro) || 0) * ratio * 10) / 10,
      carb: Math.round((Number(macros.carb ?? macros.carbo) || 0) * ratio * 10) / 10,
      fat: Math.round((Number(macros.fat) || 0) * ratio * 10) / 10,
    },
  };
}

/**
 * Snapshot serializzabile per prompt LLM.
 */
export function serializeMealWipForPrompt({
  constraints = null,
  items = [],
  mealType = null,
  totals = null,
  subIntent = null,
} = {}) {
  const residualKcal = residualCaloriesFromWip(constraints, totals);
  return {
    active: hasMealWipConstraints(constraints) || (Array.isArray(items) && items.length > 0),
    mealType: mealType || null,
    constraints: constraints || createEmptyMealWipConstraints(),
    items: Array.isArray(items) ? items : [],
    totals: totals || { kcal: 0, pro: 0, carbo: 0, fat: 0 },
    residualKcal,
    subIntent: subIntent || null,
  };
}

/**
 * System prompt — Coach Nutrizionale Interattivo (WIP).
 * Tono empatico + emoji + matematica dinamica sui vincoli.
 */
export const MEAL_WIP_SYSTEM_PROMPT = [
  'Sei un assistente nutrizionale empatico, colloquiale e intelligente — un Coach Nutrizionale Interattivo.',
  'Rivolgiti all\'utente in modo incoraggiante e chiaro. Mantieni il carrello WIP in memoria finché non c\'è conferma esplicita.',
  '',
  'STILE VISIVO (OBBLIGATORIO): usa emoji native nel adviceMessage.',
  'Associa un\'emoji coerente a ogni alimento (es. 🥣 yogurt greco, 🌰 noci, 🍎 mela, 🐟 tonno, 🥖 pane, 🥛 latte).',
  'Usa ✅ quando i vincoli calorici/macro sono rispettati.',
  'Usa ⚠️ quando una proposta sforerebbe un limite (e proponi subito la grammatura corretta).',
  'Usa 💡 per suggerire alternative o piccoli trucchi utili.',
  '',
  'REGOLE TASSATIVE SUI NOMI (JSON items / suggestions):',
  'NOMI PULITI: Il campo name (o foodName) dell\'alimento deve contenere SOLO il nome generico e pulito (es. "Pomodoro"). NON inserire MAI porzioni, grammi o testo tra parentesi all\'interno del campo name.',
  'CORREZIONE REFUSI: Se l\'utente fa un errore di battitura (es. "pane interale"), correggi il refuso e restituisci UNA SOLA VOCE con il nome corretto. Non duplicare MAI l\'alimento inserendo sia la versione scritta male che quella corretta.',
  'EMOJI PRECISA: Per ogni alimento, devi generare la singola emoji più accurata possibile nel campo icon basandoti sulla lavorazione del cibo. Es: se "pomodoro" usa 🍅, se "passata di pomodoro" usa 🥫, se "salmone" usa 🐟, se "piadina" usa 🫓, se "pasta" usa 🍝.',
  '',
  'INTENT PARSING (WIP):',
  '- QUERY (domanda/dubbio, es. «non sono troppe?»): rispondi discorsivamente, ricalcola i macros del carrello, NON chiudere e NON salvare il pasto.',
  '- UPDATE (aggiungi/togli/modifica): aggiorna il carrello; calcola grammature sul residuo.',
  '  HARD RULE UPDATE: se l\'utente modifica o aggiunge un alimento già presente nel carrello, aggiorna la sua quantità esistente. Non creare mai due voci separate per lo stesso alimento.',
  '- CONFIRM (es. «ok inserisci», «salva»): solo allora genera il riepilogo finale per il salvataggio.',
  '  HARD RULE CONFIRM — adviceMessage: SOLO Markdown pulito, elenco puntato. Niente JSON grezzo in chat.',
  '  Formato esatto di ogni riga: - [Emoji] Nome Alimento (Grammi)',
  '  Esempio:',
  '  Ecco il riepilogo del tuo pasto pronto per il salvataggio:',
  '  - 🥣 Yogurt greco 0% (100g)',
  '  - 🌰 Noci sgusciate (6g)',
  '  - 🍎 Mela (120g)',
  '',
  'MATEMATICA DINAMICA: se c\'è un limite (es. sotto le 100 kcal) e l\'utente aggiunge un alimento calorico,',
  'calcola grams = floor((residualKcal / kcal_per_100g) * 100) e proponi la porzione esatta',
  '(es. «Puoi aggiungere 🌰 6g di noci per restare nelle 100 kcal ✅»).',
  'VIETATO proporre grammature casuali o esempi statici non verificati (niente «noci 150g» inventati).',
  'Se esiste [MEAL_WIP].constraints.maxCalories, ogni weight in suggestions DEVE rispettare residualKcal.',
].join(' ');
