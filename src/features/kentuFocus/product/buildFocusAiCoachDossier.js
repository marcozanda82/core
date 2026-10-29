/**
 * Dossier AI interpretativo Kentu Focus — evidenze ricche + traiettoria Bussola.
 * Nessun demo, nessuno score, nessun dato inventato.
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { normalizeFoodEvents, collectDayLogForNutrition } from '../normalize/normalizeFoodEvents.js';
import { normalizeStimuliEvents } from '../normalize/normalizeStimuliEvents.js';
import { FOCUS_PAGE_MODE } from './buildFocusPageSession.js';
import { buildFocusCompassSignalsForDossier } from './buildFocusCompassSignalsForDossier.js';
import { buildFocusKentuEnginesForDossier } from './buildFocusKentuEnginesForDossier.js';
import { buildFocusEditorialReadingContext } from './buildFocusEditorialReadingContext.js';
import { buildFocusFoodQualityBlock } from './buildFocusFoodQualityBlock.js';
import { buildFocusDeterministicSignals } from './buildFocusDeterministicSignals.js';
import { buildFocusSubstitutionCandidates } from './buildFocusSubstitutionCandidates.js';
import { withFocusCatalogLookupSession } from './focusAiCoachCatalogLookup.js';
import {
  logFocusDossierSizeBreakdown,
  measureFocusDossierSizeBreakdown,
  slimFocusAiCoachDossier,
} from './slimFocusAiCoachDossier.js';

/**
 * @param {unknown} value
 * @returns {string}
 */
function stableStringify(value) {
  return JSON.stringify(value);
}

/**
 * @param {string} text
 */
function shortHash(text) {
  let h = 2166136261;
  const s = String(text || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function foodName(item) {
  return String(item?.name || item?.desc || item?.label || item?.foodName || '').trim();
}

/**
 * @param {number} hour
 * @returns {string}
 */
function formatClockHour(hour) {
  const h = Number(hour);
  if (!Number.isFinite(h)) return '';
  const wrapped = ((h % 24) + 24) % 24;
  const hh = Math.floor(wrapped);
  const mm = Math.round((wrapped - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
}

function readNova(tags) {
  if (!tags || typeof tags !== 'object') return null;
  const n = Number(tags.novaGroup ?? tags.nova ?? null);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object|null|undefined} session
 */
export function canBuildFocusAiCoachDossier(session) {
  if (!session || session.mode !== FOCUS_PAGE_MODE.real_diary) {
    return { ok: false, reason: 'session_not_real_diary' };
  }
  if (!session.uid || !session.periodId || !session.analysisDate || !session.publicationDate) {
    return { ok: false, reason: 'missing_session_identity' };
  }
  if (!session.wellness?.ok) {
    return { ok: false, reason: 'wellness_unavailable' };
  }
  return { ok: true, reason: null };
}

/**
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {number} windowDays
 */
function collectFoodFrequency(fullHistory, analysisDate, windowDays) {
  /** @type {Map<string, { name: string, days: Set<string>, occasions: number, nova: number|null }>} */
  const map = new Map();
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const node = getTrackerDayNode(fullHistory, date);
    if (!node) continue;
    const pack = normalizeFoodEvents(node);
    if (!pack.hasFood) continue;
    for (const item of collectDayLogForNutrition(node)) {
      if (item?.type && item.type !== 'food' && item.type !== 'recipe') continue;
      const name = foodName(item);
      if (!name) continue;
      const key = name.toLowerCase();
      let row = map.get(key);
      if (!row) {
        row = { name, days: new Set(), occasions: 0, nova: readNova(item.semanticTags) };
        map.set(key, row);
      }
      row.days.add(date);
      row.occasions += 1;
      if (row.nova == null) row.nova = readNova(item.semanticTags);
    }
  }
  return [...map.values()]
    .map((r) => ({
      name: r.name,
      distinctDays: r.days.size,
      occasions: r.occasions,
      novaGroupDocumented: r.nova,
      persistentHabit: r.days.size >= 3,
    }))
    .sort((a, b) => b.occasions - a.occasions || b.distinctDays - a.distinctDays)
    .slice(0, 40);
}

/**
 * @param {object} fullHistory
 * @param {string} analysisDate
 * @param {number} windowDays
 */
function collectStimuliWindow(fullHistory, analysisDate, windowDays) {
  let stimulantEvents = 0;
  let alcoholEvents = 0;
  let waterMl = 0;
  let daysWithStimuli = 0;
  /** @type {object[]} */
  const byDay = [];
  for (let i = windowDays - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(analysisDate, -i);
    const node = getTrackerDayNode(fullHistory, date);
    if (!node) continue;
    const pack = normalizeStimuliEvents(node);
    const s = Number(pack.stimuli?.stimulantEvents?.value) || 0;
    const a = Number(pack.stimuli?.alcoholEvents?.value) || 0;
    const w = pack.stimuli?.waterMl?.provenance === 'recorded'
      ? Number(pack.stimuli.waterMl.value)
      : null;
    if (s > 0 || a > 0 || w != null) daysWithStimuli += 1;
    stimulantEvents += s;
    alcoholEvents += a;
    if (w != null) waterMl += w;
    if (s > 0 || a > 0) {
      byDay.push({ date, stimulantEvents: s, alcoholEvents: a, waterMl: w });
    }
  }
  return {
    available: daysWithStimuli > 0,
    stimulantEventsTotal: stimulantEvents,
    alcoholEventsTotal: alcoholEvents,
    waterMlTotalRecorded: waterMl > 0 ? waterMl : null,
    daysWithAny: byDay.slice(-14),
    note: daysWithStimuli > 0
      ? 'Stimolanti/alcol/acqua solo se tipizzati nel diario; orario caffeina spesso assente.'
      : 'Nessun evento stimolante/alcol/acqua tipizzato nel periodo.',
  };
}

/**
 * @param {object} session — resolveFocusPageSession real_diary
 * @param {{
 *   foodCatalogs?: {
 *     personalDb?: object|null,
 *     kentuItDb?: object|null,
 *     globalDb?: object|null,
 *     offDb?: object|null,
 *     offReady?: boolean|null,
 *   }|null,
 * }} [options]
 */
export function buildFocusAiCoachDossier(session, options = {}) {
  const gate = canBuildFocusAiCoachDossier(session);
  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason,
      dossier: null,
      dataVersion: null,
    };
  }

  const buildStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  /** @type {Record<string, number>} */
  const profileMs = {};
  const mark = (label, started) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    profileMs[label] = Math.round(now - started);
  };

  const rawCatalogs = options?.foodCatalogs && typeof options.foodCatalogs === 'object'
    ? options.foodCatalogs
    : (session.foodCatalogs && typeof session.foodCatalogs === 'object'
      ? session.foodCatalogs
      : null);
  const { catalogs: foodCatalogs } = withFocusCatalogLookupSession(rawCatalogs);

  const periodId = session.periodId;
  const nutrition = session.nutrition || null;
  const wellness = session.wellness;
  const pillarsById = wellness.pillarsById || {};
  const fullHistory = session.fullHistory && typeof session.fullHistory === 'object'
    ? session.fullHistory
    : null;
  const windowDays = periodId === 'mese' ? 30 : periodId === 'settimana' ? 7 : 1;

  /** @type {object[]} */
  const meals = [];
  if (periodId === 'ieri' && nutrition?.ieri?.hasFood) {
    for (const meal of nutrition.ieri.meals || []) {
      meals.push({
        mealLabel: meal.mealLabel || null,
        mealType: meal.mealType || null,
        clockLabel: meal.clockLabel || null,
        clockHour: meal.clockHour ?? null,
        distribution: meal.distribution
          ? {
            kcal: meal.distribution.kcal ?? null,
            proteinG: meal.distribution.proteinG ?? null,
            carbG: meal.distribution.carbG ?? null,
            fatG: meal.distribution.fatG ?? null,
          }
          : null,
        items: (meal.items || [])
          .map((item, idx) => {
            const rawId = String(item.id || item.foodDbKey || item.matchedKey || `idx_${idx}`).trim();
            const eventId = `food:${rawId}`;
            return {
              id: rawId || null,
              eventId,
              name: item.name || null,
              foodDbKey: item.foodDbKey || item.matchedKey || null,
              grams: item.grams ?? null,
              kcal: item.macros?.kcal ?? null,
              proteinG: item.macros?.proteinG ?? null,
              carbG: item.macros?.carbG ?? null,
              fatG: item.macros?.fatG ?? null,
              // fiber: solo valore numerico (niente provenance verbosa)
              fiberG: item.macros?.fiberG?.value ?? item.macros?.fiberG ?? null,
              novaGroupDocumented: readNova(item.semanticTags),
              novaScore: item.novaScore ?? null,
              toVerify: (item.toVerify || []).map((f) => ({
                nutrient: f.nutrient || null,
                reason: f.reason || null,
              })),
            };
          })
          .filter((it) => it.name),
      });
    }
  }

  let usableMacros = null;
  let usableMicros = [];
  if (periodId === 'ieri' && nutrition?.ieri?.totals) {
    const t = nutrition.ieri.totals;
    usableMacros = {
      kcal: t.kcal?.usableForJudgement ? t.kcal.value : null,
      proteinG: t.proteinG?.usableForJudgement ? t.proteinG.value : null,
      carbG: t.carbG?.usableForJudgement ? t.carbG.value : null,
      fatG: t.fatG?.usableForJudgement ? t.fatG.value : null,
      fiberG: t.fiberG?.usableForJudgement ? t.fiberG.value : null,
    };
    const coachMicros = nutrition.ieri.coachEvidence?.micronutrients || {};
    for (const [key, m] of Object.entries(coachMicros)) {
      if (!m?.usableForObservation || m.value == null) continue;
      usableMicros.push({
        key,
        value: m.value,
        unit: m.unit || null,
        completenessRatio: m.completenessRatio ?? null,
      });
    }
  }

  const nutritionTrend = periodId !== 'ieri' && nutrition?.trends
    ? {
      daysWithFood: nutrition.trends.daysWithFood ?? null,
      daysInWindow: nutrition.trends.daysInWindow ?? null,
      averagesFromRecordedDaysOnly: nutrition.trends.averagesFromRecordedDaysOnly || null,
      note: nutrition.trends.note || null,
      seriesRecorded: (nutrition.trends.series || [])
        .filter((s) => s.status === 'recorded')
        .map((s) => ({
          date: s.date,
          kcal: s.kcal,
          proteinG: s.proteinG,
          fiberG: s.fiberG ?? null,
        })),
    }
    : null;

  const foodFrequency = fullHistory && isIsoDateString(session.analysisDate)
    ? collectFoodFrequency(fullHistory, session.analysisDate, Math.max(windowDays, 7))
    : [];

  const stimuli = fullHistory && isIsoDateString(session.analysisDate)
    ? collectStimuliWindow(fullHistory, session.analysisDate, Math.max(windowDays, 7))
    : { available: false, note: 'Diario non allegato alla sessione per stimolanti.' };

  const exercisePillar = pillarsById.exercise || null;
  const sleepPillar = pillarsById.sleep || null;
  const nutritionPillar = pillarsById.nutrition || null;

  const workouts = Array.isArray(exercisePillar?.workouts)
    ? exercisePillar.workouts.map((w, idx) => {
      const date = w.date || (periodId === 'ieri' ? session.analysisDate : null);
      const rawId = String(w.id || w.workoutTypeId || `${date || 'd'}_${idx}`).trim();
      const eventId = `workout:${rawId}`;
      return {
        id: rawId || null,
        eventId,
        date,
        label: w.label || null,
        durationMin: w.durationMin ?? null,
        clockLabel: w.clockLabel || null,
        clockHour: w.clockHour ?? null,
        muscleGroups: Array.isArray(w.muscleGroups) ? w.muscleGroups : [],
        workoutTypeId: w.workoutTypeId || null,
        kindLabel: w.kindLabel || null,
        kind: w.kind || null,
        isWalking: Boolean(w.isWalking),
        intensityDocumented: Boolean(w.intensityDocumented),
        intensityBand: w.intensityBand || null,
        kcalBurn: w.kcalBurn ?? null,
        setsRepsLoadsPresent: false,
        note: 'Serie/ripetizioni/carichi non esportati se non verificabili nella normalizzazione Focus.',
      };
    })
    : [];

  const muscleGroupFrequency = Array.isArray(exercisePillar?.muscleGroupFrequency)
    ? exercisePillar.muscleGroupFrequency
    : [];

  const exerciseSeries = Array.isArray(exercisePillar?.series)
    ? exercisePillar.series
      .filter((r) => r.status === 'recorded')
      .map((r) => ({
        date: r.date,
        sessions: r.sessions,
        durationMinTotal: r.durationMinTotal ?? null,
        muscleGroups: Array.isArray(r.muscleGroups) ? r.muscleGroups : [],
        aerobicMinutes: r.aerobicMinutes ?? null,
        moderateMinutes: r.moderateMinutes ?? null,
        vigorousMinutes: r.vigorousMinutes ?? null,
      }))
    : [];

  const cardio = exercisePillar?.cardio
    ? {
      ...exercisePillar.cardio,
      strengthSessionCount: exercisePillar.strengthSessionCount ?? null,
    }
    : null;

  const sleepBrief = session.sleepNight || null;
  const sleepNightEndedOn = sleepPillar?.nightEndedOn || session.publicationDate;
  const sleepEventId = periodId === 'ieri' && (sleepPillar?.hasEvidence || sleepBrief?.sleepAvailable)
    ? `sleep:${sleepNightEndedOn || session.analysisDate}`
    : null;
  const sleepDay = periodId === 'ieri'
    ? {
      available: Boolean(sleepPillar?.hasEvidence || sleepBrief?.sleepAvailable),
      eventId: sleepEventId,
      hours: sleepBrief?.hours ?? null,
      wakeTime: sleepBrief?.wakeTime ?? null,
      bedtime: sleepBrief?.bedtime ?? null,
      bedtimeProvenance: sleepBrief?.bedtimeProvenance ?? null,
      qualityStars: sleepBrief?.qualityStars ?? null,
      qualityBand: sleepBrief?.qualityBand ?? null,
      qualityProvenance: sleepBrief?.qualityProvenance ?? null,
      deepMin: sleepBrief?.deepMin ?? null,
      remMin: sleepBrief?.remMin ?? null,
      deepMinProvenance: sleepBrief?.deepMinProvenance ?? null,
      remMinProvenance: sleepBrief?.remMinProvenance ?? null,
      stagesSuppressed: Boolean(sleepBrief?.stagesSuppressed),
      stagesNote: sleepBrief?.stagesNote || null,
      nightEndedOn: sleepNightEndedOn,
      analysisDay: sleepPillar?.analysisDay || session.analysisDate,
      metrics: sleepPillar?.metrics || [],
      convention: 'notte_D_conclusa_al_risveglio_D_plus_1',
    }
    : null;

  const tFq = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const foodQuality = fullHistory && isIsoDateString(session.analysisDate)
    ? buildFocusFoodQualityBlock({
      fullHistory,
      analysisDate: session.analysisDate,
      periodId,
      catalogs: foodCatalogs,
      recentDays: periodId === 'ieri' ? 7 : windowDays,
    })
    : {
      available: false,
      reason: 'diary_unavailable',
      day: null,
      recent: null,
      catalogStatus: null,
    };
  mark('foodQuality', tFq);

  const intermittentFasting = session?.userProfile?.intermittentFasting === true
    || session?.profile?.intermittentFasting === true
    || session?.handoff?.userProfile?.intermittentFasting === true
    || false;

  const deterministicSignals = fullHistory && isIsoDateString(session.analysisDate)
    ? buildFocusDeterministicSignals({
      fullHistory,
      analysisDate: session.analysisDate,
      publicationDate: session.publicationDate,
      sleepNight: sleepBrief,
      periodId,
      windowDays,
      intermittentFasting,
    })
    : { available: false, signals: [], activeIds: [] };

  // Cena abbondante (ritmo): utile da accostare al sonno senza causalità
  let heavyLateMeal = null;
  if (periodId === 'ieri' && meals.length) {
    const dinner = meals.find((m) => /cena/i.test(String(m.mealLabel || m.mealType || '')));
    const dinnerKcal = Number(dinner?.distribution?.kcal);
    const dayKcal = Number(usableMacros?.kcal);
    if (dinner && Number.isFinite(dinnerKcal) && dinnerKcal > 0) {
      const share = Number.isFinite(dayKcal) && dayKcal > 0 ? dinnerKcal / dayKcal : null;
      const heavy = dinnerKcal >= 900 || (share != null && share >= 0.4);
      if (heavy) {
        const topItem = [...(dinner.items || [])]
          .filter((it) => it?.eventId)
          .sort((a, b) => (Number(b.kcal) || 0) - (Number(a.kcal) || 0))[0] || null;
        heavyLateMeal = {
          active: true,
          mealLabel: dinner.mealLabel || 'Cena',
          clockHour: dinner.clockHour ?? null,
          kcal: dinnerKcal,
          dayIntakeKcal: Number.isFinite(dayKcal) ? dayKcal : null,
          shareOfDay: share != null ? Math.round(share * 100) / 100 : null,
          eventId: topItem?.eventId || null,
          detail: `Cena ${dinnerKcal} kcal${dinner.clockHour != null ? ` alle ${formatClockHour(dinner.clockHour)}` : ''}.`,
        };
      }
    }
  }
  if (heavyLateMeal && deterministicSignals && typeof deterministicSignals === 'object') {
    deterministicSignals.heavyLateMeal = heavyLateMeal;
    if (!Array.isArray(deterministicSignals.activeIds)) deterministicSignals.activeIds = [];
    if (!deterministicSignals.activeIds.includes('heavy_late_meal')) {
      deterministicSignals.activeIds = [...deterministicSignals.activeIds, 'heavy_late_meal'];
    }
    if (Array.isArray(deterministicSignals.signals)) {
      deterministicSignals.signals.push({
        id: 'heavy_late_meal',
        area: 'rhythm',
        active: true,
        ...heavyLateMeal,
      });
    }
  }

  const tSubs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const substitutionCandidates = fullHistory && isIsoDateString(session.analysisDate)
    ? buildFocusSubstitutionCandidates({
      fullHistory,
      analysisDate: session.analysisDate,
      catalogs: foodCatalogs,
      lookbackDays: periodId === 'ieri' ? 14 : Math.min(30, Math.max(windowDays, 14)),
      maxPerOccasion: 5,
      maxCandidates: 5,
      excludeNames: (meals || [])
        .flatMap((m) => m.items || [])
        .filter((it) => (it.novaGroupDocumented != null && it.novaGroupDocumented >= 4)
          || /duchessa|gelato|torta/i.test(String(it.name || '')))
        .map((it) => it.name),
    })
    : { available: false, reason: 'diary_unavailable', candidates: [], byOccasion: {} };
  mark('substitutionCandidates', tSubs);

  const sleepSeries = Array.isArray(sleepPillar?.series)
    ? sleepPillar.series
      .filter((r) => r.status === 'recorded')
      .map((r) => ({ date: r.date, wakeDate: r.wakeDate, hours: r.hours }))
    : [];

  const anomalies = [];
  if (periodId === 'ieri' && nutrition?.ieri?.toVerify) {
    for (const row of nutrition.ieri.toVerify) {
      anomalies.push({
        scope: row.scope || null,
        foodName: row.foodName || null,
        nutrient: row.nutrient || null,
        reason: row.reason || null,
      });
    }
  }
  const technicalNotes = periodId === 'ieri'
    ? (nutrition?.ieri?.comment?.technicalNotes || [])
    : [];

  const compass = buildFocusCompassSignalsForDossier({
    fullHistory,
    analysisDate: session.analysisDate,
    publicationDate: session.publicationDate,
    periodId,
    userTargets: session.userTargets,
  });

  const habitCompass = session.habitCompass?.available
    ? {
      title: session.habitCompass.title || null,
      reason: session.habitCompass.reason || null,
      cardio: session.habitCompass.cardio || null,
      highlights: session.habitCompass.highlights || null,
      evaluations: (session.habitCompass.evaluations || []).map((e) => ({
        id: e.id,
        pillarLabel: e.pillarLabel,
        directionLabel: e.directionLabel,
        habitObserved: e.habitObserved,
        motivation: e.motivation,
        proposal: e.proposal,
        limits: e.limits || [],
      })),
    }
    : null;

  const kentuEngines = buildFocusKentuEnginesForDossier({
    session,
    compassSignals: compass,
    habitCompass,
  });

  const horizonBrief = periodId === 'ieri'
    ? 'Orizzonte IERI: racconta la giornata nel contesto recente. Un giorno non è l’andamento di lungo periodo. Nessun verdetto settimanale di forza.'
    : periodId === 'mese'
      ? 'Orizzonte MESE: andamento e comportamenti ricorrenti; asteniti se i dati non bastano.'
      : 'Orizzonte SETTIMANA: abitudini e persistenza (non un singolo pasto).';

  const editorialReadingContext = buildFocusEditorialReadingContext({
    periodId,
    analysisDate: session.analysisDate,
    publicationDate: session.publicationDate,
    fullHistory,
    userTargets: session.userTargets,
    meals,
    workouts,
    dayIntakeKcal: usableMacros?.kcal ?? null,
    compassSignals: compass,
  });

  /** @type {object[]} */
  const eventIndexEvents = [];
  for (const meal of meals) {
    for (const it of meal.items || []) {
      if (!it?.eventId) continue;
      eventIndexEvents.push({
        id: it.eventId,
        kind: 'food',
        name: it.name || null,
        mealLabel: meal.mealLabel || null,
        date: session.analysisDate,
      });
    }
  }
  if (sleepDay?.eventId) {
    eventIndexEvents.push({
      id: sleepDay.eventId,
      kind: 'sleep',
      date: sleepDay.nightEndedOn || session.publicationDate,
      hours: sleepDay.hours ?? null,
    });
  }
  for (const w of workouts) {
    if (!w?.eventId) continue;
    eventIndexEvents.push({
      id: w.eventId,
      kind: 'workout',
      label: w.label || null,
      date: w.date || null,
    });
  }
  /** Alias corti per il modello (e1, e2, …); ids resta la lista reale per il validatore. */
  /** @type {Record<string, string>} */
  const aliasToId = {};
  /** @type {Record<string, string>} */
  const idToAlias = {};
  const eventsWithAlias = eventIndexEvents.map((e, i) => {
    const alias = `e${i + 1}`;
    aliasToId[alias] = e.id;
    idToAlias[e.id] = alias;
    return { ...e, alias };
  });
  const eventIndex = {
    schema: 'kentu.focusAiCoachEventIndex.v2',
    events: eventsWithAlias,
    ids: eventsWithAlias.map((e) => e.id),
    aliases: eventsWithAlias.map((e) => e.alias),
    aliasToId,
    idToAlias,
  };

  const dossier = {
    schema: 'kentu.focusAiCoachDossier.v2',
    periodId,
    analysisDate: session.analysisDate,
    publicationDate: session.publicationDate,
    windowLabel: session.windowLabel || null,
    horizonBrief,
    editorialReadingContext,
    eventIndex,
    mandate: {
      doNotRestateCardNumbers: true,
      teachOrHypothesizeOrImproveDecision: true,
      distinguish: ['recorded_fact', 'general_knowledge', 'founded_inference', 'hypothesis_to_test'],
      declaredGoalVsObservedConduct: true,
      episodeVersusTrajectory: true,
      humanReadableHeadline: true,
      concreteFoodManeuverPreferred: true,
      noUnmeasuredSleepPhysiology: true,
      namePatternAndEstimatedAreIndicative: true,
      fiveAreas: ['energia', 'qualita', 'ritmo', 'sonno', 'movimento'],
    },
    pillars: {
      nutrition: {
        primaryValue: nutritionPillar?.primaryValue || null,
        shortPhrase: nutritionPillar?.shortPhrase || null,
        hasEvidence: Boolean(nutritionPillar?.hasEvidence),
        attention: Boolean(nutritionPillar?.attention),
      },
      exercise: {
        primaryValue: exercisePillar?.primaryValue || null,
        shortPhrase: exercisePillar?.shortPhrase || null,
        hasEvidence: Boolean(exercisePillar?.hasEvidence),
        attention: Boolean(exercisePillar?.attention),
      },
      sleep: {
        primaryValue: sleepPillar?.primaryValue || null,
        shortPhrase: sleepPillar?.shortPhrase || null,
        hasEvidence: Boolean(sleepPillar?.hasEvidence),
        attention: Boolean(sleepPillar?.attention),
      },
    },
    nutrition: {
      meals,
      usableMacros,
      usableMicros,
      trend: nutritionTrend,
      foodFrequency,
      foodQuality,
      substitutionCandidates,
      privateComment: periodId === 'ieri' ? (nutrition?.ieri?.comment?.text || null) : null,
      stimuli,
    },
    deterministicSignals,
    exercise: {
      workouts,
      muscleGroupFrequency,
      seriesRecorded: exerciseSeries,
      cardio,
      detailNote: exercisePillar?.detailNote || null,
      policy: {
        muscleGroupsAreNotExercises: true,
        noInventedSetsRepsLoads: true,
        noInventedIntensity: true,
        missingLogNotInactivity: true,
        strengthOnlyIfLogged: true,
        cardioForEveryone: true,
      },
    },
    sleep: {
      day: sleepDay,
      seriesRecorded: sleepSeries,
      detailNote: sleepPillar?.detailNote || null,
    },
    compassSignals: compass,
    habitCompass,
    kentuEngines,
    anomalies,
    technicalNotes,
    mealManeuver: session.mealManeuver
      ? {
        suggested: Boolean(session.mealManeuver.suggested),
        status: session.mealManeuver.status || null,
        message: session.mealManeuver.message || null,
        criticality: session.mealManeuver.criticality || null,
        objective: session.mealManeuver.objective || null,
        observation: session.mealManeuver.observation || null,
        suggestedChange: session.mealManeuver.suggestedChange || null,
        expectedAdvantage: session.mealManeuver.expectedAdvantage || null,
        tradeoffs: session.mealManeuver.tradeoffs || null,
        watchNextDays: session.mealManeuver.watchNextDays || null,
        limits: session.mealManeuver.limits || [],
        simulation: session.mealManeuver.simulation
          ? {
            dailyKcalUnchanged: session.mealManeuver.simulation.dailyKcalUnchanged,
            dailyKcalBefore: session.mealManeuver.simulation.dailyKcalBefore,
            dailyKcalAfter: session.mealManeuver.simulation.dailyKcalAfter,
            item: session.mealManeuver.simulation.item || null,
            addressesCriticality: session.mealManeuver.simulation.addressesCriticality || null,
          }
          : null,
      }
      : null,
    userTargets: session.userTargets
      ? {
        kcal: session.userTargets.kcal ?? null,
        prot: session.userTargets.prot ?? null,
        carb: session.userTargets.carb ?? null,
        fat: session.userTargets.fat ?? null,
      }
      : null,
    fallbackDeterministicCoach: wellness.coach
      ? {
        note: 'Fallback se AI assente — non è interpretazione approfondita.',
        wentWell: wellness.coach.wentWell || null,
        needsAttention: wellness.coach.needsAttention || null,
        concreteAction: wellness.coach.concreteAction || null,
      }
      : null,
    policy: {
      equalPillars: true,
      noHealthScore: true,
      noProvenCausalityRequired: true,
      allowPlausibleMechanisms: true,
      noClinicalDiagnosis: true,
      noInventedBodyInflammation: true,
      noInventedDII: true,
      missingNotZero: true,
      foodNamesFromDiaryOnly: true,
      mealManeuverSimulationOnly: true,
      noQuadrantCopy: true,
      targetIsNotTdee: true,
    },
  };

  const foodQualityCompleteness = dossier.nutrition.foodQuality?.completeness || 'complete';
  const foodQualityCompletenessReason = dossier.nutrition.foodQuality?.completenessReason || null;
  const definitive = foodQualityCompleteness !== 'partial';

  const beforeBreakdown = measureFocusDossierSizeBreakdown(dossier);
  logFocusDossierSizeBreakdown('before_slim', dossier, { profile: { ...profileMs } });

  const tSlim = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const slimDossier = slimFocusAiCoachDossier(dossier);
  mark('slim', tSlim);
  const buildMs = Math.round(
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - buildStartedAt,
  );
  mark('total', buildStartedAt);
  profileMs.total = buildMs;
  profileMs.lookupMemoSize = foodCatalogs?.__focusLookupSession?.memoSize?.() ?? null;

  const afterBreakdown = measureFocusDossierSizeBreakdown(slimDossier);
  logFocusDossierSizeBreakdown('after_slim', slimDossier, {
    buildMs,
    profile: profileMs,
  });

  const dataVersion = shortHash(stableStringify({
    uid: session.uid,
    periodId,
    analysisDate: session.analysisDate,
    publicationDate: session.publicationDate,
    pillars: slimDossier.pillars,
    meals: slimDossier.nutrition?.meals,
    foodFrequency: slimDossier.nutrition?.foodFrequency,
    foodQuality: slimDossier.nutrition?.foodQuality?.day || null,
    foodQualityCompleteness,
    foodQualityCompletenessReason,
    deterministicSignals: slimDossier.deterministicSignals?.activeIds || [],
    workouts: slimDossier.exercise?.workouts,
    cardio: slimDossier.exercise?.cardio,
    sleep: slimDossier.sleep,
    compass: slimDossier.compassSignals?.observedTrajectory || null,
  }));

  return {
    ok: true,
    reason: null,
    dossier: slimDossier,
    dossierSize: {
      beforeChars: beforeBreakdown.totalChars,
      afterChars: afterBreakdown.totalChars,
      beforeSections: beforeBreakdown.sections,
      afterSections: afterBreakdown.sections,
      buildMs,
      profileMs,
    },
    dataVersion,
    foodQualityCompleteness,
    foodQualityCompletenessReason,
    definitive,
    binding: {
      uid: session.uid,
      periodId,
      analysisDate: session.analysisDate,
      publicationDate: session.publicationDate,
      dataVersion,
      windowKey: session.analysisDate,
      foodQualityCompleteness,
      foodQualityCompletenessReason,
      definitive,
    },
  };
}
