import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref, update } from 'firebase/database';
import {
  buildFoodHealthLabelsFirebasePatch,
  buildHealthAnalysisContext,
  buildHealthReportDocument,
  requestHealthAnalyzerReport,
} from '../engines/HealthAnalyzerEngine';

/**
 * Referto salute giornaliero (ieri) + lazy labeling sul food slice rilevante.
 * Contratto snello P1: `yesterdayLog` + `relevantFoodDatabase` (niente fullHistory).
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
    [enabled, db, uid, todayDate, context, applyLazyLabels, persistReport],
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

  // Auto-generazione: miss cache, oppure sonno appena disponibile senza insight correlato.
  useEffect(() => {
    if (!enabled || !db || !uid || !todayDate || !cacheHydrated) return undefined;
    if (!context.hasFoods) {
      setStatus('empty');
      return undefined;
    }
    const cachedForDate = report && String(report.date) === analysisDate;
    const needsSleepInsightRefresh = Boolean(
      cachedForDate
      && morningSleepLog
      && !String(report?.sleepCorrelationInsight || '').trim(),
    );
    if (cachedForDate && !needsSleepInsightRefresh) {
      setStatus('ready');
      return undefined;
    }
    if (lastAutoKeyRef.current === contextKey) return undefined;
    lastAutoKeyRef.current = contextKey;
    void generateReport({ force: needsSleepInsightRefresh });
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
    morningSleepLog,
    generateReport,
  ]);

  return {
    report,
    analysisDate,
    status,
    errorMessage,
    isRefreshing,
    needsLabeling: context.needsLabeling,
    foodCount: context.allFoods.length,
    unknownCount: context.unknownFoods.length,
    refresh: () => {
      lastAutoKeyRef.current = '';
      return generateReport({ force: true });
    },
  };
}

export default useHealthDailyReport;
