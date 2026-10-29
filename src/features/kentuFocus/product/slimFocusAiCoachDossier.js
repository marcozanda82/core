/**
 * Compatta il dossier AI Coach per il modello: aggregati/segnali, niente grezzi.
 * Target: ieri < 25k char; settimana/mese < 40k.
 */

import { compactFoodQualityProvenance } from './buildFocusFoodQualityBlock.js';

/**
 * @param {unknown} value
 * @returns {number}
 */
export function focusJsonChars(value) {
  try {
    return JSON.stringify(value)?.length || 0;
  } catch {
    return 0;
  }
}

/**
 * Ripartizione dimensione per sezione top-level.
 * @param {object|null|undefined} dossier
 */
export function measureFocusDossierSizeBreakdown(dossier) {
  if (!dossier || typeof dossier !== 'object') {
    return { totalChars: 0, sections: [] };
  }
  const totalChars = focusJsonChars(dossier);
  const sections = Object.entries(dossier)
    .map(([key, value]) => {
      const chars = focusJsonChars(value);
      return {
        key,
        chars,
        pct: totalChars > 0 ? Math.round((chars / totalChars) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.chars - a.chars);
  return { totalChars, sections };
}

/**
 * Log DEV della ripartizione.
 * @param {string} label
 * @param {object|null|undefined} dossier
 * @param {{ buildMs?: number|null, profile?: object|null }} [extra]
 */
export function logFocusDossierSizeBreakdown(label, dossier, extra = {}) {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV === false) {
      return;
    }
  } catch {
    /* node */
  }
  const breakdown = measureFocusDossierSizeBreakdown(dossier);
  // eslint-disable-next-line no-console
  console.info('[FocusAiCoach] dossier_size', JSON.stringify({
    label,
    totalChars: breakdown.totalChars,
    estTokens: Math.round(breakdown.totalChars / 4),
    buildMs: extra.buildMs ?? null,
    profile: extra.profile || null,
    sections: breakdown.sections.slice(0, 16),
  }));
}

/**
 * @param {unknown} v
 */
function omitNulls(v) {
  if (Array.isArray(v)) return v.map(omitNulls).filter((x) => x !== undefined);
  if (!v || typeof v !== 'object') return v;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    // Conserva null espliciti (es. bedtime missing); scarta solo undefined / vuoti
    if (val === undefined) continue;
    if (val === '') continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (val === null) {
      out[k] = null;
      continue;
    }
    const next = omitNulls(val);
    if (next === undefined) continue;
    if (Array.isArray(next) && next.length === 0) continue;
    out[k] = next;
  }
  return out;
}

/**
 * @param {object|null|undefined} foodQuality
 */
function relevantFoodNameSet(foodQuality) {
  /** @type {Set<string>} */
  const set = new Set();
  const day = foodQuality?.day;
  if (!day) return set;
  for (const row of day.nova4Items || []) {
    if (row?.name) set.add(String(row.name).toLowerCase());
  }
  for (const row of day.omega3Sources || []) {
    if (row?.name) set.add(String(row.name).toLowerCase());
  }
  for (const row of day.plantFoods || []) {
    if (row?.name) set.add(String(row.name).toLowerCase());
  }
  for (const row of day.wholeGrainFoods || []) {
    if (row?.name) set.add(String(row.name).toLowerCase());
  }
  return set;
}

/**
 * @param {object[]} meals
 * @param {Set<string>} relevantNames
 */
function slimMeals(meals, relevantNames) {
  return (meals || []).map((meal) => {
    const items = Array.isArray(meal.items) ? meal.items : [];
    const ranked = [...items].sort((a, b) => (Number(b.kcal) || 0) - (Number(a.kcal) || 0));
    const top = ranked[0];
    const kept = items.filter((it) => {
      const name = String(it?.name || '').toLowerCase();
      if (!name) return false;
      if (relevantNames.has(name)) return true;
      if (it?.novaGroupDocumented != null && Number(it.novaGroupDocumented) >= 4) return true;
      if (Array.isArray(it?.toVerify) && it.toVerify.length) return true;
      if (top && it === top) return true;
      return false;
    });
    // Se filtro troppo aggressivo, tieni almeno i top 2 per kcal
    const finalItems = kept.length > 0 ? kept : ranked.slice(0, 2);
    return omitNulls({
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
      items: finalItems.map((it) => omitNulls({
        eventId: it.eventId || null,
        name: it.name || null,
        grams: it.grams ?? null,
        kcal: it.kcal ?? null,
        proteinG: it.proteinG ?? null,
        carbG: it.carbG ?? null,
        fatG: it.fatG ?? null,
        fiberG: typeof it.fiberG === 'object' && it.fiberG
          ? (it.fiberG.value ?? null)
          : (it.fiberG ?? null),
        nova: it.novaGroupDocumented ?? it.novaScore ?? null,
      })),
    });
  });
}

/**
 * @param {object|null|undefined} fq
 */
function slimFoodQuality(fq) {
  if (!fq || fq.available === false) {
    return omitNulls({
      available: false,
      reason: fq?.reason || null,
      completeness: fq?.completeness || null,
    });
  }
  const slimDay = (day) => {
    if (!day) return null;
    return omitNulls({
      date: day.date || null,
      hasFood: day.hasFood,
      itemCount: day.itemCount ?? null,
      fiberGTotal: day.fiberGTotal ?? null,
      nova4Items: (day.nova4Items || []).map((r) => ({
        name: r.name,
        mealLabel: r.mealLabel,
        kcal: r.kcal ?? null,
        grams: r.grams ?? null,
        novaGroup: r.novaGroup ?? null,
        critiqueWorthy: r.critiqueWorthy === true,
        critiqueReason: r.critiqueReason || null,
        provenance: compactFoodQualityProvenance(r.provenance),
        source: r.source || null,
      })),
      omega3Sources: (day.omega3Sources || []).slice(0, 6).map((r) => ({
        name: r.name,
        mealLabel: r.mealLabel,
        omega3G: r.omega3G,
        provenance: compactFoodQualityProvenance(r.provenance),
      })),
      plantFoods: (day.plantFoods || []).slice(0, 8).map((r) => ({
        name: r.name,
        mealLabel: r.mealLabel,
        role: r.role,
        provenance: compactFoodQualityProvenance(r.provenance),
      })),
      wholeGrainFoods: (day.wholeGrainFoods || []).slice(0, 4).map((r) => ({
        name: r.name,
        mealLabel: r.mealLabel,
        provenance: compactFoodQualityProvenance(r.provenance),
      })),
    });
  };

  // Contesto: solo totali giornalieri + segnali, non liste complete
  const recentSeries = (fq.recent?.days || fq.recent?.series || [])
    .slice(0, 14)
    .map((d) => omitNulls({
      date: d.date,
      kcal: d.kcal ?? null,
      fiberG: d.fiberGTotal ?? d.fiberG ?? null,
      nova4n: Array.isArray(d.nova4Items) ? d.nova4Items.length : (d.nova4Count ?? null),
      hasFood: d.hasFood,
    }));

  return omitNulls({
    available: true,
    completeness: fq.completeness || null,
    completenessReason: fq.completenessReason || null,
    day: slimDay(fq.day),
    recent: omitNulls({
      days: recentSeries,
      fiberMean: fq.recent?.fiberGMean ?? fq.recent?.averages?.fiberG ?? null,
      nova4Days: fq.recent?.nova4DayCount ?? null,
    }),
  });
}

/**
 * @param {object|null|undefined} subs
 * @param {string|null} relevantOccasion
 */
function slimSubstitutionCandidates(subs, relevantOccasion) {
  if (!subs?.available) {
    return { available: false, reason: subs?.reason || null };
  }
  const occasion = relevantOccasion && relevantOccasion !== 'unknown'
    ? relevantOccasion
    : null;
  const pool = occasion
    ? (subs.byOccasion?.[occasion] || [])
    : [
      ...(subs.byOccasion?.dolce || []),
      ...(subs.byOccasion?.snack || []),
      ...(subs.byOccasion?.bevanda || []),
    ];
  const top = pool.slice(0, 5).map((c) => omitNulls({
    name: c.name,
    as: c.displayNameMidSentence || c.name,
    occasion: c.occasion,
    g: c.typicalGrams,
    n: c.occasionsInWindow,
    nova: c.novaGroup,
  }));
  return omitNulls({
    available: top.length > 0,
    occasion: occasion || 'mixed',
    candidates: top,
    generic: occasion
      ? (subs.genericFallback?.[occasion] || null)
      : (subs.genericFallback?.dolce || null),
  });
}

/**
 * Occasione rilevante: primo NOVA4 critiqueWorthy del giorno, altrimenti dolce se presente.
 * @param {object|null|undefined} foodQuality
 * @param {object|null|undefined} subs
 */
function pickRelevantOccasion(foodQuality, subs) {
  const nova4 = foodQuality?.day?.nova4Items || [];
  const critique = nova4.find((r) => r?.critiqueWorthy);
  // euristica: dolci tipici
  const name = String(critique?.name || nova4[0]?.name || '').toLowerCase();
  if (/cioccolat|torta|biscott|gelato|budino|crema|duchessa|excellence|cookie|muffin|merend/i.test(name)) {
    return 'dolce';
  }
  if ((subs?.byOccasion?.dolce || []).length) return 'dolce';
  if ((subs?.byOccasion?.snack || []).length) return 'snack';
  if ((subs?.byOccasion?.bevanda || []).length) return 'bevanda';
  return null;
}

/**
 * @param {object} signals
 */
function slimDeterministicSignals(signals) {
  if (!signals) return null;
  return omitNulls({
    available: signals.available !== false,
    activeIds: signals.activeIds || [],
    signals: (signals.signals || [])
      .filter((s) => (
        s?.active
        || s?.id === 'meal_within_3h_of_bedtime'
        || s?.id === 'sleep_under_7h'
        || s?.id === 'fasting_over_14h'
        || s?.id === 'heavy_late_meal'
      ))
      .map((s) => omitNulls({
        id: s.id,
        area: s.area,
        active: Boolean(s.active),
        detail: s.detail || s.message || null,
        eventId: s.eventId || null,
        bedtimeProvenance: s.bedtimeProvenance || undefined,
        inactiveReason: s.inactiveReason || undefined,
        summaryEligible: s.summaryEligible,
      })),
    heavyLateMeal: signals.heavyLateMeal?.active
      ? omitNulls({
        kcal: signals.heavyLateMeal.kcal,
        clockHour: signals.heavyLateMeal.clockHour,
        eventId: signals.heavyLateMeal.eventId,
        detail: signals.heavyLateMeal.detail,
      })
      : null,
  });
}

/**
 * @param {object} dossier
 * @returns {object}
 */
export function slimFocusAiCoachDossier(dossier) {
  if (!dossier || typeof dossier !== 'object') return dossier;

  const relevantNames = relevantFoodNameSet(dossier.nutrition?.foodQuality);
  const meals = slimMeals(dossier.nutrition?.meals || [], relevantNames);
  const occasion = pickRelevantOccasion(
    dossier.nutrition?.foodQuality,
    dossier.nutrition?.substitutionCandidates,
  );

  const eventIndex = dossier.eventIndex
    ? omitNulls({
      schema: 'kentu.focusAiCoachEventIndex.v2',
      aliases: dossier.eventIndex.aliases || [],
      ids: dossier.eventIndex.ids || [],
      aliasToId: dossier.eventIndex.aliasToId || null,
      idToAlias: dossier.eventIndex.idToAlias || null,
      events: (dossier.eventIndex.events || []).map((e) => omitNulls({
        alias: e.alias,
        id: e.id,
        kind: e.kind,
        name: e.name || e.label || null,
        mealLabel: e.mealLabel || null,
        hours: e.hours ?? null,
      })),
    })
    : null;

  const slim = omitNulls({
    schema: 'kentu.focusAiCoachDossier.v3',
    periodId: dossier.periodId,
    analysisDate: dossier.analysisDate,
    publicationDate: dossier.publicationDate,
    windowLabel: dossier.windowLabel,
    horizonBrief: dossier.horizonBrief,
    userTargets: dossier.userTargets,
    pillars: dossier.pillars,
    eventIndex,
    editorialReadingContext: dossier.editorialReadingContext
      ? omitNulls({
        dayVersusRecent: dossier.editorialReadingContext.dayVersusRecent,
        mealTiming: dossier.editorialReadingContext.mealTiming,
        readingHint: dossier.editorialReadingContext.readingHint
          || dossier.editorialReadingContext.dayVersusRecent?.readingHint
          || null,
        redistributionCandidates: (dossier.editorialReadingContext.redistributionCandidates || [])
          .slice(0, 4),
      })
      : null,
    nutrition: {
      meals: Array.isArray(meals) ? meals : [],
      usableMacros: dossier.nutrition?.usableMacros || null,
      usableMicros: (dossier.nutrition?.usableMicros || []).slice(0, 6),
      trend: dossier.nutrition?.trend
        ? omitNulls({
          daysWithFood: dossier.nutrition.trend.daysWithFood,
          averagesFromRecordedDaysOnly: dossier.nutrition.trend.averagesFromRecordedDaysOnly,
          seriesRecorded: (dossier.nutrition.trend.seriesRecorded || []).slice(0, 31),
        })
        : null,
      foodFrequency: (dossier.nutrition?.foodFrequency || []).slice(0, 10).map((f) => omitNulls({
        name: f.name,
        days: f.distinctDays,
        n: f.occasions,
        nova: f.novaGroupDocumented,
        habit: f.persistentHabit || null,
      })),
      foodQuality: slimFoodQuality(dossier.nutrition?.foodQuality),
      substitutionCandidates: slimSubstitutionCandidates(
        dossier.nutrition?.substitutionCandidates,
        occasion,
      ),
      stimuli: dossier.nutrition?.stimuli
        ? omitNulls({
          available: dossier.nutrition.stimuli.available,
          caffeineMg: dossier.nutrition.stimuli.caffeineMgTotal
            ?? dossier.nutrition.stimuli.caffeineMg
            ?? null,
          alcoholG: dossier.nutrition.stimuli.alcoholGTotal
            ?? dossier.nutrition.stimuli.alcoholG
            ?? null,
          note: dossier.nutrition.stimuli.note || null,
        })
        : null,
    },
    deterministicSignals: slimDeterministicSignals(dossier.deterministicSignals),
    exercise: {
      workouts: (dossier.exercise?.workouts || []).map((w) => omitNulls({
        eventId: w.eventId,
        date: w.date,
        label: w.label,
        durationMin: w.durationMin,
        clockLabel: w.clockLabel,
        kind: w.kind || w.kindLabel,
        muscles: (w.muscleGroups || []).slice(0, 6),
      })),
      seriesRecorded: (dossier.exercise?.seriesRecorded || []).slice(0, 31),
      cardio: dossier.exercise?.cardio
        ? omitNulls({
          aerobicMinutesDocumented: dossier.exercise.cardio.aerobicMinutesDocumented,
          equivalentModerateMinutes: dossier.exercise.cardio.equivalentModerateMinutes,
          intensityDocumented: dossier.exercise.cardio.intensityDocumented,
        })
        : null,
    },
    policy: {
      noHealthScore: true,
      noClinicalDiagnosis: true,
      missingNotZero: true,
      foodNamesFromDiaryOnly: true,
    },
    sleep: {
      day: dossier.sleep?.day
        ? {
          available: Boolean(dossier.sleep.day.available),
          eventId: dossier.sleep.day.eventId || null,
          hours: dossier.sleep.day.hours ?? null,
          wakeTime: dossier.sleep.day.wakeTime ?? null,
          // bedtime può essere 0 (mezzanotte) o null (missing): non usare omitNulls
          bedtime: dossier.sleep.day.bedtime ?? null,
          bedtimeProvenance: dossier.sleep.day.bedtimeProvenance || null,
          qualityStars: dossier.sleep.day.qualityStars ?? null,
          nightEndedOn: dossier.sleep.day.nightEndedOn || null,
          stagesSuppressed: Boolean(dossier.sleep.day.stagesSuppressed),
          metrics: Array.isArray(dossier.sleep.day.metrics)
            ? dossier.sleep.day.metrics.slice(0, 6)
            : [],
        }
        : null,
      seriesRecorded: (dossier.sleep?.seriesRecorded || []).slice(0, 31),
    },
    compassSignals: dossier.compassSignals
      ? omitNulls({
        observedEnergy: dossier.compassSignals.observedEnergy,
        observedTrajectory: dossier.compassSignals.observedTrajectory
          ? omitNulls({
            timeframe: dossier.compassSignals.observedTrajectory.timeframe,
            balanceVsTargetKcal: dossier.compassSignals.observedTrajectory.balanceVsTargetKcal,
            note: dossier.compassSignals.observedTrajectory.note,
          })
          : null,
        limits: (dossier.compassSignals.limits || []).slice(0, 3),
      })
      : null,
    kentuEngines: dossier.kentuEngines
      ? omitNulls({
        energyPilot: dossier.kentuEngines.energyPilot
          ? omitNulls({
            observedKcal: dossier.kentuEngines.energyPilot.observedKcal
              ?? dossier.kentuEngines.energyPilot.observedEnergy,
            targetKcal: dossier.kentuEngines.energyPilot.targetKcal,
            balanceKcal: dossier.kentuEngines.energyPilot.balanceKcal
              ?? dossier.kentuEngines.energyPilot.deltaKcal,
            note: dossier.kentuEngines.timeframeNote || null,
          })
          : null,
        bussola: dossier.kentuEngines.bussola
          ? omitNulls({
            timeframe: dossier.kentuEngines.bussola.timeframe,
            observed: dossier.kentuEngines.bussola.observedEnergy
              ?? dossier.kentuEngines.bussola.observed,
            reference: dossier.kentuEngines.bussola.referenceEnergy
              ?? dossier.kentuEngines.bussola.reference,
          })
          : null,
      })
      : null,
    habitCompass: dossier.habitCompass
      ? omitNulls({
        title: dossier.habitCompass.title,
        evaluations: (dossier.habitCompass.evaluations || []).slice(0, 4).map((e) => omitNulls({
          id: e.id,
          direction: e.directionLabel,
          habit: e.habitObserved,
          why: e.motivation,
          proposal: e.proposal,
        })),
      })
      : null,
    generationLimits: dossier.generationLimits || null,
    offWaitMeta: dossier.offWaitMeta || null,
  });

  // omitNulls scarta array vuoti: per ieri/settimana/mese i contratti
  // richiedono nutrition.meals sempre presente (es. [] in trend).
  if (slim.nutrition && !Array.isArray(slim.nutrition.meals)) {
    slim.nutrition.meals = Array.isArray(meals) ? meals : [];
  }
  if (slim.exercise && !Array.isArray(slim.exercise.workouts)) {
    slim.exercise.workouts = [];
  }

  return slim;
}
