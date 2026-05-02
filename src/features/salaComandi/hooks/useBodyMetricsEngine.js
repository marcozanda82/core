import { useCallback, useEffect, useRef, useState } from 'react';
import { onValue, push, ref, update } from 'firebase/database';
import {
  analyzeEnergyVsWeightTrend,
  bodyMetricTimestampFromDate,
  buildTdeeTargetsFromRequest,
  clampBodyMetricDateToToday,
  computeDataDrivenTdeeWithCoach,
  deriveCurrentBodyMetricsFromHistory,
  goalFromProfile,
  mergeHistoryWithLatestWeigh,
  normalizeBodyMetricDate,
  normalizePredictiveCalibrationState,
  recalculateUserTargets,
  removeBodyMetricsEntry,
  sortBodyMetricsHistoryByDateAsc,
  upsertTargetHistoryEntry,
} from '../engines/bodyMetricsEngine';

function isRecalibrationApplyAllowed(analysis) {
  if (!analysis || typeof analysis !== 'object') return false;
  const kcalAdj = Number(analysis.suggestion?.kcalAdjustment);
  return (
    analysis.diagnosisType === 'tdee_mismatch' &&
    analysis.confidence === 'high' &&
    Number.isFinite(kcalAdj) &&
    kcalAdj !== 0 &&
    analysis.suggestion?.type !== 'no_change'
  );
}

export default function useBodyMetricsEngine({
  auth,
  db,
  user,
  fullHistory,
  userProfile,
  userTargets,
  setUserProfile,
  setUserTargets,
  computeMetabolicNotification,
  metricEntryToIsoDay,
  getTodayString,
  inputWeightDate,
  inputWeight,
  inputFat,
  drawerMuscleMass,
  drawerBodyWater,
  drawerVisceralFat,
  setShowWeightModal,
  setInputWeightDate,
  setInputWeight,
  setInputFat,
  setDrawerMuscleMass,
  setDrawerBodyWater,
  setDrawerVisceralFat,
}) {
  const [bodyMetricsHistory, setBodyMetricsHistory] = useState([]);
  const [predictiveCalibration, setPredictiveCalibration] = useState({ errors: [] });
  const [tdeeHistory, setTdeeHistory] = useState([]);
  const [bodyMetricsSaveToast, setBodyMetricsSaveToast] = useState(false);
  const [recalibrationProposal, setRecalibrationProposal] = useState({
    show: false,
    analysis: null,
    daysWindow: 14,
  });
  const blockMacroMutationFromWeighInFlowRef = useRef(false);

  const setUserTargetsGuarded = useCallback(
    (updater, source = 'unknown') => {
      setUserTargets((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        if (!next || typeof next !== 'object') return prev;
        if (!blockMacroMutationFromWeighInFlowRef.current) return next;
        const macroKeys = ['kcal', 'prot', 'carb', 'fat', 'fatTotal', 'water'];
        const hasMacroMutation = macroKeys.some((key) => Number(next[key]) !== Number(prev[key]));
        if (!hasMacroMutation) return next;
        console.warn('[BodyMetrics] blocked macro target mutation from weigh-in flow', {
          source,
          prev,
          attempted: next,
        });
        return prev;
      });
    },
    [setUserTargets]
  );

  const metricEntryToIsoDaySafe = useCallback(
    (entry) => {
      if (typeof metricEntryToIsoDay === 'function') {
        const fromExternal = metricEntryToIsoDay(entry);
        if (typeof fromExternal === 'string' && fromExternal) return fromExternal.slice(0, 10);
      }
      return normalizeBodyMetricDate({
        date: entry?.date,
        timestamp: entry?.timestamp,
        fallbackDate: getTodayString(),
      });
    },
    [metricEntryToIsoDay, getTodayString]
  );

  const pickFirstFiniteNumber = useCallback((entry, keys) => {
    for (let i = 0; i < keys.length; i += 1) {
      const n = Number(entry?.[keys[i]]);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }, []);

  const deriveLatestMetricsFromHistory = useCallback(
    (history) => {
      const latestEntry = deriveCurrentBodyMetricsFromHistory(history, getTodayString());
      if (import.meta.env.DEV) {
        console.log('[BodyMetrics] derived current metrics from history', {
          latestEntry,
          historyLength: Array.isArray(history) ? history.length : 0,
        });
      }
      return latestEntry;
    },
    [getTodayString]
  );

  const syncCurrentProfileFromHistory = useCallback(
    async ({ uid, history }) => {
      const latestEntry = deriveLatestMetricsFromHistory(history);
      const nextWeight = Number(latestEntry?.weight);
      const nextBodyFat = pickFirstFiniteNumber(latestEntry, ['bodyFat']);
      const nextMuscleMass = pickFirstFiniteNumber(latestEntry, ['muscleMass', 'muscle', 'leanMass']);
      const nextBodyWater = pickFirstFiniteNumber(latestEntry, ['bodyWater', 'water', 'waterPercentage']);
      const nextVisceralFat = pickFirstFiniteNumber(latestEntry, ['visceralFat', 'visceral', 'visceral_fat']);

      await update(ref(db, `users/${uid}/profile_targets`), {
        'profile/weight': Number.isFinite(nextWeight) && nextWeight > 0 ? nextWeight : null,
        'profile/bodyFat': nextBodyFat,
        'profile/muscleMass': nextMuscleMass,
        'profile/bodyWater': nextBodyWater,
        'profile/visceralFat': nextVisceralFat,
      });

      setUserProfile((prev) => ({
        ...prev,
        weight: Number.isFinite(nextWeight) && nextWeight > 0 ? nextWeight : null,
        bodyFat: nextBodyFat,
        muscleMass: nextMuscleMass,
        bodyWater: nextBodyWater,
        visceralFat: nextVisceralFat,
      }));
    },
    [db, deriveLatestMetricsFromHistory, pickFirstFiniteNumber, setUserProfile]
  );

  const maybeCreateRecalibrationProposal = useCallback(
    ({ history, weighDate, daysWindow = 14 }) => {
      const safeHistory = Array.isArray(history) ? history : [];
      let result = null;
      let reason = 'wiring_error';
      let shouldShow = false;
      if (safeHistory.length < 2) {
        reason = 'insufficient_weigh_ins';
        console.log('[RecalibrationPromptDecision]', {
          shouldShow,
          reason,
          applyAllowed: isRecalibrationApplyAllowed(result),
          diagnosisType: result?.diagnosisType,
          confidence: result?.confidence,
          blockRecalibration: result?.blockRecalibration,
          latestIsOutlier: result?.latestIsOutlier,
          outlierDetected: result?.outlierDetected,
          suggestionType: result?.suggestion?.type,
          kcalAdjustment: result?.suggestion?.kcalAdjustment,
        });
        return { shouldShow, reason, result, dailyLogsAvailable: 0 };
      }
      result = analyzeEnergyVsWeightTrend({
        bodyMetricsHistory: safeHistory,
        fullHistory,
        userTargets,
        calorieStrategy: null,
        daysWindow,
      });
      console.log('[RecalibrationAnalysis]', result);
      console.log('[RecalibrationDiagnosis]', {
        diagnosisType: result?.diagnosisType,
        diagnosisMessage: result?.diagnosisMessage,
        avgKcalBalance: result?.avgKcalBalance,
        weightDelta: result?.weightDelta,
        expectedWeightDelta: result?.expectedWeightDelta,
        discrepancy: result?.discrepancy,
        confidence: result?.confidence,
        confidenceScore: result?.confidenceScore,
        validDays: result?.validDays,
      });
      console.log('[RecalibrationDailyWindow]', {
        daysWindow,
        validDays: Number(result?.validDays) || 0,
        avgKcalBalance: result?.avgKcalBalance,
        sampleDays: Array.isArray(result?.sampleDays) ? result.sampleDays : [],
      });
      if (!result) {
        reason = 'wiring_error';
      } else {
        const kcalAdj = Number(result.suggestion?.kcalAdjustment);
        const informativeDiagnoses = [
          'tdee_mismatch',
          'intake_tracking_error',
          'low_confidence',
          'normal_variation',
        ];
        const outlierBlocked = result.blockRecalibration === true || result.latestIsOutlier === true;
        shouldShow = Boolean(
          !outlierBlocked && informativeDiagnoses.includes(result.diagnosisType),
        );

        if (!shouldShow) {
          if (result.blockRecalibration === true || result.latestIsOutlier === true) {
            reason = 'blocked_outlier';
          } else if (!informativeDiagnoses.includes(result.diagnosisType)) {
            reason = 'no_diagnosis';
          } else if (result.confidence === 'low') {
            reason = 'low_confidence';
          } else if (result.suggestion?.type === 'no_change' || !Number.isFinite(kcalAdj) || kcalAdj === 0) {
            reason = 'no_change';
          } else {
            reason = 'suppressed';
          }
        } else if (userTargets?.autoCalculated === false && userTargets?.postWeighInRecalibrationDisabled === true) {
          shouldShow = false;
          reason = 'manual_targets';
        } else {
          reason = 'show';
          setRecalibrationProposal({
            show: true,
            analysis: {
              ...result,
              weighDate,
              daysWindow,
            },
            daysWindow,
          });
        }
      }
      console.log('[RecalibrationPromptDecision]', {
        shouldShow,
        reason,
        applyAllowed: isRecalibrationApplyAllowed(result),
        diagnosisType: result?.diagnosisType,
        confidence: result?.confidence,
        blockRecalibration: result?.blockRecalibration,
        latestIsOutlier: result?.latestIsOutlier,
        outlierDetected: result?.outlierDetected,
        suggestionType: result?.suggestion?.type,
        kcalAdjustment: result?.suggestion?.kcalAdjustment,
      });
      return { shouldShow, reason, result, dailyLogsAvailable: Number(result?.validDays) || 0 };
    },
    [fullHistory, userTargets]
  );

  useEffect(() => {
    if (!user) {
      setBodyMetricsHistory([]);
      setPredictiveCalibration({ errors: [] });
      setTdeeHistory([]);
      return undefined;
    }

    const unsubBodyMetrics = onValue(ref(db, `users/${user.uid}/body_metrics`), (metricsSnap) => {
      const val = metricsSnap.val();
      if (!val || typeof val !== 'object') {
        setBodyMetricsHistory([]);
        return;
      }
      const fallbackDate = getTodayString();
      const arr = Object.entries(val)
        .map(([id, v]) => (v != null && typeof v === 'object' ? { id, ...v } : null))
        .filter(Boolean);
      setBodyMetricsHistory(sortBodyMetricsHistoryByDateAsc(arr, fallbackDate));
    });

    const unsubTdeeHistory = onValue(ref(db, `users/${user.uid}/tdee_history`), (snap) => {
      const val = snap.val();
      if (!val || typeof val !== 'object') {
        setTdeeHistory([]);
        return;
      }
      const arr = Object.entries(val)
        .map(([id, v]) => (v != null && typeof v === 'object' ? { id, ...v } : null))
        .filter(Boolean);
      arr.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
      setTdeeHistory(arr);
    });

    const unsubPredictiveCalibration = onValue(
      ref(db, `users/${user.uid}/predictive_body_calibration`),
      (calSnap) => {
        setPredictiveCalibration(normalizePredictiveCalibrationState(calSnap.val()));
      }
    );

    return () => {
      unsubBodyMetrics();
      unsubTdeeHistory();
      unsubPredictiveCalibration();
    };
  }, [user, db, getTodayString]);

  const handleUpdateTDEE = useCallback(
    async (newKcal, options = {}) => {
      const built = buildTdeeTargetsFromRequest({
        newKcal,
        userTargets,
        protOverride: options.prot,
      });
      if (built.error) {
        alert(built.error);
        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) {
        alert('Accedi per aggiornare il TDEE.');
        return;
      }

      const { finalKcal, newPro, newCho, newFat } = built;

      try {
        const payload = {
          'targets/kcal': finalKcal,
          'targets/prot': newPro,
          'targets/carb': newCho,
          'targets/fat': newFat,
          'targets/fatTotal': newFat,
        };
        if (options.recordTdeeEval === true) {
          payload['targets/tdeeTargetLastEvalAt'] = Date.now();
        }
        await update(ref(db, `users/${uid}/profile_targets`), payload);
        try {
          await push(ref(db, `users/${uid}/tdee_history`), {
            date: new Date().toISOString().split('T')[0],
            timestamp: Date.now(),
            tdee: finalKcal,
            prot: newPro,
            carb: newCho,
            fat: newFat,
          });
        } catch (histErr) {
          console.error('Salvataggio tdee_history:', histErr);
        }
        setUserTargetsGuarded((prev) => ({
          ...prev,
          kcal: finalKcal,
          prot: newPro,
          carb: newCho,
          fat: newFat,
          fatTotal: newFat,
          ...(options.recordTdeeEval === true ? { tdeeTargetLastEvalAt: Date.now() } : {}),
        }), 'handleUpdateTDEE');
        alert(
          `✅ Autopilota Metabolico attivato!\nNuovo TDEE: ${finalKcal} kcal\nProteine: ${newPro}g (Invariate)\nCarboidrati: ${newCho}g\nGrassi: ${newFat}g`
        );
      } catch (err) {
        console.error('Aggiornamento TDEE:', err);
        alert('Errore durante il salvataggio del TDEE.');
      }
    },
    [auth, db, userTargets, setUserTargetsGuarded]
  );

  const applyAutomaticTargetRecalibration = useCallback(
    async (latestRecord) => {
      if (!latestRecord || typeof latestRecord !== 'object') return null;
      if (userTargets?.autoCalculated !== true) return null;
      const w = Number(latestRecord.weight);
      if (!Number.isFinite(w) || w <= 0) return null;
      const uid = auth.currentUser?.uid;
      if (!uid) return null;
      try {
        const baseK = userTargets.kcal ?? 2000;
        const targets = recalculateUserTargets(latestRecord, userProfile, baseK);
        const effectiveDate = normalizeBodyMetricDate({
          date: latestRecord?.date,
          timestamp: latestRecord?.timestamp,
          fallbackDate: getTodayString(),
        });
        const nextTargetHistory = upsertTargetHistoryEntry({
          history: userTargets?.targetHistory,
          effectiveDate,
          targets,
          todayDate: getTodayString(),
          source: 'auto-target-recalibration',
          seedPreviousTargets: userTargets,
        });
        await update(ref(db, `users/${uid}/profile_targets`), {
          'targets/kcal': targets.kcal,
          'targets/prot': targets.prot,
          'targets/carb': targets.carb,
          'targets/fat': targets.fat,
          'targets/fatTotal': targets.fat,
          'targets/water': targets.water,
          'targets/autoCalculated': true,
          'targets/targetHistory': nextTargetHistory,
        });
        setUserTargets((prev) => ({
          ...prev,
          kcal: targets.kcal,
          prot: targets.prot,
          carb: targets.carb,
          fat: targets.fat,
          fatTotal: targets.fat,
          water: targets.water,
          autoCalculated: true,
          targetHistory: nextTargetHistory,
        }));
        return {
          kcal: targets.kcal,
          prot: targets.prot,
          carb: targets.carb,
          fat: targets.fat,
        };
      } catch (err) {
        console.warn('Ricalibrazione automatica macro:', err);
        return null;
      }
    },
    [auth, db, getTodayString, setUserTargets, userProfile, userTargets]
  );

  const evaluateAndApplyTDEE = useCallback(
    async ({ weighDate, historyWithThisWeigh, latestRecord }) => {
      try {
        const plan = computeDataDrivenTdeeWithCoach({
          anchorDateIso: weighDate,
          fullHistory,
          bodyMetricsHistory: historyWithThisWeigh,
          goal: goalFromProfile(userProfile),
          currentCalorieTarget: userTargets?.kcal,
          lastTdeeEvalAt: userTargets?.tdeeTargetLastEvalAt,
        });
        const uid = auth.currentUser?.uid;
        if (uid) {
          const notification = computeMetabolicNotification({
            plan,
            lastNotificationAt: userTargets?.tdeeLastNotificationAt,
            lastDecision: userTargets?.tdeeLastDecision,
          });
          const nowTs = Date.now();
          const metadataPatch = {
            'targets/tdeeLastDecision': plan?.decision ?? null,
          };
          if (notification.shouldNotify) {
            metadataPatch['targets/tdeeLastNotificationAt'] = nowTs;
          }
          try {
            await update(ref(db, `users/${uid}/profile_targets`), metadataPatch);
            setUserTargetsGuarded((prev) => ({
              ...prev,
              tdeeLastDecision: plan?.decision ?? null,
              ...(notification.shouldNotify ? { tdeeLastNotificationAt: nowTs } : {}),
            }), 'evaluateAndApplyTDEE:metadata');
            if (notification.shouldNotify && notification.message) {
              alert(notification.message);
            }
          } catch (notifyErr) {
            console.warn('Notifica metabolica:', notifyErr);
          }
        }
        if (plan.status === 'hold' || !plan.canUpdate || plan.calorie_target == null) {
          return plan;
        }
        const recalTargets = await applyAutomaticTargetRecalibration(latestRecord);
        if (plan.canUpdate && plan.calorie_target != null) {
          await handleUpdateTDEE(plan.calorie_target, {
            prot: recalTargets?.prot,
            recordTdeeEval: true,
          });
        }
        return plan;
      } catch (calErr) {
        console.warn('Valutazione TDEE data-driven:', calErr);
        return null;
      }
    },
    [
      auth,
      db,
      fullHistory,
      userProfile,
      userTargets?.kcal,
      userTargets?.tdeeLastDecision,
      userTargets?.tdeeLastNotificationAt,
      userTargets?.tdeeTargetLastEvalAt,
      applyAutomaticTargetRecalibration,
      handleUpdateTDEE,
      computeMetabolicNotification,
      setUserTargets,
    ]
  );

  const handleSaveBodyMetrics = useCallback(async () => {
    const w = parseFloat(String(inputWeight).replace(',', '.'));
    if (!Number.isFinite(w) || w <= 0) {
      alert('Inserisci un peso valido (maggiore di 0).');
      return;
    }
    const currentUser = auth.currentUser;
    if (!currentUser?.uid) {
      alert('Accedi per registrare la pesata.');
      return;
    }
    const uid = currentUser.uid;
    const fatRaw = String(inputFat ?? '').trim();
    const parsedFat = fatRaw === '' ? null : parseFloat(fatRaw.replace(',', '.'));
    const bodyFat = parsedFat != null && Number.isFinite(parsedFat) ? parsedFat : null;
    const muscleRaw = String(drawerMuscleMass ?? '').trim();
    const parsedMuscle = muscleRaw === '' ? null : parseFloat(muscleRaw.replace(',', '.'));
    const muscleMass = parsedMuscle != null && Number.isFinite(parsedMuscle) ? parsedMuscle : null;
    const waterRaw = String(drawerBodyWater ?? '').trim();
    const parsedWater = waterRaw === '' ? null : parseFloat(waterRaw.replace(',', '.'));
    const bodyWater = parsedWater != null && Number.isFinite(parsedWater) ? parsedWater : null;
    const visceralRaw = String(drawerVisceralFat ?? '').trim();
    const parsedVisceral = visceralRaw === '' ? null : parseFloat(visceralRaw.replace(',', '.'));
    const visceralFat = parsedVisceral != null && Number.isFinite(parsedVisceral) ? parsedVisceral : null;
    const todayDate = getTodayString();
    const selectedDate = clampBodyMetricDateToToday({
      date: normalizeBodyMetricDate({
        date: inputWeightDate,
        timestamp: null,
        fallbackDate: todayDate,
      }),
      todayDate,
    });
    if (selectedDate !== String(inputWeightDate || '').slice(0, 10)) {
      alert('La data futura non è consentita. Uso la data di oggi.');
    }
    const weighDate = selectedDate;
    const payload = {
      weight: w,
      bodyFat,
      muscleMass,
      bodyWater,
      visceralFat,
      timestamp: bodyMetricTimestampFromDate(weighDate),
      date: weighDate,
    };
    const currentHistory = Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : [];
    const historyWithThisWeigh = mergeHistoryWithLatestWeigh({
      bodyMetricsHistory: currentHistory,
      weighDate,
      payload,
      metricEntryToIsoDay: metricEntryToIsoDaySafe,
    });
    const nextHistory = sortBodyMetricsHistoryByDateAsc(historyWithThisWeigh, getTodayString());
    const idsToDelete = currentHistory
      .filter((entry) => metricEntryToIsoDaySafe(entry) === weighDate)
      .map((entry) => (typeof entry?.id === 'string' ? entry.id : ''))
      .filter(Boolean);

    setBodyMetricsHistory(nextHistory);
    blockMacroMutationFromWeighInFlowRef.current = true;
    try {
      const metricsPatch = {};
      idsToDelete.forEach((id) => {
        metricsPatch[id] = null;
      });
      const newEntryKey = push(ref(db, `users/${uid}/body_metrics`)).key;
      if (!newEntryKey) throw new Error('Impossibile creare la nuova entry body_metrics.');
      metricsPatch[newEntryKey] = payload;
      await update(ref(db, `users/${uid}/body_metrics`), metricsPatch);
      await syncCurrentProfileFromHistory({ uid, history: nextHistory });
      const proposalDecision = maybeCreateRecalibrationProposal({
        history: nextHistory,
        weighDate,
        daysWindow: 14,
      });
      const dailyLogsAvailable = Number(proposalDecision?.dailyLogsAvailable) || 0;
      console.log('[PostWeighInRecalibrationTrigger]', {
        savedEntry: payload,
        bodyMetricsHistoryLength: nextHistory.length,
        dailyLogsAvailable,
        userTargets,
      });
      setShowWeightModal(false);
      setInputWeightDate(getTodayString());
      setInputWeight('');
      setInputFat('');
      setDrawerMuscleMass('');
      setDrawerBodyWater('');
      setDrawerVisceralFat('');
      setBodyMetricsSaveToast(true);
      setTimeout(() => setBodyMetricsSaveToast(false), 3500);

      console.log('[BodyMetrics] save weigh-in without target recalculation', payload);
    } catch (err) {
      console.error('Salvataggio composizione corporea:', err);
      setBodyMetricsHistory(currentHistory);
      alert('Errore durante il salvataggio. Riprova.');
    } finally {
      blockMacroMutationFromWeighInFlowRef.current = false;
    }
  }, [
    auth,
    db,
    inputWeight,
    inputWeightDate,
    inputFat,
    drawerMuscleMass,
    drawerBodyWater,
    drawerVisceralFat,
    bodyMetricsHistory,
    metricEntryToIsoDaySafe,
    getTodayString,
    userTargets,
    maybeCreateRecalibrationProposal,
    syncCurrentProfileFromHistory,
    setShowWeightModal,
    setInputWeightDate,
    setInputWeight,
    setInputFat,
    setDrawerMuscleMass,
    setDrawerBodyWater,
    setDrawerVisceralFat,
  ]);

  const handleQuickWeighInFromHistory = useCallback(
    async ({ weight, bodyFat, muscle, water, visceral }) => {
      const w = Number(weight);
      if (!Number.isFinite(w) || w <= 0) return;
      const currentUser = auth.currentUser;
      if (!currentUser?.uid) {
        alert('Accedi per registrare la pesata.');
        return;
      }
      const uid = currentUser.uid;
      const weighDate = getTodayString();
      const payload = {
        weight: w,
        timestamp: bodyMetricTimestampFromDate(weighDate),
        date: weighDate,
      };
      if (bodyFat != null) payload.bodyFat = bodyFat;
      if (muscle != null) payload.muscleMass = muscle;
      if (water != null) payload.bodyWater = water;
      if (visceral != null) payload.visceralFat = visceral;
      const currentHistory = Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : [];
      const historyWithThisWeigh = mergeHistoryWithLatestWeigh({
        bodyMetricsHistory: currentHistory,
        weighDate,
        payload,
        metricEntryToIsoDay: metricEntryToIsoDaySafe,
      });
      const nextHistory = sortBodyMetricsHistoryByDateAsc(historyWithThisWeigh, getTodayString());
      const idsToDelete = currentHistory
        .filter((entry) => metricEntryToIsoDaySafe(entry) === weighDate)
        .map((entry) => (typeof entry?.id === 'string' ? entry.id : ''))
        .filter(Boolean);

      setBodyMetricsHistory(nextHistory);
      blockMacroMutationFromWeighInFlowRef.current = true;
      try {
        const metricsPatch = {};
        idsToDelete.forEach((id) => {
          metricsPatch[id] = null;
        });
        const newEntryKey = push(ref(db, `users/${uid}/body_metrics`)).key;
        if (!newEntryKey) throw new Error('Impossibile creare la nuova entry body_metrics.');
        metricsPatch[newEntryKey] = payload;
        await update(ref(db, `users/${uid}/body_metrics`), metricsPatch);
        await syncCurrentProfileFromHistory({ uid, history: nextHistory });
        maybeCreateRecalibrationProposal({ history: nextHistory, weighDate, daysWindow: 14 });
        setBodyMetricsSaveToast(true);
        setTimeout(() => setBodyMetricsSaveToast(false), 3500);

        console.log('[BodyMetrics] save weigh-in without target recalculation', payload);
      } catch (err) {
        console.error('Salvataggio pesata rapida:', err);
        setBodyMetricsHistory(currentHistory);
        alert('Errore durante il salvataggio. Riprova.');
      } finally {
        blockMacroMutationFromWeighInFlowRef.current = false;
      }
    },
    [
      auth,
      db,
      bodyMetricsHistory,
      metricEntryToIsoDaySafe,
      getTodayString,
      maybeCreateRecalibrationProposal,
      syncCurrentProfileFromHistory,
    ]
  );

  const handleDeleteBodyMetrics = useCallback(
    async (entryId) => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        alert('Accedi per eliminare una pesata.');
        return;
      }
      const currentHistory = Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : [];
      const nextHistory = removeBodyMetricsEntry({ history: currentHistory, entryId });
      if (nextHistory === currentHistory || nextHistory.length === currentHistory.length) {
        console.log('Nessuna pesata rimossa: entryId non trovato.', entryId);
        return;
      }

      const idKey = String(entryId ?? '');
      const directMatches = currentHistory.filter((entry) => String(entry?.id ?? '') === idKey);
      const ts = Number(entryId);
      const timestampMatches =
        directMatches.length === 0 && Number.isFinite(ts)
          ? currentHistory.filter((entry) => Number(entry?.timestamp) === ts)
          : [];
      const idsToDelete = [...directMatches, ...timestampMatches]
        .map((entry) => (typeof entry?.id === 'string' ? entry.id : ''))
        .filter(Boolean);

      if (idsToDelete.length === 0) {
        console.warn('Eliminazione pesata annullata: nessun id Firebase trovato per entryId', entryId);
        return;
      }

      setBodyMetricsHistory(nextHistory);
      blockMacroMutationFromWeighInFlowRef.current = true;
      try {
        const patch = {};
        idsToDelete.forEach((id) => {
          patch[id] = null;
        });
        await update(ref(db, `users/${uid}/body_metrics`), patch);
        await syncCurrentProfileFromHistory({ uid, history: nextHistory });
        console.log('Pesata eliminata con successo', { entryId, deletedIds: idsToDelete });
      } catch (err) {
        console.error('Eliminazione pesata:', err);
        setBodyMetricsHistory(currentHistory);
        alert('Errore durante l’eliminazione della pesata. Riprova.');
      } finally {
        blockMacroMutationFromWeighInFlowRef.current = false;
      }
    },
    [
      auth,
      bodyMetricsHistory,
      db,
      syncCurrentProfileFromHistory,
    ]
  );

  const dismissRecalibrationProposal = useCallback(() => {
    setRecalibrationProposal((prev) => ({ ...prev, show: false }));
  }, []);

  const applyRecalibrationProposal = useCallback(async () => {
    const proposal = recalibrationProposal?.analysis;
    if (!isRecalibrationApplyAllowed(proposal)) {
      console.warn('[RecalibrationApplyBlocked]', {
        diagnosisType: proposal?.diagnosisType,
        confidence: proposal?.confidence,
        suggestion: proposal?.suggestion,
      });
      return;
    }
    if (
      proposal?.blockRecalibration === true ||
      proposal?.hardBlockOutlier === true ||
      proposal?.latestIsOutlier === true ||
      proposal?.outlierDetected === true
    ) {
      setRecalibrationProposal((prev) => ({ ...prev, show: false }));
      return;
    }
    const suggestedAdjustment = Number(proposal?.suggestion?.kcalAdjustment);
    const uid = auth.currentUser?.uid;
    if (!uid) {
      alert('Accedi per aggiornare i target.');
      return;
    }
    const currentKcal = Number(userTargets?.kcal);
    const baseKcal = Number.isFinite(currentKcal) && currentKcal > 0 ? currentKcal : 2000;
    const requestedKcal = Math.max(800, Math.min(12000, Math.round(baseKcal + suggestedAdjustment)));
    const built = buildTdeeTargetsFromRequest({ newKcal: requestedKcal, userTargets });
    if (built.error) {
      alert(built.error);
      return;
    }
    const { finalKcal, newPro, newCho, newFat } = built;
    const effectiveDate = getTodayString();
    const nextTargetHistory = upsertTargetHistoryEntry({
      history: userTargets?.targetHistory,
      effectiveDate,
      targets: {
        kcal: finalKcal,
        prot: newPro,
        carb: newCho,
        fat: newFat,
        fatTotal: newFat,
      },
      todayDate: getTodayString(),
      source: 'post-weigh-in-proposal',
      seedPreviousTargets: userTargets,
    });
    await update(ref(db, `users/${uid}/profile_targets`), {
      'targets/kcal': finalKcal,
      'targets/prot': newPro,
      'targets/carb': newCho,
      'targets/fat': newFat,
      'targets/fatTotal': newFat,
      'targets/autoCalculated': true,
      'targets/targetHistory': nextTargetHistory,
    });
    setUserTargets((prev) => ({
      ...prev,
      kcal: finalKcal,
      prot: newPro,
      carb: newCho,
      fat: newFat,
      fatTotal: newFat,
      autoCalculated: true,
      targetHistory: nextTargetHistory,
    }));
    setRecalibrationProposal((prev) => ({ ...prev, show: false }));
  }, [auth, db, getTodayString, recalibrationProposal?.analysis, setUserTargets, userTargets]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.KENTU_RECALC_TARGETS_FROM_CURRENT_TDEE = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        console.warn('[BodyMetrics] helper aborted: user not authenticated');
        return null;
      }
      const baseK = Number(userTargets?.kcal);
      const latestRecord = {
        weight: Number(userProfile?.weight),
        bodyFat:
          userProfile?.bodyFat != null && userProfile?.bodyFat !== ''
            ? Number(userProfile.bodyFat)
            : null,
        muscleMass:
          userProfile?.muscleMass ??
          userProfile?.muscle ??
          userProfile?.leanMass ??
          userProfile?.muscle_pct ??
          null,
        bodyWater:
          userProfile?.bodyWater ??
          userProfile?.water ??
          userProfile?.waterPercentage ??
          userProfile?.water_pct ??
          null,
        visceralFat:
          userProfile?.visceralFat ??
          userProfile?.visceral ??
          userProfile?.visceral_fat ??
          null,
      };
      const targets = recalculateUserTargets(latestRecord, userProfile, Number.isFinite(baseK) ? baseK : 2000);
      await update(ref(db, `users/${uid}/profile_targets`), {
        'targets/kcal': targets.kcal,
        'targets/prot': targets.prot,
        'targets/carb': targets.carb,
        'targets/fat': targets.fat,
        'targets/fatTotal': targets.fat,
      });
      setUserTargetsGuarded((prev) => ({
        ...prev,
        kcal: targets.kcal,
        prot: targets.prot,
        carb: targets.carb,
        fat: targets.fat,
        fatTotal: targets.fat,
        water: targets.water,
      }), 'dev:KENTU_RECALC_TARGETS_FROM_CURRENT_TDEE');
      console.log('[BodyMetrics] dev helper recalculated targets from current profile + kcal', {
        baseK,
        latestRecord,
        targets,
      });
      return targets;
    };
    return () => {
      delete window.KENTU_RECALC_TARGETS_FROM_CURRENT_TDEE;
    };
  }, [auth, db, userProfile, userTargets?.kcal, setUserTargetsGuarded]);

  return {
    bodyMetricsHistory,
    predictiveCalibration,
    tdeeHistory,
    bodyMetricsSaveToast,
    recalibrationProposal,
    handleSaveBodyMetrics,
    handleQuickWeighInFromHistory,
    handleDeleteBodyMetrics,
    applyRecalibrationProposal,
    dismissRecalibrationProposal,
    handleUpdateTDEE,
    applyAutomaticTargetRecalibration,
    evaluateAndApplyTDEE,
  };
}
