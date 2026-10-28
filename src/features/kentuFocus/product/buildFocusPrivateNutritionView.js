/**
 * Vista nutrizionale privata Focus (Ieri / andamenti Settimana·Mese).
 * Usa il diario in memoria dell'utente autenticato — nomi reali, non foodDbKey redatti.
 * Separata dall'export essential (che continua a redigere identificativi).
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import {
  collectDayLogForNutritionWithQuality,
  normalizeFoodEvents,
  resolveFocusMealIdentity,
  resolveFoodClockHourDetailed,
} from '../normalize/normalizeFoodEvents.js';
import { compareMealSlots } from '../normalize/focusMealSlots.js';
import { isUnresolvedMealDraftItem } from '../../../utils/mealDraftStatus.js';
import { finiteNumber } from '../normalize/logUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import {
  aggregateDayMicronutrients,
  FOCUS_LAB_MICRONUTRIENT_KEYS,
  FOCUS_NUTRIENT_AVAILABILITY,
  resolveMicronutrientPresence,
} from '../lab/focusLabMicronutrients.js';
import {
  buildNutritionCoachEvidence,
  FOCUS_COACH_MICRO_KEYS,
  isNutrientUnusable,
  mapAnomalyFlagsToUnusableNutrients,
  withUsability,
} from '../lab/focusLabNutritionUsability.js';

const FOOD_TYPES = new Set(['food', 'recipe']);

const MEAL_LABELS = Object.freeze({
  colazione: 'Colazione',
  pranzo: 'Pranzo',
  cena: 'Cena',
  snack: 'Spuntino',
  unknown: 'Pasto',
});

/**
 * @param {number|null|undefined} hour
 */
function formatClock(hour) {
  if (hour == null || !Number.isFinite(hour)) return null;
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * @param {object} item
 */
function foodDisplayName(item) {
  return String(item?.name || item?.desc || item?.label || item?.foodName || '').trim();
}

/**
 * @param {object} item
 */
function foodGrams(item) {
  return finiteNumber(
    item?.grams ?? item?.g ?? item?.qty ?? item?.qta ?? item?.weight ?? item?.quantity,
  );
}

const MICRO_NATURAL = Object.freeze({
  omega3: 'omega-3',
  omega6: 'omega-6',
  k: 'potassio',
  mg: 'magnesio',
  vitB12: 'vitamina B12',
});

const BANNED_COACH_PHRASE_RE = /nessuna carenza automatica|nessun effetto inventato|dato del diario|copertura sufficiente|copertura insufficiente|nessun effetto metabolico|non significa carenza/i;

/**
 * Nomi alimento sicuri dal diario (mai foodDbKey / id redatti).
 * @param {object[]} meals
 * @param {object[]} foodContributions
 * @returns {string[]}
 */
function collectDiaryFoodNames(meals, foodContributions) {
  /** @type {string[]} */
  const names = [];
  const push = (raw) => {
    const n = String(raw || '').trim();
    if (!n) return;
    if (/^db[_-]?key/i.test(n) || /^diary:/i.test(n)) return;
    if (!names.includes(n)) names.push(n);
  };
  for (const meal of meals || []) {
    for (const item of meal.items || []) {
      push(item?.name);
    }
  }
  for (const row of foodContributions || []) {
    if (row?.labelRedacted) continue;
    push(row?.name);
  }
  return names;
}

/**
 * Etichette pasto presenti (es. Pranzo, Cena).
 * @param {object[]} meals
 */
function collectMealLabels(meals) {
  /** @type {string[]} */
  const labels = [];
  for (const meal of meals || []) {
    const label = String(meal.mealLabel || MEAL_LABELS[meal.mealType] || '').trim();
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

/**
 * Una osservazione nutriente legata a un alimento nominato, se attendibile.
 * @param {object} coachEvidence
 */
function pickNamedNutrientObservation(coachEvidence) {
  const contribs = coachEvidence?.foodContributions || [];
  const micros = coachEvidence?.micronutrients || {};
  /** Preferenza: omega-3, proteine non qui (macro), poi B12, potassio, magnesio */
  const order = ['omega3', 'vitB12', 'k', 'mg', 'omega6'];
  for (const key of order) {
    const dayMicro = micros[key];
    if (!dayMicro?.usableForObservation || dayMicro.value == null) continue;
    const donors = contribs.filter(
      (c) => !c.labelRedacted
        && c.name
        && c.contributions?.[key]?.usableForObservation
        && c.contributions[key].value != null,
    );
    if (!donors.length) continue;
    donors.sort((a, b) => (b.contributions[key].value || 0) - (a.contributions[key].value || 0));
    const top = donors[0];
    const label = MICRO_NATURAL[key] || key;
    return {
      key,
      text: `Da ${top.name} arriva un contributo chiaro di ${label}.`,
    };
  }
  return null;
}

/**
 * Commento coach: naturale, concreto, max 2 osservazioni + 1 azione.
 * Coperture/%/anomalie restano fuori dal testo (nei dettagli / toVerify).
 * @param {{
 *   mealCount?: number,
 *   meals?: object[],
 *   totals?: object,
 *   coachEvidence?: object,
 * }} input
 */
export function buildPrivateNutritionComment(input) {
  const meals = Array.isArray(input.meals) ? input.meals : [];
  const mealCount = meals.length || Number(input.mealCount) || 0;
  const coachEvidence = input.coachEvidence || {};
  const foodNames = collectDiaryFoodNames(meals, coachEvidence.foodContributions);
  const mealLabels = collectMealLabels(meals);

  /** Note tecniche per dettagli (non nel commento coach). */
  /** @type {string[]} */
  const technicalNotes = [];
  const micros = coachEvidence.micronutrients || {};
  for (const key of FOCUS_COACH_MICRO_KEYS) {
    const m = micros[key];
    if (!m) continue;
    const label = MICRO_NATURAL[key] || key;
    const pct = Math.round((m.completenessRatio || 0) * 100);
    if (m.usableForObservation) {
      technicalNotes.push(`${label}: osservabile · copertura dati ${pct}%`);
    } else {
      technicalNotes.push(`${label}: copertura dati ${pct}% · non usata per osservazioni`);
    }
  }
  for (const ex of coachEvidence.excludedFromAdvice || []) {
    if (ex.reason === 'fibre_on_fish_like_name') {
      technicalNotes.push('Fibre su alimento simile al pesce: da verificare (escluse dai giudizi).');
    }
    if (ex.reason === 'daily_fiber_unusually_high') {
      technicalNotes.push('Totale fibre giornaliero insolitamente alto: escluso dai giudizi.');
    }
  }

  if (mealCount <= 0) {
    return {
      text: 'Per oggi non ci sono pasti da commentare.',
      basedOnReliableEvidenceOnly: true,
      technicalNotes,
    };
  }

  if (foodNames.length === 0) {
    return {
      text: 'Hai dei pasti registrati, ma senza i nomi degli alimenti mi fermo qui: '
        + 'nei dettagli trovi i numeri disponibili.',
      basedOnReliableEvidenceOnly: true,
      technicalNotes,
    };
  }

  /** @type {string[]} */
  const sentences = [];

  // Apertura: alimenti reali + varietà pasti
  const formatNameList = (names) => {
    if (names.length <= 1) return names[0] || '';
    if (names.length === 2) return `${names[0]} e ${names[1]}`;
    if (names.length === 3) return `${names[0]}, ${names[1]} e ${names[2]}`;
    return `${names.slice(0, 3).join(', ')} e altri`;
  };
  const nameList = formatNameList(foodNames);
  if (mealLabels.length >= 2) {
    sentences.push(
      `Nel diario compaiono ${nameList}, distribuiti su ${mealLabels.join(' e ').toLowerCase()}.`,
    );
  } else if (mealLabels.length === 1) {
    sentences.push(`Nel diario, a ${mealLabels[0].toLowerCase()}, compaiono ${nameList}.`);
  } else {
    sentences.push(`Nel diario compaiono ${nameList}.`);
  }

  /** @type {string[]} */
  const observations = [];

  const nutrientObs = pickNamedNutrientObservation(coachEvidence);
  if (nutrientObs) observations.push(nutrientObs.text);

  const protein = input.totals?.proteinG;
  if (
    observations.length < 2
    && protein?.usableForJudgement
    && protein.value != null
    && protein.value >= 40
  ) {
    observations.push(
      foodNames.length === 1
        ? `Con ${foodNames[0]} porti già una buona quantità di proteine.`
        : 'Tra questi alimenti c’è un apporto proteico solido.',
    );
  }

  const kcal = input.totals?.kcal;
  if (
    observations.length < 2
    && !nutrientObs
    && kcal?.usableForJudgement
    && kcal.value != null
  ) {
    observations.push('L’energia del giorno è leggibile dai pasti che hai segnato.');
  }

  const dist = coachEvidence.mealDistribution;
  if (
    observations.length < 2
    && dist?.usableForObservation
    && mealLabels.length >= 2
  ) {
    observations.push('La giornata è spalmata su più pasti, non concentrata in uno solo.');
  }

  const excluded = coachEvidence.excludedFromAdvice || [];
  const fishFibreItem = (meals || [])
    .flatMap((m) => m.items || [])
    .find((it) => (it.toVerify || []).some((f) => f.reason === 'fibre_on_fish_like_name'));
  const fishName = fishFibreItem?.name && String(fishFibreItem.name).trim()
    ? String(fishFibreItem.name).trim()
    : null;

  // Max due osservazioni nel corpo
  for (const obs of observations.slice(0, 2)) {
    sentences.push(obs);
  }

  // Una azione pratica
  let action;
  if (fishName) {
    action = `Prossima cosa utile: ricontrolla le fibre indicate su ${fishName}.`;
  } else if (excluded.some((e) => e.reason === 'daily_fiber_unusually_high')) {
    action = 'Prossima cosa utile: dai un’occhiata al totale fibre nei dettagli.';
  } else if (mealCount === 1) {
    action = 'Se puoi, registra anche gli altri pasti della giornata.';
  } else if (nutrientObs?.key === 'omega3') {
    action = 'Quando ti torna comodo, ripeti un alimento simile ricco di omega-3.';
  } else {
    action = 'Continua a segnare gli alimenti con nome e quantità: così il quadro resta chiaro.';
  }
  sentences.push(action);

  const text = sentences.join(' ');
  if (BANNED_COACH_PHRASE_RE.test(text)) {
    return {
      text: foodNames.length
        ? `Hai registrato ${nameList}. Nei dettagli trovi i controlli sui dati.`
        : 'Hai dei pasti registrati; nei dettagli trovi i controlli sui dati.',
      basedOnReliableEvidenceOnly: true,
      technicalNotes,
    };
  }

  return {
    text,
    basedOnReliableEvidenceOnly: true,
    technicalNotes,
  };
}

/**
 * @param {object|null|undefined} analysisDayNode
 */
function buildYesterdayMealsBlock(analysisDayNode) {
  const foodPack = normalizeFoodEvents(analysisDayNode);
  const mealTimes = analysisDayNode?.mealTimes && typeof analysisDayNode.mealTimes === 'object'
    ? analysisDayNode.mealTimes
    : {};
  const { dayLog } = collectDayLogForNutritionWithQuality(analysisDayNode);
  const foods = dayLog.filter(
    (e) => e && FOOD_TYPES.has(e.type) && !isUnresolvedMealDraftItem(e),
  );

  const plausibility = foodPack.nutrition?.plausibility || null;
  const usability = mapAnomalyFlagsToUnusableNutrients(plausibility?.flags || []);
  const microTotals = aggregateDayMicronutrients(foods);

  /** @type {Map<string, { identity: object, items: object[], clockHour: number|null }>} */
  const bySlot = new Map();
  for (const item of foods) {
    const identity = resolveFocusMealIdentity(item);
    const key = identity.mealSlotId;
    if (!bySlot.has(key)) {
      bySlot.set(key, { identity, items: [], clockHour: null });
    }
    const bucket = bySlot.get(key);
    bucket.items.push(item);
    const clock = resolveFoodClockHourDetailed(item, mealTimes);
    if (clock.hour != null && (bucket.clockHour == null || clock.hour > bucket.clockHour)) {
      bucket.clockHour = clock.hour;
    }
  }

  const sorted = [...bySlot.values()].sort((a, b) => compareMealSlots({
    mealSlotId: a.identity.mealSlotId,
    canonicalMealType: a.identity.canonicalMealType,
    clockHour: a.clockHour,
  }, {
    mealSlotId: b.identity.mealSlotId,
    canonicalMealType: b.identity.canonicalMealType,
    clockHour: b.clockHour,
  }));

  const meals = sorted.map((slot) => {
    const items = slot.items.map((item) => {
      const itemId = item?.id != null ? String(item.id) : null;
      const name = foodDisplayName(item) || null;
      const grams = foodGrams(item);
      const kcal = finiteNumber(item?.kcal ?? item?.cal);
      const proteinG = finiteNumber(item?.prot ?? item?.proteinG);
      const carbG = finiteNumber(item?.carb ?? item?.carbs);
      const fatG = finiteNumber(item?.fat ?? item?.fatTotal);
      const fiberG = finiteNumber(item?.fibre ?? item?.fiber ?? item?.fiberG);

      // Solo anomalie DI ITEM (es. fibre su pesce). Il totale giorno NON si propaga su ogni alimento.
      const emptyDay = new Set();
      const itemFibreFlag = usability.byItemId.get(String(itemId || ''))?.has('fiberG');
      const fiberUnusable = Boolean(itemFibreFlag);

      /** @type {Record<string, object>} */
      const micros = {};
      for (const key of FOCUS_LAB_MICRONUTRIENT_KEYS) {
        const resolved = resolveMicronutrientPresence(item, key);
        const unusable = isNutrientUnusable(itemId, key, usability.byItemId, emptyDay);
        const available = resolved.availability === FOCUS_NUTRIENT_AVAILABILITY.present
          || resolved.availability === FOCUS_NUTRIENT_AVAILABILITY.real_zero;
        micros[key] = withUsability(
          {
            ...resolved.metric,
            availability: resolved.availability,
          },
          !unusable && available,
          unusable ? 'item_anomaly' : (available ? null : resolved.availability),
        );
      }

      /** @type {object[]} */
      const itemToVerify = [];
      if (fiberUnusable) {
        itemToVerify.push({
          nutrient: 'fiberG',
          reason: 'fibre_on_fish_like_name',
          value: fiberG,
          scope: 'item',
        });
      }
      const itemKcalUnusable = isNutrientUnusable(itemId, 'kcal', usability.byItemId, emptyDay);
      if (itemKcalUnusable) {
        itemToVerify.push({
          nutrient: 'kcal',
          reason: 'kcal_per_gram_implausible',
          value: kcal,
          scope: 'item',
        });
      }

      const foodDbKey = item?.foodDbKey != null && String(item.foodDbKey).trim()
        ? String(item.foodDbKey).trim()
        : (item?.matchedKey != null && String(item.matchedKey).trim()
          ? String(item.matchedKey).trim()
          : null);
      const semanticTags = item?.semanticTags && typeof item.semanticTags === 'object'
        && !Array.isArray(item.semanticTags)
        ? { ...item.semanticTags }
        : null;
      const novaScore = Number.isFinite(Number(item?.novaScore))
        ? Number(item.novaScore)
        : null;

      return {
        id: itemId,
        name,
        nameSource: 'diary_display_fields',
        foodDbKey,
        matchedKey: foodDbKey,
        semanticTags,
        ...(novaScore != null ? { novaScore } : {}),
        grams,
        macros: {
          kcal,
          proteinG,
          carbG,
          fatG,
          fiberG: withUsability(
            fiberG == null
              ? { value: null, provenance: 'missing' }
              : { value: fiberG, provenance: 'recorded', unit: 'g' },
            !fiberUnusable && fiberG != null,
            fiberUnusable ? 'fibre_on_fish_like_name' : null,
          ),
        },
        micronutrients: micros,
        toVerify: itemToVerify,
      };
    });

    const slotKcal = items.reduce((s, it) => s + (Number(it.macros.kcal) || 0), 0);
    const slotProt = items.reduce((s, it) => s + (Number(it.macros.proteinG) || 0), 0);
    const slotCarb = items.reduce((s, it) => s + (Number(it.macros.carbG) || 0), 0);
    const slotFat = items.reduce((s, it) => s + (Number(it.macros.fatG) || 0), 0);

    return {
      mealSlotId: slot.identity.mealSlotId,
      mealType: slot.identity.canonicalMealType,
      mealLabel: MEAL_LABELS[slot.identity.canonicalMealType] || MEAL_LABELS.unknown,
      clockHour: slot.clockHour,
      clockLabel: formatClock(slot.clockHour),
      itemCount: items.length,
      distribution: {
        kcal: Math.round(slotKcal * 10) / 10,
        proteinG: Math.round(slotProt * 10) / 10,
        carbG: Math.round(slotCarb * 10) / 10,
        fatG: Math.round(slotFat * 10) / 10,
      },
      items,
    };
  });

  const dayFiberUnusable = usability.dayNutrients.has('fiberG');
  const totals = {
    kcal: withUsability(
      foodPack.nutrition.totals.kcal,
      foodPack.nutrition.totals.kcal?.provenance !== 'missing',
      null,
    ),
    proteinG: withUsability(
      foodPack.nutrition.totals.proteinG,
      foodPack.nutrition.totals.proteinG?.provenance !== 'missing',
      null,
    ),
    carbG: withUsability(
      foodPack.nutrition.totals.carbG,
      foodPack.nutrition.totals.carbG?.provenance !== 'missing',
      null,
    ),
    fatG: withUsability(
      foodPack.nutrition.totals.fatG,
      foodPack.nutrition.totals.fatG?.provenance !== 'missing',
      null,
    ),
    fiberG: withUsability(
      foodPack.nutrition.totals.fiberG,
      !dayFiberUnusable && foodPack.nutrition.totals.fiberG?.provenance !== 'missing',
      dayFiberUnusable ? 'daily_fiber_unusually_high' : null,
    ),
    micronutrients: microTotals,
  };

  const coachEvidence = buildNutritionCoachEvidence({
    foods,
    meals,
    micronutrientTotals: microTotals,
    plausibility,
    timingCoverage: foodPack.nutrition.timingCoverage || null,
    includeFoodLabels: true,
  });

  const comment = buildPrivateNutritionComment({
    mealCount: meals.length,
    meals,
    totals,
    coachEvidence,
  });

  /** @type {object[]} */
  const toVerify = [];
  for (const meal of meals) {
    for (const item of meal.items) {
      for (const flag of item.toVerify || []) {
        toVerify.push({
          mealSlotId: meal.mealSlotId,
          foodName: item.name,
          scope: 'item',
          ...flag,
        });
      }
    }
  }
  // Anomalie aggregate (giorno): separate, non duplicate sugli alimenti.
  for (const ex of coachEvidence.excludedFromAdvice || []) {
    if (ex.scope === 'day') {
      toVerify.push({
        scope: 'day',
        nutrient: ex.nutrient,
        reason: ex.reason,
        value: ex.fiberG ?? null,
        foodName: null,
      });
    }
  }

  return {
    hasFood: foodPack.hasFood,
    meals,
    totals,
    plausibility,
    coachEvidence,
    comment,
    toVerify,
    privacy: {
      mode: 'private_authenticated_diary',
      foodNamesIncluded: true,
      foodNamesSource: 'diary_name_desc_label_foodName',
      catalogKeysNotUsedAsNames: true,
      essentialExportUnaffected: true,
    },
  };
}

/**
 * Andamenti solo su giorni con cibo registrato — niente aggregazioni inventate.
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {number} windowDays
 */
function buildAvailableNutritionTrends(fullHistory, analysisDate, windowDays) {
  if (!isIsoDateString(analysisDate) || windowDays < 1) {
    return {
      available: false,
      reason: 'invalid_window',
      daysWithFood: 0,
      series: [],
      note: 'Nessun andamento disponibile.',
    };
  }

  /** @type {object[]} */
  const series = [];
  let daysWithFood = 0;

  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const node = getTrackerDayNode(fullHistory, date);
    if (!node) {
      series.push({
        date,
        status: 'missing_node',
        kcal: null,
        proteinG: null,
      });
      continue;
    }
    const pack = normalizeFoodEvents(node);
    if (!pack.hasFood) {
      series.push({
        date,
        status: 'no_food_log',
        kcal: null,
        proteinG: null,
      });
      continue;
    }
    daysWithFood += 1;
    series.push({
      date,
      status: 'recorded',
      kcal: pack.kentuTotals?.kcal ?? null,
      proteinG: pack.kentuTotals?.prot ?? null,
      fiberG: pack.kentuTotals?.fibre ?? null,
    });
  }

  const recorded = series.filter((s) => s.status === 'recorded');
  const avg = (key) => {
    const nums = recorded.map((s) => s[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    if (!nums.length) return null;
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
  };

  return {
    available: daysWithFood > 0,
    reason: daysWithFood > 0 ? null : 'no_recorded_food_days',
    windowDays,
    daysWithFood,
    daysInWindow: windowDays,
    averagesFromRecordedDaysOnly: {
      kcal: avg('kcal'),
      proteinG: avg('proteinG'),
      /** Media fibra solo informativa; non usata per giudizi se giorni sospetti. */
      fiberG: avg('fiberG'),
    },
    series,
    note: daysWithFood > 0
      ? 'Medie calcolate solo sui giorni con cibo registrato; giorni mancanti esclusi (non trattati come zero).'
      : 'Nessun giorno con cibo registrato nella finestra: nessun andamento inventato.',
    judgement: null,
  };
}

/**
 * @param {{
 *   periodId: string,
 *   fullHistory?: object|null,
 *   analysisDate?: string|null,
 *   publicationDate?: string|null,
 *   uid?: string|null,
 *   source?: 'handoff'|'demo'|'none',
 * }} input
 */
export function buildFocusPrivateNutritionView(input) {
  const periodId = String(input.periodId || 'ieri').toLowerCase();
  const fullHistory = input.fullHistory && typeof input.fullHistory === 'object'
    ? input.fullHistory
    : null;
  const analysisDate = isIsoDateString(input.analysisDate) ? input.analysisDate : null;
  const publicationDate = isIsoDateString(input.publicationDate) ? input.publicationDate : null;
  const source = input.source || (fullHistory ? 'handoff' : 'none');

  const base = {
    schema: 'kentu.focusPrivateNutritionView.v1',
    periodId,
    uidBound: input.uid ? String(input.uid) : null,
    source,
    analysisDate,
    publicationDate,
    privacySeparation: {
      privateDiaryView: true,
      essentialExportRedactsFoodIds: true,
      note: 'Questa vista privata non è l’export essential.',
    },
  };

  if (!fullHistory || !analysisDate) {
    return {
      ...base,
      ok: false,
      empty: true,
      reason: 'no_diary_snapshot',
      ieri: null,
      trends: null,
      message: 'Diario non disponibile in sessione. Apri Focus dalla home Kentu dopo il caricamento dello storico.',
    };
  }

  if (periodId === 'ieri') {
    const node = getTrackerDayNode(fullHistory, analysisDate);
    const ieri = node
      ? buildYesterdayMealsBlock(node)
      : {
        hasFood: false,
        meals: [],
        totals: null,
        comment: {
          text: 'Nessun nodo diario per il giorno di analisi.',
          basedOnReliableEvidenceOnly: true,
        },
        toVerify: [],
        coachEvidence: null,
        privacy: {
          mode: 'private_authenticated_diary',
          foodNamesIncluded: true,
          catalogKeysNotUsedAsNames: true,
          essentialExportUnaffected: true,
        },
      };

    return {
      ...base,
      ok: true,
      empty: !ieri.hasFood,
      ieri,
      trends: null,
    };
  }

  const windowDays = periodId === 'mese' ? 30 : 7;
  const trends = buildAvailableNutritionTrends(fullHistory, analysisDate, windowDays);

  return {
    ...base,
    ok: true,
    empty: !trends.available,
    ieri: null,
    trends,
  };
}
