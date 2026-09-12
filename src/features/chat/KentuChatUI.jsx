import AiCluster from '../../AiCluster';
import { DEFAULT_TARGETS } from '../../useBiochimico';

function normalizeDailyLog(log) {
  return Array.isArray(log) ? log : [];
}

function normalizeUserTargets(targets) {
  if (targets && typeof targets === 'object') return targets;
  return { ...DEFAULT_TARGETS };
}

function normalizeHealthScore(score) {
  if (score && typeof score === 'object') return score;
  const n = Number(score);
  if (Number.isFinite(n)) return { score: Math.max(0, Math.min(100, Math.round(n))) };
  return null;
}

/**
 * KentuChatUI — vista drawer chat Kentu: messaggi e input.
 */
export default function KentuChatUI({
  chatHistory = [],
  chatInput,
  setChatInput,
  chatImages = [],
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
  offDb = {},
  fullHistory = {},
  dailyLog = [],
  userTargets = null,
  diaryReady = true,
  engineReady = true,
  onDraftConfirm,
  onDraftCancel,
  onDraftRemoveItem,
  onDraftUpdateItemGrams,
  onDraftUpdateMealMeta,
  onDraftUpdateFoodItemName,
  onMcDriveRemoveItem = null,
  onMcDriveReturnItemToInbox = null,
  onMcDriveUpdateGrams = null,
  onMcDriveUpdateMealTime = null,
  onMcDriveApplyAlternative = null,
  onMcDriveReplaceFromSearch = null,
  onMcDriveUpdateItemName = null,
  onMcDriveAppendSolverItems = null,
  onMcDriveRequestDisambiguation = null,
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
  onOpenManualView = null,
  onOpenActivityView = null,
  onOpenPlanView = null,
  onSelectInboxDraft = null,
  onDropInboxOntoMeal = null,
  onDropInboxOntoDraft = null,
  onTrashMeal = null,
  trashMeals = [],
  onRestoreTrashMeal = null,
  onPurgeTrashMeal = null,
  onRequestReport,
  onRequestBarcodeScan,
  quickStripItems = null,
  preferVoiceChat = false,
  userDisplayName = '',
  healthScore = null,
  isTrainingDay = false,
  onRequestHealthDiagnosis = null,
}) {
  const safeDailyLog = normalizeDailyLog(dailyLog);
  const safeUserTargets = normalizeUserTargets(userTargets);
  const safeHealthScore = normalizeHealthScore(healthScore);
  const safeChatHistory = Array.isArray(chatHistory) ? chatHistory.filter((m) => m && typeof m === 'object') : [];
  const safeChatImages = Array.isArray(chatImages) ? chatImages : [];

  if (!diaryReady) {
    return (
      <div
        className="view-animate flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden bg-zinc-950"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-cyan-400"
          aria-hidden
        />
        <p className="mt-3 text-sm text-zinc-500">Caricamento diario…</p>
      </div>
    );
  }

  if (!engineReady) {
    return (
      <div
        className="view-animate flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden bg-zinc-950"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-cyan-400"
          aria-hidden
        />
        <p className="mt-3 text-sm text-zinc-500">Allineamento parametri in corso…</p>
      </div>
    );
  }

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
        chatHistory={safeChatHistory}
        chatInput={chatInput}
        setChatInput={setChatInput}
        chatImages={safeChatImages}
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
        offDb={offDb}
        fullHistory={fullHistory}
        dailyLog={safeDailyLog}
        userTargets={safeUserTargets}
        onDraftConfirm={onDraftConfirm}
        onDraftCancel={onDraftCancel}
        onDraftRemoveItem={onDraftRemoveItem}
        onDraftUpdateItemGrams={onDraftUpdateItemGrams}
        onDraftUpdateMealMeta={onDraftUpdateMealMeta}
        onDraftUpdateFoodItemName={onDraftUpdateFoodItemName}
        onMcDriveRemoveItem={onMcDriveRemoveItem}
        onMcDriveReturnItemToInbox={onMcDriveReturnItemToInbox}
        onMcDriveUpdateGrams={onMcDriveUpdateGrams}
        onMcDriveUpdateMealTime={onMcDriveUpdateMealTime}
        onMcDriveApplyAlternative={onMcDriveApplyAlternative}
        onMcDriveReplaceFromSearch={onMcDriveReplaceFromSearch}
        onMcDriveUpdateItemName={onMcDriveUpdateItemName}
        onMcDriveAppendSolverItems={onMcDriveAppendSolverItems}
        onMcDriveRequestDisambiguation={onMcDriveRequestDisambiguation}
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
        onOpenManualView={onOpenManualView}
        onOpenActivityView={onOpenActivityView}
        onOpenPlanView={onOpenPlanView}
        onSelectInboxDraft={onSelectInboxDraft}
        onDropInboxOntoMeal={onDropInboxOntoMeal}
        onDropInboxOntoDraft={onDropInboxOntoDraft}
        onTrashMeal={onTrashMeal}
        trashMeals={trashMeals}
        onRestoreTrashMeal={onRestoreTrashMeal}
        onPurgeTrashMeal={onPurgeTrashMeal}
        onRequestReport={onRequestReport}
        onRequestBarcodeScan={onRequestBarcodeScan}
        quickStripItems={quickStripItems}
        preferVoiceChat={preferVoiceChat}
        userDisplayName={userDisplayName}
        healthScore={safeHealthScore}
        isTrainingDay={isTrainingDay}
        onRequestHealthDiagnosis={onRequestHealthDiagnosis}
      />
    </div>
  );
}
