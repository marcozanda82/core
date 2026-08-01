import { useEffect, useMemo, useState } from 'react';
import {
  calculateCardioStatus,
  buildCardioDetailsBreakdown,
  CARDIO_WEEKLY_TARGET_MINUTES,
} from '../features/commandTerminal/context/cardioCylinderStatus.js';
import { collectRecentWorkoutLogs } from '../features/commandTerminal/context/kentuGlobalState.js';
import { getTodayString } from '../coreEngine';
import CardioDetailsModal from './CardioDetailsModal';

/**
 * Chiave giorno locale YYYY-MM-DD — si aggiorna a mezzanotte (e al ritorno in foreground).
 * Evita che la finestra rolling 7g resti congelata mentre l'app resta aperta.
 */
function useLiveCalendarDayKey() {
  const [dayKey, setDayKey] = useState(() => getTodayString());

  useEffect(() => {
    const sync = () => {
      const next = getTodayString();
      setDayKey((prev) => (prev === next ? prev : next));
    };
    sync();
    const id = window.setInterval(sync, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', sync);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', sync);
    };
  }, []);

  return dayKey;
}

/**
 * Barra di progressione Cardio — stile fluido allineato a MuscleStimulusWidget.
 * Finestra: rolling 168h da Date.now() (non settimana solare).
 * Clic → estratto conto trasparente (CardioDetailsModal).
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
  const liveDayKey = useLiveCalendarDayKey();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const logPools = useMemo(() => {
    try {
      const todayIso = liveDayKey || getTodayString();
      const viewerDate = String(activeDate || '').slice(0, 10);
      const mergeActiveLog = !viewerDate || viewerDate === todayIso;
      return collectRecentWorkoutLogs(
        fullHistory || {},
        mergeActiveLog && Array.isArray(activeLog) ? activeLog : [],
        todayIso,
      );
    } catch (error) {
      console.warn('[CardioProgressBar] collect logs failed', error);
      return { cardioLogs: [], workoutLogs: [] };
    }
  }, [fullHistory, activeLog, activeDate, liveDayKey]);

  const status = useMemo(() => {
    if (cardioStatusProp && typeof cardioStatusProp === 'object') {
      return cardioStatusProp;
    }
    try {
      return calculateCardioStatus(logPools.cardioLogs, logPools.workoutLogs, {
        nowMs: Date.now(),
      });
    } catch (error) {
      console.warn('[CardioProgressBar] calculate failed', error);
      return {
        accumulatedMinutes: 0,
        weeklyTargetMinutes: CARDIO_WEEKLY_TARGET_MINUTES,
        fillPercent: 0,
      };
    }
  }, [cardioStatusProp, logPools]);

  const breakdown = useMemo(() => {
    try {
      return buildCardioDetailsBreakdown(logPools.cardioLogs, logPools.workoutLogs, {
        nowMs: Date.now(),
      });
    } catch (error) {
      console.warn('[CardioProgressBar] breakdown failed', error);
      return null;
    }
  }, [logPools]);

  const accumulated = Math.round(Number(status.accumulatedMinutes) || 0);
  const target = Math.max(
    1,
    Math.round(Number(status.weeklyTargetMinutes) || CARDIO_WEEKLY_TARGET_MINUTES),
  );
  const fillPercent = Math.max(
    0,
    Math.min(100, Math.round(Number(status.fillPercent) ?? (accumulated / target) * 100)),
  );

  const openDetails = () => setDetailsOpen(true);

  return (
    <>
      <div
        className={`w-full ${className}`.trim()}
        aria-label={`Cardio 7 giorni: ${accumulated} su ${target} minuti. Tocca per l'estratto conto.`}
        role="button"
        tabIndex={0}
        onClick={openDetails}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDetails();
          }
        }}
      >
        <div
          className={[
            'cardio-progress-bar-hit rounded-xl border border-blue-500/35 bg-slate-900/80 shadow-lg backdrop-blur-sm',
            'cursor-pointer transition-all duration-200',
            'hover:border-cyan-400/55 hover:bg-slate-900/95 hover:shadow-[0_0_20px_rgba(34,211,238,0.22)]',
            'active:scale-[0.99]',
            compact ? 'p-2.5' : 'p-3',
          ].join(' ')}
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
              Include spillover pesi (30%) · {fillPercent}% · tocca per i dettagli
            </p>
          ) : (
            <p className="mt-1.5 text-[9px] text-slate-600">Tocca per l&apos;estratto conto</p>
          )}
        </div>

        <style>{`
          @keyframes cardioFluidShimmer {
            0% { transform: translateX(-120%); }
            100% { transform: translateX(320%); }
          }
        `}</style>
      </div>

      <CardioDetailsModal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        breakdown={breakdown}
      />
    </>
  );
}
