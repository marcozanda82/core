export const GOALS = {
  LONGEVITY: 'longevity',
  HYPERTROPHY: 'hypertrophy',
  DEFINITION: 'definition'
};

/**
 * Calcola lo stato delle missioni tattiche
 * @param {Object} totals - I totali consumati oggi (es. { kcal, prot, carb, na, k, omega3, omega6 })
 * @param {Object} targets - I target calcolati (es. { kcal, prot, carb })
 * @param {string} goal - L'obiettivo attuale (da GOALS)
 * @returns {Array} - Array di oggetti { id, title, status: 'success'|'error'|'pending', message }
 */
export const evaluateTacticalMissions = (totals, targets, goal) => {
  const missions = [];

  // 1. BILANCIO CALORICO
  let calStatus = 'pending';
  let calMessage = '';
  const calDiff = totals.kcal - targets.kcal;

  if (goal === GOALS.HYPERTROPHY) {
    if (calDiff > 100) {
      calStatus = 'success'; calMessage = 'Surplus calorico attivo. Segnale anabolico ottimale.';
    } else if (totals.kcal > 0) {
      calStatus = 'error'; calMessage = `Sei in deficit o mantenimento. Mancano ${Math.abs(calDiff).toFixed(0)} kcal per spingere la crescita.`;
    }
  } else if (goal === GOALS.LONGEVITY) {
    if (calDiff > 150) {
      calStatus = 'error'; calMessage = 'Eccesso calorico. Stai inibendo l\'autofagia e i processi di riparazione cellulare.';
    } else if (totals.kcal >= targets.kcal - 200) {
      calStatus = 'success'; calMessage = 'Calorie in range ottimale per la longevità (normo/leggero deficit).';
    }
  } else if (goal === GOALS.DEFINITION) {
    if (calDiff < -100) {
      calStatus = 'success'; calMessage = 'Deficit calorico netto confermato. Lipolisi in corso.';
    } else if (totals.kcal > 0) {
      calStatus = 'error'; calMessage = 'Calorie troppo alte per la definizione. Riduci i grassi o aumenta il dispendio.';
    }
  }
  missions.push({ id: 'calories', title: 'Bilancio Calorico', status: calStatus, message: calMessage });

  // 2. QUOTA PROTEICA E mTOR
  let protStatus = 'pending';
  let protMessage = '';
  const protRatio = totals.prot / targets.prot;

  if (goal === GOALS.HYPERTROPHY || goal === GOALS.DEFINITION) {
    if (protRatio >= 0.9) {
      protStatus = 'success'; protMessage = 'Materiale plastico sufficiente per preservare/costruire il muscolo.';
    } else if (totals.prot > 0) {
      protStatus = 'error'; protMessage = `Proteine troppo basse. Aggiungi ${(targets.prot - totals.prot).toFixed(0)}g per non perdere massa.`;
    }
  } else if (goal === GOALS.LONGEVITY) {
    if (protRatio > 1.2) {
      protStatus = 'error'; protMessage = 'Eccesso proteico. Stai iperstimolando il pathway mTOR. Ridurre per favorire la riparazione.';
    } else if (protRatio >= 0.8) {
      protStatus = 'success'; protMessage = 'Proteine bilanciate. Sufficienti per la massa magra, senza stress metabolico.';
    } else if (totals.prot > 0) {
      protStatus = 'pending'; protMessage = 'Continua ad assumere proteine fino al target.';
    }
  }
  missions.push({ id: 'protein', title: 'Gestione Proteica', status: protStatus, message: protMessage });

  // 3. EQUILIBRIO CORTISOLO (Bilancia Idrica Na/K)
  let waterStatus = 'pending';
  let waterMessage = 'In attesa di dati su Sodio e Potassio.';
  if (totals.na > 0 || totals.k > 0) {
    if (totals.k > totals.na * 1.5) {
      waterStatus = 'success'; waterMessage = 'Potassio dominante. Ottimo per la pressione e per tenere a bada i picchi di cortisolo.';
    } else {
      waterStatus = 'error'; waterMessage = 'Sodio troppo alto rispetto al Potassio. Rischio di ritenzione idrica e stress surrenale. Consuma vegetali a foglia scura.';
    }
    missions.push({ id: 'cortisol', title: 'Gestione Cortisolo (Na/K)', status: waterStatus, message: waterMessage });
  }

  // 4. INDICE INFIAMMATORIO (Omega 6/3)
  if (totals.omega3 > 0 || totals.omega6 > 0) {
    let infStatus = 'pending';
    let infMessage = '';
    const ratio = totals.omega6 / (totals.omega3 || 1); // Evita divisioni per zero
    
    if (ratio <= 4) {
      infStatus = 'success'; infMessage = 'Rapporto Omega 6:3 perfetto. Infiammazione silente sotto controllo.';
    } else {
      infStatus = 'error'; infMessage = `Rapporto sbilanciato (${ratio.toFixed(1)}:1). Aumenta l'assunzione di Omega 3 (pesce azzurro, semi di lino) per spegnere l'infiammazione.`;
    }
    missions.push({ id: 'inflammation', title: 'Indice Infiammatorio', status: infStatus, message: infMessage });
  }

  return missions;
};
