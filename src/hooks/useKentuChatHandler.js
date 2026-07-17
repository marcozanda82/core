import {
  calculateConsolidatedAverageScore,
  calculateProjectedAge,
  buildKentuAiVitalsContextParagraph,
  buildKentuAiMetabolicRecompositionContext,
} from '../longevityStats';
import {
  getTodayString,
  getGhostMealType,
  generateRealEnergyData,
  buildTrainingWaveContextSnippet,
  parseKentuInvisibleCmd,
  applyCalorieStrategyToProfileKcal,
  MEAL_LABELS_SAVE,
  SLEEP_AI_MI_FITNESS_INSTRUCTIONS,
  normalizeLogData,
  generateLocalNutritionalAudit,
  generateLocalTrainingAdvice,
  generateLocalMonthlyAudit,
  generateLocalHabitScanner,
} from '../coreEngine';
import {
  getMorningBriefingVerdict,
  getYesterdayCalorieStatus,
  markEveningBriefingShown,
  buildPostWorkoutCoachMessage,
} from '../useSmartKentuTriggers';
import {
  formatDecimalHourIt,
  parseFlexibleTimeToDecimal,
  detectWorkoutIntentFromChat,
  findLastMatchingWorkoutSlot,
} from '../features/salaComandi/utils/timelineUtils';
import {
  deriveEffectiveBodyMetricsForDate,
  deriveCurrentBodyMetricsFromHistory,
} from '../features/salaComandi/engines/bodyMetricsEngine';
import {
  stripInvisibleContextFromVisibleUserText,
  getInvisibleContext,
  extractAndStripMealProposal,
  extractAndStripDailyPlan,
} from '../features/salaComandi/utils/aiContextUtils';
import { findRecentFoodHabit } from '../features/salaComandi/utils/foodUtils';

/**
 * Kentu chat submit handler (extracted from SalaComandi).
 * Pass a fresh `ctx` object each render so the handler reads current state/refs.
 */
export function useKentuChatHandler(ctx) {
  async function handleChatSubmit(optionalReply, sendMeta) {
    const {
        CHAT_HISTORY_WINDOW,
        accumuloSNC,
        activeAction,
        activeLog,
        anabolicCurve,
        applyKentuChatCmd,
        birthDate,
        bodyBattery,
        bodyMetricsHistory,
        buildKentuAgendaSecretPrompt,
        buildRecentActivitiesContext,
        buildRecentMealsContextForDinner,
        calculateAge,
        callGeminiAPIWithRotation,
        chatHistory,
        chatImages,
        chatInput,
        commitAddFoodChatPayload,
        computeSleepDurationHours,
        cortisolCurve,
        currentTime,
        currentTrackerDate,
        dailyLog,
        dailyLogForEnergy,
        dismissKentuSleepTrigger,
        estraiDatiFoodDb,
        foodDb,
        fullHistory,
        getCurrentTimeRoundedTo15Min,
        handleAutoLogDinner,
        idealStrategy,
        isSimulationMode,
        kentuAgendaAwaitingRef,
        kentuDailyCalorieStrategy,
        lastAgendaOptionsRef,
        lastDinnerOptionsRef,
        longevityData,
        longevityEngineScore,
        longevityScoreHistory,
        manualNodes,
        mealType,
        metabolicVarianceForAi,
        nervousSystemLoad,
        nodesForEnergySimulation,
        normalizeAiMealTypeToStorageId,
        pendingAiBatch,
        pendingHabit,
        pendingWorkoutFlowRef,
        predictMealType,
        scheduledWorkoutContextRef,
        setChatHistory,
        setChatImages,
        setChatInput,
        setDailyLog,
        setIdealStrategy,
        setManualNodes,
        setPendingAiBatch,
        setPendingHabit,
        setSimulatedLog,
        setSimulationNodes,
        simulatedLog,
        syncDatiFirebase,
        totali,
        trainingWaveResult,
        userModel,
        userProfile,
        userTargets,
    } = ctx;

    const meta = sendMeta && typeof sendMeta === 'object' ? sendMeta : null;
    const trimQuick = optionalReply != null ? String(optionalReply).trim() : '';

    const flushWorkoutLogFromChat = (decimalHour, displayDesc, activity) => {
        const t = Math.round(Math.min(23.75, Math.max(0, Number(decimalHour))) * 100) / 100;
        const label = (String(displayDesc || 'Allenamento').trim() || 'Allenamento');
        const upper = label.toUpperCase();
        const kcal = activity === 'cardio' ? 350 : 280;
        const duration = activity === 'cardio' ? 0.75 : 1;
        const newItem = {
          id: `wk_chat_${Date.now()}`,
          type: 'workout',
          workoutType: activity === 'cardio' ? 'cardio' : 'pesi',
          desc: upper,
          name: label,
          kcal,
          cal: kcal,
          duration,
          mealTime: t,
          time: t,
        };
        const anchor = currentTrackerDate || getTodayString();
        const yStatus = getYesterdayCalorieStatus(fullHistory, userTargets, anchor);
        const coach = buildPostWorkoutCoachMessage(yStatus, activity, label);
        const nowDec = new Date().getHours() + new Date().getMinutes() / 60;
        if (anchor === getTodayString() && t > nowDec + 0.2) {
          scheduledWorkoutContextRef.current = { workoutDecimalHour: t, label, dateStr: anchor };
        } else if (anchor === getTodayString()) {
          scheduledWorkoutContextRef.current = null;
        }
        if (isSimulationMode) {
          setSimulatedLog((prev) => [newItem, ...(prev || [])]);
          setChatHistory((prev) => [...prev, { sender: 'ai', text: `Registrato (sandbox) alle ${formatDecimalHourIt(t)}. ${coach}` }]);
          return;
        }
        const nuovoLog = [newItem, ...(dailyLog || [])];
        setDailyLog(nuovoLog);
        syncDatiFirebase(nuovoLog, manualNodes);
        setChatHistory((prev) => [...prev, { sender: 'ai', text: `Allenamento salvato alle ${formatDecimalHourIt(t)}. ${coach}` }]);
      };

      if (meta?.fromQuickReply && meta?.workoutTimeReply && pendingWorkoutFlowRef.current?.kind === 'await_confirm') {
        const p = pendingWorkoutFlowRef.current;
        pendingWorkoutFlowRef.current = null;
        const userText = trimQuick || 'Ok';
        if (meta.workoutTimeReply === 'accept') {
          setChatHistory((prev) => {
            const stripped = prev.map((m) =>
              m.workoutTimeConfirm && Array.isArray(m.quickReplies) ? { ...m, quickReplies: undefined } : m
            );
            return [...stripped, { sender: 'user', text: userText }];
          });
          flushWorkoutLogFromChat(p.suggestedDecimal, p.displayLabel, p.activity);
        } else {
          pendingWorkoutFlowRef.current = {
            kind: 'await_custom_time',
            displayLabel: p.displayLabel,
            activity: p.activity,
            searchKeys: p.searchKeys || [],
          };
          setChatHistory((prev) => {
            const stripped = prev.map((m) =>
              m.workoutTimeConfirm && Array.isArray(m.quickReplies) ? { ...m, quickReplies: undefined } : m
            );
            return [
              ...stripped,
              { sender: 'user', text: userText },
              { sender: 'ai', text: 'Ok. A che ora lo programmiamo oggi? (es. 19:30 o 19,45)' },
            ];
          });
        }
        if (optionalReply == null) setChatInput('');
        return;
      }

      if (meta?.morningBriefingReply && meta?.fromQuickReply) {
        const { status, activity } = meta.morningBriefingReply;
        if (
          (status === 'deficit' || status === 'surplus') &&
          (activity === 'weights' || activity === 'cardio' || activity === 'rest')
        ) {
          const verdict = getMorningBriefingVerdict(status, activity);
          const userText = trimQuick;
          setChatHistory((prev) => {
            const stripped = prev.map((m) =>
              m.morningBriefing && Array.isArray(m.quickReplies)
                ? { ...m, quickReplies: undefined }
                : m
            );
            return [...stripped, { sender: 'user', text: userText }, { sender: 'ai', text: verdict }];
          });
          if (optionalReply == null) setChatInput('');
          return;
        }
      }

      if (meta?.fromQuickReply && meta?.eveningBriefingReply) {
        const { action, missingKcal, missingPro } = meta.eveningBriefingReply;
        const userText = trimQuick || '';
        const dateEv = currentTrackerDate || getTodayString();
        markEveningBriefingShown(dateEv);
        if (action === 'no') {
          setChatHistory((prev) => {
            const stripped = prev.map((m) =>
              m.eveningBriefing && Array.isArray(m.quickReplies) ? { ...m, quickReplies: undefined } : m
            );
            return [...stripped, { sender: 'user', text: userText }, { sender: 'ai', text: 'Perfetto, buona serata! 🌙' }];
          });
          if (optionalReply == null) setChatInput('');
          return;
        }
        if (action === 'yes') {
          const mk = Math.max(0, Math.round(Number(missingKcal) || 0));
          const mp = Math.max(0, Math.round(Number(missingPro) || 0));
          const secretPrompt = `L'utente vuole un consiglio per la cena. Deve rientrare in ${mk} kcal e contenere circa ${mp}g di proteine. Fornisci un'unica ricetta bilanciata e semplice, e alla fine chiedi 'Vuoi che la registri nel diario?'`;
          setChatHistory((prev) =>
            prev.map((m) => (m.eveningBriefing && Array.isArray(m.quickReplies) ? { ...m, quickReplies: undefined } : m))
          );
          if (optionalReply == null) setChatInput('');
          await handleChatSubmit(null, {
            secretPrompt,
            displayText: userText || '🍽️ Sì, proponi la cena perfetta',
          });
          return;
        }
      }

      if (trimQuick === 'Ho dormito 7h bene' || trimQuick === 'Ho dormito male') {
        dismissKentuSleepTrigger();
        const hours = trimQuick === 'Ho dormito 7h bene' ? 7 : 5.5;
        const quality = trimQuick === 'Ho dormito 7h bene' ? 'buona' : 'scarsa';
        const wakeTime = 7.5;
        let bedtime = wakeTime - hours;
        if (bedtime < 0) bedtime += 24;
        const sleepEntry = {
          type: 'sleep',
          id: `sleep_smart_${Date.now()}`,
          wakeTime,
          bedtime,
          sleepStart: bedtime,
          sleepEnd: wakeTime,
          hours,
          duration: hours,
          sleepHours: hours,
          deepMin: 45,
          remMin: 90,
          hr: 58,
          quality,
        };
        if (isSimulationMode) {
          setSimulatedLog((prev) => [...(prev || []), sleepEntry]);
          setChatHistory((prev) => [...prev, { sender: 'user', text: trimQuick }, { sender: 'ai', text: 'Registrato una stima del sonno (sandbox). Dal diario puoi rifinire i valori.' }]);
          return;
        }
        const nuovoLog = [...(dailyLog || []), sleepEntry];
        setDailyLog(nuovoLog);
        syncDatiFirebase(nuovoLog, manualNodes);
        setChatHistory((prev) => [...prev, { sender: 'user', text: trimQuick }, { sender: 'ai', text: 'Perfetto, ho salvato una stima del sonno. Puoi correggere i dettagli dal diario se serve.' }]);
        return;
      }

      const secretPrompt = meta?.secretPrompt != null && String(meta.secretPrompt).trim() ? String(meta.secretPrompt).trim() : '';
      const displayOverride = meta?.displayText != null && String(meta.displayText).trim() ? String(meta.displayText).trim() : '';

      let userMessage;
      let apiUserContent;

      if (secretPrompt) {
        userMessage = displayOverride || 'Richiesta assistente';
        apiUserContent = secretPrompt;
      } else if (kentuAgendaAwaitingRef.current) {
        const agendaText =
          optionalReply != null && String(optionalReply).trim()
            ? String(optionalReply).trim()
            : chatInput.trim();
        if (agendaText) {
          userMessage = agendaText;
          const anchorAg = currentTrackerDate || getTodayString();
          const actCtx = buildRecentActivitiesContext(fullHistory, anchorAg);
          const mealCtx = buildRecentMealsContextForDinner(fullHistory, anchorAg);
          apiUserContent = buildKentuAgendaSecretPrompt(agendaText, actCtx, mealCtx);
          kentuAgendaAwaitingRef.current = false;
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(`kentu_agenda_secret_sent_${anchorAg}`, '1');
          }
        } else {
          userMessage = '';
          apiUserContent = '';
        }
      } else {
        userMessage = optionalReply != null && String(optionalReply).trim() ? String(optionalReply).trim() : chatInput.trim();
        apiUserContent = userMessage;
      }

      const NUTR_CHECK_TRIGGER = '⚖️ Check Oggi';
      const NUTR_CHECK_TRIGGER_LEGACY = '⚖️ Check Alimentare';
      const userTrim = String(userMessage || '').trim();
      if (!secretPrompt && (userTrim === NUTR_CHECK_TRIGGER || userTrim === NUTR_CHECK_TRIGGER_LEGACY)) {
        const auditLog = activeLog || [];
        const auditText = generateLocalNutritionalAudit(auditLog, userTargets);
        const userLine = userTrim === NUTR_CHECK_TRIGGER_LEGACY ? NUTR_CHECK_TRIGGER_LEGACY : NUTR_CHECK_TRIGGER;
        setChatHistory((prev) => [...prev, { sender: 'user', text: userLine }]);
        if (optionalReply == null) setChatInput('');
        window.setTimeout(() => {
          setChatHistory((prev) => [...prev, { sender: 'ai', text: auditText }]);
        }, 300);
        return;
      }

      const TRAINING_LOCAL_TRIGGER = '🏃‍♂️ Posso allenarmi?';
      if (!secretPrompt && String(userMessage || '').trim() === TRAINING_LOCAL_TRIGGER) {
        const advice = generateLocalTrainingAdvice(trainingWaveResult);
        setChatHistory((prev) => [...prev, { sender: 'user', text: TRAINING_LOCAL_TRIGGER }]);
        if (optionalReply == null) setChatInput('');
        window.setTimeout(() => {
          setChatHistory((prev) => [...prev, { sender: 'ai', text: advice }]);
        }, 300);
        return;
      }

      const MONTHLY_AUDIT_TRIGGER = '📅 Report Mese';
      const MONTHLY_AUDIT_TRIGGER_LEGACY = '📅 Report Mensile';
      if (!secretPrompt && (userTrim === MONTHLY_AUDIT_TRIGGER || userTrim === MONTHLY_AUDIT_TRIGGER_LEGACY)) {
        const reportText = generateLocalMonthlyAudit(fullHistory, userTargets, bodyMetricsHistory);
        const userLine = userTrim === MONTHLY_AUDIT_TRIGGER_LEGACY ? MONTHLY_AUDIT_TRIGGER_LEGACY : MONTHLY_AUDIT_TRIGGER;
        setChatHistory((prev) => [...prev, { sender: 'user', text: userLine }]);
        if (optionalReply == null) setChatInput('');
        window.setTimeout(() => {
          setChatHistory((prev) => [...prev, { sender: 'ai', text: reportText }]);
        }, 300);
        return;
      }

      const METABOLIC_SCAN_TRIGGER = '🧬 Scanner Metabolico';
      const HABIT_SCAN_TRIGGER_LEGACY = '🔍 Analisi Abitudini';
      if (!secretPrompt && (userTrim === METABOLIC_SCAN_TRIGGER || userTrim === HABIT_SCAN_TRIGGER_LEGACY)) {
        const habitText = generateLocalHabitScanner(fullHistory);
        const userLine = userTrim === HABIT_SCAN_TRIGGER_LEGACY ? HABIT_SCAN_TRIGGER_LEGACY : METABOLIC_SCAN_TRIGGER;
        setChatHistory((prev) => [...prev, { sender: 'user', text: userLine }]);
        if (optionalReply == null) setChatInput('');
        window.setTimeout(() => {
          setChatHistory((prev) => [...prev, { sender: 'ai', text: habitText }]);
        }, 400);
        return;
      }

      if (pendingHabit && userMessage && !secretPrompt) {
        const userTextLower = userMessage.trim().toLowerCase();
        const isHabitYes =
          userTextLower === 'si' ||
          userTextLower === 'sì' ||
          userTextLower === 'confermo' ||
          userTextLower === 'ok' ||
          userTextLower === 'va bene';
        const isHabitNo =
          userTextLower === 'no' ||
          userTextLower.includes('cambia') ||
          userTextLower.includes('annulla');
        if (isHabitYes) {
          const ph = pendingHabit;
          setPendingHabit(null);
          commitAddFoodChatPayload(ph);
          const summary = (ph.items || [])
            .map((it) => `${it.qty}g di ${it.name}`)
            .join(', ');
          setChatHistory((prev) => [
            ...prev,
            { sender: 'user', text: userMessage },
            { sender: 'ai', text: `Perfetto! Ho registrato ${summary || 'il pasto'}. 🥗` },
          ]);
          if (optionalReply == null) setChatInput('');
          return;
        }
        if (isHabitNo) {
          setPendingHabit(null);
          setChatHistory((prev) => [
            ...prev,
            { sender: 'user', text: userMessage },
            {
              sender: 'ai',
              text: 'Nessun problema. Quanti grammi e quale alimento esattamente?',
            },
          ]);
          if (optionalReply == null) setChatInput('');
          return;
        }
        setPendingHabit(null);
      }

      if (!secretPrompt && pendingWorkoutFlowRef.current?.kind === 'await_custom_time' && userMessage) {
        const parsedT = parseFlexibleTimeToDecimal(userMessage);
        if (parsedT == null) {
          setChatHistory((prev) => [
            ...prev,
            { sender: 'user', text: userMessage },
            { sender: 'ai', text: 'Non ho capito l\'orario. Prova con il formato 19:30 o 19,45.' },
          ]);
          if (optionalReply == null) setChatInput('');
          return;
        }
        const p = pendingWorkoutFlowRef.current;
        pendingWorkoutFlowRef.current = null;
        setChatHistory((prev) => [...prev, { sender: 'user', text: userMessage }]);
        flushWorkoutLogFromChat(parsedT, p.displayLabel, p.activity);
        if (optionalReply == null) setChatInput('');
        return;
      }

      if (!apiUserContent && chatImages.length === 0) return;

      const logPastoKw = /\b(logga\s+pasto|salva(?:\s+la)?\s+cena|registra(?:\s+la)?\s+cena)\b/i;
      if (!secretPrompt && logPastoKw.test(userMessage) && Array.isArray(lastDinnerOptionsRef.current) && lastDinnerOptionsRef.current.length) {
        const low = userMessage.toLowerCase();
        let idx = 0;
        const n = userMessage.match(/(?:opzione|scelta|#)\s*([1-3])\b/);
        if (n) idx = Math.min(2, Math.max(0, parseInt(n[1], 10) - 1));
        else if (/\bseconda\b|\b2\b/.test(low)) idx = 1;
        else if (/\bterza\b|\b3\b/.test(low)) idx = 2;
        else if (/\bprima\b|\buno\b/.test(low)) idx = 0;
        const opts = lastDinnerOptionsRef.current;
        const chosen = opts[idx];
        if (chosen) {
          setChatHistory((prev) => [...prev, { sender: 'user', text: userMessage }]);
          if (optionalReply == null) setChatInput('');
          handleAutoLogDinner(chosen);
          return;
        }
      }

      if (pendingAiBatch && userMessage) {
        const lowerMsg = userMessage.toLowerCase();
        const isConfirm = lowerMsg.includes('conferm') || lowerMsg.includes('sì') || lowerMsg.includes('si ');
        const isCancel = lowerMsg.includes('annulla') || lowerMsg.includes('no');

        if (pendingAiBatch.type === 'sleep' && isConfirm && pendingAiBatch.data) {
          const d = pendingAiBatch.data;
          const bed = Number(d.bedtime ?? d.sleepStart);
          const wake = Number(d.wakeTime ?? d.sleepEnd);
          let hoursVal = Number(d.hours ?? d.duration ?? d.sleepHours);
          if (!Number.isFinite(hoursVal) || hoursVal <= 0) {
            hoursVal = computeSleepDurationHours(bed, wake);
          }
          if (!Number.isFinite(hoursVal) || hoursVal <= 0) hoursVal = 7;
          const sleepEntry = {
            type: 'sleep',
            id: `sleep_${Date.now()}`,
            wakeTime: Number.isFinite(wake) ? wake : 7.5,
            bedtime: Number.isFinite(bed) ? bed : undefined,
            sleepStart: Number.isFinite(bed) ? bed : undefined,
            sleepEnd: Number.isFinite(wake) ? wake : undefined,
            hours: hoursVal,
            duration: hoursVal,
            sleepHours: hoursVal,
            deepMin: d.deepMin,
            remMin: d.remMin,
            hr: d.hr,
          };
          if (isSimulationMode) {
            setSimulatedLog(prev => [...(prev || []), sleepEntry]);
            setPendingAiBatch(null);
            dismissKentuSleepTrigger();
            setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Ho registrato i dati del sonno (sandbox).' }]);
            if (optionalReply == null) setChatInput('');
            return;
          }
          const nuovoLog = [...(dailyLog || []), sleepEntry];
          setDailyLog(nuovoLog);
          syncDatiFirebase(nuovoLog, manualNodes);
          setPendingAiBatch(null);
          dismissKentuSleepTrigger();
          setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Ho registrato i dati del sonno nel diario. La curva del cortisolo terrà conto dell\'ora di risveglio.' }]);
          if (optionalReply == null) setChatInput('');
          return;
        }
        if (pendingAiBatch.type === 'sleep' && isCancel) {
          setPendingAiBatch(null);
          setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Operazione annullata. Cosa vuoi fare ora?' }]);
          if (optionalReply == null) setChatInput('');
          return;
        }

        if (Array.isArray(pendingAiBatch) && isConfirm) {
          const baseMealTime = getCurrentTimeRoundedTo15Min();
          const predictedType = predictMealType(baseMealTime);
          const sharedMealTime = typeof pendingAiBatch[0]?.mealTime === 'number' ? pendingAiBatch[0].mealTime : baseMealTime;
          const rawMt0 = pendingAiBatch[0]?.mealType;
          const dominantMealType =
            rawMt0 != null && String(rawMt0).trim() !== ''
              ? normalizeAiMealTypeToStorageId(rawMt0, sharedMealTime)
              : predictedType;
          const batchGhostType = getGhostMealType(dominantMealType, dailyLog || []);
          const batchId = `batch_${Date.now()}`;
          const alimentiProcessati = pendingAiBatch
            .map((item, index) => {
              const desc = item.desc || item.name || '';
              if (!desc) return null;
              const qta = Math.max(1, parseFloat(item.weight ?? item.qta) || 100);
              const datiNutrizionali = estraiDatiFoodDb(desc, qta, batchGhostType);
              return {
                ...datiNutrizionali,
                id: datiNutrizionali.id || `ai_${batchId}_${index}`,
                type: 'food',
                mealType: batchGhostType,
                mealTime: sharedMealTime,
                batchId
              };
            })
            .filter(Boolean);
          if (isSimulationMode) {
            setSimulatedLog(prev => [...alimentiProcessati, ...(prev || [])]);
            setPendingAiBatch(null);
            setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Perfetto, ho salvato tutto (sandbox). 📝' }]);
            if (optionalReply == null) setChatInput('');
            return;
          }
          const nuovoLog = [...alimentiProcessati, ...(dailyLog || [])];
          setDailyLog(nuovoLog);
          syncDatiFirebase(nuovoLog, manualNodes);
          setPendingAiBatch(null);
          setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Perfetto, ho salvato tutto nel diario! 📝' }]);
          if (optionalReply == null) setChatInput('');
          return;
        }
        if (lowerMsg.includes('annulla') || lowerMsg.includes('no')) {
          setPendingAiBatch(null);
          setChatHistory(prev => [...prev, { sender: 'user', text: userMessage }, { sender: 'ai', text: 'Operazione annullata. Cosa vuoi fare ora?' }]);
          if (optionalReply == null) setChatInput('');
          return;
        }
      }

      const isTrackerToday = (currentTrackerDate || getTodayString()) === getTodayString();
      if (
        !secretPrompt &&
        isTrackerToday &&
        userMessage &&
        chatImages.length === 0 &&
        !kentuAgendaAwaitingRef.current
      ) {
        const wIntent = detectWorkoutIntentFromChat(userMessage);
        if (wIntent) {
          const slot = findLastMatchingWorkoutSlot(fullHistory, currentTrackerDate || getTodayString(), wIntent.searchKeys);
          if (slot) {
            pendingWorkoutFlowRef.current = {
              kind: 'await_confirm',
              displayLabel: wIntent.displayLabel,
              activity: wIntent.activity,
              searchKeys: wIntent.searchKeys,
              suggestedDecimal: slot.decimalHour,
            };
            const timeStr = formatDecimalHourIt(slot.decimalHour);
            setChatHistory((prev) => [
              ...prev,
              { sender: 'user', text: userMessage },
              {
                sender: 'ai',
                text: `Ricevuto, preparo il piano per l'allenamento ${wIntent.displayLabel}. Di solito ti alleni alle ${timeStr}, va bene questo orario anche per oggi?`,
                quickReplies: ['Sì, va bene', 'No, un altro orario'],
                workoutTimeConfirm: true,
              },
            ]);
            if (optionalReply == null) setChatInput('');
            return;
          }
        }
      }

      const historyMessage = userMessage || (chatImages.length > 0 ? `📷 ${chatImages.length} immagine/i allegata/e` : '');
      setChatHistory(prev => [...prev, { sender: 'user', text: historyMessage }]);
      if (optionalReply == null) setChatInput('');
      setChatHistory(prev => [...prev, { sender: 'ai', isTyping: true }]);

      try {
        const foodDbNames = Object.keys(foodDb || {}).map(k => foodDb[k]?.desc || foodDb[k]?.name || k).filter(Boolean).slice(0, 150);
        const energyResult = generateRealEnergyData(nodesForEnergySimulation, dailyLogForEnergy, idealStrategy, 0, 2500, null, null, userModel, nervousSystemLoad, currentTime, accumuloSNC);
        const chartData = energyResult?.chartData || [];
        const energyAt20 = chartData[20]?.energy;
        const paginaAttuale = (!activeAction || activeAction === 'home') ? 'Menu principale' : activeAction === 'pasto' ? `Costruttore pasto (${MEAL_LABELS_SAVE[mealType] || mealType})` : activeAction === 'allenamento' ? 'Costruttore allenamento' : activeAction === 'acqua' ? 'Idratazione' : activeAction === 'ai_chat' ? 'Chat Kentu' : activeAction === 'diario_giornaliero' ? 'Diario giornaliero' : activeAction === 'storico' ? 'Archivio storico' : activeAction === 'strategia' ? 'Protocollo / Strategia' : activeAction === 'focus' ? 'Neural Reset' : activeAction;

        const currentDecimalTime = new Date().getHours() + (new Date().getMinutes() / 60);
        const roundedTime = Math.round(currentDecimalTime * 2) / 2;
        const currentCortisolScore = cortisolCurve?.find(c => c?.time === roundedTime)?.cortisolScore ?? 0;

        const piccoAnabolico = Math.max(0, ...(anabolicCurve?.map(c => c.anabolicScore) ?? [0]));
        const piccoCortisolo = Math.max(0, ...(cortisolCurve?.map(c => c.cortisolScore) ?? [0]));

        const anchorAi = currentTrackerDate || getTodayString();
        const lastBodyEntry =
          deriveEffectiveBodyMetricsForDate(bodyMetricsHistory, anchorAi, getTodayString()) ||
          deriveCurrentBodyMetricsFromHistory(bodyMetricsHistory, getTodayString());
        const weightKgForAi =
          lastBodyEntry?.weight != null && Number.isFinite(Number(lastBodyEntry.weight))
            ? Number(lastBodyEntry.weight)
            : userProfile?.weight != null && Number.isFinite(Number(userProfile.weight))
              ? Number(userProfile.weight)
              : null;
        let bodyFatPctForAi = null;
        if (lastBodyEntry?.bodyFat != null && lastBodyEntry.bodyFat !== '') {
          const n = Number(lastBodyEntry.bodyFat);
          if (Number.isFinite(n)) bodyFatPctForAi = n;
        } else if (userProfile?.bodyFat != null && userProfile.bodyFat !== '') {
          const n = Number(userProfile.bodyFat);
          if (Number.isFinite(n)) bodyFatPctForAi = n;
        }

        const avgLong30ForAi = calculateConsolidatedAverageScore(30, anchorAi, longevityScoreHistory);
        const avgLong7ForAi = calculateConsolidatedAverageScore(7, anchorAi, longevityScoreHistory);
        const userAgeForAi = calculateAge(birthDate);
        let projectedAgeForAi = null;
        if (typeof userAgeForAi === 'number' && !Number.isNaN(userAgeForAi)) {
          if (avgLong30ForAi != null) projectedAgeForAi = calculateProjectedAge(userAgeForAi, avgLong30ForAi);
          else if (avgLong7ForAi != null) projectedAgeForAi = calculateProjectedAge(userAgeForAi, avgLong7ForAi);
        }
        const longevityMasterFallbackForAi =
          (typeof longevityEngineScore?.score === 'number' && !Number.isNaN(longevityEngineScore.score)
            ? longevityEngineScore.score
            : null) ??
          (typeof longevityData?.masterScore === 'number' && !Number.isNaN(longevityData.masterScore)
            ? longevityData.masterScore
            : null);

        const aiVitalsContextParagraph = buildKentuAiVitalsContextParagraph({
          weightKg: weightKgForAi,
          bodyFatPct: bodyFatPctForAi,
          projectedAge: projectedAgeForAi,
          avgScore30: avgLong30ForAi,
          avgScore7: avgLong7ForAi,
          longevityMasterScoreFallback: longevityMasterFallbackForAi,
        });

        const metabolicRecompositionContext =
          buildKentuAiMetabolicRecompositionContext(metabolicVarianceForAi);

        const swCtx = scheduledWorkoutContextRef.current;
        const swAnchor = currentTrackerDate || getTodayString();
        let scheduledWorkoutPromptExtra = '';
        if (
          swCtx &&
          swCtx.dateStr === swAnchor &&
          typeof swCtx.workoutDecimalHour === 'number'
        ) {
          const wh = formatDecimalHourIt(swCtx.workoutDecimalHour);
          const nowDecAi = new Date().getHours() + new Date().getMinutes() / 60;
          if (swCtx.workoutDecimalHour > nowDecAi - 0.5) {
            const safeLab = String(swCtx.label || '').replace(/"/g, "'").slice(0, 80);
            scheduledWorkoutPromptExtra = `\n\nREGOLA ORARIO ALLENAMENTO: L'utente ha confermato un allenamento «${safeLab}» alle ${wh} di oggi. Finché non è passata quell'ora (finestra pre-workout ~90 min prima della sessione), NON proporre pasti "adesso", colazione immediata o spuntini fuori contesto: ragiona solo in termini di pre-workout (prima della sessione) e post-workout (dopo), con orari dei pasti allineati all'allenamento.`;
          }
        }

        const baseSystemPrompt = `Sei l'assistente di KentuOS. Il tuo scopo è dialogare con l'utente in italiano.

  TONO (CO-PILOTA METABOLICO): Sei un Co-Pilota Metabolico di altissimo livello. Sii assertivo, tecnico ma immediato. NON usare toni timidi o accomodanti (es. "Vuoi che ti aiuti?", "Fammi sapere se ti va"). Usa toni direttivi (es. "Ottimizzo i macronutrienti per il recupero", "Sposta 15g di grassi a pranzo"). Chiudi con un'azione netta o una scelta binaria, senza ipersimpatia.

  FORMATO "AI CARD" / DASHBOARD TESTUALE: Rispondi come una dashboard leggibile nel testo. Usa separatori tra blocchi (riga vuota tra sezioni), intestazioni chiare con emoji (es. riga dedicata "📊 STRATEGIA NUTRIZIONALE"). Quando riassumi macronutrienti, metriche, stress o allineamento agli obiettivi, usa SEMPRE barre visive fatte di caratteri/emoji per indicare riempimento o allerta, con una riga per metrica.
  Esempio di formato obbligatorio (adatta numeri e testi al contesto):
  📊 STRATEGIA NUTRIZIONALE
  🔻 Carbo: [███░░░░░░░] Riduci zuccheri serali
  🔺 Fibre: [████████░░] Focus ottimale
  ⚖️ Grassi: [█████░░░░░] Sotto controllo
  👉 Azione: Sposta 15g di grassi a pranzo.
  Combina questo stile con elenchi puntati dove serve; niente muri di testo.

  REGOLE DI STILE (PRIORITÀ): Sintesi brutale. Al massimo 3 elenchi puntati per messaggio (quando usi elenchi). Vietate introduzioni tipo "Ecco il tuo briefing" / "Ecco un riepilogo" e conclusioni tipo "Spero di esserti stato utile" / "Fammi sapere": vai dritto al sodo.
  FORMATTAZIONE OBBLIGATORIA: Devi essere chiarissimo e massimizzare la leggibilità. Quando dai consigli, spieghi concetti, elenchi alimenti o fai riepiloghi, usa SEMPRE gli elenchi puntati. Evita muri di testo. Usa frasi brevi, dirette e separate visivamente.
  QUICK ACTION — Se l'ultimo messaggio utente inizia con QUICK_ACTION=BRIEFING o QUICK_ACTION=ANALISI_IERI: rispondi ESCLUSIVAMENTE in formato Lavagna (emoji + dato per riga, elenchi puntati essenziali), rispettando il tetto di 3 elenchi e le REGOLE DI STILE sopra.
  QUICK ACTION — Se l'ultimo messaggio utente inizia con QUICK_ACTION=IDEA_PASTO: rispondi ESCLUSIVAMENTE con il blocco [MEAL_PROPOSAL:{...}] su una riga come da CARTA MENU; nessun altro testo (la Dispensa è in [CONTEXT_LIVE]).

  MODALITÀ PIANIFICAZIONE: Se l'utente chiede di pianificare o programmare la giornata (testo libero o tramite wizard), entra in modalità pianificazione. Se il messaggio utente inizia con "PIANIFICAZIONE GUIDATA:", ha già scelto attività e fasce (Mattina / Pomeriggio / Sera): NON chiedere altro, NON fare elenchi lunghi. Rispondi generando ESATTAMENTE il token [DAILY_PLAN:{...}] su una riga, con orari concreti HH:MM coerenti con le fasce (es. Mattina → 08:00–11:30, Pomeriggio → 12:00–17:30, Sera → 18:00–22:00; se l'allenamento è in Sera usa tipicamente 18:30 o 19:00 come workoutTime e nella lista activities). Il JSON DEVE includere anche "ghostMeals": array di pasti pianificati (Nodi Fantasma) che l'utente vedrà in timeline finché non li converte in pasti veri: ogni elemento include {"mealType":"colazione|snack|pranzo|cena", "time":"HH:MM", "title":"Titolo breve", "microDesc":"Suggerimento micronutrienti (es. fibre, omega-3) per lucidità e sonno", "draftFoods":["200g Pollo","150g Riso"]} — draftFoods è un array di stringhe (abbozzo alimenti con pesi stimati). Per i pasti futuri nel token, calcola i target e COMPILA draftFoods con un abbozzo realistico di alimenti. Dai MASSIMA PRIORITÀ copiando pasti simili che l'utente ha consumato in passato (presenti nello storico) o cibi dal suo database/dispensa in [CONTEXT_LIVE]. Inserisci pesi stimati per centrare il target. Esempio forma completa: [DAILY_PLAN:{"target":"pari", "workoutTime":"19:00", "activities":[...], "ghostMeals":[{"mealType":"cena", "time":"20:00", "title":"Cena Recupero", "microDesc":"Focus proteine", "draftFoods":["200g Pollo","150g Riso"]}]}]. Scegli "target" (deficit, pari o surplus) in base a [CONTEXT_LIVE]. Altrimenti, in conversazione aperta, chiedi le attività; quando l'utente risponde, genera lo stesso token con ghostMeals coerenti col piano. Il token deve essere da solo su una riga. ATTENZIONE: DEVI OBBLIGATORIAMENTE riempire l'array draftFoods per OGNI nodo fantasma ('ghostMeals'). Se non sai cosa inserire, inventa un pasto coerente coi target (es. ['200g Pollo', '10g Olio']). L'array NON DEVE MAI essere vuoto. GERARCHIA COMPOSIZIONE draftFoods (ordine tassativo): (1) RECENTI — pasti identici o molto simili consumati negli ultimi 3–7 giorni; (2) STORICO — abitudini e pattern a più lungo termine se i recenti non bastano; (3) DISPENSA / DATABASE — attingi da foodDb e da alimenti noti in contesto, rispettando i target (es. pasto proteico → fonti proteiche coerenti); (4) NEW ENTRY — solo come ultima spiaggia, combinazione nuova e bilanciata. Ogni voce deve avere grammatura precisa per centrare i target ricalcolati. È SEVERAMENTE VIETATO GENERARE UN NODO FANTASMA SENZA CIBI. DEVI SEMPRE COMPILARE L'ARRAY 'draftFoods' (ES. ["200G POLLO", "10G OLIO"]) PER OGNI PASTO FUTURO, SIMULANDO LA COMPOSIZIONE IDEALE BASATA SUI TARGET.

  REGOLA DI BILANCIAMENTO METABOLICO: Il tuo scopo primario è coprire il fabbisogno giornaliero. Se dopo aver inserito i pasti/attività esistenti noti che c'è un deficit calorico rimanente significativo (es. mancano più di 200 kcal ai target), DEVI ASSOLUTAMENTE inserire uno o più 'ghostMeals' (es. Cena o Spuntino) nell'array JSON per colmare il gap. NON TERMINARE MAI la pianificazione lasciando l'utente in grave deficit calorico.

  ATTENZIONE TEMPORALE: Se nel prompt utente ricevi l'ora attuale e gli eventi già registrati, DEVI rispettarli. Proponi solo Nodi Fantasma futuri. Se la colazione o il pranzo sono già stati fatti, concentrati solo sugli spuntini e la cena, bilanciando i macro rimanenti.

  LOGICA DI RACCOMANDAZIONE INTELLIGENTE: Quando l'utente chiede consigli su cosa mangiare (es. "Cosa mangio per cena?"):
  1. Analizza i macro residui dal blocco [CONTEXT_LIVE] nell'ultimo messaggio utente per avvicinarti al fabbisogno giornaliero (senza ignorare equilibrio e contesto).
  2. Dai priorità assoluta agli ingredienti elencati in "Dispensa" in [CONTEXT_LIVE]: è molto probabile che l'utente li abbia già in casa.
  3. Se è ora di cena o il tema è serale, proponi pasti coerenti con la Nota in [CONTEXT_LIVE] sul cortisolo: carboidrati complessi, evita eccessi di grassi saturi o caffeina serale.
  4. Presenta la proposta in STILE LAVAGNA con i macro totali stimati della ricetta (kcal e grammi P/C/F se possibile).
  5. DIGESTIVE SAFETY GATE — Quando consigli un workout, calcola la somma tra i macro residui (da [CONTEXT_LIVE]) e il costo del workout. Se il totale calorico risultante per la cena supera le 900-1000 kcal (o se il volume di cibo previsto è eccessivo per l'orario), sconsiglia l'allenamento intenso. Spiega chiaramente che un pasto troppo pesante comprometterebbe il recupero e la gestione del cortisolo serale, suggerendo invece un pasto bilanciato e il rinvio dell'attività.
  6. TRAINING WAVE (ORARIO ALLENAMENTO): In [CONTEXT_LIVE] c'è la riga «Finestra allenamento ideale: dalle HH:mm alle HH:mm.» oppure «Finestra allenamento ideale: Domani.» (nessuna finestra nelle prossime 4h del modello). Quando l'utente chiede se può allenarsi o quando conviene, usa quell'orario e l'ora attuale del messaggio.
  - Prima dell'inizio della finestra: sconsiglia l'immediato; spiega in modo telegrafico (digestione/recupero) e indica di spostare l'allenamento dentro la finestra indicata.
  - Con ora attuale dentro HH:mm–HH:mm: via libera per sessione ben pianificata; ricorda che è la finestra prevista dal modello.
  - Dopo la fine o se compare solo «Domani»: niente finestra utile nell'orizzonte — evita HIIT intenso, preferisci riposo attivo o ripresa il giorno dopo.

  CARTA MENU (MEAL_PROPOSAL): Quando proponi una cena concreta con ingredienti e grammi (contesto consiglio pasto / cena), NON scrivere una ricetta lunga in prose. Rispondi SOLO con il blocco dati su UNA riga così (nessun altro testo prima o dopo): [MEAL_PROPOSAL:{"title":"Proposta Cena Anti-Cortisolo","timeString":"HH:mm","items":[{"id":"id_univoco","name":"Nome alimento","qty":grammi,"dbKey":"chiave_opzionale_foodDb","why":"motivo breve","estKcal":n,"estPro":n,"estCar":n,"estFat":n}]}] — id univoco per ogni voce (es. salmone_1); qty in grammi; stime macro per quella quantità; dbKey solo se corrisponde al database noto.

  STILE DI COMUNICAZIONE TASSATIVO (STILE LAVAGNA/COACH + AI CARD): Non usare MAI paragrafi lunghi o muri di testo. Sei un coach operativo. Le risposte devono essere visive, telegrafiche, come lavagna tattica in formato dashboard (vedi TONO e FORMATO "AI CARD" sopra).
  Per ogni messaggio di testo normale (non vale quando un'altra regola impone SOLO JSON o SOLO array, senza testo libero):
  1. Titolo sezione con emoji su riga propria (es. 📊 … oppure **🎯 Status** se usi markdown).
  2. Metriche chiave: dove possibile, una riga con barra [████░░] + etichetta breve.
  3. Elenchi puntati sintetici per dettagli o opzioni.
  4. Grassetti su numeri, kcal, grammi P/C/F quando usi markdown.
  5. Chiusura assertiva: imperativo o scelta A/B (coerente col TONO Co-Pilota), non inviti vaghi.

  Se l'utente inserisce alimenti (anche in lista, es. "ho mangiato 3 gallette e 1 mela per spuntino") SENZA indicare un orario del pasto in modo da poter usare add_food (vedi PASTI ZERO FORM), devi rispondere ESCLUSIVAMENTE con un array JSON di oggetti. Formato: [{"name": "Nome alimento", "weight": peso_totale_grammi, "mealType": "pranzo"}]. Usa "name" o "desc", "weight" o "qta" (in grammi).

  VOCABOLARIO PASTI (campo mealType — TASSATIVO): usa solo questi quattro valori: "colazione", "snack", "pranzo", "cena".
  Qualsiasi spuntino o merenda (mattina o pomeriggio) → "snack". Pasto principale di mezzogiorno → "pranzo". Cena → "cena". Colazione → "colazione".
  Compatibilità deprecata accettata dal parser: "merenda1"→colazione, "merenda_am"/"merenda_pm"/"merenda2"/"spuntino"→snack.

  REGOLA MOLTIPLICATORE: Se l'utente indica quantità a pezzi (es. "3 gallette di riso", "2 uova"), stima il peso di UNA singola unità, moltiplicalo per la quantità, e inserisci il PESO TOTALE IN GRAMMI nel campo "weight" (es. 2 uova ≈ 120g, 3 gallette ≈ 30g totali). Un solo alimento = array con un elemento [{"name":"...", "weight": N, "mealType":"..."}].

  Puoi anche proporre alternative dal database e chiedere conferma; alla conferma restituisci l'array JSON. In alternativa, per un singolo inserimento legacy, puoi usare {"action":"insert","food":{"desc":"nome","qta":grammi,"mealType":"pranzo"}} (mealType sempre uno dei cinque slot ufficiali sopra).

  COMANDI DI SISTEMA (INVISIBILI): Se l'utente dichiara nel testo l'intenzione di cambiare strategia calorica (es. andare in deficit, mantenimento/pari, o surplus) OPPURE dichiara un orario in cui si allenerà, DEVI inserire alla FINE ASSOLUTA della tua risposta testuale un blocco dati formattato esattamente così: ===CMD:{"target":"deficit|pari|surplus", "workoutTime":"HH:MM"|null}===. Se l'utente non menziona modifiche strategiche né un orario di allenamento, non inserire il comando. Per solo orario di allenamento senza cambio strategia usa "pari" come target. workoutTime in 24h (es. "18:30") o null se non applichi un orario; null cancella l'orario programmato nel sistema quando l'utente lo revoca esplicitamente.

  SONNO (ZERO FORM — solo messaggio testuale, niente screenshot Mi Fitness): Se l'utente riferisce di aver dormito (sonno notturno o sonnellino/pisolino), estrai la durata in ore decimali (es. 45 minuti = 0.75, 1 ora e mezza = 1.5). Se valuta esplicitamente come ha dormito o menziona stelle, convertila in sleepQuality intero 1-5. Formato: {"action":"add_sleep","hours":<numero_ore>,"sleepQuality":<1-5_o_null>}. Non aggiungere alcun testo fuori dal JSON.

  ALLENAMENTO (ZERO FORM — solo messaggio testuale): Se l'utente riferisce di essersi allenato o di aver fatto un'attività fisica, estrai titolo, orario di INIZIO esatto e durata in minuti. Se menziona fatica 1-10 salvala in rpe; se menziona obiettivo (ipertrofia/forza/resistenza/mantenimento/junk) salvalo in trainingGoal; note carichi/variazioni in progressionNote. SLOT FILLING SEVERO: se mancano dati cruciali (orario esatto di inizio o durata in minuti), NON inventarli: imposta "timeString" a null o "" e "duration" a null. Non usare add_workout finché l'utente non ha fornito entrambi in modo chiaro nel messaggio. Se le calorie non sono note, puoi stimarle solo quando durata e orario sono entrambi presenti; altrimenti "calories" può essere null. Formato JSON obbligatorio: {"action":"add_workout","title":"nome_attività","timeString":"HH:mm","duration":<minuti_intero>,"calories":<kcal_o_null>,"trainingGoal":<"Ipertrofia"|"Forza"|"Resistenza"|"Mantenimento"|"Junk"|null>,"rpe":<1-10_o_null>,"progressionNote":<stringa_o_null>}. timeString in 24h (es. "18:30"). Restituisci RIGOROSAMENTE solo questo JSON senza altro testo. Non usare add_workout nella stessa risposta di add_sleep o log_sleep.

  PASTI (ZERO FORM — add_food): Se l'utente riferisce di aver mangiato, estrai l'orario del pasto (timeString HH:mm) e una lista di alimenti con le rispettive quantità in grammi. Per ogni alimento fornisci anche una tua stima biochimica dei macronutrienti per quella specifica quantità nei campi estKcal (kcal), estPro (proteine g), estCar (carboidrati g), estFat (grassi g). SLOT FILLING SEVERO: se manca l'orario o la quantità in grammi di un alimento, NON inventarli: usa timeString null o "" e qty null. Restituisci RIGOROSAMENTE solo questo JSON senza altro testo: {"action":"add_food","timeString":"HH:mm","items":[{"name":"nome_alimento","qty":grammi,"estKcal":stima,"estPro":stima,"estCar":stima,"estFat":stima}]}. Non mischiare add_food con add_sleep, add_workout o log_sleep. Per elenchi senza orario/chiarezza per add_food usa l'array JSON legacy descritto sopra.

  Database alimenti noti: ${foodDbNames.length ? foodDbNames.join(', ') : 'nessuno'}.

  Contesto: Pagina ${paginaAttuale}. Rischio stress serale ${energyAt20 != null && energyAt20 < 40 ? 'ALTO' : 'Basso'}. [STRATEGIA: ...]. [ALLENAMENTO: desc | kcal]. Applica lo STILE LAVAGNA/COACH sopra.

  QUICK REPLIES (OBBLIGATORIO QUANDO SERVE UNA SCELTA): Se chiedi conferma, proponi opzioni o un bivio, includi SEMPRE il blocco JSON quick_replies in coda. Nel testo visibile, invita perentoriamente a usare i pulsanti rapidi sotto il messaggio (es. «Scegli sotto», «Tocca un'opzione») e NON a riscrivere la stessa cosa a mano, salvo correzioni numeriche. Le etichette dei quick_replies devono coincidere con le azioni che proponi. Formato esatto su una riga finale: {"quick_replies": ["Sì, confermo", "Modifica quantità", "No, annulla"]}.`;

        const dynamicSystemPrompt = `${baseSystemPrompt}

  DATI BIOCHIMICI IN TEMPO REALE DELL'UTENTE:
  - Ora locale: ${new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
  - Livello di Cortisolo stimato (0-100): ${Math.round(currentCortisolScore)}

  REGOLA BIOCHIMICA FONDAMENTALE (RECUPERO NERVOSO):
  Se l'utente chiede consigli per un pasto (in particolar modo la cena) o valuta opzioni alimentari, devi analizzare il livello di Cortisolo. Se il cortisolo è medio-alto in orario serale, è un segnale di allarme per il sistema nervoso. In questo caso, DEVI prioritizzare suggerimenti nutrizionali calmanti: proponi fonti di carboidrati complessi (che aiutano ad abbassare il cortisolo e favoriscono il sonno), alimenti ricchi di magnesio, omega 3 o triptofano. Evita di proporre pasti serali composti solo da proteine magre se lo stress è alto. Tono assertivo e focalizzato sul recupero: niente linguaggio timido o ipersimpatia.

  LETTURA DEI GRAFICI ODIERNI:
  - Picco massimo Sintesi Proteica oggi: ${Math.round(piccoAnabolico)}%
  - Picco massimo Cortisolo oggi: ${Math.round(piccoCortisolo)}

  REGOLA PER SPIEGAZIONE GRAFICI:
  Se l'utente ti chiede spiegazioni sui suoi grafici, sulle sue curve o sui suoi livelli (es. "spiegami il grafico viola", "perché l'anabolismo è basso?"), usa i dati forniti per fargli un'analisi personalizzata. Spiega che il grafico viola (Cortisolo) indica lo stress nervoso (che sale con lavoro e allenamento), mentre la curva azzurra/verde (Sintesi proteica) indica il nutrimento muscolare. Sii chiaro e diretto ma SEMPRE in formato lavagna: titolo+emoji, elenco puntato sintetico, grassetti sui numeri, domanda finale — niente paragrafi lunghi.

  RICONOSCIMENTO SONNO CONVERSAZIONALE (solo durata, senza screenshot Mi Fitness):
  Se l'utente descrive solo quanto ha dormito (notte o pisolino) e NON stai estraendo un report Mi Fitness con sveglia/addormentamento/deep/REM, applica la regola SONNO (ZERO FORM) del prompt base: solo il JSON add_sleep, senza testo extra. Non usare add_sleep insieme a log_sleep nella stessa risposta.

  TRACCIAMENTO DEL SONNO E VISION:
  Se l'utente allega uno screenshot di un'app di tracciamento del sonno (es. Mi Fitness) o scrive i dati testualmente, estrai questi valori chiave: Ora di risveglio (es. 06:18 diventa 6.3 in ore decimali), Ore totali di sonno (es. 6 ore e 34 min diventa 6.56), Tempo in fase Profonda in minuti (es. 2h 14m = 134), Tempo in fase REM in minuti, Frequenza cardiaca media (BPM). Rispondi con un breve riepilogo testuale ("Ho letto i dati: hai dormito 6h 34m, recupero profondo ottimo...") e includi un JSON strutturato su una riga: {"action": "log_sleep", "sleepData": {"wakeTime": 6.3, "hours": 6.56, "sleepStart": 23.5, "sleepEnd": 6.3, "deepMin": 134, "remMin": 94, "hr": 56}}. Usa SEMPRE i quick_replies: {"quick_replies": ["Sì, confermo", "No, annulla"]} per la conferma prima del salvataggio.
  ${SLEEP_AI_MI_FITNESS_INSTRUCTIONS}${aiVitalsContextParagraph ? `\n\nCOMPOSIZIONE CORPORALE E LONGEVITÀ (contesto utente):\n${aiVitalsContextParagraph}` : ''}${metabolicRecompositionContext ? `\n\n${metabolicRecompositionContext}` : ''}${scheduledWorkoutPromptExtra}`;

        const previousMessages = (chatHistory || []).filter(m => !m.isTyping);
        const recentHistory = previousMessages.slice(-CHAT_HISTORY_WINDOW);
        const isLocalError = (text) => {
          const t = (text || '').trim();
          return t.startsWith('❌') || t.includes('Errore Server') || t.includes('Nessuna API Key');
        };
        const filtered = recentHistory.filter(m => !isLocalError(m.text));
        const conversationLines = filtered.map((m) => {
          const raw = (m.text || '').trim();
          const lineText =
            m.sender === 'user' ? stripInvisibleContextFromVisibleUserText(raw) : raw;
          return (m.sender === 'user' ? 'Utente: ' : 'Assistente: ') + lineText;
        });
        const burnedKcalContext = (activeLog || [])
          .filter((item) => item.type === 'workout')
          .reduce((acc, wk) => acc + (Number(wk.kcal || wk.cal) || 0), 0);
        const dynamicDailyKcalContext =
          applyCalorieStrategyToProfileKcal(userTargets?.kcal ?? 2000, kentuDailyCalorieStrategy) +
          burnedKcalContext;
        const contextString = getInvisibleContext({
          bodyBatteryPercent: bodyBattery?.currentEnergy ?? 0,
          dynamicDailyKcal: dynamicDailyKcalContext,
          totali,
          userTargets,
          fullHistory,
          anchorDateStr: currentTrackerDate || getTodayString(),
          trainingWaveSnippet: buildTrainingWaveContextSnippet(trainingWaveResult),
          mealTypeForSmart: activeAction === 'pasto' ? mealType : undefined,
          dailyLogForSmart: activeAction === 'pasto' ? (activeLog || dailyLog) : undefined,
          kentuCalorieStrategy: kentuDailyCalorieStrategy,
        });
        const rawLastUserForApi =
          apiUserContent || (chatImages.length > 0 ? `[Allegati ${chatImages.length} screenshot da analizzare]` : '');
        const apiMessage = rawLastUserForApi
          ? `${contextString} ${rawLastUserForApi}`.trim()
          : contextString;
        conversationLines.push('Utente: ' + apiMessage);
        const conversationText = conversationLines.join('\n');
        const fullPrompt = dynamicSystemPrompt + '\n\n---\nConversazione (rispondi come Assistente all\'ultimo messaggio):\n' + conversationText;

        let responseText = await callGeminiAPIWithRotation(fullPrompt, { images: chatImages.length > 0 ? chatImages : undefined });
        setChatImages([]);
        {
          const cmdCut = parseKentuInvisibleCmd(responseText);
          responseText = cmdCut.stripped;
          if (cmdCut.cmd) applyKentuChatCmd(cmdCut.cmd);
        }

        let insertPayload = null;
        let itemsArray = null;

        const insertStart = responseText.indexOf('{"action":"insert"');
        if (insertStart !== -1) {
          let depth = 0;
          let end = insertStart;
          for (let i = insertStart; i < responseText.length; i++) {
            if (responseText[i] === '{') depth++;
            else if (responseText[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
          }
          try {
            const parsed = JSON.parse(responseText.slice(insertStart, end + 1));
            if (parsed.action === 'insert' && parsed.food && (parsed.food.desc || parsed.food.name)) {
              insertPayload = parsed.food;
            }
          } catch (_) {}
        }

        const arrayStart = responseText.indexOf('[');
        if (itemsArray == null && arrayStart !== -1 && responseText.indexOf('"add_food"') === -1) {
          let depth = 0;
          let arrayEnd = arrayStart;
          for (let i = arrayStart; i < responseText.length; i++) {
            if (responseText[i] === '[' || responseText[i] === '{') depth++;
            else if (responseText[i] === ']' || responseText[i] === '}') { depth--; if (depth === 0 && responseText[i] === ']') { arrayEnd = i; break; } }
          }
          try {
            const parsed = JSON.parse(responseText.slice(arrayStart, arrayEnd + 1));
            if (Array.isArray(parsed) && parsed.length > 0 && parsed.some(x => x && (x.name || x.desc) && (x.weight != null || x.qta != null))) {
              itemsArray = parsed;
            }
          } catch (_) {}
        }

        let addSleepHours = null;
        const addSleepMarker = responseText.indexOf('"add_sleep"');
        if (addSleepMarker !== -1) {
          let addObjStart = responseText.lastIndexOf('{', addSleepMarker);
          if (addObjStart !== -1) {
            let depthAs = 0;
            let addObjEnd = addObjStart;
            for (let i = addObjStart; i < responseText.length; i++) {
              if (responseText[i] === '{') depthAs++;
              else if (responseText[i] === '}') {
                depthAs--;
                if (depthAs === 0) {
                  addObjEnd = i;
                  break;
                }
              }
            }
            try {
              const addParsed = JSON.parse(responseText.slice(addObjStart, addObjEnd + 1));
              if (addParsed && addParsed.action === 'add_sleep') {
                const sleepHoursParsed = Number(addParsed.hours) || 0;
                if (Number.isFinite(sleepHoursParsed) && sleepHoursParsed > 0 && sleepHoursParsed <= 24) {
                  const sq = Number(addParsed.sleepQuality);
                  addSleepHours = {
                    hours: Math.round(sleepHoursParsed * 1000) / 1000,
                    sleepQuality:
                      Number.isFinite(sq) && sq >= 1 && sq <= 5 ? Math.round(sq) : null,
                  };
                }
              }
            } catch (_) {}
          }
        }

        let addWorkoutPayload = null;
        let addWorkoutSlotError = false;
        const addWorkoutMarker = responseText.indexOf('"add_workout"');
        if (addWorkoutMarker !== -1) {
          let woObjStart = responseText.lastIndexOf('{', addWorkoutMarker);
          if (woObjStart !== -1) {
            let depthWo = 0;
            let woObjEnd = woObjStart;
            for (let i = woObjStart; i < responseText.length; i++) {
              if (responseText[i] === '{') depthWo++;
              else if (responseText[i] === '}') {
                depthWo--;
                if (depthWo === 0) {
                  woObjEnd = i;
                  break;
                }
              }
            }
            try {
              const woParsed = JSON.parse(responseText.slice(woObjStart, woObjEnd + 1));
              if (woParsed && woParsed.action === 'add_workout') {
                const timeStrRaw = woParsed.timeString != null ? String(woParsed.timeString).trim() : '';
                const timeDecFromSlot = timeStrRaw ? parseFlexibleTimeToDecimal(timeStrRaw) : null;
                const durRaw = woParsed.duration;
                const wDuration =
                  durRaw === null || durRaw === undefined || durRaw === ''
                    ? NaN
                    : Number(durRaw);
                const hasValidDuration = Number.isFinite(wDuration) && wDuration > 0;
                const hasValidTimeString = timeStrRaw.length > 0 && timeDecFromSlot != null;
                if (!hasValidDuration || !hasValidTimeString) {
                  addWorkoutSlotError = true;
                } else {
                  const wTitle =
                    woParsed.title != null && String(woParsed.title).trim()
                      ? String(woParsed.title).trim()
                      : 'Allenamento';
                  let wCalories = Number(woParsed.calories);
                  if (!Number.isFinite(wCalories) || wCalories <= 0) {
                    wCalories = Math.max(80, Math.round(wDuration * 8));
                  }
                  const rpeRaw = Number(woParsed.rpe);
                  const goalRaw = woParsed.trainingGoal != null
                    ? String(woParsed.trainingGoal).trim()
                    : '';
                  const noteRaw = woParsed.progressionNote != null
                    ? String(woParsed.progressionNote).trim()
                    : '';
                  addWorkoutPayload = {
                    title: wTitle,
                    duration: wDuration,
                    calories: wCalories,
                    timeString: timeStrRaw,
                    timeDec: timeDecFromSlot,
                    trainingGoal: goalRaw || null,
                    rpe: Number.isFinite(rpeRaw) && rpeRaw >= 1 && rpeRaw <= 10
                      ? Math.round(rpeRaw)
                      : null,
                    progressionNote: noteRaw || null,
                  };
                }
              }
            } catch (_) {}
          }
        }

        let addFoodPayload = null;
        let addFoodHabitProposal = null;
        let addFoodSlotError = false;
        const habitLogFlat = normalizeLogData([
          ...(Array.isArray(dailyLog) ? dailyLog : []),
          ...(Array.isArray(simulatedLog) ? simulatedLog : []),
        ]);
        const addFoodMarker = responseText.indexOf('"add_food"');
        if (addFoodMarker !== -1) {
          let afObjStart = responseText.lastIndexOf('{', addFoodMarker);
          if (afObjStart !== -1) {
            let depthAf = 0;
            let afObjEnd = afObjStart;
            for (let i = afObjStart; i < responseText.length; i++) {
              if (responseText[i] === '{') depthAf++;
              else if (responseText[i] === '}') {
                depthAf--;
                if (depthAf === 0) {
                  afObjEnd = i;
                  break;
                }
              }
            }
            try {
              const afParsed = JSON.parse(responseText.slice(afObjStart, afObjEnd + 1));
              if (afParsed && afParsed.action === 'add_food') {
                const timeStrRaw = afParsed.timeString != null ? String(afParsed.timeString).trim() : '';
                const mealDecFromSlot = timeStrRaw ? parseFlexibleTimeToDecimal(timeStrRaw) : null;
                const hasValidTimeString = timeStrRaw.length > 0 && mealDecFromSlot != null;
                const itemsRaw = afParsed.items;
                const itemsArr = Array.isArray(itemsRaw) ? itemsRaw : [];
                if (!hasValidTimeString || itemsArr.length === 0) {
                  addFoodSlotError = true;
                } else {
                  let slotInvalid = false;
                  let needsHabitConfirm = false;
                  const normalizedItems = [];
                  for (const it of itemsArr) {
                    const nm = it?.name != null ? String(it.name).trim() : '';
                    if (!nm) {
                      slotInvalid = true;
                      break;
                    }
                    const qtyN = Number(it?.qty);
                    const qtyOk = Number.isFinite(qtyN) && qtyN > 0;
                    if (qtyOk) {
                      normalizedItems.push({
                        name: nm,
                        qty: qtyN,
                        estKcal: it?.estKcal,
                        estPro: it?.estPro,
                        estCar: it?.estCar,
                        estFat: it?.estFat,
                      });
                    } else {
                      const habit = findRecentFoodHabit(nm, foodDb, habitLogFlat);
                      if (!habit) {
                        slotInvalid = true;
                        break;
                      }
                      needsHabitConfirm = true;
                      normalizedItems.push({
                        name: habit.name,
                        qty: habit.qty,
                        estKcal: it?.estKcal,
                        estPro: it?.estPro,
                        estCar: it?.estCar,
                        estFat: it?.estFat,
                        matchedKey: habit.dbKey,
                      });
                    }
                  }
                  if (slotInvalid) addFoodSlotError = true;
                  else if (needsHabitConfirm) {
                    addFoodHabitProposal = {
                      timeString: timeStrRaw,
                      mealDec: mealDecFromSlot,
                      items: normalizedItems,
                    };
                  } else {
                    addFoodPayload = {
                      timeString: timeStrRaw,
                      mealDec: mealDecFromSlot,
                      items: normalizedItems,
                    };
                  }
                }
              }
            } catch (_) {}
          }
        }

        if (addFoodHabitProposal != null) {
          setPendingHabit(addFoodHabitProposal);
          const bullets = addFoodHabitProposal.items
            .map((it) => `- **Alimento:** ${it.name}\n- **Quantità:** ${it.qty}g`)
            .join('\n\n');
          const msg = `🎯 **Conferma Abitudine**\n${bullets}\n\nConfermi questo inserimento? (Sì/No)`;
          setChatHistory((prev) => {
            const next = [...prev];
            next.pop();
            next.push({ sender: 'ai', text: msg });
            return next;
          });
          return;
        }

        let sleepDataPayload = null;
        const logSleepIdx = responseText.indexOf('"log_sleep"');
        if (logSleepIdx === -1) {
          const altIdx = responseText.indexOf('log_sleep');
          if (altIdx !== -1) {
            let objStart = responseText.lastIndexOf('{', altIdx);
            if (objStart !== -1) {
              let depth = 0;
              let objEnd = objStart;
              for (let i = objStart; i < responseText.length; i++) {
                if (responseText[i] === '{') depth++;
                else if (responseText[i] === '}') { depth--; if (depth === 0) { objEnd = i; break; } }
              }
              try {
                const parsed = JSON.parse(responseText.slice(objStart, objEnd + 1));
                if (parsed.action === 'log_sleep' && parsed.sleepData && typeof parsed.sleepData === 'object') {
                  sleepDataPayload = parsed.sleepData;
                }
              } catch (_) {}
            }
          }
        } else {
          let objStart = responseText.lastIndexOf('{', logSleepIdx);
          if (objStart !== -1) {
            let depth = 0;
            let objEnd = objStart;
            for (let i = objStart; i < responseText.length; i++) {
              if (responseText[i] === '{') depth++;
              else if (responseText[i] === '}') { depth--; if (depth === 0) { objEnd = i; break; } }
            }
            try {
              const parsed = JSON.parse(responseText.slice(objStart, objEnd + 1));
              if (parsed.action === 'log_sleep' && parsed.sleepData && typeof parsed.sleepData === 'object') {
                sleepDataPayload = parsed.sleepData;
              }
            } catch (_) {}
          }
        }
        if (sleepDataPayload && addSleepHours == null) {
          setPendingAiBatch({ type: 'sleep', data: sleepDataPayload });
        }

        if (addSleepHours != null) {
          const sleepHours = typeof addSleepHours === 'object'
            ? Number(addSleepHours.hours)
            : Number(addSleepHours);
          const sleepQuality = typeof addSleepHours === 'object'
            ? addSleepHours.sleepQuality
            : null;
          const timeDec = new Date().getHours() + new Date().getMinutes() / 60;
          const sleepEntry = {
            id: Date.now().toString(),
            type: 'sleep',
            hours: sleepHours,
            duration: sleepHours,
            sleepHours: sleepHours,
            time: timeDec,
            ...(sleepQuality != null
              ? { quality: sleepQuality, sleepQuality }
              : {}),
          };
          const hoursDisplay = String(Math.round(sleepHours * 100) / 100).replace('.', ',');
          const testoRisposta =
            sleepHours < 3
              ? `Ho registrato il tuo sonnellino di ${Math.round(sleepHours * 60)} minuti. Body Battery ricalcolata!`
              : `Ho registrato ${hoursDisplay} ore di sonno. Body Battery aggiornata!`;
          if (isSimulationMode) {
            setSimulatedLog((prev) => [...(prev || []), sleepEntry]);
          } else {
            const nuovoLogSleep = [...(dailyLog || []), sleepEntry];
            setDailyLog(nuovoLogSleep);
            syncDatiFirebase(nuovoLogSleep, manualNodes);
          }
          dismissKentuSleepTrigger();
          setChatHistory((prev) => {
            const next = [...prev];
            next.pop();
            next.push({
              sender: 'ai',
              text: testoRisposta,
            });
            return next;
          });
          return;
        }

        if (addWorkoutSlotError) {
          const missingText =
            "Mi mancano alcuni dettagli per registrare l'allenamento. A che ora hai iniziato e quanto è durato?";
          setChatHistory((prev) => {
            const next = [...prev];
            next.pop();
            next.push({ sender: 'ai', text: missingText });
            return next;
          });
          return;
        }

        if (addFoodSlotError) {
          const missingFoodText =
            'Mi mancano dei dettagli per registrare il pasto. A che ora hai mangiato e quanti grammi erano all\'incirca?';
          setChatHistory((prev) => {
            const next = [...prev];
            next.pop();
            next.push({ sender: 'ai', text: missingFoodText });
            return next;
          });
          return;
        }

        if (addWorkoutPayload != null) {
          const {
            title: wTitle,
            duration: wDuration,
            calories: wCalories,
            timeString: oraString,
            timeDec,
            trainingGoal: rawGoal,
            rpe: rawRpe,
            progressionNote: rawNote,
          } = addWorkoutPayload;
          const durationHours = Math.max(1 / 60, wDuration / 60);
          const titleLower = wTitle.toLowerCase();
          const isCardioHint = /corr|corsa|run|bike|cicl|spinning|nuot|swim|remier|rowing|ellitt|walk|cammin|cardio|hiit|saltell|jump/i.test(wTitle);
          const isPcOrCognitive = /lavoro\s*(al\s*)?pc|pc\b|smart\s*working|scrivania|studio|desk|videocal|zoom|call da|programm/i.test(titleLower);
          const isWorkGeneric = /(\blavoro\b|meeting|riunione|ufficio\b)/i.test(titleLower) && !/lavoro\s*al\s*pc|pc\b|scrivania/i.test(titleLower);
          let workoutTypeForLog = isCardioHint ? 'cardio' : 'pesi';
          let timelineNodeType = 'workout';
          if (isPcOrCognitive) {
            timelineNodeType = 'cognitive';
            workoutTypeForLog = /studio|studiare|leggere|libro/i.test(titleLower) ? 'studio' : 'lavoro_pc';
          } else if (isWorkGeneric) {
            timelineNodeType = 'work';
            workoutTypeForLog = 'lavoro';
          }
          const goalKey = String(rawGoal || '').trim().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const trainingGoalId = (
            ['ipertrofia', 'forza', 'resistenza', 'mantenimento', 'junk'].includes(goalKey)
              ? goalKey
              : goalKey.includes('ipertrof') ? 'ipertrofia'
                : goalKey.includes('forza') ? 'forza'
                  : goalKey.includes('resist') ? 'resistenza'
                    : goalKey.includes('manten') ? 'mantenimento'
                      : goalKey.includes('junk') ? 'junk'
                        : ''
          );
          const progressionNote = String(rawNote || '').trim();
          const rpe = Number.isFinite(Number(rawRpe)) ? Math.round(Number(rawRpe)) : null;
          const structuredPatch = {
            ...(trainingGoalId
              ? { trainingGoal: trainingGoalId, workoutGoal: trainingGoalId }
              : {}),
            ...(rpe != null && rpe >= 1 && rpe <= 10 ? { rpe } : {}),
            ...(progressionNote
              ? { progressionNote, note: progressionNote, details: progressionNote }
              : {}),
            ...((trainingGoalId || (rpe != null && rpe >= 1 && rpe <= 10) || progressionNote)
              ? {
                  questionnaire: {
                    goal: trainingGoalId || null,
                    rpe: rpe != null && rpe >= 1 && rpe <= 10 ? rpe : null,
                    notes: progressionNote,
                  },
                }
              : {}),
          };
          const workoutId = Date.now().toString();
          const workoutEntry = {
            id: workoutId,
            type: 'workout',
            title: wTitle,
            name: wTitle,
            desc: wTitle.toUpperCase(),
            durationMinutes: wDuration,
            duration: durationHours,
            calories: wCalories,
            kcal: wCalories,
            cal: wCalories,
            workoutType: workoutTypeForLog,
            time: timeDec,
            mealTime: timeDec,
            ora: oraString,
            timeString: oraString,
            ...structuredPatch,
          };
          const timelineNode = {
            id: workoutId,
            type: timelineNodeType,
            time: timeDec,
            duration: durationHours,
            kcal: wCalories,
            icon:
              timelineNodeType === 'cognitive'
                ? workoutTypeForLog === 'studio'
                  ? '📚'
                  : '💻'
                : timelineNodeType === 'work'
                  ? '💼'
                  : '🏋️',
            subType: workoutTypeForLog,
            name: wTitle,
            muscles: [],
          };
          const testoRisposta = `🎯 **Workout Registrato**
  - **Attività:** ${wTitle}
  - **Durata:** ${wDuration} min
  - **Spesa energetica:** ~${wCalories} kcal

  Ottimo lavoro! Body Battery e parametri aggiornati. 💪`;
          const anchorWo = currentTrackerDate || getTodayString();
          if (anchorWo === getTodayString()) {
            scheduledWorkoutContextRef.current = null;
          }
          if (isSimulationMode) {
            setSimulatedLog((prev) => [workoutEntry, ...(prev || [])]);
            setSimulationNodes((prev) =>
              [...(prev || []), timelineNode].sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
            );
          } else {
            const nuovoLogWo = [workoutEntry, ...(dailyLog || [])];
            const nextManual = [...manualNodes, timelineNode].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
            setDailyLog(nuovoLogWo);
            setManualNodes(nextManual);
            syncDatiFirebase(nuovoLogWo, nextManual);
          }
          setChatHistory((prev) => {
            const next = [...prev];
            next.pop();
            next.push({
              sender: 'ai',
              text: testoRisposta,
            });
            return next;
          });
          return;
        }

        if (addFoodPayload != null) {
          const testoRispostaFood = commitAddFoodChatPayload(addFoodPayload);
          setChatHistory((prev) => {
            const next = [...prev];
            next.pop();
            next.push({
              sender: 'ai',
              text: testoRispostaFood || 'Pasto registrato. 🥗',
            });
            return next;
          });
          return;
        }

        const itemsToSave = itemsArray != null ? itemsArray : (insertPayload ? [insertPayload] : []);

        if (itemsToSave.length > 0) {
          const baseMealTime = getCurrentTimeRoundedTo15Min();
          const predictedType = predictMealType(baseMealTime);
          const sharedMealTime = typeof itemsToSave[0]?.mealTime === 'number' ? itemsToSave[0].mealTime : baseMealTime;
          const rawMtSave = itemsToSave[0]?.mealType;
          const dominantMealType =
            rawMtSave != null && String(rawMtSave).trim() !== ''
              ? normalizeAiMealTypeToStorageId(rawMtSave, sharedMealTime)
              : predictedType;
          const batchGhostType = getGhostMealType(dominantMealType, dailyLog || []);
          const batchId = `batch_${Date.now()}`;

          const alimentiProcessati = itemsToSave
            .map((item, index) => {
              const desc = item.desc || item.name || '';
              if (!desc) return null;
              const qta = Math.max(1, parseFloat(item.weight ?? item.qta) || 100);
              const datiNutrizionali = estraiDatiFoodDb(desc, qta, batchGhostType);
              return {
                ...datiNutrizionali,
                id: datiNutrizionali.id || `ai_${batchId}_${index}`,
                type: 'food',
                mealType: batchGhostType,
                mealTime: sharedMealTime,
                batchId
              };
            })
            .filter(Boolean);

          const nuovoLog = [...alimentiProcessati, ...(dailyLog || [])];
          setDailyLog(nuovoLog);
          syncDatiFirebase(nuovoLog, manualNodes);
          setChatHistory(prev => {
            const next = [...prev];
            next.pop();
            next.push({ sender: 'ai', text: alimentiProcessati.length > 1 ? `Perfetto, ho inserito ${alimentiProcessati.length} alimenti nel diario!` : 'Perfetto, ho inserito l\'alimento nel diario!' });
            return next;
          });
          return;
        }

        const regexStrategia = /\[STRATEGIA:\s*(.+?)\]/gi;
        let matchStrategia;
        while ((matchStrategia = regexStrategia.exec(responseText)) !== null) {
          const pairs = matchStrategia[1].split(',');
          const newStrategy = { ...idealStrategy };
          pairs.forEach(pair => {
            const [key, val] = pair.split('=').map(s => (s || '').trim().toLowerCase());
            const numVal = parseFloat(val);
            if (isNaN(numVal) || !key) return;
            const stratKey = key === 'spuntino' || key === 'merenda_pm' || key === 'merenda_am' ? 'snack' : key;
            if (newStrategy[stratKey] !== undefined) newStrategy[stratKey] = numVal;
          });
          setIdealStrategy(newStrategy);
        }

        const regexWorkout = /\[ALLENAMENTO:\s*([^|\]]+?)\s*\|\s*([0-9.,]+)\]/gi;
        let matchWorkout;
        while ((matchWorkout = regexWorkout.exec(responseText)) !== null) {
          const kcal = Math.max(0, parseFloat((matchWorkout[2] || '').replace(',', '.')) || 300);
          const newItem = { id: Date.now() + Math.random(), type: 'workout', workoutType: 'misto', desc: (matchWorkout[1] || '').trim().toUpperCase(), kcal, duration: Math.floor(kcal / 6) };
          if (isSimulationMode) {
            setSimulatedLog(prev => [newItem, ...(prev || [])]);
          } else {
            setDailyLog(prev => {
              const newLog = [newItem, ...(prev || [])];
              syncDatiFirebase(newLog, manualNodes);
              return newLog;
            });
          }
        }

        const mealProposalExtract = extractAndStripMealProposal(responseText);
        let cleanText = mealProposalExtract.stripped;
        const mealProposalForUi = mealProposalExtract.proposal;
        const dailyPlanExtract = extractAndStripDailyPlan(cleanText);
        cleanText = dailyPlanExtract.stripped;
        const dailyPlanForUi = mealProposalForUi ? null : dailyPlanExtract.plan;
        const stripInsertStart = cleanText.indexOf('{"action":"insert"');
        if (stripInsertStart !== -1) {
          let depth = 0;
          let stripEnd = stripInsertStart;
          for (let i = stripInsertStart; i < cleanText.length; i++) {
            if (cleanText[i] === '{') depth++;
            else if (cleanText[i] === '}') { depth--; if (depth === 0) { stripEnd = i; break; } }
          }
          cleanText = (cleanText.slice(0, stripInsertStart) + cleanText.slice(stripEnd + 1)).trim();
        }
        if (itemsArray != null && itemsArray.length > 0) {
          const arrStart = cleanText.indexOf('[');
          if (arrStart !== -1) {
            let depth = 0;
            let arrEnd = arrStart;
            for (let i = arrStart; i < cleanText.length; i++) {
              if (cleanText[i] === '[' || cleanText[i] === '{') depth++;
              else if (cleanText[i] === ']' || cleanText[i] === '}') { depth--; if (depth === 0 && cleanText[i] === ']') { arrEnd = i; break; } }
            }
            cleanText = (cleanText.slice(0, arrStart) + cleanText.slice(arrEnd + 1)).trim();
          }
        }
        if (sleepDataPayload) {
          const lsIdx = cleanText.indexOf('"log_sleep"');
          const lsAlt = cleanText.indexOf('log_sleep');
          const idx = lsIdx !== -1 ? cleanText.lastIndexOf('{', lsIdx) : (lsAlt !== -1 ? cleanText.lastIndexOf('{', lsAlt) : -1);
          if (idx !== -1) {
            let depth = 0;
            let end = idx;
            for (let i = idx; i < cleanText.length; i++) {
              if (cleanText[i] === '{') depth++;
              else if (cleanText[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
            }
            cleanText = (cleanText.slice(0, idx) + cleanText.slice(end + 1)).trim();
          }
        }
        {
          const asIdx = cleanText.indexOf('"add_sleep"');
          if (asIdx !== -1) {
            const idxAs = cleanText.lastIndexOf('{', asIdx);
            if (idxAs !== -1) {
              let depthAs = 0;
              let endAs = idxAs;
              for (let i = idxAs; i < cleanText.length; i++) {
                if (cleanText[i] === '{') depthAs++;
                else if (cleanText[i] === '}') {
                  depthAs--;
                  if (depthAs === 0) {
                    endAs = i;
                    break;
                  }
                }
              }
              cleanText = (cleanText.slice(0, idxAs) + cleanText.slice(endAs + 1)).trim();
            }
          }
        }
        {
          const awIdx = cleanText.indexOf('"add_workout"');
          if (awIdx !== -1) {
            const idxAw = cleanText.lastIndexOf('{', awIdx);
            if (idxAw !== -1) {
              let depthAw = 0;
              let endAw = idxAw;
              for (let i = idxAw; i < cleanText.length; i++) {
                if (cleanText[i] === '{') depthAw++;
                else if (cleanText[i] === '}') {
                  depthAw--;
                  if (depthAw === 0) {
                    endAw = i;
                    break;
                  }
                }
              }
              cleanText = (cleanText.slice(0, idxAw) + cleanText.slice(endAw + 1)).trim();
            }
          }
        }
        {
          const afIdx = cleanText.indexOf('"add_food"');
          if (afIdx !== -1) {
            const idxAf = cleanText.lastIndexOf('{', afIdx);
            if (idxAf !== -1) {
              let depthAf = 0;
              let endAf = idxAf;
              for (let i = idxAf; i < cleanText.length; i++) {
                if (cleanText[i] === '{') depthAf++;
                else if (cleanText[i] === '}') {
                  depthAf--;
                  if (depthAf === 0) {
                    endAf = i;
                    break;
                  }
                }
              }
              cleanText = (cleanText.slice(0, idxAf) + cleanText.slice(endAf + 1)).trim();
            }
          }
        }
        cleanText = cleanText.replace(/\[STRATEGIA:\s*[^\]]+\]/gi, '').replace(/\[ALLENAMENTO:\s*[^\]]+\]/gi, '').trim();

        let quickReplies = [];
        const qrIdx = cleanText.indexOf('"quick_replies"');
        if (qrIdx !== -1) {
          const objStart = cleanText.lastIndexOf('{', qrIdx);
          if (objStart !== -1) {
            let depth = 0;
            let objEnd = objStart;
            for (let i = objStart; i < cleanText.length; i++) {
              if (cleanText[i] === '{') depth++;
              else if (cleanText[i] === '}') { depth--; if (depth === 0) { objEnd = i; break; } }
            }
            try {
              const parsedQR = JSON.parse(cleanText.slice(objStart, objEnd + 1));
              if (Array.isArray(parsedQR.quick_replies)) quickReplies = parsedQR.quick_replies;
              cleanText = (cleanText.slice(0, objStart) + cleanText.slice(objEnd + 1)).trim();
            } catch (_) {}
          }
        }

        let dinnerOptions = null;
        const doIdx = cleanText.indexOf('"dinner_options"');
        if (doIdx !== -1) {
          const objStartDo = cleanText.lastIndexOf('{', doIdx);
          if (objStartDo !== -1) {
            let depthDo = 0;
            let objEndDo = objStartDo;
            for (let i = objStartDo; i < cleanText.length; i++) {
              if (cleanText[i] === '{') depthDo++;
              else if (cleanText[i] === '}') {
                depthDo--;
                if (depthDo === 0) {
                  objEndDo = i;
                  break;
                }
              }
            }
            try {
              const parsedDo = JSON.parse(cleanText.slice(objStartDo, objEndDo + 1));
              if (Array.isArray(parsedDo.dinner_options) && parsedDo.dinner_options.length) {
                dinnerOptions = parsedDo.dinner_options.slice(0, 3).filter((o) => o && (o.label || o.description));
              }
              cleanText = (cleanText.slice(0, objStartDo) + cleanText.slice(objEndDo + 1)).trim();
            } catch (_) {}
          }
        }

        let agendaOptions = null;
        const aoIdx = cleanText.indexOf('"agenda_options"');
        if (aoIdx !== -1) {
          const objStartAo = cleanText.lastIndexOf('{', aoIdx);
          if (objStartAo !== -1) {
            let depthAo = 0;
            let objEndAo = objStartAo;
            for (let i = objStartAo; i < cleanText.length; i++) {
              if (cleanText[i] === '{') depthAo++;
              else if (cleanText[i] === '}') {
                depthAo--;
                if (depthAo === 0) {
                  objEndAo = i;
                  break;
                }
              }
            }
            try {
              const parsedAo = JSON.parse(cleanText.slice(objStartAo, objEndAo + 1));
              if (Array.isArray(parsedAo.agenda_options) && parsedAo.agenda_options.length) {
                agendaOptions = parsedAo.agenda_options.filter((o) => o && (o.name || o.label));
              }
              cleanText = (cleanText.slice(0, objStartAo) + cleanText.slice(objEndAo + 1)).trim();
            } catch (_) {}
          }
        }

        if (!cleanText && !mealProposalForUi && !dailyPlanForUi) cleanText = '✨ Operazione completata.';
        if (mealProposalForUi) cleanText = '';
        if (dailyPlanForUi) cleanText = '';

        if (dinnerOptions && dinnerOptions.length) {
          lastDinnerOptionsRef.current = dinnerOptions;
        }
        if (agendaOptions && agendaOptions.length) {
          lastAgendaOptionsRef.current = agendaOptions;
        }

        setChatHistory(prev => {
          const newHist = [...prev];
          newHist.pop();
          newHist.push({
            sender: 'ai',
            text: cleanText,
            mealProposal: mealProposalForUi || undefined,
            dailyPlan: dailyPlanForUi || undefined,
            quickReplies:
              mealProposalForUi || dailyPlanForUi || quickReplies.length === 0 ? undefined : quickReplies,
            dinnerOptions:
              mealProposalForUi || dailyPlanForUi || !dinnerOptions || dinnerOptions.length === 0
                ? undefined
                : dinnerOptions,
            agendaOptions: agendaOptions && agendaOptions.length > 0 ? agendaOptions : undefined,
          });
          return newHist;
        });
      } catch (e) {
        setChatHistory(prev => {
          const newHist = [...prev];
          newHist.pop();
          newHist.push({ sender: 'ai', text: `❌ ${e.message || String(e)}` });
          return newHist;
        });
      }
  }

  return { handleChatSubmit };
}
