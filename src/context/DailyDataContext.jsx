import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { addDays } from '../calendarDateUtils';
import { getTodayString } from '../coreEngine';

const DailyDataContext = createContext(null);

/** Costruisce 6 giorni consecutivi terminando ieri (rispetto a oggi), con dati plausibili per kcalBalance e trainingLoad (0–100, come il motore bussola). */
function buildMockHistory() {
  const today = getTodayString();
  const presets = [
    { kcalBalance: -180, trainingLoad: 42 },
    { kcalBalance: 120, trainingLoad: 68 },
    { kcalBalance: -95, trainingLoad: 35 },
    { kcalBalance: -220, trainingLoad: 55 },
    { kcalBalance: 45, trainingLoad: 72 },
    { kcalBalance: -150, trainingLoad: 48 },
  ];
  return presets.map((row, idx) => {
    const date = addDays(today, -(6 - idx));
    return { date, kcalBalance: row.kcalBalance, trainingLoad: row.trainingLoad };
  });
}

export function DailyDataProvider({ children }) {
  const [consumedFoods, setConsumedFoods] = useState([]);
  const [targetKcal] = useState(2000);
  const [todayTrainingLoad, setTodayTrainingLoad] = useState(0);

  const mockHistory = useMemo(() => buildMockHistory(), []);

  const totals = useMemo(() => {
    return consumedFoods.reduce(
      (acc, curr) => ({
        kcal: acc.kcal + (Number(curr.kcal) || 0),
        pro: acc.pro + (Number(curr.pro) || 0),
        fat: acc.fat + (Number(curr.fat) || 0),
        carbs: acc.carbs + (Number(curr.carbs) || 0),
      }),
      { kcal: 0, pro: 0, fat: 0, carbs: 0 }
    );
  }, [consumedFoods]);

  const todayKcalBalance = useMemo(() => totals.kcal - targetKcal, [totals.kcal, targetKcal]);

  const fullHistory = useMemo(() => {
    const today = getTodayString();
    const todayEntry = {
      date: today,
      kcalBalance: todayKcalBalance,
      trainingLoad: Math.min(100, Math.max(0, todayTrainingLoad * 10)),
    };
    return [...mockHistory, todayEntry];
  }, [mockHistory, todayKcalBalance, todayTrainingLoad]);

  const addFood = useCallback((newFood) => {
    setConsumedFoods((prev) => [...prev, newFood]);
  }, []);

  const removeFood = useCallback((index) => {
    setConsumedFoods((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const value = useMemo(
    () => ({
      consumedFoods,
      targetKcal,
      todayTrainingLoad,
      setTodayTrainingLoad,
      addFood,
      removeFood,
      totals,
      fullHistory,
    }),
    [consumedFoods, targetKcal, todayTrainingLoad, addFood, removeFood, totals, fullHistory]
  );

  return <DailyDataContext.Provider value={value}>{children}</DailyDataContext.Provider>;
}

export function useDailyData() {
  const ctx = useContext(DailyDataContext);
  if (!ctx) {
    throw new Error('useDailyData must be used within DailyDataProvider');
  }
  return ctx;
}
