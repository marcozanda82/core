import { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { resolveClinicalInsightMarkdown } from '../../trendHub/components/SaluteClinicalInsight';

/**
 * Lettura sola dei referti `health_reports` già persistiti.
 * Non genera Gemini e non chiama `useHealthDailyReport`.
 */
export function useSaluteHealthReportRead({
  db = null,
  uid = null,
  enabled = false,
} = {}) {
  const [reportsByDate, setReportsByDate] = useState({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!enabled || !db || !uid) return undefined;

    let cancelled = false;
    const reportsRef = ref(db, `users/${uid}/health_reports`);
    const unsub = onValue(reportsRef, (snap) => {
      if (cancelled) return;
      const val = snap.exists() ? snap.val() : {};
      setReportsByDate(val && typeof val === 'object' ? val : {});
      setHydrated(true);
    }, () => {
      if (cancelled) return;
      setReportsByDate({});
      setHydrated(true);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [enabled, db, uid]);

  return useMemo(() => {
    if (!enabled) {
      return {
        hydrated: false,
        latestReport: null,
        latestDate: null,
        bulletinMarkdown: '',
        reportVote: null,
        history: [],
      };
    }

    const entries = Object.entries(reportsByDate)
      .filter(([, report]) => report && typeof report === 'object')
      .map(([date, report]) => ({
        date: String(report.date || date).slice(0, 10),
        dailyScore: Number.isFinite(Number(report.dailyScore))
          ? Math.round(Number(report.dailyScore))
          : null,
        report,
      }))
      .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date))
      .sort((a, b) => b.date.localeCompare(a.date));

    const latest = entries[0] || null;
    const latestReport = latest?.report || null;

    return {
      hydrated,
      latestReport,
      latestDate: latest?.date || null,
      bulletinMarkdown: resolveClinicalInsightMarkdown(latestReport),
      reportVote: latest?.dailyScore ?? null,
      history: entries.slice(0, 8).map((row) => ({
        date: row.date,
        reportVote: row.dailyScore,
      })),
    };
  }, [enabled, reportsByDate, hydrated]);
}

export default useSaluteHealthReportRead;
