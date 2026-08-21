import React, { useMemo } from 'react';
import SaluteSleepGhostCard from '../trendHub/components/SaluteSleepGhostCard';
import SleepCoachCard from '../salaComandi/components/SleepCoachCard';
import { useSleepCoach } from '../salaComandi/hooks/useSleepCoach';
import { computeSleepEngineSnapshot } from '../../hooks/useSleepEngine';
import { computeTotali } from '../../useBiochimico';
import {
  buildSleepTrendChartData,
  buildUnifiedSleepSeries,
  computeGhostBaselineFromSeries,
  LONGEVITY_WINDOW_DAYS,
  resolveMorningSleepForInsight,
  SLEEP_GHOST_LOOKBACK_DAYS,
} from '../trendHub/utils/saluteHistorySeries';
import { GLASS_SURFACE_CLASS } from './glassStyles';

function GlassSpinner({ label = 'Sincronizzo i dati del sonno…' }) {
  return (
    <section
      className={`flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-busy
      aria-live="polite"
    >
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-indigo-300"
        aria-hidden
      />
      <p className="text-sm text-zinc-400">{label}</p>
    </section>
  );
}

function GlassNotice({ title, body }) {
  return (
    <section
      className={`flex min-h-[14rem] flex-col items-center justify-center gap-2 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-live="polite"
    >
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-400">{body}</p>
    </section>
  );
}

/**
 * Stanza Sonno — importa Ghost Card e Sleep Coach in sola lettura.
 * Non modifica SnapshotHub / SaluteView / trendHub / Sala Comandi.
 */
export default function SonnoRoom({ store }) {
  const {
    ready,
    isAuthenticated,
    todayDate,
    fullHistory,
    activeLog,
    userTargets,
    userProfile,
  } = store || {};

  const sleepEngineToday = useMemo(
    () => computeSleepEngineSnapshot(activeLog),
    [activeLog],
  );

  const totali = useMemo(
    () => computeTotali(Array.isArray(activeLog) ? activeLog : []),
    [activeLog],
  );

  const morningSleep = useMemo(
    () => resolveMorningSleepForInsight(null, {
      todayDate,
      fullHistory,
      activeLog,
      todayLog: activeLog,
      activeLogIsToday: true,
    }),
    [todayDate, fullHistory, activeLog],
  );

  const sleepSeries = useMemo(
    () => buildUnifiedSleepSeries({
      fullHistory,
      todayDate,
      lookbackDays: Math.max(SLEEP_GHOST_LOOKBACK_DAYS, LONGEVITY_WINDOW_DAYS),
      todayLiveLog: activeLog,
    }),
    [fullHistory, todayDate, activeLog],
  );

  const ghostBaseline = useMemo(
    () => computeGhostBaselineFromSeries(sleepSeries, todayDate, undefined, {
      maxSampleDays: SLEEP_GHOST_LOOKBACK_DAYS,
    }),
    [sleepSeries, todayDate],
  );

  const sleepTrend14d = useMemo(
    () => buildSleepTrendChartData({
      sleepSeries,
      todayDate,
      days: LONGEVITY_WINDOW_DAYS,
    }),
    [sleepSeries, todayDate],
  );

  const tonightHours = useMemo(() => {
    if (sleepEngineToday.totalSleepHours > 0) {
      return Math.round(sleepEngineToday.totalSleepHours * 100) / 100;
    }
    if (morningSleep?.hours != null) return morningSleep.hours;
    return null;
  }, [morningSleep, sleepEngineToday]);

  const ghostLabel = ghostBaseline.sampleSize > 0 ? 'Media 7g' : 'Target';

  const sleepCoachData = useSleepCoach({
    activeLog,
    totali,
    dynamicDailyKcal: userTargets?.kcal,
    userProfile,
  });

  if (!ready) {
    return <GlassSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <GlassNotice
        title="Dati non disponibili"
        body="Accedi da KentuOS per leggere diario e profilo in sola lettura."
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <SaluteSleepGhostCard
        hours={tonightHours}
        quality={morningSleep?.quality ?? null}
        ghostHours={ghostBaseline.ghostHours}
        ghostLabel={ghostLabel}
        sleepData={sleepTrend14d.sleepData}
        avg14Days={sleepTrend14d.avg14Days}
      />
      <SleepCoachCard data={sleepCoachData} />
    </div>
  );
}
