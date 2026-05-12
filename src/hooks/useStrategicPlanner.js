import { useState, useEffect, useCallback } from 'react';
import { ref, onValue, set, update } from 'firebase/database';

const DEFAULT_PLAN = {
  settings: {
    deloadFrequencyWeeks: 4, // Scarico predefinito ogni 4 settimane
    currentWeekInCycle: 1,
  },
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

  return {
    strategicPlan,
    isPlannerLoading,
    updateDayPlan,
    updateSettings
  };
}
