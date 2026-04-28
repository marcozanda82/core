import { useCallback, useEffect, useState } from 'react';
import { onValue, push, ref, update } from 'firebase/database';
import {
  buildTdeeTargetsFromRequest,
  computeDataDrivenTdeeWithCoach,
  goalFromProfile,
  mergeHistoryWithLatestWeigh,
  normalizePredictiveCalibrationState,
  recalculateUserTargets,
  removeBodyMetricsEntry,
} from '../engines/bodyMetricsEngine';

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
  inputWeight,
  inputFat,
  drawerMuscleMass,
  drawerBodyWater,
  drawerVisceralFat,
  setShowWeightModal,
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
      const arr = Object.entries(val)
        .map(([id, v]) => (v != null && typeof v === 'object' ? { id, ...v } : null))
        .filter(Boolean);
      arr.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
      setBodyMetricsHistory(arr);
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
  }, [user, db]);

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
        setUserTargets((prev) => ({
          ...prev,
          kcal: finalKcal,
          prot: newPro,
          carb: newCho,
          fat: newFat,
          fatTotal: newFat,
          ...(options.recordTdeeEval === true ? { tdeeTargetLastEvalAt: Date.now() } : {}),
        }));
        alert(
          `✅ Autopilota Metabolico attivato!\nNuovo TDEE: ${finalKcal} kcal\nProteine: ${newPro}g (Invariate)\nCarboidrati: ${newCho}g\nGrassi: ${newFat}g`
        );
      } catch (err) {
        console.error('Aggiornamento TDEE:', err);
        alert('Errore durante il salvataggio del TDEE.');
      }
    },
    [auth, db, userTargets, setUserTargets]
  );

  const applyAutomaticTargetRecalibration = useCallback(
    async (latestRecord) => {
      if (!latestRecord || typeof latestRecord !== 'object') return null;
      const w = Number(latestRecord.weight);
      if (!Number.isFinite(w) || w <= 0) return null;
      const uid = auth.currentUser?.uid;
      if (!uid) return null;
      try {
        const baseK = userTargets.kcal ?? 2000;
        const targets = recalculateUserTargets(latestRecord, userProfile, baseK);
        await update(ref(db, `users/${uid}/profile_targets`), {
          'targets/kcal': targets.kcal,
          'targets/prot': targets.prot,
          'targets/carb': targets.carb,
          'targets/fat': targets.fat,
          'targets/fatTotal': targets.fat,
        });
        setUserTargets((prev) => ({
          ...prev,
          kcal: targets.kcal,
          prot: targets.prot,
          carb: targets.carb,
          fat: targets.fat,
          fatTotal: targets.fat,
          water: targets.water,
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
    [auth, db, userProfile, userTargets.kcal, setUserTargets]
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
            setUserTargets((prev) => ({
              ...prev,
              tdeeLastDecision: plan?.decision ?? null,
              ...(notification.shouldNotify ? { tdeeLastNotificationAt: nowTs } : {}),
            }));
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
    const musclePct = parsedMuscle != null && Number.isFinite(parsedMuscle) ? parsedMuscle : null;
    const waterRaw = String(drawerBodyWater ?? '').trim();
    const parsedWater = waterRaw === '' ? null : parseFloat(waterRaw.replace(',', '.'));
    const waterPct = parsedWater != null && Number.isFinite(parsedWater) ? parsedWater : null;
    const visceralRaw = String(drawerVisceralFat ?? '').trim();
    const parsedVisceral = visceralRaw === '' ? null : parseFloat(visceralRaw.replace(',', '.'));
    const visceralFat = parsedVisceral != null && Number.isFinite(parsedVisceral) ? parsedVisceral : null;
    const weighDate = getTodayString();
    const payload = {
      weight: w,
      bodyFat,
      muscle_pct: musclePct,
      water_pct: waterPct,
      visceral_fat: visceralFat,
      timestamp: Date.now(),
      date: weighDate,
    };
    const profileUpdates = { 'profile/weight': w };
    if (bodyFat != null) profileUpdates['profile/bodyFat'] = bodyFat;
    try {
      await update(ref(db, `users/${uid}/profile_targets`), profileUpdates);
      await push(ref(db, `users/${uid}/body_metrics`), payload);
      setUserProfile((prev) => ({
        ...prev,
        weight: w,
        ...(bodyFat != null ? { bodyFat } : {}),
        ...(musclePct != null ? { muscle_pct: musclePct } : {}),
        ...(waterPct != null ? { water_pct: waterPct } : {}),
        ...(visceralFat != null ? { visceral_fat: visceralFat } : {}),
      }));
      setShowWeightModal(false);
      setInputWeight('');
      setInputFat('');
      setDrawerMuscleMass('');
      setDrawerBodyWater('');
      setDrawerVisceralFat('');
      setBodyMetricsSaveToast(true);
      setTimeout(() => setBodyMetricsSaveToast(false), 3500);

      const historyWithThisWeigh = mergeHistoryWithLatestWeigh({
        bodyMetricsHistory,
        weighDate,
        payload,
        metricEntryToIsoDay,
      });
      await evaluateAndApplyTDEE({
        weighDate,
        historyWithThisWeigh,
        latestRecord: payload,
      });
    } catch (err) {
      console.error('Salvataggio composizione corporea:', err);
      alert('Errore durante il salvataggio. Riprova.');
    }
  }, [
    auth,
    db,
    inputWeight,
    inputFat,
    drawerMuscleMass,
    drawerBodyWater,
    drawerVisceralFat,
    bodyMetricsHistory,
    evaluateAndApplyTDEE,
    metricEntryToIsoDay,
    getTodayString,
    setUserProfile,
    setShowWeightModal,
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
        timestamp: Date.now(),
        date: weighDate,
      };
      if (bodyFat != null) payload.bodyFat = bodyFat;
      if (muscle != null) payload.muscle = muscle;
      if (water != null) payload.water = water;
      if (visceral != null) payload.visceral = visceral;
      const profileUpdates = { 'profile/weight': w };
      if (bodyFat != null) profileUpdates['profile/bodyFat'] = bodyFat;
      try {
        await update(ref(db, `users/${uid}/profile_targets`), profileUpdates);
        await push(ref(db, `users/${uid}/body_metrics`), payload);
        setUserProfile((prev) => ({ ...prev, weight: w, ...(bodyFat != null ? { bodyFat } : {}) }));
        setBodyMetricsSaveToast(true);
        setTimeout(() => setBodyMetricsSaveToast(false), 3500);

        const historyWithThisWeigh = mergeHistoryWithLatestWeigh({
          bodyMetricsHistory,
          weighDate,
          payload,
          metricEntryToIsoDay,
        });
        await evaluateAndApplyTDEE({
          weighDate,
          historyWithThisWeigh,
          latestRecord: payload,
        });
      } catch (err) {
        console.error('Salvataggio pesata rapida:', err);
        alert('Errore durante il salvataggio. Riprova.');
      }
    },
    [auth, db, bodyMetricsHistory, evaluateAndApplyTDEE, metricEntryToIsoDay, getTodayString, setUserProfile]
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
      try {
        const patch = {};
        idsToDelete.forEach((id) => {
          patch[id] = null;
        });
        await update(ref(db, `users/${uid}/body_metrics`), patch);
        console.log('Pesata eliminata con successo', { entryId, deletedIds: idsToDelete });
      } catch (err) {
        console.error('Eliminazione pesata:', err);
        setBodyMetricsHistory(currentHistory);
        alert('Errore durante l’eliminazione della pesata. Riprova.');
      }
    },
    [auth, bodyMetricsHistory, db]
  );

  return {
    bodyMetricsHistory,
    predictiveCalibration,
    tdeeHistory,
    bodyMetricsSaveToast,
    handleSaveBodyMetrics,
    handleQuickWeighInFromHistory,
    handleDeleteBodyMetrics,
    handleUpdateTDEE,
    applyAutomaticTargetRecalibration,
  };
}
