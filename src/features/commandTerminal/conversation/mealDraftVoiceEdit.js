/**
 * McDrive voice loop — correzioni sulla bozza pasto in sospeso (UPDATE_MEAL_DRAFT)
 * e conferma finale (CONFIRM_MEAL_DRAFT). Zero tastiera: solo microfono.
 */

import { normalizeSearchText } from '../../../foodSearch.js';

export const CONFIRM_MEAL_DRAFT = 'CONFIRM_MEAL_DRAFT';
export const UPDATE_MEAL_DRAFT = 'UPDATE_MEAL_DRAFT';
export const CANCEL_MEAL_DRAFT = 'CANCEL_MEAL_DRAFT';

const PURE_CANCEL_RE = /^(?:no|annulla|cancel|stop|niente)(?:\s*[,.!]?\s*)?$/i;
const SOFT_NO_THEN_CORRECT_RE =
  /^no\b.+(?:\d+\s*(?:g|gr|grammi)\b|gramm|metti|fai|segna|togli|rimuov|aggiung|era\b|invece|rosetta|bauletto|cambia|corregg)/i;

const GRAMS_ONLY_RE =
  /(?:^|\b)(?:metti|fai|segna|porta(?:lo)?|cambia|correggi|aggiorna)?\s*(?:a\s+|di\s+)?(\d{1,4})\s*(?:g|gr|grammi)?\b/i;
const GRAMS_FOR_FOOD_RE =
  /(\d{1,4})\s*(?:g|gr|grammi)\s+(?:di\s+|di\s+l['']|del\s+|della\s+|di\s+)?([^,;.]+?)(?:\s*$|\s*,|\s+e\s+)/i;
const FOOD_THEN_GRAMS_RE =
  /(?:(?:del|della|di|il|la|lo|l')\s+)?([^,;.]+?)\s+(?:a\s+|di\s+)?(\d{1,4})\s*(?:g|gr|grammi)\b/i;

const REMOVE_FOOD_RE =
  /\b(?:togli|rimuovi|elimina|leva|cancella)\s+(?:anche\s+)?(?:la\s+|il\s+|lo\s+|l'|i\s+|gli\s+|le\s+)?([^,;.]+?)(?:\s*$|\s*,|\s+e\s+metti|\s+per\s+favore)/i;

const ADD_FOOD_RE =
  /\b(?:aggiungi|metti\s+anche|aggiungici|in\s+pi[uù])\s+(?:anche\s+)?(?:una?\s+|un\s+|della?\s+|del\s+|di\s+)?([^,;.]+?)(?:\s*$|\s*,|\s+e\s+)/i;

const REPLACE_NON_ERA_RE =
  /\bnon\s+(?:era|è|e)\s+(?:la\s+|il\s+|lo\s+|l')?([^,;.]+?)[,.]?\s*(?:era|ma\s+(?:era|è)|invece|bens[iì])\s+(?:la\s+|il\s+|lo\s+|l')?([^,;.]+?)(?:\s*$|[.!])/i;

const REPLACE_INVECE_RE =
  /\binvece\s+(?:del|della|di|del\s+l')\s*([^,;.]+?)\s+(?:metti|segna|usa|la|il|lo|l')\s*([^,;.]+?)(?:\s*$|[.!])/i;

const REPLACE_ERA_RE =
  /\b(?:oggi\s+)?(?:ho\s+mangiato\s+)?(?:era|è)\s+(?:la\s+|il\s+|lo\s+|l')?([a-zàèéìòù][\wàèéìòù\s'-]{1,40})(?:\s*$|[.!])/i;

const REPLACE_CAMBIA_RE =
  /\b(?:cambia|sostituisci|rimpiazza)\s+(?:la\s+|il\s+|lo\s+|l')?([^,;.]+?)\s+(?:con|a)\s+(?:la\s+|il\s+|lo\s+|l')?([^,;.]+?)(?:\s*$|[.!])/i;

function expandDraftItems(payload) {
  if (Array.isArray(payload?.items) && payload.items.length > 0) {
    return payload.items
      .map((item) => ({
        foodName: String(item?.foodName || item?.name || '').trim(),
        grams: Number.isFinite(Number(item?.grams)) && Number(item.grams) > 0
          ? Math.round(Number(item.grams))
          : null,
        isEstimated: item?.isEstimated === true,
        ...(item?.spokenFoodName ? { spokenFoodName: String(item.spokenFoodName).trim() } : {}),
        ...(item?.proposedFromHabit === true ? { proposedFromHabit: true } : {}),
        ...(item?.foodDbKey != null ? { foodDbKey: item.foodDbKey } : {}),
        ...(item?.icon ? { icon: item.icon } : {}),
      }))
      .filter((item) => item.foodName);
  }
  const foodName = String(payload?.foodName || '').trim();
  if (!foodName) return [];
  return [{
    foodName,
    grams: Number.isFinite(Number(payload?.grams)) && Number(payload.grams) > 0
      ? Math.round(Number(payload.grams))
      : null,
  }];
}

function parseYesNo(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  if (
    /^(s[iì](?:\s*,?\s*(?:salva|confermo|va bene))?|ok|okay|confermo|va bene|certo|procedi|yes|yep|sure|conferma|inserisci|vai|salva)\b/.test(t)
    || /^s[iì]\s*,\s*(?:salva|va bene)\b/.test(t)
  ) {
    return 'yes';
  }
  if (/^(no(?:\s*,?\s*annulla)?|nope|annulla|stop|cancel|non confermo|rifiuto)\b/.test(t)) {
    return 'no';
  }
  return null;
}

function parseNaturalMealItems(userText) {
  const text = String(userText || '').trim();
  if (!text) return null;
  const items = [];
  const seen = new Set();
  const push = (name, grams) => {
    const foodName = String(name || '')
      .replace(/^(?:e|ed|con|di|del|della|un|una|uno)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const g = Math.round(Number(grams) || 0);
    const key = foodName.toLowerCase();
    if (!foodName || !(g > 0) || seen.has(key)) return;
    seen.add(key);
    items.push({ foodName, grams: g });
  };

  const gramsFirst =
    /(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)\b(?:\s+di\s+|\s+)([^,;]+?)(?=\s*,|\s*;\s*|\s+e\s+\d|\s*$)/gi;
  let match = gramsFirst.exec(text);
  while (match) {
    push(match[2], Number(String(match[1]).replace(',', '.')));
    match = gramsFirst.exec(text);
  }
  if (items.length === 0) {
    const nameFirst = /([^,;]+?)\s+(\d+(?:[.,]\d+)?)\s*(?:g|grammi|gr)\b/gi;
    match = nameFirst.exec(text);
    while (match) {
      push(match[1], Number(String(match[2]).replace(',', '.')));
      match = nameFirst.exec(text);
    }
  }
  return items.length > 0 ? { items } : null;
}

/** Conferma pura vocale McDrive (Sì / Confermo / Va bene). */
export function isConfirmMealDraftIntent(userText) {
  if (parseYesNo(userText) !== 'yes') return false;
  const t = String(userText || '').trim();
  if (/\d+\s*(?:g|gr|grammi)\b/i.test(t)) return false;
  if (/\b(?:togli|rimuov|aggiung|cambia|sostitu|invece|non\s+era)\b/i.test(t)) return false;
  return true;
}

/** Annullamento puro (senza correzione nella stessa frase). */
export function isCancelMealDraftIntent(userText) {
  const t = String(userText || '').trim();
  if (!t) return false;
  if (SOFT_NO_THEN_CORRECT_RE.test(t)) return false;
  if (PURE_CANCEL_RE.test(t)) return true;
  if (parseYesNo(t) === 'no' && !SOFT_NO_THEN_CORRECT_RE.test(t) && t.length <= 24) {
    return !/\d/.test(t);
  }
  return false;
}

/** L'utente vuole correggere la bozza (non un pasto nuovo). */
export function isUpdateMealDraftIntent(userText) {
  const t = String(userText || '').trim();
  if (!t) return false;
  if (isConfirmMealDraftIntent(t) || isCancelMealDraftIntent(t)) return false;
  if (/^oggi\s+[eè]\s+diverso\b/i.test(t)) return true;

  if (SOFT_NO_THEN_CORRECT_RE.test(t)) return true;
  if (REMOVE_FOOD_RE.test(t)) return true;
  if (ADD_FOOD_RE.test(t)) return true;
  if (REPLACE_NON_ERA_RE.test(t) || REPLACE_INVECE_RE.test(t) || REPLACE_CAMBIA_RE.test(t)) return true;
  if (REPLACE_ERA_RE.test(t) && !/\bho\s+mangiato\b/i.test(t)) return true;
  if (GRAMS_FOR_FOOD_RE.test(t) || FOOD_THEN_GRAMS_RE.test(t)) return true;
  if (GRAMS_ONLY_RE.test(t) && /\d/.test(t)) return true;
  if (/\b(?:metti|fai|segna)\s+\d+/i.test(t)) return true;
  if (/\bcorregg|\baggiorn\s+la\s+bozza|\bmodifica\b/i.test(t)) return true;
  if (parseNaturalMealItems(t)?.items?.length) return true;

  return false;
}

function cleanFoodPhrase(raw) {
  return String(raw || '')
    .replace(/^(?:la|il|lo|l'|un|una|uno|di|del|della|dello|dei|degli|delle)\s+/i, '')
    .replace(/\b(?:per\s+favore|grazie|oggi|prego)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findItemIndex(items, query) {
  const q = normalizeSearchText(cleanFoodPhrase(query));
  if (!q) return -1;
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < items.length; i += 1) {
    const name = normalizeSearchText(items[i]?.foodName || items[i]?.spokenFoodName || '');
    const spoken = normalizeSearchText(items[i]?.spokenFoodName || '');
    if (!name && !spoken) continue;
    if (name === q || spoken === q) return i;
    if (name.includes(q) || q.includes(name) || (spoken && (spoken.includes(q) || q.includes(spoken)))) {
      const score = Math.min(name.length, q.length);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
  }
  return best;
}

function parseGramsNumber(raw) {
  const n = Math.round(Number(String(raw || '').replace(',', '.')));
  return Number.isFinite(n) && n > 0 && n <= 5000 ? n : null;
}

/**
 * Applica una correzione vocale alla bozza in sospeso.
 * @returns {{ ok: boolean, payload?: object, intent: string, reason?: string }}
 */
export function applyVoiceCorrectionToMealDraft(draftPayload, userText) {
  const text = String(userText || '').trim();
  if (!text) {
    return { ok: false, intent: UPDATE_MEAL_DRAFT, reason: 'empty' };
  }

  let items = expandDraftItems(draftPayload).map((item) => ({ ...item }));
  if (items.length === 0) {
    return { ok: false, intent: UPDATE_MEAL_DRAFT, reason: 'empty_draft' };
  }

  let changed = false;

  const nonEra = text.match(REPLACE_NON_ERA_RE);
  if (nonEra) {
    const from = cleanFoodPhrase(nonEra[1]);
    const to = cleanFoodPhrase(nonEra[2]);
    const idx = findItemIndex(items, from);
    if (idx >= 0 && to) {
      items[idx] = {
        ...items[idx],
        foodName: to,
        spokenFoodName: to,
        proposedFromHabit: false,
        foodDbKey: null,
      };
      changed = true;
    } else if (items.length === 1 && to) {
      items[0] = {
        ...items[0],
        foodName: to,
        spokenFoodName: to,
        proposedFromHabit: false,
        foodDbKey: null,
      };
      changed = true;
    }
  }

  const invece = !changed ? text.match(REPLACE_INVECE_RE) : null;
  if (invece) {
    const from = cleanFoodPhrase(invece[1]);
    const to = cleanFoodPhrase(invece[2]);
    const idx = findItemIndex(items, from);
    if (idx >= 0 && to) {
      items[idx] = {
        ...items[idx],
        foodName: to,
        spokenFoodName: to,
        proposedFromHabit: false,
        foodDbKey: null,
      };
      changed = true;
    }
  }

  const cambia = !changed ? text.match(REPLACE_CAMBIA_RE) : null;
  if (cambia) {
    const from = cleanFoodPhrase(cambia[1]);
    const to = cleanFoodPhrase(cambia[2]);
    const idx = findItemIndex(items, from);
    if (idx >= 0 && to) {
      items[idx] = {
        ...items[idx],
        foodName: to,
        spokenFoodName: to,
        proposedFromHabit: false,
        foodDbKey: null,
      };
      changed = true;
    }
  }

  const era = !changed ? text.match(REPLACE_ERA_RE) : null;
  if (era) {
    const to = cleanFoodPhrase(era[1]);
    if (to && !/^(?:ok|bene|cosi|così)$/i.test(to)) {
      const habitIdx = items.findIndex((i) => i.proposedFromHabit || i.spokenFoodName);
      const idx = items.length === 1 ? 0 : (habitIdx >= 0 ? habitIdx : 0);
      items[idx] = {
        ...items[idx],
        foodName: to,
        spokenFoodName: to,
        proposedFromHabit: false,
        foodDbKey: null,
      };
      changed = true;
    }
  }

  const remove = text.match(REMOVE_FOOD_RE);
  if (remove) {
    const target = cleanFoodPhrase(remove[1]);
    const idx = findItemIndex(items, target);
    if (idx >= 0) {
      items = items.filter((_, i) => i !== idx);
      changed = true;
    }
  }

  const add = text.match(ADD_FOOD_RE);
  if (add) {
    const namePart = cleanFoodPhrase(add[1]);
    const gramsInAdd = namePart.match(/(\d{1,4})\s*(?:g|gr|grammi)?$/i);
    let foodName = namePart;
    let grams = 100;
    if (gramsInAdd) {
      grams = parseGramsNumber(gramsInAdd[1]) || 100;
      foodName = cleanFoodPhrase(namePart.replace(gramsInAdd[0], ''));
    }
    const parsedAdd = parseNaturalMealItems(add[0]);
    if (parsedAdd?.items?.[0]) {
      foodName = parsedAdd.items[0].foodName || foodName;
      grams = parsedAdd.items[0].grams || grams;
    }
    if (foodName) {
      items.push({ foodName, grams, isEstimated: true });
      changed = true;
    }
  }

  const gramsForFood = text.match(GRAMS_FOR_FOOD_RE);
  if (gramsForFood) {
    const grams = parseGramsNumber(gramsForFood[1]);
    const food = cleanFoodPhrase(gramsForFood[2]);
    const idx = findItemIndex(items, food);
    if (grams && idx >= 0) {
      items[idx] = { ...items[idx], grams, isEstimated: false };
      changed = true;
    }
  }

  const foodThenGrams = text.match(FOOD_THEN_GRAMS_RE);
  if (foodThenGrams) {
    const food = cleanFoodPhrase(foodThenGrams[1]);
    const grams = parseGramsNumber(foodThenGrams[2]);
    const idx = findItemIndex(items, food);
    if (grams && idx >= 0 && food.length >= 2) {
      items[idx] = { ...items[idx], grams, isEstimated: false };
      changed = true;
    }
  }

  if (!changed || (/\b(?:metti|fai|segna)\s+\d+/i.test(text) && items.length >= 1)) {
    const gramsOnly = text.match(GRAMS_ONLY_RE);
    if (gramsOnly) {
      const grams = parseGramsNumber(gramsOnly[1]);
      if (grams) {
        let idx = -1;
        for (let i = 0; i < items.length; i += 1) {
          const n = normalizeSearchText(items[i].foodName);
          const s = normalizeSearchText(items[i].spokenFoodName || '');
          if ((n && text.toLowerCase().includes(n.split(' ')[0]))
            || (s && text.toLowerCase().includes(s.split(' ')[0]))) {
            idx = i;
            break;
          }
        }
        if (idx < 0) {
          const habitIdx = items.findIndex((i) => i.proposedFromHabit);
          idx = habitIdx >= 0 ? habitIdx : 0;
        }
        if (idx >= 0) {
          items[idx] = { ...items[idx], grams, isEstimated: false };
          changed = true;
        }
      }
    }
  }

  const restated = parseNaturalMealItems(text);
  if (restated?.items?.length && (
    restated.items.length >= items.length
    || /(?:e|,)\s*\d+\s*(?:g|gr|grammi)/i.test(text)
  )) {
    items = restated.items.map((item) => ({
      foodName: item.foodName,
      grams: item.grams,
      isEstimated: false,
    }));
    changed = true;
  }

  if (!changed) {
    return { ok: false, intent: UPDATE_MEAL_DRAFT, reason: 'unparsed_correction' };
  }

  if (items.length === 0) {
    return { ok: false, intent: UPDATE_MEAL_DRAFT, reason: 'draft_empty_after_edit' };
  }

  return {
    ok: true,
    intent: UPDATE_MEAL_DRAFT,
    payload: {
      ...draftPayload,
      items,
      mealType: draftPayload?.mealType || null,
      exactTime: draftPayload?.exactTime || null,
      timeString: draftPayload?.timeString || draftPayload?.exactTime || null,
    },
  };
}

/** Messaggio vocale post-correzione McDrive. */
export function buildMcDriveUpdatedConfirmationMessage(items = []) {
  const list = Array.isArray(items) ? items.filter((i) => i?.foodName) : [];
  if (list.length === 0) {
    return "D'accordo, ho corretto. Controlla la bozza: posso salvare?";
  }

  const bits = list.map((item) => {
    const g = Math.round(Number(item.grams) || 0);
    const name = String(item.spokenFoodName || item.foodName || '').trim().toLowerCase();
    if (g > 0) return `${g} grammi di ${name}`;
    return name;
  });

  const summary = bits.length === 1
    ? bits[0]
    : `${bits.slice(0, -1).join(', ')} e ${bits[bits.length - 1]}`;

  return `D'accordo, ho corretto. Ti segno ${summary}. Posso salvare?`;
}

/** Classifica la risposta utente mentre c'è una bozza in sospeso. */
export function classifyMealDraftVoiceReply(userText) {
  if (isConfirmMealDraftIntent(userText)) return CONFIRM_MEAL_DRAFT;
  if (isCancelMealDraftIntent(userText)) return CANCEL_MEAL_DRAFT;
  if (isUpdateMealDraftIntent(userText)) return UPDATE_MEAL_DRAFT;
  if (/^oggi\s+[eè]\s+diverso\b/i.test(String(userText || '').trim())) {
    return UPDATE_MEAL_DRAFT;
  }
  return 'UNKNOWN';
}
