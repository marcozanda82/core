import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { get, onValue, ref, update } from 'firebase/database';
import {
  buildFoodHealthLabelsFirebasePatch,
  buildHealthAnalysisContext,
  buildHealthReportDocument,
  isHealthReportGeneratedToday,
  requestHealthAnalyzerReport,
} from '../engines/HealthAnalyzerEngine';
import {
  readHealthReportCache,
  readHealthScoresIndexCache,
  writeHealthReportCache,
} from '../../../utils/longevityBootstrapCache';

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
  const reportRef = useRef(null);

  useEffect(() => {
    reportRef.current = report;
  }, [report]);

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

  // Cache-first: idratazione immediata da localStorage (0 ms percepiti).
  useEffect(() => {
    if (!enabled || !uid) return undefined;
    const cachedScores = readHealthScoresIndexCache(uid);
    if (cachedScores) {
      setRecentNutritionScores(cachedScores);
    }
    if (!analysisDate) return undefined;
    const cachedReport = readHealthReportCache(uid, analysisDate);
    if (cachedReport?.report && typeof cachedReport.report === 'object') {
      setReport(cachedReport.report);
      setStatus('ready');
      setErrorMessage(null);
      setCacheHydrated(true);
      if (Array.isArray(cachedReport.recentNutritionScores)) {
        setRecentNutritionScores(cachedReport.recentNutritionScores);
      }
    }
    return undefined;
  }, [enabled, uid, analysisDate]);

  // Fetch remoto in parallelo + listener live (Stale-While-Revalidate).
  useEffect(() => {
    if (!enabled || !db || !uid || !analysisDate) {
      setCacheHydrated(false);
      return undefined;
    }

    let cancelled = false;
    setCacheHydrated(false);

    const reportRef = ref(db, `users/${uid}/health_reports/${analysisDate}`);
    const allReportsRef = ref(db, `users/${uid}/health_reports`);

    const applyRecentScores = (val) => {
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
      const scores = rows.map((r) => r.score);
      setRecentNutritionScores(scores);
      const currentReport = reportRef.current;
      writeHealthReportCache(uid, analysisDate, {
        report: currentReport && String(currentReport.date) === analysisDate ? currentReport : undefined,
        recentNutritionScores: scores,
      });
    };

    void Promise.allSettled([get(reportRef), get(allReportsRef)]).then(([reportSnap, allSnap]) => {
      if (cancelled) return;
      const reportVal = reportSnap.status === 'fulfilled' && reportSnap.value?.exists?.()
        ? reportSnap.value.val()
        : null;
      if (reportVal && typeof reportVal === 'object') {
        setReport(reportVal);
        setStatus('ready');
        setErrorMessage(null);
        writeHealthReportCache(uid, analysisDate, { report: reportVal });
      } else if (!reportVal) {
        setReport(null);
      }
      if (allSnap.status === 'fulfilled' && allSnap.value?.exists?.()) {
        applyRecentScores(allSnap.value.val());
      }
      setCacheHydrated(true);
    });

    const unsubReport = onValue(reportRef, (snap) => {
      if (cancelled) return;
      const val = snap.val();
      if (val && typeof val === 'object') {
        setReport(val);
        setStatus('ready');
        setErrorMessage(null);
        writeHealthReportCache(uid, analysisDate, { report: val });
      } else {
        setReport(null);
      }
      setCacheHydrated(true);
    });

    const unsubAll = onValue(allReportsRef, (snap) => {
      if (cancelled) return;
      applyRecentScores(snap.val());
    });

    return () => {
      cancelled = true;
      unsubReport();
      unsubAll();
    };
  }, [enabled, db, uid, analysisDate]);

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
    cacheHydrated,
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
