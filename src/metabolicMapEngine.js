function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calcola la posizione dell'utente sulla Mappa Metabolica.
 * Restituisce coordinate corrette, intensita' dell'aura e metadati di lettura.
 */
export function calculateMetabolicMapPosition(params = {}) {
  const {
    energyBalance = 0,
    trainingLoad = 0,
    sleepHours = 8,
    glycemicInstability = 0,
  } = params;

  let x = energyBalance;
  let y = trainingLoad;

  // Modificatore sonno: abbassa la leptina, alza il cortisolo e aumenta la fame.
  if (sleepHours < 7.5) {
    const sleepDebt = 7.5 - sleepHours;
    y += sleepDebt * 12;
    x += sleepDebt * 6;
  }

  // Le coordinate restano sempre entro i limiti della mappa.
  x = clamp(x, -100, 100);
  y = clamp(y, -100, 100);

  // Aura di base: rappresenta l'instabilita' glicemica percepita dal sistema.
  let finalAura = glycemicInstability;

  // Poco sonno: peggiora la sensibilita' insulinica e amplifica l'infiammazione.
  const auraMultiplier = sleepHours < 7.5
    ? 1 + ((7.5 - sleepHours) * 0.3)
    : 1;

  finalAura = clamp(finalAura * auraMultiplier, 0, 100);

  // Distanza dal centro: misura quanto il profilo si allontana dalla zona di equilibrio.
  const distance = Math.hypot(x, y);

  let zone = 'green';
  if (distance > 70) {
    zone = 'red';
  } else if (distance > 35) {
    zone = 'orange';
  }

  // Quadranti metabolici: combinano asse energetico e asse di carico/stress.
  let quadrant = 'NE';
  if (x < 0 && y >= 0) {
    quadrant = 'NW';
  } else if (x >= 0 && y < 0) {
    quadrant = 'SE';
  } else if (x < 0 && y < 0) {
    quadrant = 'SW';
  }

  return {
    x,
    y,
    finalAura,
    distance,
    zone,
    quadrant,
  };
}
