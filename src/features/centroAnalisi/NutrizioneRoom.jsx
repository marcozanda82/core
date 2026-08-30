import React, { useMemo } from 'react';
import MacroPlateVisualizer from '../nutrition/MacroPlateVisualizer';
import { computeTotali } from '../../useBiochimico';
import { computeAdherence } from '../../adherenceEngine';
import { calculateProgressionScore } from '../trendHub/utils/saluteDashboardMetrics';
import {
  buildProgressionLogsWindow,
  LONGEVITY_WINDOW_DAYS,
} from '../trendHub/utils/saluteHistorySeries';
import {
  buildWeeklyBubbleSnapshot,
  deriveWeeklyBalanceStatus,
} from '../energyBalance/buildWeeklyBubbleSnapshot';
import { createEmptyWeeklyBlockPlan, getWeekDateKeysLocal } from '../weeklyBlocks/weeklyBlockSchema';
import { getWeekStartMondayKeyLocal } from '../../weeklyPlanning';
import { GLASS_SURFACE_CLASS } from './glassStyles';

function GlassSpinner({ label = 'Sincronizzo i dati nutrizionali…' }) {
  return (
    <section
      className={`flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-busy
      aria-live="polite"
    >
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-amber-300"
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

function KpiCard({ label, value, unit, hint, tone = 'neutral' }) {
  const toneClass = tone === 'high'
    ? 'text-rose-300'
    : tone === 'low'
      ? 'text-emerald-300'
      : 'text-cyan-200';

  return (
    <article className={`rounded-2xl px-3 py-3 ${GLASS_SURFACE_CLASS}`}>
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
        {unit ? (
          <span className="ml-1 text-sm font-medium text-zinc-500">{unit}</span>
        ) : null}
      </p>
      {hint ? (
        <p className="mt-1 text-[11px] leading-snug text-zinc-500">{hint}</p>
      ) : null}
    </article>
  );
}

function roundOrDash(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
}

function proteinAdherencePct(avgProt, targetProt) {
  const avg = Number(avgProt);
  const tgt = Number(targetProt);
  if (!Number.isFinite(avg) || !Number.isFinite(tgt) || tgt <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((avg / tgt) * 100)));
}

/**
 * Stanza Nutrizione — medie macro, aderenza e bilancio settimanale in sola lettura.
 * Nessun form di inserimento pasti.
 */
export default function NutrizioneRoom({ store }) {
  const {
    ready,
    isAuthenticated,
    activeLog,
    fullHistory,
    userTargets,
    todayDate,
    fourCylinder,
  } = store || {};

  const todayTotals = useMemo(
    () => computeTotali(Array.isArray(activeLog) ? activeLog : []),
    [activeLog],
  );

  const windowLogs = useMemo(
    () => buildProgressionLogsWindow({
      fullHistory,
      todayDate,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog: activeLog,
    }),
    [fullHistory, todayDate, activeLog],
  );

  const nutritionDays = useMemo(
    () => (Array.isArray(windowLogs.days) ? windowLogs.days : []).filter((d) => d?.hasNutrition),
    [windowLogs],
  );

  const averages = useMemo(() => {
    if (nutritionDays.length === 0) {
      return { kcal: null, prot: null, carb: null, fat: null, days: 0 };
    }
    const n = nutritionDays.length;
    const sum = nutritionDays.reduce(
      (acc, day) => ({
        kcal: acc.kcal + (Number(day.kcal) || 0),
        prot: acc.prot + (Number(day.prot) || 0),
        carb: acc.carb + (Number(day.carb) || 0),
        fat: acc.fat + (Number(day.fat) || 0),
      }),
      { kcal: 0, prot: 0, carb: 0, fat: 0 },
    );
    return {
      kcal: sum.kcal / n,
      prot: sum.prot / n,
      carb: sum.carb / n,
      fat: sum.fat / n,
      days: n,
    };
  }, [nutritionDays]);

  const progression = useMemo(
    () => calculateProgressionScore(
      {
        days: windowLogs.days,
        todayDate: windowLogs.todayDate,
        sleepAvgHours: windowLogs.sleepAvgHours,
        workoutSessionsTotal: windowLogs.workoutSessionsTotal,
      },
      userTargets || {},
      {
        fourCylinder,
        fullHistory,
        activeLog,
        activeDate: todayDate,
      },
    ),
    [windowLogs, userTargets, fourCylinder, fullHistory, activeLog, todayDate],
  );

  const adherence = useMemo(() => {
    const dailyCalories = nutritionDays
      .slice()
      .reverse()
      .map((d) => Number(d.kcal) || 0);
    return computeAdherence({
      daily_calories: dailyCalories,
      calorie_target: Number(userTargets?.kcal) || 0,
      days_logged: nutritionDays.length,
      total_days: LONGEVITY_WINDOW_DAYS,
    });
  }, [nutritionDays, userTargets]);

  const weeklyBubble = useMemo(() => {
    const weekStart = getWeekStartMondayKeyLocal(todayDate);
    const weekDateKeys = getWeekDateKeysLocal(weekStart);
    return buildWeeklyBubbleSnapshot({
      fullHistory,
      weeklyBlockPlan: createEmptyWeeklyBlockPlan(weekStart),
      profileKcal: Number(userTargets?.kcal) || 2000,
      weekDateKeys,
      includeToday: true,
      todayDate,
    });
  }, [fullHistory, userTargets, todayDate]);

  const weekStatus = deriveWeeklyBalanceStatus(
    weeklyBubble.weekBalance,
    weeklyBubble.bubbleTilt,
  );

  const protPct = proteinAdherencePct(averages.prot, userTargets?.prot);
  const kcalTarget = Number(userTargets?.kcal) || 0;
  const todayKcal = Number(todayTotals?.kcal) || 0;

  const plateMacros = {
    pro: Number(todayTotals?.prot) || 0,
    carbo: Number(todayTotals?.carb) || 0,
    fat: Number(todayTotals?.fatTotal ?? todayTotals?.fat) || 0,
    fiber: Number(todayTotals?.fiber) || 0,
  };
  const plateTargets = {
    pro: Number(userTargets?.prot) || 0,
    carbo: Number(userTargets?.carb) || 0,
    fat: Number(userTargets?.fat) || 0,
    fiber: Number(userTargets?.fiber) || 15,
  };

  if (!ready) {
    return <GlassSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <GlassNotice
        title="Dati non disponibili"
        body="Accedi da KentuOS per leggere medie caloriche e aderenza nutrizionale in sola lettura."
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5">
        <KpiCard
          label="Oggi · kcal"
          value={roundOrDash(todayKcal)}
          unit={kcalTarget > 0 ? `/ ${Math.round(kcalTarget)}` : ''}
          hint="Diario di oggi vs target"
        />
        <KpiCard
          label="Aderenza 14g"
          value={adherence.adherence_score != null
            ? Math.round(adherence.adherence_score * 100)
            : roundOrDash(progression.breakdown?.nutritionScore)}
          unit="%"
          hint={`Score nutrizione ${roundOrDash(progression.breakdown?.nutritionScore)} · ${adherence.adherence_level}`}
          tone={adherence.adherence_level === 'low' ? 'high' : adherence.adherence_level === 'high' ? 'low' : 'neutral'}
        />
      </div>

      <section
        className={`overflow-hidden rounded-2xl px-2 py-2 ${GLASS_SURFACE_CLASS}`}
        aria-label="Piatto macro di oggi"
      >
        <p className="px-2 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Piatto di oggi · vs target
        </p>
        <MacroPlateVisualizer mealMacros={plateMacros} targetMacros={plateTargets} />
      </section>

      <section
        className={`flex flex-col gap-3 rounded-2xl px-4 py-4 ${GLASS_SURFACE_CLASS}`}
        aria-label="Medie macronutrienti"
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Medie · {averages.days} giorni con pasti (14g)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard label="kcal/g" value={roundOrDash(averages.kcal)} hint={`Target ${roundOrDash(kcalTarget)}`} />
          <KpiCard
            label="Proteine"
            value={roundOrDash(averages.prot)}
            unit="g"
            hint={protPct != null ? `${protPct}% del target` : 'Target n/d'}
            tone={protPct != null && protPct < 80 ? 'high' : protPct != null && protPct >= 95 ? 'low' : 'neutral'}
          />
          <KpiCard label="Carboidrati" value={roundOrDash(averages.carb)} unit="g" />
          <KpiCard label="Grassi" value={roundOrDash(averages.fat)} unit="g" />
        </div>
      </section>

      <section
        className={`rounded-2xl px-4 py-4 ${GLASS_SURFACE_CLASS}`}
        aria-label="Bilancio energetico settimanale"
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Bilancio settimana
        </p>
        <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-50">
          {weeklyBubble.weekBalance > 0 ? '+' : ''}
          {Math.round(weeklyBubble.weekBalance || 0)}
          <span className="ml-1 text-sm font-medium text-zinc-500">kcal</span>
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          {weekStatus === 'inline'
            ? 'In asse'
            : weekStatus === 'surplus'
              ? 'Surplus'
              : 'Deficit'}
          {' · '}
          intake {Math.round(weeklyBubble.weekIntake || 0)} / target {Math.round(weeklyBubble.weekTarget || 0)}
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {weeklyBubble.daysWithLog} giorni con diario su {weeklyBubble.daysAnalyzed} analizzati
        </p>
      </section>
    </div>
  );
}
