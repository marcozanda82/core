import { useCallback } from 'react';
import AiCluster from '../../AiCluster';

/**
 * Vista drawer chat Kentu: messaggi, quick actions e impostazioni API (AiCluster).
 */
export default function KentuChatUI({
  chatHistory,
  chatInput,
  setChatInput,
  chatImages,
  setChatImages,
  handleChatSubmit,
  showAiSettings,
  setShowAiSettings,
  apiKeys,
  onKeyChange,
  onRemoveKey,
  onAddKey,
  onSaveApiCluster,
  onBack,
  introPhrase,
}) {
  const onChatQuickAction = useCallback(
    (kind) => {
      const quickActionMap = {
        briefing: 'Genera briefing sintetico della giornata.',
        yesterday: 'Analizza i gap di ieri e suggerisci una correzione pratica.',
        mealIdea: 'Suggerisci un pasto bilanciato per oggi.',
        checkOggi: 'Esegui check nutrizionale di oggi.',
        trainingCheck: 'Posso allenarmi ora? Valuta recupero e carico.',
        reportMese: 'Genera report sintetico ultimi 30 giorni.',
        scannerMetabolico: 'Esegui scanner metabolico e segnala priorita.',
      };
      const text = quickActionMap[kind];
      if (!text) return;
      void handleChatSubmit(text, { fromQuickReply: true });
    },
    [handleChatSubmit],
  );

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
        onChatQuickAction={onChatQuickAction}
        showAiSettings={showAiSettings}
        setShowAiSettings={setShowAiSettings}
        apiKeys={apiKeys}
        onKeyChange={onKeyChange}
        onRemoveKey={onRemoveKey}
        onAddKey={onAddKey}
        onSaveApiCluster={onSaveApiCluster}
        onBack={onBack}
        introPhrase={introPhrase}
      />
    </div>
  );
}
