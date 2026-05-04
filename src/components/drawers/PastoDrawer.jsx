import React from 'react';
import MealBuilder from '../../MealBuilder';
import FoodCommandSection from '@/features/salaComandi/components/FoodCommandSection';

function normalizeName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function draftMatchKey(row) {
  if (row?.key != null && String(row.key).trim() !== '') {
    return String(row.key).trim();
  }
  return normalizeName(row?.desc ?? row?.name ?? '');
}

function readDraftGrams(row) {
  const n = Number(row?.qty ?? row?.quantity ?? row?.qta ?? row?.weight ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Unisce le righe bozza pasto quando arrivano da FoodCommandSection (solo addedFoods).
 */
function mergeFoodDraftItems(prevItems, incomingItems) {
  const merged = Array.isArray(prevItems) ? [...prevItems] : [];

  if (!Array.isArray(incomingItems)) return merged;

  incomingItems.forEach((incoming) => {
    if (!incoming || typeof incoming !== 'object') return;

    const incomingKey = draftMatchKey(incoming);

    const existingIndex = merged.findIndex((item) => {
      if (!item || typeof item !== 'object') return false;
      return draftMatchKey(item) === incomingKey;
    });

    const incomingQty = readDraftGrams(incoming);

    if (existingIndex >= 0) {
      const currentQty = readDraftGrams(merged[existingIndex]);
      const total = Math.round(currentQty + incomingQty);

      merged[existingIndex] = {
        ...merged[existingIndex],
        qty: total,
        qta: total,
        weight: total,
      };
    } else {
      merged.push(incoming);
    }
  });

  return merged;
}

export default function PastoDrawer({
  activeAction,
  onClose,
  mealType,
  setMealType,
  drawerMealTime,
  setDrawerMealTime,
  setDrawerMealTimeStr,
  getDefaultMealTime,
  decimalToTimeStr,
  parseTimeStrToDecimal,
  miniTimelinePastoRef,
  handleMiniTimelineDrag,
  allNodes,
  totali,
  userTargets,
  dynamicDailyKcal,
  renderLiveProgressBar,
  renderMiniBar,
  renderProgressBar,
  renderRatioBar,
  mealTotaliFull,
  targetMacrosPasto,
  ratio,
  energyAt20Percent,
  isBarcodeScannerOpen,
  setIsBarcodeScannerOpen,
  barcodeVideoRef,
  onCloseBarcodeScanner,
  foodNameInput,
  setFoodNameInput,
  foodWeightInput,
  setFoodWeightInput,
  foodInputRef,
  foodDropdownSuggestions,
  creaResults,
  isCreaLoading,
  getLastQuantityForFood,
  showFoodDropdown,
  setShowFoodDropdown,
  generateFoodWithAI,
  triggerCreaSearch,
  isGeneratingFood,
  handleAddFoodManual,
  abitudiniIeri,
  addedFoods,
  setAddedFoods,
  handleCalibrateFoodWeight,
  setSelectedFoodForInfo,
  setSelectedFoodForEdit,
  setEditQuantityValue,
  userProfile,
  checkBilanciamentoPasto,
  TELEMETRY_TABS,
  TARGETS,
  MEAL_LABELS_SAVE,
  saveMealToDiary,
  editingMealId,
  callGeminiAPIWithRotation,
  saveCustomRecipeToFoodDb,
  /** Database CREA/CSV completo (es. ~900 voci da useFoodDb). */
  csvFoodDb,
  foodDb,
  saveFoodEntryPer100ToFoodDb,
  deleteRecipeFromFoodDb,
  estraiDatiFoodDb,
  plannerNoteFromAi,
  onSmartComplete,
  smartMealLaunchKey,
  coachPracticalLaunchKey,
  mealBuilderBarcodeBootstrap,
  onMealBuilderBarcodeBootstrapConsumed,
  persistBarcodeNutritionCorrection,
}) {
  /** CREA completo + voci utente Firebase: lookup e parse comando vedono tutto il catalogo. */
  const foodDbForCommand = React.useMemo(() => {
    const base = csvFoodDb != null && typeof csvFoodDb === 'object' && !Array.isArray(csvFoodDb) ? csvFoodDb : {};
    const user = foodDb != null && typeof foodDb === 'object' && !Array.isArray(foodDb) ? foodDb : {};
    return { ...base, ...user };
  }, [csvFoodDb, foodDb]);

  const flatLogFromHabits = React.useMemo(() => {
    if (!Array.isArray(abitudiniIeri) || abitudiniIeri.length === 0) return [];
    return abitudiniIeri
      .filter((e) => e && (e.type === 'food' || e.type === 'recipe'))
      .map((e) => ({
        type: e.type === 'recipe' ? 'recipe' : 'food',
        desc: String(e.desc || e.name || '').trim(),
        name: e.name,
        qta: e.qta ?? e.weight,
        weight: e.weight,
      }))
      .filter((e) => e.desc.length > 0);
  }, [abitudiniIeri]);

  return activeAction === 'pasto' && (
    <>
      <div style={{ marginBottom: 14 }}>
        <FoodCommandSection
          foodDb={foodDbForCommand}
          baseFoodDb={
            csvFoodDb != null && typeof csvFoodDb === 'object' && !Array.isArray(csvFoodDb)
              ? csvFoodDb
              : {}
          }
          userFoodDb={
            foodDb != null && typeof foodDb === 'object' && !Array.isArray(foodDb) ? foodDb : {}
          }
          flatLog={flatLogFromHabits}
          onAddFoods={(items) => {
            const newFoods = items
              .filter((it) => it?.matchedFood && typeof it.matchedFood === 'object')
              .map((i) => ({
                ...i.matchedFood,
                id: i.matchedFood?.key,
                name: i.matchedFood?.desc,
                qty: i.quantity ?? i.suggestedQuantity ?? 0,
                qta: Math.max(
                  1,
                  Math.round(
                    Number(
                      i.quantity ??
                        i.suggestedQuantity ??
                        i.matchedFood?.defaultQty ??
                        100,
                    ) || 100,
                  ),
                ),
                weight: Math.max(
                  1,
                  Math.round(
                    Number(
                      i.quantity ??
                        i.suggestedQuantity ??
                        i.matchedFood?.defaultQty ??
                        100,
                    ) || 100,
                  ),
                ),
              }));
            setAddedFoods((prev) => mergeFoodDraftItems(prev, newFoods));
          }}
        />
      </div>

      <MealBuilder
        onClose={onClose}
        mealType={mealType}
        setMealType={setMealType}
        drawerMealTime={drawerMealTime}
        setDrawerMealTime={setDrawerMealTime}
        setDrawerMealTimeStr={setDrawerMealTimeStr}
        getDefaultMealTime={getDefaultMealTime}
        decimalToTimeStr={decimalToTimeStr}
        parseTimeStrToDecimal={parseTimeStrToDecimal}
        miniTimelinePastoRef={miniTimelinePastoRef}
        handleMiniTimelineDrag={handleMiniTimelineDrag}
        allNodes={allNodes}
        totali={totali}
        userTargets={userTargets}
        dynamicDailyKcal={dynamicDailyKcal}
        renderLiveProgressBar={renderLiveProgressBar}
        renderMiniBar={renderMiniBar}
        renderProgressBar={renderProgressBar}
        renderRatioBar={renderRatioBar}
        mealTotaliFull={mealTotaliFull}
        targetMacrosPasto={targetMacrosPasto}
        ratio={ratio}
        energyAt20Percent={energyAt20Percent}
        isBarcodeScannerOpen={isBarcodeScannerOpen}
        setIsBarcodeScannerOpen={setIsBarcodeScannerOpen}
        barcodeVideoRef={barcodeVideoRef}
        onCloseBarcodeScanner={onCloseBarcodeScanner}
        foodNameInput={foodNameInput}
        setFoodNameInput={setFoodNameInput}
        foodWeightInput={foodWeightInput}
        setFoodWeightInput={setFoodWeightInput}
        foodInputRef={foodInputRef}
        foodDropdownSuggestions={foodDropdownSuggestions}
        creaResults={creaResults}
        isCreaLoading={isCreaLoading}
        getLastQuantityForFood={getLastQuantityForFood}
        showFoodDropdown={showFoodDropdown}
        setShowFoodDropdown={setShowFoodDropdown}
        generateFoodWithAI={generateFoodWithAI}
        triggerCreaSearch={triggerCreaSearch}
        isGeneratingFood={isGeneratingFood}
        handleAddFoodManual={handleAddFoodManual}
        abitudiniIeri={abitudiniIeri}
        addedFoods={addedFoods}
        setAddedFoods={setAddedFoods}
        handleCalibrateFoodWeight={handleCalibrateFoodWeight}
        setSelectedFoodForInfo={setSelectedFoodForInfo}
        setSelectedFoodForEdit={setSelectedFoodForEdit}
        setEditQuantityValue={setEditQuantityValue}
        userProfile={userProfile}
        checkBilanciamentoPasto={checkBilanciamentoPasto}
        TELEMETRY_TABS={TELEMETRY_TABS}
        TARGETS={TARGETS}
        MEAL_LABELS_SAVE={MEAL_LABELS_SAVE}
        saveMealToDiary={saveMealToDiary}
        editingMealId={editingMealId}
        callGeminiAPIWithRotation={callGeminiAPIWithRotation}
        saveCustomRecipeToFoodDb={saveCustomRecipeToFoodDb}
        foodDb={foodDb}
        saveFoodEntryPer100ToFoodDb={saveFoodEntryPer100ToFoodDb}
        deleteRecipeFromFoodDb={deleteRecipeFromFoodDb}
        estraiDatiFoodDb={estraiDatiFoodDb}
        plannerNoteFromAi={plannerNoteFromAi}
        onSmartComplete={onSmartComplete}
        smartMealLaunchKey={smartMealLaunchKey}
        coachPracticalLaunchKey={coachPracticalLaunchKey}
        mealBuilderBarcodeBootstrap={mealBuilderBarcodeBootstrap}
        onMealBuilderBarcodeBootstrapConsumed={onMealBuilderBarcodeBootstrapConsumed}
        persistBarcodeNutritionCorrection={persistBarcodeNutritionCorrection}
      />
    </>
  );
}
