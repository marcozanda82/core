import { useCallback } from 'react';
import { ref, push, update } from 'firebase/database';
import {
  extractNumber,
  parseUniversalDate,
  buildBodyMetricsColumnMap,
} from '../features/salaComandi/utils/bodyMetricsUtils';
import { mergeDuplicateBiometrics } from '../features/salaComandi/engines/bodyMetricsEngine';
import { normalizeLogData, applyMealTimes } from '../coreEngine';
import { buildMacroSplitFromKcal } from '../targetsEngine';
import { REPORT_NUTRIENT_KEYS } from '../constants/salaComandiConstants';

/**
 * Profilo, import CSV misurazioni, calcolo target intelligenti, navigazione date storico, dati report.
 * (Nel file originale la navigazione giorno era `navigateToDate`, non esiste `MapsToDate`.)
 */
export function useProfileAndTargets(ctx) {
  const {
    userUid,
    db,
    userProfile,
    birthDate,
    userTargets,
    fullHistory,
    reportPeriod,
    currentDateObj,
    setUserProfile,
    applyTargetModeUpdate,
    applyAutomaticTargetRecalibration,
    setCurrentDateObj,
    setDailyLog,
    setManualNodes,
    calculateAge,
  } = ctx;

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result;
        if (!text || typeof text !== 'string') {
          alert('File CSV vuoto o non valido.');
          return;
        }

        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          alert('File CSV vuoto o non valido.');
          return;
        }

        const uid = userUid;
        if (!uid) {
          alert('Accedi per importare le misurazioni.');
          return;
        }

        const { columnMap } = buildBodyMetricsColumnMap(lines[0]);
        const mappedIndices = Object.values(columnMap).filter((idx) => idx >= 0);
        const maxColIdx = mappedIndices.length ? Math.max(...mappedIndices) : 0;

        const payloads = [];

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].replace(/"/g, '').split(',');
          if (cols.length <= maxColIdx) continue;

          const dateRaw = (cols[columnMap.date] ?? '').trim();
          const parsed = parseUniversalDate(dateRaw);
          const weight = extractNumber(cols[columnMap.weight]);
          if (parsed == null || weight == null) continue;

          const payload = {
            date: parsed.isoDate,
            timestamp: parsed.timestamp,
            weight,
          };
          if (columnMap.fat !== -1) payload.bodyFat = extractNumber(cols[columnMap.fat]);
          if (columnMap.muscle !== -1) payload.muscle = extractNumber(cols[columnMap.muscle]);
          if (columnMap.water !== -1) payload.water = extractNumber(cols[columnMap.water]);
          if (columnMap.visceral !== -1) payload.visceral = extractNumber(cols[columnMap.visceral]);

          payloads.push(payload);
        }

        const mergedPayloads = mergeDuplicateBiometrics(payloads);

        if (mergedPayloads.length === 0) {
          alert('Nessuna riga valida trovata nel CSV.');
          return;
        }

        const metricsRef = ref(db, `users/${uid}/body_metrics`);
        const batch = {};
        for (const p of mergedPayloads) {
          const entry = {
            date: p.date,
            timestamp: p.timestamp,
            weight: p.weight,
          };
          if ('bodyFat' in p) entry.bodyFat = p.bodyFat;
          if ('muscle' in p) entry.muscle = p.muscle;
          if ('water' in p) entry.water = p.water;
          if ('visceral' in p) entry.visceral = p.visceral;
          batch[push(metricsRef).key] = entry;
        }
        await update(metricsRef, batch);

        let latest = mergedPayloads[0];
        for (let i = 1; i < mergedPayloads.length; i += 1) {
          if (mergedPayloads[i].timestamp > latest.timestamp) latest = mergedPayloads[i];
        }
        if (userTargets?.autoCalculated === true) {
          await applyAutomaticTargetRecalibration({
            weight: latest.weight,
            bodyFat: latest.bodyFat,
            muscle: latest.muscle,
            water: latest.water,
            visceral: latest.visceral,
            date: latest.date,
            timestamp: latest.timestamp,
          });
        }
        setUserProfile((prev) => ({
          ...prev,
          weight: latest.weight,
          ...(latest.bodyFat != null && Number.isFinite(Number(latest.bodyFat))
            ? { bodyFat: latest.bodyFat }
            : {}),
        }));

        const dupNote =
          payloads.length > mergedPayloads.length
            ? ` (${payloads.length} righe CSV → ${mergedPayloads.length} giorni dopo unione duplicati)`
            : '';
        alert(`✅ Importazione completata! ${mergedPayloads.length} misurazioni salvate nel database.${dupNote}`);
      } catch (err) {
        console.error('Errore importazione CSV body metrics:', err);
        alert(
          err?.message?.startsWith('CSV:')
            ? err.message
            : '❌ Errore durante la conversione o il salvataggio del CSV. Controlla la console.'
        );
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const calculateSmartTargets = () => {
    const weightKg = Number.parseFloat(String(userProfile?.weight ?? ''));
    const heightCm = Number.parseFloat(String(userProfile?.height ?? ''));
    const computedAge = calculateAge(birthDate);
    const ageYears =
      Number.isFinite(Number(computedAge)) && Number(computedAge) > 0
        ? Number(computedAge)
        : Number.parseInt(String(userProfile?.age ?? ''), 10);
    const safeWeight = Number.isFinite(weightKg) && weightKg > 0 ? weightKg : 75;
    const safeHeight = Number.isFinite(heightCm) && heightCm > 0 ? heightCm : 175;
    const safeAge = Number.isFinite(ageYears) && ageYears > 0 ? ageYears : 30;

    const genderRaw = String(userProfile?.gender ?? 'M').trim().toUpperCase();
    const isFemale = genderRaw === 'F' || genderRaw === 'FEMALE' || genderRaw === 'DONNA';

    const activityRaw = String(userProfile?.activityLevel ?? '1.55').trim().toLowerCase();
    const activityFactorMap = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    };
    const activityFromLabel = activityFactorMap[activityRaw];
    const activityFromNumeric = Number.parseFloat(activityRaw);
    const activityFactor =
      Number.isFinite(activityFromLabel) ? activityFromLabel
        : Number.isFinite(activityFromNumeric) ? activityFromNumeric
        : 1.55;

    const goalRaw = String(userProfile?.nutritionGoal || userProfile?.goal || 'maintain')
      .trim()
      .toLowerCase();
    const goalAdjustmentMap = {
      maintain: 0,
      maintenance: 0,
      mantenimento: 0,
      cut: -300,
      lose: -300,
      perdita_grasso: -300,
      dimagrimento: -300,
      recomp: -100,
      recomposition: -100,
      ricomposizione: -100,
      bulk: 250,
      gain: 250,
      massa: 250,
    };
    const goalAdjustment = goalAdjustmentMap[goalRaw] ?? 0;

    const bmr = (10 * safeWeight) + (6.25 * safeHeight) - (5 * safeAge) + (isFemale ? -161 : 5);
    const tdee = bmr * activityFactor;
    const unclampedGoalKcal = tdee + goalAdjustment;
    const clampedGoalKcal = Math.min(5000, Math.max(1200, unclampedGoalKcal));
    const goalAdjustedKcal = Math.round(clampedGoalKcal / 10) * 10;

    if (import.meta.env.DEV) {
      console.log('[UniversalSettings] auto target', {
        bmr,
        tdee,
        goalAdjustedKcal,
        activityFactor,
      });
    }

    const m = buildMacroSplitFromKcal(safeWeight, goalAdjustedKcal);
    const normalizedNutritionGoal =
      userProfile?.nutritionGoal
      || (userProfile?.goal === 'lose' ? 'cut' : userProfile?.goal === 'gain' ? 'bulk' : 'maintain');
    setUserProfile((prev) => ({
      ...prev,
      age: safeAge,
      nutritionGoal: normalizedNutritionGoal,
      goal: normalizedNutritionGoal === 'cut' ? 'lose' : normalizedNutritionGoal === 'bulk' ? 'gain' : 'maintain',
      targetCalories: m.kcal,
      proteinTarget: prev.proteinTarget,
    }));
    applyTargetModeUpdate({
      updater: (prev) => ({
        ...prev,
        kcal: m.kcal,
        prot: m.prot,
        carb: m.carb,
        fatTotal: m.fat,
        fat: m.fat,
        water: m.water,
      }),
      mode: 'auto',
      source: 'universal-auto-calc',
    });
  };

  const navigateToDate = useCallback((dateInput) => {
    const nextDate = dateInput instanceof Date ? new Date(dateInput) : new Date(`${dateInput}T12:00:00`);
    if (!Number.isFinite(nextDate.getTime())) return;
    setCurrentDateObj(nextDate);
    const offset = nextDate.getTimezoneOffset() * 60000;
    const dateStr = new Date(nextDate.getTime() - offset).toISOString().slice(0, 10);
    const dayData = fullHistory[`trackerStorico_${dateStr}`];

    if (dayData) {
      const rawLog = Array.isArray(dayData.log) ? dayData.log : Object.values(dayData.log || {});
      const normalized = normalizeLogData(rawLog);
      setDailyLog(applyMealTimes(normalized, dayData.mealTimes ?? {}));
      setManualNodes(Array.isArray(dayData.manualNodes) ? dayData.manualNodes : []);
    } else {
      setDailyLog([]);
      setManualNodes([]);
    }
  }, [fullHistory]);

  const changeDate = useCallback((daysOffset) => {
    const newDate = new Date(currentDateObj);
    newDate.setDate(newDate.getDate() + daysOffset);
    navigateToDate(newDate);
  }, [currentDateObj, navigateToDate]);

  const generateReportData = () => {
    const days = parseInt(reportPeriod, 10) || 7;
    const now = new Date();
    let totalDaysFound = 0;
    const aggregated = {};
    REPORT_NUTRIENT_KEYS.forEach(k => { aggregated[k] = 0; });

    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayData = fullHistory[`trackerStorico_${dateStr}`];

      if (!dayData) continue;

      const rawLog = Array.isArray(dayData.log) ? dayData.log : Object.values(dayData.log || []);
      const flatLog = normalizeLogData(rawLog);
      const foodItems = flatLog.filter((item) => item.type === 'food' || item.type === 'recipe');
      const intentional = dayData.isIntentionalFast === true;

      // Null (né pasti né digiuno intenzionale) → escluso dal divisore.
      if (foodItems.length === 0 && !intentional) continue;

      totalDaysFound++;
      foodItems.forEach((food) => {
        REPORT_NUTRIENT_KEYS.forEach((key) => {
          const val = key === 'kcal' ? (food.kcal ?? food.cal) : food[key];
          aggregated[key] += (parseFloat(val) || 0);
        });
      });
      // Digiuno intenzionale senza pasti: contribuisce 0 ai totali ma conta nel divisore.
    }

    if (totalDaysFound === 0) return null;
    const averages = {};
    REPORT_NUTRIENT_KEYS.forEach(key => {
      averages[key] = aggregated[key] / totalDaysFound;
    });
    return { averages, daysFound: totalDaysFound };
  };

  return {
    handleCSVUpload,
    calculateSmartTargets,
    navigateToDate,
    changeDate,
    generateReportData,
  };
}
