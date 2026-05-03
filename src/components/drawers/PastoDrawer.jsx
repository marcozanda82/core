import React from 'react';
import MealBuilder from '../../MealBuilder';
import FoodCommandSection from '@/features/salaComandi/components/FoodCommandSection';

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
          foodDb={foodDb}
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
            setAddedFoods((prev) => [...prev, ...newFoods]);
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
