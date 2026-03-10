import React from 'react';

const RADIAN = Math.PI / 180;

const getTodayString = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};
const getYesterdayString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

function getSleepStatus(dailyLog) {
  const hour = new Date().getHours();
  const sleepEntry = (dailyLog || []).find(e =>
    e.hours ||
    e.duration ||
    e.sleepHours ||
    e.deep ||
    e.deepMin ||
    e.rem ||
    e.remMin ||
    e.sleepStart ||
    e.sleepEnd
  );
  if (sleepEntry) return "OK";
  if (hour < 3) return "NIGHT_PENDING";
  return "SLEEP_MISSING";
}

/** Returns YYYY-MM-DD of Monday of the week containing dateStr. Week starts Monday. */
function getMondayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Add n days to dateStr (YYYY-MM-DD), return YYYY-MM-DD. */
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ============================================================================
// UTILITY CRITICHE PER RETROCOMPATIBILITÀ MEALTYPE
// ============================================================================

/** 
 * Gruppi di equivalenza per mealType. Tutti gli ID nello stesso array sono considerati lo stesso pasto.
 * Questo risolve il problema dei dati storici con 'spuntino' vs nuovi 'snack'.
 */
const MEAL_TYPE_GROUPS = {
  colazione: ['merenda1', 'colazione'],
  pranzo: ['pranzo'],
  spuntino: ['merenda2', 'spuntino', 'snack'], // merenda2 = spuntino pomeridiano, snack = generico
  cena: ['cena']
};

/** 
 * Mappa inversa: da qualsiasi ID al gruppo canonico.
 * 'merenda1' → 'colazione', 'spuntino' → 'spuntino', 'snack' → 'spuntino'
 */
const MEAL_TYPE_TO_CANONICAL = {};
Object.entries(MEAL_TYPE_GROUPS).forEach(([canonical, aliases]) => {
  aliases.forEach(alias => {
    MEAL_TYPE_TO_CANONICAL[alias] = canonical;
  });
});

/** 
 * Verifica se due mealType appartengono allo stesso gruppo (sono equivalenti)
 */
function areMealTypesEquivalent(typeA, typeB) {
  if (!typeA || !typeB) return false;
  if (typeA === typeB) return true;
  const canonicalA = MEAL_TYPE_TO_CANONICAL[typeA] || typeA;
  const canonicalB = MEAL_TYPE_TO_CANONICAL[typeB] || typeB;
  return canonicalA === canonicalB;
}

/** 
 * Converte qualsiasi mealType al suo ID canonico per salvataggio nuovi dati
 */
function toCanonicalMealType(type) {
  const str = String(type || '');
  const base = str.includes('_') ? str.split('_')[0] : str;
  return MEAL_TYPE_TO_CANONICAL[base] || base;
}

/** 
 * Ottiene tutti gli ID equivalenti per un dato mealType (per filtri OR).
 * Accetta anche id composito "mealType_time" (es. snack_16.5) e usa solo la parte mealType.
 */
function getEquivalentMealTypes(type) {
  const str = String(type ?? '');
  const base = str.includes('_') ? str.slice(0, str.indexOf('_')) : type;
  const canonical = toCanonicalMealType(base);
  return MEAL_TYPE_GROUPS[canonical] || [base];
}

/** 🍝 per Pranzo/Cena, 🍎 per gli altri. */
function getMealIcon(label) {
  const l = (label || '').toString().toLowerCase();
  if (l.includes('pranzo') || l.includes('cena')) return '🍝';
  // Tutti gli snack/merende usano 🍎
  if (l.includes('snack') || l.includes('spuntino') || l.includes('merenda') || l.includes('colazione')) return '🍎';
  return '🍎';
}

function getGhostMealType(baseType, log) {
  const base = String(baseType || '').split('_')[0];
  const canonical = toCanonicalMealType(base);
  const existingFoods = (log || []).filter(i => i.type === 'food');
  let maxSuffix = 0;
  let baseExists = false;
  existingFoods.forEach(f => {
    const mType = f.mealType || '';
    const mBase = mType.split('_')[0];
    if (toCanonicalMealType(mBase) === canonical) {
      baseExists = true;
      if (mType.includes('_')) {
        const num = parseInt(mType.split('_')[1], 10);
        if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
      } else {
        if (maxSuffix === 0) maxSuffix = 1;
      }
    }
  });
  if (!baseExists) return base;
  return `${base}_${maxSuffix + 1}`;
}

function getSlotKey(item) {
  if (item.type !== 'food') return null;
  return item.mealType;
}

/** Decimale (es. 12.5) -> "HH:mm" per display. */
function decimalToTimeStr(dec) {
  if (typeof dec !== 'number' || Number.isNaN(dec)) return '12:00';
  const h = Math.max(0, Math.min(23, Math.floor(dec)));
  const m = Math.round((dec - h) * 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Baseline energetica giornaliera in base a sonno e recupero neurologico.
 * Giornate con buon sonno partono con energia più alta (70–85), con sonno scarso più bassa (45–60).
 */
function computeBaselineEnergy(dailyLog) {
  const log = dailyLog || [];
  let sleepEntry = log.find(e => e.type === 'sleep');
  let sleepScore = 0;
  let neuroScore = 0;

  if (sleepEntry) {
    const hours = sleepEntry.hours || 7;
    const deep = sleepEntry.deepMin || 60;
    const rem = sleepEntry.remMin || 60;

    sleepScore = (hours / 8) * 20;
    neuroScore = ((deep + rem) / 180) * 20;
  }

  let baseline = 50 + sleepScore + neuroScore;
  baseline = Math.max(40, Math.min(90, baseline));
  return baseline;
}

/**
 * Carico digestivo per singolo alimento/pasto (0–3): contribuisce a affaticamento post-prandiale.
 */
function computeDigestiveLoad(entry) {
  const kcal = Number(entry.kcal || entry.cal || 0) || 0;
  const fat = Number(entry.fatTotal || entry.fat || 0) || 0;
  const fibre = Number(entry.fibre || 0) || 0;

  let load = (kcal / 600) + (fat / 30) + (fibre / 10);
  return Math.max(0, Math.min(3, load));
}

/**
 * Curva di risposta fisiologica: effetto che sale, picco, poi decade (inerzia).
 * t = tempo dall'evento, peakTime = ora del picco, duration = durata totale.
 */
function responseCurve(t, peakTime, duration) {
  if (t < 0 || t > duration) return 0;
  const peak = 1 - Math.abs((t - peakTime) / peakTime);
  return Math.max(0, peak);
}

/** Centralized physiological simulation coefficients for tuning and maintenance. */
const PHYSIOLOGY_CONFIG = {
  energyDecayPerHour: 2,
  nervousSystemImpact: 0.15,
  digestionEnergyImpact: 8,
  hydrationDecayPerHour: 2.0,
  workoutLoadImpact: 5,
  workLoadImpact: 0.5,
  stimulantLoadImpact: 2,
  napSncBoost: 18,
  napCortisolReduction: 12,
  meditationCortisolReduction: 20,
  meditationNeuroStabilization: 6,
  sunlightNeuroBoost: 8,
  sunlightCortisolNormalize: 0.5,
  supplementsRelaxCortisolReduction: 5
};

/**
 * Dati reali + ideali per il cruscotto energetico 0-24h: 25 punti (ore 0..24).
 * timelineNodes: array di { id, type: 'meal'|'work'|'workout', time, duration?, kcal?, icon }.
 * idealStrategy: { colazione, pranzo, spuntino, cena, allenamento } kcal obiettivo.
 * Restituisce { chartData, realTotals } per grafico doppia curva e semafori.
 */
function generateRealEnergyData(timelineNodes, dailyLog, idealStrategy, waterIntake = 0, dailyWaterGoal = 2500, initialEnergy = null, initialIdealEnergy = null, userModel = null, nervousSystemLoad = 30) {
  const log = dailyLog || [];
  const ideal = idealStrategy || {};
  const model = {
    caffeineSensitivity: clampModelValue(userModel?.caffeineSensitivity ?? 1),
    carbCrashSensitivity: clampModelValue(userModel?.carbCrashSensitivity ?? 1),
    stressSensitivity: clampModelValue(userModel?.stressSensitivity ?? 1),
    hydrationSensitivity: clampModelValue(userModel?.hydrationSensitivity ?? 1),
    recoveryRate: clampModelValue(userModel?.recoveryRate ?? 1)
  };

  let load = Math.max(0, Math.min(100, Number(nervousSystemLoad) ?? 30));
  log.forEach(entry => {
    if (entry.type === 'sleep') {
      load -= (entry.hours ?? 0) * 4;
    }
  });
  load = Math.max(0, Math.min(100, load));

  let baselineEnergy = initialEnergy != null ? initialEnergy : computeBaselineEnergy(log);
  baselineEnergy -= load * PHYSIOLOGY_CONFIG.nervousSystemImpact;
  baselineEnergy = Math.max(40, Math.min(90, baselineEnergy));
  console.log('Baseline energy:', baselineEnergy);

  const sleepNode = log.find(e => e.type === 'sleep');
  const wakeTime = sleepNode?.wakeTime ?? 7.5;
  const nightStartEnergy = 25; // Energia residua della sera prima

  // Mappa da canonical strategy key a array di mealType equivalenti
  const strategyToMealTypes = {
    colazione: ['merenda1', 'colazione'],
    pranzo: ['pranzo'],
    spuntino: ['merenda2', 'spuntino', 'snack'],
    cena: ['cena']
  };

  let workoutKcal = 0;
  const realTotals = { colazione: 0, pranzo: 0, spuntino: 0, cena: 0, allenamento: 0 };
  
  log.forEach(entry => {
    const kcal = Number(entry.kcal ?? entry.cal ?? 0) || 0;
    if (entry.type === 'workout') {
      workoutKcal += kcal;
      return;
    }
    // Trova a quale strategia appartiene questo mealType
    const entryMealType = entry.mealType || 'cena';
    for (const [strategyKey, mealTypes] of Object.entries(strategyToMealTypes)) {
      if (mealTypes.includes(entryMealType)) {
        realTotals[strategyKey] = (realTotals[strategyKey] || 0) + kcal;
        break;
      }
    }
  });
  realTotals.allenamento = workoutKcal;

  let metabolicEnergy = wakeTime > 0 ? nightStartEnergy : baselineEnergy;
  let neuralEnergy = wakeTime > 0 ? nightStartEnergy : baselineEnergy;
  let currentEnergy = metabolicEnergy;
  let currentIdealEnergy = initialIdealEnergy != null ? (initialIdealEnergy ?? initialEnergy) : 70;
  let globalCrashRisk = false;

  let currentHydration = 100;

  let globalCortisolRisk = false;
  let currentCortisol = 25;

  const mealTimes = log.filter(e => e.type === 'food').map(e => typeof e.mealTime === 'number' && !Number.isNaN(e.mealTime) ? e.mealTime : 12);
  let hasDigestionRisk = false;
  for (let i = 0; i < mealTimes.length; i++) {
    for (let j = i + 1; j < mealTimes.length; j++) {
      const a = mealTimes[i], b = mealTimes[j];
      if (a < b + 3 && b < a + 3) { hasDigestionRisk = true; break; }
    }
    if (hasDigestionRisk) break;
  }

  let maxNeuro = 70;
  if (sleepNode) {
    const hScore = Math.min(40, ((sleepNode.hours || 7) / 8) * 40);
    const deepScore = Math.min(30, ((sleepNode.deepMin || 60) / 90) * 30);
    const remScore = Math.min(30, ((sleepNode.remMin || 60) / 90) * 30);
    maxNeuro = hScore + deepScore + remScore;
  }
  let currentNeuro = 0;

  const out = [];

  function carbAbsorption(t, carbs, fibre = 0, fat = 0) {
    if (t < 0 || t > 4) return 0;

    const peakTime = 1 + (fat * 0.015) + (fibre * 0.02);
    const width = 0.8 + fibre * 0.015;

    const fatReduction = Math.max(0.6, 1 - fat * 0.01);
    const amplitude = carbs * fatReduction;

    const peak = Math.exp(-Math.pow((t - peakTime) / width, 2));
    return peak * amplitude;
  }

  function circadianEnergyModifier(h) {
    const morningPeak = Math.exp(-Math.pow((h - 9) / 3, 2)) * 6;
    const afternoonDip = Math.exp(-Math.pow((h - 14) / 2, 2)) * -5;
    const eveningDip = Math.exp(-Math.pow((h - 22) / 3, 2)) * -4;
    return morningPeak + afternoonDip + eveningDip;
  }

  let glycemicMemory = 0;
  let neuralFatigue = 0;
  let hoursSinceMeal = 0;
  let previousEnergy = baselineEnergy;

  for (let h = 0; h <= 24; h++) {
    glycemicMemory *= 0.92;
    neuralFatigue *= 0.96;
    let currentDigestione = 0;
    let hadMealThisHour = false;
    const useContinuityAtZero = h === 0 && initialEnergy != null;
    if (h < wakeTime) {
      // Fase di SONNO: Ricarica progressiva delle batterie
      const rechargeRate = (baselineEnergy - nightStartEnergy) / Math.max(1, wakeTime);
      metabolicEnergy += rechargeRate;
      neuralEnergy += rechargeRate;
      currentIdealEnergy += rechargeRate;
    } else if (!useContinuityAtZero) {
      // Fase di VEGLIA: Decadimento fisiologico normale
      metabolicEnergy -= PHYSIOLOGY_CONFIG.energyDecayPerHour;
      neuralEnergy -= PHYSIOLOGY_CONFIG.energyDecayPerHour;
      currentIdealEnergy -= PHYSIOLOGY_CONFIG.energyDecayPerHour;
    }

    const circadianMod = circadianEnergyModifier(h);
    metabolicEnergy += circadianMod;
    neuralEnergy += circadianMod;

    (timelineNodes || []).forEach(node => {
      if (node.type === 'meal') {
        if (node.time >= h && node.time < h + 1) hadMealThisHour = true;
        const timeSince = h - node.time;
        if (timeSince >= 0 && timeSince <= 3) {
          const mealEffect = responseCurve(timeSince, 1, 3);
          const realK = node.kcal || node.cal || 500;
          const idealK = Number(ideal[node.strategyKey]) || (node.strategyKey === 'spuntino' ? 250 : 500);
          metabolicEnergy += mealEffect * (realK / 20);
          currentIdealEnergy += mealEffect * (idealK / 20);
        }
      }
      if (node.type === 'work' || node.type === 'workout') {
        const dur = Math.max(0.5, node.duration || 1);
        const timeSince = h - node.time;
        const fatigueWindow = dur + 2;
        if (timeSince >= 0 && timeSince <= fatigueWindow) {
          const fatigueEffect = responseCurve(timeSince, 0.5, fatigueWindow);
          const burnKcal = node.kcal || 300;
          const drain = (burnKcal / dur) / 10;
          neuralEnergy -= fatigueEffect * drain;
          currentIdealEnergy -= fatigueEffect * drain;
        }
        if (node.time >= h && node.time < h + 1) {
          if (node.type === 'workout') { load += PHYSIOLOGY_CONFIG.workoutLoadImpact; neuralFatigue += 3; }
          else if (node.type === 'work') { load += (node.duration ?? 1) * PHYSIOLOGY_CONFIG.workLoadImpact; neuralFatigue += 2; }
        }
      }
      if (node.type === 'stimulant') {
        if (node.time >= h && node.time < h + 1) { load += PHYSIOLOGY_CONFIG.stimulantLoadImpact; neuralFatigue += 1; }
        const timeSince = h - node.time;
        const effect = responseCurve(timeSince, 1.5, 4);
        if (effect > 0) {
          const sub = (node.subtype || 'caffè').toLowerCase();
          const stimulantBoost = sub === 'energy drink' ? 12 : sub === 'caffè' ? 8 : 5;
          neuralEnergy += effect * stimulantBoost;
        }
      }
      if (node.type === 'nap') {
        const timeSince = h - node.time;
        const duration = node.duration ?? 0.25;
        const effectWindow = duration + 1.5;
        if (timeSince >= 0 && timeSince <= effectWindow) {
          const effect = responseCurve(timeSince, 0.3, effectWindow);
          neuralEnergy += effect * PHYSIOLOGY_CONFIG.napSncBoost;
        }
      }
    });
    load = Math.max(0, Math.min(100, load));

    let gl = 85;
    (timelineNodes || []).forEach(node => {
      if (node.type === 'meal') {
        const diff = h - node.time;
        if (diff >= 0 && diff <= 3) {
          const digestionFactor = 1 - diff / 3;
          const mealKcal = node.kcal ?? node.cal ?? 500;
          const mealLoad = Math.max(0, Math.min(3, mealKcal / 600));
          const digestionPenalty =
            mealLoad *
            PHYSIOLOGY_CONFIG.digestionEnergyImpact *
            Math.sqrt(digestionFactor);
          metabolicEnergy -= digestionPenalty;
          const digestionSignal =
            100 * (1 - diff / 3) +
            mealLoad * 30 * (1 - diff / 3);
          currentDigestione = Math.max(currentDigestione, digestionSignal);
        }
      }
    });
    log.forEach(entry => {
      if (entry.type === 'food') {
        const ft = typeof entry.mealTime === 'number' && !Number.isNaN(entry.mealTime) ? entry.mealTime : 12;
        if (ft >= h && ft < h + 1) hadMealThisHour = true;
        const diff = h - ft;
        if (diff >= 0 && diff <= 3) {
          const carb = Number(entry.carb) || 0;
          const fibre = Number(entry.fibre) || 0;
          const fat = Number(entry.fatTotal || entry.fat) || 0;
          gl += carbAbsorption(diff, carb, fibre, fat);
          glycemicMemory += carb * 0.4;
          glycemicMemory *= 0.92;
          if (carb > 40 && fibre < 4 && fat < 10 && diff >= 1.5 && diff < 2.5) {
            gl -= 15 * model.carbCrashSensitivity;
            globalCrashRisk = true;
          }
        }
      }
    });
    currentDigestione = Math.max(0, Math.min(100, currentDigestione));

    if (hadMealThisHour) hoursSinceMeal = 0; else hoursSinceMeal++;
    if (hoursSinceMeal > 6) {
      const fatBurnSupport = Math.min(4, (hoursSinceMeal - 6) * 0.8);
      metabolicEnergy += fatBurnSupport;
    }

    (timelineNodes || []).forEach(node => {
      if ((node.type === 'work' || node.type === 'workout') && h >= node.time && h <= node.time + (node.duration || 1)) {
        gl -= 15 * model.carbCrashSensitivity;
      }
    });

    metabolicEnergy -= glycemicMemory * 0.05;
    glycemicMemory = Math.max(0, Math.min(100, glycemicMemory));

    neuralEnergy -= neuralFatigue * 0.08;
    neuralFatigue = Math.max(0, Math.min(100, neuralFatigue));

    let combinedEnergy =
      neuralEnergy * 0.6 +
      metabolicEnergy * 0.4;
    currentEnergy = Math.min(combinedEnergy, neuralEnergy);

    currentHydration -= PHYSIOLOGY_CONFIG.hydrationDecayPerHour;
    (timelineNodes || []).forEach(node => {
      if (node.type === 'water' && node.time >= h && node.time < h + 1) {
        const ml = node.ml ?? node.amount ?? 250;
        currentHydration += (ml / (dailyWaterGoal || 2500)) * 45;
      }
      if ((node.type === 'work' || node.type === 'workout') && h >= node.time && h <= node.time + (node.duration || 1)) {
        currentHydration -= 8.0;
      }
      if (node.type === 'stimulant' && node.time >= h && node.time < h + 1) {
        const sub = (node.subtype || 'caffè').toLowerCase();
        const malus = sub === 'energy drink' ? 15 : sub === 'caffè' ? 10 : 5;
        currentHydration -= malus;
      }
    });
    currentHydration = Math.max(0, Math.min(100, currentHydration));

    currentEnergy = Math.max(0, Math.min(100, currentEnergy));
    currentIdealEnergy = Math.max(0, Math.min(100, currentIdealEnergy));

    currentEnergy = currentEnergy * 0.7 + previousEnergy * 0.3;
    previousEnergy = currentEnergy;

    let cortisolBase = 20;
    if (h >= 6 && h <= 9) cortisolBase = 35 + (9 - h) * 5;
    else if (h > 9) cortisolBase = Math.max(18, 55 - (h - 9) * 2.5);
    currentCortisol += (cortisolBase - currentCortisol) * 0.3;
    if (currentEnergy < 35) { currentCortisol += 18; globalCortisolRisk = true; }
    if (currentHydration < 45) { currentCortisol += 15 * model.hydrationSensitivity; globalCortisolRisk = true; }
    (timelineNodes || []).forEach(node => {
      if ((node.type === 'work' || node.type === 'workout') && h >= node.time && h <= node.time + (node.duration || 1)) {
        currentCortisol += 12 * model.stressSensitivity;
        globalCortisolRisk = true;
      }
    });
    (timelineNodes || []).forEach(node => {
      if (node.type === 'stimulant') {
        const timeSince = h - node.time;
        const effect = responseCurve(timeSince, 1.5, 4);
        if (effect > 0) {
          const sub = (node.subtype || 'caffè').toLowerCase();
          const stimulantCortisolImpact = sub === 'energy drink' ? 25 : sub === 'caffè' ? 15 : 10;
          currentCortisol += effect * stimulantCortisolImpact * model.caffeineSensitivity;
        }
      }
    });
    (timelineNodes || []).forEach(node => {
      if (node.type === 'nap') {
        const timeSince = h - node.time;
        const duration = node.duration ?? 0.25;
        const effectWindow = duration + 1.5;
        if (timeSince >= 0 && timeSince <= effectWindow) {
          const effect = responseCurve(timeSince, 0.3, effectWindow);
          neuralEnergy += effect * PHYSIOLOGY_CONFIG.napSncBoost;
          currentCortisol -= effect * PHYSIOLOGY_CONFIG.napCortisolReduction;
        }
      }
      if (node.type === 'meditation') {
        if (node.time >= h && node.time < h + 1) {
          currentCortisol -= PHYSIOLOGY_CONFIG.meditationCortisolReduction;
          currentNeuro = Math.min(100, currentNeuro + PHYSIOLOGY_CONFIG.meditationNeuroStabilization);
        }
      }
      if (node.type === 'supplements') {
        if (node.time >= h && node.time < h + 1) {
          const sub = (node.subtype || node.name || '').toLowerCase();
          if (sub.includes('magnesio') || sub.includes('relax') || sub.includes('gaba')) {
            currentCortisol -= PHYSIOLOGY_CONFIG.supplementsRelaxCortisolReduction;
          }
        }
      }
      if (node.type === 'sunlight') {
        if (node.time >= h && node.time < h + 1) {
          currentNeuro = Math.min(100, currentNeuro + PHYSIOLOGY_CONFIG.sunlightNeuroBoost);
          currentCortisol = currentCortisol * (1 - PHYSIOLOGY_CONFIG.sunlightCortisolNormalize) + 20 * PHYSIOLOGY_CONFIG.sunlightCortisolNormalize;
        }
      }
    });
    if (globalCrashRisk && h >= 14 && h <= 20) currentCortisol += 10;
    currentCortisol = Math.max(0, Math.min(100, currentCortisol));

    if (h <= wakeTime) {
      currentNeuro = Math.max(0, maxNeuro - (wakeTime - h) * 8);
    } else {
      currentNeuro -= 1.2;
    }
    (timelineNodes || []).forEach(node => {
      if ((node.type === 'work' || node.type === 'workout') && h >= node.time && h <= node.time + (node.duration || 1)) {
        const drain = node.type === 'workout' ? 12 : 6;
        currentNeuro -= (drain / Math.max(0.5, (node.duration || 1)));
      }
      if (node.type === 'stimulant' && node.time >= h && node.time < h + 1) {
        const sub = (node.subtype || 'caffè').toLowerCase();
        const boost = sub === 'energy drink' ? 15 : sub === 'caffè' ? 10 : 5;
        currentNeuro = Math.min(100, currentNeuro + boost * model.recoveryRate);
      }
    });
    currentNeuro = Math.max(0, Math.min(100, currentNeuro));

    gl += (85 - gl) * 0.25;
    currentCortisol += (20 - currentCortisol) * 0.10;
    currentHydration += (80 - currentHydration) * 0.05;

    // Mild homeostatic stabilization toward the user's daily baseline energy
    // baselineEnergy is derived from sleep and neurological recovery
    metabolicEnergy += (baselineEnergy - metabolicEnergy) * 0.05;
    neuralEnergy += (baselineEnergy - neuralEnergy) * 0.05;
    metabolicEnergy = Math.max(15, metabolicEnergy);
    neuralEnergy = Math.max(15, neuralEnergy);

    out.push({
      time: h,
      energy: useContinuityAtZero ? initialEnergy : currentEnergy,
      idealEnergy: useContinuityAtZero ? (initialIdealEnergy ?? initialEnergy) : currentIdealEnergy,
      glicemia: Math.max(55, Math.min(250, gl)),
      idratazione: currentHydration,
      cortisolo: currentCortisol,
      digestione: Math.max(0, Math.min(100, currentDigestione)),
      neuro: currentNeuro
    });
    if (useContinuityAtZero) {
      metabolicEnergy -= PHYSIOLOGY_CONFIG.energyDecayPerHour;
      neuralEnergy -= PHYSIOLOGY_CONFIG.energyDecayPerHour;
      currentEnergy -= PHYSIOLOGY_CONFIG.energyDecayPerHour;
      currentIdealEnergy -= PHYSIOLOGY_CONFIG.energyDecayPerHour;
    }
  }
  return { chartData: out, realTotals, hasCrashRisk: globalCrashRisk, hasCortisolRisk: globalCortisolRisk, hasDigestionRisk, nervousSystemLoad: load };
}

/** Normalized driver signals for which physiological factors are pushing energy up or down. */
function computeEnergyDrivers(point) {
  if (!point) return null;

  const digestion = -(point.digestione || 0) / 100;
  const stress = -(point.cortisolo || 0) / 100;
  const glycemia = ((point.glicemia || 90) - 90) / 60;
  const hydration = ((point.idratazione || 50) - 50) / 50;

  return {
    digestion,
    stress,
    glycemia,
    hydration
  };
}

/** Metabolic Stress Index (0–100) from cortisol, digestion, glycemic deviation, dehydration. */
function computeMetabolicStress(point) {
  if (!point) return 0;

  const cortisol = point.cortisolo || 0;
  const digestion = point.digestione || 0;

  const glycemicStress = Math.abs((point.glicemia || 90) - 90);
  const dehydrationStress = Math.max(0, 60 - (point.idratazione || 60));

  const stress =
    cortisol * 0.35 +
    digestion * 0.25 +
    glycemicStress * 0.2 +
    dehydrationStress * 0.2;

  return Math.max(0, Math.min(100, stress));
}

/** Metabolic Day Score (0–100): energy, stress, hydration, stability. */
function computeMetabolicDayScore(chartData, metabolicStressIndex) {
  if (!chartData || chartData.length === 0) return 0;

  let energySum = 0;
  let hydrationSum = 0;
  let stabilityPenalty = 0;

  for (let i = 0; i < chartData.length; i++) {
    const p = chartData[i];

    energySum += p.energy || 0;
    hydrationSum += p.idratazione || 0;

    if (i > 0) {
      const delta = Math.abs((p.energy || 0) - (chartData[i - 1].energy || 0));
      stabilityPenalty += delta;
    }
  }

  const avgEnergy = energySum / chartData.length;
  const avgHydration = hydrationSum / chartData.length;
  const stability = Math.max(0, 100 - stabilityPenalty);

  const score =
    avgEnergy * 0.4 +
    (100 - metabolicStressIndex) * 0.3 +
    avgHydration * 0.2 +
    stability * 0.1;

  return Math.round(Math.max(0, Math.min(100, score)));
}

/** Analyzes the current chartData point and returns dominant factors affecting energy. */
function explainEnergyState(point) {
  const causes = [];
  if (!point) return causes;
  if (point.digestione > 60) {
    causes.push({ type: 'digestione', direction: 'down', text: 'Digestione elevata' });
  }
  if (point.cortisolo > 65) {
    causes.push({ type: 'stress', direction: 'down', text: 'Cortisolo alto' });
  }
  if (point.idratazione < 40) {
    causes.push({ type: 'hydration', direction: 'down', text: 'Disidratazione' });
  }
  if (point.glicemia > 120) {
    causes.push({ type: 'glycemia', direction: 'up', text: 'Glicemia elevata' });
  }
  if (point.neuro > 70) {
    causes.push({ type: 'recovery', direction: 'up', text: 'Recupero neurologico buono' });
  }
  return causes;
}

/** Compute the lowest predicted energy point of the day from chartData. */
function computeEnergyForecast(chartData) {
  if (!chartData || chartData.length === 0) return null;
  let minPoint = chartData[0];
  chartData.forEach(point => {
    if (point.energy < minPoint.energy) {
      minPoint = point;
    }
  });
  const result = { time: minPoint.time, energy: minPoint.energy };
  if (minPoint.energy < 40) result.crashRisk = true;
  return result;
}

/** Explain possible cause of the lowest energy moment from chartData at forecast time. */
function explainEnergyCrash(chartData, forecast) {
  if (!forecast) return null;
  const crashTime = forecast.time;
  const point = chartData?.find(p => p.time === crashTime);
  if (!point) return null;
  let reason = 'unknown';
  const digestione = point.digestione ?? point.digestion;
  const cortisolo = point.cortisolo ?? point.cortisol;
  const idratazione = point.idratazione ?? point.hydration;
  if (digestione > 60) {
    reason = 'high digestive load';
  } else if (cortisolo > 65) {
    reason = 'stress response';
  } else if (idratazione < 40) {
    reason = 'low hydration';
  }
  return { time: crashTime, reason };
}

/** Simulate adding a snack 1h before the first predicted crash; returns modified dataset or null. */
function simulateSnackIntervention(chartData) {
  if (!chartData || chartData.length === 0) return null;
  const crashPoint = chartData.find(p => (p.energy ?? 0) < 40);
  if (!crashPoint) return null;
  const snackTime = crashPoint.time - 1;
  const out = chartData.map(p => ({
    ...p,
    energy: (p.time >= snackTime && p.time <= snackTime + 2)
      ? (p.energy ?? 0) + 8
      : (p.energy ?? 0)
  }));
  return out;
}

/** Simulate coffee intervention around first crash; returns modified dataset or null. Pure. */
function simulateCoffeeIntervention(chartData) {
  if (!chartData || chartData.length === 0) return null;
  const crashPoint = chartData.find(p => (p.energy ?? 0) < 40);
  if (!crashPoint) return null;
  const crashTime = crashPoint.time;
  return chartData.map(p => ({
    ...p,
    energy: (p.time >= crashTime - 1 && p.time <= crashTime + 1)
      ? (p.energy ?? 0) + 6
      : (p.energy ?? 0)
  }));
}

/** Simulate water intervention around first crash; returns modified dataset or null. Pure. */
function simulateWaterIntervention(chartData) {
  if (!chartData || chartData.length === 0) return null;
  const crashPoint = chartData.find(p => (p.energy ?? 0) < 40);
  if (!crashPoint) return null;
  const crashTime = crashPoint.time;
  return chartData.map(p => {
    const current = p.cortisolo ?? p.cortisol ?? 0;
    const cortisolo = (p.time >= crashTime - 1 && p.time <= crashTime + 1)
      ? Math.max(0, current - 5)
      : current;
    return { ...p, cortisolo };
  });
}

/** Evaluate snack, coffee and water interventions for the first predicted energy crash. */
function simulateInterventions(chartData) {
  if (!chartData || chartData.length === 0) return null;
  const crashPoint = chartData.find(p => (p.energy ?? 0) < 40);
  if (!crashPoint) return null;
  const snackResult = simulateSnackIntervention(chartData);
  const coffeeResult = simulateCoffeeIntervention(chartData);
  const waterResult = simulateWaterIntervention(chartData);
  return { snack: snackResult, coffee: coffeeResult, water: waterResult };
}

/** Format hour (0-24) as "HH:MM" for insight messages. */
function formatTimeForInsight(hour) {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Build daily insights from chartData; deduplicate by type within 60 minutes. */
function generateDailyInsights(chartData) {
  const insights = [];
  (chartData || []).forEach(point => {
    const timeStr = formatTimeForInsight(point.time);
    if (point.energy < 40) {
      insights.push({ type: 'energy_crash', time: point.time, timeStr, message: `Possible energy crash detected around ${timeStr}.` });
    }
    const cortisol = point.cortisolo ?? point.cortisol;
    if (cortisol > 70) {
      insights.push({ type: 'high_stress', time: point.time, timeStr, message: `High cortisol levels detected around ${timeStr}.` });
    }
    const digestion = point.digestione ?? point.digestion;
    if (digestion > 60) {
      insights.push({ type: 'heavy_digestion', time: point.time, timeStr, message: `High digestive load around ${timeStr} may reduce energy.` });
    }
  });
  // Remove duplicates: ignore if another insight of the same type occurred within 60 minutes
  const WINDOW_HOURS = 1;
  const byType = {};
  insights.forEach(ins => {
    if (!byType[ins.type]) byType[ins.type] = [];
    byType[ins.type].push(ins);
  });
  const deduped = [];
  Object.keys(byType).forEach(type => {
    const list = byType[type].sort((a, b) => a.time - b.time);
    let lastKeptTime = -999;
    list.forEach(ins => {
      if (ins.time - lastKeptTime >= WINDOW_HOURS) {
        deduped.push(ins);
        lastKeptTime = ins.time;
      }
    });
  });
  return deduped.sort((a, b) => a.time - b.time);
}

/**
 * Curva anabolica 0-24h (slot ogni 0.5h). Pasti con >= 15g proteine generano un'onda;
 * se il pasto è nella finestra post-workout (fino a 3h dopo l'allenamento), l'onda è amplificata.
 */
function generateAnabolicCurve(dailyLog) {
  const timeline = Array.from({ length: 49 }, (_, i) => ({
    time: i * 0.5,
    anabolicScore: 0
  }));

  const workouts = (dailyLog || []).filter(item => item.type === 'workout' || item.type === 'work');
  const meals = (dailyLog || []).filter(item => item.type === 'food' && item.mealTime !== undefined);

  meals.forEach(meal => {
    const protein = Number(meal.prot) || 0;
    if (protein >= 15) {
      const startTime = meal.mealTime;

      let isPostWorkout = false;
      workouts.forEach(wo => {
        const woEnd = (wo.time ?? 0) + (wo.duration ?? 1);
        if (startTime >= woEnd - 0.5 && startTime <= woEnd + 3) {
          isPostWorkout = true;
        }
      });

      const peakValue = isPostWorkout ? 150 : 100;
      const duration = isPostWorkout ? 5 : 3.5;
      const timeToPeak = isPostWorkout ? 2 : 1.5;

      timeline.forEach(point => {
        if (point.time >= startTime && point.time <= startTime + duration) {
          const oreDalPasto = point.time - startTime;
          let score = 0;
          if (oreDalPasto <= timeToPeak) {
            score = (oreDalPasto / timeToPeak) * peakValue;
          } else {
            score = peakValue - (((oreDalPasto - timeToPeak) / (duration - timeToPeak)) * peakValue);
          }
          point.anabolicScore = Math.max(point.anabolicScore, score);
        }
      });
    }
  });
  return timeline;
}

/**
 * Curva del cortisolo 0-24h (slot ogni 0.5h). Base circadiana (alto al mattino, basso la sera)
 * più picchi da lavoro (work) e allenamento (workout).
 */
function generateCortisolCurve(dailyLog, manualNodes = []) {
  const timeline = Array.from({ length: 49 }, (_, i) => ({
    time: i * 0.5,
    cortisolScore: 0
  }));

  // 1. Base circadiana: alto al mattino, basso la sera. Se c'è un log sonno con wakeTime, centra il picco sull'ora di risveglio.
  const sleepEntry = (dailyLog || []).find(n => n.type === 'sleep' && typeof n.wakeTime === 'number');
  const wakeCenter = sleepEntry != null ? sleepEntry.wakeTime : 8;
  const peakStart = Math.max(0, wakeCenter - 2);
  const peakEnd = Math.min(24, wakeCenter + 2);
  const riseLen = Math.max(0.5, wakeCenter - peakStart);
  const fallLen = Math.max(0.5, peakEnd - wakeCenter);
  timeline.forEach(point => {
    let base = 20;
    if (point.time >= peakStart && point.time <= peakEnd) {
      if (point.time <= wakeCenter) base = 20 + ((point.time - peakStart) / riseLen) * 60;
      else base = 80 - (((point.time - wakeCenter) / fallLen) * 70);
    } else if (point.time > peakEnd && point.time <= 24) base = 80 - (((point.time - peakEnd) / (24 - peakEnd)) * 70);
    point.cortisolScore = Math.max(0, Math.min(100, base));
  });

  // 2. Impatto nodi manuali (lavoro e allenamento)
  const stressEvents = [...(dailyLog || []), ...(manualNodes || [])].filter(n => n.type === 'work' || n.type === 'workout');

  stressEvents.forEach(event => {
    const start = event.time ?? event.mealTime ?? 0;
    const end = event.end ?? (start + (event.duration ?? 1));
    const isWorkout = event.type === 'workout';

    timeline.forEach(point => {
      if (point.time >= start && point.time <= end + (isWorkout ? 3 : 1)) {
        const timeAfterStart = point.time - start;
        let stressSpike = 0;

        if (isWorkout) {
          if (point.time <= end) stressSpike = (timeAfterStart / Math.max(0.01, end - start)) * 40;
          else stressSpike = 40 - (((point.time - end) / 3) * 40);
        } else {
          if (point.time <= end) stressSpike = 20;
          else stressSpike = 20 - (((point.time - end) / 1) * 20);
        }

        point.cortisolScore = Math.min(100, point.cortisolScore + stressSpike);
      }
    });
  });

  return timeline;
}

/**
 * Semaforo allenamento: stato in base a curva anabolica e pasto recente.
 * options: { fullHistory, currentTrackerDate, userTargets } per mitigazione mattutina.
 */
function getWorkoutTrafficLight(currentTime, anabolicCurve, dailyLog, options) {
  const roundedTime = Math.round(currentTime * 2) / 2;
  const currentStatus = anabolicCurve.find(p => p.time === roundedTime)?.anabolicScore ?? 0;
  const pastoRecente = (dailyLog || []).find(item => item.type === 'food' && currentTime - item.mealTime >= 0 && currentTime - item.mealTime <= 1);
  if (pastoRecente) return { color: '#ff9800', text: 'IN DIGESTIONE', msg: 'Attendi la fine della digestione prima di allenarti.' };
  if (currentStatus > 50) return { color: '#00e5ff', text: 'FINESTRA ANABOLICA', msg: 'Momento perfetto per l\'allenamento.' };
  if (currentStatus > 0) return { color: '#ffeb3b', text: 'SCORTE IN ESAURIMENTO', msg: 'Allenamento leggero o assumi uno spuntino.' };
  if (currentStatus === 0 && currentTime < 11 && options?.fullHistory != null && options?.currentTrackerDate) {
    const yesterday = new Date(options.currentTrackerDate + 'T12:00:00');
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const yesterdayNode = options.fullHistory[TRACKER_STORICO_KEY(yesterdayStr)];
    const rawYesterday = yesterdayNode?.log;
    const yesterdayLog = Array.isArray(rawYesterday) ? rawYesterday : Object.values(rawYesterday || {});
    let protIeri = 0;
    let kcalIeri = 0;
    yesterdayLog.forEach(entry => {
      if (entry?.type === 'meal' && entry?.items) {
        entry.items.forEach(it => { protIeri += Number(it?.prot) || 0; kcalIeri += Number(it?.cal ?? it?.kcal) || 0; });
      } else if (entry?.type === 'food' || entry?.type === 'single' || !entry?.type) {
        protIeri += Number(entry?.prot) || 0;
        kcalIeri += Number(entry?.cal ?? entry?.kcal) || 0;
      }
    });
    const targetProt = options?.userTargets?.prot ?? 150;
    const targetKcal = options?.userTargets?.kcal ?? 2000;
    const buoneProteine = protIeri > 100 || protIeri >= targetProt * 0.7;
    const nonGraveDeficit = kcalIeri >= targetKcal * 0.7;
    if (buoneProteine && nonGraveDeficit) {
      return { color: '#ffeb3b', text: 'SCORTE SERALI ANCORA ATTIVE', msg: 'Allenamento leggero possibile.' };
    }
  }
  return { color: '#f44336', text: 'CATABOLISMO / DIGIUNO', msg: 'Assumi proteine o amminoacidi prima di allenarti.' };
}

/** Timeline calorie cumulative da dailyLog (solo dati reali pasti). */
function generateCalorieTimeline(dailyLog) {
  const entries = (dailyLog || []).filter(entry => entry.type === 'food');
  const withKcal = entries.map(entry => {
    const kcal = Number(entry.kcal ?? entry.cal ?? 0);
    const t = typeof entry.mealTime === 'number' ? entry.mealTime : 12;
    return { kcal, mealTime: t };
  }).filter(x => !Number.isNaN(x.kcal));
  withKcal.sort((a, b) => a.mealTime - b.mealTime);

  const timeline = [];
  for (let h = 0; h <= 24; h++) {
    let cumulative = 0;
    withKcal.forEach(({ kcal, mealTime }) => {
      if (mealTime <= h) cumulative += kcal;
    });
    timeline.push({ time: h, kcal: cumulative });
  }
  const totalCalories = timeline[24]?.kcal ?? 0;
  return { calorieTimeline: timeline, totalCalories };
}

/** Costruisce il prompt per l'analisi AI del grafico (nome grafico + dati attuali + direttive). */
function buildAIPrompt(expandedChart, data) {
  const chartNames = {
    percent: 'Energia SNC (%)',
    kcal: 'Calorie ingerite',
    calorieTimeline: 'Calorie cumulative',
    glicemia: 'Simulatore Glicemico',
    idratazione: 'Idratazione',
    neuro: 'Recupero Neurologico',
    cortisolo: 'Cortisolo/Stress',
    digestione: 'Digestione'
  };
  const nomeGrafico = chartNames[expandedChart] || expandedChart;
  const { displayTime = 12, energy = 50, cortisolo = 25, glicemia = 85, idratazione = 80, digestione = 0, neuro = 70 } = data || {};
  return `Sei un assistente che spiega i grafici in modo chiaro e amichevole.

Compito: genera una spiegazione del grafico "${nomeGrafico}" che sia educativa e comprensibile a un profano. Evita termini troppo tecnici. Spiega il "perché" dietro a un movimento del grafico (es: "Vedi quel calo? È perché il caffè ☕ ha finito il suo effetto"). L'utente deve poter dire: "Chi l'avrebbe mai detto!". Usa analogie semplici (es: il corpo come una batteria o un'auto). Puoi usare emoji per richiamare i nodi (🥗 pasto, ☕ caffè, ⚡ allenamento, 💼 lavoro).

Dati attuali: orario ${Number(displayTime).toFixed(1)}h, energia ${Number(energy).toFixed(0)}, cortisolo ${Number(cortisolo).toFixed(0)}, glicemia ${Number(glicemia).toFixed(0)}, idratazione ${Number(idratazione).toFixed(0)}, digestione ${Number(digestione).toFixed(0)}, recupero neurologico ${Number(neuro).toFixed(0)}.
Regola: se un valore non è disponibile, stima con un valore medio.
Regola: se parli di cena o orari serali o Cortisolo, tieni conto che l'utente può avere cortisolo alto la sera; suggerisci come abbassarlo.
Usa nel testo queste parole (anche in maiuscolo): Sveglia, Energia SNC, Finestra Anabolica, Cortisolo, Digestione, Glicemia. Il Cortisolo è la linea tratteggiata magenta.`;
}

/** Prompt per analisi AI globale (modale): un'unica analisi olistica con tutti i dati. */
function buildGlobalAIPrompt(data) {
  const { displayTime = 12, energy = 50, cortisolo = 25, glicemia = 85, idratazione = 80, digestione = 0, neuro = 70 } = data || {};
  return `Sei un assistente biochimico. Fornisci un'UNICA analisi olistica di 4-5 righe della situazione attuale dell'utente.
Dati attuali: orario ${Number(displayTime).toFixed(1)}h, energia ${Number(energy).toFixed(0)}, recupero neurologico ${Number(neuro).toFixed(0)}, cortisolo ${Number(cortisolo).toFixed(0)}, glicemia ${Number(glicemia).toFixed(0)}, idratazione ${Number(idratazione).toFixed(0)}, digestione ${Number(digestione).toFixed(0)}.
Valuta il recupero neurologico, l'energia, la glicemia e il cortisolo (ricorda che l'utente soffre di cortisolo serale alto).
Usa ESATTAMENTE le seguenti parole chiave testuali in maiuscolo o normale: [Energia SNC, Recupero Neurologico, Finestra Anabolica, Cortisolo, Digestione, Glicemia].`;
}

/** Mappa keyword testuale -> chiave activeHighlight per il grafico. */
const AI_KEYWORD_TO_HIGHLIGHT = {
  'Sveglia': 'sveglia',
  'Energia SNC': 'energia',
  'Recupero Neurologico': 'neuro',
  'Finestra Anabolica': 'anabolica',
  'Cortisolo': 'cortisolo',
  'Digestione': 'digestione',
  'Glicemia': 'energia'
};
const AI_KEYWORDS_ORDERED = ['Finestra Anabolica', 'Energia SNC', 'Recupero Neurologico', 'Cortisolo', 'Digestione', 'Glicemia', 'Sveglia'];

function InteractiveAIText({ text, onKeywordClick }) {
  if (!text || typeof text !== 'string') return null;
  const parts = [];
  const pattern = AI_KEYWORDS_ORDERED.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(${pattern})`, 'gi');
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    const matched = match[1];
    const key = AI_KEYWORDS_ORDERED.find(k => k.toLowerCase() === matched.toLowerCase());
    parts.push({ type: 'keyword', value: matched, highlightKey: key ? AI_KEYWORD_TO_HIGHLIGHT[key] : 'energia', keywordLabel: key || matched });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return (
    <p style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#b0b0b0', margin: 0 }}>
      {parts.map((part, i) => {
        if (part.type === 'text') return part.value;
        return (
          <span
            key={i}
            className="ai-keyword"
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onKeywordClick(part.highlightKey, part.keywordLabel); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onKeywordClick(part.highlightKey, part.keywordLabel); } }}
            style={{ fontWeight: 'bold', color: '#00e5ff', borderBottom: '1px solid #00e5ff', cursor: 'pointer', padding: '0 2px', borderRadius: '2px' }}
          >
            {part.value}
          </span>
        );
      })}
    </p>
  );
}

/**
 * Struttura tracker_data (da vecchio storico.html e index_vecchio.html):
 * Elenco piatto: chiavi trackerStorico_YYYY-MM-DD, nessun annidamento anno/mese.
 * Ogni valore: { data: string, log: Array, note?: string }.
 */
const TRACKER_STORICO_KEY = (date) => `trackerStorico_${date}`;

/** Mappa descrizione pasto (vecchio formato) -> mealId canonico. */
const DESC_TO_MEAL_ID = {
  colazione: 'merenda1', 'merenda am': 'merenda1', merenda1: 'merenda1',
  pranzo: 'pranzo',
  'merenda pm': 'merenda2', merenda2: 'merenda2', 
  spuntino: 'snack', snack: 'snack', // TUTTI gli snack vanno a 'snack'
  cena: 'cena'
};

function inferMealType(entry) {
  if (entry.mealId) return entry.mealId;
  if (entry.mealType) return entry.mealType;
  const key = (entry.desc || '').toLowerCase().trim();
  return DESC_TO_MEAL_ID[key] || (key ? key.replace(/\s+/g, '_') : null) || 'pranzo';
}

/** Normalizza log da formato vecchio (meal/items, single, workout) a lista piatta. */
function normalizeLogData(rawLog) {
  const out = [];
  (rawLog || []).forEach(entry => {
    if (entry.type === 'meal') {
      const mealType = inferMealType(entry);
      (entry.items || []).forEach(subItem => {
        out.push({
          ...subItem, type: 'food', mealType,
          id: subItem.id || Date.now() + Math.random(),
          kcal: subItem.kcal ?? subItem.cal ?? 0
        });
      });
    } else if (entry.type === 'single' || !entry.type) {
      const mealType = inferMealType(entry);
      out.push({
        ...entry, type: 'food', mealType,
        id: entry.id || Date.now() + Math.random(),
        kcal: entry.kcal ?? entry.cal ?? 0
      });
    } else {
      out.push({ ...entry, kcal: entry.kcal ?? entry.cal ?? 0 });
    }
  });
  return out;
}

/** Ricostruisce la struttura a "cartelle" (meal/items) per Firebase a partire dal dailyLog piatto. */
const MEAL_ORDER_SAVE = ['merenda1', 'pranzo', 'merenda2', 'cena', 'snack'];
const MEAL_LABELS_SAVE = { 
  merenda1: 'Colazione', 
  pranzo: 'Pranzo', 
  merenda2: 'Merenda PM', 
  cena: 'Cena', 
  snack: 'Snack',
  spuntino: 'Snack',
  colazione: 'Colazione'
};

/** Importanza dinamica dei nodi per vista grafico: quali tipi evidenziare. */
const NODE_IMPORTANCE = {
  percent: ['meal', 'workout', 'stimulant', 'nap', 'sunlight'],
  kcal: ['meal', 'workout'],
  cortisolo: ['work', 'workout', 'stimulant', 'meditation'],
  glicemia: ['meal', 'workout', 'stimulant'],
  idratazione: ['water', 'workout', 'stimulant'],
  digestione: ['meal'],
  neuro: ['sleep', 'work', 'workout', 'stimulant', 'nap', 'meditation', 'sunlight']
};

/** Gerarchia nodi nel modale Spiegazione: primari (focus) vs secondari (sfondo) per grafico. */
const MODAL_NODE_PRIMARY = {
  glicemia: ['meal', 'workout'],
  cortisolo: ['work', 'workout', 'stimulant', 'meditation'],
  neuro: ['work', 'workout', 'stimulant', 'nap', 'meditation', 'sunlight'],
  calorieTimeline: ['meal'],
  percent: ['meal', 'workout', 'stimulant', 'nap', 'sunlight']
};

/** Icona per tipo nodo (timeline e modale). */
const NODE_TYPE_ICON = {
  meal: '🥗',
  work: '💼',
  workout: '⚡',
  water: '💧',
  stimulant: '☕',
  nap: '😴',
  meditation: '🧘',
  supplements: '💊',
  sunlight: '☀️'
};

function denormalizeLogForFirebase(flatLog) {
  if (!flatLog || !Array.isArray(flatLog)) return [];
  const meals = {};
  const workouts = [];
  const sleeps = [];

  (flatLog || []).forEach(entry => {
    if (entry.type === 'sleep') {
      sleeps.push({
        type: 'sleep',
        id: entry.id,
        wakeTime: entry.wakeTime,
        hours: entry.hours,
        deepMin: entry.deepMin,
        remMin: entry.remMin,
        hr: entry.hr
      });
      return;
    }
    if (entry.type === 'workout' || entry.type === 'work') {
      const desc = entry.desc || entry.name || (entry.type === 'work' ? 'Lavoro' : 'Attività');
      const cal = entry.kcal ?? entry.cal ?? 0;
      workouts.push({
        type: 'workout',
        id: entry.id,
        desc,
        name: desc,
        cal,
        kcal: cal,
        duration: entry.duration,
        workoutType: entry.workoutType
      });
      return;
    }
    if (entry.type === 'food' || !entry.type) {
      // Usa il mealType così com'è (può essere 'spuntino' o 'snack')
      const mealType = entry.mealType || 'cena';
      if (!meals[mealType]) meals[mealType] = [];
      const { type, mealType: _, ...rest } = entry;
      meals[mealType].push({ ...rest, kcal: rest.kcal ?? rest.cal ?? 0, cal: rest.cal ?? rest.kcal ?? 0 });
    }
  });
  
  const result = [];
  const order = [...MEAL_ORDER_SAVE];
  const otherMeals = Object.keys(meals).filter(m => !order.includes(m));
  
  [...order, ...otherMeals].forEach(mealId => {
    if (!meals[mealId] || meals[mealId].length === 0) return;
    const baseId = mealId.split('_')[0];
    const suffix = mealId.includes('_') ? ` ${mealId.split('_')[1]}` : '';
    const descName = MEAL_LABELS_SAVE[baseId] || baseId;
    result.push({
      type: 'meal',
      mealId,
      desc: descName + suffix,
      items: meals[mealId].map(it => ({ 
        id: it.id, 
        desc: it.desc || it.name, 
        qta: it.qta ?? it.weight, 
        weight: it.weight ?? it.qta, 
        prot: it.prot, 
        kcal: it.kcal, 
        cal: it.cal, 
        ...it 
      }))
    });
  });
  result.push(...workouts);
  result.push(...sleeps);
  return result;
}

/** Applica gli orari pasto (mealTimes) al log: evita "amnesia" dopo caricamento da Firebase. */
function applyMealTimes(logArray, timesObj) {
  if (!logArray || !Array.isArray(logArray)) return logArray || [];
  return logArray.map(item => (item.type === 'food' && timesObj && timesObj[item.mealType] !== undefined) ? { ...item, mealTime: timesObj[item.mealType] } : item);
}

/** Dato l'albero tracker_data scaricato (una tantum), restituisce il log normalizzato per una data. */
function getLogFromStoricoTree(tree, dateStr) {
  if (!tree || !dateStr) return [];
  const node = tree[TRACKER_STORICO_KEY(dateStr)];
  const log = node?.log ?? node?.dati?.log;
  const raw = log ?? [];
  const asArray = Array.isArray(raw) ? raw : Object.values(raw || {});
  return normalizeLogData(asArray);
}

const STRATEGY_PROFILES = {
  upper:  { label: '💪 UPPER', kcal: 2300 },
  gambe:  { label: '🦵 GAMBE', kcal: 2500 },
  riposo: { label: '🧘 RIPOSO', kcal: 2000 },
  digiuno168: { label: '⏳ IF 16:8', kcal: 2000 }
};

/** Per calcolo Deficit/Surplus nello storico */
const PIANO_SETTIMANALE = {
  0: { cal: 2300, prot: 140 },
  1: { cal: 2300, prot: 140 },
  2: { cal: 2300, prot: 140 },
  3: { cal: 2300, prot: 140 },
  4: { cal: 2300, prot: 140 },
  5: { cal: 2300, prot: 140 },
  6: { cal: 2300, prot: 140 }
};

/** Tooltip personalizzato per la timeline: spiega sintesi proteica, cortisolo e altre metriche con range e cause. */
function CustomChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const ore = Math.floor(Number(label));
  const minuti = Math.round((Number(label) - ore) * 60);
  const orarioStr = `${ore.toString().padStart(2, '0')}:${minuti.toString().padStart(2, '0')}`;

  return (
    <div style={{ background: 'rgba(17, 17, 17, 0.95)', border: '1px solid #333', padding: '15px', borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.5)', maxWidth: '280px', backdropFilter: 'blur(5px)' }}>
      <p style={{ margin: '0 0 10px 0', borderBottom: '1px solid #444', paddingBottom: '5px', fontWeight: 'bold', color: '#fff' }}>Ore {orarioStr}</p>
      {payload.map((entry, index) => {
        let explanation = '';
        let cause = '';
        let statusColor = entry.color;

        if (entry.dataKey === 'anabolicScore') {
          const val = Number(entry.value) || 0;
          if (val > 50) {
            explanation = 'Finestra Anabolica (Alta)';
            cause = 'Stimolata da pasti proteici e/o allenamento recente.';
            statusColor = '#00e5ff';
          } else if (val > 10) {
            explanation = 'Scorte in Esaurimento';
            cause = 'Le proteine stanno venendo assimilate.';
            statusColor = '#ff9800';
          } else {
            explanation = 'Catabolismo / Digiuno';
            cause = 'Assenza di nutrienti anabolici nel sangue.';
            statusColor = '#f44336';
          }
          return (
            <div key={index} style={{ marginBottom: '10px' }}>
              <div style={{ color: statusColor, fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor }} />
                SINTESI PROTEICA: {Math.round(val)}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#ccc', marginTop: '2px' }}>{explanation}</div>
              <div style={{ fontSize: '0.7rem', color: '#888', fontStyle: 'italic' }}>Causa: {cause}</div>
            </div>
          );
        }

        if (entry.dataKey === 'kcal' && payload.length <= 2) {
          const displayName = 'Calorie cumulative';
          const val = entry.value != null && !Number.isNaN(Number(entry.value)) ? Math.round(Number(entry.value)) : entry.value;
          return (
            <div key={index} style={{ marginBottom: '10px' }}>
              <div style={{ color: '#ff9800', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ff9800' }} />
                {displayName}: {val} kcal
              </div>
            </div>
          );
        }

        if (entry.dataKey === 'kcalPast' || entry.dataKey === 'kcalFuture') {
          const displayName = 'Calorie';
          const val = entry.value != null && !Number.isNaN(Number(entry.value)) ? Math.round(Number(entry.value)) : entry.value;
          return (
            <div key={index} style={{ marginBottom: '10px' }}>
              <div style={{ color: '#00e5ff', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00e5ff' }} />
                {displayName}: {val} kcal
              </div>
            </div>
          );
        }

        if (entry.dataKey === 'cortisolScore') {
          const val = Number(entry.value) || 0;
          if (val > 70) {
            explanation = 'Stress Elevato / Allerta';
            cause = 'Lavoro intenso, allenamento pesante o risveglio mattutino.';
            statusColor = '#f44336';
          } else if (val > 40) {
            explanation = 'Attivazione Media';
            cause = 'Normale attività quotidiana.';
            statusColor = '#ffeb3b';
          } else {
            explanation = 'Rilassamento / Recupero';
            cause = 'Disattivazione del sistema nervoso (Ideale la sera).';
            statusColor = '#4caf50';
          }
          return (
            <div key={index} style={{ marginBottom: '10px' }}>
              <div style={{ color: '#9c27b0', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#9c27b0' }} />
                CORTISOLO: {Math.round(val)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#ccc', marginTop: '2px' }}>{explanation}</div>
              <div style={{ fontSize: '0.7rem', color: '#888', fontStyle: 'italic' }}>Causa: {cause}</div>
            </div>
          );
        }

        return (
          <div key={index} style={{ fontSize: '0.8rem', color: entry.color }}>
            {entry.name || entry.dataKey}: {entry.value != null && !Number.isNaN(Number(entry.value)) ? Math.round(Number(entry.value)) : entry.value}
          </div>
        );
      })}
    </div>
  );
}

/** Tooltip per il PieChart pasti (Home): mostra macro del pasto al passaggio/click. */
function MealPieTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;
  if (data.name === 'Rimanenti') {
    return (
      <div style={{ background: 'rgba(17, 17, 17, 0.95)', border: '1px dashed #555', padding: '10px', borderRadius: '12px', textAlign: 'center', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        <p style={{ margin: 0, color: '#aaa', fontSize: '0.85rem' }}>Calorie Rimanenti</p>
        <p style={{ margin: 0, color: '#fff', fontWeight: 'bold', fontSize: '1.2rem' }}>{Math.round(data.value)} kcal</p>
      </div>
    );
  }
  const macros = data.macros || {};
  return (
    <div style={{ background: 'rgba(17, 17, 17, 0.95)', border: `1px solid ${data.color}`, padding: '12px', borderRadius: '12px', boxShadow: `0 0 15px ${data.color}40`, width: 'max-content', maxWidth: '220px', pointerEvents: 'none' }}>
      <p style={{ margin: '0 0 5px 0', color: data.color, fontWeight: 'bold', borderBottom: '1px solid #333', paddingBottom: '5px' }}>{data.name}</p>
      <p style={{ margin: '0 0 8px 0', color: '#fff', fontWeight: 'bold', fontSize: '1.2rem' }}>{Math.round(data.value)} kcal</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
        <span style={{ color: '#ffb74d' }}>C: {Math.round(Number(macros.carb) || 0)}g</span>
        <span style={{ color: '#64b5f6' }}>P: {Math.round(Number(macros.pro) || 0)}g</span>
        <span style={{ color: '#81c784' }}>F: {Math.round(Number(macros.fat) || 0)}g</span>
      </div>
    </div>
  );
}

/** Modello fisiologico utente: coefficienti che modificano intensità degli effetti (tutti in [0.5, 1.5]). */
const DEFAULT_USER_MODEL = {
  caffeineSensitivity: 1.0,
  carbCrashSensitivity: 1.0,
  stressSensitivity: 1.0,
  hydrationSensitivity: 1.0,
  recoveryRate: 1.0
};

function clampModelValue(v) {
  return Math.max(0.5, Math.min(1.5, Number(v) ?? 1));
}

/**
 * weeklyData: {
 *   predictedEnergy: number,
 *   actualEnergy: number,
 *   caffeineEvents: number,
 *   crashEvents: number,
 *   sleepQualityExpected: number,
 *   sleepQualityActual: number
 * }
 */
function calibrateUserModel(weeklyData, currentModel) {
  const newModel = { ...currentModel };
  const error = (weeklyData.actualEnergy ?? 0) - (weeklyData.predictedEnergy ?? 0);
  const learningRate = 0.02;

  newModel.stressSensitivity = clampModelValue(
    newModel.stressSensitivity + error * learningRate
  );

  if ((weeklyData.caffeineEvents ?? 0) > 3) {
    const sleepError =
      (weeklyData.sleepQualityExpected ?? 0) - (weeklyData.sleepQualityActual ?? 0);
    newModel.caffeineSensitivity = clampModelValue(
      newModel.caffeineSensitivity + sleepError * 0.01
    );
  }

  if ((weeklyData.crashEvents ?? 0) > 2) {
    newModel.carbCrashSensitivity = clampModelValue(
      newModel.carbCrashSensitivity + 0.02
    );
  }

  return newModel;
}

/**
 * Build weeklyData for the week starting on weekStartMonday (YYYY-MM-DD) from fullHistory.
 * Used for weekly calibration. actualEnergy and sleep quality default to predicted/0 when not available.
 */
function buildWeeklyDataFromHistory(fullHistory, userModel, idealStrategy, weekStartMonday) {
  const mealTypesToStrategy = { merenda1: 'colazione', colazione: 'colazione', pranzo: 'pranzo', merenda2: 'spuntino', spuntino: 'spuntino', snack: 'spuntino', cena: 'cena' };
  let predictedEnergySum = 0;
  let daysWithPrediction = 0;
  let caffeineEvents = 0;
  let crashEvents = 0;

  for (let i = 0; i < 7; i++) {
    const dayStr = addDays(weekStartMonday, i);
    const node = fullHistory[TRACKER_STORICO_KEY(dayStr)];
    const raw = node?.log;
    if (!raw) continue;
    const log = normalizeLogData(Array.isArray(raw) ? raw : Object.values(raw));
    const manualNodes = node?.manualNodes ?? [];
    const timelineNodes = [];
    log.forEach(entry => {
      if (entry?.type === 'food') {
        const t = typeof entry.mealTime === 'number' ? entry.mealTime : 12;
        const strategyKey = mealTypesToStrategy[entry.mealType?.split('_')[0]] || 'cena';
        timelineNodes.push({ type: 'meal', time: t, strategyKey, kcal: entry.kcal ?? entry.cal ?? 0 });
      } else if (entry?.type === 'workout' || entry?.type === 'work') {
        timelineNodes.push({ type: 'workout', time: entry.time ?? entry.mealTime ?? 12, duration: entry.duration ?? 1, kcal: entry.kcal ?? entry.cal ?? 300 });
      }
    });
    timelineNodes.push(...manualNodes);
    timelineNodes.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

    const waterMl = manualNodes.filter(n => n.type === 'water').reduce((acc, n) => acc + (n.ml ?? n.amount ?? 0), 0);
    const result = generateRealEnergyData(timelineNodes, log, idealStrategy, waterMl, 2500, null, null, userModel, 30);
    if (result?.chartData?.[24]) {
      predictedEnergySum += result.chartData[24].energy;
      daysWithPrediction++;
      if (result.hasCrashRisk) crashEvents++;
    }
    caffeineEvents += manualNodes.filter(n => n.type === 'stimulant').length;
  }

  const predictedEnergy = daysWithPrediction > 0 ? predictedEnergySum / daysWithPrediction : 0;
  return {
    predictedEnergy,
    actualEnergy: predictedEnergy,
    caffeineEvents,
    crashEvents,
    sleepQualityExpected: 0,
    sleepQualityActual: 0
  };
}

/** Analyzes chartData for the next 2h and suggests a preventive intervention if energy is predicted to drop. */
function predictEnergyIntervention(chartData, displayTime) {
  if (!Array.isArray(chartData)) return null;

  const future = chartData
    .filter(p => p.time > displayTime && p.time <= displayTime + 2)
    .filter(p => typeof (p.energy ?? p.energia) === "number");

  if (!future.length) return null;

  let slope = 0;
  if (future.length >= 2) {
    const first = future[0].energy ?? future[0].energia ?? 100;
    const last = future[future.length - 1].energy ?? future[future.length - 1].energia ?? 100;
    const dt = future.length;
    slope = (last - first) / dt;
  }

  let lowestPoint = future[0];

  future.forEach(p => {
    const val = p.energy ?? p.energia ?? 100;
    if (val < (lowestPoint.energy ?? lowestPoint.energia ?? 100)) {
      lowestPoint = p;
    }
  });

  const lowestEnergy = lowestPoint.energy ?? lowestPoint.energia ?? 100;

  const minutesUntil =
    Math.round((lowestPoint.time - displayTime) * 60);

  if (lowestEnergy < 35 || slope < -4) {
    return {
      type: "crash",
      message: `Crash energetico previsto tra ${minutesUntil} min`,
      suggestion: "Snack: 25g carbo + 10g proteine"
    };
  }

  if (lowestEnergy < 45 || slope < -2) {
    return {
      type: "dip",
      message: `Calo energetico previsto tra ${minutesUntil} min`,
      suggestion: "Snack leggero o idratazione"
    };
  }

  return null;
}

export {
  RADIAN,
  getTodayString,
  getYesterdayString,
  getSleepStatus,
  getMondayOfWeek,
  addDays,
  MEAL_TYPE_GROUPS,
  MEAL_TYPE_TO_CANONICAL,
  areMealTypesEquivalent,
  toCanonicalMealType,
  getEquivalentMealTypes,
  getMealIcon,
  getGhostMealType,
  getSlotKey,
  decimalToTimeStr,
  computeBaselineEnergy,
  computeDigestiveLoad,
  responseCurve,
  PHYSIOLOGY_CONFIG,
  generateRealEnergyData,
  computeEnergyDrivers,
  computeMetabolicStress,
  computeMetabolicDayScore,
  explainEnergyState,
  computeEnergyForecast,
  explainEnergyCrash,
  simulateSnackIntervention,
  simulateCoffeeIntervention,
  simulateWaterIntervention,
  simulateInterventions,
  formatTimeForInsight,
  generateDailyInsights,
  generateAnabolicCurve,
  generateCortisolCurve,
  getWorkoutTrafficLight,
  generateCalorieTimeline,
  buildAIPrompt,
  buildGlobalAIPrompt,
  AI_KEYWORD_TO_HIGHLIGHT,
  AI_KEYWORDS_ORDERED,
  InteractiveAIText,
  TRACKER_STORICO_KEY,
  DESC_TO_MEAL_ID,
  inferMealType,
  normalizeLogData,
  MEAL_ORDER_SAVE,
  MEAL_LABELS_SAVE,
  NODE_IMPORTANCE,
  MODAL_NODE_PRIMARY,
  NODE_TYPE_ICON,
  denormalizeLogForFirebase,
  applyMealTimes,
  getLogFromStoricoTree,
  STRATEGY_PROFILES,
  PIANO_SETTIMANALE,
  CustomChartTooltip,
  MealPieTooltip,
  DEFAULT_USER_MODEL,
  clampModelValue,
  calibrateUserModel,
  buildWeeklyDataFromHistory,
  predictEnergyIntervention
}