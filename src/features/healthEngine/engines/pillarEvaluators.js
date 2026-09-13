/**
 * Valutatori di pilastro — puri, deterministici, nessun side-effect.
 */

import { CERTAINTY_LEVELS, METABOLIC_PHASE_IDS } from '../contracts/healthSnapshot.types.js';
import {
  DRIVER_DIRECTIONS,
  DRIVER_IDS,
  PILLAR_STATES,
} from '../contracts/healthSystem.types.js';
import { phraseByCertainty, weakestCertainty } from './epistemicLanguage.js';

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
  const score = insufficient ? 50 : scoreFromDrivers(drivers);
  return {
    state: stateFromScore(score, insufficient),
    score,
    drivers,
    insight,
    evidence,
  };
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
  const insight = phraseByCertainty(certainty, {
    measured: hasSleep
      ? `Il recupero della notte è ${Number(sleep.hours).toFixed(1)} h con qualità ${sleep.quality}/5.`
      : 'Manca il sonno di stanotte: il recupero non è misurabile.',
    calculated: hasSleep
      ? 'Il recupero potrebbe essere influenzato dal timing cena–sonno e dalle ore registrate.'
      : 'Senza un log sonno il recupero resta una stima debole.',
    inferred: hasSleep
      ? 'I segnali di recupero suggeriscono attenzione al riposo, ma l’evidenza è indiretta.'
      : 'I segnali indicano che il sonno non è stato registrato.',
    estimated: 'Con i dati attuali il recupero non è confermabile; serve almeno il log della notte.',
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
  const logged = kcal > 0 || protein > 0 || fiber > 0;
  const kcalCert = nutrition?.certainty?.calories || CERTAINTY_LEVELS.ESTIMATED;
  const targetCert = nutrition?.certainty?.targets || CERTAINTY_LEVELS.ESTIMATED;
  const histCert = nutrition?.certainty?.history7d || CERTAINTY_LEVELS.ESTIMATED;

  const cal = ratioGap(kcal, nutrition.targetCalories);
  if (cal) {
    if (cal.ratio >= 0.9 && cal.ratio <= 1.1) {
      drivers.push(driver(DRIVER_IDS.CALORIE_ADHERENCE, DRIVER_DIRECTIONS.POSITIVE, 0.75, kcalCert));
    } else if (cal.ratio < 0.9) {
      drivers.push(driver(DRIVER_IDS.CALORIE_ADHERENCE, DRIVER_DIRECTIONS.NEGATIVE, clamp01(cal.gap), kcalCert));
    } else {
      drivers.push(driver(DRIVER_IDS.CALORIE_ADHERENCE, DRIVER_DIRECTIONS.NEGATIVE, clamp01(cal.excess), kcalCert));
    }
  }

  const pro = ratioGap(protein, nutrition.targetProteinGrams);
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

  const daysLogged = Number(nutrition.history7d?.daysLogged) || 0;
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
  const insight = phraseByCertainty(certainty, {
    measured: logged
      ? `Oggi ${Math.round(kcal)} kcal e ${Math.round(protein)} g di proteine rispetto al target.`
      : 'Non risultano pasti misurati oggi.',
    calculated: 'La copertura calorica e proteica potrebbe restare sotto il target odierno.',
    inferred: 'I pattern della settimana suggeriscono una copertura nutrizionale incompleta.',
    estimated: 'Senza un diario pasti più completo la nutrizione resta una stima.',
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
        targetCalories: Number(nutrition.targetCalories) || 0,
        targetProteinGrams: Number(nutrition.targetProteinGrams) || 0,
        daysLogged,
      },
    },
    !logged,
  );
}

export function evaluateActivity(activity = {}) {
  const drivers = [];
  const minutes = Number(activity.cardioMinutes7d) || 0;
  const target = Number(activity.cardioTarget7d) || 0;
  const cardioCert = activity?.certainty?.cardioMinutes7d || CERTAINTY_LEVELS.ESTIMATED;
  const decayCert = activity?.certainty?.muscleDecay || CERTAINTY_LEVELS.ESTIMATED;
  const today = Array.isArray(activity.todayWorkouts) ? activity.todayWorkouts : [];
  const decay = activity.muscleDecay && typeof activity.muscleDecay === 'object'
    ? activity.muscleDecay
    : {};
  const districts = Object.values(decay).map((n) => Number(n)).filter((n) => Number.isFinite(n));
  const meanDecay = districts.length > 0
    ? districts.reduce((a, b) => a + b, 0) / districts.length
    : 0;
  const minDecay = districts.length > 0 ? Math.min(...districts) : 0;

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

  const insufficient = minutes <= 0 && today.length === 0 && meanDecay <= 0
    && (activity?.certainty?.muscleDecay === CERTAINTY_LEVELS.ESTIMATED);

  const certainty = weakestCertainty(drivers, cardioCert);
  const insight = phraseByCertainty(certainty, {
    measured: `Cardio 7g: ${Math.round(minutes)}/${Math.round(target)} min; stimolo muscolare medio ${Math.round(meanDecay * 100)}%.`,
    calculated: 'Il carico della settimana potrebbe restare sotto la soglia cardio e di stimolo.',
    inferred: 'I distretti poco stimolati suggeriscono un vuoto di allenamento, con evidenza indiretta.',
    estimated: 'Senza storico attività sufficiente il carico resta una stima.',
  });

  const pillar = makePillar(
    drivers,
    { text: insight, certainty },
    {
      type: 'activity.week',
      data: {
        cardioMinutes7d: minutes,
        cardioTarget7d: target,
        meanMuscleDecay: round1(meanDecay * 100) / 100,
        minMuscleDecay: round1(minDecay * 100) / 100,
        todayWorkoutCount: today.length,
      },
    },
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
  const insight = phraseByCertainty(certainty, {
    measured: `Fase ${phase || 'n/d'}; penalità glicemica ×${Number.isFinite(penalty) ? penalty.toFixed(2) : '1.00'}.`,
    calculated: 'La cinetica glicemica potrebbe essere leggermente alzata rispetto al baseline.',
    inferred: 'La fase metabolica è inferita dalle ore dal pasto: va letta con cautela.',
    estimated: 'Senza cinetiche affidabili lo stato metabolico resta una stima neutra.',
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
