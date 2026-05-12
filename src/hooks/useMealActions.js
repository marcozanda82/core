import { useCallback } from 'react';
import { ref, set, remove } from 'firebase/database';
import { TARGETS, getDefaultNutrientValue } from '../useBiochimico';
import { recordMealFoodCooccurrence } from '../foodCooccurrence';
import { recordMealSuggestionHabits } from '../mealSuggestionHabits';
import {
  enrichDbRowWithFoodUnits,
  recordMealFoodUnitUsageFromItems,
} from '../foodUnits';
import { setBarcodeNutritionOverride as setBarcodeNutritionOverrideStorage } from '../barcodeFoodOverrides';
import {
  findBestFoodMatch,
  structuredFoodsToProposalItems,
  ghostSurfaceDraftToProposalItems,
  draftStringsToFoods,
} from '../features/salaComandi/utils/foodUtils';
import { mealFoodsRead } from '../features/salaComandi/utils/planningUtils';
import {
  parseFlexibleTimeToDecimal,
  dedupeGhostMealsPayloadForConfirm,
  ghostMealLogEntryIdFromPayload,
  buildPastOnlyRealMealTypeSet,
  buildBaseLogForGhostPlanMerge,
} from '../features/salaComandi/utils/timelineUtils';
import { normalizeMealFoodsArray } from '../coreEngine';
import {
  getNowDecimalHourForPlanMerge,
  tryAcquireMealConfirmGuard,
  releaseMealConfirmGuard,
} from '../utils/salaUtils';

/**
 * Pasti / diario / food DB — logica di persistenza estratta da SalaComandi.
 * Le firme pubbliche restano identiche ai callback originali.
 */
export function useMealActions({
  predictMealType,
  getGhostMealType,
  dailyLogRef,
  foodDb,
  estraiDatiFoodDb,
  getAverageEstimate,
  isSimulationMode,
  setSimulatedLog,
  setDailyLog,
  setManualNodes,
  syncDatiFirebase,
  manualNodesRef,
  mealType,
  drawerMealTime,
  editingMealId,
  addedFoods,
  isInitialLoadComplete,
  getCurrentTimeRoundedTo15Min,
  getFoodItemsForMealSlot,
  setAddedFoods,
  setEditingMealId,
  closeDrawer,
  simulatedLog,
  dailyLog,
  manualNodes,
  userUid,
  db,
  fullHistory,
  setFoodDb,
  setIsMealBuilderOpen,
  setSelectedNodeReport,
  setMealType,
  setDrawerMealTime,
  setDrawerMealTimeStr,
  setMealPlannerGhostNote,
  setActiveAction,
  setIsDrawerOpen,
  setMealBuilderSmartLaunchKey,
  decimalToTimeStr,
  toCanonicalMealType,
  mealIdFromCanonical,
  setChatHistory,
  applyKentuChatCmd,
  dailyPlanMealConfirmGuardRef,
}) {
  const mapProposalItemsToDiaryFoods = useCallback(
    (addFoodItems, mealDecFood) => {
      if (!Array.isArray(addFoodItems) || addFoodItems.length === 0) return [];
      const predictedMealType = predictMealType(mealDecFood);
      const batchGhostTypeFood = getGhostMealType(predictedMealType, dailyLogRef.current || []);
      const batchIdFood = `batch_${Date.now()}`;
      return addFoodItems
        .map((item, index) => {
          const name = item.name;
          const qty = Math.max(1, Number(item.qty));
          const matchedKey =
            item.matchedKey != null && foodDb[item.matchedKey] != null
              ? item.matchedKey
              : findBestFoodMatch(name, foodDb);
          if (matchedKey != null) {
            const dati = estraiDatiFoodDb(name, qty, batchGhostTypeFood, matchedKey);
            const isRecipe = dati.type === 'recipe';
            return {
              ...dati,
              id: dati.id || `ai_${batchIdFood}_${index}`,
              mealType: batchGhostTypeFood,
              mealTime: mealDecFood,
              batchId: batchIdFood,
              isEstimated: false,
              type: isRecipe ? 'recipe' : 'food',
            };
          }
          const qSafe = Math.max(5, qty);
          let kcal = Number(item.estKcal ?? item.kcal);
          let prot = Number(item.estPro ?? item.prot);
          let carb = Number(item.estCar ?? item.carb);
          let fat = Number(item.estFat ?? item.fat);
          if (!Number.isFinite(kcal) || kcal <= 0) {
            kcal = Math.max(10, Math.round((getAverageEstimate('kcal', name) / 100) * qSafe));
          }
          if (!Number.isFinite(prot) || prot < 0) {
            prot = (getAverageEstimate('prot', name) / 100) * qSafe;
          }
          if (!Number.isFinite(carb) || carb < 0) {
            carb = (getAverageEstimate('carb', name) / 100) * qSafe;
          }
          if (!Number.isFinite(fat) || fat < 0) {
            fat = (getAverageEstimate('fatTotal', name) / 100) * qSafe;
          }
          const baseEst = estraiDatiFoodDb(name, qty, batchGhostTypeFood);
          return {
            ...baseEst,
            id: `ai_food_${batchIdFood}_${index}`,
            type: 'food',
            mealType: batchGhostTypeFood,
            desc: name,
            name,
            qta: qSafe,
            weight: qSafe,
            kcal,
            cal: kcal,
            prot,
            carb,
            fatTotal: fat,
            fat,
            mealTime: mealDecFood,
            batchId: batchIdFood,
            isEstimated: true,
          };
        })
        .filter(Boolean);
    },
    [predictMealType, getGhostMealType, foodDb, estraiDatiFoodDb, getAverageEstimate, dailyLogRef]
  );

  const openGhostMealEditorFromTimelineNode = useCallback(
    (node) => {
      if (!node || node.type !== 'ghost_meal') return;
      const logSnap = dailyLogRef.current || [];
      const src =
        logSnap.find(
          (e) => e?.type === 'ghost_meal' && e?.id != null && String(e.id) === String(node.id)
        ) || node;
      const mt = toCanonicalMealType(String(src.mealType || 'pranzo').split('_')[0]) || 'pranzo';
      let t = src.mealTime;
      if (typeof t !== 'number' || Number.isNaN(t)) t = src.time;
      if (typeof t !== 'number' || Number.isNaN(t)) t = node.time;
      if (typeof t !== 'number' || Number.isNaN(t)) t = 12;
      setSelectedNodeReport(null);
      setEditingMealId(src.id ?? node.id);
      const reads = mealFoodsRead(src);
      const proposalItems =
        reads.length > 0
          ? structuredFoodsToProposalItems(reads)
          : ghostSurfaceDraftToProposalItems(src.draftFoods || node.draftFoods);
      setAddedFoods(mapProposalItemsToDiaryFoods(proposalItems, t));
      setMealType(mealIdFromCanonical(mt));
      setDrawerMealTime(t);
      setDrawerMealTimeStr(decimalToTimeStr(t));
      setMealPlannerGhostNote(String(src.microDesc || src.title || node.microDesc || node.title || '').trim());
      setActiveAction('pasto');
      setIsDrawerOpen(true);
      setIsMealBuilderOpen(true);
      setMealBuilderSmartLaunchKey((k) => k + 1);
    },
    [
      mapProposalItemsToDiaryFoods,
      decimalToTimeStr,
      toCanonicalMealType,
      mealIdFromCanonical,
      dailyLogRef,
      setSelectedNodeReport,
      setEditingMealId,
      setAddedFoods,
      setMealType,
      setDrawerMealTime,
      setDrawerMealTimeStr,
      setMealPlannerGhostNote,
      setActiveAction,
      setIsDrawerOpen,
      setIsMealBuilderOpen,
      setMealBuilderSmartLaunchKey,
    ]
  );

  const commitAddFoodChatPayload = useCallback(
    (payload) => {
      const { timeString: oraStringFood, mealDec: mealDecFood, items: addFoodItems } = payload || {};
      if (!Array.isArray(addFoodItems) || addFoodItems.length === 0) return null;
      const alimentiProcessatiFood = mapProposalItemsToDiaryFoods(addFoodItems, mealDecFood);
      if (!alimentiProcessatiFood.length) return null;

      const totKcal = Math.round(
        alimentiProcessatiFood.reduce((s, f) => s + (Number(f.kcal) || Number(f.cal) || 0), 0)
      );
      const totPro =
        Math.round(alimentiProcessatiFood.reduce((s, f) => s + (Number(f.prot) || 0), 0) * 10) / 10;
      const totCar =
        Math.round(alimentiProcessatiFood.reduce((s, f) => s + (Number(f.carb) || 0), 0) * 10) / 10;
      const totFat =
        Math.round(alimentiProcessatiFood.reduce((s, f) => s + (Number(f.fatTotal ?? f.fat) || 0), 0) * 10) /
        10;
      const testoRispostaFood = `🎯 **Pasto Registrato**
- **Orario:** ${oraStringFood}
- **Kcal Totali:** ${totKcal}
- **Proteine:** ${totPro}g
- **Carboidrati:** ${totCar}g
- **Grassi:** ${totFat}g

Ottimo! Diario aggiornato. 🥗`;

      if (isSimulationMode) {
        setSimulatedLog((prev) => [...alimentiProcessatiFood, ...(prev || [])]);
      } else {
        setDailyLog((prev) => {
          const nuovoLogFood = [...alimentiProcessatiFood, ...(prev || [])];
          syncDatiFirebase(nuovoLogFood, manualNodesRef.current);
          return nuovoLogFood;
        });
      }
      return testoRispostaFood;
    },
    [
      mapProposalItemsToDiaryFoods,
      isSimulationMode,
      setSimulatedLog,
      setDailyLog,
      syncDatiFirebase,
      manualNodesRef,
    ]
  );

  const saveCustomRecipeToFoodDb = useCallback(
    async ({ desc, kcal, prot, carb, fatTotal, ingredients }, existingKey) => {
      if (!userUid || !desc) return null;
      const basePath = `users/${userUid}/tracker_data`;
      const slug = String(desc)
        .replace(/[.$#[\]/\\\s]/g, '_')
        .replace(/[^\w\-]/g, '_')
        .slice(0, 40);
      const trimmed = existingKey != null && String(existingKey).trim() !== '' ? String(existingKey).trim() : '';
      const dbKey = trimmed || `recipe_${Date.now()}_${slug}`;
      const entryPer100 = {
        desc: String(desc).trim(),
        kcal: Number(kcal) || 0,
        prot: Number(prot) || 0,
        carb: Number(carb) || 0,
        fatTotal: fatTotal != null ? Number(fatTotal) : 0,
        isRecipe: true,
        ingredients: Array.isArray(ingredients) ? ingredients : [],
      };
      Object.keys(TARGETS).forEach((g) =>
        Object.keys(TARGETS[g] || {}).forEach((k) => {
          if (entryPer100[k] == null) entryPer100[k] = getDefaultNutrientValue(k, fullHistory);
        })
      );
      await set(ref(db, `${basePath}/trackerFoodDatabase/${dbKey}`), entryPer100);
      setFoodDb((prev) => ({ ...(prev || {}), [dbKey]: entryPer100 }));
      return dbKey;
    },
    [userUid, db, fullHistory, setFoodDb]
  );

  const saveFoodEntryPer100ToFoodDb = useCallback(
    async (entry) => {
      if (!userUid || !entry?.desc) return;
      const basePath = `users/${userUid}/tracker_data`;
      const name = String(entry.desc).trim();
      const slug = name.replace(/[.$#[\]/\\\s]/g, '_').replace(/[^\w\-]/g, '_').slice(0, 40);
      const newKey = `food_${Date.now()}_${slug}`;
      const payload = { ...entry, desc: name, isRecipe: false };
      delete payload.ingredients;
      delete payload.type;
      Object.keys(TARGETS).forEach((g) =>
        Object.keys(TARGETS[g] || {}).forEach((k) => {
          if (payload[k] == null) payload[k] = getDefaultNutrientValue(k, fullHistory);
        })
      );
      if (payload.kcal == null || Number(payload.kcal) === 0) {
        payload.kcal = getDefaultNutrientValue('kcal', fullHistory);
      }
      if (payload.fatTotal == null && payload.fat != null) payload.fatTotal = Number(payload.fat);
      const payloadWithUnits = enrichDbRowWithFoodUnits(payload, newKey);
      await set(ref(db, `${basePath}/trackerFoodDatabase/${newKey}`), payloadWithUnits);
      setFoodDb((prev) => ({ ...(prev || {}), [newKey]: payloadWithUnits }));
    },
    [userUid, db, fullHistory, setFoodDb]
  );

  const persistBarcodeNutritionCorrection = useCallback(
    async ({ barcode, foodDbKey, per100, desc }) => {
      const code = String(barcode ?? '').trim();
      if (!code || !per100 || typeof per100 !== 'object') return;
      const name = String(desc ?? '').trim();
      setBarcodeNutritionOverrideStorage(code, {
        desc: name || undefined,
        kcal: per100.kcal,
        prot: per100.prot,
        carb: per100.carb,
        fat: per100.fat,
      });
      if (!userUid || !db || !foodDbKey || !foodDb?.[foodDbKey]) return;
      const basePath = `users/${userUid}/tracker_data`;
      const prev = foodDb[foodDbKey];
      const merged = {
        ...prev,
        desc: name || prev.desc,
        barcode: code,
        kcal: per100.kcal,
        prot: per100.prot,
        carb: per100.carb,
        fatTotal: per100.fat,
      };
      Object.keys(TARGETS).forEach((g) =>
        Object.keys(TARGETS[g] || {}).forEach((k) => {
          if (merged[k] == null) merged[k] = getDefaultNutrientValue(k, fullHistory);
        })
      );
      if (merged.kcal == null || Number(merged.kcal) === 0) {
        merged.kcal = getDefaultNutrientValue('kcal', fullHistory);
      }
      if (merged.fatTotal == null && merged.fat != null) merged.fatTotal = Number(merged.fat);
      const payload = enrichDbRowWithFoodUnits(merged, foodDbKey);
      await set(ref(db, `${basePath}/trackerFoodDatabase/${foodDbKey}`), payload);
      setFoodDb((p) => ({ ...(p || {}), [foodDbKey]: payload }));
    },
    [userUid, db, foodDb, fullHistory, setFoodDb]
  );

  const deleteRecipeFromFoodDb = useCallback(
    async (recipeKey) => {
      if (!userUid || !recipeKey) return;
      const path = `users/${userUid}/tracker_data/trackerFoodDatabase/${recipeKey}`;
      await remove(ref(db, path));
      setFoodDb((prev) => {
        const next = { ...(prev || {}) };
        delete next[recipeKey];
        return next;
      });
    },
    [userUid, db, setFoodDb]
  );

  const saveMealToDiary = useCallback(() => {
    if (!isInitialLoadComplete) return;
    try {
      const currentTargetType = mealType;
      const uniqueBatchId = Date.now();
      const timeToUse =
        typeof drawerMealTime === 'number' && !Number.isNaN(drawerMealTime)
          ? drawerMealTime
          : getCurrentTimeRoundedTo15Min();
      const safeDailyLog = dailyLog || [];
      const ourSlot = getGhostMealType(currentTargetType, safeDailyLog);
      const slotToReplace = editingMealId || ourSlot;

      const mealItems = (addedFoods || []).map((f, index) => ({
        ...f,
        type: f.type === 'recipe' ? 'recipe' : 'food',
        mealType: ourSlot,
        mealTime: timeToUse,
        id: f.id || `f_${uniqueBatchId}_${index}`,
      }));

      if (!isSimulationMode && mealItems.length >= 1) {
        try {
          if (mealItems.length >= 2) {
            recordMealFoodCooccurrence(mealItems, ourSlot);
          }
          recordMealSuggestionHabits(mealItems, ourSlot, foodDb || {});
          recordMealFoodUnitUsageFromItems(mealItems, foodDb || {}, findBestFoodMatch);
        } catch (_) {}
      }

      const foodsToRemove = getFoodItemsForMealSlot(safeDailyLog, String(slotToReplace));
      const removeSet = new Set(foodsToRemove);
      const editingGhostMealId = editingMealId != null ? String(editingMealId) : '';
      const rest = safeDailyLog.filter((item) => {
        if (removeSet.has(item)) return false;
        if (
          editingGhostMealId &&
          item?.type === 'ghost_meal' &&
          item.id != null &&
          String(item.id) === editingGhostMealId
        ) {
          return false;
        }
        return true;
      });

      const nuovoLog = [...mealItems, ...rest];
      if (isSimulationMode) {
        setSimulatedLog((prev) => {
          const p = prev || [];
          const toRm = getFoodItemsForMealSlot(p, String(slotToReplace));
          const rm = new Set(toRm);
          const kept = p.filter((item) => {
            if (rm.has(item)) return false;
            if (
              editingGhostMealId &&
              item?.type === 'ghost_meal' &&
              item.id != null &&
              String(item.id) === editingGhostMealId
            ) {
              return false;
            }
            return true;
          });
          return [...kept, ...mealItems];
        });
        setAddedFoods([]);
        setEditingMealId(null);
        closeDrawer({ force: true });
        return;
      }
      setDailyLog(nuovoLog);
      syncDatiFirebase(nuovoLog, manualNodes || []);
    } catch (error) {
      console.error('Errore salvataggio pasto:', error);
    } finally {
      setAddedFoods([]);
      setEditingMealId(null);
      closeDrawer({ force: true });
    }
  }, [
    isInitialLoadComplete,
    mealType,
    drawerMealTime,
    getCurrentTimeRoundedTo15Min,
    dailyLog,
    getGhostMealType,
    editingMealId,
    isSimulationMode,
    foodDb,
    getFoodItemsForMealSlot,
    setSimulatedLog,
    setAddedFoods,
    setEditingMealId,
    closeDrawer,
    setDailyLog,
    syncDatiFirebase,
    manualNodes,
    addedFoods,
  ]);

  const handleMealBuilderSave = useCallback(
    (payload = {}) => {
      setIsMealBuilderOpen(false);
      if (payload?.items?.length) {
        const timeToUse =
          typeof payload.timing === 'number' && !Number.isNaN(payload.timing)
            ? payload.timing
            : typeof drawerMealTime === 'number' && !Number.isNaN(drawerMealTime)
              ? drawerMealTime
              : getCurrentTimeRoundedTo15Min();
        const logToUse = isSimulationMode ? simulatedLog || [] : dailyLog;
        const ourSlot = getGhostMealType(payload.mealType || mealType, logToUse);
        const slotToReplace = editingMealId || ourSlot;
        const mealItems = payload.items.map((f, index) => ({
          ...f,
          type: f.type === 'recipe' ? 'recipe' : 'food',
          mealType: ourSlot,
          mealTime: timeToUse,
          id: f.id || `f_${Date.now()}_${index}`,
        }));
        const foodsToRemove = getFoodItemsForMealSlot(logToUse, String(slotToReplace));
        const removeSet = new Set(foodsToRemove);
        const editingGhostMealId = editingMealId != null ? String(editingMealId) : '';
        const dailyLogRest = logToUse.filter((item) => {
          if (removeSet.has(item)) return false;
          if (
            editingGhostMealId &&
            item?.type === 'ghost_meal' &&
            item.id != null &&
            String(item.id) === editingGhostMealId
          ) {
            return false;
          }
          return true;
        });
        const nextLog = [...mealItems, ...dailyLogRest];
        if (isSimulationMode) {
          setSimulatedLog(nextLog);
          setEditingMealId(null);
          return;
        }
        if (mealItems.length >= 1) {
          try {
            if (mealItems.length >= 2) {
              recordMealFoodCooccurrence(mealItems, ourSlot);
            }
            recordMealSuggestionHabits(mealItems, ourSlot, foodDb || {});
            recordMealFoodUnitUsageFromItems(mealItems, foodDb || {}, findBestFoodMatch);
          } catch (_) {}
        }
        setDailyLog(nextLog);
        syncDatiFirebase(nextLog, manualNodes);
        setEditingMealId(null);
      }
    },
    [
      dailyLog,
      simulatedLog,
      isSimulationMode,
      manualNodes,
      mealType,
      drawerMealTime,
      syncDatiFirebase,
      editingMealId,
      getFoodItemsForMealSlot,
      foodDb,
      getCurrentTimeRoundedTo15Min,
      getGhostMealType,
      setIsMealBuilderOpen,
      setSimulatedLog,
      setDailyLog,
      setEditingMealId,
    ]
  );

  const handleMealProposalConfirm = useCallback(
    (proposal, selectedItems) => {
      if (!selectedItems?.length) return;
      const timeStr =
        (proposal?.timeString && String(proposal.timeString).trim()) ||
        decimalToTimeStr(getCurrentTimeRoundedTo15Min());
      let mealDec = parseFlexibleTimeToDecimal(timeStr);
      if (mealDec == null) mealDec = getCurrentTimeRoundedTo15Min();

      const logSnap = dailyLogRef.current || [];
      const predicted = predictMealType(mealDec);
      const mealSlot = getGhostMealType(predicted, logSnap);
      const mealTypeCanonical = toCanonicalMealType(String(mealSlot).split('_')[0]);
      const batchId = `meal_proposal_${Date.now()}`;

      const entries = selectedItems.map((it, index) => {
        const name = String(it.name || '').trim() || 'Alimento';
        const qty = Math.max(1, Math.round(Number(it.qty) || 100));
        const matchedKey =
          it.dbKey != null && foodDb[it.dbKey] != null ? it.dbKey : findBestFoodMatch(name, foodDb);

        if (matchedKey != null) {
          const dati = estraiDatiFoodDb(name, qty, mealSlot, matchedKey);
          const isRecipe = dati.type === 'recipe';
          return {
            ...dati,
            id: dati.id || `${batchId}_${index}`,
            type: isRecipe ? 'recipe' : 'food',
            name: dati.name ?? dati.desc ?? name,
            desc: dati.desc ?? name,
            qta: dati.qta ?? dati.weight ?? qty,
            weight: dati.weight ?? dati.qta ?? qty,
            mealType: mealTypeCanonical,
            mealTime: mealDec,
            batchId,
            isEstimated: false,
          };
        }

        const qSafe = Math.max(5, qty);
        let kcal = Math.round(Number(it.estKcal));
        let prot = Number(it.estPro);
        let carb = Number(it.estCar);
        let fat = Number(it.estFat);
        if (!Number.isFinite(kcal) || kcal <= 0) {
          kcal = Math.max(10, Math.round((getAverageEstimate('kcal', name) / 100) * qSafe));
        }
        if (!Number.isFinite(prot) || prot < 0) {
          prot = (getAverageEstimate('prot', name) / 100) * qSafe;
        }
        if (!Number.isFinite(carb) || carb < 0) {
          carb = (getAverageEstimate('carb', name) / 100) * qSafe;
        }
        if (!Number.isFinite(fat) || fat < 0) {
          fat = (getAverageEstimate('fatTotal', name) / 100) * qSafe;
        }
        prot = Math.round(prot * 10) / 10;
        carb = Math.round(carb * 10) / 10;
        fat = Math.round(fat * 10) / 10;

        return {
          id: `${batchId}_food_${index}`,
          type: 'food',
          name,
          desc: name,
          qta: qSafe,
          weight: qSafe,
          kcal,
          cal: kcal,
          prot,
          carb,
          fat,
          fatTotal: fat,
          mealType: mealTypeCanonical,
          mealTime: mealDec,
          batchId,
          isEstimated: true,
        };
      });

      const totKcal = Math.round(entries.reduce((s, f) => s + (Number(f.kcal) || Number(f.cal) || 0), 0));
      const totPro = Math.round(entries.reduce((s, f) => s + (Number(f.prot) || 0), 0) * 10) / 10;
      const totCar = Math.round(entries.reduce((s, f) => s + (Number(f.carb) || 0), 0) * 10) / 10;
      const totFat =
        Math.round(entries.reduce((s, f) => s + (Number(f.fatTotal ?? f.fat) || 0), 0) * 10) / 10;

      const testo = `🎯 **Pasto Registrato**
- **Orario:** ${timeStr}
- **Kcal Totali:** ${totKcal}
- **Proteine:** ${totPro}g
- **Carboidrati:** ${totCar}g
- **Grassi:** ${totFat}g

Ottimo! Diario aggiornato. 🥗`;

      if (isSimulationMode) {
        setSimulatedLog((prev) => [...entries, ...(prev || [])]);
      } else {
        setDailyLog((prev) => {
          const next = [...entries, ...(prev || [])];
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
      getCurrentTimeRoundedTo15Min,
      getGhostMealType,
      isSimulationMode,
      predictMealType,
      setDailyLog,
      setSimulatedLog,
      syncDatiFirebase,
      setChatHistory,
      decimalToTimeStr,
      toCanonicalMealType,
      dailyLogRef,
      manualNodesRef,
    ]
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
        const srcLog = isSimulationMode ? simulatedLog || [] : dailyLog || [];
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
            const timeStr = gm.time != null ? String(gm.time) : '12:00';
            const dec = parseFlexibleTimeToDecimal(timeStr);
            const mealTime = dec != null && !Number.isNaN(dec) ? dec : 12;
            const persistedDraftFoods = gm.draftFoods || [];
            const draftFoods = Array.isArray(persistedDraftFoods)
              ? persistedDraftFoods.map((x) => String(x).trim()).filter(Boolean)
              : [];
            let foodsArr = normalizeMealFoodsArray(mealFoodsRead(gm));
            if (foodsArr.length === 0 && draftFoods.length > 0) {
              foodsArr = normalizeMealFoodsArray(draftStringsToFoods(draftFoods));
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
        const seenDailyGhostIds = new Set();
        const uniqueDailyGhostEntries = newGhostEntries.filter((e) => {
          if (!e?.id || seenDailyGhostIds.has(e.id)) return false;
          seenDailyGhostIds.add(e.id);
          return true;
        });
        const logTimeKey = (e) => {
          if (!e) return 0;
          if (e.type === 'ghost_meal' || e.type === 'food' || e.type === 'recipe') {
            return Number(e.mealTime) || 0;
          }
          return Number(e.time ?? e.mealTime) || 0;
        };
        const mergedLog = [...baseLog, ...uniqueDailyGhostEntries].sort((a, b) => logTimeKey(a) - logTimeKey(b));
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
      toCanonicalMealType,
      setDailyLog,
      setManualNodes,
      setSimulatedLog,
      setChatHistory,
      dailyPlanMealConfirmGuardRef,
    ]
  );

  const handleDailyPlanCancel = useCallback(() => {
    setChatHistory((prev) => prev.filter((m) => !m.dailyPlan));
  }, [setChatHistory]);

  return {
    mapProposalItemsToDiaryFoods,
    openGhostMealEditorFromTimelineNode,
    commitAddFoodChatPayload,
    saveCustomRecipeToFoodDb,
    saveFoodEntryPer100ToFoodDb,
    persistBarcodeNutritionCorrection,
    deleteRecipeFromFoodDb,
    saveMealToDiary,
    handleMealBuilderSave,
    handleMealProposalConfirm,
    handleMealProposalCancel,
    handleDailyPlanConfirm,
    handleDailyPlanCancel,
  };
}
