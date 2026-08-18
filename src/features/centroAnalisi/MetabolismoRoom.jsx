import React, { useMemo } from 'react';
import MetabolicMonitorCard from '../../components/MetabolicMonitorCard';
import SaluteLongevityHero from '../trendHub/components/SaluteLongevityHero';
import useMetabolicPhaseState from '../salaComandi/hooks/useMetabolicPhaseState';
import { calculateHealthScore, getHealthAvatar } from '../health/HealthScoreEngine';
import { calculateLongevityScore } from '../trendHub/utils/saluteDashboardMetrics';
import {
  buildSaluteLongevityWindow,
  LONGEVITY_WINDOW_DAYS,
  REFERENCE_HEIGHT_CM,
} from '../trendHub/utils/saluteHistorySeries';
import { computeSleepEngineSnapshot } from '../../hooks/useSleepEngine';
import { computeTotali } from '../../useBiochimico';
import { GLASS_SURFACE_CLASS } from './glassStyles';

function GlassSpinner({ label = 'Sincronizzo i dati metabolici…' }) {
  return (
    <section
      className={`flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-busy
      aria-live="polite"
    >
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-cyan-300"
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

function HealthScoreGlassCard({ healthScore }) {
  const score = Number(healthScore?.score);
  const avatar = healthScore?.avatar || (Number.isFinite(score) ? getHealthAvatar(score) : null);
  if (!Number.isFinite(score) || !avatar) return null;

  return (
    <section className={`flex items-center gap-4 rounded-2xl px-4 py-4 ${GLASS_SURFACE_CLASS}`}>
      <img
        src={avatar.src}
        alt=""
        className="h-16 w-16 shrink-0 object-contain"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Health Score
        </p>
        <p className="text-2xl font-semibold tabular-nums text-zinc-50">
          {Math.round(score)}
          <span className="text-sm font-medium text-zinc-500"> / 100</span>
        </p>
        <p className="text-sm text-zinc-400">{avatar.label}</p>
      </div>
    </section>
  );
}

/**
 * Stanza Metabolismo — importa Monitor e Longevità in sola lettura.
 * Non modifica SnapshotHub / SaluteView / trendHub.
 */
export default function MetabolismoRoom({ store }) {
  const {
    ready,
    isAuthenticated,
    todayDate,
    fullHistory,
    activeLog,
    userTargets,
    userProfile,
    bodyMetricsHistory,
  } = store || {};

  const metabolicSnapshot = useMetabolicPhaseState(
    fullHistory,
    activeLog,
    todayDate,
  );

  const sleepSnapshot = useMemo(
    () => computeSleepEngineSnapshot(activeLog),
    [activeLog],
  );

  const totali = useMemo(
    () => computeTotali(Array.isArray(activeLog) ? activeLog : []),
    [activeLog],
  );

  const healthScore = useMemo(() => {
    const proteinTarget = Number(userTargets?.prot) || 0;
    const carbTarget = Number(userTargets?.carb) || 0;
    const tdee = Math.round(Number(userTargets?.kcal) || 0);
    const isTrainingDay = (Array.isArray(activeLog) ? activeLog : [])
      .some((entry) => entry?.type === 'workout' && entry?.isGhost !== true);
    return calculateHealthScore(
      {
        proteinConsumed: Number(totali?.prot) || 0,
        proteinTarget,
        kcalConsumed: Number(totali?.kcal) || 0,
        tdeeKcal: tdee,
        dailyKcalTarget: tdee,
        carbConsumed: Number(totali?.carb) || 0,
        carbTarget,
        hoursFasted: Number(metabolicSnapshot?.hoursSinceLastMeal) || null,
        metabolicPhaseId: metabolicSnapshot?.phase?.id ?? null,
        metabolicProgressInPhase: metabolicSnapshot?.progressInPhase ?? null,
        currentHour: new Date().getHours(),
      },
      isTrainingDay,
    );
  }, [userTargets, totali, metabolicSnapshot, activeLog]);

  const longevityResult = useMemo(() => {
    const heightCm = Number(userProfile?.height ?? userProfile?.heightCm) > 0
      ? Number(userProfile.height ?? userProfile.heightCm)
      : REFERENCE_HEIGHT_CM;
    const window = buildSaluteLongevityWindow({
      fullHistory,
      bodyMetricsHistory,
      todayDate,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog: activeLog,
    });
    return calculateLongevityScore({
      cardioMinutesTotal: window.cardioMinutesTotal,
      uniqueMuscleGroups: window.uniqueMuscleGroups,
      muscleStimulusPillars: window.muscleStimulusPillars,
      pesiSessionCount: window.pesiSessionCount,
      sleepAvgHours: window.sleepAvgHours,
      waistCm: window.waistCm,
      daysSampled: window.daysSampled,
      sleepNights: window.sleepNights,
      cardioDays: window.cardioDays,
      pesiDays: window.pesiDays,
      heightCm,
      windowDays: LONGEVITY_WINDOW_DAYS,
    });
  }, [fullHistory, bodyMetricsHistory, todayDate, activeLog, userProfile]);

  if (!ready) {
    return <GlassSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <GlassNotice
        title="Dati non disponibili"
        body="Accedi da KentuOS per leggere diario, target e cilindri in sola lettura."
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <MetabolicMonitorCard
        metabolicSnapshot={metabolicSnapshot}
        missingSleepData={!sleepSnapshot.hasSleepData}
      />
      <HealthScoreGlassCard healthScore={healthScore} />
      <div className={`flex flex-col items-center rounded-2xl px-3 py-5 ${GLASS_SURFACE_CLASS}`}>
        <SaluteLongevityHero
          score={longevityResult.finalScore}
          breakdown={longevityResult.breakdown}
          size={188}
        />
      </div>
    </div>
  );
}
