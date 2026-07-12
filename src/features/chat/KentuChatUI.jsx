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
  onModifyMealProposal,
  onDraftConfirm,
  onDraftCancel,
  onDraftRemoveItem,
  onDraftUpdateItemGrams,
  onDraftUpdateMealMeta,
  onDraftUpdateFoodItemName,
  onWorkoutDraftUpdateMeta,
  onWorkoutDraftUpdateExercise,
  onWorkoutDraftRemoveExercise,
  onBack,
  introPhrase,
  isProcessing = false,
}) {
  return (
    <div
      className="view-animate"
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
        onModifyMealProposal={onModifyMealProposal}
        onDraftConfirm={onDraftConfirm}
        onDraftCancel={onDraftCancel}
        onDraftRemoveItem={onDraftRemoveItem}
        onDraftUpdateItemGrams={onDraftUpdateItemGrams}
        onDraftUpdateMealMeta={onDraftUpdateMealMeta}
        onDraftUpdateFoodItemName={onDraftUpdateFoodItemName}
        onWorkoutDraftUpdateMeta={onWorkoutDraftUpdateMeta}
        onWorkoutDraftUpdateExercise={onWorkoutDraftUpdateExercise}
        onWorkoutDraftRemoveExercise={onWorkoutDraftRemoveExercise}
        onBack={onBack}
        introPhrase={introPhrase}
        isProcessing={isProcessing}
      />
    </div>
  );
}
