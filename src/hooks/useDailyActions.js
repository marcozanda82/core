import { useCallback } from 'react';

export default function useDailyActions({
  isSimulationMode,
  alcoholForm,
  manualNodes,
  dailyLog,
  drawerWaterTime,
  drawerFastChargeStart,
  drawerFastChargeEnd,
  drawerFastChargeTime,
  fastChargeSupplementName,
  workoutType,
  workoutStrengthDetail,
  workoutDurationHours,
  workoutStartTime,
  editingWorkoutId,
  workoutMuscles,
  workoutKcal,
  simulatedLog,
  stimulantSubtype,
  stimulantTime,
  sleepFormBedStr,
  sleepFormWakeStr,
  sleepModal,
  editingQuickNode,
  setManualNodes,
  setDailyLog,
  setSimulatedLog,
  syncDatiFirebase,
  setShowAlcoholPopup,
  setActiveAction,
  setFastChargeSupplementName,
  setEditingWorkoutId,
  setWorkoutMuscles,
  setWorkoutStrengthDetail,
  closeDrawer,
  setShowChoiceModal,
  setAddChoiceView,
  parseTimeStrToDecimal,
  computeSleepDurationHours,
  dismissKentuSleepTrigger,
  setSleepModal,
  setEditingQuickNode,
  normalizeMuscleGroupArray,
  workoutActivityRequiresStrengthDetailNote,
  getWorkoutActivityTypeDef,
  getWorkoutActivityLogDescription,
  getCognitiveMetForActivity,
}) {
  const handleSaveAlcohol = useCallback(() => {
    if (isSimulationMode) return;
    if (!alcoholForm.timeStr || !alcoholForm.timeStr.includes(':')) return;
    const [h, m] = alcoholForm.timeStr.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const timeFloat = h + (m / 60);

    const ml = Number(alcoholForm.ml);
    const abv = Number(alcoholForm.abv);
    const pureAlcoholGrams = ml * (abv / 100) * 0.8;
    const kcal = pureAlcoholGrams * 7;

    const sub = String(alcoholForm.subtype || 'vino');
    const newNode = {
      id: `alcohol_${Date.now()}`,
      type: 'alcohol',
      subtype: sub,
      name: sub.charAt(0).toUpperCase() + sub.slice(1),
      time: timeFloat,
      ml,
      abv,
      pureAlcohol: pureAlcoholGrams,
      kcal: Math.round(kcal),
    };

    const next = [...manualNodes, newNode].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    setManualNodes(next);
    syncDatiFirebase(dailyLog, next);
    setShowAlcoholPopup(false);
  }, [isSimulationMode, alcoholForm, manualNodes, setManualNodes, syncDatiFirebase, dailyLog, setShowAlcoholPopup]);

  const handleAddWater = useCallback((amount) => {
    if (isSimulationMode) return;
    if (amount > 0) {
      const next = [...manualNodes, { id: `water_${Date.now()}`, type: 'water', time: drawerWaterTime, ml: amount }];
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
    } else {
      const toRemove = amount === -250 ? 1 : 2;
      const waterNodes = manualNodes.filter((n) => n.type === 'water');
      const idsToRemove = waterNodes.slice(-toRemove).map((n) => n.id);
      const next = manualNodes.filter((n) => !idsToRemove.includes(n.id));
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
    }
  }, [isSimulationMode, manualNodes, drawerWaterTime, setManualNodes, syncDatiFirebase, dailyLog]);

  const handleSaveFastCharge = useCallback((chargeType) => {
    if (isSimulationMode) return;
    const id = `${chargeType}_${Date.now()}`;
    let node = { id, type: chargeType };
    if (chargeType === 'nap' || chargeType === 'meditation') {
      let duration = Number(drawerFastChargeEnd) - Number(drawerFastChargeStart);
      if (duration < 0) duration += 24;
      duration = Math.max(0.08, Math.min(24, duration));
      node.time = Number(drawerFastChargeStart);
      node.duration = Math.round(duration * 100) / 100;
    } else if (chargeType === 'sunlight') {
      node.time = Number(drawerFastChargeTime);
    } else if (chargeType === 'supplements') {
      node.time = Number(drawerFastChargeTime);
      if (fastChargeSupplementName?.trim()) node.name = fastChargeSupplementName.trim();
      if (fastChargeSupplementName?.trim()) node.subtype = fastChargeSupplementName.trim();
    }
    const next = [...manualNodes, node].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
    setManualNodes(next);
    syncDatiFirebase(dailyLog, next);
    setActiveAction(null);
    setFastChargeSupplementName('');
  }, [isSimulationMode, drawerFastChargeEnd, drawerFastChargeStart, drawerFastChargeTime, fastChargeSupplementName, manualNodes, setManualNodes, syncDatiFirebase, dailyLog, setActiveAction, setFastChargeSupplementName]);

  const handleSaveWorkout = useCallback(() => {
    if (workoutActivityRequiresStrengthDetailNote(workoutType) && !String(workoutStrengthDetail).trim()) {
      window.alert('Compila «Dettaglio workout» per salvare questo tipo di attività.');
      return;
    }
    const def = getWorkoutActivityTypeDef(workoutType);
    const nodeKind = def?.nodeKind ?? 'workout';
    const isWork = nodeKind === 'work';
    const isCognitive = nodeKind === 'cognitive';
    const duration = workoutDurationHours;
    const startDec = workoutStartTime;
    const finalId = editingWorkoutId || (isWork ? 'work_' : isCognitive ? 'cognitive_' : 'workout_') + Date.now();

    const musclesCanon = normalizeMuscleGroupArray(workoutMuscles);
    const detailTrim = String(workoutStrengthDetail).trim();
    const baseDesc = getWorkoutActivityLogDescription(workoutType, musclesCanon);
    const desc =
      detailTrim && workoutActivityRequiresStrengthDetailNote(workoutType)
        ? `${baseDesc} — ${detailTrim}`
        : baseDesc;
    const cognitiveKcal = isCognitive ? Math.round(getCognitiveMetForActivity(workoutType) * 70 * duration) : workoutKcal;
    const iconNode = isCognitive ? (def?.icon || '📚') : isWork ? '💼' : def?.icon || '🏋️';
    const nodeData = {
      id: finalId,
      type: isCognitive ? 'cognitive' : isWork ? 'work' : 'workout',
      time: Number(startDec),
      duration,
      kcal: isCognitive ? cognitiveKcal : workoutKcal,
      icon: iconNode,
      subType: workoutType,
      muscles: musclesCanon,
      ...(detailTrim ? { workoutDetailNote: detailTrim } : {}),
    };
    const logData = {
      id: finalId,
      type: 'workout',
      workoutType,
      desc,
      name: isCognitive ? desc : isWork ? 'Lavoro' : desc,
      kcal: isCognitive ? cognitiveKcal : workoutKcal,
      cal: isCognitive ? cognitiveKcal : workoutKcal,
      duration,
      ...(detailTrim ? { workoutDetailNote: detailTrim } : {}),
    };

    if (isSimulationMode) {
      setSimulatedLog((prev) => {
        const base = prev || [];
        return base.some((n) => n.id === finalId) ? base.map((n) => (n.id === finalId ? logData : n)) : [logData, ...base];
      });
      setEditingWorkoutId(null);
      setWorkoutMuscles([]);
      setWorkoutStrengthDetail('');
      closeDrawer();
      return;
    }
    const baseLog = dailyLog;
    const newLog = baseLog.some((n) => n.id === finalId) ? baseLog.map((n) => (n.id === finalId ? logData : n)) : [logData, ...baseLog];
    const newNodesRaw = manualNodes.some((n) => n.id === finalId) ? manualNodes.map((n) => (n.id === finalId ? nodeData : n)) : [...manualNodes, nodeData];
    const newNodes = newNodesRaw.filter((n) => n && n.type !== 'ghost_workout');
    setDailyLog(newLog);
    setManualNodes(newNodes);
    syncDatiFirebase(newLog, newNodes);

    setEditingWorkoutId(null);
    setWorkoutMuscles([]);
    setWorkoutStrengthDetail('');
    closeDrawer();
  }, [workoutActivityRequiresStrengthDetailNote, workoutType, workoutStrengthDetail, getWorkoutActivityTypeDef, workoutDurationHours, workoutStartTime, editingWorkoutId, normalizeMuscleGroupArray, workoutMuscles, getWorkoutActivityLogDescription, getCognitiveMetForActivity, workoutKcal, isSimulationMode, setSimulatedLog, setEditingWorkoutId, setWorkoutMuscles, setWorkoutStrengthDetail, closeDrawer, dailyLog, manualNodes, setDailyLog, setManualNodes, syncDatiFirebase]);

  const removeLogItem = useCallback((id) => {
    if (isSimulationMode) {
      setSimulatedLog((prev) => (prev || []).filter((item) => item.id !== id));
      return;
    }
    const newLog = dailyLog.filter((item) => item.id !== id);
    const newNodes = manualNodes.filter((n) => n.id !== id);
    setDailyLog(newLog);
    setManualNodes(newNodes);
    syncDatiFirebase(newLog, newNodes);
  }, [isSimulationMode, setSimulatedLog, dailyLog, manualNodes, setDailyLog, setManualNodes, syncDatiFirebase]);

  const handleSaveChoiceStimulant = useCallback(() => {
    const id = Date.now().toString();
    const node = { id, type: 'stimulant', subtype: stimulantSubtype, time: stimulantTime };
    const next = [...manualNodes, node];
    setManualNodes(next);
    syncDatiFirebase(dailyLog, next);
    setShowChoiceModal(false);
    setAddChoiceView('main');
  }, [stimulantSubtype, stimulantTime, manualNodes, setManualNodes, syncDatiFirebase, dailyLog, setShowChoiceModal, setAddChoiceView]);

  const handleSaveSleepModal = useCallback(() => {
    const bedDec = parseTimeStrToDecimal(sleepFormBedStr);
    const wakeDec = parseTimeStrToDecimal(sleepFormWakeStr);
    const hours = computeSleepDurationHours(bedDec, wakeDec);
    if (!(hours > 0)) {
      window.alert('Controlla gli orari di addormentamento e risveglio.');
      return;
    }
    const id = sleepModal.editingId || `sleep_${Date.now()}`;
    const logLook = isSimulationMode ? (simulatedLog || []) : (dailyLog || []);
    const existing = sleepModal.editingId
      ? logLook.find((e) => e?.id === sleepModal.editingId && e?.type === 'sleep')
      : null;
    if (sleepModal.editingId && !existing) {
      console.warn('[SalaComandi] sleep entry not found while saving edit', { editingId: sleepModal.editingId });
    }
    const entry = {
      type: 'sleep',
      id,
      wakeTime: wakeDec,
      bedtime: bedDec,
      sleepStart: bedDec,
      sleepEnd: wakeDec,
      hours,
      duration: hours,
      sleepHours: hours,
      deepMin: existing?.deepMin ?? 60,
      remMin: existing?.remMin ?? 60,
      ...(existing?.hr != null ? { hr: existing.hr } : {}),
      ...(existing?.quality != null ? { quality: existing.quality } : {}),
    };
    if (isSimulationMode) {
      setSimulatedLog((prev) => {
        const base = prev || [];
        const rest = sleepModal.editingId ? base.filter((e) => e.id !== sleepModal.editingId) : base;
        return [...rest, entry];
      });
    } else {
      const base = dailyLog || [];
      const rest = sleepModal.editingId ? base.filter((e) => e.id !== sleepModal.editingId) : base;
      const next = [...rest, entry];
      setDailyLog(next);
      syncDatiFirebase(next, manualNodes || []);
    }
    dismissKentuSleepTrigger();
    setSleepModal(null);
  }, [parseTimeStrToDecimal, sleepFormBedStr, sleepFormWakeStr, computeSleepDurationHours, sleepModal, isSimulationMode, simulatedLog, dailyLog, setSimulatedLog, setDailyLog, syncDatiFirebase, manualNodes, dismissKentuSleepTrigger, setSleepModal]);

  const handleDeleteQuickNodeEdit = useCallback(() => {
    if (!editingQuickNode) return;
    if (window.confirm('Vuoi eliminare questa attività?')) {
      const next = manualNodes.filter((n) => n.id !== editingQuickNode.id);
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
      setEditingQuickNode(null);
    }
  }, [editingQuickNode, manualNodes, setManualNodes, syncDatiFirebase, dailyLog, setEditingQuickNode]);

  const handleSaveQuickNodeEdit = useCallback(() => {
    if (!editingQuickNode) return;
    const newStart = document.getElementById('quick-start-time')?.value;
    const newEnd = document.getElementById('quick-end-time')?.value;
    if (newStart != null && newEnd != null && newStart !== '' && newEnd !== '') {
      const startDec = parseTimeStrToDecimal(newStart);
      const endDec = parseTimeStrToDecimal(newEnd);
      let duration = endDec - startDec;
      if (duration <= 0) duration += 24;
      duration = Math.max(0.08, Math.min(24, duration));
      const next = manualNodes.map((n) => (n.id === editingQuickNode.id ? { ...n, time: startDec, startTime: startDec, endTime: endDec, duration } : n));
      setManualNodes(next);
      syncDatiFirebase(dailyLog, next);
    }
    setEditingQuickNode(null);
  }, [editingQuickNode, parseTimeStrToDecimal, manualNodes, setManualNodes, syncDatiFirebase, dailyLog, setEditingQuickNode]);

  return {
    handleSaveAlcohol,
    handleAddWater,
    handleSaveFastCharge,
    handleSaveWorkout,
    removeLogItem,
    handleSaveChoiceStimulant,
    handleSaveSleepModal,
    handleDeleteQuickNodeEdit,
    handleSaveQuickNodeEdit,
  };
}
