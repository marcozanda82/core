import React, { useCallback } from 'react';

import KentuChatUI from './KentuChatUI';
import { useWipMeal } from '../wipMealBuilder/context/WipMealContext.jsx';

export default function KentuChatWithWipMeal({
  chatHistory,
  setChatHistory,
  ...chatProps
}) {
  const {
    wipMealItems,
    wipTotals,
    mealType,
    addAlimentoToWip,
    removeAlimentoFromWip,
    clearWipMeal,
  } = useWipMeal();

  const handleAddWipSuggestion = useCallback((suggestion, chipId, adviceId) => {
    addAlimentoToWip(suggestion);
    if (!adviceId || typeof setChatHistory !== 'function') return;
    setChatHistory((prev) =>
      (prev || []).map((entry) => {
        if (entry.adviceId !== adviceId) return entry;
        const loaded = new Set(entry.wipAddedChipIds || []);
        if (chipId) loaded.add(chipId);
        return {
          ...entry,
          wipAddedChipIds: Array.from(loaded),
        };
      }),
    );
  }, [addAlimentoToWip, setChatHistory]);

  return (
    <KentuChatUI
      {...chatProps}
      chatHistory={chatHistory}
      setChatHistory={setChatHistory}
      wipMealItems={wipMealItems}
      wipMealTotals={wipTotals}
      wipMealType={mealType}
      onRemoveWipItem={removeAlimentoFromWip}
      onClearWipMeal={clearWipMeal}
      onAddWipSuggestion={handleAddWipSuggestion}
    />
  );
}
