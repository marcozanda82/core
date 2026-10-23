/**
 * Storico tracker dimostrativo per la prima pagina prodotto Focus.
 * Calibrato affinché Ieri / Settimana / Mese producano pezzi dalla pipeline
 * (non testi inventati). Zero Firebase.
 */

import { addCalendarDays, wakeSegmentFromDate } from '../normalize/focusDateUtils.js';

function sleepEntry(nightEndedOn, overrides = {}) {
  const seg = wakeSegmentFromDate(nightEndedOn);
  return {
    type: 'sleep',
    id: `sleep_${nightEndedOn}`,
    hours: seg === 'weekend' ? 8.5 : 7.1,
    wakeTime: seg === 'weekend' ? 9 : 7,
    quality: 4,
    deepMin: 60,
    remMin: 60,
    ...overrides,
  };
}

/**
 * Proteine per data — pattern validato nei test sunday_past (Δ settimanale leggibile).
 * @param {string} date
 */
function proteinForDate(date) {
  // Settimana 11–17/10: media ~145 g (centerpiece week su pub 18/10)
  if (date >= '2026-10-11' && date <= '2026-10-17') {
    return date === '2026-10-17' ? 145.42 : 145;
  }
  // Settimana 4–10/10: media ~157 g
  if (date >= '2026-10-04' && date <= '2026-10-10') {
    return date === '2026-10-10' ? 158.12 : 157;
  }
  // Settembre: densità forza + proteine stabili per mese (pub 01/10)
  if (date >= '2026-09-01' && date <= '2026-09-30') {
    return 150 + (Number(date.slice(8, 10)) % 5);
  }
  // Analisi quotidiana 18/10 e dintorni
  if (date === '2026-10-18') return 138;
  return 142;
}

/**
 * @param {string} date
 * @param {number} dayIndexFromEnd
 */
function dayLog(date, dayIndexFromEnd) {
  const prot = proteinForDate(date);
  const strength = date === '2026-10-12'
    || date === '2026-10-05'
    || (date >= '2026-09-01' && date <= '2026-09-30' && dayIndexFromEnd % 2 === 0);

  /** Giorni senza pasti registrati (gap onesti per i grafici — non azzerati). */
  const skipFood = date === '2026-09-08' || date === '2026-09-22';

  /** @type {object[]} */
  const log = [];

  if (!skipFood) {
    log.push(
      {
        type: 'food',
        id: `food_col_${date}`,
        mealType: 'colazione',
        mealTime: 8,
        name: 'Yogurt greco',
        kcal: 220,
        prot: Math.min(28, Math.round(prot * 0.18)),
        carb: 14,
        fat: 6,
        fibre: 0,
      },
      {
        type: 'food',
        id: `food_pranzo_${date}`,
        mealType: 'pranzo',
        mealTime: 13,
        name: date === '2026-10-18' ? 'Pollo e riso' : 'Pasto',
        kcal: 700,
        prot: Math.round(prot * 0.45),
        carb: 70,
        fat: 20,
        fibre: 8,
      },
      {
        type: 'food',
        id: `food_cena_${date}`,
        mealType: 'cena',
        mealTime: date === '2026-10-18' ? 21.5 : 20.25,
        name: 'Pesce e verdure',
        kcal: 620,
        prot: Math.max(20, Math.round(prot * 0.37)),
        carb: 35,
        fat: 24,
        fibre: 8,
      },
    );
  }

  if (strength) {
    log.push({
      type: 'workout',
      id: `w_${date}`,
      name: 'Pesi full body',
      duration: 45,
      kcal: 250,
    });
  } else if (dayIndexFromEnd % 3 === 0) {
    log.push({
      type: 'workout',
      id: `w_${date}`,
      name: 'Camminata',
      duration: 0.5,
      kcal: 110,
    });
  }

  return log;
}

/**
 * Sonno: pattern feriale/weekend + notte corta su analisi quotidiana + anomalia 26/09.
 * Ultime 7 notti un po’ più lunghe delle 7 precedenti → segnale “media in aumento”.
 * @param {string} nightEndedOn
 * @param {string} analysisDateForDaily
 */
function sleepForNight(nightEndedOn, analysisDateForDaily) {
  // Notte dell’analisi quotidiana (pub 19/10 → notte finita il 19, riferimento 18): corta → concern
  if (nightEndedOn === '2026-10-19') {
    return sleepEntry(nightEndedOn, {
      hours: 5.2,
      wakeTime: 6.5,
      bedtime: 1.3,
      quality: 2,
    });
  }
  if (nightEndedOn === '2026-09-26') {
    return sleepEntry(nightEndedOn, {
      hours: 7.5,
      wakeTime: 18.75,
      bedtime: 11.25,
    });
  }

  const seg = wakeSegmentFromDate(nightEndedOn);
  // Boost sonno 12–18/10 vs 5–11/10 per confronto d7
  if (nightEndedOn >= '2026-10-12' && nightEndedOn <= '2026-10-18') {
    return sleepEntry(nightEndedOn, {
      hours: seg === 'weekend' ? 8.8 : 7.8,
      wakeTime: seg === 'weekend' ? 9.1 : 7.1,
    });
  }
  if (nightEndedOn >= '2026-10-05' && nightEndedOn <= '2026-10-11') {
    return sleepEntry(nightEndedOn, {
      hours: seg === 'weekend' ? 7.2 : 6.4,
      wakeTime: seg === 'weekend' ? 8.5 : 6.8,
    });
  }

  return sleepEntry(nightEndedOn);
}

/**
 * @param {{
 *   anchorDate?: string,
 *   historyDays?: number,
 * }} [opts]
 * @returns {Record<string, object>}
 */
export function buildFocusDemoTrackerHistory(opts = {}) {
  const anchorDate = opts.anchorDate || '2026-10-19';
  const historyDays = Math.max(50, Math.min(90, Number(opts.historyDays) || 70));
  const startDate = addCalendarDays(anchorDate, -(historyDays - 1));

  /** @type {Record<string, object>} */
  const fullHistory = {};

  for (let i = historyDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(anchorDate, -i);
    fullHistory[`trackerStorico_${date}`] = {
      data: date,
      log: dayLog(date, i),
    };
  }

  // Sonno: notte che termina su date (wake day)
  let cursor = startDate;
  const endSleep = addCalendarDays(anchorDate, 1);
  while (cursor <= endSleep) {
    const node = fullHistory[`trackerStorico_${cursor}`] || { data: cursor, log: [] };
    const withoutSleep = (node.log || []).filter((e) => e.type !== 'sleep');
    fullHistory[`trackerStorico_${cursor}`] = {
      data: cursor,
      log: [...withoutSleep, sleepForNight(cursor, '2026-10-18')],
    };
    cursor = addCalendarDays(cursor, 1);
  }

  return fullHistory;
}

/** Profilo / target minimi per far passare il dossier offline. */
export function buildFocusDemoProfilePack() {
  return {
    userProfile: {
      sex: 'male',
      birthYear: 1985,
      heightCm: 178,
      weightKg: 78,
    },
    userTargets: {
      targetHistory: [{
        effectiveDate: '2026-09-01',
        targets: { kcal: 2400, proteinG: 140, carbG: 220, fatG: 70 },
      }],
    },
    bodyMetrics: {
      entries: [
        { date: '2026-10-18', weightKg: 77.8 },
        { date: '2026-10-15', weightKg: 78 },
      ],
    },
  };
}
