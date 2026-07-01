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
  onBack,
  introPhrase,
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
        onBack={onBack}
        introPhrase={introPhrase}
      />
    </div>
  );
}
