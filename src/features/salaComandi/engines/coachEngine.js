/**
 * Genera il feedback del coach in base alla posizione attuale, il target e i delta predittivi.
 */
export function generateCoachAdvice(currentPos, targetPos, deltas, route) {
  const { fatMassKg: cFat, leanMassKg: cLean } = currentPos;
  const { targetFatKg: tFat, targetLeanKg: tLean } = targetPos;
  const { expectedFatDeltaKg: dFat, expectedLeanDeltaKg: dLean } = deltas;

  // Tolleranza per considerare l'utente "a bersaglio" (es. mezzo chilo)
  const isAtTarget = Math.abs(cFat - tFat) < 0.5 && Math.abs(cLean - tLean) < 0.5;
  const isStalled = dFat === 0 && dLean === 0;

  // Analisi direzione generale (molto semplificata per MVP)
  const isLosingFat = dFat < -0.05;
  const isGainingFat = dFat > 0.05;
  const isGainingLean = dLean > 0.05;
  const isLosingLean = dLean < -0.05;

  if (isAtTarget) {
    if (route === 'longevity') return "Omeostasi raggiunta. Mantieni l'apporto calorico di base per preservare l'equilibrio biologico.";
    if (route === 'performance') return 'Target strutturale centrato. Sei nella condizione ideale per esprimere forza massima.';
    if (route === 'definition') return 'Condizione estetica ottimale. Inizia la fase di mantenimento per non rischiare il catabolismo.';
  }

  if (isStalled) {
    return "Metabolismo in stallo. Nessuna variazione prevista. Modifica l'introito calorico o l'allenamento per rimetterti in moto verso il target.";
  }

  // Feedback specifici in base alla direzione e alla rotta
  if (route === 'definition') {
    if (isLosingFat && isLosingLean) return 'Attenzione: stai perdendo grasso ma anche tessuto muscolare. Il deficit calorico potrebbe essere troppo aggressivo o mancano proteine.';
    if (isLosingFat && !isLosingLean) return 'Rotta perfetta. Stai tagliando massa grassa preservando la muscolatura. Continua così.';
    if (isGainingFat) return "Allarme appannamento: l'attuale surplus sta generando nuovo tessuto adiposo, allontanandoti dall'obiettivo estetico.";
  }

  if (route === 'performance') {
    if (isGainingLean && isGainingFat) return "Fase di costruzione attiva. L'aumento di grasso è fisiologico, ma monitora che la proporzione favorisca il tessuto muscolare.";
    if (isGainingLean && !isGainingFat) return 'Ricomp. eccezionale: stai costruendo struttura senza accumulare grasso. Ottimo stimolo ipertrofico.';
    if (isLosingLean) return 'Allarme deallenamento: le stime indicano una perdita di massa magra. Aumenta il volume di allenamento o le calorie.';
  }

  // Default / Longevity
  if (isGainingFat && !isGainingLean) return "Rischio infiammazione: l'inerzia attuale porta ad un accumulo di solo tessuto adiposo. Riduci zuccheri e calorie vuote.";
  if (isLosingFat && isGainingLean) return 'Omeostasi in miglioramento: ottima ricomposizione corporea verso il centro di equilibrio biologico.';
  if (isLosingLean) return 'Rischio fragilità: stai intaccando la massa magra. Assicurati un apporto proteico sufficiente per il recupero.';

  return "Inerzia metabolica rilevata. Monitora l'andamento nei prossimi giorni per confermare la traiettoria.";
}
