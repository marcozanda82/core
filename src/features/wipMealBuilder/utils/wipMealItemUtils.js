function createWipItemId() {
  return `wip_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeMacros(macros = {}) {
  return {
    prot: Number(macros.prot ?? macros.pro ?? macros.protein) || 0,
    carbo: Number(macros.carb ?? macros.carbo ?? macros.carbs) || 0,
    fat: Number(macros.fat ?? macros.fatTotal) || 0,
  };
}

/**
 * Nome UI/carrello: toglie parentesi, porzioni e grammi dal campo name.
 * Es. «pomodoro (1 Porzione...)» → «pomodoro»
 * @param {string} name
 * @returns {string}
 */
export function sanitizeWipFoodDisplayName(name) {
  let s = String(name || '').trim();
  if (!s) return '';

  // Tutto ciò che sta tra parentesi / parentesi quadre
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/\[[^\]]*\]/g, ' ');
  // Coda quantitativa tipica LLM: « - 100g», « 1 porzione», ecc.
  s = s.replace(/\s*[-–—,]?\s*\d+[.,]?\d*\s*(?:g|gr|grammi|kg|ml|kcal|calorie)\b.*$/i, ' ');
  s = s.replace(/\s*[-–—,]?\s*(?:\d+[.,]?\d*\s*)?(?:porzion[ei]|porz\.?|serving|servings)\b.*$/i, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Chiave dedup: nome pulito + lowercase (es. «Pomodoro (1 Porzione)» === «pomodoro»).
 * @param {string} name
 * @returns {string}
 */
export function normalizeWipFoodNameKey(name) {
  return sanitizeWipFoodDisplayName(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshteinDistance(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const rows = s.length + 1;
  const cols = t.length + 1;
  const prev = new Array(cols);
  const curr = new Array(cols);
  for (let j = 0; j < cols; j += 1) prev[j] = j;
  for (let i = 1; i < rows; i += 1) {
    curr[0] = i;
    const sChar = s.charCodeAt(i - 1);
    for (let j = 1; j < cols; j += 1) {
      const cost = sChar === t.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j < cols; j += 1) prev[j] = curr[j];
  }
  return prev[t.length];
}

/**
 * Match esatto o refuso tipografico (es. «pane interale» ≈ «pane integrale»).
 * @param {string} nameA
 * @param {string} nameB
 * @returns {boolean}
 */
export function wipFoodNamesMatch(nameA, nameB) {
  const a = normalizeWipFoodNameKey(nameA);
  const b = normalizeWipFoodNameKey(nameB);
  if (!a || !b) return false;
  if (a === b) return true;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 5) return false;
  const dist = levenshteinDistance(a, b);
  const allowed = maxLen <= 8 ? 1 : Math.min(2, Math.max(1, Math.floor(maxLen * 0.15)));
  if (dist > allowed) return false;

  // Stesso token iniziale → evita di fondere cibi diversi simili (es. «pane» vs «pesce»)
  const headA = a.split(' ')[0];
  const headB = b.split(' ')[0];
  if (headA && headB && headA !== headB && levenshteinDistance(headA, headB) > 1) {
    return false;
  }
  return true;
}

/**
 * Sceglie il nome pulito da mostrare in carrello (preferisce la forma più lunga / corretta).
 * @param {string} nameA
 * @param {string} nameB
 * @returns {string}
 */
export function pickPreferredWipDisplayName(nameA, nameB) {
  const cleanA = sanitizeWipFoodDisplayName(nameA);
  const cleanB = sanitizeWipFoodDisplayName(nameB);
  if (!cleanA) return cleanB;
  if (!cleanB) return cleanA;
  if (cleanA.length !== cleanB.length) {
    return cleanA.length >= cleanB.length ? cleanA : cleanB;
  }
  const aTitle = /^[A-ZÀ-Ü]/.test(cleanA);
  const bTitle = /^[A-ZÀ-Ü]/.test(cleanB);
  if (aTitle && !bTitle) return cleanA;
  if (bTitle && !aTitle) return cleanB;
  return cleanA;
}

/**
 * Hard dedup: fonda voci con lo stesso nome (case-insensitive / refusi).
 * - Stesso nome + **stesso peso** → allucinazione LLM: tienine uno (NON sommare).
 * - Stesso nome + **pesi diversi** → somma grammi e macro (es. 50g + 30g di pane).
 * Matematica pura — mai affidarsi all'AI per togliere i doppioni.
 *
 * @param {Array<object>} items
 * @param {{ keepZeroGrams?: boolean }} [opts] — true durante slot-filling (grams ancora null)
 * @returns {Array<object>}
 */
export function deduplicateWipItems(items = [], opts = {}) {
  const keepZeroGrams = opts?.keepZeroGrams === true;
  const merged = (Array.isArray(items) ? items : []).reduce((acc, current) => {
    if (!current || typeof current !== 'object') return acc;

    const rawName = String(current.foodName || current.name || '').trim();
    if (!rawName) return acc;

    const name = sanitizeWipFoodDisplayName(rawName);
    if (!name) return acc;

    const gramsRaw = current.grams ?? current.weight ?? current.qta;
    const gramsNum = Number(gramsRaw);
    const hasGrams = Number.isFinite(gramsNum) && gramsNum > 0;
    const grams = hasGrams ? Math.round(gramsNum) : 0;
    const kcal = Number(current.kcal ?? current.cal ?? current.calories) || 0;
    const prot = Number(current.prot ?? current.pro ?? current.protein) || 0;
    const carbo = Number(current.carbo ?? current.carb ?? current.carbs) || 0;
    const fat = Number(current.fat ?? current.fatTotal) || 0;

    const existingIndex = acc.findIndex(
      (item) => wipFoodNamesMatch(item?.foodName || item?.name, name),
    );

    if (existingIndex >= 0) {
      const existing = acc[existingIndex];
      const displayName = pickPreferredWipDisplayName(
        existing.foodName || existing.name,
        name,
      );
      const existingGramsRaw = Number(existing.grams);
      const existingHasGrams = Number.isFinite(existingGramsRaw) && existingGramsRaw > 0;
      const existingGrams = existingHasGrams ? Math.round(existingGramsRaw) : 0;

      // Stesso nome + stesso peso → doppione LLM: tieni una sola voce.
      if (existingHasGrams && hasGrams && existingGrams === grams) {
        acc[existingIndex] = {
          ...existing,
          name: displayName,
          foodName: displayName,
          desc: displayName,
          icon: existing.icon || current.icon || null,
          foodDbKey: existing.foodDbKey || current.foodDbKey || null,
          alternatives: existing.alternatives || current.alternatives,
          isEstimated: existing.isEstimated === true || current.isEstimated === true,
        };
        return acc;
      }

      let nextGrams;
      if (existingHasGrams || hasGrams) {
        nextGrams = (existingHasGrams ? existingGrams : 0) + (hasGrams ? grams : 0);
      } else if (keepZeroGrams) {
        nextGrams = null;
      } else {
        nextGrams = 0;
      }
      const nextKcal = (Number(existing.kcal ?? existing.cal) || 0) + kcal;
      const nextProt = (Number(existing.prot ?? existing.pro) || 0) + prot;
      const nextCarbo = (Number(existing.carbo ?? existing.carb) || 0) + carbo;
      const nextFat = (Number(existing.fat) || 0) + fat;
      const estimated = existing.isEstimated === true || current.isEstimated === true;
      acc[existingIndex] = {
        ...existing,
        ...current,
        name: displayName,
        foodName: displayName,
        desc: displayName,
        grams: nextGrams,
        weight: nextGrams,
        qta: nextGrams,
        multiplier: nextGrams == null ? null : nextGrams,
        kcal: nextKcal,
        cal: nextKcal,
        prot: nextProt,
        pro: nextProt,
        carbo: nextCarbo,
        fat: nextFat,
        id: existing.id || current.id,
        foodDbKey: existing.foodDbKey || current.foodDbKey || null,
        icon: existing.icon || current.icon || null,
        alternatives: existing.alternatives || current.alternatives,
        ...(estimated ? { isEstimated: true } : { isEstimated: false }),
      };
      return acc;
    }

    const storedGrams = hasGrams ? grams : (keepZeroGrams ? null : 0);
    acc.push({
      ...current,
      name,
      foodName: name,
      desc: name,
      grams: storedGrams,
      weight: storedGrams,
      qta: storedGrams,
      multiplier: storedGrams,
      kcal,
      cal: kcal,
      prot,
      pro: prot,
      carbo,
      fat,
    });
    return acc;
  }, []);

  if (keepZeroGrams) return merged;
  // Dopo la fusione scarta sole voci a 0g (es. LLM ha emesso un doppione vuoto)
  return merged.filter((item) => Number(item?.grams) > 0);
}

/**
 * Dedup per mealProposals / anteprima UI (shape foodName + pro/carbo/fat).
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
export function deduplicateMealProposalItems(items = []) {
  return deduplicateWipItems(items).map((item) => {
    const foodName = String(item.foodName || item.name || '').trim();
    const grams = Math.round(Number(item.grams) || 0);
    const prot = Math.round((Number(item.pro ?? item.prot) || 0) * 10) / 10;
    const carbo = Math.round((Number(item.carbo ?? item.carb) || 0) * 10) / 10;
    const fat = Math.round((Number(item.fat) || 0) * 10) / 10;
    return {
      ...item,
      foodName,
      name: foodName,
      grams,
      kcal: Math.round(Number(item.kcal ?? item.cal) || 0),
      cal: Math.round(Number(item.kcal ?? item.cal) || 0),
      pro: prot,
      prot,
      carbo,
      fat,
    };
  });
}

/**
 * Coerce grezzo → shape WIP anche con grams = 0 (serve al reduce di fusione).
 * @param {object} raw
 * @returns {object | null}
 */
export function coerceWipItemForDedup(raw = {}) {
  const strict = declarationItemToWipAlimento(raw) || suggestionToWipAlimento(raw);
  if (strict) return strict;
  const name = sanitizeWipFoodDisplayName(raw?.foodName || raw?.name);
  if (!name) return null;
  const grams = Math.round(Number(raw?.grams ?? raw?.weight ?? raw?.qta) || 0);
  const macros = normalizeMacros(raw);
  const kcal = Math.round(Number(raw?.kcal ?? raw?.calories ?? raw?.cal) || 0);
  return {
    id: raw.id || createWipItemId(),
    type: 'food',
    name,
    desc: name,
    foodName: name,
    grams,
    weight: grams,
    qta: grams,
    selectedUnit: 'g',
    multiplier: grams,
    kcal,
    cal: kcal,
    prot: macros.prot,
    carbo: macros.carbo,
    fat: macros.fat,
    source: raw.source || 'dedup_coerce',
  };
}

/**
 * Emoji nativa coerente per alimento (resoconto CONFIRM).
 * @param {string} foodName
 * @returns {string}
 */
export function foodEmojiForWipName(foodName) {
  const n = normalizeWipFoodNameKey(foodName);
  if (!n) return '🥗';
  if (/yogurt|kefir|skyr/.test(n)) return '🥣';
  if (/noc[ei]|mandorl|pistacchi|anacardi|arachidi|semi\b|lino|chia|girasole/.test(n)) return '🌰';
  if (/mel[ae]\b|mela\b/.test(n)) return '🍎';
  if (/banan/.test(n)) return '🍌';
  if (/aranc|mandarin|pompelmo|limone/.test(n)) return '🍊';
  if (/fragol|mirtill|lampone|frutti\s+di\s+bosco/.test(n)) return '🫐';
  if (/uov/.test(n)) return '🥚';
  if (/latte|latte\s+vegetale|bevanda/.test(n)) return '🥛';
  if (/pane|toast|cracker|fette|biscott/.test(n)) return '🥖';
  if (/riso|pasta|avena|fiocchi|cereali|couscous|quinoa/.test(n)) return '🍚';
  if (/pollo|tacchino|carne|manzo|maiale|prosciutto/.test(n)) return '🍗';
  if (/pesce|tonno|salmone|merluzzo|sgombro/.test(n)) return '🐟';
  if (/formaggio|parmigiano|mozzarella|ricotta/.test(n)) return '🧀';
  if (/insalat|verdura|broccoli|spinaci|zucchina|pomodor/.test(n)) return '🥗';
  if (/olio|burro|avocado/.test(n)) return '🫒';
  if (/cioccolat|cacao/.test(n)) return '🍫';
  if (/caff[eè]|espresso/.test(n)) return '☕';
  return '🥗';
}

/**
 * Unisce un alimento nel carrello: se il nome esiste già, aggiorna la quantità (no duplicati).
 * @param {Array<object>} items
 * @param {object} candidate
 * @param {{ mode?: 'replace' | 'add' }} [opts]
 * @returns {Array<object>}
 */
export function upsertWipMealItem(items = [], candidate = null, opts = {}) {
  if (!candidate || !(candidate.foodName || candidate.name)) {
    return Array.isArray(items) ? [...items] : [];
  }
  const mode = opts.mode === 'add' ? 'add' : 'replace';
  const prev = Array.isArray(items) ? [...items] : [];
  const candidateName = sanitizeWipFoodDisplayName(candidate.foodName || candidate.name);
  if (!candidateName) return deduplicateWipItems(prev);

  const normalizedCandidate = {
    ...candidate,
    name: candidateName,
    foodName: candidateName,
    desc: candidateName,
  };

  const idx = prev.findIndex(
    (item) => wipFoodNamesMatch(item?.foodName || item?.name, candidateName),
  );

  if (idx < 0) {
    prev.push(normalizedCandidate);
    return deduplicateWipItems(prev);
  }

  const existing = prev[idx];
  const existingGrams = Math.round(Number(existing?.grams ?? existing?.weight) || 0);
  const candidateGrams = Math.round(Number(normalizedCandidate?.grams ?? normalizedCandidate?.weight) || 0);
  const nextGrams = mode === 'add'
    ? existingGrams + candidateGrams
    : candidateGrams;

  if (!(nextGrams > 0)) {
    return prev.filter((_, i) => i !== idx);
  }

  const ratio = existingGrams > 0 ? nextGrams / existingGrams : 1;
  const hasCandidateMacros = ['kcal', 'cal', 'prot', 'carbo', 'fat'].some(
    (k) => Number(normalizedCandidate[k]) > 0,
  );

  let nextKcal;
  let nextProt;
  let nextCarbo;
  let nextFat;
  if (mode === 'replace' && hasCandidateMacros) {
    nextKcal = Math.round(Number(normalizedCandidate.kcal ?? normalizedCandidate.cal) || 0);
    nextProt = Number(normalizedCandidate.prot) || 0;
    nextCarbo = Number(normalizedCandidate.carbo) || 0;
    nextFat = Number(normalizedCandidate.fat) || 0;
  } else if (existingGrams > 0) {
    nextKcal = Math.round((Number(existing.kcal ?? existing.cal) || 0) * ratio);
    nextProt = Math.round((Number(existing.prot) || 0) * ratio * 10) / 10;
    nextCarbo = Math.round((Number(existing.carbo) || 0) * ratio * 10) / 10;
    nextFat = Math.round((Number(existing.fat) || 0) * ratio * 10) / 10;
  } else {
    nextKcal = Math.round(Number(normalizedCandidate.kcal ?? normalizedCandidate.cal) || 0);
    nextProt = Number(normalizedCandidate.prot) || 0;
    nextCarbo = Number(normalizedCandidate.carbo) || 0;
    nextFat = Number(normalizedCandidate.fat) || 0;
  }

  const displayName = pickPreferredWipDisplayName(
    existing.foodName || existing.name,
    candidateName,
  );
  prev[idx] = {
    ...existing,
    ...normalizedCandidate,
    id: existing.id || normalizedCandidate.id,
    name: displayName,
    desc: displayName,
    foodName: displayName,
    grams: nextGrams,
    weight: nextGrams,
    qta: nextGrams,
    multiplier: nextGrams,
    kcal: nextKcal,
    cal: nextKcal,
    prot: nextProt,
    carbo: nextCarbo,
    fat: nextFat,
  };
  return deduplicateWipItems(prev);
}

/**
 * Dedup / upsert batch per nome alimento.
 * Hard-reduce sull'incoming (somma grammi) poi merge nel carrello.
 * @param {Array<object>} baseItems
 * @param {Array<object>} incomingItems
 * @param {{ mode?: 'replace' | 'add' }} [opts]
 * @returns {Array<object>}
 */
export function mergeWipMealItemsByName(baseItems = [], incomingItems = [], opts = {}) {
  const incoming = deduplicateWipItems(
    (Array.isArray(incomingItems) ? incomingItems : [])
      .map((raw) => coerceWipItemForDedup(raw))
      .filter(Boolean),
  );
  let next = deduplicateWipItems(Array.isArray(baseItems) ? baseItems : []);
  incoming.forEach((candidate) => {
    next = upsertWipMealItem(next, candidate, opts);
  });
  return deduplicateWipItems(next);
}

/**
 * Resoconto CONFIRM: elenco Markdown pulito (niente JSON), tono informale.
 * @param {Array<object>} items
 * @param {{ displayName?: string, mealType?: string }} [opts]
 * @returns {string}
 */
export function buildWipConfirmAdviceMessage(items = [], opts = {}) {
  const list = (Array.isArray(items) ? items : [])
    .map((item) => {
      const name = String(item?.foodName || item?.name || '').trim();
      const grams = Math.round(Number(item?.grams ?? item?.weight ?? item?.qta) || 0);
      if (!name || grams <= 0) return null;
      return `- ${foodEmojiForWipName(name)} ${name} (${grams}g)`;
    })
    .filter(Boolean);

  const displayName = String(opts.displayName || '').trim();
  const mealKey = String(opts.mealType || '').trim().toLowerCase().split('_')[0];
  const mealWord = ({
    colazione: 'colazione',
    snack: 'snack',
    pranzo: 'pranzo',
    cena: 'cena',
  })[mealKey] || 'pasto';
  const prefix = displayName ? `${displayName}, ` : '';
  const lead = `${prefix}ecco il tuo ${mealWord} pronto da confermare.`;

  if (list.length === 0) {
    return `${lead}\n\n(nessun alimento nel carrello)`;
  }

  return [lead, '', ...list].join('\n');
}

/**
 * Normalizza un alimento dichiarato dall'utente o dal parser.
 * @param {object} raw
 * @returns {object | null}
 */
export function declarationItemToWipAlimento(raw = {}) {
  const name = sanitizeWipFoodDisplayName(raw.foodName || raw.name);
  const grams = Math.round(Number(raw.grams ?? raw.weight ?? raw.qta) || 0);
  if (!name || grams <= 0) return null;

  const macros = normalizeMacros(raw);
  const kcal = Math.round(Number(raw.kcal ?? raw.calories ?? raw.cal) || 0);

  return {
    id: createWipItemId(),
    type: 'food',
    name,
    desc: name,
    foodName: name,
    grams,
    weight: grams,
    qta: grams,
    selectedUnit: 'g',
    multiplier: grams,
    kcal,
    cal: kcal,
    prot: macros.prot,
    carbo: macros.carbo,
    fat: macros.fat,
    source: 'user_declaration',
  };
}

/**
 * Normalizza un suggerimento LLM (Smart Chip) in alimento WIP.
 * @param {object} suggestion
 * @returns {object | null}
 */
export function suggestionToWipAlimento(suggestion = {}) {
  const name = sanitizeWipFoodDisplayName(suggestion.name || suggestion.foodName);
  const grams = Math.round(Number(suggestion.weight ?? suggestion.grams) || 0);
  if (!name || grams <= 0) return null;

  const macros = normalizeMacros(suggestion.macros || suggestion);
  const kcal = Math.round(Number(suggestion.calories ?? suggestion.kcal ?? suggestion.cal) || 0);

  return {
    id: createWipItemId(),
    type: 'food',
    name,
    desc: name,
    foodName: name,
    grams,
    weight: grams,
    qta: grams,
    selectedUnit: 'g',
    multiplier: grams,
    kcal,
    cal: kcal,
    prot: macros.prot,
    carbo: macros.carbo,
    fat: macros.fat,
    reason: String(suggestion.reason || '').trim() || null,
    source: 'llm_suggestion',
  };
}

/**
 * Chiave stabile per tracciare chip già aggiunti.
 * @param {object} suggestion
 * @param {number} [index]
 * @returns {string}
 */
export function buildSuggestionChipId(suggestion = {}, index = 0) {
  const name = normalizeWipFoodNameKey(suggestion.name || suggestion.foodName);
  const grams = Math.round(Number(suggestion.weight ?? suggestion.grams) || 0);
  return `${name}_${grams}_${index}`;
}

export function computeWipMealTotals(items = []) {
  return (Array.isArray(items) ? items : []).reduce(
    (acc, item) => ({
      kcal: acc.kcal + (Number(item?.kcal ?? item?.cal) || 0),
      pro: acc.pro + (Number(item?.prot) || 0),
      carbo: acc.carbo + (Number(item?.carbo) || 0),
      fat: acc.fat + (Number(item?.fat) || 0),
    }),
    { kcal: 0, pro: 0, carbo: 0, fat: 0 },
  );
}

/**
 * Serializza items WIP per prompt LLM.
 * @param {Array<object>} items
 * @returns {Array<object>}
 */
export function serializeWipMealItemsForPrompt(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    foodName: String(item?.foodName || item?.name || '').trim(),
    grams: Math.round(Number(item?.grams ?? item?.weight) || 0),
    kcal: Math.round(Number(item?.kcal ?? item?.cal) || 0),
    pro: Number(item?.prot) || 0,
    carbo: Number(item?.carbo) || 0,
    fat: Number(item?.fat) || 0,
  })).filter((item) => item.foodName && item.grams > 0);
}
