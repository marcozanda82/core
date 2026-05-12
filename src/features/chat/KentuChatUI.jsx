import React, { useCallback } from 'react';
import AiCluster from '../../AiCluster';
import { applyCalorieStrategyToProfileKcal, getTodayString } from '../../coreEngine';

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
  currentTrackerDate,
  activeLog,
  userTargets,
  kentuDailyCalorieStrategy,
  bodyBattery,
  totali,
  fullHistory,
  buildQuickBriefingSecretPrompt,
  buildYesterdayGapSecretPrompt,
  buildMealIdeaFromDispensaSecretPrompt,
  onLogDinnerOption,
  onLoadAgenda,
  onMealProposalConfirm,
  onMealProposalCancel,
  onMealProposalSwap,
  onDailyPlanConfirm,
  onDailyPlanCancel,
  onGeneratePlanGhostMealDraft,
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
      const anchor = currentTrackerDate || getTodayString();
      const burnedKcalContext = (activeLog || [])
        .filter((item) => item.type === 'workout')
        .reduce((acc, wk) => acc + (Number(wk.kcal || wk.cal) || 0), 0);
      const dynamicDailyKcalCtx =
        applyCalorieStrategyToProfileKcal(userTargets?.kcal ?? 2000, kentuDailyCalorieStrategy) +
        burnedKcalContext;
      if (kind === 'briefing') {
        const secret = buildQuickBriefingSecretPrompt({
          bodyBatteryPercent: bodyBattery?.currentEnergy ?? 0,
          dynamicDailyKcal: dynamicDailyKcalCtx,
          totali,
          userTargets,
        });
        void handleChatSubmit(null, { secretPrompt: secret, displayText: '📊 Briefing' });
      } else if (kind === 'yesterday') {
        const secret = buildYesterdayGapSecretPrompt(fullHistory, anchor, userTargets);
        void handleChatSubmit(null, { secretPrompt: secret, displayText: '🔍 Analisi Ieri' });
      } else if (kind === 'mealIdea') {
        void handleChatSubmit(null, {
          secretPrompt: buildMealIdeaFromDispensaSecretPrompt(),
          displayText: '💡 Idea Pasto',
        });
      } else if (kind === 'checkOggi') {
        void handleChatSubmit('⚖️ Check Oggi', { fromQuickReply: true });
      } else if (kind === 'trainingCheck') {
        void handleChatSubmit('🏃‍♂️ Posso allenarmi?', { fromQuickReply: true });
      } else if (kind === 'reportMese') {
        void handleChatSubmit('📅 Report Mese', { fromQuickReply: true });
      } else if (kind === 'scannerMetabolico') {
        void handleChatSubmit('🧬 Scanner Metabolico', { fromQuickReply: true });
      }
    },
    [
      activeLog,
      bodyBattery?.currentEnergy,
      buildMealIdeaFromDispensaSecretPrompt,
      buildQuickBriefingSecretPrompt,
      buildYesterdayGapSecretPrompt,
      currentTrackerDate,
      fullHistory,
      handleChatSubmit,
      kentuDailyCalorieStrategy,
      totali,
      userTargets,
    ],
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
        onLogDinnerOption={onLogDinnerOption}
        onLoadAgenda={onLoadAgenda}
        onMealProposalConfirm={onMealProposalConfirm}
        onMealProposalCancel={onMealProposalCancel}
        onMealProposalSwap={onMealProposalSwap}
        onDailyPlanConfirm={onDailyPlanConfirm}
        onDailyPlanCancel={onDailyPlanCancel}
        onGeneratePlanGhostMealDraft={onGeneratePlanGhostMealDraft}
        dailyLog={activeLog || []}
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
