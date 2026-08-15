import AiCluster from '../../AiCluster';

/**
 * KentuChatUI — vista drawer chat Kentu: messaggi e input.
 */
export default function KentuChatUI({
  chatHistory,
  chatInput,
  setChatInput,
  chatImages,
  setChatImages,
  handleChatSubmit,
  activeQuickReplies = [],
  handleQuickReplyClick,
  handleAcceptAdvice,
  onAcceptMealProposal,
  onEnableMealDraftInteractiveEdit = null,
  onRequestMealItemEdit = null,
  onCancelMealDraftProposal = null,
  onLearnUnresolvedFood = null,
  foodDatabase = {},
  kentuItDatabase = {},
  globalFoodDatabase = {},
  fullHistory = {},
  onDraftConfirm,
  onDraftCancel,
  onDraftRemoveItem,
  onDraftUpdateItemGrams,
  onDraftUpdateMealMeta,
  onDraftUpdateFoodItemName,
  onMcDriveRemoveItem = null,
  onMcDriveUpdateGrams = null,
  onMcDriveApplyAlternative = null,
  onMcDriveReplaceFromSearch = null,
  getMcDriveMealTargets = null,
  onWorkoutDraftUpdateMeta,
  onWorkoutDraftUpdateExercise,
  onWorkoutDraftRemoveExercise,
  onSaveNewFoodEntry,
  onBack,
  introPhrase,
  isProcessing = false,
  onCancelGeneration = null,
  wipMealItems = [],
  wipMealTotals = null,
  wipMealType = 'pranzo',
  onRemoveWipItem,
  onClearWipMeal,
  onAddWipSuggestion,
  mealBuilder = null,
  cancelMealBuilder,
  commitMealBuilder,
  onManualShortcut,
  onRequestReport,
  onRequestBarcodeScan,
  quickStripItems = null,
  preferVoiceChat = false,
  userDisplayName = '',
  healthScore = null,
  isTrainingDay = false,
  onRequestHealthDiagnosis = null,
}) {
  return (
    <div
      className="view-animate flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        height: '100%',
        maxHeight: '100%',
      }}
    >
      <AiCluster
        chatHistory={chatHistory}
        chatInput={chatInput}
        setChatInput={setChatInput}
        chatImages={chatImages}
        setChatImages={setChatImages}
        onSendMessage={handleChatSubmit}
        activeQuickReplies={activeQuickReplies}
        onSlotQuickReplyClick={handleQuickReplyClick}
        onAcceptAdvice={handleAcceptAdvice}
        onAcceptMealProposal={onAcceptMealProposal}
        onEnableMealDraftInteractiveEdit={onEnableMealDraftInteractiveEdit}
        onRequestMealItemEdit={onRequestMealItemEdit}
        onCancelMealDraftProposal={onCancelMealDraftProposal}
        onLearnUnresolvedFood={onLearnUnresolvedFood}
        foodDatabase={foodDatabase}
        kentuItDatabase={kentuItDatabase}
        globalFoodDatabase={globalFoodDatabase}
        fullHistory={fullHistory}
        onDraftConfirm={onDraftConfirm}
        onDraftCancel={onDraftCancel}
        onDraftRemoveItem={onDraftRemoveItem}
        onDraftUpdateItemGrams={onDraftUpdateItemGrams}
        onDraftUpdateMealMeta={onDraftUpdateMealMeta}
        onDraftUpdateFoodItemName={onDraftUpdateFoodItemName}
        onMcDriveRemoveItem={onMcDriveRemoveItem}
        onMcDriveUpdateGrams={onMcDriveUpdateGrams}
        onMcDriveApplyAlternative={onMcDriveApplyAlternative}
        onMcDriveReplaceFromSearch={onMcDriveReplaceFromSearch}
        getMcDriveMealTargets={getMcDriveMealTargets}
        onWorkoutDraftUpdateMeta={onWorkoutDraftUpdateMeta}
        onWorkoutDraftUpdateExercise={onWorkoutDraftUpdateExercise}
        onWorkoutDraftRemoveExercise={onWorkoutDraftRemoveExercise}
        onSaveNewFoodEntry={onSaveNewFoodEntry}
        onBack={onBack}
        introPhrase={introPhrase}
        isProcessing={isProcessing}
        onCancelGeneration={onCancelGeneration}
        wipMealItems={wipMealItems}
        wipMealTotals={wipMealTotals}
        wipMealType={wipMealType}
        onRemoveWipItem={onRemoveWipItem}
        onClearWipMeal={onClearWipMeal}
        onAddWipSuggestion={onAddWipSuggestion}
        mealBuilder={mealBuilder}
        cancelMealBuilder={cancelMealBuilder}
        commitMealBuilder={commitMealBuilder}
        onManualShortcut={onManualShortcut}
        onRequestReport={onRequestReport}
        onRequestBarcodeScan={onRequestBarcodeScan}
        quickStripItems={quickStripItems}
        preferVoiceChat={preferVoiceChat}
        userDisplayName={userDisplayName}
        healthScore={healthScore}
        isTrainingDay={isTrainingDay}
        onRequestHealthDiagnosis={onRequestHealthDiagnosis}
      />
    </div>
  );
}
