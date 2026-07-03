import React, { useMemo } from 'react';
import MetabolicPhaseIcon from './MetabolicPhaseIcon';
import { formatMetabolicRelativeDuration } from '../features/salaComandi/utils/metabolicStateEngine';

/**
 * @param {number | null | undefined} hoursFraction
 * @returns {{ hours: number, minutes: number } | null}
 */
export function splitHoursToHoursMinutes(hoursFraction) {
  if (hoursFraction == null || !Number.isFinite(Number(hoursFraction))) return null;
  const totalMinutes = Math.max(0, Math.floor(Number(hoursFraction) * 60));
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

/**
 * @param {number | null | undefined} hoursFraction
 * @returns {string | null}
 */
export function formatHoursMinutesLabel(hoursFraction) {
  const parts = splitHoursToHoursMinutes(hoursFraction);
  if (!parts) return null;
  const { hours, minutes } = parts;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * @param {number | null | undefined} hoursSinceLastMeal
 * @returns {string}
 */
export function formatSinceLastMealLabel(hoursSinceLastMeal) {
  const label = formatHoursMinutesLabel(hoursSinceLastMeal);
  if (!label) return 'Nessun pasto registrato';
  return `${label} dall'ultimo pasto`;
}

/**
 * Card monitor metabolico — stile allineato a DayPlanWidget (tab Oggi).
 *
 * @param {{
 *   metabolicSnapshot: import('../features/salaComandi/utils/metabolicStateEngine').buildMetabolicSnapshot extends (...args: any[]) => infer R ? R : object | null | undefined,
 *   onClick?: () => void,
 * }} props
 */
export default function MetabolicMonitorCard({ metabolicSnapshot, onClick }) {
  const phase = metabolicSnapshot?.phase;
  if (!phase) return null;

  const isOverload = metabolicSnapshot?.isOverloadOverride || phase.id === 'sovraccarico';
  const hasMealLogged = metabolicSnapshot?.hasMealLogged !== false;
  const hoursSinceLastMeal = metabolicSnapshot?.hoursSinceLastMeal;
  const nextPhase = metabolicSnapshot?.nextPhase;
  const hoursUntilNext = metabolicSnapshot?.hoursUntilNext;

  const phaseLabel = useMemo(() => {
    if (isOverload) return phase.label;
    if (!hasMealLogged) return 'Nessun pasto loggato';
    return phase.label;
  }, [isOverload, hasMealLogged, phase.label]);

  const sinceLastMealLabel = useMemo(
    () => (hasMealLogged ? formatSinceLastMealLabel(hoursSinceLastMeal) : 'Registra un pasto per attivare il monitor'),
    [hasMealLogged, hoursSinceLastMeal],
  );

  const nextPhaseLabel = useMemo(() => {
    if (isOverload || !nextPhase) return null;
    const until = formatMetabolicRelativeDuration(hoursUntilNext);
    if (!until || until === '—') return null;
    return `→ ${nextPhase.label} tra ${until}`;
  }, [isOverload, nextPhase, hoursUntilNext]);

  const cardTone = isOverload
    ? 'border-red-500/40 bg-gradient-to-r from-red-950/70 via-slate-900/70 to-slate-900/50 shadow-red-900/20'
    : 'border-cyan-500/35 bg-gradient-to-r from-cyan-950/70 via-slate-800/60 to-orange-950/50 shadow-cyan-900/20';

  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <MetabolicPhaseIcon phase={phase} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-base font-bold leading-tight ${isOverload ? 'text-red-400' : ''}`}
            style={!isOverload ? { color: phase.iconColor ?? '#e2e8f0' } : undefined}
          >
            {phaseLabel}
          </p>
          <p className="text-xs font-medium leading-snug text-slate-400/90">{sinceLastMealLabel}</p>
        </div>
      </div>

      {nextPhaseLabel ? (
        <p className="mt-2 border-t border-slate-600/45 pt-2 text-[0.68rem] font-medium leading-snug text-slate-500">
          {nextPhaseLabel}
        </p>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`Monitor metabolico: ${phaseLabel}. Apri cruscotto.`}
        className={`mb-3 w-full rounded-xl border px-3 py-2.5 text-left shadow-lg backdrop-blur-sm transition-transform active:scale-[0.99] ${cardTone}`}
      >
        {body}
      </button>
    );
  }

  return (
    <article
      aria-label={`Monitor metabolico: ${phaseLabel}`}
      className={`mb-3 w-full rounded-xl border px-3 py-2.5 shadow-md backdrop-blur-sm ${cardTone}`}
    >
      {body}
    </article>
  );
}
