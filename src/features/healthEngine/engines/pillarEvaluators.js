/**
 * Valutatori di pilastro — puri, deterministici, nessun side-effect.
 */

import { CERTAINTY_LEVELS, METABOLIC_PHASE_IDS } from '../contracts/healthSnapshot.types.js';
import {
  ACTIVITY_PENDING_HOUR_END,
  DRIVER_DIRECTIONS,
  DRIVER_IDS,
  NEUTRAL_SCORE_BASELINE,
  NUTRITION_INCOMPLETE_TARGET_RATIO,
  PILLAR_STATES,
} from '../contracts/healthSystem.types.js';
import { phraseByCertainty, weakestCertainty } from './epistemicLanguage.js';

export const NUTRITION_DAY_PENDING_INSIGHT =
  'Giornata appena iniziata. Registra i primi pasti per calibrare l\'analisi nutrizionale.';

export const ACTIVITY_DAY_PENDING_INSIGHT =
  'In attesa del primo stimolo odierno. Il carico settimanale sta guidando l\'analisi.';

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function driver(id, direction, magnitude, certainty) {
  return {
    id,
    direction,
    magnitude: Math.round(clamp01(magnitude) * 10000) / 10000,
    certainty: certainty || CERTAINTY_LEVELS.ESTIMATED,
  };
}

function ratioGap(actual, target) {
  const t = Number(target);
  const a = Number(actual);
  if (!Number.isFinite(t) || t <= 0) return null;
  const r = (Number.isFinite(a) ? a : 0) / t;
  return { ratio: r, gap: clamp01(1 - r), excess: clamp01(r - 1) };
}

/**
 * @param {number} score
 * @param {boolean} insufficient
 * @returns {import('../contracts/healthSystem.types.js').PillarState}
 */
export function stateFromScore(score, insufficient) {
  if (insufficient) return PILLAR_STATES.NEUTRAL;
  const s = Number(score);
  if (s >= 75) return PILLAR_STATES.OPTIMAL;
  if (s >= 50) return PILLAR_STATES.FLEXION;
  return PILLAR_STATES.OVERLOAD;
}

/**
 * @param {import('../contracts/healthSystem.types.js').Driver[]} drivers
 */
export function scoreFromDrivers(drivers) {
  let score = 62;
  (Array.isArray(drivers) ? drivers : []).forEach((d) => {
    const mag = clamp01(d.magnitude);
    const conf = d.certainty === CERTAINTY_LEVELS.MEASURED
      ? 1
      : d.certainty === CERTAINTY_LEVELS.CALCULATED
        ? 0.85
        : d.certainty === CERTAINTY_LEVELS.INFERRED
          ? 0.65
          : 0.4;
    if (d.direction === DRIVER_DIRECTIONS.POSITIVE) score += mag * 28 * conf;
    else if (d.direction === DRIVER_DIRECTIONS.NEGATIVE) score -= mag * 42 * conf;
  });
  return Math.max(0, Math.min(100, round1(score)));
}

function makePillar(drivers, insight, evidence, insufficient) {
  const score = insufficient ? NEUTRAL_SCORE_BASELINE : scoreFromDrivers(drivers);
  return {
    state: stateFromScore(score, insufficient),
    score,
    drivers,
    insight,
    evidence,
  };
}

function localHourFromTimestamp(nowMs) {
  const t = Number(nowMs);
  if (!Number.isFinite(t) || t <= 0) return null;
  const d = new Date(t);
  return d.getHours() + d.getMinutes() / 60;
}

function meanMuscleDecay(activity = {}) {
  const decay = activity.muscleDecay && typeof activity.muscleDecay === 'object'
    ? activity.muscleDecay
    : {};
  const districts = Object.values(decay).map((n) => Number(n)).filter((n) => Number.isFinite(n));
  if (districts.length === 0) return { districts, mean: 0, min: 0 };
  return {
    districts,
    mean: districts.reduce((a, b) => a + b, 0) / districts.length,
    min: Math.min(...districts),
  };
}

/**
 * Nutrizione incompleta: niente pasti, oppure calorie sotto il 10% del target.
 * Non è un fallimento dietetico: la giornata è ancora da compilare.
 */
export function isNutritionDayIncomplete(nutrition = {}) {
  const kcal = Number(nutrition.calories) || 0;
  const protein = Number(nutrition.proteinGrams) || 0;
  const fiber = Number(nutrition.fiberGrams) || 0;
  const target = Number(nutrition.targetCalories) || 0;
  const mealsAbsent = kcal <= 0 && protein <= 0 && fiber <= 0;
  if (mealsAbsent) return true;
  if (target > 0 && kcal < target * NUTRITION_INCOMPLETE_TARGET_RATIO) return true;
  return false;
}

function hasWeeklyActivityTrend(activity = {}) {
  const minutes = Number(activity.cardioMinutes7d) || 0;
  const { mean } = meanMuscleDecay(activity);
  const lastTs = Number(activity.lastWorkoutTimestamp);
  return minutes > 0 || mean >= 0.05 || (Number.isFinite(lastTs) && lastTs > 0);
}

/**
 * Attività in attesa: nessun allenamento oggi e (mattina, oppure nessuno storico 7g).
 */
export function isActivityDayPending(activity = {}, nowMs = null) {
  const today = Array.isArray(activity.todayWorkouts) ? activity.todayWorkouts : [];
  if (today.length > 0) return false;
  if (!hasWeeklyActivityTrend(activity)) return true;
  const hour = localHourFromTimestamp(nowMs);
  return hour != null && hour < ACTIVITY_PENDING_HOUR_END;
}

export function evaluateRecovery(sleep = {}, systemic = {}) {
  const drivers = [];
  const hasSleep = sleep?.hasSleepData === true && Number(sleep.hours) > 0;
  const hoursCert = sleep?.certainty?.hours || CERTAINTY_LEVELS.ESTIMATED;
  const qualityCert = sleep?.certainty?.quality || CERTAINTY_LEVELS.ESTIMATED;
  const bufferCert = sleep?.certainty?.dinnerSleepBuffer || CERTAINTY_LEVELS.ESTIMATED;
  const histCert = sleep?.certainty?.history7d || CERTAINTY_LEVELS.ESTIMATED;
  const fatigueCert = systemic?.certainty?.systemicFatigue || CERTAINTY_LEVELS.ESTIMATED;

  if (!hasSleep) {
    drivers.push(driver(
      DRIVER_IDS.SLEEP_DATA_MISSING,
      DRIVER_DIRECTIONS.NEGATIVE,
      0.9,
      hoursCert,
    ));
  } else {
    const hours = Number(sleep.hours) || 0;
    if (hours < 5) {
      drivers.push(driver(DRIVER_IDS.SLEEP_DURATION, DRIVER_DIRECTIONS.NEGATIVE, clamp01((6 - hours) / 3), hoursCert));
    } else if (hours < 7) {
      drivers.push(driver(DRIVER_IDS.SLEEP_DURATION, DRIVER_DIRECTIONS.NEGATIVE, clamp01((7 - hours) / 2), hoursCert));
    } else if (hours <= 8.5) {
      drivers.push(driver(
        DRIVER_IDS.SLEEP_DURATION,
        DRIVER_DIRECTIONS.POSITIVE,
        clamp01(1 - Math.abs(hours - 7.5) / 1.5),
        hoursCert,
      ));
    } else {
      drivers.push(driver(DRIVER_IDS.SLEEP_DURATION, DRIVER_DIRECTIONS.NEGATIVE, clamp01((hours - 8.5) / 2), hoursCert));
    }

    const quality = Number(sleep.quality) || 0;
    if (quality >= 4) {
      drivers.push(driver(DRIVER_IDS.SLEEP_QUALITY, DRIVER_DIRECTIONS.POSITIVE, (quality - 3) / 2, qualityCert));
    } else if (quality > 0) {
      drivers.push(driver(DRIVER_IDS.SLEEP_QUALITY, DRIVER_DIRECTIONS.NEGATIVE, (4 - quality) / 3, qualityCert));
    }

    const buffer = sleep.dinnerSleepBuffer;
    if (buffer != null && Number.isFinite(Number(buffer))) {
      const b = Number(buffer);
      if (b < 3) {
        drivers.push(driver(
          DRIVER_IDS.DINNER_SLEEP_BUFFER,
          DRIVER_DIRECTIONS.NEGATIVE,
          clamp01((3 - b) / 3 + 0.35),
          bufferCert,
        ));
      } else if (b < 4) {
        drivers.push(driver(
          DRIVER_IDS.DINNER_SLEEP_BUFFER,
          DRIVER_DIRECTIONS.NEGATIVE,
          clamp01((4 - b) / 4),
          bufferCert,
        ));
      } else {
        drivers.push(driver(DRIVER_IDS.DINNER_SLEEP_BUFFER, DRIVER_DIRECTIONS.POSITIVE, 0.7, bufferCert));
      }
    }

    const variability = Number(sleep.history7d?.wakeTimeVariability);
    if (Number.isFinite(variability)) {
      if (variability > 1) {
        drivers.push(driver(DRIVER_IDS.WAKE_REGULARITY, DRIVER_DIRECTIONS.NEGATIVE, clamp01(variability / 2.5), histCert));
      } else {
        drivers.push(driver(DRIVER_IDS.WAKE_REGULARITY, DRIVER_DIRECTIONS.POSITIVE, clamp01(1 - variability), histCert));
      }
    }
  }

  const fatigue = Number(systemic?.systemicFatigue);
  if (Number.isFinite(fatigue)) {
    if (fatigue >= 0.55) {
      drivers.push(driver(DRIVER_IDS.SYSTEMIC_FATIGUE, DRIVER_DIRECTIONS.NEGATIVE, clamp01((fatigue - 0.4) / 0.6), fatigueCert));
    } else {
      drivers.push(driver(DRIVER_IDS.SYSTEMIC_FATIGUE, DRIVER_DIRECTIONS.POSITIVE, clamp01(1 - fatigue), fatigueCert));
    }
  }

  const certainty = weakestCertainty(drivers, hoursCert);
  const hours = Number(sleep.hours);
  const quality = Number(sleep.quality) || 0;
  
  let sleepQualityPhrase = '';
  if (quality >= 4) sleepQualityPhrase = 'Hai dormito bene';
  else if (quality >= 3) sleepQualityPhrase = 'Il sonno è stato discreto';
  else if (quality > 0) sleepQualityPhrase = 'Il riposo non è stato ottimale';
  
  const insight = phraseByCertainty(certainty, {
    measured: hasSleep
      ? (hours >= 7 && hours <= 8.5 && quality >= 4
        ? `${sleepQualityPhrase}: ${hours.toFixed(1)} ore sono perfette per recuperare.`
        : hours < 6
          ? `Hai dormito solo ${hours.toFixed(1)} ore. Il corpo ha bisogno di più riposo.`
          : hours > 9
            ? `${hours.toFixed(1)} ore sono tante. Forse dormire un po' meno ti darebbe più energia.`
            : `${sleepQualityPhrase}, ma potresti migliorare la qualità o la durata del sonno.`)
      : 'Segna quanto hai dormito stanotte: serve per capire come stai recuperando.',
    calculated: hasSleep
      ? 'Il recupero dipende anche da quando hai cenato e dalla regolarità del risveglio.'
      : 'Segna quanto hai dormito stanotte: serve per capire come stai recuperando.',
    inferred: hasSleep
      ? 'Alcuni segnali suggeriscono che il riposo potrebbe essere migliorato.'
      : 'Segna quanto hai dormito stanotte: serve per capire come stai recuperando.',
    estimated: 'Segna quanto hai dormito stanotte: serve per capire come stai recuperando.',
  });

  return makePillar(
    drivers,
    { text: insight, certainty },
    {
      type: 'sleep+systemic',
      data: {
        hours: Number(sleep.hours) || 0,
        quality: Number(sleep.quality) || 0,
        dinnerSleepBuffer: sleep.dinnerSleepBuffer ?? null,
        systemicFatigue: Number.isFinite(fatigue) ? fatigue : null,
        hasSleepData: hasSleep,
      },
    },
    !hasSleep,
  );
}

export function evaluateNutrition(nutrition = {}) {
  const drivers = [];
  const kcal = Number(nutrition.calories) || 0;
  const protein = Number(nutrition.proteinGrams) || 0;
  const fiber = Number(nutrition.fiberGrams) || 0;
  const target = Number(nutrition.targetCalories) || 0;
  const targetProtein = Number(nutrition.targetProteinGrams) || 0;
  const dayIncomplete = isNutritionDayIncomplete(nutrition);
  const kcalCert = nutrition?.certainty?.calories || CERTAINTY_LEVELS.ESTIMATED;
  const targetCert = nutrition?.certainty?.targets || CERTAINTY_LEVELS.ESTIMATED;
  const histCert = nutrition?.certainty?.history7d || CERTAINTY_LEVELS.ESTIMATED;
  const daysLogged = Number(nutrition.history7d?.daysLogged) || 0;

  if (dayIncomplete) {
    drivers.push(driver(
      DRIVER_IDS.CALORIE_ADHERENCE,
      DRIVER_DIRECTIONS.NEUTRAL,
      0.2,
      CERTAINTY_LEVELS.ESTIMATED,
    ));
    return makePillar(
      drivers,
      { text: NUTRITION_DAY_PENDING_INSIGHT, certainty: CERTAINTY_LEVELS.ESTIMATED },
      {
        type: 'nutrition.day',
        data: {
          calories: kcal,
          proteinGrams: protein,
          fiberGrams: fiber,
          targetCalories: target,
          targetProteinGrams: targetProtein,
          daysLogged,
          dayInProgress: true,
        },
      },
      true,
    );
  }

  const cal = ratioGap(kcal, target);
  if (cal) {
    if (cal.ratio >= 0.9 && cal.ratio <= 1.1) {
      drivers.push(driver(DRIVER_IDS.CALORIE_ADHERENCE, DRIVER_DIRECTIONS.POSITIVE, 0.75, kcalCert));
    } else if (cal.ratio < 0.9) {
      drivers.push(driver(DRIVER_IDS.CALORIE_ADHERENCE, DRIVER_DIRECTIONS.NEGATIVE, clamp01(cal.gap), kcalCert));
    } else {
      drivers.push(driver(DRIVER_IDS.CALORIE_ADHERENCE, DRIVER_DIRECTIONS.NEGATIVE, clamp01(cal.excess), kcalCert));
    }
  }

  const pro = ratioGap(protein, targetProtein);
  if (pro) {
    if (pro.ratio >= 0.9) {
      drivers.push(driver(DRIVER_IDS.PROTEIN_ADHERENCE, DRIVER_DIRECTIONS.POSITIVE, clamp01(Math.min(1, pro.ratio)), targetCert));
    } else {
      drivers.push(driver(DRIVER_IDS.PROTEIN_ADHERENCE, DRIVER_DIRECTIONS.NEGATIVE, clamp01(pro.gap), kcalCert));
    }
  }

  const fib = ratioGap(fiber, nutrition.targetFiberGrams);
  if (fib) {
    if (fib.ratio >= 0.85) {
      drivers.push(driver(DRIVER_IDS.FIBER_ADHERENCE, DRIVER_DIRECTIONS.POSITIVE, clamp01(fib.ratio), kcalCert));
    } else {
      drivers.push(driver(DRIVER_IDS.FIBER_ADHERENCE, DRIVER_DIRECTIONS.NEGATIVE, clamp01(fib.gap), kcalCert));
    }
  }

  if (daysLogged >= 5) {
    drivers.push(driver(DRIVER_IDS.NUTRITION_CONSISTENCY, DRIVER_DIRECTIONS.POSITIVE, clamp01(daysLogged / 7), histCert));
  } else if (daysLogged > 0) {
    drivers.push(driver(
      DRIVER_IDS.NUTRITION_CONSISTENCY,
      DRIVER_DIRECTIONS.NEGATIVE,
      clamp01(1 - daysLogged / 5),
      histCert,
    ));
  }

  const certainty = weakestCertainty(drivers, kcalCert);
  
  // Interpreta i dati per dare feedback comprensibile
  let kcalStatus = '';
  if (cal) {
    if (cal.ratio > 1.15) kcalStatus = `Hai mangiato più del previsto (${Math.round(kcal)} kcal su ${Math.round(target)} target)`;
    else if (cal.ratio < 0.85) kcalStatus = `Sei sotto le calorie necessarie (${Math.round(kcal)} su ${Math.round(target)} target)`;
    else kcalStatus = `Le calorie sono nel range giusto (${Math.round(kcal)} kcal)`;
  } else {
    kcalStatus = `Oggi hai mangiato ${Math.round(kcal)} kcal`;
  }

  let proteinStatus = '';
  if (pro) {
    if (pro.ratio >= 0.9) proteinStatus = ', le proteine sono ottime';
    else if (pro.ratio >= 0.7) proteinStatus = ', ma potresti aggiungere ancora qualche proteina';
    else proteinStatus = ', però le proteine sono troppo poche';
  }

  const insight = phraseByCertainty(certainty, {
    measured: `${kcalStatus}${proteinStatus}.`,
    calculated: 'Sei sulla buona strada, ma manca ancora qualche pasto. Continua così!',
    inferred: 'La settimana va bene, ma oggi prova a completare tutti i pasti previsti.',
    estimated: 'Registra i pasti per vedere come stai andando con la nutrizione.',
  });

  return makePillar(
    drivers,
    { text: insight, certainty },
    {
      type: 'nutrition.day',
      data: {
        calories: kcal,
        proteinGrams: protein,
        fiberGrams: fiber,
        targetCalories: target,
        targetProteinGrams: targetProtein,
        daysLogged,
        dayInProgress: false,
      },
    },
    false,
  );
}

export function evaluateActivity(activity = {}, nowMs = null) {
  const drivers = [];
  const minutes = Number(activity.cardioMinutes7d) || 0;
  const target = Number(activity.cardioTarget7d) || 0;
  const cardioCert = activity?.certainty?.cardioMinutes7d || CERTAINTY_LEVELS.ESTIMATED;
  const decayCert = activity?.certainty?.muscleDecay || CERTAINTY_LEVELS.ESTIMATED;
  const today = Array.isArray(activity.todayWorkouts) ? activity.todayWorkouts : [];
  const { districts, mean: meanDecay, min: minDecay } = meanMuscleDecay(activity);
  const dayPending = isActivityDayPending(activity, nowMs);
  const weeklyTrend = hasWeeklyActivityTrend(activity);

  const evidenceData = {
    cardioMinutes7d: minutes,
    cardioTarget7d: target,
    meanMuscleDecay: round1(meanDecay * 100) / 100,
    minMuscleDecay: round1(minDecay * 100) / 100,
    todayWorkoutCount: today.length,
    dayInProgress: dayPending,
  };

  if (dayPending) {
    drivers.push(driver(
      DRIVER_IDS.TRAINING_TODAY,
      DRIVER_DIRECTIONS.NEUTRAL,
      0.25,
      CERTAINTY_LEVELS.ESTIMATED,
    ));
    if (weeklyTrend && minutes > 0 && target > 0) {
      drivers.push(driver(
        DRIVER_IDS.CARDIO_LOAD_7D,
        DRIVER_DIRECTIONS.NEUTRAL,
        0.3,
        cardioCert,
      ));
    }
    return makePillar(
      drivers,
      { text: ACTIVITY_DAY_PENDING_INSIGHT, certainty: CERTAINTY_LEVELS.ESTIMATED },
      { type: 'activity.week', data: evidenceData },
      true,
    );
  }

  if (target > 0) {
    const ratio = minutes / target;
    if (ratio >= 0.85) {
      drivers.push(driver(DRIVER_IDS.CARDIO_LOAD_7D, DRIVER_DIRECTIONS.POSITIVE, clamp01(Math.min(1, ratio)), cardioCert));
    } else {
      drivers.push(driver(DRIVER_IDS.CARDIO_LOAD_7D, DRIVER_DIRECTIONS.NEGATIVE, clamp01(1 - ratio), cardioCert));
    }
  }

  if (districts.length > 0) {
    if (meanDecay >= 0.45) {
      drivers.push(driver(DRIVER_IDS.MUSCLE_STIMULUS, DRIVER_DIRECTIONS.POSITIVE, clamp01(meanDecay), decayCert));
    } else {
      drivers.push(driver(
        DRIVER_IDS.MUSCLE_STIMULUS,
        DRIVER_DIRECTIONS.NEGATIVE,
        clamp01(1 - meanDecay),
        decayCert,
      ));
    }
  }

  if (today.length > 0) {
    drivers.push(driver(DRIVER_IDS.TRAINING_TODAY, DRIVER_DIRECTIONS.POSITIVE, 0.55, CERTAINTY_LEVELS.MEASURED));
  } else {
    drivers.push(driver(DRIVER_IDS.TRAINING_TODAY, DRIVER_DIRECTIONS.NEUTRAL, 0.3, CERTAINTY_LEVELS.MEASURED));
  }

  const insufficient = !weeklyTrend;

  const certainty = weakestCertainty(drivers, cardioCert);
  const insight = today.length === 0
    ? ACTIVITY_DAY_PENDING_INSIGHT
    : phraseByCertainty(certainty, {
      measured: target > 0 && minutes >= target * 0.85
        ? `Ottimo! Hai fatto ${Math.round(minutes)} minuti di cardio questa settimana (target: ${Math.round(target)} min).`
        : target > 0
          ? `Hai fatto ${Math.round(minutes)} minuti di cardio su ${Math.round(target)} previsti. Un po' di movimento in più farebbe bene!`
          : `Questa settimana hai fatto ${Math.round(minutes)} minuti di cardio. Continua così!`,
      calculated: 'Sei sulla buona strada. Un po\' di movimento nei prossimi giorni aiuta a chiudere il target.',
      inferred: 'Alcuni muscoli aspettano ancora stimolo. Il carico settimanale resta la bussola.',
      estimated: 'Registra i tuoi allenamenti per vedere come stai andando con l\'attività fisica.',
    });

  const pillar = makePillar(
    drivers,
    { text: insight, certainty: today.length === 0 ? CERTAINTY_LEVELS.ESTIMATED : certainty },
    { type: 'activity.week', data: evidenceData },
    insufficient,
  );

  const trainingDeficit = drivers.some((d) => (
    (d.id === DRIVER_IDS.CARDIO_LOAD_7D || d.id === DRIVER_IDS.MUSCLE_STIMULUS)
    && d.direction === DRIVER_DIRECTIONS.NEGATIVE
  ));
  if (!insufficient && trainingDeficit && pillar.state === PILLAR_STATES.OVERLOAD) {
    pillar.state = PILLAR_STATES.FLEXION;
  }
  return pillar;
}

export function evaluateMetabolism(metabolic = {}, sleep = {}) {
  const drivers = [];
  const penalty = Number(metabolic.glycemicPenalty);
  const penaltyCert = metabolic?.certainty?.glycemicPenalty || CERTAINTY_LEVELS.ESTIMATED;
  const phaseCert = metabolic?.certainty?.currentPhase || CERTAINTY_LEVELS.ESTIMATED;
  const phase = String(metabolic.currentPhase || '');
  const fasting = Number(metabolic.fastingHoursCurrent);
  const buffer = sleep?.dinnerSleepBuffer;

  if (Number.isFinite(penalty)) {
    if (penalty > 1.12) {
      drivers.push(driver(
        DRIVER_IDS.GLYCEMIC_PENALTY,
        DRIVER_DIRECTIONS.NEGATIVE,
        clamp01((penalty - 1) / 0.3),
        penaltyCert,
      ));
    } else if (penalty > 1.03) {
      drivers.push(driver(
        DRIVER_IDS.GLYCEMIC_PENALTY,
        DRIVER_DIRECTIONS.NEGATIVE,
        clamp01((penalty - 1) / 0.3),
        penaltyCert,
      ));
    } else {
      drivers.push(driver(DRIVER_IDS.GLYCEMIC_PENALTY, DRIVER_DIRECTIONS.POSITIVE, 0.6, penaltyCert));
    }
  }

  if (phase === METABOLIC_PHASE_IDS.DIGESTION && Number.isFinite(fasting) && fasting < 1) {
    drivers.push(driver(DRIVER_IDS.METABOLIC_PHASE, DRIVER_DIRECTIONS.NEUTRAL, 0.4, phaseCert));
  } else if (phase === METABOLIC_PHASE_IDS.FASTING && Number.isFinite(fasting) && fasting >= 12) {
    drivers.push(driver(DRIVER_IDS.METABOLIC_PHASE, DRIVER_DIRECTIONS.POSITIVE, clamp01((fasting - 8) / 10), phaseCert));
  } else if (phase) {
    drivers.push(driver(DRIVER_IDS.METABOLIC_PHASE, DRIVER_DIRECTIONS.NEUTRAL, 0.35, phaseCert));
  }

  if (buffer != null && Number.isFinite(Number(buffer)) && Number(buffer) < 3) {
    drivers.push(driver(
      DRIVER_IDS.DINNER_SLEEP_BUFFER,
      DRIVER_DIRECTIONS.NEGATIVE,
      clamp01((3 - Number(buffer)) / 3 + 0.2),
      sleep?.certainty?.dinnerSleepBuffer || CERTAINTY_LEVELS.CALCULATED,
    ));
  }

  const insufficient = !Number.isFinite(penalty) && !phase;
  const certainty = weakestCertainty(drivers, penaltyCert);
  
  // Linguaggio umano per metabolismo
  let metabolicText = '';
  if (phase === METABOLIC_PHASE_IDS.DIGESTION) {
    metabolicText = 'Il corpo sta ancora smaltendo gli ultimi pasti. Meglio aspettare un po\' prima di mangiare ancora.';
  } else if (phase === METABOLIC_PHASE_IDS.FASTING && fasting >= 12) {
    metabolicText = `Ottimo livello di digiuno (${Math.round(fasting)} ore): il metabolismo sta riposando bene.`;
  } else if (phase === METABOLIC_PHASE_IDS.FASTING) {
    metabolicText = `Digiuno in corso (${Math.round(fasting)} ore): il corpo sta iniziando a bruciare le riserve.`;
  } else if (phase === METABOLIC_PHASE_IDS.ABSORPTION) {
    metabolicText = 'Il corpo sta assorbendo i nutrienti dall\'ultimo pasto.';
  } else {
    metabolicText = 'In attesa di più dati per capire come sta andando il metabolismo.';
  }

  const insight = phraseByCertainty(certainty, {
    measured: metabolicText,
    calculated: 'Il metabolismo sta lavorando, ma dipende anche da quando e cosa hai mangiato.',
    inferred: 'Alcuni segnali suggeriscono di prestare attenzione al timing dei pasti.',
    estimated: 'Registra i pasti per capire come sta lavorando il tuo metabolismo.',
  });

  return makePillar(
    drivers,
    { text: insight, certainty },
    {
      type: 'metabolic.kinetics',
      data: {
        currentPhase: phase || null,
        glycemicPenalty: Number.isFinite(penalty) ? penalty : null,
        fastingHoursCurrent: Number.isFinite(fasting) ? fasting : null,
        dinnerSleepBuffer: buffer ?? null,
      },
    },
    insufficient,
  );
}
