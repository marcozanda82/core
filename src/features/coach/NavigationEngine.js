export const getTargetCoordinates = (goal) => {
  // Definiamo il "centro" ideale per ogni obiettivo
  const targets = {
    LONGEVITY: { x: 0, y: 0 }, // Equilibrio perfetto
    HYPERTROPHY: { x: 10, y: 30 }, // mTOR alto, stress moderato
    DEFINITION: { x: -20, y: -10 }, // AMPK alta, cortisolo controllato
  };
  return targets[goal] || targets.LONGEVITY;
};

export const calculateCorrection = (current, goal) => {
  const safeCurrent = current && typeof current === 'object' ? current : {};
  const point = {
    x: Number(safeCurrent.x) || 0,
    y: Number(safeCurrent.y) || 0,
  };
  const target = getTargetCoordinates(goal);
  const dx = target.x - point.x;
  const dy = target.y - point.y;

  const instructions = [];

  // Logica di correzione basata sul vettore delta
  if (dy < -15) {
    instructions.push("⬆️ Punta verso mTOR: Aumenta l'apporto proteico o intensifica la sessione di forza.");
  }
  if (dy > 15) {
    instructions.push("⬇️ Punta verso AMPK: Riduci l'introito calorico, prediligi verdure e cardio a bassa intensità.");
  }

  if (dx > 15) {
    instructions.push('⬅️ Riduci lo stress (Cortisolo): Aumenta l integrazione di magnesio/potassio e riduci i termogenici.');
  }
  if (dx < -15) {
    instructions.push('➡️ Aumenta l energia/Focus: Sei troppo scarico, valuta un pre-workout o un aumento moderato di carboidrati complessi.');
  }

  return instructions.length > 0
    ? instructions
    : ['✅ Sei in rotta. Mantieni la traiettoria attuale.'];
};
