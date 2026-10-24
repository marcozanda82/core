/**
 * Sessione unica Kentu Focus (Ieri / Settimana / Mese).
 * Impedisce di mescolare diario reale e edizione dimostrativa.
 */

import { isIsoDateString } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { normalizeSleepNight } from '../normalize/normalizeSleepNight.js';
import { peekFocusDiaryForUser } from './focusDiaryHandoff.js';
import { buildFocusPrivateNutritionView } from './buildFocusPrivateNutritionView.js';
import { buildFocusProductEdition } from './buildFocusProductEdition.js';
import { FOCUS_PRODUCT_DEMO_BANNER, resolveFocusProductPeriod } from './focusProductPeriods.js';
import { buildFocusWellnessPillars } from './buildFocusWellnessPillars.js';
import { buildFocusMealRedistributionManeuver } from './buildFocusMealRedistributionManeuver.js';
import { buildFocusWeeklyHabitCompass } from './buildFocusWeeklyHabitCompass.js';

export const FOCUS_PAGE_MODE = Object.freeze({
  real_diary: 'real_diary',
  demo_preview: 'demo_preview',
  empty: 'empty',
});

/**
 * @param {string|null|undefined} uid
 * @param {object|null|undefined} handoff
 */
export function handoffBelongsToUser(uid, handoff) {
  const id = String(uid || '').trim();
  if (!id || !handoff || typeof handoff !== 'object') return false;
  return String(handoff.uid || '').trim() === id
    && handoff.fullHistory
    && typeof handoff.fullHistory === 'object'
    && isIsoDateString(handoff.analysisDate)
    && isIsoDateString(handoff.publicationDate);
}

/**
 * Brief sonno: notte conclusa al risveglio publicationDate (D+1 vs analysisDate D).
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {string} publicationDate
 */
export function buildRealSleepNightBrief(fullHistory, analysisDate, publicationDate) {
  const sleepNode = getTrackerDayNode(fullHistory, publicationDate);
  const pack = normalizeSleepNight(sleepNode, {
    publicationDate,
    lastMealHour: null,
  });
  return {
    analysisDay: analysisDate,
    nightEndedOn: publicationDate,
    convention: 'giornata_D_notte_conclusa_al_risveglio_D_plus_1',
    sleepAvailable: Boolean(pack?.sleepAvailable),
    hours: pack?.sleep?.hours?.value ?? null,
    wakeTime: pack?.sleep?.wakeTime?.value ?? null,
    bedtime: pack?.sleep?.bedtime?.value ?? null,
    note: pack?.sleepAvailable
      ? `Notte conclusa al risveglio del ${publicationDate} (dopo la giornata ${analysisDate}).`
      : `Nessun sonno registrato per il risveglio del ${publicationDate}.`,
  };
}

/**
 * Risolve modalità e date coerenti (senza I/O).
 * @param {{
 *   uid?: string|null,
 *   periodId: string,
 *   handoff?: object|null,
 * }} input
 */
export function resolveFocusPageSession(input) {
  const periodId = String(input.periodId || 'ieri').toLowerCase();
  const uid = input.uid != null ? String(input.uid) : null;
  const handoff = input.handoff !== undefined
    ? input.handoff
    : (uid ? peekFocusDiaryForUser(uid) : null);

  if (handoffBelongsToUser(uid, handoff)) {
    const analysisDate = handoff.analysisDate;
    const publicationDate = handoff.publicationDate;
    const nutrition = buildFocusPrivateNutritionView({
      periodId,
      uid,
      fullHistory: handoff.fullHistory,
      analysisDate,
      publicationDate,
      source: 'handoff',
    });
    const sleepNight = periodId === 'ieri'
      ? buildRealSleepNightBrief(handoff.fullHistory, analysisDate, publicationDate)
      : null;
    const userTargets = handoff.userTargets && typeof handoff.userTargets === 'object'
      ? handoff.userTargets
      : null;
    const wellness = buildFocusWellnessPillars({
      periodId,
      uid,
      fullHistory: handoff.fullHistory,
      analysisDate,
      publicationDate,
      nutritionView: nutrition,
      userTargets,
    });
    const mealManeuver = buildFocusMealRedistributionManeuver({
      periodId,
      nutritionView: nutrition,
      wellness,
      sleepNight,
      userTargets,
      analysisDate,
      publicationDate,
    });
    const habitCompass = buildFocusWeeklyHabitCompass({
      periodId,
      uid,
      fullHistory: handoff.fullHistory,
      analysisDate,
      publicationDate,
      wellness,
      nutritionView: nutrition,
      userTargets,
      mealManeuver,
    });

    const windowLabel = periodId === 'ieri'
      ? `Giorno ${analysisDate}`
      : periodId === 'settimana'
        ? `Settimana che termina il ${analysisDate}`
        : `Mese che termina il ${analysisDate}`;

    return {
      mode: FOCUS_PAGE_MODE.real_diary,
      uid,
      periodId,
      analysisDate,
      publicationDate,
      windowLabel,
      banner: 'DIARIO REALE',
      headline: {
        title: `Focus · ${periodId === 'ieri' ? 'Ieri' : periodId === 'settimana' ? 'Settimana' : 'Mese'}`,
        subtitle: windowLabel,
      },
      metaLine: `Analisi ${analysisDate} · pubblicazione ${publicationDate}`,
      nutrition,
      sleepNight,
      wellness,
      userTargets,
      mealManeuver,
      habitCompass,
      editorial: {
        available: false,
        message: 'Osservazioni deterministiche dai tuoi dati · analisi editoriale lunga non ancora disponibile',
      },
      demoEdition: null,
      showDemoEditorial: false,
      diagnostics: {
        mode: FOCUS_PAGE_MODE.real_diary,
        handoffUid: handoff.uid,
        stashedAt: handoff.stashedAt || null,
      },
    };
  }

  // Nessun diario reale per questo uid → anteprima dimostrativa esplicita (mai mescolata al reale).
  try {
    const { period, preset } = resolveFocusProductPeriod(periodId);
    return {
      mode: FOCUS_PAGE_MODE.demo_preview,
      uid,
      periodId,
      analysisDate: null,
      publicationDate: preset.publicationDate,
      windowLabel: period.description,
      banner: FOCUS_PRODUCT_DEMO_BANNER,
      headline: {
        title: `Focus · ${period.label}`,
        subtitle: 'Anteprima dimostrativa (nessun diario personale in sessione)',
      },
      metaLine: null,
      nutrition: null,
      sleepNight: null,
      wellness: null,
      userTargets: null,
      mealManeuver: null,
      habitCompass: null,
      editorial: {
        available: true,
        message: null,
      },
      demoEdition: null,
      showDemoEditorial: true,
      diagnostics: {
        mode: FOCUS_PAGE_MODE.demo_preview,
        handoffUid: null,
      },
    };
  } catch {
    return {
      mode: FOCUS_PAGE_MODE.empty,
      uid,
      periodId,
      analysisDate: null,
      publicationDate: null,
      windowLabel: null,
      banner: null,
      headline: { title: 'Focus', subtitle: 'Dati non disponibili' },
      metaLine: null,
      nutrition: null,
      sleepNight: null,
      wellness: null,
      userTargets: null,
      mealManeuver: null,
      habitCompass: null,
      editorial: { available: false, message: 'Nessun dato disponibile.' },
      demoEdition: null,
      showDemoEditorial: false,
      diagnostics: { mode: FOCUS_PAGE_MODE.empty },
    };
  }
}

/**
 * Carica l'edizione demo SOLO se la sessione è in modalità demo_preview.
 * @param {object} session
 */
export async function loadFocusPageDemoEditionIfAllowed(session) {
  if (!session || session.mode !== FOCUS_PAGE_MODE.demo_preview || !session.showDemoEditorial) {
    return {
      ...session,
      demoEdition: null,
      status: session?.mode === FOCUS_PAGE_MODE.real_diary ? 'ready' : 'empty',
    };
  }
  try {
    const edition = await buildFocusProductEdition(session.periodId);
    return {
      ...session,
      demoEdition: edition,
      analysisDate: edition?.dates?.analysisDate || session.analysisDate,
      publicationDate: edition?.dates?.publicationDate || session.publicationDate,
      headline: edition?.headline || session.headline,
      metaLine: edition?.dates
        ? `Anteprima dimostrativa · analisi ${edition.dates.analysisDate} · pubblicazione ${edition.dates.publicationDate}`
        : session.metaLine,
      status: edition?.ok ? (edition.empty ? 'empty' : 'ready') : 'error',
    };
  } catch (err) {
    return {
      ...session,
      demoEdition: {
        ok: false,
        demo: true,
        error: { message: err?.message || 'Errore anteprima' },
      },
      status: 'error',
    };
  }
}

/**
 * Etichette italiane per anomalie (UI normale).
 * @param {object} row
 */
export function formatNutritionVerifyLabel(row) {
  const nutrientMap = {
    fiberG: 'Fibre',
    kcal: 'Calorie',
    proteinG: 'Proteine',
    carbG: 'Carboidrati',
    fatG: 'Grassi',
    nutrition: 'Alimentazione',
  };
  const reasonMap = {
    fibre_on_fish_like_name: 'fibre insolite per un alimento simile al pesce',
    daily_fiber_unusually_high: 'totale giornaliero di fibre insolitamente alto',
    kcal_per_gram_implausible: 'calorie per grammo poco plausibili',
    anomaly_flag: 'valore sospetto',
    anomaly_excluded_from_judgement: 'escluso dai giudizi',
    no_food_log: 'nessuna registrazione alimentare',
  };
  const nutrient = nutrientMap[row?.nutrient] || 'Valore';
  const reason = reasonMap[row?.reason] || 'da verificare';
  const valuePart = row?.value != null ? ` (${row.value})` : '';
  if (row?.scope === 'day' || !row?.foodName) {
    return `${nutrient}${valuePart}: ${reason}`;
  }
  return `${row.foodName} — ${nutrient}${valuePart}: ${reason}`;
}
