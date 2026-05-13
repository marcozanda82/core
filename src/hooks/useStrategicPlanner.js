import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, set, update } from 'firebase/database';

const DEFAULT_PLAN = {
  settings: {
    deloadFrequencyWeeks: 4, // Scarico predefinito ogni 4 settimane
    currentWeekInCycle: 1,
  },
  calorieMemory: {}, // Dizionario per ricordare le kcal delle attività
  days: {
    lunedi: null,
    martedi: null,
    mercoledi: null,
    giovedi: null,
    venerdi: null,
    sabato: null,
    domenica: null
  }
};

export function useStrategicPlanner(db, userUid) {
  const [strategicPlan, setStrategicPlan] = useState(DEFAULT_PLAN);
  const [isPlannerLoading, setIsPlannerLoading] = useState(true);

  useEffect(() => {
    if (!db || !userUid) {
      setIsPlannerLoading(false);
      return;
    }

    const planRef = ref(db, `users/${userUid}/weeklyStrategicPlanner`);
    
    const unsubscribe = onValue(planRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        // Fonde i dati di Firebase con il default per evitare errori se mancano dei giorni
        setStrategicPlan({
          settings: { ...DEFAULT_PLAN.settings, ...(data.settings || {}) },
          calorieMemory: { ...DEFAULT_PLAN.calorieMemory, ...(data.calorieMemory || {}) },
          days: { ...DEFAULT_PLAN.days, ...(data.days || {}) }
        });
      } else {
        setStrategicPlan(DEFAULT_PLAN);
      }
      setIsPlannerLoading(false);
    });

    return () => unsubscribe();
  }, [db, userUid]);

  // Aggiorna un singolo giorno (es. dayKey = 'lunedi')
  const updateDayPlan = useCallback(async (dayKey, dayData) => {
    if (!db || !userUid) return;
    const dayRef = ref(db, `users/${userUid}/weeklyStrategicPlanner/days/${dayKey}`);
    // Se dayData è null, rimuove il nodo, altrimenti lo sovrascrive
    await set(dayRef, dayData);
  }, [db, userUid]);

  // Aggiorna le impostazioni del ciclo (es. { deloadFrequencyWeeks: 6 })
  const updateSettings = useCallback(async (newSettings) => {
     if (!db || !userUid) return;
     const settingsRef = ref(db, `users/${userUid}/weeklyStrategicPlanner/settings`);
     await update(settingsRef, newSettings);
  }, [db, userUid]);

  const saveCalorieMemory = useCallback(async (memoryKey, kcal) => {
    if (!db || !userUid || !memoryKey) return;
    const memRef = ref(db, `users/${userUid}/weeklyStrategicPlanner/calorieMemory/${memoryKey}`);
    await set(memRef, kcal);
  }, [db, userUid]);

  // Traslazione a Domino: sposta gli impegni in avanti fino al primo giorno di riposo
  const shiftPlanForward = useCallback(async (startDayKey) => {
    if (!db || !userUid || !strategicPlan.days) return;

    const daysOrder = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'];
    const startIndex = daysOrder.indexOf(startDayKey);
    if (startIndex === -1) return;

    // 1. Trova il primo giorno di riposo/vuoto successivo
    let targetRestIndex = -1;
    for (let i = 1; i <= 7; i++) {
      const checkIndex = (startIndex + i) % 7;
      const dayData = strategicPlan.days[daysOrder[checkIndex]];
      if (!dayData || dayData.type === 'REST' || dayData.type === 'RECOVERY') {
        targetRestIndex = checkIndex;
        break;
      }
    }

    // Se non ci sono giorni di riposo in tutta la settimana, interrompe (settimana troppo satura)
    if (targetRestIndex === -1) {
      console.warn("Impossibile traslare: nessun giorno di riposo disponibile.");
      return;
    }

    // 2. Crea una copia dei giorni per manipolarli
    const newDays = { ...strategicPlan.days };

    // 3. Calcola il percorso da shiftare
    const indicesToShift = [];
    let curr = startIndex;
    while (curr !== targetRestIndex) {
      indicesToShift.push(curr);
      curr = (curr + 1) % 7;
    }

    // 4. Esegui lo shift partendo dal fondo (per non sovrascrivere i dati)
    for (let i = indicesToShift.length - 1; i >= 0; i--) {
      const fromIndex = indicesToShift[i];
      const toIndex = (fromIndex + 1) % 7;
      newDays[daysOrder[toIndex]] = newDays[daysOrder[fromIndex]];
    }

    // 5. Il giorno di partenza diventa "Riposo" a causa dell'imprevisto
    newDays[daysOrder[startIndex]] = { type: 'REST', focus: [], hour: '', kcal: 0 };

    // 6. Salva l'intera nuova settimana su Firebase
    const daysRef = ref(db, `users/${userUid}/weeklyStrategicPlanner/days`);
    await set(daysRef, newDays);
  }, [db, userUid, strategicPlan]);

  return {
    strategicPlan,
    isPlannerLoading,
    updateDayPlan,
    updateSettings,
    saveCalorieMemory,
    shiftPlanForward,
  };
}
