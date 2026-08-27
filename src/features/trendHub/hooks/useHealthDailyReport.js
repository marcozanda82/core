import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref, update } from 'firebase/database';
import {
  buildFoodHealthLabelsFirebasePatch,
  buildHealthAnalysisContext,
  buildHealthReportDocument,
  isHealthReportGeneratedToday,
  requestHealthAnalyzerReport,
} from '../engines/HealthAnalyzerEngine';

/**
 * Referto salute giornaliero (ieri) + lazy labeling sul food slice rilevante.
 * Contratto snello P1: `yesterdayLog` + `relevantFoodDatabase` (niente fullHistory).
 * Generazione LLM: al massimo una volta per giorno calendario (`generatedAt`).
 */
export function useHealthDailyReport({
  db = null,
  uid = null,
  enabled = false,
  todayDate = '',
  yesterdayLog = null,
  analysisDate: analysisDateProp = '',
  foodDatabase = {},
  setFoodDb = null,
  morningSleepLog = null,
} = {}) {
  const [report, setReport] = useState(null);
  const [recentNutritionScores, setRecentNutritionScores] = useState([]);
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const [status, setStatus] = useState('idle');
  const [errorMessage, setErrorMessage] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const inFlightRef = useRef(false);
  const runTokenRef = useRef(0);
  const lastAutoKeyRef = useRef('');

  const sleepKey = morningSleepLog
    ? `${morningSleepLog.hours}|${morningSleepLog.quality}|${morningSleepLog.recordedAt || 0}`
    : 'none';

  const context = useMemo(
    () => buildHealthAnalysisContext({
      yesterdayLog: Array.isArray(yesterdayLog) ? yesterdayLog : [],
      foodDatabase,
      todayDate,
      analysisDate: analysisDateProp || null,
      morningSleepLog,
    }),
    [yesterdayLog, foodDatabase, todayDate, analysisDateProp, morningSleepLog],
  );

  const analysisDate = context.analysisDate;
  const contextKey = useMemo(
    () => [
      analysisDate,
      context.allFoods.length,
      context.unknownFoods.length,
      context.knownFoods.map((f) => f.foodDbKey || f.foodName).join(','),
      context.unknownFoods.map((f) => f.foodDbKey || f.foodName).join(','),
      sleepKey,
    ].join('|'),
    [analysisDate, context, sleepKey],
  );

  const isUpdatedToday = useMemo(
    () => isHealthReportGeneratedToday(report, todayDate),
    [report, todayDate],
  );

  const persistReport = useCallback(
    async (doc) => {
      if (!db || !uid || !doc?.date) return;
      await update(ref(db, `users/${uid}/health_reports`), {
        [doc.date]: doc,
      });
    },
    [db, uid],
  );

  const applyLazyLabels = useCallback(
    async (newLabels) => {
      if (!db || !uid || !Array.isArray(newLabels) || newLabels.length === 0) {
        return 0;
      }
      const { patch, localUpdates } = buildFoodHealthLabelsFirebasePatch(newLabels, foodDatabase);
      if (Object.keys(patch).length === 0) return 0;
      await update(ref(db, `users/${uid}/tracker_data`), patch);
      if (typeof setFoodDb === 'function') {
        setFoodDb((prev) => {
          const next = { ...(prev || {}) };
          Object.entries(localUpdates).forEach(([key, labels]) => {
            if (!next[key]) return;
            next[key] = { ...next[key], ...labels };
          });
          return next;
        });
      }
      return Object.keys(localUpdates).length;
    },
    [db, uid, foodDatabase, setFoodDb],
  );

  const generateReport = useCallback(
    async ({ force = false } = {}) => {
      if (!enabled || !db || !uid || !todayDate) return null;
      if (inFlightRef.current) return null;

      if (!context.hasFoods) {
        setReport(null);
        setStatus('empty');
        setErrorMessage(null);
        return null;
      }

      // Una sola generazione LLM per giorno calendario
      if (force && isHealthReportGeneratedToday(report, todayDate)) {
        setStatus('ready');
        return report;
      }

      inFlightRef.current = true;
      const token = ++runTokenRef.current;
      setIsRefreshing(true);
      setStatus((prev) => (prev === 'ready' && !force ? 'ready' : 'loading'));
      setErrorMessage(null);

      try {
        const llmReport = await requestHealthAnalyzerReport(context);
        if (token !== runTokenRef.current) return null;

        await applyLazyLabels(llmReport.newLabels);
        const doc = buildHealthReportDocument({
          analysisDate: context.analysisDate,
          report: llmReport,
          knownFoods: context.knownFoods,
          unknownFoods: context.unknownFoods,
          morningSleepLog: context.morningSleepLog,
        });
        await persistReport(doc);
        if (token !== runTokenRef.current) return null;

        setReport(doc);
        setStatus('ready');
        return doc;
      } catch (err) {
        if (token !== runTokenRef.current) return null;
        console.error('[HealthAnalyzer]', err);
        setErrorMessage(String(err?.message || err || 'Errore analisi salute'));
        setStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
        return null;
      } finally {
        if (token === runTokenRef.current) {
          inFlightRef.current = false;
          setIsRefreshing(false);
        }
      }
    },
    [enabled, db, uid, todayDate, context, report, applyLazyLabels, persistReport],
  );

  // Cache Firebase per la data di analisi (attendi snapshot prima di generare).
  useEffect(() => {
    if (!enabled || !db || !uid || !analysisDate) {
      setCacheHydrated(false);
      return undefined;
    }
    setCacheHydrated(false);
    const unsub = onValue(ref(db, `users/${uid}/health_reports/${analysisDate}`), (snap) => {
      const val = snap.val();
      if (val && typeof val === 'object') {
        setReport(val);
        setStatus('ready');
        setErrorMessage(null);
      } else {
        setReport(null);
      }
      setCacheHydrated(true);
    });
    return () => unsub();
  }, [enabled, db, uid, analysisDate]);

  // Media Insight nutrizione ultimi 3–7 report (pilastro Longevità).
  useEffect(() => {
    if (!enabled || !db || !uid) {
      setRecentNutritionScores([]);
      return undefined;
    }
    const unsub = onValue(ref(db, `users/${uid}/health_reports`), (snap) => {
      const val = snap.val();
      if (!val || typeof val !== 'object') {
        setRecentNutritionScores([]);
        return;
      }
      const rows = Object.entries(val)
        .map(([date, doc]) => ({
          date: String(date || doc?.date || '').slice(0, 10),
          score: Number(doc?.longevityNutrition?.score),
          generatedAt: Number(doc?.generatedAt) || 0,
        }))
        .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.score) && r.score >= 0)
        .sort((a, b) => {
          if (b.date !== a.date) return b.date.localeCompare(a.date);
          return b.generatedAt - a.generatedAt;
        })
        .slice(0, 7);
      setRecentNutritionScores(rows.map((r) => r.score));
    });
    return () => unsub();
  }, [enabled, db, uid]);

  // Auto-generazione solo a cache miss (niente re-run mid-day).
  useEffect(() => {
    if (!enabled || !db || !uid || !todayDate || !cacheHydrated) return undefined;
    if (!context.hasFoods) {
      setStatus('empty');
      return undefined;
    }
    const cachedForDate = report && String(report.date) === analysisDate;
    if (cachedForDate) {
      setStatus('ready');
      return undefined;
    }
    const autoKey = contextKey;
    if (lastAutoKeyRef.current === autoKey) return undefined;
    lastAutoKeyRef.current = autoKey;
    void generateReport({ force: false });
    return undefined;
  }, [
    enabled,
    db,
    uid,
    todayDate,
    cacheHydrated,
    context.hasFoods,
    contextKey,
    analysisDate,
    report,
    generateReport,
  ]);

  return {
    report,
    analysisDate,
    status,
    errorMessage,
    isRefreshing,
    isUpdatedToday,
    needsLabeling: context.needsLabeling,
    foodCount: context.allFoods.length,
    unknownCount: context.unknownFoods.length,
    longevityNutrition: report?.longevityNutrition || null,
    recentNutritionScores,
    refresh: () => {
      if (isHealthReportGeneratedToday(report, todayDate)) {
        return Promise.resolve(report);
      }
      lastAutoKeyRef.current = '';
      return generateReport({ force: true });
    },
  };
}

export default useHealthDailyReport;
