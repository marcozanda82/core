import React from 'react';

export default function SleepPromptOverlay({
  showSleepPrompt,
  onInsertSleep,
  onUseAverage,
  onLater,
}) {
  if (!showSleepPrompt) return null;

  return (
    <div className="sleepPromptModal">
      <div className="sleepPromptCard">
        <h3>Dati sonno mancanti</h3>
        <p>Per calcolare correttamente l'energia della giornata inserisci i dati del sonno.</p>
        <div className="sleepPromptActions">
          <button type="button" onClick={onInsertSleep}>
            Inserisci sonno
          </button>
          <button type="button" onClick={onUseAverage}>
            Usa valori medi
          </button>
          <button type="button" onClick={onLater}>
            Dopo
          </button>
        </div>
      </div>
    </div>
  );
}
