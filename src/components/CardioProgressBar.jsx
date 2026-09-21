import { useEffect, useMemo, useState } from 'react';
import {
  calculateCardioStatus,
  buildCardioDetailsBreakdown,
  CARDIO_WEEKLY_TARGET_MINUTES,
} from '../features/commandTerminal/context/cardioCylinderStatus.js';
import { collectRecentWorkoutLogs } from '../features/commandTerminal/context/kentuGlobalState.js';
import { getTodayString } from '../coreEngine';
import CardioDetailsModal from './CardioDetailsModal';
import CardioWidget, { splitCardioIntensity } from './CardioWidget';

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
 * Monitoraggio Cardio (7g rolling) — widget glass + estratto conto al tap.
 *
 * @param {{
 *   fullHistory?: object | null,
 *   activeLog?: Array | null,
 *   activeDate?: string | null,
 *   cardioStatus?: object | null,
 *   className?: string,
 *   compact?: boolean,
 *   dense?: boolean,
 *   unifiedBars?: boolean,
 *   onActivate?: (() => void) | null,
 * }} props
 */
export default function CardioProgressBar({
  fullHistory = null,
  activeLog = null,
  activeDate = null,
  cardioStatus: cardioStatusProp = null,
  className = '',
  compact = false,
  dense = false,
  unifiedBars = false,
  onActivate = null,
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
  const remaining = Math.max(
    0,
    Math.round(Number(status.remainingMinutes) ?? (target - accumulated)),
  );
  const fillPercent = Math.max(
    0,
    Math.min(100, Math.round(Number(status.fillPercent) ?? (accumulated / target) * 100)),
  );
  const intensity = splitCardioIntensity(breakdown);

  const openDetails = () => {
    if (typeof onActivate === 'function') {
      onActivate();
      return;
    }
    setDetailsOpen(true);
  };

  return (
    <>
      <div
        className={`w-full cursor-pointer transition-transform duration-200 active:scale-[0.99] ${className}`.trim()}
        aria-label={`Monitoraggio cardio 7 giorni: ${accumulated} su ${target} minuti, ${remaining} al target. Tocca per l'estratto conto.`}
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
        <CardioWidget
          fillPercent={fillPercent}
          accumulatedMinutes={accumulated}
          weeklyTargetMinutes={target}
          remainingMinutes={remaining}
          moderateMinutes={intensity.moderateMinutes}
          highMinutes={intensity.highMinutes}
          sessionCount={intensity.sessionCount}
          compact={compact || dense || unifiedBars}
          className="transition-colors hover:border-cyan-400/40 hover:bg-slate-900/70"
        />
      </div>

      <CardioDetailsModal
        isOpen={typeof onActivate === 'function' ? false : detailsOpen}
        onClose={() => setDetailsOpen(false)}
        breakdown={breakdown}
      />
    </>
  );
}
