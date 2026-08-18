import React, { useMemo } from 'react';
import MetabolicDiagnostics from '../../MetabolicDiagnostics';
import { calculateBodyBattery, computeAccumuloSNC } from '../../coreEngine';
import { GLASS_SURFACE_CLASS } from './glassStyles';

function GlassSpinner({ label = 'Sincronizzo i dati di recupero…' }) {
  return (
    <section
      className={`flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-busy
      aria-live="polite"
    >
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-violet-300"
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

function RecoveryKpiCard({ label, value, unit, hint, tone = 'neutral' }) {
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

/**
 * Stanza Recupero — cilindri muscolari, SNC, debito sonno (MetabolicDiagnostics read-only).
 * Body Battery e accumulo SNC da coreEngine in sola lettura.
 */
export default function RecuperoRoom({ store }) {
  const {
    ready,
    isAuthenticated,
    fourCylinder,
    activeLog,
    fullHistory,
    userTargets,
    todayDate,
  } = store || {};

  const bodyBattery = useMemo(
    () => calculateBodyBattery(fullHistory, todayDate, activeLog, userTargets),
    [fullHistory, todayDate, activeLog, userTargets],
  );

  const sncAccumulo = useMemo(
    () => computeAccumuloSNC(fullHistory, 60),
    [fullHistory],
  );

  const sncTone = sncAccumulo >= 70 ? 'high' : sncAccumulo <= 35 ? 'low' : 'neutral';
  const batteryPct = bodyBattery?.maxCapacity > 0
    ? Math.round((Number(bodyBattery.currentEnergy) / Number(bodyBattery.maxCapacity)) * 100)
    : null;

  if (!ready) {
    return <GlassSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <GlassNotice
        title="Dati non disponibili"
        body="Accedi da KentuOS per leggere cilindri, SNC e recupero in sola lettura."
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-2.5">
        <RecoveryKpiCard
          label="Body Battery"
          value={batteryPct != null ? batteryPct : '—'}
          unit={batteryPct != null ? '%' : ''}
          hint={
            bodyBattery?.maxCapacity != null && bodyBattery.maxCapacity < 100
              ? `Capacità max ${bodyBattery.maxCapacity}% (debito sonno)`
              : 'Energia disponibile stimata'
          }
          tone={batteryPct != null && batteryPct < 40 ? 'high' : batteryPct != null && batteryPct > 70 ? 'low' : 'neutral'}
        />
        <RecoveryKpiCard
          label="Accumulo SNC"
          value={Math.round(sncAccumulo)}
          unit="/ 100"
          hint="Carico allostatico · finestra 60g"
          tone={sncTone}
        />
      </div>

      <section
        className={`overflow-hidden rounded-2xl ${GLASS_SURFACE_CLASS}`}
        aria-label="Diagnostica recupero muscolare"
      >
        <MetabolicDiagnostics
          fourCylinder={fourCylinder}
          fullHistory={fullHistory}
          dailyLog={activeLog}
          activeDate={todayDate}
          proteinTarget={userTargets?.prot ?? null}
          userTargets={userTargets}
          onApplyGhostSimGoal={null}
          onConfirmCompensation={null}
          onClearCompensation={null}
        />
      </section>
    </div>
  );
}
