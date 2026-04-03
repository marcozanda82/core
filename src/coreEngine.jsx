

import React from 'react';
import { computeTotali, DEFAULT_TARGETS } from './useBiochimico';
import { addDays } from './calendarDateUtils';

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

// ============================================================================
// UTILITY CRITICHE PER RETROCOMPATIBILITÀ MEALTYPE
// ============================================================================

/** 
 * Gruppi di equivalenza per mealType. Tutti gli ID nello stesso array sono considerati lo stesso pasto.
 * Questo risolve il problema dei dati storici con 'spuntino' vs nuovi 'snack'.
 */
const MEAL_TYPE_GROUPS = {
  colazione: ['colazione', 'merenda1'],
  snack: ['snack', 'merenda_am', 'merenda_pm', 'merenda2', 'spuntino'],
  pranzo: ['pranzo'],
  cena: ['cena'],
};

/**
 * Mappa inversa: merenda1→colazione; merenda_am/pm/merenda2/spuntino→snack.
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
  const existingFoods = (log || []).filter(i => i.type === 'food' || i.type === 'recipe');
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
  if (item.type !== 'food' && item.type !== 'recipe') return null;
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
 * Parses deep/REM sleep from wearable-style values: number (minutes), "1h58m", or "118".
 */
function parseMinutes(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const match = value.match(/(\d+)h\s*(\d+)m/);
    if (match) return Number(match[1]) * 60 + Number(match[2]);
    const num = Number(value);
    if (!isNaN(num)) return num;
  }
  return null;
}

/**
 * Converts various time strings to decimal hours (0–24).
 * Handles: "1h 23m" -> ~1.38, "01:21" -> ~1.35, "45m" -> 0.75, "1h" -> 1, and numeric fallback.
 */
function parseToDecimalHours(val) {
  if (val == null) return null;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (typeof val !== 'string') return null;
  const s = val.trim();
  if (!s) return null;
  const hM = s.match(/(\d+)\s*h\s*(\d+)\s*m/i);
  if (hM) return Number(hM[1]) + Number(hM[2]) / 60;
  const onlyH = s.match(/(\d+)\s*h/i);
  if (onlyH) return Number(onlyH[1]);
  const onlyM = s.match(/(\d+)\s*m/i);
  if (onlyM) return Number(onlyM[1]) / 60;
  const clock = s.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) return Number(clock[1]) + Number(clock[2]) / 60;
  const num = parseFloat(s);
  if (!Number.isNaN(num)) return num;
  return null;
}

/**
 * Baseline energetica giornaliera in base a sonno e recupero neurologico.
 * Bilanciamento orientato alla qualità: ore totali (fino a 50 pt), profondità SNC (30 pt), REM cognitiva (20 pt).
 * Con ~7h e ottima efficienza (2h profondo, 1.5h REM) la batteria si ricarica all'85–90%.
 * Supporta più formati di import (wearable: duration, deep, rem in minuti; o hours, deepMin, remMin).
 * Cerca il sonno in dailyLog e in timelineNodes (nodi timeline).
 */
function computeBaselineEnergy(dailyLog, timelineNodes) {
  const log = dailyLog || [];
  const nodes = timelineNodes || [];
  const sleepEntry =
    log.find(e => e.type === 'sleep') ||
    nodes.find(n => n.type === 'sleep');
  if (!sleepEntry) return 50;

  const sleepHours =
    sleepEntry.hours ??
    sleepEntry.duration ??
    sleepEntry.sleepHours ??
    7;

  console.log("Sleep entry detected:", sleepEntry);

  const deepMinutes =
    sleepEntry.deepMin ??
    sleepEntry.deepMinutes ??
    parseMinutes(sleepEntry.deep);
  const deepSleepHours = deepMinutes != null ? deepMinutes / 60 : 1;

  const remMinutes =
    sleepEntry.remMin ??
    sleepEntry.remMinutes ??
    parseMinutes(sleepEntry.rem);
  const remSleepHours = remMinutes != null ? remMinutes / 60 : 1;

  const basePoints = Math.min(50, (sleepHours / 7.5) * 50);
  const deepPoints = Math.min(30, (deepSleepHours / 1.5) * 30);
  const remPoints = Math.min(20, (remSleepHours / 1.5) * 20);

  let baseline = basePoints + deepPoints + remPoints;
  baseline = Math.min(100, baseline);
  baseline = Math.max(55, Math.min(95, baseline));
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

/**
 * Pilota automatico idratazione: nessun record acqua nel diario e nessun nodo acqua sulla timeline
 * → il motore assume idratazione ottimale (nessun malus da disidratazione).
 */
function computeWaterHydrationAutoPilot(dailyLog, timelineNodes) {
  const log = dailyLog || [];
  const waterLogs = log.filter(
    e =>
      e?.type === 'water' ||
      e?.id === 'water' ||
      (typeof e?.id === 'string' && e.id.startsWith('water_'))
  );
  const waterNodes = (timelineNodes || []).filter(n => n?.type === 'water');
  return waterLogs.length === 0 && waterNodes.length === 0;
}

/** Grammi di etanolo da nodo timeline `alcohol` (pureAlcohol o stima da ml × ABV). */
function getPureAlcoholGrams(node) {
  if (!node || node.type !== 'alcohol') return 0;
  const pa = Number(node.pureAlcohol);
  if (Number.isFinite(pa) && pa > 0) return pa;
  const ml = Number(node.ml) || 0;
  const abv = Number(node.abv) || 0;
  return ml * (abv / 100) * 0.8;
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
 * idealStrategy: { colazione, snack, pranzo, cena, allenamento } kcal obiettivo (legacy: merenda_am/pm/spuntino → snack).
 * Restituisce { chartData, realTotals } per grafico doppia curva e semafori.
 */
function generateRealEnergyData(timelineNodes, dailyLog, idealStrategy, waterIntake = 0, dailyWaterGoal = 2500, initialEnergy = null, initialIdealEnergy = null, userModel = null, nervousSystemLoad = 30, currentTime = null, accumuloSNC = 0) {
  const log = dailyLog || [];
  const graphTimelineNodes = Array.isArray(timelineNodes) ? [...timelineNodes] : [];
  // Sonnellini: sleep con durata < 3 h → nodi 'nap' (anche se unici nel log); notte principale resta type sleep nel log
  const allSleepsForChart = log.filter(e => e && e.type === 'sleep');
  allSleepsForChart.forEach(s => {
    const dur = Number(s.hours ?? s.duration ?? s.sleepHours ?? 0) || 0;
    if (dur > 0 && dur < NIGHT_SLEEP_MIN_HOURS) {
      const startT = Number(s.sleepStart ?? s.time ?? s.bedtime ?? 15) || 15;
      graphTimelineNodes.push({ type: 'nap', time: startT, duration: dur });
    }
  });

  /** Allenamenti nel diario senza nodo timeline (es. log da chat): replica la shape di manualNodes, duration in ore, kcal sempre > 0 per il modello. */
  const seenTimelineIds = new Set(graphTimelineNodes.map((n) => n && n.id).filter(Boolean));
  log.forEach((entry) => {
    if (!entry || entry.type !== 'workout') return;
    const idStr = entry.id != null ? String(entry.id) : '';
    if (idStr && seenTimelineIds.has(idStr)) return;
    const timeT = Number(entry.time ?? entry.mealTime);
    if (!Number.isFinite(timeT)) return;
    let durH = Number(entry.duration);
    if (!Number.isFinite(durH) || durH <= 0 || durH > 36) {
      const dm = Number(entry.durationMinutes);
      durH = Number.isFinite(dm) && dm > 0 ? Math.max(1 / 60, dm / 60) : 1;
    }
    let kcal = Number(entry.kcal ?? entry.cal ?? entry.calories ?? 0);
    if (!Number.isFinite(kcal) || kcal < 0) kcal = 0;
    if (kcal === 0) {
      kcal = Math.max(15, Math.round(durH * 60 * 4));
    }
    const label = String(entry.title ?? entry.name ?? entry.desc ?? '').toLowerCase();
    const isCognitive = /lavoro\s*(al\s*)?pc|pc\b|smart\s*working|scrivania|studio|desk|videocal|zoom|call da|programm/i.test(label);
    const isWorkNode = /(\blavoro\b|meeting|riunione|ufficio\b)/i.test(label) && !/lavoro\s*al\s*pc|pc\b|scrivania/i.test(label);
    const nodeType = isCognitive ? 'cognitive' : isWorkNode ? 'work' : 'workout';
    const nid = idStr || `logworkout_${timeT}_${Math.round(durH * 1000)}`;
    graphTimelineNodes.push({
      id: nid,
      type: nodeType,
      time: timeT,
      duration: Math.max(0.25, durH),
      kcal,
      subType: entry.workoutType || 'pesi',
      name: entry.title || entry.name || entry.desc,
    });
    if (idStr) seenTimelineIds.add(idStr);
  });

  const isWaterAutoPilot = computeWaterHydrationAutoPilot(log, graphTimelineNodes);
  const maxEnergyCap = Math.max(0, Math.min(100, 100 - (Number(accumuloSNC) || 0) * 0.25));
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

  const realBaseline = computeBaselineEnergy(log, graphTimelineNodes);
  let baselineEnergy = Math.max(55, Math.min(95, realBaseline));

  const sleepNode =
    pickMainNightSleepEntry(log.filter(e => e && e.type === 'sleep')) ||
    log.find(e => e.type === 'sleep') ||
    graphTimelineNodes.find(n => n.type === 'sleep');
  const wakeTime = sleepNode?.wakeTime ?? 7.5;
  const sleepEnd = sleepNode?.sleepEnd != null ? sleepNode.sleepEnd : wakeTime;
  const nightStartEnergy =
    initialEnergy != null
      ? Math.max(initialEnergy, baselineEnergy * 0.7)
      : baselineEnergy;
  const sleepStart = sleepNode?.sleepStart ?? 0;
  const wake = sleepEnd;

  const defaultIdealKcalForStrategy = (sk, idealObj) => {
    const legacySnack =
      Number(idealObj?.snack ?? idealObj?.merenda_pm ?? idealObj?.merenda_am ?? idealObj?.spuntino) || 250;
    const defaults = {
      colazione: 400,
      snack: legacySnack,
      pranzo: 700,
      cena: 500,
    };
    if (defaults[sk] != null) return defaults[sk];
    if (sk === 'merenda_am' || sk === 'merenda_pm' || sk === 'spuntino') return legacySnack;
    return 500;
  };

  let workoutKcal = 0;
  const realTotals = { colazione: 0, snack: 0, pranzo: 0, cena: 0, allenamento: 0 };

  log.forEach(entry => {
    const kcal = Number(entry.kcal ?? entry.cal ?? 0) || 0;
    if (entry.type === 'workout') {
      workoutKcal += kcal;
      return;
    }
    if (entry.type !== 'food' && entry.type !== 'recipe') return;
    const entryMealType = entry.mealType || 'cena';
    const base = String(entryMealType).split('_')[0];
    const canon = toCanonicalMealType(base);
    if (Object.prototype.hasOwnProperty.call(realTotals, canon)) {
      realTotals[canon] = (realTotals[canon] || 0) + kcal;
    }
  });
  realTotals.allenamento = workoutKcal;

  let metabolicEnergy = baselineEnergy * 0.45;
  let neuralEnergy = baselineEnergy * 0.45;
  metabolicEnergy -= load * PHYSIOLOGY_CONFIG.nervousSystemImpact;
  neuralEnergy -= load * PHYSIOLOGY_CONFIG.nervousSystemImpact;
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
  let peakEnergyAtWake = null;
  let peakNeuroAtWake = null;

  console.log("initialEnergy:", initialEnergy);
  console.log("realBaseline:", realBaseline);
  console.log("baselineEnergy:", baselineEnergy);
  console.log("nightStartEnergy:", nightStartEnergy);
  console.log("REAL baseline energy:", realBaseline);

  for (let h = 0; h <= 24; h++) {
    glycemicMemory *= 0.92;
    neuralFatigue *= 0.96;
    let currentDigestione = 0;
    let hadMealThisHour = false;
    const useContinuityAtZero = h === 0 && initialEnergy != null;
    const isSleeping =
      sleepStart > wake
        ? (h >= sleepStart || h < wake)
        : (h >= sleepStart && h < wake);
    if (isSleeping) {
      // Fase di SONNO: Ricarica progressiva verso la baseline (proportional recovery). Solo in finestra sonno.
      const rechargeRate = (baselineEnergy - metabolicEnergy) * 0.25;
      metabolicEnergy += rechargeRate;
      neuralEnergy += rechargeRate;
      currentIdealEnergy += rechargeRate;
    } else {
      // Fase di VEGLIA: niente più ricarica; solo decadimento (salvo continuity a h=0).
      if (!useContinuityAtZero) {
        metabolicEnergy -= PHYSIOLOGY_CONFIG.energyDecayPerHour;
        neuralEnergy -= PHYSIOLOGY_CONFIG.energyDecayPerHour;
        currentIdealEnergy -= PHYSIOLOGY_CONFIG.energyDecayPerHour;
      }
    }

    const circadianMod = circadianEnergyModifier(h);
    if (isSleeping) {
      metabolicEnergy += circadianMod;
      neuralEnergy += circadianMod;
    } else {
      // Di giorno non far salire l'energia con il picco circadiano: solo effetti negativi o nulli.
      const circadianAwake = Math.min(0, circadianMod);
      metabolicEnergy += circadianAwake;
      neuralEnergy += circadianAwake;
    }

    graphTimelineNodes.forEach(node => {
      if (node.type === 'meal') {
        if (node.time >= h && node.time < h + 1) hadMealThisHour = true;
        const timeSince = h - node.time;
        if (timeSince >= 0 && timeSince <= 3) {
          const mealEffect = responseCurve(timeSince, 1, 3);
          const realK = node.kcal || node.cal || 500;
          let sk = node.strategyKey;
          if (sk === 'spuntino' || sk === 'merenda_pm' || sk === 'merenda_am' || sk === 'merenda2') sk = 'snack';
          const idealK = Number(ideal[node.strategyKey] ?? ideal[sk]) || defaultIdealKcalForStrategy(sk, ideal);
          metabolicEnergy += mealEffect * (realK / 20);
          currentIdealEnergy += mealEffect * (idealK / 20);
        }
      }
      if (node.type === 'work' || node.type === 'workout' || node.type === 'cognitive') {
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
          else if (node.type === 'cognitive') { load += (node.duration ?? 1) * PHYSIOLOGY_CONFIG.workLoadImpact * 0.8; neuralFatigue += 1.5; }
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
    graphTimelineNodes.forEach(node => {
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

    graphTimelineNodes.forEach(node => {
      if ((node.type === 'work' || node.type === 'workout' || node.type === 'cognitive') && h >= node.time && h <= node.time + (node.duration || 1)) {
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

    if (!isWaterAutoPilot) {
      currentHydration -= PHYSIOLOGY_CONFIG.hydrationDecayPerHour;
      graphTimelineNodes.forEach(node => {
        if (node.type === 'water' && node.time >= h && node.time < h + 1) {
          const ml = node.ml ?? node.amount ?? 250;
          currentHydration += (ml / (dailyWaterGoal || 2500)) * 45;
        }
        if ((node.type === 'work' || node.type === 'workout' || node.type === 'cognitive') && h >= node.time && h <= node.time + (node.duration || 1)) {
          currentHydration -= 8.0;
        }
        if (node.type === 'stimulant' && node.time >= h && node.time < h + 1) {
          const sub = (node.subtype || 'caffè').toLowerCase();
          const malus = sub === 'energy drink' ? 15 : sub === 'caffè' ? 10 : 5;
          currentHydration -= malus;
        }
        if (node.type === 'alcohol' && node.time >= h && node.time < h + 1) {
          const diuresi = getPureAlcoholGrams(node) * 10;
          currentHydration -= (diuresi / (dailyWaterGoal || 2500)) * 45;
        }
      });
      currentHydration = Math.max(0, Math.min(100, currentHydration));
    } else {
      currentHydration = 100;
      graphTimelineNodes.forEach(node => {
        if (node.type === 'alcohol' && node.time >= h && node.time < h + 1) {
          const diuresi = getPureAlcoholGrams(node) * 10;
          currentHydration -= (diuresi / (dailyWaterGoal || 2500)) * 45;
        }
      });
      currentHydration = Math.max(0, Math.min(100, currentHydration));
    }

    currentEnergy = Math.max(0, Math.min(100, currentEnergy));
    currentIdealEnergy = Math.max(0, Math.min(100, currentIdealEnergy));

    currentEnergy = currentEnergy * 0.7 + previousEnergy * 0.3;
    currentEnergy = Math.min(currentEnergy, maxEnergyCap);
    previousEnergy = currentEnergy;

    console.log("Simulated energy:", currentEnergy);

    let cortisolBase;
    if (h < wake) {
      cortisolBase = 25 + (h / Math.max(0.1, wake)) * (58 - 25);
    } else if (h <= wake + 1) {
      cortisolBase = 58 + ((h - wake) / 1) * (100 - 58);
    } else if (h <= wake + 1.5) {
      cortisolBase = 100 - ((h - wake - 1) / 0.5) * 20;
    } else if (h < 18) {
      const t0 = wake + 1.5;
      cortisolBase = 80 - ((h - t0) / (18 - t0)) * 40;
    } else {
      cortisolBase = Math.max(40, 50 - (h - 18) * (10 / 6));
    }
    currentCortisol += (cortisolBase - currentCortisol) * 0.3;
    if (currentEnergy < 35) { currentCortisol += 8; globalCortisolRisk = true; }
    if (!isWaterAutoPilot && currentHydration < 45) { currentCortisol += 6 * model.hydrationSensitivity; globalCortisolRisk = true; }
    graphTimelineNodes.forEach(node => {
      if (h >= node.time && h < node.time + (node.duration || 1)) {
        if (node.type === 'workout') {
          currentCortisol += 5 * model.stressSensitivity;
          globalCortisolRisk = true;
        } else if (node.type === 'work') {
          currentCortisol += 1.5 * model.stressSensitivity;
        } else if (node.type === 'cognitive') {
          currentCortisol += 2 * model.stressSensitivity;
        }
      }
    });
    graphTimelineNodes.forEach(node => {
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
    graphTimelineNodes.forEach(node => {
      if (node.type === 'nap') {
        const timeSince = h - node.time;
        const duration = node.duration ?? 0.25;
        const effectWindow = duration + 1.5;
        if (timeSince >= 0 && timeSince <= effectWindow) {
          const effect = responseCurve(timeSince, 0.3, effectWindow);
          neuralEnergy += effect * PHYSIOLOGY_CONFIG.napSncBoost;
          currentCortisol -= effect * PHYSIOLOGY_CONFIG.napCortisolReduction;
          currentNeuro = Math.min(100, currentNeuro + effect * 35);
          if (node.time >= h && node.time < h + 1) {
            const napMins = (node.duration || 1) * 60;
            const energyBoost = Math.round(calculateNapBoost(napMins));
            currentEnergy = Math.min(100, currentEnergy + energyBoost);
          }
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

    if (isSleeping) {
      currentNeuro = Math.max(0, Math.min(100, maxNeuro - (wake - h) * 8));
    } else {
      currentNeuro -= 1.2;
    }
    graphTimelineNodes.forEach(node => {
      if ((node.type === 'work' || node.type === 'workout' || node.type === 'cognitive') && h >= node.time && h <= node.time + (node.duration || 1)) {
        const drain = node.type === 'workout' ? 12 : (node.type === 'cognitive' ? 5 : 6);
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
    if (!isWaterAutoPilot) {
      currentHydration += (80 - currentHydration) * 0.05;
    } else {
      currentHydration = 100;
    }

    // Mild homeostatic stabilization toward baseline only during sleep (after wake, no pull-up)
    if (isSleeping) {
      metabolicEnergy += (baselineEnergy - metabolicEnergy) * 0.05;
      neuralEnergy += (baselineEnergy - neuralEnergy) * 0.05;
    }
    metabolicEnergy = Math.max(15, Math.min(100, metabolicEnergy));
    neuralEnergy = Math.max(15, Math.min(100, neuralEnergy));
    
if (isSleeping) {
      peakEnergyAtWake = Math.max(peakEnergyAtWake ?? 0, currentEnergy);
      peakNeuroAtWake = Math.max(peakNeuroAtWake ?? 0, currentNeuro);
    }

    const energyCapped = Math.min(useContinuityAtZero ? initialEnergy : currentEnergy, maxEnergyCap);
    out.push({
      time: h,
      hour: h,
      energy: energyCapped,
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
  // Filtro allarmi obsoleti: se all'ora attuale energia/cortisolo sono rientrati (es. pasto inserito nel passato), spegni l'allarme
  if (currentTime != null && typeof currentTime === 'number' && out.length > 0) {
    const idx = Math.min(Math.floor(currentTime), out.length - 1);
    const pt = out[Math.max(0, idx)];
    if (pt) {
      if ((pt.energy ?? 0) >= 40) globalCrashRisk = false;
      if ((pt.cortisolo ?? 0) < 70) globalCortisolRisk = false;
    }
  }
  return {
    chartData: out,
    realTotals,
    hasCrashRisk: globalCrashRisk,
    hasCortisolRisk: globalCortisolRisk,
    hasDigestionRisk,
    nervousSystemLoad: load,
    isWaterHydrationAutoPilot: isWaterAutoPilot,
    accumuloSNC: Number(accumuloSNC) || 0,
    maxEnergyCap
  };
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
 * Curva del cortisolo 0-24h (slot ogni 0.5h). State machine a 4 fasi basata su wakeTime:
 * 1) Notte: minimo a mezzanotte, lieve salita fino al risveglio.
 * 2) CAR: picco 100% al risveglio, max 1h poi inizia la discesa.
 * 3) Discesa diurna fino a ~50% alle 18:00.
 * 4) Serale (Cortisolo Alto Serale): non sotto 40.
 */
function generateCortisolCurve(dailyLog, manualNodes = []) {
  const sleepEntry = (dailyLog || []).find(n => n.type === 'sleep' && (typeof n.wakeTime === 'number' || typeof n.sleepEnd === 'number'));
  const wakeTime = sleepEntry?.wakeTime ?? sleepEntry?.sleepEnd ?? 8;

  const timeline = Array.from({ length: 49 }, (_, i) => {
    const h = i * 0.5;
    let cortisolScore;

    if (h < wakeTime) {
      cortisolScore = 25 + (h / Math.max(0.1, wakeTime)) * (58 - 25);
    } else if (h <= wakeTime + 1) {
      cortisolScore = 58 + ((h - wakeTime) / 1) * (100 - 58);
    } else if (h <= wakeTime + 1.5) {
      cortisolScore = 100 - ((h - wakeTime - 1) / 0.5) * 20;
    } else if (h < 18) {
      const t0 = wakeTime + 1.5;
      cortisolScore = 80 - ((h - t0) / (18 - t0)) * 40;
    } else {
      cortisolScore = 50 - (h - 18) * (10 / 6);
      cortisolScore = Math.max(40, cortisolScore);
    }

    return { time: h, cortisolScore: Math.max(0, Math.min(100, cortisolScore)) };
  });

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

  (manualNodes || []).forEach(node => {
    if (node.type !== 'alcohol' || typeof node.time !== 'number') return;
    const pa = getPureAlcoholGrams(node);
    if (pa <= 0) return;
    timeline.forEach(point => {
      const oreDalDrink = point.time - node.time;
      if (oreDalDrink > 0 && oreDalDrink <= 2) {
        point.cortisolScore = Math.max(10, point.cortisolScore - pa * 0.2);
      } else if (oreDalDrink > 2 && oreDalDrink < 8) {
        point.cortisolScore = Math.min(100, point.cortisolScore + pa * 0.5);
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
  const { displayTime = 12, energy = 50, cortisolo = 25, glicemia = 85, idratazione = 80, digestione = 0, neuro = 70, activeAlerts = [] } = data || {};
  const oraAttuale = Number(displayTime).toFixed(1);
  const alertsList = Array.isArray(activeAlerts) ? activeAlerts : [];
  const alertsText = alertsList.length > 0 ? `ALLARMI ATTIVI: ${alertsList.join(', ')}.` : '';
  const rulesParts = [
    alertsList.includes('deficit_serale') ? 'Se "deficit_serale" è attivo: Avvisa l\'utente del rischio di catabolismo notturno e insonnia da cortisolo. Ha assunto meno del 60% delle calorie e sono già le 20:00. Consiglia un pasto denso.' : '',
    alertsList.includes('proteine_sature') ? 'Se "proteine_sature" è attivo: Avvisa che ha consumato oltre il 90% del budget proteico troppo presto (prima delle 15:00). Consiglia di preservare le proteine rimanenti per la cena per evitare di esaurire i recettori della sintesi proteica.' : '',
    alertsList.includes('workout_crash') ? 'Se "workout_crash" è attivo: ALLARME ROSSO. C\'è un allenamento nelle prossime 2 ore ma l\'energia è sotto il 40%. Consiglia ASSOLUTAMENTE un pre-workout glicemico rapido per evitare lo schianto.' : ''
  ].filter(Boolean);
  const rulesText = rulesParts.length > 0 ? `\nREGOLE DI OTTIMIZZAZIONE (applica in base agli allarmi attivi): ${rulesParts.join(' ')}` : '';
  return `Sei un assistente biochimico. Fornisci un'UNICA analisi olistica di 4-5 righe della situazione attuale dell'utente.
Dati attuali: orario ${oraAttuale}h, energia ${Number(energy).toFixed(0)}, recupero neurologico ${Number(neuro).toFixed(0)}, cortisolo ${Number(cortisolo).toFixed(0)}, glicemia ${Number(glicemia).toFixed(0)}, idratazione ${Number(idratazione).toFixed(0)}, digestione ${Number(digestione).toFixed(0)}.
Valuta il recupero neurologico, l'energia, la glicemia e il cortisolo (ricorda che l'utente soffre di cortisolo serale alto).
Usa ESATTAMENTE le seguenti parole chiave testuali in maiuscolo o normale: [Energia SNC, Recupero Neurologico, Finestra Anabolica, Cortisolo, Digestione, Glicemia].
${alertsText ? `${alertsText}${rulesText}` : ''}

REGOLA PREDITTIVA: Distingui i nodi con orario <= ${oraAttuale}h (STORICO) dai nodi con orario > ${oraAttuale}h (PIANIFICAZIONE). Per i nodi STORICI esegui un'analisi. Per i nodi di PIANIFICAZIONE (es. un allenamento o lavoro al PC previsto tra alcune ore) genera consigli di OTTIMIZZAZIONE PREVENTIVA: timing dei nutrienti, pre-workout, sonno richiesto, idratazione e tutto ciò che massimizza la performance all'arrivo di quell'evento.`;
}

// LOCAL KNOWLEDGE BASE — Casistiche Note (cache risposte AI)
const KNOWLEDGE_BASE_KEY = 'readycore_knowledge_base';
const KNOWLEDGE_BASE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 giorni
function getLocalKnowledgeBase() {
  try { return JSON.parse(localStorage.getItem(KNOWLEDGE_BASE_KEY)) || {}; } catch { return {}; }
}
function saveToKnowledgeBase(hashKey, aiResponseText) {
  const kb = getLocalKnowledgeBase();
  kb[hashKey] = { text: aiResponseText, timestamp: Date.now() };
  try { localStorage.setItem(KNOWLEDGE_BASE_KEY, JSON.stringify(kb)); } catch (_) {}
}
function generateStateHash(energyLevel, cortisolLevel, activeAlerts, lastMealHoursAgo) {
  const energyBucket = Math.floor(Number(energyLevel) / 10) * 10;
  const cortisolBucket = Math.floor(Number(cortisolLevel) / 10) * 10;
  const mealBucket = Math.min(Math.floor(Number(lastMealHoursAgo) || 0), 8);
  const alertsString = (Array.isArray(activeAlerts) ? activeAlerts : []).slice().sort().join('_');
  return `E${energyBucket}_C${cortisolBucket}_M${mealBucket}_A[${alertsString}]`;
}

/** Istruzioni per l’AI che elabora screenshot/dati Mi Fitness: mappatura Fell asleep / Woke up e stime. */
const SLEEP_AI_MI_FITNESS_INSTRUCTIONS = `Mappatura obbligatoria da Mi Fitness: "Fell asleep" (o equivalente "Addormentato", "Inizio sonno") va SEMPRE nella chiave JSON sleepStart (ore decimali 0-24, es. 23.5 per 23:30). "Woke up" (o "Sveglia", "Woke up") va SEMPRE nella chiave sleepEnd oppure wakeTime (ore decimali, es. 6.3 per 06:18). Se un valore non è leggibile o non è disponibile, stima con un valore medio ragionevole (es. sleepStart 23, wakeTime 6.5, hours 7) e compila comunque il JSON.`;

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
  colazione: 'colazione',
  merenda1: 'colazione',
  'merenda am': 'snack',
  merenda_am: 'snack',
  pranzo: 'pranzo',
  'merenda pm': 'snack',
  merenda_pm: 'snack',
  merenda2: 'snack',
  spuntino: 'snack',
  snack: 'snack',
  cena: 'cena',
};

function inferMealType(entry) {
  if (entry.mealId) return entry.mealId;
  if (entry.mealType) return entry.mealType;
  const key = (entry.desc || '').toLowerCase().trim();
  return DESC_TO_MEAL_ID[key] || (key ? key.replace(/\s+/g, '_') : null) || 'pranzo';
}

/** Indica se un entry è un log sonno (per normalizzazione Mi Fitness / wearable). */
function isSleepEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.type === 'sleep') return true;
  if (entry.id === 'sonno') return true;
  const hasSleepKeys = 'sleepStart' in entry || 'sleepEnd' in entry || 'deep' in entry || 'rem' in entry;
  if (hasSleepKeys) return true;
  return false;
}

/** Normalizza i campi tempo/minuti di un entry sonno in numeri decimali per il motore. */
function normalizeSleepEntry(entry) {
  const out = { ...entry, type: 'sleep', kcal: entry.kcal ?? entry.cal ?? 0 };
  const toHours = (v) => (v != null ? parseToDecimalHours(v) : undefined);
  const toMinutes = (v) => (v != null ? parseMinutes(v) : undefined);
  if (entry.sleepStart != null) out.sleepStart = toHours(entry.sleepStart) ?? entry.sleepStart;
  if (entry.sleepEnd != null) out.sleepEnd = toHours(entry.sleepEnd) ?? entry.sleepEnd;
  if (entry.wakeTime != null) out.wakeTime = toHours(entry.wakeTime) ?? entry.wakeTime;
  if (entry.hours != null) out.hours = toHours(entry.hours) ?? (typeof entry.hours === 'number' ? entry.hours : undefined);
  if (entry.duration != null) out.duration = toHours(entry.duration) ?? (typeof entry.duration === 'number' ? entry.duration : undefined);
  if (entry.sleepHours != null) out.sleepHours = toHours(entry.sleepHours) ?? (typeof entry.sleepHours === 'number' ? entry.sleepHours : undefined);
  const deepMin = toMinutes(entry.deep) ?? toMinutes(entry.deepMin) ?? entry.deepMinutes ?? (typeof entry.deep === 'number' ? entry.deep : undefined) ?? (typeof entry.deepMin === 'number' ? entry.deepMin : undefined);
  if (deepMin != null) out.deepMin = deepMin;
  const remMin = toMinutes(entry.rem) ?? toMinutes(entry.remMin) ?? entry.remMinutes ?? (typeof entry.rem === 'number' ? entry.rem : undefined) ?? (typeof entry.remMin === 'number' ? entry.remMin : undefined);
  if (remMin != null) out.remMin = remMin;
  return out;
}

/**
 * Giornata con allenamento “pesante” per accumulo SNC: singola sessione workout, soglie kcal/durata, no tag testuali.
 */
function dayHasTrainingFromLogs(log, manualNodes) {
  const isHeavySncWorkout = (entry) => {
    if (!entry || entry.type !== 'workout') return false;

    const desc = String(entry.desc || entry.name || entry.workoutType || '').toLowerCase();

    // 1. Ampliamo le attività di recupero attivo ignorate
    const lightActivities = [
      'camminat', 'walking', 'passi', 'passeggiat', 'stretching',
      'yoga', 'pilates', 'meditazione', 'riscaldamento', 'warmup',
      'defaticamento', 'recupero', 'posturale', 'mobilita', 'mobilità'
    ];
    if (lightActivities.some(light => desc.includes(light))) return false;

    // 2. Normalizzazione durata (gestisce sia ore decimali che minuti netti)
    let dur = Number(entry.duration);
    if (isNaN(dur)) dur = 0;
    // Se maggiore di 5, si presume siano minuti (es. 30). Se minore, ore (es. 0.5 = 30min).
    const durationInMinutes = dur > 5 ? dur : dur * 60;

    const kcal = Number(entry.kcal ?? entry.cal ?? 0);

    // 3. Soglia di intensità VERA per affaticare il Sistema Nervoso Centrale:
    // Un'attività sotto le 250 kcal o sotto i 35 minuti NON distrugge il SNC, è scarico attivo.
    if (kcal > 0 && kcal < 250 && durationInMinutes < 35) return false;
    if (kcal === 0 && durationInMinutes < 35) return false;

    return true;
  };

  if ((manualNodes || []).some(isHeavySncWorkout)) return true;
  if ((log || []).some(isHeavySncWorkout)) return true;

  // ELIMINATO: Rimossa completamente la ricerca dei tag testuali ('allenamento')
  // sui cibi e sulle note generiche che causava il 90% dei falsi positivi.
  return false;
}

/** Sonno "pessimo" o sotto 6h → +1 punto sul carico (opzionale in computeAccumuloSNC). */
function daySleepAddsStressLoad(sleepEntry) {
  if (!sleepEntry) return false;
  const h = Number(
    sleepEntry.hours ?? sleepEntry.duration ?? sleepEntry.sleepHours ?? sleepEntry.sleepDuration ?? 0
  );
  if (h > 0 && h < 6) return true;
  const q = String(sleepEntry.quality ?? sleepEntry.sleepQuality ?? sleepEntry.rating ?? '').toLowerCase();
  return q.includes('pess');
}

/**
 * Accumulo stress SNC (carico allostatico) 0–100 dall'ultimo `daysBack` giorni di storico Firebase.
 * Scarico incrementale: più giorni di riposo consecutivi, più reset rapido.
 * @param {Record<string, { log?: unknown, manualNodes?: unknown[] }>} trackerData - tracker_data (chiavi trackerStorico_YYYY-MM-DD)
 * @param {number} [daysBack=60]
 */
function computeAccumuloSNC(trackerData, daysBack = 60) {
  if (!trackerData || typeof trackerData !== 'object') return 0;
  const today = getTodayString();
  const n = Math.max(1, Math.min(366, Number(daysBack) || 60));
  let accumulo = 0;
  let restDaysStreak = 0;

  for (let back = n - 1; back >= 0; back--) {
    const dateStr = addDays(today, -back);
    const key = TRACKER_STORICO_KEY(dateStr);
    const node = trackerData[key];
    const rawLog = node?.log;
    const manualNodes = Array.isArray(node?.manualNodes) ? node.manualNodes : [];
    const log = normalizeLogData(Array.isArray(rawLog) ? rawLog : rawLog != null ? Object.values(rawLog) : []);

    if (dayHasTrainingFromLogs(log, manualNodes)) {
      accumulo = Math.min(100, accumulo + 4);
      restDaysStreak = 0;
    } else {
      restDaysStreak += 1;
      // Recupero incrementale: più riposi consecutivamente, più il SNC si resetta in fretta
      if (restDaysStreak === 1) {
        accumulo = Math.max(0, accumulo - 2.5);
      } else if (restDaysStreak === 2) {
        accumulo = Math.max(0, accumulo - 5.0);
      } else {
        // Dal 3° giorno scatta il Deep Flush (Settimana di scarico)
        accumulo = Math.max(0, accumulo - 10.0);
      }
    }

    const sleepEntry = log.find(e => e && (e.type === 'sleep' || isSleepEntry(e)));
    if (daySleepAddsStressLoad(sleepEntry)) {
      accumulo = Math.min(100, accumulo + 1);
    }

    manualNodes.forEach(n => {
      if (n?.type === 'alcohol') {
        const g = Number(n.pureAlcohol);
        const pure = Number.isFinite(g) && g > 0 ? g : getPureAlcoholGrams(n);
        accumulo = Math.min(100, accumulo + pure * 0.15);
      }
    });
  }

  return Math.max(0, Math.min(100, accumulo));
}

/** Normalizza log da formato vecchio (meal/items, single, workout) a lista piatta. */
function normalizeLogData(rawLog) {
  const out = [];
  (rawLog || []).forEach(entry => {
    if (entry.type === 'meal') {
      const mealType = inferMealType(entry);
      (entry.items || []).forEach(subItem => {
        const itemType = subItem.type === 'recipe' ? 'recipe' : 'food';
        out.push({
          ...subItem, type: itemType, mealType,
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
    } else if (isSleepEntry(entry)) {
      out.push(normalizeSleepEntry(entry));
    } else {
      out.push({ ...entry, kcal: entry.kcal ?? entry.cal ?? 0 });
    }
  });
  return out;
}

/** Ricostruisce la struttura a "cartelle" (meal/items) per Firebase a partire dal dailyLog piatto. */
const MEAL_ORDER_SAVE = ['colazione', 'snack', 'pranzo', 'cena', 'merenda1', 'merenda_am', 'merenda_pm', 'merenda2'];

const MEAL_LABELS_SAVE = {
  colazione: 'Colazione',
  merenda1: 'Colazione',
  snack: 'Snack',
  merenda_am: 'Snack',
  merenda_pm: 'Snack',
  merenda2: 'Snack',
  spuntino: 'Snack',
  pranzo: 'Pranzo',
  cena: 'Cena',
};

/** Quattro pasti ufficiali (id salvati nel diario). */
export const MEAL_TYPES = [
  { id: 'colazione', label: 'Colazione' },
  { id: 'snack', label: 'Snack' },
  { id: 'pranzo', label: 'Pranzo' },
  { id: 'cena', label: 'Cena' },
];

/** Pasti proteici massimi al giorno (colazione esclusa dal conteggio). */
const PROTEIN_MEALS_PER_DAY = 4;

const BREAKFAST_KCAL_RATIO = 0.22;

/** Somma macro su tutti food/ricette del log (il chiamante può già aver escluso lo slot in editing). */
function sumMacroAllFood(log, macro) {
  const L = log || [];
  let s = 0;
  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (!e || (e.type !== 'food' && e.type !== 'recipe')) continue;
    if (macro === 'kcal') s += Number(e.kcal ?? e.cal) || 0;
    else if (macro === 'prot') s += Number(e.prot ?? e.proteine) || 0;
    else if (macro === 'carb') s += Number(e.carb ?? e.carboidrati) || 0;
    else if (macro === 'fat') s += Number(e.fatTotal ?? e.fat ?? e.grassi) || 0;
    else if (macro === 'fibre') s += Number(e.fibre) || 0;
  }
  return s;
}

/** Conta i pasti già registrati oggi diversi dalla colazione (slot distinti per mealType + mealTime). */
function countLoggedProteinMealSlots(log) {
  const seen = new Set();
  for (const e of log || []) {
    if (!e || (e.type !== 'food' && e.type !== 'recipe')) continue;
    const mt = String(e.mealType || 'pasto');
    const base = mt.split('_')[0];
    if (toCanonicalMealType(base) === 'colazione') continue;
    const t = typeof e.mealTime === 'number' && !Number.isNaN(e.mealTime) ? e.mealTime : 'na';
    seen.add(`${mt}|${t}`);
  }
  return seen.size;
}

/**
 * Target macro: colazione con proteine fisse 15 g (fuori dal pool degli slot proteici).
 * Altri pasti: 4 «gettoni» proteici al giorno; slot rimanenti = max(1, 4 − pasti già loggati non-colazione).
 * Proteine = (Tprot − assunto totale inclusa colazione) / slotRimanenti. Kcal/carb/grassi/fibre sui residui con blend:
 * più carb a cena (isCena), più grassi a pranzo (isPranzo), snack intermedio.
 */
export function getDynamicMealTargets(currentMealType, dailyLog, userTargets, options = {}) {
  void options;
  const log = Array.isArray(dailyLog) ? dailyLog : [];

  const Tkcal = Number(userTargets?.kcal ?? 2000) || 2000;
  const Tprot = Number(userTargets?.prot ?? 150) || 150;
  const Tcarb = Number(userTargets?.carb ?? 200) || 200;
  const Tfat = Number(userTargets?.fatTotal ?? userTargets?.fat ?? 60) || 60;
  const Tfibre = Number(userTargets?.fibre ?? 30) || 30;

  const baseMt = String(currentMealType || 'pranzo').split('_')[0];
  const canon = toCanonicalMealType(baseMt);

  if (canon === 'colazione') {
    const rkcal = Tkcal * BREAKFAST_KCAL_RATIO;
    return {
      kcal: Math.round(rkcal),
      prot: 15,
      carb: Math.round(Tcarb * BREAKFAST_KCAL_RATIO * 10) / 10,
      fat: Math.round(Tfat * BREAKFAST_KCAL_RATIO * 10) / 10,
      fibre: Math.max(2, Math.round(Tfibre * BREAKFAST_KCAL_RATIO * 10) / 10),
    };
  }

  const pastiGiaFatti = countLoggedProteinMealSlots(log);
  const remainingSlots = Math.max(1, PROTEIN_MEALS_PER_DAY - pastiGiaFatti);

  const consumedKcal = sumMacroAllFood(log, 'kcal');
  const consumedProt = sumMacroAllFood(log, 'prot');
  const consumedCarb = sumMacroAllFood(log, 'carb');
  const consumedFat = sumMacroAllFood(log, 'fat');
  const consumedFibre = sumMacroAllFood(log, 'fibre');

  const remKcal = Tkcal - consumedKcal;
  const remProt = Tprot - consumedProt;
  const remCarb = Tcarb - consumedCarb;
  const remFat = Tfat - consumedFat;
  const remFibre = Tfibre - consumedFibre;

  let targetKcal = Math.round(remKcal / remainingSlots);
  targetKcal = Math.max(150, targetKcal);

  const rawProtTarget = remProt / remainingSlots;
  let targetProt = Math.round(rawProtTarget * 10) / 10;
  if (consumedProt >= Tprot) {
    targetProt = Math.max(20, rawProtTarget);
  } else {
    targetProt = Math.max(10, targetProt);
  }

  const baseCarbResidual = remCarb / remainingSlots;
  const baseFatResidual = remFat / remainingSlots;

  const protKcal = targetProt * 4;
  let remKcalAfterProt = Math.max(80, targetKcal - protKcal);

  const isCena = canon === 'cena';
  const isPranzo = canon === 'pranzo';
  let carbEnergyRatio = 0.42;
  let fatEnergyRatio = 0.36;
  if (isPranzo) {
    carbEnergyRatio = 0.36;
    fatEnergyRatio = 0.44;
  } else if (isCena) {
    carbEnergyRatio = 0.5;
    fatEnergyRatio = 0.24;
  } else {
    carbEnergyRatio = 0.41;
    fatEnergyRatio = 0.38;
  }

  const carbFromKcal = (remKcalAfterProt * carbEnergyRatio) / 4;
  const fatFromKcal = (remKcalAfterProt * fatEnergyRatio) / 9;

  const blend = 0.55;
  const finalCarb = Math.max(
    5,
    Math.round((carbFromKcal * blend + baseCarbResidual * (1 - blend)) * 10) / 10
  );
  const finalFat = Math.max(
    3,
    Math.round((fatFromKcal * blend + baseFatResidual * (1 - blend)) * 10) / 10
  );

  const fibreSlot = Math.max(2, Math.round((remFibre / remainingSlots) * 10) / 10);

  return {
    kcal: targetKcal,
    prot: targetProt,
    carb: finalCarb,
    fat: finalFat,
    fibre: fibreSlot,
  };
}

/** Importanza dinamica dei nodi per vista grafico: quali tipi evidenziare. */
const NODE_IMPORTANCE = {
  percent: ['meal', 'workout', 'cognitive', 'stimulant', 'nap', 'sunlight', 'alcohol'],
  kcal: ['meal', 'workout', 'cognitive', 'alcohol'],
  cortisolo: ['work', 'workout', 'cognitive', 'stimulant', 'meditation', 'alcohol'],
  glicemia: ['meal', 'workout', 'cognitive', 'stimulant'],
  idratazione: ['water', 'workout', 'cognitive', 'stimulant', 'alcohol'],
  digestione: ['meal', 'alcohol'],
  neuro: ['sleep', 'work', 'workout', 'cognitive', 'stimulant', 'nap', 'meditation', 'sunlight', 'alcohol']
};

/** Gerarchia nodi nel modale Spiegazione: primari (focus) vs secondari (sfondo) per grafico. */
const MODAL_NODE_PRIMARY = {
  glicemia: ['meal', 'workout', 'cognitive'],
  cortisolo: ['work', 'workout', 'cognitive', 'stimulant', 'meditation', 'alcohol'],
  neuro: ['work', 'workout', 'cognitive', 'stimulant', 'nap', 'meditation', 'sunlight', 'alcohol'],
  calorieTimeline: ['meal'],
  percent: ['meal', 'workout', 'cognitive', 'stimulant', 'nap', 'sunlight', 'alcohol']
};

/** Icona per tipo nodo (timeline e modale). */
const NODE_TYPE_ICON = {
  meal: '🥗',
  work: '💼',
  workout: '⚡',
  cognitive: '📚',
  water: '💧',
  stimulant: '☕',
  nap: '😴',
  meditation: '🧘',
  supplements: '💊',
  sunlight: '☀️',
  alcohol: '🍷'
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
        sleepStart: entry.sleepStart,
        sleepEnd: entry.sleepEnd,
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
    if (entry.type === 'food' || entry.type === 'recipe' || !entry.type) {
      // Usa il mealType così com'è (può essere 'spuntino' o 'snack')
      const mealType = entry.mealType || 'cena';
      if (!meals[mealType]) meals[mealType] = [];
      const { type, mealType: _, ...rest } = entry;
      const itemType = entry.type === 'recipe' ? 'recipe' : 'food';
      meals[mealType].push({
        ...rest,
        type: itemType,
        kcal: rest.kcal ?? rest.cal ?? 0,
        cal: rest.cal ?? rest.kcal ?? 0
      });
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

function sleepHoursFromEntry(e) {
  if (!e || e.type !== 'sleep') return null;
  const h = Number(e.hours ?? e.duration ?? e.sleepHours);
  if (!Number.isFinite(h) || h <= 0) return null;
  return h;
}

/** Soglia ore: sotto = sonnellino, da qui in su = sonno notturno principale. */
const NIGHT_SLEEP_MIN_HOURS = 3;

/**
 * Tra le entry type sleep, sceglie il sonno principale: durata >= NIGHT_SLEEP_MIN_HOURS, la più lunga.
 * Sonnellini puri (< 3 h) non competono come "notte".
 */
function pickMainNightSleepEntry(sleepEntries) {
  if (!sleepEntries || sleepEntries.length === 0) return null;
  let best = null;
  let bestH = -1;
  for (const e of sleepEntries) {
    if (!e || e.type !== 'sleep') continue;
    const h = sleepHoursFromEntry(e);
    if (h != null && h >= NIGHT_SLEEP_MIN_HOURS && h > bestH) {
      bestH = h;
      best = e;
    }
  }
  return best;
}

function sumFoodKcalFromLogForBattery(log) {
  let total = 0;
  for (const e of log || []) {
    if (!e) continue;
    if (e.type === 'food' || e.type === 'recipe' || e.type === 'meal') {
      total += Number(e.kcal ?? e.cal ?? 0) || 0;
    }
  }
  return total;
}

/** Stesso criterio di getYesterdayCalorieStatus (ieri vs 0.9× TDEE), senza dipendenza circolare. */
function yesterdayCalorieDeficit(fullHistory, anchorDateStr, userTargets) {
  if (!userTargets || typeof fullHistory !== 'object') return false;
  const tdee = Number(userTargets?.kcal);
  if (!Number.isFinite(tdee) || tdee <= 0) return false;
  const anchor = anchorDateStr && String(anchorDateStr).trim() ? String(anchorDateStr).slice(0, 10) : getTodayString();
  const yLog = getLogFromStoricoTree(fullHistory, addDays(anchor, -1)) || [];
  const kcal = sumFoodKcalFromLogForBattery(yLog);
  return kcal < tdee * 0.9;
}

/**
 * Curva fisiologica del boost da sonnellino (interpolazione lineare a tratti, massimo 30).
 * @param {number} minutes Durata del sonnellino in minuti.
 * @returns {number} Punti boost (prima di eventuale arrotondamento nel chiamante).
 */
export function calculateNapBoost(minutes) {
  const t = Number(minutes);
  if (!Number.isFinite(t) || t <= 0) return 0;
  if (t <= 20) return (10 / 20) * t;
  if (t <= 30) return 10 + ((15 - 10) / (30 - 20)) * (t - 20);
  if (t <= 50) return 15 + ((8 - 15) / (50 - 30)) * (t - 30);
  if (t <= 90) return 8 + ((30 - 8) / (90 - 50)) * (t - 50);
  return 30;
}

/**
 * Body Battery: debito sonno, partenza da sonno notturno, decadimento dalle 7:00, pasti (max 3), allenamenti, sonnellini (boost da curva sui minuti).
 * @param {object} [userTargets] — se presente, ieri in deficit calorico aumenta il costo workout (−30 vs −20).
 * @returns {{ currentEnergy: number, maxCapacity: number, hasNapBoost: boolean, breakdown: Array<{ label: string, value: number, type: 'positive'|'negative'|'neutral' }> }}
 */
export function calculateBodyBattery(fullHistory, anchorDate, activeLog, userTargets) {
  const breakdown = [];
  const anchor = anchorDate && String(anchorDate).trim() ? String(anchorDate).slice(0, 10) : getTodayString();
  const log = Array.isArray(activeLog) ? activeLog : [];
  const deficitYesterday = yesterdayCalorieDeficit(fullHistory, anchor, userTargets);
  const workoutPenalty = deficitYesterday ? 30 : 20;

  const isToday = anchor === getTodayString();
  let nowDec;
  if (isToday) {
    const d = new Date();
    nowDec = d.getHours() + d.getMinutes() / 60;
  } else {
    nowDec = 24;
  }

  let sumPast = 0;
  let countPast = 0;
  for (let i = 1; i <= 3; i++) {
    const dStr = addDays(anchor, -i);
    const dayLog = getLogFromStoricoTree(fullHistory, dStr) || [];
    const sleeps = dayLog.filter((e) => e && e.type === 'sleep');
    const main = pickMainNightSleepEntry(sleeps);
    const h = main ? sleepHoursFromEntry(main) : null;
    if (h != null) {
      sumPast += h;
      countPast += 1;
    }
  }

  let maxCapacity = 100;
  if (countPast > 0) {
    const avgSleep = sumPast / countPast;
    if (avgSleep < 7) {
      maxCapacity = Math.max(70, 100 - (7 - avgSleep) * 10);
    }
  }
  maxCapacity = Math.round(maxCapacity);

  const debtVal = maxCapacity - 100;

  const sleepEntries = log.filter((e) => e && e.type === 'sleep');
  const mainNight = pickMainNightSleepEntry(sleepEntries);
  const nightHours = mainNight ? sleepHoursFromEntry(mainNight) : null;

  /** Senza sonno notturno (≥3 h) nel log odierno: partenza solo da maxCapacity (debito 3 notti), senza fallback ieri né stima 7 h. */
  let startEnergy = maxCapacity;
  if (nightHours != null && nightHours < 7) {
    startEnergy = maxCapacity - (7 - nightHours) * 10;
  }
  startEnergy = Math.round(Math.min(maxCapacity, Math.max(5, startEnergy)));

  const hoursFromSeven = isToday ? Math.max(0, nowDec - 7) : Math.max(0, 24 - 7);
  const basalDrain = hoursFromSeven * 1.5;
  const basalRounded = Math.round(basalDrain * 10) / 10;

  const mealItems = [];
  for (const item of log) {
    if (!item || (item.type !== 'food' && item.type !== 'recipe')) continue;
    if (isToday) {
      const t = Number(item.mealTime ?? item.time);
      if (Number.isFinite(t) && t > nowDec) continue;
    }
    mealItems.push(item);
    if (mealItems.length >= 3) break;
  }
  const mealCount = mealItems.length;
  const mealDrain = mealCount * 5;
  const totalMealCost = mealDrain;

  const workouts = [];
  for (const i of log) {
    if (!i || (i.type !== 'workout' && i.type !== 'work')) continue;
    if (isToday) {
      const t = Number(i.mealTime ?? i.time);
      if (Number.isFinite(t) && t > nowDec) continue;
    }
    workouts.push(i);
  }
  const workoutDrain = workouts.length * workoutPenalty;

  const napBreakdownRows = [];
  let napGain = 0;
  sleepEntries.forEach((entry) => {
    const rawH = entry.hours ?? entry.duration ?? entry.sleepHours ?? 0;
    const durH =
      typeof rawH === 'string' && String(rawH).trim() !== ''
        ? Number(String(rawH).trim().replace(',', '.'))
        : Number(rawH);
    if (!Number.isFinite(durH) || durH <= 0 || durH >= NIGHT_SLEEP_MIN_HOURS) return;
    const napMinutes = durH * 60;
    const boost = Math.round(calculateNapBoost(napMinutes));
    console.log('KENTU DEBUG - Sonnellino processato:', { durH, napMinutes, boost });
    if (boost <= 0) return;
    napGain += boost;
    napBreakdownRows.push({
      label: `Sonnellino (${Math.round(napMinutes)}m)`,
      value: Math.abs(boost),
      type: 'positive',
    });
  });

  breakdown.push({
    label: 'Ricarica Notturna',
    value: Math.round(startEnergy),
    type: 'positive',
  });
  breakdown.push({
    label: 'Debito sonno (media 3 notti)',
    value: Math.round(debtVal * 10) / 10,
    type: debtVal < 0 ? 'negative' : 'neutral',
  });
  breakdown.push({
    label: 'Tempo sveglio',
    value: -Math.abs(basalRounded),
    type: 'negative',
  });
  if (mealCount > 0) {
    breakdown.push({
      label: `Costo digestivo (${mealCount} pasti)`,
      value: -Math.abs(totalMealCost),
      type: 'negative',
    });
  }
  workouts.forEach((w, idx) => {
    const name = (w.desc || w.name || `Sessione ${idx + 1}`).toString().trim().slice(0, 24);
    const woLabel =
      deficitYesterday && workoutPenalty === 30
        ? name
          ? `Allenamento · ${name} (deficit ieri)`
          : 'Allenamento (deficit ieri)'
        : name
          ? `Allenamento · ${name}`
          : 'Allenamento';
    breakdown.push({
      label: woLabel,
      value: -Math.abs(workoutPenalty),
      type: 'negative',
    });
  });
  breakdown.push(...napBreakdownRows);

  let preNapEnergy = startEnergy - basalDrain - mealDrain - workoutDrain;
  preNapEnergy = Math.round(preNapEnergy * 10) / 10;
  preNapEnergy = Math.min(maxCapacity, Math.max(5, preNapEnergy));
  let finalEnergy = Math.round(preNapEnergy + napGain);
  finalEnergy = Math.max(5, finalEnergy);
  if (napGain <= 0) {
    finalEnergy = Math.min(100, finalEnergy);
  }
  const currentEnergy = finalEnergy;

  return {
    currentEnergy,
    maxCapacity,
    hasNapBoost: napGain > 0,
    breakdown,
  };
}

/** Log diario + nodi timeline (acqua, alcol, …) per un giorno del tracker. */
export function getCombinedDayLogAndManualNodes(trackerData, dateStr) {
  if (!trackerData || typeof trackerData !== 'object' || !dateStr) return [];
  const log = normalizeLogData(getLogFromStoricoTree(trackerData, dateStr) || []);
  const node = trackerData[TRACKER_STORICO_KEY(dateStr)];
  const manual = Array.isArray(node?.manualNodes) ? node.manualNodes : [];
  return [...log, ...manual];
}

/** Keyword italiane (e comuni) per intercettare alcol in nome/descrizione senza campo dedicato. */
export const alcoholKeywords = [
  'vino',
  'birra',
  'cocktail',
  'spritz',
  'amaro',
  'vodka',
  'gin',
  'rum',
  'prosecco',
  'champagne',
  'liquore',
];

function alcoholSearchTextFromNode(node) {
  if (!node || typeof node !== 'object') return '';
  const parts = [
    node.desc,
    node.name,
    node.label,
    node.foodName,
    node.title,
    node.nome,
  ];
  return parts
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => String(x).toLowerCase())
    .join(' ');
}

/** Prima keyword trovata in `text` (substring), o null. */
export function matchAlcoholKeyword(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return null;
  for (let k = 0; k < alcoholKeywords.length; k++) {
    const kw = alcoholKeywords[k];
    if (t.includes(kw)) return kw;
  }
  return null;
}

/**
 * Stima grammi etanolo da voce food/recipe/meal-item quando manca pureAlcohol.
 * Birra: ~1–1,25 unità UK / 330 ml se non c’è ABV (default 5%).
 */
function estimatePureAlcoholGramsFromFoodLikeNode(node, matchedKw) {
  if (!node) return 0;
  const pa = Number(node.pureAlcohol ?? node.ethanolG ?? node.alcoholG);
  if (Number.isFinite(pa) && pa > 0) return pa;

  let ml = Number(node.ml ?? node.volume ?? node.volumeMl) || 0;
  let abv = Number(node.abv ?? node.alcoholPercent) || 0;
  if (ml > 0 && abv > 0) return ml * (abv / 100) * 0.8;

  const kcal = Number(node.kcal ?? node.cal) || 0;
  if (kcal > 0) return kcal / 7;

  const qty = Number(node.grams ?? node.g ?? node.quantity ?? node.portionG ?? node.weight ?? node.portion) || 0;
  const qtyLooksLikeMl = qty >= 40 && qty <= 2500;

  if (matchedKw === 'birra') {
    const beerMl = ml > 0 ? ml : qtyLooksLikeMl ? qty : 330;
    const effAbv = abv > 0 ? abv : 5;
    return beerMl * (effAbv / 100) * 0.8;
  }
  if (matchedKw === 'vino' || matchedKw === 'prosecco' || matchedKw === 'champagne') {
    const wineMl = ml > 0 ? ml : qtyLooksLikeMl ? qty : 150;
    const effAbv = abv > 0 ? abv : 12;
    return wineMl * (effAbv / 100) * 0.8;
  }
  if (
    matchedKw === 'vodka' ||
    matchedKw === 'gin' ||
    matchedKw === 'rum' ||
    matchedKw === 'amaro' ||
    matchedKw === 'liquore'
  ) {
    const spiritMl = ml > 0 ? ml : qtyLooksLikeMl ? Math.min(qty, 100) : 45;
    const effAbv = abv > 0 ? abv : 38;
    return spiritMl * (effAbv / 100) * 0.8;
  }
  if (matchedKw === 'cocktail' || matchedKw === 'spritz') {
    const mixMl = ml > 0 ? ml : qtyLooksLikeMl ? qty : 200;
    const effAbv = abv > 0 ? abv : 14;
    return mixMl * (effAbv / 100) * 0.8;
  }
  /* Keyword generica: consumo forfettario ~1,25 unità UK */
  return 1.25 * 8;
}

const LEGACY_ALCOHOL_DESC_RE =
  /\b(birra|vino|vodka|whisky|whiskey|rum|gin|cocktail|prosecco|spritz|spumante|champagne|alcol|superalcol)\b/i;

function addAlcoholFromFoodLikeNode(node, addG) {
  const text = alcoholSearchTextFromNode(node);
  let kw = matchAlcoholKeyword(text);
  if (!kw && LEGACY_ALCOHOL_DESC_RE.test(text)) {
    if (/\bbirra\b/i.test(text)) kw = 'birra';
    else if (/\bvino\b|\bprosecco\b|\bspumante\b|\bchampagne\b/i.test(text)) kw = 'vino';
    else if (/\brum\b|\bgin\b|\bvodka\b/i.test(text)) kw = 'rum';
    else if (/\bcocktail\b|\bspritz\b/i.test(text)) kw = 'cocktail';
    else kw = 'liquore';
  }
  if (!kw) return;
  const est = estimatePureAlcoholGramsFromFoodLikeNode(node, kw);
  if (est > 0) addG(est);
}

/**
 * Grammi di etanolo puro nel giorno: `type: 'alcohol'`, pasti con `items`, food/recipe con keyword IT + euristica volumi.
 */
export function sumPureAlcoholGramsForDay(trackerData, dateStr) {
  const items = getCombinedDayLogAndManualNodes(trackerData, dateStr);
  let g = 0;
  const addG = (x) => {
    const n = Number(x);
    if (Number.isFinite(n) && n > 0) g += n;
  };

  for (let i = 0; i < items.length; i++) {
    const node = items[i];
    if (!node) continue;

    if (node.type === 'alcohol') {
      const pa = Number(node.pureAlcohol);
      if (Number.isFinite(pa) && pa > 0) {
        addG(pa);
        continue;
      }
      const ml = Number(node.ml) || 0;
      const abv = Number(node.abv) || 0;
      if (ml > 0 && abv > 0) addG(ml * (abv / 100) * 0.8);
      else {
        const kw = matchAlcoholKeyword(alcoholSearchTextFromNode(node)) || 'liquore';
        addG(estimatePureAlcoholGramsFromFoodLikeNode(node, kw));
      }
      continue;
    }

    if (node.type === 'meal') {
      if (Array.isArray(node.items) && node.items.length > 0) {
        for (let j = 0; j < node.items.length; j++) {
          const sub = node.items[j];
          if (!sub) continue;
          if (sub.type === 'food' || sub.type === 'recipe' || sub.type === 'single' || !sub.type) {
            addAlcoholFromFoodLikeNode(sub, addG);
          }
        }
      } else {
        addAlcoholFromFoodLikeNode(node, addG);
      }
      continue;
    }

    if (node.type === 'food' || node.type === 'recipe' || node.type === 'single' || !node.type) {
      addAlcoholFromFoodLikeNode(node, addG);
    }
  }
  return g;
}

/** ~8 g etanolo = 1 unità alcolica (UK). */
export function pureAlcoholGramsToUkUnits(grams) {
  const x = Number(grams);
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.round((x / 8) * 10) / 10;
}

/**
 * Valore "Ricarica Notturna" dalla Body Battery (proxy energia al mattino dopo il sonno registrato quel giorno).
 */
export function getMorningRechargeFromBodyBattery(trackerData, dateStr, userTargets) {
  const combined = getCombinedDayLogAndManualNodes(trackerData, dateStr);
  const bb = calculateBodyBattery(trackerData, dateStr, combined, userTargets);
  const row = bb.breakdown?.find((b) => String(b.label || '').includes('Ricarica Notturna'));
  if (row != null && Number.isFinite(Number(row.value))) return Math.round(Number(row.value) * 10) / 10;
  const ce = Number(bb.currentEnergy);
  return Number.isFinite(ce) ? ce : null;
}

/**
 * Ultimo pasto “effettivo” per la Training Wave: macro aggregate e ore da quel pasto a `currentTimeDecimal`.
 */
export function getLastMealMacrosForTrainingWave(trackerData, anchorDateStr, currentTimeDecimal) {
  const ct = Number(currentTimeDecimal);
  if (!trackerData || !anchorDateStr || !Number.isFinite(ct)) {
    return { kcal: 0, carb: 0, fat: 0, hoursSinceMeal: 8, mealTime: null, fromYesterday: false };
  }

  const todayLog = normalizeLogData(getLogFromStoricoTree(trackerData, anchorDateStr) || []);
  const todayFoods = todayLog.filter(
    (i) =>
      (i.type === 'food' || i.type === 'recipe') &&
      typeof i.mealTime === 'number' &&
      !Number.isNaN(i.mealTime) &&
      i.mealTime <= ct
  );
  todayFoods.sort((a, b) => b.mealTime - a.mealTime);

  if (todayFoods.length > 0) {
    const lastT = todayFoods[0].mealTime;
    const bucket = todayFoods.filter((i) => Math.abs(i.mealTime - lastT) < 0.02);
    let kcal = 0;
    let carb = 0;
    let fat = 0;
    bucket.forEach((i) => {
      kcal += Number(i.kcal ?? i.cal) || 0;
      carb += Number(i.carb ?? i.carboidrati) || 0;
      fat += Number(i.fatTotal ?? i.fat ?? i.grassi) || 0;
    });
    return {
      kcal,
      carb,
      fat,
      hoursSinceMeal: Math.max(0, ct - lastT),
      mealTime: lastT,
      fromYesterday: false,
    };
  }

  const prevStr = addDays(anchorDateStr, -1);
  const yNode = trackerData[TRACKER_STORICO_KEY(prevStr)];
  const rawY = yNode?.log ?? yNode?.dati?.log;
  const yLog = normalizeLogData(Array.isArray(rawY) ? rawY : Object.values(rawY || {}));
  const yFoods = yLog.filter((i) => i.type === 'food' || i.type === 'recipe');
  let maxT = -1;
  yFoods.forEach((m) => {
    const t = yNode?.mealTimes?.[m.mealType] ?? m.mealTime ?? 20;
    if (t > maxT) maxT = t;
  });
  if (maxT < 0) {
    return { kcal: 0, carb: 0, fat: 0, hoursSinceMeal: Math.min(18, ct + 6), mealTime: null, fromYesterday: false };
  }
  const bucket = yFoods.filter((m) => {
    const t = yNode?.mealTimes?.[m.mealType] ?? m.mealTime ?? 20;
    return Math.abs(t - maxT) < 0.02;
  });
  let kcal = 0;
  let carb = 0;
  let fat = 0;
  bucket.forEach((i) => {
    kcal += Number(i.kcal ?? i.cal) || 0;
    carb += Number(i.carb ?? i.carboidrati) || 0;
    fat += Number(i.fatTotal ?? i.fat ?? i.grassi) || 0;
  });
  const hoursSinceMeal = 24 - maxT + ct;
  return {
    kcal,
    carb,
    fat,
    hoursSinceMeal: Math.max(0, hoursSinceMeal),
    mealTime: maxT,
    fromYesterday: true,
  };
}

/** Ora del giorno in ore decimali [0,24) da somma base + delta. */
function normalizeDayClockHours(hours) {
  let x = Number(hours);
  if (!Number.isFinite(x)) return 0;
  x = (x % 24) + 24;
  if (x >= 24) x %= 24;
  return x;
}

/** Formato HH:mm (24h) da ore di orologio decimali. */
export function decimalHoursToHHmmIt(clockDec) {
  const t = normalizeDayClockHours(clockDec);
  let totalMin = Math.round(t * 60);
  if (totalMin < 0) totalMin = 0;
  if (totalMin >= 24 * 60) totalMin = 24 * 60 - 1;
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Training Wave: prossime 4 ore — digestione (log), glicemia (campana CHO), neuro (veglia + stress + cortisolo serale).
 * Finestra ottimale: digestionLoad < 30% e glucoseAvailability > 60% e neuro “safe”.
 */
export function getTrainingWaveCurves(lastMeal, currentTime, options = {}) {
  let ct = Number(currentTime);
  if (!Number.isFinite(ct)) ct = 12;
  const wakeHour = Number(options.wakeHour);
  const wake = Number.isFinite(wakeHour) ? wakeHour : 7;
  const stressLoad = Math.max(0, Math.min(100, Number(options.stressLoad) || 0));
  const steps = Math.max(9, Math.min(49, Number(options.steps) || 25));
  const cortisolEveningAmp = Number(options.cortisolEveningAmp);
  const eveningAmp = Number.isFinite(cortisolEveningAmp) ? cortisolEveningAmp : 0.38;

  const lm = lastMeal && typeof lastMeal === 'object' ? lastMeal : {};
  const kcal = Math.max(0, Number(lm.kcal) || 0);
  const carb = Math.max(0, Number(lm.carb) || 0);
  const fat = Math.max(0, Number(lm.fat) || 0);
  const hoursSinceMealBase = Math.max(0, Number(lm.hoursSinceMeal) || 0);

  const mealHeaviness = 1 + (kcal / 520) * 0.42 + (fat / 45) * 0.55;
  const digestionTau = 0.95 * mealHeaviness;

  const durationHours = 4;
  const series = [];
  const digestionLoadArr = [];
  const glucoseAvailabilityArr = [];
  const neuroReadinessArr = [];

  for (let i = 0; i < steps; i++) {
    const deltaHours = (durationHours * i) / (steps - 1);
    const hSince = hoursSinceMealBase + deltaHours;

    const denom = Math.log(1 + 4 / Math.max(0.12, digestionTau));
    const logRatio = Math.log(1 + Math.max(0.02, hSince) / Math.max(0.12, digestionTau)) / denom;
    let digestionLoad = 100 * Math.max(0, Math.min(1, 1 - 0.94 * logRatio));
    if (hSince < 0.06) digestionLoad = Math.max(digestionLoad, 95);
    digestionLoad = Math.max(0, Math.min(100, digestionLoad));

    const carbRef = Math.max(8, carb);
    const peakH = 0.75 + Math.min(2.1, carbRef / 85);
    const sigma = 0.65 + carbRef / 110;
    const bell = Math.exp(-0.5 * ((hSince - peakH) / sigma) ** 2);
    const carbScale = Math.min(1, carbRef / 28);
    let glucoseAvailability =
      100 * bell * carbScale + (1 - carbScale) * Math.max(0, 48 - hSince * 6.5);
    glucoseAvailability = Math.max(0, Math.min(100, glucoseAvailability));

    const tClock = normalizeDayClockHours(ct + deltaHours);
    let hoursAwake = tClock - wake;
    if (hoursAwake < 0) hoursAwake += 24;
    let neuroReadiness = 100 - hoursAwake * 3.8 - stressLoad * 0.32;
    if (tClock >= 18 && tClock <= 23.5) {
      neuroReadiness -= (tClock - 18) * eveningAmp * 7.5;
    }
    neuroReadiness -= stressLoad * 0.22;
    neuroReadiness = Math.max(0, Math.min(100, neuroReadiness));

    const neuroGateUnsafe = neuroReadiness < 40 || stressLoad > 72;
    const inSweetSpot =
      digestionLoad < 30 && glucoseAvailability > 60 && !neuroGateUnsafe;

    const labelMin = Math.round(deltaHours * 60);
    const row = {
      deltaHours,
      label: labelMin <= 0 ? 'Ora' : `+${labelMin}m`,
      hourClock: tClock,
      digestionLoad,
      glucoseAvailability,
      neuroReadiness,
      neuroGateUnsafe,
      inSweetSpot,
    };
    series.push(row);
    digestionLoadArr.push(digestionLoad);
    glucoseAvailabilityArr.push(glucoseAvailability);
    neuroReadinessArr.push(neuroReadiness);
  }

  const now = series[0];
  const futureSweet = series.some((r, idx) => idx > 0 && r.inSweetSpot);
  let waveState = 'Missed';
  if (now.inSweetSpot) waveState = 'Optimal';
  else if (futureSweet) waveState = 'Wait';

  let crestIndex = 0;
  let bestG = -1;
  series.forEach((r, idx) => {
    if (r.glucoseAvailability > bestG) {
      bestG = r.glucoseAvailability;
      crestIndex = idx;
    }
  });

  let firstSweet = -1;
  let lastSweet = -1;
  for (let i = 0; i < series.length; i++) {
    if (series[i].inSweetSpot) {
      if (firstSweet < 0) firstSweet = i;
      lastSweet = i;
    }
  }
  let windowStartStr = '';
  let windowEndStr = '';
  if (firstSweet >= 0 && lastSweet >= 0) {
    windowStartStr = decimalHoursToHHmmIt(series[firstSweet].hourClock);
    windowEndStr = decimalHoursToHHmmIt(series[lastSweet].hourClock);
  }

  return {
    series,
    digestionLoad: digestionLoadArr,
    glucoseAvailability: glucoseAvailabilityArr,
    neuroReadiness: neuroReadinessArr,
    waveState,
    crestIndex,
    surfDeltaHours: series[crestIndex]?.deltaHours ?? 0,
    windowStartStr,
    windowEndStr,
    nowSnapshot: {
      digestionLoad: now.digestionLoad,
      glucoseAvailability: now.glucoseAvailability,
      neuroReadiness: now.neuroReadiness,
      neuroGateUnsafe: now.neuroGateUnsafe,
      inSweetSpot: now.inSweetSpot,
    },
  };
}

/** Riga testuale per [CONTEXT_LIVE] — finestra oraria ideale (prossime 4h del modello). */
export function buildTrainingWaveContextSnippet(waveResult) {
  if (!waveResult) return '';
  const a = String(waveResult.windowStartStr || '').trim();
  const b = String(waveResult.windowEndStr || '').trim();
  if (a && b) return `Finestra allenamento ideale: dalle ${a} alle ${b}.`;
  return 'Finestra allenamento ideale: Domani.';
}

/**
 * Valutazioni a stelle del report giornaliero (stessa logica della dashboard).
 * Richiede un log normalizzato (es. da activeLog o da getLogFromStoricoTree).
 */
export function computeDayEvaluations(log, userTargets) {
  const L = log || [];
  const foods = L.filter(e => e.type === 'food');
  const hasStrengthWorkout = L.some(t => {
    if (t.type !== 'workout') return false;
    const sub = (t.subType ?? t.workoutType ?? '').toLowerCase();
    return sub === 'pesi' || sub === 'hiit';
  });

  const totali = computeTotali(L);
  const proTotal = totali?.prot ?? 0;
  const proTarget = userTargets?.prot ?? 150;
  const kcalTotal = totali?.kcal ?? 0;
  const kcalTarget = userTargets?.kcal ?? 2000;
  const choTotal = totali?.carb ?? 0;
  const choTarget = userTargets?.carb ?? 200;

  const bySlot = {};
  foods.forEach(f => {
    const slot = getSlotKey(f) || f.mealType || 'other';
    if (!bySlot[slot]) bySlot[slot] = 0;
    bySlot[slot] += Number(f.prot ?? f.pro ?? 0) || 0;
  });
  const highProMeals = Object.values(bySlot).filter(sum => sum >= 20).length;

  let muscleStars = 0;
  let muscleReason = '';
  if (!hasStrengthWorkout) {
    muscleStars = proTotal >= proTarget * 0.9 ? 2 : highProMeals >= 2 ? 1 : 0;
    muscleReason = proTotal >= proTarget * 0.9
      ? 'Pasto proteico ottimo per il mantenimento, ma senza stimolo meccanico (pesi/HIIT) non c\'è crescita.'
      : 'Mancano proteine e stimolo di forza per la crescita muscolare.';
  } else {
    muscleStars = 1;
    if (proTotal >= proTarget) muscleStars += 2;
    else if (proTotal >= proTarget * 0.9) muscleStars += 1;
    if (highProMeals >= 4) muscleStars += 2;
    else if (highProMeals >= 3) muscleStars += 1;
    muscleStars = Math.min(5, Math.max(0, muscleStars));
    if (proTotal < proTarget * 0.9) muscleReason = 'Allenamento intenso, ma mancano i mattoni (proteine) per riparare e costruire le fibre.';
    else if (highProMeals < 4) muscleReason = 'Potenziale alto, ma le proteine sono troppo concentrate. Distribuiscile in 4 pasti per la sintesi costante.';
    else muscleReason = 'Sinergia perfetta tra stimolo meccanico e timing proteico. Crescita massimizzata!';
  }
  muscleStars = Math.min(5, Math.max(0, muscleStars));

  let fatStars = 1;
  if (kcalTotal <= kcalTarget) fatStars += 2;
  if (L.some(t => t.type === 'workout')) fatStars += 1;
  if (choTotal <= choTarget * 1.1) fatStars += 1;
  fatStars = Math.min(5, fatStars);
  let fatReason = '';
  if (kcalTotal > kcalTarget) fatReason = 'Lieve surplus calorico: la lipolisi è stata inibita per favorire l\'accumulo.';
  else if (choTotal > choTarget * 1.1) fatReason = 'Picchi insulinici eccessivi hanno bloccato l\'accesso alle riserve di grasso.';
  else fatReason = 'Calorie e carboidrati sotto controllo: condizioni ideali per la perdita di grasso.';

  const sleepEntry = L.find(e => e.type === 'sleep');
  const sleepHours = sleepEntry?.duration ?? sleepEntry?.hours ?? 0;
  const lateCaffeine = L.some(t => t.type === 'stimulant' && (parseFloat(t.time ?? t.mealTime ?? 0) >= 16));
  const cenaEquiv = getEquivalentMealTypes('cena');
  const dinnerCho = foods.filter(f => cenaEquiv.includes(f.mealType)).reduce((acc, item) => acc + (Number(item.carb ?? item.cho ?? 0) || 0), 0);

  let neuroStars = 0;
  let neuroReason = '';
  if (sleepHours < 7) neuroReason = 'Il riposo breve ha impedito la ricarica completa dei neurotrasmettitori.';
  else if (lateCaffeine) neuroReason = 'La caffeina dopo le 16:00 ha frammentato l\'architettura del tuo sonno profondo.';
  else if (dinnerCho < 40) neuroReason = 'Mancata soppressione del cortisolo serale: il sistema nervoso è rimasto in allerta.';
  if (sleepHours >= 8 && !lateCaffeine && dinnerCho >= 40) { neuroStars = 5; neuroReason = 'Sonno, timing caffeina e CHO a cena ottimali. Recupero neurologico completo.'; }
  else if (sleepHours >= 7) {
    neuroStars = !lateCaffeine ? 4 : 3;
    if (dinnerCho >= 40) neuroStars = Math.min(5, neuroStars + 1);
    neuroStars = Math.min(4, neuroStars);
  } else if (sleepHours >= 6) neuroStars = Math.min(3, (lateCaffeine ? 2 : 3));
  else if (sleepHours > 0) neuroStars = 1;
  neuroStars = Math.min(5, Math.max(0, neuroStars));
  if (!neuroReason) neuroReason = 'Sonno e abitudini serali da ottimizzare.';

  let firstMealTime = 24;
  let lastMealTime = 0;
  foods.forEach(f => {
    const t = parseFloat(f.mealTime ?? f.time ?? 12);
    if (!Number.isNaN(t)) { if (t < firstMealTime) firstMealTime = t; if (t > lastMealTime) lastMealTime = t; }
  });
  const fastingHours = foods.length === 0 ? 24 : (24 - lastMealTime) + firstMealTime;
  let fastStars = 0;
  let fastReason = '';
  if (fastingHours < 12) { fastStars = 0; fastReason = 'Finestra di alimentazione troppo ampia. L\'autofagia (pulizia cellulare) non si è attivata.'; }
  else if (fastingHours < 14) { fastStars = 1; fastReason = 'Finestra di alimentazione troppo ampia. L\'autofagia (pulizia cellulare) non si è attivata.'; }
  else if (fastingHours < 16) { fastStars = 3; fastReason = 'Buon inizio di riciclo cellulare. Il sistema ha iniziato a eliminare le proteine danneggiate.'; }
  else { fastStars = 5; fastReason = 'Protocollo Gold: 16+ ore di digiuno hanno garantito una rigenerazione cellulare profonda.'; }

  return {
    ready: true,
    muscle: { score: muscleStars, reason: muscleReason || 'Stimolo e nutrizione non allineati per la crescita.' },
    fat: { score: fatStars, reason: fatReason },
    neuro: { score: neuroStars, reason: neuroReason || 'Sonno e abitudini serali da ottimizzare.' },
    fast: { score: fastStars, reason: fastReason }
  };
}

function trendStarDelta(stars) {
  const s = Math.max(0, Math.min(5, Math.floor(Number(stars) || 0)));
  if (s >= 5) return 10;
  if (s === 4) return 5;
  if (s === 3) return 0;
  if (s === 2) return -5;
  return -10;
}

/**
 * Trend cumulativo (score sintetico) per una metrica del report sui giorni precedenti (escluso oggi).
 * @param {'muscle'|'fat'|'neuro'|'fast'} metricKey
 */
export function computeEvaluationTrend(trackerData, metricKey, userTargets, daysBack = 14) {
  if (!trackerData || typeof trackerData !== 'object') return [];
  const validKeys = ['muscle', 'fat', 'neuro', 'fast'];
  if (!validKeys.includes(metricKey)) return [];

  const today = getTodayString();
  const n = Math.max(1, Math.min(365, Number(daysBack) || 14));
  let accumulatore = 100;
  const out = [];

  for (let daysAgo = n; daysAgo >= 1; daysAgo--) {
    const dateStr = addDays(today, -daysAgo);
    const log = getLogFromStoricoTree(trackerData, dateStr);
    const hasFood = log.some(e => e.type === 'food');
    const hasWorkout = log.some(e => e.type === 'workout');
    let starScore = 3;
    if (log.length > 0 && (hasFood || hasWorkout)) {
      const evals = computeDayEvaluations(log, userTargets);
      const block = evals[metricKey];
      starScore = typeof block?.score === 'number' ? block.score : 3;
    }
    accumulatore += trendStarDelta(starScore);
    out.push({
      date: dateStr,
      score: accumulatore,
      stars: starScore
    });
  }

  return out;
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
  const mealTypesToStrategy = {
    colazione: 'colazione',
    merenda1: 'colazione',
    snack: 'snack',
    merenda_am: 'snack',
    merenda_pm: 'snack',
    merenda2: 'snack',
    spuntino: 'snack',
    pranzo: 'pranzo',
    cena: 'cena',
  };
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
      if (entry?.type === 'food' || entry?.type === 'recipe') {
        const t = typeof entry.mealTime === 'number' ? entry.mealTime : 12;
        const base = entry.mealType?.split('_')[0];
        const strategyKey = mealTypesToStrategy[base] || toCanonicalMealType(base) || 'cena';
        timelineNodes.push({ type: 'meal', time: t, strategyKey, kcal: entry.kcal ?? entry.cal ?? 0 });
      } else if (entry?.type === 'workout' || entry?.type === 'work') {
        const isCognitive = entry.type === 'workout' && (entry.workoutType === 'studio' || entry.workoutType === 'lavoro_pc');
        timelineNodes.push({ type: isCognitive ? 'cognitive' : 'workout', time: entry.time ?? entry.mealTime ?? 12, duration: entry.duration ?? 1, kcal: entry.kcal ?? entry.cal ?? 300 });
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

/**
 * Master score longevità (0–100) dalla matrice rischi, stessa formula di longevityData in SalaComandi.
 */
export function computeLongevityMasterScoreFromMatrix(matrix) {
  if (!matrix || !matrix.metabolic || typeof matrix.metabolic.score !== 'number') return null;
  const weightedRisk =
    matrix.metabolic.score * 0.3 +
    matrix.neuro.score * 0.3 +
    matrix.inflammatory.score * 0.2 +
    matrix.cardio.score * 0.2;
  return Math.max(0, Math.min(100, Math.round(100 - weightedRisk)));
}

/**
 * Quattro pilastri del rischio sistemico (0–100) sugli ultimi `daysBack` giorni + referti diagnostici.
 * `referenceDate` (YYYY-MM-DD): giorno “finestra” per il loop; default oggi. Con `daysBack: 1` e `referenceDate = addDays(D, 1)` si ottiene la matrice solo per il giorno D.
 */
export function computeRiskMatrix(trackerData, userTargets, daysBack = 7, referenceDate) {
  let risks = { metabolic: 15, cardio: 15, inflammatory: 15, neuro: 15 };
  let validDays = 0;

  const details = { metabolic: [], cardio: [], inflammatory: [], neuro: [] };
  const stats = { totalAlcohol: 0, noFast: 0, goodFast: 0, noWorkout: 0, badMuscle: 0, goodNeuro: 0, badNeuro: 0 };

  const clamp = (val) => Math.max(0, Math.min(100, Math.round(val)));

  const insufficientMatrix = () => {
    const fb = { score: 50, details: ["Dati storici insufficienti per l'analisi."] };
    return { metabolic: fb, cardio: fb, inflammatory: fb, neuro: fb };
  };

  if (!trackerData || typeof trackerData !== 'object') {
    return insufficientMatrix();
  }

  const todayStr = referenceDate || getTodayString();
  const n = Math.max(1, Math.min(366, Number(daysBack) || 7));

  for (let i = n; i >= 1; i--) {
    const dStr = addDays(todayStr, -i);
    const log = getLogFromStoricoTree(trackerData, dStr) || [];
    const dayNode = trackerData[TRACKER_STORICO_KEY(dStr)];
    const manualNodes = Array.isArray(dayNode?.manualNodes) ? dayNode.manualNodes : [];

    if (log.length === 0 && manualNodes.length === 0) continue;
    validDays++;

    const evals = computeDayEvaluations(log, userTargets);

    const dailyAlcohol = [...log, ...manualNodes]
      .filter(node => node.type === 'alcohol')
      .reduce((acc, node) => acc + (node.pureAlcohol || ((node.ml || 0) * ((node.abv || 0) / 100) * 0.8)), 0);
    stats.totalAlcohol += dailyAlcohol;

    const hasWorkout = [...log, ...manualNodes].some(node => node.type === 'workout' || node.type === 'training');

    if (!hasWorkout) stats.noWorkout++;

    if (evals.fast && evals.fast.score <= 2) { risks.metabolic += 8; stats.noFast++; }
    if (evals.fast && evals.fast.score >= 4) { risks.metabolic -= 5; stats.goodFast++; }
    if (dailyAlcohol > 0) risks.metabolic += dailyAlcohol * 0.4;

    if (!hasWorkout) risks.cardio += 6;
    else risks.cardio -= 8;

    if (dailyAlcohol > 20) risks.inflammatory += 15;
    if (evals.muscle && evals.muscle.score <= 2) { risks.inflammatory += 6; stats.badMuscle++; }
    if (evals.muscle && evals.muscle.score >= 4) risks.inflammatory -= 4;

    if (evals.neuro && evals.neuro.score <= 2) { risks.neuro += 10; stats.badNeuro++; }
    if (evals.neuro && evals.neuro.score >= 4) { risks.neuro -= 6; stats.goodNeuro++; }
    if (dailyAlcohol > 0) risks.neuro += dailyAlcohol * 0.3;
  }

  if (validDays === 0) {
    return insufficientMatrix();
  }

  if (stats.noFast > 0) details.metabolic.push(`🔴 ${stats.noFast} giorni con digiuno assente/insufficiente (rischio insulino-resistenza).`);
  if (stats.goodFast >= Math.ceil(validDays * 0.3)) details.metabolic.push('🟢 Ottima attivazione dell\'autofagia nel periodo.');
  if (stats.totalAlcohol > 0) details.metabolic.push(`🔴 ${Math.round(stats.totalAlcohol)}g di etanolo pesano sul metabolismo epatico.`);

  if (stats.noWorkout >= Math.ceil(validDays * 0.6)) details.cardio.push(`🔴 Sedentarietà eccessiva (${stats.noWorkout} giorni senza allenamento).`);
  else details.cardio.push('🟢 Ottimo stimolo meccanico sul tono endoteliale.');

  if (stats.totalAlcohol > 40) details.inflammatory.push('🔴 Carico tossico elevato da smaltimento alcolico.');
  if (stats.badMuscle > 0) details.inflammatory.push(`🔴 ${stats.badMuscle} giorni con catabolismo e tessuti non riparati (infiammazione cellulare).`);
  if (stats.badMuscle === 0) details.inflammatory.push('🟢 Costante sintesi proteica e recupero tissutale.');

  if (stats.badNeuro > 0) details.neuro.push(`🔴 ${stats.badNeuro} giorni con cortisolo serale alto o architettura del sonno povera.`);
  if (stats.goodNeuro >= Math.ceil(validDays * 0.4)) details.neuro.push('🟢 Profondo lavaggio glinfatico e recupero SNC.');
  if (stats.totalAlcohol > 0) details.neuro.push('🔴 L\'alcol ingerito ha inibito parzialmente le fasi di sonno profondo (REM/Deep).');

  return {
    metabolic: { score: clamp(risks.metabolic), details: details.metabolic.length ? details.metabolic : ['Metabolismo glucidico e lipidico in asse.'] },
    cardio: { score: clamp(risks.cardio), details: details.cardio.length ? details.cardio : ['Rischio cardiovascolare controllato.'] },
    inflammatory: { score: clamp(risks.inflammatory), details: details.inflammatory.length ? details.inflammatory : ['Omeostasi tissutale e infiammazione basale stabile.'] },
    neuro: { score: clamp(risks.neuro), details: details.neuro.length ? details.neuro : ['Equilibrio simpatico-parasimpatico mantenuto.'] }
  };
}

/**
 * Consiglio allenamento locale dall’onda (training wave), senza API.
 * @param {object} waveResult — output di getTrainingWaveCurves
 */
export function generateLocalTrainingAdvice(waveResult) {
  const wr = waveResult && typeof waveResult === 'object' ? waveResult : {};
  const state = String(wr.waveState || 'Missed');
  const end = String(wr.windowEndStr || '').trim() || '—';
  const start = String(wr.windowStartStr || '').trim() || '—';

  let minuti = null;
  const ser = wr.series;
  if (Array.isArray(ser) && ser.length > 0) {
    let firstSweet = -1;
    for (let i = 0; i < ser.length; i++) {
      if (ser[i].inSweetSpot) {
        firstSweet = i;
        break;
      }
    }
    if (firstSweet > 0) {
      const t0 = Number(ser[0].hourClock);
      const t1 = Number(ser[firstSweet].hourClock);
      if (Number.isFinite(t0) && Number.isFinite(t1)) {
        let diffH = t1 - t0;
        if (diffH < 0) diffH += 24;
        minuti = Math.max(1, Math.round(diffH * 60));
      }
    }
  }

  if (state === 'Optimal') {
    return `🏃‍♂️ ORA! Sei nell'Onda Perfetta. Digestione completata e glucosio al picco. Hai tempo fino alle ${end}.`;
  }
  if (state === 'Wait') {
    const m = minuti != null ? String(minuti) : '—';
    return `⏳ Aspetta. Il sangue è ancora impegnato nella digestione. L'onda ideale parte alle ${start} (tra circa ${m} min).`;
  }
  return "📉 Finestra chiusa. O è passato troppo tempo dal pasto o il Safety Gate dello Stress è attivo. Meglio un recupero attivo o allenarsi domani.";
}

/**
 * Report 30 giorni locale: proteine, alcol, peso (opzionale da body_metrics), Kentu Score medio da matrice rischi.
 * @param {object} fullHistory — albero tracker_data
 * @param {object} userTargets
 * @param {Array} [bodyMetricsHistory] — voci { date?, weight, timestamp? } da Firebase body_metrics (per il delta peso)
 */
export function generateLocalMonthlyAudit(fullHistory, userTargets, bodyMetricsHistory) {
  const anchor = getTodayString();
  const targetProt = Number(userTargets?.prot ?? userTargets?.pro ?? DEFAULT_TARGETS.prot) || 150;
  let protOkDays = 0;
  let alcoholDayCount = 0;
  const kentuScores = [];

  for (let i = 0; i < 30; i++) {
    const dStr = addDays(anchor, -i);
    const rawLog = getLogFromStoricoTree(fullHistory, dStr) || [];
    const log = normalizeLogData(Array.isArray(rawLog) ? rawLog : Object.values(rawLog || {}));
    const node = fullHistory[TRACKER_STORICO_KEY(dStr)];
    const manualNodes = Array.isArray(node?.manualNodes) ? node.manualNodes : [];
    const allEntries = [...log, ...manualNodes];
    if (allEntries.length === 0) continue;

    const hasFood = log.some((e) => e.type === 'food' || e.type === 'recipe');
    if (hasFood) {
      const t = computeTotali(log);
      if ((Number(t.prot) || 0) >= targetProt * 0.9) protOkDays++;
    }
    if (allEntries.some((e) => e.type === 'alcohol')) alcoholDayCount++;

    const matrix = computeRiskMatrix(fullHistory, userTargets, 1, addDays(dStr, 1));
    const sc = computeLongevityMasterScoreFromMatrix(matrix);
    if (typeof sc === 'number' && !Number.isNaN(sc)) kentuScores.push(sc);
  }

  const proteinPct = Math.round((protOkDays / 30) * 100);
  const cleanDays = Math.max(0, 30 - alcoholDayCount);
  const avgKentu = kentuScores.length
    ? Math.round(kentuScores.reduce((a, b) => a + b, 0) / kentuScores.length)
    : null;

  let deltaStr = 'n/d';
  if (Array.isArray(bodyMetricsHistory) && bodyMetricsHistory.length > 0) {
    const startD = addDays(anchor, -29);
    const dated = bodyMetricsHistory
      .map((h) => {
        const d =
          typeof h.date === 'string' && h.date.length >= 10
            ? h.date.slice(0, 10)
            : typeof h.timestamp === 'number'
              ? new Date(h.timestamp).toISOString().slice(0, 10)
              : '';
        const w = Number(h.weight);
        return d && Number.isFinite(w) ? { d, w } : null;
      })
      .filter(Boolean)
      .filter((x) => x.d >= startD && x.d <= anchor)
      .sort((a, b) => a.d.localeCompare(b.d));
    if (dated.length >= 2) {
      const delta = Math.round((dated[dated.length - 1].w - dated[0].w) * 10) / 10;
      deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
    } else if (dated.length === 1) {
      deltaStr = '0';
    }
  }

  const scoreStr = avgKentu != null ? String(avgKentu) : 'n/d';
  return `📅 REPORT 30 GG: Proteine centrate al ${proteinPct}%, ${cleanDays} giorni 'Clean' senza alcol. Peso: ${deltaStr}kg. Kentu Score medio: ${scoreStr}.`;
}

const HABIT_SCAN_SUGAR_KEYS = ['zuccheri', 'sugars', 'sugar'];

function habitScanSumSugar(items) {
  let s = 0;
  (items || []).forEach((item) => {
    HABIT_SCAN_SUGAR_KEYS.forEach((k) => {
      const n = Number(item[k]);
      if (Number.isFinite(n)) s += n;
    });
  });
  return s;
}

function habitScanIsDinnerMealType(mealType) {
  const base = String(mealType || '').split('_')[0];
  return toCanonicalMealType(base) === 'cena';
}

/**
 * Scanner abitudini su finestra 14 giorni (dati disponibili in fullHistory).
 * @param {object} fullHistory — albero tracker_data
 */
export function generateLocalHabitScanner(fullHistory) {
  if (!fullHistory || typeof fullHistory !== 'object') {
    return '🟢 Nessuna cattiva abitudine rilevata! I tuoi pattern degli ultimi 14 giorni sono solidi e puliti. Continua così.';
  }

  const anchor = getTodayString();
  let heavyDinners = 0;
  let proteinBinging = 0;
  let alcoholDays = 0;
  let sugarSpikes = 0;

  for (let i = 0; i < 14; i++) {
    const dStr = addDays(anchor, -i);
    const rawLog = getLogFromStoricoTree(fullHistory, dStr) || [];
    const log = normalizeLogData(Array.isArray(rawLog) ? rawLog : Object.values(rawLog || {}));
    const node = fullHistory[TRACKER_STORICO_KEY(dStr)];
    const manualNodes = Array.isArray(node?.manualNodes) ? node.manualNodes : [];

    const foods = log.filter((e) => e.type === 'food' || e.type === 'recipe');
    if (foods.length === 0 && manualNodes.length === 0) continue;

    if ([...log, ...manualNodes].some((e) => e.type === 'alcohol')) alcoholDays++;

    if (foods.length === 0) continue;

    let dinnerFat = 0;
    let dinnerCarb = 0;
    let dinnerProt = 0;
    let totalProt = 0;
    foods.forEach((item) => {
      const prot = Number(item.prot) || 0;
      totalProt += prot;
      if (habitScanIsDinnerMealType(item.mealType)) {
        dinnerFat += Number(item.fatTotal ?? item.fat) || 0;
        dinnerCarb += Number(item.carb) || 0;
        dinnerProt += prot;
      }
    });

    if (dinnerFat > 25 || dinnerCarb > 80) heavyDinners++;

    if (totalProt > 0 && dinnerProt > totalProt * 0.5) proteinBinging++;

    if (habitScanSumSugar(foods) > 50) sugarSpikes++;
  }

  const alerts = [];
  if (heavyDinners >= 4) {
    alerts.push(
      `🔴 Abitudine Rilevata: Cene Pesanti. Negli ultimi 14 giorni hai fatto ${heavyDinners} cene troppo ricche di grassi o carboidrati. Stai cronicizzando lo stress notturno e sabotando il sonno.`
    );
  }
  if (proteinBinging >= 4) {
    alerts.push(
      `🔴 Abitudine Rilevata: Procrastinazione Proteica. Tendi a mangiare pochissime proteine di giorno e abbuffarti a cena (${proteinBinging} volte di recente). Il corpo non riesce ad assorbirle tutte insieme. Sforzati di usare gli snack.`
    );
  }
  if (alcoholDays >= 4) {
    alerts.push(
      `🔴 Abitudine Rilevata: Frequenza Alcolica. L'alcol sta diventando un'abitudine (${alcoholDays} giorni su 14). Questo deprime costantemente il Kentu Score e il recupero del sistema nervoso.`
    );
  }
  if (sugarSpikes >= 4) {
    alerts.push(
      `🔴 Abitudine Rilevata: Montagne Russe Glicemiche. Hai superato la soglia degli zuccheri ${sugarSpikes} volte. Stai abituando il corpo a dipendere dai picchi insulinici.`
    );
  }

  if (alerts.length === 0) {
    return '🟢 Nessuna cattiva abitudine rilevata! I tuoi pattern degli ultimi 14 giorni sono solidi e puliti. Continua così.';
  }

  return ['🔍 Analisi abitudini (ultimi 14 giorni)', '', ...alerts.map((a) => `• ${a}`)].join('\n');
}

function clampLongevityComponent(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Stabilità energetica: più stabile = punteggio più alto. */
function scoreLongevityEnergia(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  if (typeof d.energyStability === 'number') {
    return clampLongevityComponent(Math.max(0, Math.min(1, d.energyStability)) * 100);
  }
  if (typeof d.energyVolatility === 'number') {
    return clampLongevityComponent(100 - clampLongevityComponent(d.energyVolatility));
  }
  if (Array.isArray(d.energySeries) && d.energySeries.length > 2) {
    const vals = d.energySeries.map(Number).filter(v => !Number.isNaN(v));
    if (vals.length < 3) return 50;
    const mean = vals.reduce((a, x) => a + x, 0) / vals.length;
    const variance = vals.reduce((a, x) => a + (x - mean) ** 2, 0) / vals.length;
    const std = Math.sqrt(variance);
    const cv = mean !== 0 ? std / Math.abs(mean) : std;
    return clampLongevityComponent(100 - Math.min(100, cv * 120));
  }
  if (typeof d.energy === 'number') {
    return clampLongevityComponent(100 - Math.min(100, Math.abs(d.energy - 55) * 2));
  }
  return 50;
}

/** Allineamento macro (e kcal) rispetto ai target. */
function scoreLongevityNutrizione(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  const targets = d.targets || d.nutritionTargets || {};
  const totals = d.nutrition || d.totals || {};
  const keys = ['kcal', 'prot', 'carb', 'fat'];
  const parts = [];
  for (const k of keys) {
    const tg = Number(targets[k]);
    const ac = Number(totals[k]);
    if (tg > 0 && !Number.isNaN(ac)) {
      const ratio = ac / tg;
      const dev = Math.abs(1 - ratio);
      parts.push(clampLongevityComponent(100 - Math.min(100, dev * 100)));
    }
  }
  if (parts.length === 0) return 50;
  return clampLongevityComponent(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/** Stress metabolico: più basso lo stress in input, più alto il sotto-punteggio. */
function scoreLongevityStress(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  const raw =
    typeof d.stress === 'number'
      ? d.stress
      : typeof d.metabolicStress === 'number'
        ? d.metabolicStress
        : null;
  if (raw == null) return 50;
  return clampLongevityComponent(100 - clampLongevityComponent(raw));
}

/** Sonno + idratazione (medie su sotto-punteggi 0–100). */
function scoreLongevityAbitudini(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};

  let sleepPart = null;
  if (typeof d.sleepScore === 'number') sleepPart = d.sleepScore;
  else if (typeof d.sleepHours === 'number') {
    sleepPart = clampLongevityComponent(100 - Math.abs(d.sleepHours - 7.5) * 14);
  } else if (typeof d.sleep === 'number') {
    sleepPart = d.sleep <= 24 ? clampLongevityComponent(100 - Math.abs(d.sleep - 7.5) * 14) : d.sleep;
  }

  let hydPart = null;
  if (typeof d.hydrationScore === 'number') hydPart = d.hydrationScore;
  else if (typeof d.hydration === 'number') {
    const goal = Number(d.hydrationTarget);
    if (goal > 0) hydPart = clampLongevityComponent((d.hydration / goal) * 100);
    else hydPart = d.hydration;
  }

  const s = sleepPart != null ? clampLongevityComponent(sleepPart) : 50;
  const h = hydPart != null ? clampLongevityComponent(hydPart) : 50;
  return clampLongevityComponent((s + h) / 2);
}

/** Rischio aggregato: più alto il rischio in input, più basso il sotto-punteggio. */
function scoreLongevityRischio(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  const raw =
    typeof d.risk === 'number'
      ? d.risk
      : typeof d.riskScore === 'number'
        ? d.riskScore
        : null;
  if (raw == null) return 50;
  return clampLongevityComponent(100 - clampLongevityComponent(raw));
}

const LONGEVITY_BREAKDOWN_KEYS = ['energia', 'nutrizione', 'stress', 'abitudini', 'rischio'];

function longevityRawStress(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  if (typeof d.stress === 'number') return d.stress;
  if (typeof d.metabolicStress === 'number') return d.metabolicStress;
  return null;
}

function longevityRawRisk(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  if (typeof d.risk === 'number') return d.risk;
  if (typeof d.riskScore === 'number') return d.riskScore;
  return null;
}

function longevitySleepHydrationParts(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  let sleepPart = null;
  if (typeof d.sleepScore === 'number') sleepPart = d.sleepScore;
  else if (typeof d.sleepHours === 'number') {
    sleepPart = clampLongevityComponent(100 - Math.abs(d.sleepHours - 7.5) * 14);
  } else if (typeof d.sleep === 'number') {
    sleepPart = d.sleep <= 24 ? clampLongevityComponent(100 - Math.abs(d.sleep - 7.5) * 14) : d.sleep;
  }
  let hydPart = null;
  if (typeof d.hydrationScore === 'number') hydPart = d.hydrationScore;
  else if (typeof d.hydration === 'number') {
    const goal = Number(d.hydrationTarget);
    if (goal > 0) hydPart = clampLongevityComponent((d.hydration / goal) * 100);
    else hydPart = d.hydration;
  }
  return { sleepPart, hydPart };
}

function longevityAverage(values) {
  if (!values.length) return NaN;
  return values.reduce((a, x) => a + x, 0) / values.length;
}

/** Opzionale: stressPeakPeriod, metabolicStressByPhase, oppure energySeries (stima fase del picco). */
function longevityInferMetabolicStressPhase(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  if (typeof d.stressPeakPeriod === 'string') {
    const p = d.stressPeakPeriod.toLowerCase();
    if (['morning', 'afternoon', 'evening'].includes(p)) return p;
  }
  const byPh = d.metabolicStressByPhase;
  if (byPh && typeof byPh === 'object') {
    const parts = ['morning', 'afternoon', 'evening'].map(k => ({ k, v: Number(byPh[k]) }));
    const valid = parts.filter(x => !Number.isNaN(x.v));
    if (valid.length) {
      const peak = valid.reduce((a, b) => (b.v > a.v ? b : a));
      if (peak.v >= 38) return peak.k;
    }
  }
  const series = Array.isArray(d.energySeries) ? d.energySeries.map(Number).filter(v => !Number.isNaN(v)) : [];
  if (series.length >= 8) {
    const n = series.length;
    const t = Math.floor(n / 3);
    const s1 = longevityAverage(series.slice(0, t));
    const s2 = longevityAverage(series.slice(t, 2 * t));
    const s3 = longevityAverage(series.slice(2 * t));
    const lo = Math.min(s1, s2, s3);
    if (lo === s2 && s2 < s1 - 5 && s2 <= s3 - 2) return 'afternoon';
    if (lo === s3 && s3 < s1 - 5) return 'evening';
    if (lo === s1 && s1 < s2 - 5) return 'morning';
  }
  return null;
}

function longevityWorstMacroGapMessage(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  const targets = d.targets || d.nutritionTargets || {};
  const totals = d.nutrition || d.totals || {};
  const rows = [
    { k: 'prot', under: 'Protein intake below target', over: 'Protein intake above target' },
    { k: 'carb', under: 'Carb intake below target', over: 'Carb intake above target' },
    { k: 'fat', under: 'Fat intake below target', over: 'Fat intake above target' },
    { k: 'kcal', under: 'Calories below target', over: 'Calories above target' }
  ];
  let worst = null;
  for (const row of rows) {
    const tg = Number(targets[row.k]);
    const ac = Number(totals[row.k]);
    if (tg <= 0 || Number.isNaN(ac)) continue;
    const ratio = ac / tg;
    if (ratio < 0.9) {
      const gap = 1 - ratio;
      if (!worst || gap > worst.gap) worst = { gap, msg: row.under };
    } else if (ratio > 1.12) {
      const gap = ratio - 1;
      if (!worst || gap > worst.gap) worst = { gap, msg: row.over };
    }
  }
  return worst ? worst.msg : null;
}

function longevityEnergyAfternoonDip(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  const series = Array.isArray(d.energySeries) ? d.energySeries.map(Number).filter(v => !Number.isNaN(v)) : [];
  if (series.length < 8) return false;
  const n = series.length;
  const a = Math.floor(n * 0.35);
  const b = Math.floor(n * 0.65);
  const early = longevityAverage(series.slice(0, a));
  const mid = longevityAverage(series.slice(a, b));
  return mid < early - 8;
}

/** Opzionale: hydrationByPhase, morningHydrationRatio, hydrationMorningMl + hydrationTarget. */
function longevityPoorHydrationEarlyInDay(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  const by = d.hydrationByPhase;
  if (by && typeof by === 'object') {
    const m = Number(by.morning);
    const aft = Number(by.afternoon);
    if (!Number.isNaN(m) && !Number.isNaN(aft) && m < 35 && m < aft * 0.55) return true;
  }
  if (typeof d.morningHydrationRatio === 'number' && d.morningHydrationRatio < 0.28) return true;
  const goal = Number(d.hydrationTarget);
  if (typeof d.hydrationMorningMl === 'number' && goal > 0) {
    if (d.hydrationMorningMl < goal * 0.22) return true;
  }
  return false;
}

function longevityStressElevatedLabel(phase) {
  if (phase === 'afternoon') return 'Elevated metabolic stress in the afternoon';
  if (phase === 'evening') return 'Elevated metabolic stress in the evening';
  if (phase === 'morning') return 'Elevated metabolic stress in the morning';
  return 'Elevated metabolic stress today';
}

function longevityNegativeDriverMessage(key, score, daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  switch (key) {
    case 'energia': {
      if (longevityEnergyAfternoonDip(d)) return 'Energy dipped in the afternoon';
      if (typeof d.energyStability === 'number' && d.energyStability < 0.45) {
        return 'Unstable energy curve (low stability score)';
      }
      if (typeof d.energyVolatility === 'number' && d.energyVolatility > 55) {
        return 'Uneven energy across waking hours';
      }
      if (score < 60) return 'Sharp swings in perceived energy';
      if (score < 70) return 'Energy stability trailing your other pillars';
      return 'Energy stability is lagging today';
    }
    case 'nutrizione': {
      const macroMsg = longevityWorstMacroGapMessage(d);
      if (macroMsg) return macroMsg;
      if (score < 70) return 'Macronutrient mix off your planned targets';
      return 'Nutrition tracking or targets missing—balance unclear';
    }
    case 'stress': {
      const raw = longevityRawStress(d);
      const elevated = score < 60 || (raw != null && raw > 40);
      if (elevated) {
        const phase = longevityInferMetabolicStressPhase(d);
        return longevityStressElevatedLabel(phase);
      }
      return 'Metabolic stress edging higher than ideal';
    }
    case 'abitudini': {
      const { sleepPart, hydPart } = longevitySleepHydrationParts(d);
      const hydWeak =
        hydPart != null &&
        (sleepPart == null || hydPart <= sleepPart) &&
        hydPart < 60;
      if (hydWeak && longevityPoorHydrationEarlyInDay(d)) {
        return 'Poor hydration early in the day';
      }
      if (sleepPart != null && hydPart != null && sleepPart < hydPart && sleepPart < 60) {
        const h = typeof d.sleepHours === 'number' ? d.sleepHours : typeof d.sleep === 'number' && d.sleep <= 24 ? d.sleep : null;
        if (h != null && h < 7) return `Short sleep (${h}h) vs your recovery needs`;
        return 'Sleep duration or quality below par';
      }
      if (hydPart != null && sleepPart != null && hydPart < sleepPart && hydPart < 60) {
        return 'Hydration under today’s fluid target';
      }
      if (sleepPart != null && sleepPart < 55) {
        const h = typeof d.sleepHours === 'number' ? d.sleepHours : typeof d.sleep === 'number' && d.sleep <= 24 ? d.sleep : null;
        if (h != null) return `Only about ${h}h sleep logged—recovery may suffer`;
        return 'Sleep short of what you need';
      }
      if (hydPart != null && hydPart < 55) return 'Hydration below goal';
      return 'Sleep or hydration needs attention';
    }
    case 'rischio': {
      const raw = longevityRawRisk(d);
      if (raw != null && raw > 50) return 'Health risk score elevated versus your baseline';
      if (raw != null) return `Risk markers around ${Math.round(raw)}/100—room to improve`;
      return 'Risk signals need attention';
    }
    default:
      return 'Needs attention';
  }
}

function longevityPositiveDriverMessage(key, score, daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  switch (key) {
    case 'energia': {
      if (score > 80) return 'Stable energy throughout the day';
      const series = Array.isArray(d.energySeries) ? d.energySeries.map(Number).filter(v => !Number.isNaN(v)) : [];
      if (series.length >= 6) {
        const mean = longevityAverage(series);
        const spread = Math.sqrt(
          series.reduce((a, x) => a + (x - mean) ** 2, 0) / series.length
        );
        if (spread < Math.max(5, mean * 0.08) && score >= 72) {
          return 'Even energy band—few crashes across the day';
        }
      }
      if (typeof d.energyStability === 'number' && d.energyStability >= 0.75) {
        return 'Stable energy levels from your stability data';
      }
      return 'Energy steadier than your weaker pillars today';
    }
    case 'nutrizione': {
      const macroIssue = longevityWorstMacroGapMessage(d);
      if (!macroIssue && score >= 78) return 'Macros aligned with your daily targets';
      if (score >= 75) return 'Nutrition closest to plan among your pillars';
      return 'Nutrition relatively on track';
    }
    case 'stress': {
      const raw = longevityRawStress(d);
      const phase = longevityInferMetabolicStressPhase(d);
      if (score > 82 && phase === 'afternoon') return 'Metabolic stress stayed low through the afternoon';
      if (score > 80 || (raw != null && raw < 22)) return 'Metabolic stress stayed low today';
      return 'Metabolic stress under control';
    }
    case 'abitudini': {
      const { sleepPart, hydPart } = longevitySleepHydrationParts(d);
      if (score > 80 && sleepPart != null && hydPart != null && sleepPart >= 75 && hydPart >= 75) {
        return 'Strong sleep and hydration together';
      }
      if (sleepPart != null && hydPart != null && hydPart > sleepPart && hydPart >= 78) {
        return 'Hydration on target—fluids well covered';
      }
      if (sleepPart != null && hydPart != null && sleepPart > hydPart && sleepPart >= 78) {
        return 'Sleep window supportive of recovery';
      }
      if (score > 80) return 'Strong sleep and hydration';
      return 'Solid sleep or hydration habits today';
    }
    case 'rischio': {
      const raw = longevityRawRisk(d);
      if (score > 80) return 'Risk factors well controlled';
      if (raw != null && raw < 30) return `Risk score low (${Math.round(raw)}/100)`;
      return 'Risk load relatively low';
    }
    default:
      return 'Doing well here';
  }
}

/** Tre pilastri più deboli e due più forti, senza sovrapposizione di chiave. */
function buildLongevityDrivers(daily, breakdown) {
  const entries = LONGEVITY_BREAKDOWN_KEYS.map(key => ({ key, score: breakdown[key] }));
  const byAsc = [...entries].sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
  const byDesc = [...entries].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  const negatives = byAsc.slice(0, 3);
  const negKeys = new Set(negatives.map(x => x.key));

  const positives = [];
  for (const item of byDesc) {
    if (positives.length >= 2) break;
    if (negKeys.has(item.key)) continue;
    positives.push(item);
  }

  const drivers = [
    ...negatives.map(({ key, score }) => ({
      type: 'negative',
      key,
      message: longevityNegativeDriverMessage(key, score, daily)
    })),
    ...positives.map(({ key, score }) => ({
      type: 'positive',
      key,
      message: longevityPositiveDriverMessage(key, score, daily)
    }))
  ];
  return drivers;
}

/** Suggerimento mirato da gap macro vs target (solo se i numeri ci sono). */
function longevityNutritionSuggestionFromTotals(daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  const targets = d.targets || d.nutritionTargets || {};
  const totals = d.nutrition || d.totals || {};
  const rows = [
    {
      k: 'prot',
      under: 'Increase protein at lunch (+25–30g lean meat, fish, or Greek yogurt)',
      over: 'Trade one evening protein snack for a bowl of vegetables'
    },
    {
      k: 'carb',
      under: 'Add slow carbs at breakfast (oats or fruit with your meal)',
      over: 'Cut bread or pasta at dinner by one serving tonight'
    },
    {
      k: 'fat',
      under: 'Add a thumb of olive oil or half an avocado at lunch',
      over: 'Use one less spoon of oil when cooking dinner'
    },
    {
      k: 'kcal',
      under: 'Add one planned 300–400 kcal meal so you reach today’s calorie target',
      over: 'Drop one sugary drink or dessert today to land closer to your kcal target'
    }
  ];
  let worstUnder = null;
  let worstOver = null;
  for (const row of rows) {
    const tg = Number(targets[row.k]);
    const ac = Number(totals[row.k]);
    if (tg <= 0 || Number.isNaN(ac)) continue;
    const ratio = ac / tg;
    if (ratio < 0.88) {
      const gap = 1 - ratio;
      if (!worstUnder || gap > worstUnder.gap) worstUnder = { gap, msg: row.under };
    }
    if (ratio > 1.15) {
      const gap = ratio - 1;
      if (!worstOver || gap > worstOver.gap) worstOver = { gap, msg: row.over };
    }
  }
  if (worstUnder) return worstUnder.msg;
  if (worstOver) return worstOver.msg;
  return null;
}

/**
 * Un suggerimento pratico per ogni driver negativo (max 5 totali).
 * Usa `daily` ove possibile per evitare consigli vaghi.
 */
function longevitySuggestionForNegativeDriver(driver, daily) {
  const d = daily && typeof daily === 'object' ? daily : {};
  const { key, message } = driver;

  switch (key) {
    case 'stress': {
      if (message.includes('Elevated')) {
        return 'Reduce caffeine after 15:00';
      }
      if (message.includes('edging higher')) {
        return 'Take a 10-minute easy walk right after lunch';
      }
      return 'Dim the lights and screens 60 minutes before bed tonight';
    }
    case 'nutrizione': {
      const macro = longevityNutritionSuggestionFromTotals(daily);
      if (macro) return macro;
      if (message.includes('Protein')) {
        return 'Lead your next meal with a palm-sized protein portion before starches';
      }
      return 'Pre-log tomorrow’s meals so kcal and macros match your targets within 10%';
    }
    case 'energia': {
      if (message.includes('afternoon') || message.includes('dipped')) {
        return 'Add lean protein at lunch before your usual afternoon slump';
      }
      if (message.includes('Sharp')) {
        return 'Avoid grazing—use two solid meals 4–5 hours apart, no liquid calories between';
      }
      if (message.includes('Uneven') || message.includes('Unstable') || message.includes('trailing') || message.includes('lagging')) {
        return 'Eat a protein-forward breakfast within 90 minutes of waking';
      }
      return 'Skip afternoon espresso; if needed, one small coffee before noon only';
    }
    case 'abitudini': {
      if (message.includes('early in the day') || message.includes('Hydration under') || message.includes('Hydration below')) {
        return 'Drink 500ml water within the first hour after waking';
      }
      if (message.includes('Sleep') || message.includes('sleep')) {
        return 'Set a fixed lights-out 30 minutes earlier than last night';
      }
      return 'Front-load water before 18:00 and stop fluids 90 minutes before bed';
    }
    case 'rischio': {
      if (message.includes('elevated') || message.includes('Risk markers')) {
        return 'Walk 15 minutes immediately after your largest meal today';
      }
      return 'No alcohol tonight—give liver and sleep a 24-hour reset';
    }
    default:
      return null;
  }
}

function buildLongevitySuggestions(daily, drivers) {
  const max = 5;
  const out = [];
  for (const dr of drivers) {
    if (dr.type !== 'negative') continue;
    const s = longevitySuggestionForNegativeDriver(dr, daily);
    if (s) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

const LONGEVITY_PRIORITY_FOCUS_TITLE = {
  energia: 'Energy stability',
  nutrizione: 'Nutrition',
  stress: 'Metabolic stress',
  abitudini: 'Sleep & hydration',
  rischio: 'Health risk'
};

/** Primo driver negativo (pilastro più basso) + stessa azione del primo suggerimento mirato. */
function buildLongevityPriorityFocus(daily, drivers) {
  if (!Array.isArray(drivers) || drivers.length === 0) return null;
  const firstNeg = drivers.find(d => d.type === 'negative');
  if (!firstNeg) return null;
  const title = LONGEVITY_PRIORITY_FOCUS_TITLE[firstNeg.key] || 'Focus area';
  let action = longevitySuggestionForNegativeDriver(firstNeg, daily);
  if (!action) {
    const m = firstNeg.message || '';
    action = m.length > 100 ? `${m.slice(0, 97)}…` : m || 'Review this pillar today';
  }
  return { key: firstNeg.key, title, action };
}

/**
 * Punteggio longevità giornaliero (0–100) da dati aggregati del giorno.
 * Campi opzionali tipici: energyStability (0–1), energySeries, totals/targets macro,
 * stress o metabolicStress (0–100), sleepScore o sleepHours, hydration o hydrationTarget, risk (0–100).
 * Contesto opzionale per messaggi driver: stressPeakPeriod, metabolicStressByPhase, hydrationByPhase,
 * morningHydrationRatio, hydrationMorningMl, energySeries (serie per fase giorno / calo pomeridiano).
 * Ritorna anche `suggestions`: fino a 5 stringhe, una per driver negativo, azioni concrete legate al driver e ai dati.
 * `priorityFocus`: primo pilastro negativo + azione allineata al primo suggerimento (null se non ci sono driver negativi).
 */
export function computeLongevityScore(daily) {
  const energia = scoreLongevityEnergia(daily);
  const nutrizione = scoreLongevityNutrizione(daily);
  const stress = scoreLongevityStress(daily);
  const abitudini = scoreLongevityAbitudini(daily);
  const rischio = scoreLongevityRischio(daily);
  const breakdown = { energia, nutrizione, stress, abitudini, rischio };
  const score = clampLongevityComponent(
    energia * 0.30 +
      nutrizione * 0.25 +
      stress * 0.20 +
      abitudini * 0.15 +
      rischio * 0.10
  );
  const drivers = buildLongevityDrivers(daily, breakdown);
  const suggestions = buildLongevitySuggestions(daily, drivers);
  return {
    score,
    breakdown,
    drivers,
    suggestions,
    priorityFocus: buildLongevityPriorityFocus(daily, drivers)
  };
}

function longevityExplainCapitalize(sentence) {
  const s = (sentence || '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pickStable(arr, seed) {
  if (!arr || arr.length === 0) return '';
  const s = String(seed ?? '');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) % 100000;
  }
  return arr[hash % arr.length];
}

const LONGEVITY_SUMMARY_HIGH = [
  'Today your overall balance looked strong.',
  'Overall, the day sat in a comfortable range for you.',
  'You stacked today in a mostly solid place overall.'
];

const LONGEVITY_SUMMARY_MID = [
  'Today your overall balance was decent.',
  'The day landed in the middle, without big swings either way.',
  'Overall things were steady, with a few spots to fine-tune.'
];

const LONGEVITY_SUMMARY_LOW = [
  'Today tipped demanding for your overall balance.',
  'Overall, today asked more of your system than usual.',
  'The day skewed heavy on your overall load.'
];

/**
 * Riformula il driver negativo con aperture varie + contesto (pomeriggio / sonno / idratazione).
 */
function longevityVaryNegativeWording(clause, rawDriverMessage, phraseSeed) {
  if (!clause || typeof clause !== 'string') return '';
  let c = clause.trim().replace(/\.$/, '');
  const msg = (rawDriverMessage || '').toLowerCase();

  let rest = c;
  const ye = /^you experienced (.+)$/i.exec(c);
  const oa = !ye ? /^one area to watch is that (.+)$/i.exec(c) : null;
  if (ye) rest = ye[1].trim();
  else if (oa) rest = oa[1].trim();
  const useStructuredOpeners = !!(ye || oa);

  const rLow = rest.toLowerCase();
  let enriched = rest;
  if ((/afternoon|evening/.test(msg) || /afternoon|evening/.test(rLow)) && !/later in the day|through the afternoon|overnight/.test(rLow)) {
    enriched = `${rest}, especially later in the day`;
  } else if (/sleep|slept|night|bed|hours|recovery/.test(msg) && !/overnight|night|recovery/.test(rLow)) {
    enriched = `${rest}, which can carry into how you recover overnight`;
  } else if (/hydration|hydrat|fluid|water|drink/.test(msg) && !/early|morning|start the day/.test(rLow)) {
    enriched = `${rest}, and morning hydration habits often show up here`;
  }

  const negPickKey = `${phraseSeed ?? ''}:neg`;

  const pickFramed = () => {
    if (useStructuredOpeners) {
      return pickStable(
        [
          `Your system showed ${enriched}`,
          `Your body responded with ${enriched}`,
          `There was a sign of ${enriched}`
        ],
        `${negPickKey}:struct`
      );
    }
    if (/^your /i.test(c)) {
      return pickStable(
        [
          c.charAt(0).toUpperCase() + c.slice(1),
          `We noticed ${c.charAt(0).toLowerCase() + c.slice(1)}`,
          `There was a hint that ${c.charAt(0).toLowerCase() + c.slice(1)}`
        ],
        `${negPickKey}:your`
      );
    }
    if (
      /^(metabolic stress|hydration|fluids|sleep looked|sleep duration|energy |macros |risk signals|a few risk|nutrition data|one area)/i.test(c)
    ) {
      const low = enriched.charAt(0).toLowerCase() + enriched.slice(1);
      return pickStable(
        [longevityExplainCapitalize(enriched), `Your day reflected ${low}`, `We noted ${low}`],
        `${negPickKey}:topic`
      );
    }
    return pickStable(
      [
        longevityExplainCapitalize(enriched),
        `Your day pointed to ${enriched.charAt(0).toLowerCase() + enriched.slice(1)}`,
        `We picked up ${enriched.charAt(0).toLowerCase() + enriched.slice(1)}`
      ],
      `${negPickKey}:default`
    );
  };

  return pickFramed().replace(/\s+/g, ' ').trim();
}

/** Trasforma il messaggio driver negativo in una frase tipo “you / your …”. */
function longevityNegativeDriverToClause(message) {
  if (!message || typeof message !== 'string') return null;
  const t = message.trim().replace(/\.$/, '').replace(/\s+/g, ' ');

  if (/^elevated metabolic stress/i.test(t)) {
    const rest = t.replace(/^elevated metabolic stress/i, '').trim().toLowerCase();
    return rest ? `you experienced higher metabolic stress ${rest}` : 'you experienced higher metabolic stress than ideal';
  }
  if (/metabolic stress edging higher|metabolic stress crept/i.test(t)) {
    return 'metabolic stress edged higher than ideal';
  }
  if (/^energy dipped in the/i.test(t)) {
    return `your ${t.charAt(0).toLowerCase()}${t.slice(1)}`;
  }
  if (/^(protein|carb|fat|calories) intake below target$/i.test(t)) {
    const macro = t.split(/\s+/)[0].toLowerCase();
    return `your ${macro} intake landed below target`;
  }
  if (/^(protein|carb|fat|calories) intake above target$/i.test(t)) {
    const macro = t.split(/\s+/)[0].toLowerCase();
    return `your ${macro} intake ran above target`;
  }
  if (/^hydration below goal$/i.test(t)) return 'hydration finished below your goal';
  if (/^hydration under today/i.test(t)) return 'fluids stayed under what you aimed for today';
  if (/poor hydration early in the day/i.test(t)) return 'hydration was light early in the day';
  if (/sleep short of what you need|only about \d/i.test(t)) return 'sleep looked shorter than your body needs';
  if (/sleep duration or quality below par/i.test(t)) return 'sleep duration or quality slipped';
  if (/sharp swings in perceived energy/i.test(t)) return 'your energy swung more than usual';
  if (/uneven energy across waking hours/i.test(t)) return 'energy was uneven across the day';
  if (/unstable energy curve/i.test(t)) return 'energy stability wavered';
  if (/energy stability trailing/i.test(t)) return 'energy stability trailed your other pillars';
  if (/energy stability is lagging today/i.test(t)) return 'energy stability lagged today';
  if (/macronutrient mix off/i.test(t)) return 'macros drifted off your planned mix';
  if (/nutrition tracking or targets missing/i.test(t)) return 'nutrition data was thin, so balance is harder to judge';
  if (/health risk score elevated/i.test(t)) return 'risk signals read higher than your usual baseline';
  if (/risk markers around/i.test(t)) return 'a few risk markers need a closer look';
  if (/risk signals need attention/i.test(t)) return 'risk signals deserve a bit of attention';

  const soft = t.charAt(0).toLowerCase() + t.slice(1);
  return `one area to watch is that ${soft}`;
}

/** Una frase breve di rinforzo dal driver positivo. */
function longevityPositiveDriverToClause(message) {
  if (!message || typeof message !== 'string') return null;
  const t = message.trim().replace(/\.$/, '');

  if (/stable energy throughout the day/i.test(t)) {
    return 'Your energy levels remained fairly stable, which is a good sign.';
  }
  if (/even energy band/i.test(t)) {
    return 'Your energy stayed even for much of the day, which helps recovery.';
  }
  if (/stable energy levels from your stability data/i.test(t)) {
    return 'Your stability data suggests steady energy, and that is worth keeping.';
  }
  if (/macros aligned with your daily targets/i.test(t)) {
    return 'Your macros lined up well with what you planned.';
  }
  if (/nutrition closest to plan/i.test(t)) {
    return 'Nutrition was the cleanest pillar of the day.';
  }
  if (/metabolic stress stayed low through the afternoon/i.test(t)) {
    return 'Metabolic stress stayed tame through the afternoon.';
  }
  if (/metabolic stress stayed low today/i.test(t)) {
    return 'Metabolic stress stayed relatively low, which is encouraging.';
  }
  if (/strong sleep and hydration together/i.test(t)) {
    return 'Sleep and hydration both showed up for you today.';
  }
  if (/hydration on target/i.test(t)) {
    return 'Hydration was on target, and that supports everything else.';
  }
  if (/sleep window supportive/i.test(t)) {
    return 'Your sleep window still supported recovery.';
  }
  if (/risk factors well controlled|risk score low/i.test(t)) {
    return 'Risk readouts stayed controlled, which is a quiet win.';
  }
  return `On the upside, ${t.charAt(0).toLowerCase() + t.slice(1)}.`;
}

/**
 * Spiegazione breve (2–3 frasi) dal risultato di computeLongevityScore.
 * @param {object} result — output di computeLongevityScore
 * @returns {string}
 */
export function buildLongevityExplanation(result) {
  const fallback =
    'We could not read a clear longevity picture yet. Log meals, sleep, and hydration and check back.';

  if (!result || typeof result !== 'object') return fallback;

  const score =
    typeof result.score === 'number' && !Number.isNaN(result.score) ? result.score : null;
  if (score == null) return fallback;

  const drivers = Array.isArray(result.drivers) ? result.drivers : [];
  const firstNeg = drivers.find(d => d && d.type === 'negative');
  const firstPos = drivers.find(d => d && d.type === 'positive');

  const negClause = firstNeg ? longevityNegativeDriverToClause(firstNeg.message) : null;
  const posClause = firstPos ? longevityPositiveDriverToClause(firstPos.message) : null;

  const seed = JSON.stringify(result?.breakdown ?? {}) + (result?.score ?? 0);

  const tone = score >= 75 ? 'high' : score >= 50 ? 'mid' : 'low';
  const summaryPool =
    tone === 'high' ? LONGEVITY_SUMMARY_HIGH : tone === 'mid' ? LONGEVITY_SUMMARY_MID : LONGEVITY_SUMMARY_LOW;
  const summary = pickStable(summaryPool, `${seed}:summary`);

  const parts = [`${String(summary).replace(/\.$/, '').trim()}.`];

  if (negClause) {
    let b = longevityVaryNegativeWording(negClause, firstNeg.message, seed);
    if (!b || !String(b).trim()) {
      b = longevityExplainCapitalize(negClause).replace(/\.$/, '');
    }
    if (b && !/[.!?]$/.test(b)) b += '.';
    if (tone === 'high') parts.push(`Still, ${b}`);
    else if (tone === 'mid') parts.push(`That said, ${b.charAt(0).toLowerCase() + b.slice(1)}`);
    else parts.push(b);
  } else if (tone === 'low') {
    parts.push('Small shifts to sleep, stress, or fuel tomorrow will help you rebound.');
  }

  if (posClause && parts.length < 3) {
    let p2 = posClause.trim();
    if (!/[.!?]$/.test(p2)) p2 += '.';
    parts.push(p2);
  }

  return parts.slice(0, 3).join(' ');
}

// =============================================================================
// Motore predittivo composizione corporea + calibrazione TDEE (energia vs peso)
// =============================================================================

/** kcal teoriche per ~1 kg di variazione di massa corporea da bilancio energetico. */
export const KCAL_PER_KG_ENERGY_BALANCE = 7700;

export function sumFoodKcalAndProtein(dailyLog) {
  const L = normalizeLogData(Array.isArray(dailyLog) ? dailyLog : Object.values(dailyLog || {}));
  let kcal = 0;
  let prot = 0;
  for (let i = 0; i < L.length; i++) {
    const e = L[i];
    if (e.type !== 'food' && e.type !== 'recipe') continue;
    kcal += Number(e.kcal ?? e.cal) || 0;
    prot += Number(e.prot ?? e.proteine) || 0;
  }
  return { kcal, prot };
}

export function sumWorkoutBurnKcal(dailyLog) {
  const L = normalizeLogData(Array.isArray(dailyLog) ? dailyLog : Object.values(dailyLog || {}));
  return L.filter((e) => e.type === 'workout').reduce(
    (s, e) => s + (Number(e.kcal ?? e.cal) || 0),
    0
  );
}

export function dayHasWeightsStrengthWorkout(dailyLog) {
  const L = normalizeLogData(Array.isArray(dailyLog) ? dailyLog : Object.values(dailyLog || {}));
  return L.some((x) => {
    if (x.type !== 'workout') return false;
    const sub = String(x.subType ?? x.workoutType ?? x.desc ?? x.name ?? '').toLowerCase();
    return (
      sub.includes('pesi') ||
      sub.includes('pesist') ||
      sub.includes('weight') ||
      sub.includes('strength') ||
      sub === 'hiit' ||
      x.workoutType === 'pesi'
    );
  });
}

/** Variazione di massa corporea (kg) da bilancio kcal vs TDEE dinamico del giorno. */
export function estimateBodyMassDeltaFromEnergyBalance(intakeKcal, dynamicTdeeKcal) {
  const bal = Number(intakeKcal) - Number(dynamicTdeeKcal);
  if (!Number.isFinite(bal)) return 0;
  return bal / KCAL_PER_KG_ENERGY_BALANCE;
}

/**
 * Parte della variazione di massa attribuita alla componente magra (per serie massa muscolare stimata).
 * Surplus: più quota magra con proteine alte e pesi; deficit: tutela magra con stessi fattori.
 */
export function estimateLeanMassDeltaKg(totalDeltaKg, bodyWeightKg, proteinG, hasWeightsWorkout) {
  const w = Math.max(Number(bodyWeightKg) || 70, 40);
  const p = Math.max(Number(proteinG) || 0, 0);
  const protPerKg = p / w;
  const pf = Math.max(0, Math.min(1, (protPerKg - 0.85) / 0.95));
  const wb = hasWeightsWorkout ? 1 : 0;
  if (totalDeltaKg >= 0) {
    const leanShare = 0.13 + 0.24 * pf + 0.11 * wb;
    const clamped = Math.max(0.07, Math.min(0.5, leanShare));
    return totalDeltaKg * clamped;
  }
  const leanLossShare = 0.34 - 0.15 * pf - 0.11 * wb;
  const clampedLoss = Math.max(0.11, Math.min(0.44, leanLossShare));
  return totalDeltaKg * clampedLoss;
}

export function metricEntryToIsoDay(entry) {
  if (!entry) return null;
  if (entry.date && /^\d{4}-\d{2}-\d{2}$/.test(String(entry.date))) return String(entry.date);
  const ts = Number(entry.timestamp);
  if (Number.isFinite(ts)) {
    const d = new Date(ts);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 10);
  }
  const iso = entry.date != null ? String(entry.date).slice(0, 10) : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return null;
}

function inferMuscleMassKgFromMetric(entry) {
  const w = Number(entry?.weight);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (entry.muscle != null && entry.muscle !== '') {
    const m = Number(entry.muscle);
    if (Number.isFinite(m) && m > 0 && m <= 100) return (w * m) / 100;
  }
  if (entry.bodyFat != null && entry.bodyFat !== '') {
    const bf = Number(entry.bodyFat);
    if (Number.isFinite(bf) && bf >= 0 && bf < 99) {
      const lean = w * (1 - bf / 100);
      return Math.max(0, lean * 0.42);
    }
  }
  return Math.max(0, w * 0.36);
}

/**
 * Serie giornaliera peso + massa muscolare stimata (kg). Giorni con pesata reale: reset al valore misurato.
 * @returns {Array<{ isoDate: string, weightKg: number, weightIsReal: boolean, muscleMassKg: number, muscleMassIsReal: boolean, bodyFat: number|null, musclePct: number|null, waterPct: number|null }>}
 */
export function buildPredictiveCompositionDailyRows({
  fullHistory,
  bodyMetricsHistory,
  rangeStartIso,
  rangeEndIso,
  baseTdeeKcal,
}) {
  if (
    !fullHistory ||
    typeof fullHistory !== 'object' ||
    !rangeStartIso ||
    !rangeEndIso ||
    compareIsoDate(rangeStartIso, rangeEndIso) > 0
  ) {
    return [];
  }
  const baseTdee = Number(baseTdeeKcal);
  if (!Number.isFinite(baseTdee) || baseTdee < 800) return [];

  const sorted = [...(bodyMetricsHistory || [])]
    .filter((e) => e && Number(e.weight) > 0)
    .sort((a, b) => {
      const da = metricEntryToIsoDay(a) || '';
      const db = metricEntryToIsoDay(b) || '';
      if (da !== db) return da < db ? -1 : 1;
      return (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0);
    });

  const realByDay = new Map();
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const day = metricEntryToIsoDay(e);
    if (!day) continue;
    const w = Number(e.weight);
    if (!Number.isFinite(w) || w <= 0) continue;
    realByDay.set(day, {
      weight: w,
      bodyFat: e.bodyFat != null && e.bodyFat !== '' ? Number(e.bodyFat) : null,
      muscle: e.muscle != null && e.muscle !== '' ? Number(e.muscle) : null,
      water: e.water != null && e.water !== '' ? Number(e.water) : null,
    });
  }

  let carryW = null;
  let carryM = null;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const day = metricEntryToIsoDay(e);
    if (!day || compareIsoDate(day, rangeStartIso) >= 0) break;
    carryW = Number(e.weight);
    carryM = inferMuscleMassKgFromMetric(e);
  }

  const rows = [];
  let d = rangeStartIso;
  while (compareIsoDate(d, rangeEndIso) <= 0) {
    const log = normalizeLogData(getLogFromStoricoTree(fullHistory, d) || []);
    const { kcal, prot } = sumFoodKcalAndProtein(log);
    const burn = sumWorkoutBurnKcal(log);
    const tdeeDyn = baseTdee + burn;
    const hasW = dayHasWeightsStrengthWorkout(log);
    const real = realByDay.get(d);

    if (real) {
      carryW = real.weight;
      carryM = inferMuscleMassKgFromMetric({ weight: real.weight, bodyFat: real.bodyFat, muscle: real.muscle });
      const muscleMassIsReal = real.muscle != null && Number.isFinite(Number(real.muscle));
      rows.push({
        isoDate: d,
        weightKg: carryW,
        weightIsReal: true,
        muscleMassKg: carryM,
        muscleMassIsReal: muscleMassIsReal,
        bodyFat: real.bodyFat != null && Number.isFinite(real.bodyFat) ? real.bodyFat : null,
        musclePct: real.muscle != null && Number.isFinite(real.muscle) ? real.muscle : null,
        waterPct: real.water != null && Number.isFinite(real.water) ? real.water : null,
      });
    } else if (carryW != null && carryM != null) {
      const dW = estimateBodyMassDeltaFromEnergyBalance(kcal, tdeeDyn);
      const dLean = estimateLeanMassDeltaKg(dW, carryW, prot, hasW);
      carryW += dW;
      carryM += dLean;
      rows.push({
        isoDate: d,
        weightKg: carryW,
        weightIsReal: false,
        muscleMassKg: carryM,
        muscleMassIsReal: false,
        bodyFat: null,
        musclePct: null,
        waterPct: null,
      });
    }

    d = addDays(d, 1);
  }

  return rows;
}

function compareIsoDate(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Peso stimato a fine giornata (per confronto con pesata reale e calibrazione TDEE). */
export function getEndOfDayPredictedWeightForCalibration({
  fullHistory,
  bodyMetricsHistory,
  baseTdeeKcal,
  targetIsoDate,
}) {
  if (!targetIsoDate) return null;
  const rangeStart = addDays(targetIsoDate, -220);
  const rows = buildPredictiveCompositionDailyRows({
    fullHistory,
    bodyMetricsHistory,
    rangeStartIso: rangeStart,
    rangeEndIso: targetIsoDate,
    baseTdeeKcal,
  });
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  if (last.isoDate !== targetIsoDate) return null;
  const w = Number(last.weightKg);
  return Number.isFinite(w) ? w : null;
}

/**
 * Ultime 3 pesate con scostamento persistente (stesso segno, |err| > soglia) → suggerisce correzione TDEE (kcal).
 */
export function evaluatePersistentTdeeCalibration(errorRows, thresholdKg = 0.28) {
  const last3 = (errorRows || []).slice(-3);
  if (last3.length < 3) return { shouldAdjust: false, suggestedDeltaKcal: 0, meanErrorKg: 0 };
  const th = Number(thresholdKg) || 0.28;
  const signs = last3.map((e) => {
    const err = Number(e.errorKg);
    if (!Number.isFinite(err)) return 0;
    if (err > th) return 1;
    if (err < -th) return -1;
    return 0;
  });
  if (signs.some((s) => s === 0)) return { shouldAdjust: false, suggestedDeltaKcal: 0, meanErrorKg: 0 };
  if (!(signs[0] === signs[1] && signs[1] === signs[2])) {
    return { shouldAdjust: false, suggestedDeltaKcal: 0, meanErrorKg: 0 };
  }
  const mean =
    (Number(last3[0].errorKg) + Number(last3[1].errorKg) + Number(last3[2].errorKg)) / 3;
  const rawDelta = Math.round((-mean * KCAL_PER_KG_ENERGY_BALANCE) / 14);
  const suggestedDeltaKcal = Math.max(-280, Math.min(280, rawDelta));
  return { shouldAdjust: true, suggestedDeltaKcal, meanErrorKg: mean };
}

const SUGAR_AUDIT_KEYS = ['zuccheri', 'sugars', 'sugar'];

function sumMacrosFromLogSlice(log, mealPredicate) {
  let prot = 0;
  let carb = 0;
  let fat = 0;
  let sugar = 0;
  (log || []).forEach((item) => {
    if (item.type !== 'food' && item.type !== 'recipe') return;
    const mt = String(item.mealType || '').split('_')[0];
    if (mealPredicate && !mealPredicate(mt, item)) return;
    prot += Number(item.prot) || 0;
    carb += Number(item.carb) || 0;
    fat += Number(item.fatTotal ?? item.fat) || 0;
    SUGAR_AUDIT_KEYS.forEach((k) => {
      const n = Number(item[k]);
      if (Number.isFinite(n)) sugar += n;
    });
  });
  return { prot, carb, fat, sugar };
}

/**
 * Audit nutrizionale locale (nessuna API): totali giornalieri, focus cena, messaggi e suggerimento per domani.
 * @param {Array} dailyLog — log del giorno (food / recipe)
 * @param {object} userTargets — obiettivi utente (prot, carb, fatTotal|fat, …)
 * @returns {string} testo formattato per la chat
 */
export function generateLocalNutritionalAudit(dailyLog, userTargets) {
  const errors = [];
  const successes = [];
  const tgt = userTargets && typeof userTargets === 'object' ? userTargets : {};

  const targetProt = Number(tgt.prot ?? tgt.pro ?? DEFAULT_TARGETS.prot) || 0;
  const thresholdProt = targetProt > 0 ? targetProt * 0.9 : 0;

  const total = sumMacrosFromLogSlice(dailyLog, null);
  const cena = sumMacrosFromLogSlice(dailyLog, (mt) => toCanonicalMealType(mt) === 'cena');

  const prot = total.prot;
  const carb = total.carb;
  const totalFat = total.fat;
  const sugarTotal = total.sugar;
  const cenaFat = cena.fat;
  const cenaCarb = cena.carb;

  if (targetProt > 0 && prot < thresholdProt) {
    const gap = Math.max(0, Math.round((thresholdProt - prot) * 10) / 10);
    errors.push(`🔴 Mancano le proteine (${gap}g). Hai perso potenziale di sintesi muscolare.`);
  } else if (targetProt > 0 && prot >= targetProt) {
    successes.push('🟢 Target proteico centrato in pieno.');
  }

  const dinnerLipidHeavy =
    (totalFat > 0 && cenaFat > 0.35 * totalFat) || cenaFat > 25;
  if (dinnerLipidHeavy) {
    errors.push('🔴 Cena troppo lipidica. I grassi la sera rallentano la digestione e alzano lo stress notturno.');
  }

  if (cenaCarb > 40) {
    successes.push('🟢 Ottima quota di carboidrati a cena per favorire il recupero.');
  }

  if (sugarTotal > 50) {
    errors.push('🔴 Troppi zuccheri semplici oggi. Attenzione ai picchi glicemici.');
  }

  let tip = '';
  if (targetProt > 0 && prot < thresholdProt) {
    tip = '💡 Domani assicurati di non saltare gli snack per distribuire le proteine.';
  } else if (dinnerLipidHeavy) {
    tip = "💡 Domani sposta l'olio e i condimenti pesanti a pranzo.";
  } else {
    tip = '💡 Continua così: equilibrio e recupero sono sulla buona strada.';
  }

  const lines = [
    '📋 Check alimentare (locale)',
    '',
    `— Oggi: proteine ${Math.round(prot * 10) / 10}g · carboidrati ${Math.round(carb * 10) / 10}g · grassi ${Math.round(totalFat * 10) / 10}g · zuccheri semplici ~${Math.round(sugarTotal * 10) / 10}g`,
    `— Cena: carboidrati ${Math.round(cenaCarb * 10) / 10}g · grassi ${Math.round(cenaFat * 10) / 10}g`,
    '',
  ];
  if (errors.length) {
    lines.push('Da migliorare:', ...errors.map((e) => `• ${e}`), '');
  }
  if (successes.length) {
    lines.push('Punti positivi:', ...successes.map((s) => `• ${s}`), '');
  }
  lines.push(tip);
  return lines.join('\n');
}

/** Indice 0–100: quanto le ultime pesate si avvicinano alla stima (errore assoluto basso). */
export function computePredictionReliabilityPercent(errorRows, maxRecent = 8) {
  const slice = (errorRows || []).slice(-maxRecent);
  if (!slice.length) return null;
  const abs = slice.map((e) => Math.abs(Number(e.errorKg))).filter((x) => Number.isFinite(x));
  if (!abs.length) return null;
  const mae = abs.reduce((a, b) => a + b, 0) / abs.length;
  return Math.max(0, Math.min(100, Math.round(100 - mae * 42)));
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
  computeWaterHydrationAutoPilot,
  computeAccumuloSNC,
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
  SLEEP_AI_MI_FITNESS_INSTRUCTIONS,
  parseToDecimalHours,
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
  predictEnergyIntervention,
  getLocalKnowledgeBase,
  saveToKnowledgeBase,
  generateStateHash,
  KNOWLEDGE_BASE_MAX_AGE_MS
}