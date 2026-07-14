import { useCallback, useRef } from 'react';
import { ref, set, push } from 'firebase/database';
import { callGeminiAPIWithRotation } from '../../services/aiService';
import { TARGETS, getDefaultNutrientValue } from '../../useBiochimico';
import {
  getTodayString,
  getGhostMealType,
  toCanonicalMealType,
  decimalToTimeStr,
  normalizeMealFoodsArray,
  normalizeCalorieStrategyTarget,
  applyCalorieStrategyToProfileKcal,
} from '../../coreEngine';
import { getCurrentTimeRoundedTo15Min } from '../../utils/decimalTimeUtils';
import {
  buildMealProposalConfirmMessage,
  buildMealProposalLogEntries,
  buildMealUpdateConfirmMessage,
  getFoodItemsForMealSlotFromLog,
  replaceMealSlotInLog,
  sumMealProposalMacroTotals,
} from '../../utils/mealProposalBuilders';
import {
  buildDailyPlanGhostLogEntries,
  collectRealMealTitlesFromLog,
  dedupeDailyPlanGhostEntriesById,
  mergeDiaryLogWithGhostEntries,
} from '../../utils/dailyPlanGhostUtils';
import {
  buildPastOnlyRealMealTypeSet,
  buildBaseLogForGhostPlanMerge,
  dedupeGhostMealsPayloadForConfirm,
  ghostMealLogEntryIdFromPayload,
} from '../../features/salaComandi/utils/timelineUtils';
import {
  mealFoodsRead,
  buildPlanningFirebaseDoc,
} from '../../features/salaComandi/utils/planningUtils';
import { findBestFoodMatch, draftStringsToFoods, parsePlanMealDraftAiResponse } from '../../features/salaComandi/utils/foodUtils';
import {
  buildRecentMealsContextForDinner,
  buildAiMealConstraintsPromptBlock,
  buildLast7DaysMealLinesForDraftPrompt,
} from '../../features/chat/aiPromptBuilders';
import { collectDispensaProbableFoods } from '../../features/salaComandi/utils/aiContextUtils';
import {
  getNowDecimalHourForPlanMerge,
  tryAcquireMealConfirmGuard,
  releaseMealConfirmGuard,
} from '../../utils/salaComandiUtils';

/**
 * Bridge chat ↔ diario: conferme pasto/piano, ghost draft, auto-log cena/agenda.
 *
 * @param {object} config — dipendenze esterne (auth, diario, refs, strategia calorica).
 */
export function useKentuMealHandlers({
  auth,
  db,
  foodDb,
  dailyLog,
  manualNodes,
  simulatedLog,
  activeLog,
  fullHistory,
  currentTrackerDate,
  isSimulationMode,
  dailyLogRef,
  manualNodesRef,
  scheduledWorkoutContextRef,
  currentTrackerDateRef,
  syncDatiFirebase,
  predictMealType,
  estraiDatiFoodDb,
  getAverageEstimate,
  parseFlexibleTimeToDecimal,
  parseTimeStrToDecimal,
  setChatHistory,
  setKentuDailyCalorieStrategy,
  setDailyLog,
  setManualNodes,
  setSimulatedLog,
  setPlanningWizardOverlayOpen,
  dismissKentuAgendaTrigger,
  kentuDailyCalorieStrategy,
  userTargets,
}) {
  const dailyPlanMealConfirmGuardRef = useRef({ busy: false, lastAt: 0 });
  const planningWizardMealConfirmGuardRef = useRef({ busy: false, lastAt: 0 });
  const lastAgendaOptionsRef = useRef(null);

  const handleAutoLogDinner = useCallback(
    (mealData) => {
      if (!mealData || typeof mealData !== 'object') return;
      const defaultStr = decimalToTimeStr(getCurrentTimeRoundedTo15Min());
      const raw = typeof window !== 'undefined' ? window.prompt('Orario del pasto (HH:MM)', defaultStr) : null;
      if (raw === null) return;
      const mealTime = parseTimeStrToDecimal(raw);
      const t = typeof mealTime === 'number' && !Number.isNaN(mealTime) ? mealTime : getCurrentTimeRoundedTo15Min();
      const ghostType = getGhostMealType('cena', dailyLog || []);
      const label = String(mealData.label || mealData.description || 'Cena').trim() || 'Cena';
      const kcal = Math.max(0, Math.round(Number(mealData.kcal) || 0));
      const prot = Math.max(0, Math.round((Number(mealData.prot) || 0) * 10) / 10);
      const carb = Math.max(0, Math.round((Number(mealData.carb) || 0) * 10) / 10);
      const fat = Math.max(0, Math.round((Number(mealData.fat ?? mealData.fatTotal) || 0) * 10) / 10);
      const newItem = {
        id: `kentu_dinner_${Date.now()}`,
        type: 'food',
        mealType: ghostType,
        mealTime: t,
        desc: label,
        name: label,
        qta: 100,
        weight: 100,
        kcal,
        cal: kcal,
        prot,
        carb,
        fatTotal: fat,
        fat,
      };
      Object.keys(TARGETS).forEach((g) => {
        Object.keys(TARGETS[g] || {}).forEach((k) => {
          if (newItem[k] == null) {
            newItem[k] = getDefaultNutrientValue(k, fullHistory);
          }
        });
      });
      if (isSimulationMode) {
        setSimulatedLog((prev) => [...(prev || []), newItem]);
        setChatHistory((prev) => [...prev, { sender: 'ai', text: 'Cena salvata nel diario! (sandbox)' }]);
        return;
      }
      const nuovoLog = [newItem, ...(dailyLog || [])];
      setDailyLog(nuovoLog);
      syncDatiFirebase(nuovoLog, manualNodes);
      const uid = auth.currentUser?.uid;
      const dateStr = currentTrackerDate || getTodayString();
      if (uid && db) {
        push(ref(db, `users/${uid}/history/${dateStr}/meals`), {
          label,
          kcal,
          prot,
          carb,
          fat,
          mealTime: t,
          source: 'kentu_dinner',
          loggedAt: Date.now(),
        }).catch(() => {});
      }
      setChatHistory((prev) => [...prev, { sender: 'ai', text: 'Cena salvata nel diario!' }]);
    },
    [
      dailyLog,
      manualNodes,
      syncDatiFirebase,
      isSimulationMode,
      fullHistory,
      currentTrackerDate,
      auth,
      db,
      parseTimeStrToDecimal,
      setChatHistory,
      setDailyLog,
      setSimulatedLog,
    ],
  );

  const handleAutoLogAgenda = useCallback(
    (agendaOptions) => {
      if (!Array.isArray(agendaOptions) || agendaOptions.length === 0) return;
      const dateStr = currentTrackerDate || getTodayString();
      const uid = auth.currentUser?.uid;
      const n = agendaOptions.length;
      const newItems = agendaOptions.map((opt, idx) => {
        const name = String(opt?.name || opt?.label || 'Attività').trim() || 'Attività';
        const durMin = Math.max(15, Math.round(Number(opt?.duration) || 60));
        const kcal = Math.max(0, Math.round(Number(opt?.kcal) || 0));
        const durationH = Math.max(0.25, durMin / 60);
        const spreadT = n <= 1 ? 12 : 8 + (idx / Math.max(1, n - 1)) * 10;
        const mealTime = Math.min(22.75, Math.round(spreadT * 4) / 4);
        return {
          id: `kentu_agenda_${Date.now()}_${idx}`,
          type: 'workout',
          workoutType: 'misto',
          desc: name.toUpperCase(),
          name,
          kcal,
          cal: kcal,
          duration: durationH,
          mealTime,
          time: mealTime,
        };
      });
      if (isSimulationMode) {
        setSimulatedLog((prev) => [...newItems, ...(prev || [])]);
        dismissKentuAgendaTrigger();
        lastAgendaOptionsRef.current = null;
        setChatHistory((prev) => [...prev, { sender: 'ai', text: 'Attività caricate nella timeline! (sandbox)' }]);
        return;
      }
      const nuovoLog = [...newItems, ...(dailyLog || [])];
      setDailyLog(nuovoLog);
      syncDatiFirebase(nuovoLog, manualNodes);
      if (uid && db) {
        newItems.forEach((item) => {
          push(ref(db, `users/${uid}/history/${dateStr}/activities`), {
            name: item.name,
            durationMin: Math.round(Math.max(15, (item.duration || 0.25) * 60)),
            kcal: item.kcal,
            mealTime: item.mealTime,
            source: 'kentu_agenda',
            loggedAt: Date.now(),
          }).catch(() => {});
        });
      }
      dismissKentuAgendaTrigger();
      lastAgendaOptionsRef.current = null;
      setChatHistory((prev) => [...prev, { sender: 'ai', text: 'Attività caricate nella timeline!' }]);
    },
    [
      dailyLog,
      manualNodes,
      syncDatiFirebase,
      isSimulationMode,
      currentTrackerDate,
      auth,
      db,
      dismissKentuAgendaTrigger,
      setChatHistory,
      setDailyLog,
      setSimulatedLog,
    ],
  );

  const applyKentuChatCmd = useCallback(
    (cmd) => {
      if (!cmd || typeof cmd !== 'object') return;
      if (cmd.target != null) {
        const t = normalizeCalorieStrategyTarget(cmd.target);
        setKentuDailyCalorieStrategy(t);
        try {
          const d = currentTrackerDateRef.current || getTodayString();
          localStorage.setItem(`kentu_cal_strategy_${d}`, t);
        } catch (_) {
          /* noop */
        }
      }
      const anchorW = currentTrackerDateRef.current || getTodayString();
      if (Object.prototype.hasOwnProperty.call(cmd, 'workoutTime')) {
        const wt = cmd.workoutTime;
        if (wt != null && String(wt).trim() && String(wt).toLowerCase() !== 'null') {
          const dec = parseFlexibleTimeToDecimal(String(wt).trim());
          if (dec != null && anchorW === getTodayString()) {
            scheduledWorkoutContextRef.current = {
              workoutDecimalHour: dec,
              label: 'Allenamento (Kentu)',
              dateStr: anchorW,
            };
          }
        } else {
          scheduledWorkoutContextRef.current = null;
        }
      }
    },
    [currentTrackerDateRef, parseFlexibleTimeToDecimal, scheduledWorkoutContextRef, setKentuDailyCalorieStrategy],
  );

  const handleMealProposalConfirm = useCallback(
    (proposal, selectedItems) => {
      if (!selectedItems?.length) return;
      const targetNodeId = String(proposal?.targetNodeId || '').trim();
      const timeStr =
        (proposal?.exactTime && String(proposal.exactTime).trim())
        || (proposal?.timeString && String(proposal.timeString).trim())
        || decimalToTimeStr(getCurrentTimeRoundedTo15Min());
      let mealDec = parseFlexibleTimeToDecimal(timeStr);
      if (mealDec == null) mealDec = getCurrentTimeRoundedTo15Min();

      const logSnap = dailyLogRef.current || [];
      const batchId = targetNodeId
        ? `meal_update_${Date.now()}`
        : `meal_proposal_${Date.now()}`;

      let mealSlot;
      let mealTypeCanonical;
      if (targetNodeId) {
        const existing = getFoodItemsForMealSlotFromLog(logSnap, targetNodeId);
        mealSlot = existing[0]?.mealType
          || proposal?.mealSlotType
          || getGhostMealType(toCanonicalMealType(String(proposal?.mealType || 'pranzo').split('_')[0]), logSnap);
        mealTypeCanonical = toCanonicalMealType(String(mealSlot).split('_')[0]) || 'pranzo';
        if (typeof existing[0]?.mealTime === 'number' && !Number.isNaN(existing[0].mealTime)) {
          mealDec = existing[0].mealTime;
        }
      } else {
        const predicted = predictMealType(mealDec);
        mealSlot = getGhostMealType(predicted, logSnap);
        mealTypeCanonical = toCanonicalMealType(String(mealSlot).split('_')[0]);
      }

      const entries = buildMealProposalLogEntries(selectedItems, {
        batchId,
        mealTypeCanonical,
        mealDec,
        mealSlot,
        foodDb,
        findBestFoodMatch,
        resolveFoodFromDb: (name, qty, slot, matchedKey) => estraiDatiFoodDb(name, qty, slot, matchedKey),
        getAverageEstimate,
      });

      const confirmTimeStr = decimalToTimeStr(mealDec) || timeStr;
      const testo = targetNodeId
        ? buildMealUpdateConfirmMessage(confirmTimeStr, sumMealProposalMacroTotals(entries))
        : buildMealProposalConfirmMessage(confirmTimeStr, sumMealProposalMacroTotals(entries));

      if (isSimulationMode) {
        setSimulatedLog((prev) => {
          const base = prev || [];
          return targetNodeId
            ? replaceMealSlotInLog(base, targetNodeId, entries)
            : [...entries, ...base];
        });
      } else {
        setDailyLog((prev) => {
          const base = prev || [];
          const next = targetNodeId
            ? replaceMealSlotInLog(base, targetNodeId, entries)
            : [...entries, ...base];
          syncDatiFirebase(next, manualNodesRef.current);
          return next;
        });
      }

      setChatHistory((prev) => {
        const withoutCard = prev.filter((m) => !m.mealProposal);
        return [...withoutCard, { sender: 'ai', text: testo }];
      });
    },
    [
      estraiDatiFoodDb,
      foodDb,
      getAverageEstimate,
      isSimulationMode,
      predictMealType,
      dailyLogRef,
      manualNodesRef,
      parseFlexibleTimeToDecimal,
      setDailyLog,
      setSimulatedLog,
      syncDatiFirebase,
      setChatHistory,
    ],
  );

  const handleMealProposalCancel = useCallback(() => {
    setChatHistory((prev) => prev.filter((m) => !m.mealProposal));
  }, [setChatHistory]);

  const handleDailyPlanConfirm = useCallback(
    (plan) => {
      if (!plan || typeof plan !== 'object') return;
      if (!tryAcquireMealConfirmGuard(dailyPlanMealConfirmGuardRef)) return;
      try {
        let workoutTime =
          plan.workoutTime != null && String(plan.workoutTime).trim() ? String(plan.workoutTime).trim() : null;
        if (!workoutTime && Array.isArray(plan.activities)) {
          const wRe = /allenament|workout|palestra|corr|run|pesi|cardio|yoga|hiit|spinning|nuot/i;
          const hit = plan.activities.find((a) => wRe.test(String(a?.desc || '')));
          if (hit?.time) workoutTime = String(hit.time).trim();
        }
        applyKentuChatCmd({
          target: plan.target,
          workoutTime: workoutTime || null,
        });
        const rawGhostList = Array.isArray(plan.ghostMeals) ? plan.ghostMeals : [];
        const ghostList = dedupeGhostMealsPayloadForConfirm(rawGhostList, (gm) => {
          const rawId = gm.id != null && String(gm.id).trim() !== '' ? String(gm.id).trim() : '';
          if (rawId) return `id:${rawId}`;
          const mt = toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]) || 'pranzo';
          const timeStr = gm.time != null ? String(gm.time) : '12:00';
          const dec = parseFlexibleTimeToDecimal(timeStr);
          const mealTime = dec != null && !Number.isNaN(dec) ? dec : 12;
          return `slot:${mt}|${Number(mealTime).toFixed(3)}`;
        });
        const batchTs = Date.now();
        const srcLog = isSimulationMode ? (simulatedLog || []) : (dailyLog || []);
        const nowDec = getNowDecimalHourForPlanMerge();
        const realMealsSet = buildPastOnlyRealMealTypeSet(srcLog, nowDec);
        const hasRealWorkout = (srcLog || []).some((n) => n && !n.isGhost && n.type === 'workout');
        const realTitles = collectRealMealTitlesFromLog(srcLog);
        const baseLog = buildBaseLogForGhostPlanMerge(srcLog, ghostList, nowDec);
        const newGhostEntries = buildDailyPlanGhostLogEntries(ghostList, {
          batchTs,
          srcLog,
          nowDec,
          realMealsSet,
          realTitles,
          toCanonicalMealType,
          parseFlexibleTimeToDecimal,
          normalizeMealFoodsArray,
          mealFoodsRead,
          draftStringsToFoods,
          ghostMealLogEntryIdFromPayload,
        });
        const uniqueDailyGhostEntries = dedupeDailyPlanGhostEntriesById(newGhostEntries);
        const mergedLog = mergeDiaryLogWithGhostEntries(baseLog, uniqueDailyGhostEntries);
        const baseManual = (manualNodes || []).filter((n) => n && n.type !== 'ghost_workout');
        let mergedManual = [...baseManual].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
        if (!isSimulationMode && workoutTime && !hasRealWorkout) {
          const wDec = parseFlexibleTimeToDecimal(workoutTime);
          if (wDec != null && !Number.isNaN(wDec)) {
            mergedManual = [
              ...baseManual,
              {
                id: `ghost_workout_${Date.now()}`,
                type: 'ghost_workout',
                time: wDec,
                title: 'Allenamento Pianificato',
                isGhost: true,
              },
            ].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
          }
        }
        if (isSimulationMode) {
          setSimulatedLog(mergedLog);
        } else {
          setDailyLog(mergedLog);
          setManualNodes(mergedManual);
          syncDatiFirebase(mergedLog, mergedManual);
        }
        setChatHistory((prev) => {
          const withoutCard = prev.filter((m) => !m.dailyPlan);
          return [...withoutCard, { sender: 'ai', text: 'Piano confermato e caricato nel sistema.' }];
        });
      } finally {
        releaseMealConfirmGuard(dailyPlanMealConfirmGuardRef);
      }
    },
    [
      applyKentuChatCmd,
      dailyLog,
      manualNodes,
      syncDatiFirebase,
      isSimulationMode,
      simulatedLog,
      parseFlexibleTimeToDecimal,
      setChatHistory,
      setDailyLog,
      setManualNodes,
      setSimulatedLog,
    ],
  );

  const handleDailyPlanCancel = useCallback(() => {
    setChatHistory((prev) => prev.filter((m) => !m.dailyPlan));
  }, [setChatHistory]);

  const handleGeneratePlanGhostMealDraft = useCallback(
    async ({
      mealType,
      time,
      title,
      microDesc,
      planTarget,
      aiMealConstraints,
      manualFoods,
      mealMacroResidual,
      mealMacroTargetTotal,
    }) => {
      const manualNorm = normalizeMealFoodsArray(manualFoods);
      const cov =
        manualNorm.length > 0
          ? manualNorm.reduce(
              (a, f) => ({
                kcal: a.kcal + (Number(f.kcal) || 0),
                prot: a.prot + (Number(f.prot) || 0),
                carb: a.carb + (Number(f.carb) || 0),
                fat: a.fat + (Number(f.fat) || 0),
              }),
              { kcal: 0, prot: 0, carb: 0, fat: 0 },
            )
          : null;
      const mt = mealMacroTargetTotal || {};
      const mr = mealMacroResidual || {};
      const manualBlock =
        manualNorm.length > 0
          ? `

ALIMENTI GIÀ INSERITI DALL'UTENTE (fissi: non modificare grammi, non rimuovere, non ripetere nel JSON):
${manualNorm.map((f) => `- ${f.qty}g ${f.name}`).join('\n')}

Target pasto complessivo (riferimento motore): ~${Math.round(Number(mt.kcal) || 0)} kcal, P${mt.prot}g, C${mt.carb}g, F${mt.fat}g.
Macro stimate dai fissi (se note): ~${Math.round(cov.kcal)} kcal, P${cov.prot.toFixed(1)}g, C${cov.carb.toFixed(1)}g, F${cov.fat.toFixed(1)}g.
RESIDUO da colmare SOLO con nuove voci nell'array "items" (o in draftFoods se usi il formato legacy): ~${Math.round(Number(mr.kcal) || 0)} kcal, P${mr.prot}g, C${mr.carb}g, F${mr.fat}g.

REGOLE CON FISSI:
- "items" / draftFoods devono contenere SOLO alimenti AGGIUNTIVI (nessun nome uguale o equivalente ai fissi).
- Se il residuo è trascurabile (es. kcal ≤ 30 e ogni macro residua ≤ 3 g), restituisci aggiunte vuote: {"items":[]} o draftFoods [].
- Se il residuo non è trascurabile: almeno 1 nuova voce, massimo 10 nuove voci.
`
          : '';

      const anchor = currentTrackerDate || getTodayString();
      const burnedKcalContext = (activeLog || [])
        .filter((item) => item && item.type === 'workout')
        .reduce((acc, wk) => acc + (Number(wk.kcal || wk.cal) || 0), 0);
      const dynamicKcal =
        applyCalorieStrategyToProfileKcal(userTargets?.kcal ?? 2000, kentuDailyCalorieStrategy) + burnedKcalContext;
      const recent7 = buildLast7DaysMealLinesForDraftPrompt(fullHistory, anchor);
      const storicoBreve = buildRecentMealsContextForDinner(fullHistory, anchor);
      const dispensa = collectDispensaProbableFoods(fullHistory, anchor, 18, 7);
      const dbKeys = Object.keys(foodDb || {})
        .slice(0, 45)
        .join(', ');
      const oggiBreve = (activeLog || [])
        .filter((e) => e && (e.type === 'food' || e.type === 'recipe') && !e.isGhost)
        .map((e) => `${e.desc || e.title || '?'} (~${Math.round(Number(e.kcal || e.cal) || 0)} kcal)`)
        .slice(0, 20)
        .join('; ');
      const constraintsBlock = buildAiMealConstraintsPromptBlock(aiMealConstraints);
      const minVociRule =
        manualNorm.length > 0
          ? 'Con alimenti fissi: solo aggiunte nel JSON (vedi blocco sotto). Senza fissi: minimo 2 voci, massimo 10.'
          : 'Minimo 2 voci, massimo 10.';
      const prompt = `Sei Kentu (nutrizionista operativo). Rispondi SOLO con un JSON valido su una riga o un blocco, senza testo prima o dopo, senza markdown.
Formato preferito (voci strutturate con stime):
{"items":[{"name":"Riso basmati","qty":200,"estKcal":260,"estPro":5,"estCar":58,"estFat":0.6,"dbKey":""}]}
(dbKey opzionale: chiave da database se nota; altrimenti stringa vuota)

Formato legacy accettato:
{"draftFoods":["200g Riso basmati","120g Petto di pollo","10g Olio EVO"]}

Pasto pianificato (slot):
- mealType: ${String(mealType || '')}
- orario: ${String(time || '')}
- titolo: ${String(title || '')}
- microDesc / focus: ${String(microDesc || '')}
- target strategia giornata: ${String(planTarget || 'pari')}
- kcal giornaliere di riferimento (adattate): ~${Math.round(dynamicKcal)}

Gerarchia obbligatoria: (1) ultimi 3-7 giorni pasti simili; (2) storico più lungo; (3) dispensa + database; (4) combinazione nuova solo se necessario.
Ogni voce deve essere "grammi + nome" (es. 150g Tofu). ${minVociRule}
${constraintsBlock}
${manualBlock}

ULTIMI 7 GIORNI:
${recent7}

STORICO PASTI (sintesi 30gg):
${String(storicoBreve).slice(0, 2200)}

DISPENSA PROBABILE:
${dispensa}

OGGI GIÀ REGISTRATO:
${oggiBreve || 'niente'}

CHIAVI DB (subset):
${dbKeys || 'n/d'}`;

      const raw = await callGeminiAPIWithRotation(prompt);
      try {
        return parsePlanMealDraftAiResponse(raw);
      } catch (e) {
        throw new Error(e?.message ? `JSON non valido: ${e.message}` : 'Risposta AI non valida (piano pasto)');
      }
    },
    [
      activeLog,
      callGeminiAPIWithRotation,
      currentTrackerDate,
      foodDb,
      fullHistory,
      kentuDailyCalorieStrategy,
      userTargets,
    ],
  );

  const savePlanning = useCallback(
    async (dateStr, doc) => {
      const uid = auth.currentUser?.uid;
      if (!uid || !db || !dateStr || isSimulationMode || !doc) return;
      try {
        await set(ref(db, `planning/${uid}/${dateStr}`), doc);
      } catch (e) {
        console.warn('savePlanning:', e);
      }
    },
    [auth, db, isSimulationMode],
  );

  const handlePlanningWizardConfirm = useCallback(
    (payload) => {
      if (!payload || typeof payload !== 'object') return;
      if (!tryAcquireMealConfirmGuard(planningWizardMealConfirmGuardRef)) return;
      try {
        const rawGhostList = Array.isArray(payload.ghostMeals) ? payload.ghostMeals : [];
        const ghostList = dedupeGhostMealsPayloadForConfirm(rawGhostList, (gm) => {
          const rawId = gm.id != null && String(gm.id).trim() !== '' ? String(gm.id).trim() : '';
          if (rawId) return `id:${rawId}`;
          const mt = toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]) || 'pranzo';
          const mealTime =
            typeof gm.mealTime === 'number' && !Number.isNaN(gm.mealTime)
              ? gm.mealTime
              : (parseFlexibleTimeToDecimal(String(gm.time || '12:00')) ?? 12);
          return `slot:${mt}|${Number(mealTime).toFixed(3)}`;
        });
        const batchTs = Date.now();
        const srcLog = isSimulationMode ? (simulatedLog || []) : (dailyLog || []);
        const nowDec = getNowDecimalHourForPlanMerge();
        const realMealsSet = buildPastOnlyRealMealTypeSet(srcLog, nowDec);
        const hasRealWorkout = (srcLog || []).some((n) => n && !n.isGhost && n.type === 'workout');
        const normalizeDailyPlanConflictTitle = (s) =>
          String(s || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, ' ');
        const realTitles = new Set();
        (srcLog || []).forEach((n) => {
          if (!n || n.isGhost === true || n.type === 'ghost_meal' || n.type === 'ghost_workout') return;
          [n.desc, n.title, n.name].forEach((piece) => {
            const norm = normalizeDailyPlanConflictTitle(piece);
            if (norm.length >= 2) realTitles.add(norm);
          });
        });
        const baseLog = buildBaseLogForGhostPlanMerge(srcLog, ghostList, nowDec);
        const newGhostEntries = ghostList
          .filter((gm) => {
            const mt = toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]) || 'pranzo';
            if (realMealsSet.has(mt)) return false;
            const gTitle = normalizeDailyPlanConflictTitle(gm.title);
            if (gTitle && realTitles.has(gTitle)) return false;
            return true;
          })
          .map((gm, i) => {
            const mt = toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]) || 'pranzo';
            const mealTime =
              typeof gm.mealTime === 'number' && !Number.isNaN(gm.mealTime)
                ? gm.mealTime
                : (parseFlexibleTimeToDecimal(String(gm.time || '12:00')) ?? 12);
            let foodsArr = normalizeMealFoodsArray(mealFoodsRead(gm));
            if (foodsArr.length === 0 && Array.isArray(gm.draftFoods)) {
              const objs = gm.draftFoods.filter((x) => x && typeof x === 'object' && (x.name || x.desc));
              if (objs.length > 0) {
                foodsArr = normalizeMealFoodsArray(objs);
              } else {
                const strOnly = gm.draftFoods
                  .map((x) => (typeof x === 'string' ? String(x).trim() : ''))
                  .filter(Boolean);
                if (strOnly.length > 0) {
                  foodsArr = normalizeMealFoodsArray(draftStringsToFoods(strOnly));
                }
              }
            }
            const persistedDraftFoods = gm.draftFoods || [];
            let draftFoods = [];
            if (foodsArr.length > 0) {
              draftFoods = foodsArr
                .map((f) => {
                  if (typeof f === 'string') return f.trim();
                  if (f && typeof f === 'object') {
                    const name = String(f.name || '').trim();
                    const q = Math.round(Number(f.qty) || 0);
                    return q > 0 ? `${q}g ${name}` : name;
                  }
                  return '';
                })
                .filter(Boolean);
            } else if (Array.isArray(persistedDraftFoods)) {
              draftFoods = persistedDraftFoods
                .map((x) => {
                  if (typeof x === 'string') return x.trim();
                  if (x && typeof x === 'object') {
                    const name = String(x.name || x.desc || '').trim();
                    const q = x.qty != null ? Math.round(Number(x.qty) || 0) : null;
                    return q ? `${q}g ${name}` : name;
                  }
                  return '';
                })
                .filter(Boolean);
            }
            const entry = {
              id: ghostMealLogEntryIdFromPayload(gm, i, batchTs),
              type: 'ghost_meal',
              mealType: mt,
              mealTime,
              title: String(gm.title || 'Pasto pianificato').trim(),
              microDesc: String(gm.microDesc || '').trim(),
              draftFoods,
              foods: foodsArr,
              isGhost: true,
            };
            return entry;
          });
        const seenGhostEntryIds = new Set();
        const uniqueGhostEntries = newGhostEntries.filter((e) => {
          if (!e?.id || seenGhostEntryIds.has(e.id)) return false;
          seenGhostEntryIds.add(e.id);
          return true;
        });
        const logTimeKey = (e) => {
          if (!e) return 0;
          if (e.type === 'ghost_meal' || e.type === 'food' || e.type === 'recipe') {
            return Number(e.mealTime) || 0;
          }
          return Number(e.time ?? e.mealTime) || 0;
        };
        const mergedLog = [...baseLog, ...uniqueGhostEntries].sort((a, b) => logTimeKey(a) - logTimeKey(b));

        const baseManual = (manualNodes || []).filter((n) => n && n.type !== 'ghost_workout');
        let mergedManual = [...baseManual].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
        const workoutTimesRaw = Array.isArray(payload.workoutTimesDec)
          ? payload.workoutTimesDec
          : typeof payload.workoutTimeDec === 'number' && !Number.isNaN(payload.workoutTimeDec)
            ? [payload.workoutTimeDec]
            : [];
        const workoutTimes = [...new Set(workoutTimesRaw.filter((x) => typeof x === 'number' && !Number.isNaN(x)))].sort(
          (a, b) => a - b,
        );
        if (!isSimulationMode && payload.addGhostWorkout && workoutTimes.length > 0 && !hasRealWorkout) {
          const ghostWos = workoutTimes.map((t, idx) => ({
            id: `ghost_workout_${batchTs}_${idx}`,
            type: 'ghost_workout',
            time: t,
            title: 'Allenamento Pianificato',
            isGhost: true,
          }));
          mergedManual = [...baseManual, ...ghostWos].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
        }

        if (isSimulationMode) {
          setSimulatedLog(mergedLog);
        } else {
          setDailyLog(mergedLog);
          setManualNodes(mergedManual);
          syncDatiFirebase(mergedLog, mergedManual);
          if (auth.currentUser?.uid) {
            const planningDoc = buildPlanningFirebaseDoc(payload);
            void savePlanning(currentTrackerDate, planningDoc);
          }
        }
        setPlanningWizardOverlayOpen(false);
      } finally {
        releaseMealConfirmGuard(planningWizardMealConfirmGuardRef);
      }
    },
    [
      auth,
      currentTrackerDate,
      dailyLog,
      manualNodes,
      savePlanning,
      syncDatiFirebase,
      isSimulationMode,
      simulatedLog,
      parseFlexibleTimeToDecimal,
      setDailyLog,
      setManualNodes,
      setSimulatedLog,
      setPlanningWizardOverlayOpen,
    ],
  );

  return {
    handleAutoLogDinner,
    handleAutoLogAgenda,
    applyKentuChatCmd,
    handleMealProposalConfirm,
    handleMealProposalCancel,
    handleDailyPlanConfirm,
    handleDailyPlanCancel,
    handleGeneratePlanGhostMealDraft,
    savePlanning,
    handlePlanningWizardConfirm,
    lastAgendaOptionsRef,
  };
}

export default useKentuMealHandlers;
