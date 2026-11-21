/**
 * Dettaglio pasti / liquidi / notte per MCP (sola lettura).
 * Usato da kentu_get_day e kentu_get_evenings.
 *
 * Sonno: stessa fonte del pilastro Focus — notte pubblicata su date+1
 * (normalizeSleepNight / storage mattutino).
 */

import { summarizeNutrientTotalByGrams } from '../../src/utils/nutrientTotalCoverage.js';
import { addDaysIso, isIsoDate } from './dates.js';
import {
  finite,
  readFibreGrams,
  readMacroGrams,
  readSodiumMg,
} from './nutrientRead.js';

const DINNER_KEYS = /^(cena|dinner)/i;
const EVENING_HOUR = 18;
const CAFFEINE_AFTER_HOUR = 14;
const MAX_EVENINGS_DAYS = 90;

function mealGrams(meal) {
  return finite(meal?.grams);
}

function coverageFields(prefix, summary) {
  return {
    [`${prefix}Mg`]: summary.value,
    [`${prefix}Coverage`]: {
      known: summary.coverage.known,
      missing: summary.coverage.missing,
    },
    [`${prefix}Incomplete`]: summary.incomplete,
    [`${prefix}Note`]: summary.note,
  };
}

function coverageFieldsFibre(prefix, summary) {
  return {
    [`${prefix}G`]: summary.value,
    [`${prefix}Coverage`]: {
      known: summary.coverage.known,
      missing: summary.coverage.missing,
    },
    [`${prefix}Incomplete`]: summary.incomplete,
    [`${prefix}Note`]: summary.note,
  };
}

function trackerNode(fullHistory, date) {
  return fullHistory?.[`trackerStorico_${date}`] || null;
}

function asArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function flattenDiaryEntries(node) {
  const out = [];
  for (const entry of asArray(node?.log || node?.dati?.log)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'meal' && Array.isArray(entry.items)) {
      for (const item of entry.items) {
        if (!item || typeof item !== 'object') continue;
        out.push({
          ...item,
          mealType: item.mealType || entry.mealId || entry.mealType || null,
          mealTime: item.mealTime ?? entry.mealTime ?? null,
        });
      }
      continue;
    }
    out.push(entry);
  }
  for (const entry of asArray(node?.manualNodes)) {
    if (entry && typeof entry === 'object') out.push(entry);
  }
  return out;
}

function round1(value) {
  const n = finite(value);
  return n == null ? null : Math.round(n * 10) / 10;
}

function hourOf(entry, mealTimes = null) {
  const direct = finite(entry?.mealTime ?? entry?.time ?? entry?.hour);
  if (direct != null && direct >= 0 && direct <= 24) return direct;
  const slot = String(entry?.mealType || entry?.mealId || '').trim();
  if (slot && mealTimes && mealTimes[slot] != null) {
    const fromMap = finite(mealTimes[slot]);
    if (fromMap != null) return fromMap;
  }
  return null;
}

function isFoodLike(entry) {
  const type = String(entry?.type || '').toLowerCase();
  if (type === 'food' || type === 'recipe') return true;
  if (type === 'water' || type === 'alcohol' || type === 'sleep' || type === 'workout') return false;
  if (entry?.foodName || entry?.kcal != null || entry?.condimentKind) return true;
  return false;
}

function isDinner(entry) {
  const slot = String(entry?.mealType || entry?.mealId || '').trim();
  if (DINNER_KEYS.test(slot)) return true;
  const h = hourOf(entry);
  return h != null && h >= EVENING_HOUR;
}

/**
 * @param {object|null|undefined} fullHistory
 * @param {string} date
 */
export function buildDayMealsDetail(fullHistory, date) {
  const node = trackerNode(fullHistory, date);
  const mealTimes = node?.mealTimes && typeof node.mealTimes === 'object' ? node.mealTimes : {};
  const entries = flattenDiaryEntries(node);
  const meals = [];
  const foodsMissingSodium = [];
  const foodsMissingFibre = [];
  let caffeineMg = 0;
  let caffeineKnown = false;

  for (const entry of entries) {
    if (!isFoodLike(entry)) continue;
    const grams = finite(entry.grams ?? entry.qta ?? entry.weight ?? entry.qty);
    const kcal = finite(entry.kcal ?? entry.cal);
    const prot = readMacroGrams(entry, 'prot');
    const carb = readMacroGrams(entry, 'carb');
    const fat = readMacroGrams(entry, 'fat');
    const fibreRead = readFibreGrams(entry);
    const sodiumRead = readSodiumMg(entry);
    const name = entry.name || entry.foodName || entry.desc || 'Alimento';
    const caffeine = finite(entry.caffeineMg);
    if (caffeine != null && caffeine > 0) {
      caffeineMg += caffeine;
      caffeineKnown = true;
    }
    if (sodiumRead.value == null) foodsMissingSodium.push(name);
    if (fibreRead.value == null) foodsMissingFibre.push(name);
    meals.push({
      name,
      mealType: entry.mealType || entry.mealId || null,
      time: hourOf(entry, mealTimes),
      grams,
      kcal,
      prot,
      carb,
      fat,
      fibre: fibreRead.value,
      // Sempre mg della porzione (mai g, mai ×1000 euristico).
      sodiumMg: sodiumRead.value,
      sodiumUnit: sodiumRead.value == null ? null : 'mg',
      caffeineMg: caffeine,
      condimentKind: entry.condimentKind || null,
      foodDbKey: entry.foodDbKey || entry.matchedKey || entry.id || null,
      source: entry.source || entry.entrySource || null,
    });
  }

  const liquids = [];
  for (const entry of entries) {
    const type = String(entry?.type || '').toLowerCase();
    if (type === 'water') {
      liquids.push({
        kind: 'water',
        ml: finite(entry.ml),
        time: hourOf(entry),
      });
      continue;
    }
    if (type === 'alcohol') {
      liquids.push({
        kind: 'alcohol',
        ml: finite(entry.ml),
        abv: finite(entry.abv),
        pureAlcoholG: finite(entry.pureAlcohol),
        kcal: finite(entry.kcal ?? entry.cal),
        time: hourOf(entry),
        subtype: entry.subtype || null,
      });
    }
  }

  const sodiumTotal = summarizeNutrientTotalByGrams(meals, {
    getGrams: mealGrams,
    getValue: (m) => (m.sodiumMg == null ? null : finite(m.sodiumMg)),
  });
  const fibreTotal = summarizeNutrientTotalByGrams(meals, {
    getGrams: mealGrams,
    getValue: (m) => (m.fibre == null ? null : finite(m.fibre)),
  });

  return {
    meals,
    liquids,
    caffeineMg: caffeineKnown ? round1(caffeineMg) : null,
    totals: {
      ...coverageFields('sodium', sodiumTotal),
      ...coverageFieldsFibre('fibre', fibreTotal),
    },
    coverage: {
      foodsMissingSodium: foodsMissingSodium.slice(0, 12),
      foodsMissingFibre: foodsMissingFibre.slice(0, 12),
      missingSodiumCount: foodsMissingSodium.length,
      missingFibreCount: foodsMissingFibre.length,
      sodium: {
        known: sodiumTotal.coverage.known,
        missing: sodiumTotal.coverage.missing,
        incomplete: sodiumTotal.incomplete,
        note: sodiumTotal.note,
      },
      fibre: {
        known: fibreTotal.coverage.known,
        missing: fibreTotal.coverage.missing,
        incomplete: fibreTotal.incomplete,
        note: fibreTotal.note,
      },
    },
  };
}

function pickMainSleep(entries) {
  let best = null;
  let bestHours = -1;
  for (const entry of entries) {
    if (String(entry?.type || '').toLowerCase() !== 'sleep') continue;
    const hours = finite(entry.hours ?? entry.duration ?? entry.sleepHours) || 0;
    if (hours > bestHours) {
      best = entry;
      bestHours = hours;
    }
  }
  return best;
}

function deriveBedtime(entry) {
  const recorded = finite(entry?.bedtime ?? entry?.sleepStart);
  const wake = finite(entry?.wakeTime ?? entry?.sleepEnd);
  const hours = finite(entry?.hours ?? entry?.duration ?? entry?.sleepHours);
  if (wake != null && hours != null && hours > 0) {
    let derived = wake - hours;
    while (derived < 0) derived += 24;
    while (derived >= 24) derived -= 24;
    if (recorded == null) {
      return { bedtime: round1(derived), bedtimeProvenance: 'derived' };
    }
    const delta = Math.min(Math.abs(recorded - derived), 24 - Math.abs(recorded - derived));
    if (delta <= 0.35) {
      return { bedtime: round1(recorded), bedtimeProvenance: 'derived' };
    }
    return { bedtime: round1(recorded), bedtimeProvenance: 'recorded' };
  }
  if (recorded != null) {
    return { bedtime: round1(recorded), bedtimeProvenance: 'recorded' };
  }
  return { bedtime: null, bedtimeProvenance: 'missing' };
}

/**
 * Sonno del pilastro Focus per `date`: letto da `date+1` (pubblicazione mattutina).
 * @param {object|null|undefined} fullHistory
 * @param {string} date YYYY-MM-DD del giorno Focus
 * @param {{ sameDay?: boolean }} [options] sameDay=true → usa il nodo di `date` (solo evenings legacy)
 */
export function buildDaySleepDetail(fullHistory, date, options = {}) {
  const storageDate = options.sameDay ? date : addDaysIso(date, 1);
  const node = trackerNode(fullHistory, storageDate);
  const entries = flattenDiaryEntries(node);
  const entry = pickMainSleep(entries);
  if (!entry) {
    return null;
  }
  const { bedtime, bedtimeProvenance } = deriveBedtime(entry);
  const notes = String(entry.notes ?? entry.note ?? entry.details ?? '').trim() || null;
  const quality = finite(entry.quality ?? entry.sleepQuality ?? entry.rating);
  const qualityStars = quality != null && quality >= 1 && quality <= 5 ? Math.round(quality) : null;
  const qualityScore = finite(entry.qualityScore);
  return {
    hours: finite(entry.hours ?? entry.duration ?? entry.sleepHours),
    wakeTime: finite(entry.wakeTime ?? entry.sleepEnd),
    bedtime,
    bedtimeProvenance,
    qualityStars,
    notes,
    deepMin: finite(entry.deepMin),
    remMin: finite(entry.remMin),
    hr: finite(entry.hr),
    qualityScore: qualityScore != null && qualityScore > 5 ? Math.round(qualityScore) : null,
    storageDate,
  };
}

function dinnerStats(meals) {
  const dinnerMeals = [];
  let kcal = 0;
  let grams = 0;
  let hasDinner = false;
  for (const meal of meals) {
    if (!isDinner(meal)) continue;
    hasDinner = true;
    dinnerMeals.push(meal);
    if (meal.kcal != null) kcal += meal.kcal;
    if (meal.grams != null) grams += meal.grams;
  }
  if (!hasDinner) {
    return {
      kcal: null,
      grams: null,
      sodium: summarizeNutrientTotalByGrams([], {
        getGrams: mealGrams,
        getValue: () => null,
      }),
      fibre: summarizeNutrientTotalByGrams([], {
        getGrams: mealGrams,
        getValue: () => null,
      }),
    };
  }
  return {
    kcal: round1(kcal),
    grams: round1(grams),
    sodium: summarizeNutrientTotalByGrams(dinnerMeals, {
      getGrams: mealGrams,
      getValue: (m) => (m.sodiumMg == null ? null : finite(m.sodiumMg)),
    }),
    fibre: summarizeNutrientTotalByGrams(dinnerMeals, {
      getGrams: mealGrams,
      getValue: (m) => (m.fibre == null ? null : finite(m.fibre)),
    }),
  };
}

function lastMealHour(meals) {
  let last = null;
  for (const meal of meals) {
    const h = finite(meal.time);
    if (h == null) continue;
    if (last == null || h > last) last = h;
  }
  return last;
}

function hoursBeforeSleep(lastMeal, bedtime) {
  if (lastMeal == null || bedtime == null) return null;
  let delta = bedtime - lastMeal;
  if (delta < 0) delta += 24;
  if (delta > 18) return null;
  return round1(delta);
}

/**
 * @param {object|null|undefined} fullHistory
 * @param {string} date
 */
export function buildEveningRow(fullHistory, date) {
  const detail = buildDayMealsDetail(fullHistory, date);
  // Notte dopo la sera di `date` = storage su date+1 (come il pilastro sonno).
  const sleep = buildDaySleepDetail(fullHistory, date);
  const dinner = dinnerStats(detail.meals);
  const lastMeal = lastMealHour(detail.meals);

  let liquidsAfter18Ml = 0;
  let alcoholPureG = 0;
  let hasLiquid = false;
  let hasAlcohol = false;
  for (const liq of detail.liquids) {
    const t = finite(liq.time);
    if (liq.kind === 'water' && t != null && t >= EVENING_HOUR) {
      hasLiquid = true;
      liquidsAfter18Ml += liq.ml || 0;
    }
    if (liq.kind === 'alcohol') {
      hasAlcohol = true;
      alcoholPureG += liq.pureAlcoholG || 0;
    }
  }

  let caffeineAfter14 = 0;
  let caffeineAfter14Known = false;
  for (const meal of detail.meals) {
    const t = finite(meal.time);
    const c = finite(meal.caffeineMg);
    if (c == null || c <= 0) continue;
    if (t != null && t >= CAFFEINE_AFTER_HOUR) {
      caffeineAfter14 += c;
      caffeineAfter14Known = true;
    }
  }

  const eveningMeals = detail.meals.filter((meal) => {
    const t = finite(meal.time);
    return t != null && t >= EVENING_HOUR;
  });
  const eveningSodium = summarizeNutrientTotalByGrams(eveningMeals, {
    getGrams: mealGrams,
    getValue: (m) => (m.sodiumMg == null ? null : finite(m.sodiumMg)),
  });

  return {
    date,
    lastMealHour: lastMeal,
    hoursBeforeSleep: hoursBeforeSleep(lastMeal, sleep?.bedtime ?? null),
    dinnerKcal: dinner.kcal,
    dinnerGrams: dinner.grams,
    dinnerSodiumMg: dinner.sodium.value,
    dinnerSodiumCoverage: {
      known: dinner.sodium.coverage.known,
      missing: dinner.sodium.coverage.missing,
    },
    dinnerSodiumIncomplete: dinner.sodium.incomplete,
    dinnerSodiumNote: dinner.sodium.note,
    dinnerFibreG: dinner.fibre.value,
    dinnerFibreCoverage: {
      known: dinner.fibre.coverage.known,
      missing: dinner.fibre.coverage.missing,
    },
    dinnerFibreIncomplete: dinner.fibre.incomplete,
    dinnerFibreNote: dinner.fibre.note,
    eveningSodiumMg: eveningSodium.value,
    eveningSodiumCoverage: {
      known: eveningSodium.coverage.known,
      missing: eveningSodium.coverage.missing,
    },
    eveningSodiumIncomplete: eveningSodium.incomplete,
    eveningSodiumNote: eveningSodium.note,
    liquidsAfter18Ml: hasLiquid ? round1(liquidsAfter18Ml) : null,
    alcoholPureG: hasAlcohol ? round1(alcoholPureG) : null,
    caffeineAfter14Mg: caffeineAfter14Known ? round1(caffeineAfter14) : null,
    night: sleep
      ? {
        hours: sleep.hours,
        qualityStars: sleep.qualityStars,
        notes: sleep.notes,
        bedtime: sleep.bedtime,
        wakeTime: sleep.wakeTime,
      }
      : null,
  };
}

/**
 * @param {string} from
 * @param {string} to
 */
export function assertEveningsRange(from, to) {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new Error('from/to devono essere YYYY-MM-DD');
  }
  if (from > to) throw new Error('from non può essere dopo to');
  let days = 0;
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    days += 1;
    if (days > MAX_EVENINGS_DAYS) {
      throw new Error(`intervallo massimo ${MAX_EVENINGS_DAYS} giorni`);
    }
  }
  return days;
}

/**
 * @param {object|null|undefined} fullHistory
 * @param {string} from
 * @param {string} to
 */
export function buildEvenings(fullHistory, from, to) {
  const days = assertEveningsRange(from, to);
  const rows = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    rows.push(buildEveningRow(fullHistory, d));
  }
  return { from, to, days, evenings: rows };
}

export { MAX_EVENINGS_DAYS, trackerNode, flattenDiaryEntries };
