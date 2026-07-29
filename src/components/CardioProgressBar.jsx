import { useMemo } from 'react';
import {
  calculateCardioStatus,
  CARDIO_WEEKLY_TARGET_MINUTES,
} from '../features/commandTerminal/context/cardioCylinderStatus.js';
import { collectRecentWorkoutLogs } from '../features/commandTerminal/context/kentuGlobalState.js';

/**
 * Barra di progressione Cardio — stile fluido allineato a MuscleStimulusWidget.
 *
 * @param {{
 *   fullHistory?: object | null,
 *   activeLog?: Array | null,
 *   activeDate?: string | null,
 *   cardioStatus?: object | null,
 *   className?: string,
 *   compact?: boolean,
 * }} props
 */
export default function CardioProgressBar({
  fullHistory = null,
  activeLog = null,
  activeDate = null,
  cardioStatus: cardioStatusProp = null,
  className = '',
  compact = false,
} = {}) {
  const status = useMemo(() => {
    if (cardioStatusProp && typeof cardioStatusProp === 'object') {
      return cardioStatusProp;
    }
    try {
      const { cardioLogs, workoutLogs } = collectRecentWorkoutLogs(
        fullHistory || {},
        Array.isArray(activeLog) ? activeLog : [],
        activeDate || '',
      );
      return calculateCardioStatus(cardioLogs, workoutLogs);
    } catch (error) {
      console.warn('[CardioProgressBar] calculate failed', error);
      return {
        accumulatedMinutes: 0,
        weeklyTargetMinutes: CARDIO_WEEKLY_TARGET_MINUTES,
        fillPercent: 0,
      };
    }
  }, [cardioStatusProp, fullHistory, activeLog, activeDate]);

  const accumulated = Math.round(Number(status.accumulatedMinutes) || 0);
  const target = Math.max(
    1,
    Math.round(Number(status.weeklyTargetMinutes) || CARDIO_WEEKLY_TARGET_MINUTES),
  );
  const fillPercent = Math.max(
    0,
    Math.min(100, Math.round(Number(status.fillPercent) ?? (accumulated / target) * 100)),
  );

  return (
    <div
      className={`w-full ${className}`.trim()}
      aria-label={`Cardio 7 giorni: ${accumulated} su ${target} minuti`}
      role="group"
    >
      <div
        className={`rounded-xl border border-blue-500/35 bg-slate-900/80 shadow-lg backdrop-blur-sm ${
          compact ? 'p-2.5' : 'p-3'
        }`}
      >
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold tracking-wider text-cyan-400">
            CARDIO (7G)
          </span>
          <span className="text-[11px] font-bold tabular-nums text-slate-200">
            {accumulated}
            <span className="font-semibold text-slate-500"> / {target} min</span>
          </span>
        </div>

        {/* Track + fluido: stessa logica dei cilindri (fill + overlay a tacche) */}
        <div className="relative h-5 w-full overflow-hidden rounded bg-slate-950 ring-1 ring-white/10">
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 transition-all duration-1000 ease-out"
            style={{
              width: `${fillPercent}%`,
              boxShadow:
                fillPercent > 0
                  ? '0 0 14px rgba(56, 189, 248, 0.55), inset 0 1px 0 rgba(255,255,255,0.25)'
                  : 'none',
            }}
          />
          {/* Shimmer fluido vivo */}
          {fillPercent > 0 ? (
            <div
              className="pointer-events-none absolute left-0 top-0 h-full overflow-hidden"
              style={{ width: `${fillPercent}%` }}
              aria-hidden
            >
              <div
                className="h-full w-1/3 opacity-40"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)',
                  animation: 'cardioFluidShimmer 2.8s ease-in-out infinite',
                }}
              />
            </div>
          ) : null}
          <div
            className="absolute inset-0 opacity-25 mix-blend-overlay"
            style={{
              backgroundImage:
                'repeating-linear-gradient(to right, transparent, transparent 3px, #000 3px, #000 4px)',
            }}
          />
        </div>

        {!compact ? (
          <p className="mt-1.5 text-[10px] text-slate-500">
            Include spillover pesi (30%) · {fillPercent}%
          </p>
        ) : null}
      </div>

      <style>{`
        @keyframes cardioFluidShimmer {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
      `}</style>
    </div>
  );
}
