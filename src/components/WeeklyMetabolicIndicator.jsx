import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useWeeklyEnergyBalance from '../hooks/useWeeklyEnergyBalance';
import {
  WEEKLY_BUBBLE_INLINE_THRESHOLD_KCAL,
  WEEKLY_BUBBLE_TILT_REFERENCE_KCAL,
} from '../features/energyBalance/buildWeeklyBubbleSnapshot';

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

/** Larghezza visiva zona neutra sulla livella (derivata da soglia inline / riferimento tilt). */
const DEAD_BAND_VISUAL_HALF_PCT =
  (WEEKLY_BUBBLE_INLINE_THRESHOLD_KCAL / WEEKLY_BUBBLE_TILT_REFERENCE_KCAL) * 40;

const STATUS_SPIA_CLASS = {
  inline: 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.55)]',
  surplus: 'bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)] animate-pulse',
  deficit: 'bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)] animate-pulse',
};

const STATUS_BUBBLE_CLASS = {
  inline: 'bg-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.85)]',
  surplus: 'bg-orange-300 shadow-[0_0_16px_rgba(253,186,116,0.85)]',
  deficit: 'bg-purple-300 shadow-[0_0_16px_rgba(216,180,254,0.85)]',
};

const STATUS_MESSAGE = {
  inline: 'Bilancio in asse',
  surplus: 'Surplus non pianificato',
  deficit: 'Deficit eccessivo',
};

/**
 * Formatta il bilancio settimanale per la UI.
 * @param {number} weekBalance
 * @returns {string}
 */
function formatWeekBalance(weekBalance) {
  const n = Math.round(Number(weekBalance) || 0);
  if (n === 0) return '± 0 kcal';
  if (n > 0) return `+ ${n} kcal`;
  return `− ${Math.abs(n)} kcal`;
}

/**
 * Spia compatta + modale Livella a Bolla (Progressive Disclosure).
 *
 * Inserimento esempio in SalaComandi / Navbar:
 * ```jsx
 * <WeeklyMetabolicIndicator
 *   db={db}
 *   user={user}
 *   fullHistory={fullHistory}
 *   userTargets={userTargets}
 *   currentTrackerDate={currentTrackerDate}
 *   isSimulationMode={isSimulationMode}
 *   getTodayString={getTodayString}
 * />
 * ```
 *
 * @param {object} props
 * @param {import('firebase/database').Database | null | undefined} props.db
 * @param {{ uid?: string } | null | undefined} props.user
 * @param {Record<string, unknown>} [props.fullHistory]
 * @param {{ kcal?: number } | null | undefined} [props.userTargets]
 * @param {string | null | undefined} [props.currentTrackerDate]
 * @param {boolean} [props.isSimulationMode]
 * @param {() => string} [props.getTodayString]
 * @param {string} [props.className]
 */
export default function WeeklyMetabolicIndicator({
  db,
  user,
  fullHistory,
  userTargets,
  currentTrackerDate,
  isSimulationMode = false,
  getTodayString,
  className = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const closeBtnRef = useRef(null);

  const {
    weekBalance,
    weekTarget,
    weekIntake,
    bubbleTilt,
    status,
    daysAnalyzed,
    daysWithLog,
    weekStart,
    isLoading,
  } = useWeeklyEnergyBalance({
    db,
    user,
    fullHistory,
    userTargets,
    currentTrackerDate,
    isSimulationMode,
    getTodayString,
  });

  const safeStatus = status === 'surplus' || status === 'deficit' ? status : 'inline';
  const clampedTilt = Math.max(-1, Math.min(1, Number(bubbleTilt) || 0));

  const bubbleLeft = useMemo(
    () => `calc(50% + ${clampedTilt * 40}% - 0.75rem)`,
    [clampedTilt]
  );

  const deadBandLeft = 50 - DEAD_BAND_VISUAL_HALF_PCT;
  const deadBandWidth = DEAD_BAND_VISUAL_HALF_PCT * 2;

  const openModal = useCallback(() => setIsOpen(true), []);
  const closeModal = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, closeModal]);

  useEffect(() => {
    if (isOpen && closeBtnRef.current) {
      closeBtnRef.current.focus();
    }
  }, [isOpen]);

  const onBackdropMouseDown = (e) => {
    if (e.target === e.currentTarget) closeModal();
  };

  const onSpiaKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal();
    }
  };

  if (isLoading) {
    return (
      <span
        className={`inline-flex h-3 w-3 shrink-0 rounded-full bg-slate-700 animate-pulse ${className}`.trim()}
        role="status"
        aria-label="Caricamento bilancio settimanale"
        aria-busy="true"
      />
    );
  }

  const modalPanel = isOpen ? (
    <div
      role="presentation"
      className="fixed inset-0 z-[100000] flex items-end justify-center bg-black/65 p-4 sm:items-center"
      onMouseDown={onBackdropMouseDown}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-metabolic-modal-title"
        className="relative w-full max-w-md rounded-2xl border border-slate-600/80 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-md"
        style={{ fontFamily: FONT }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          ref={closeBtnRef}
          type="button"
          aria-label="Chiudi"
          onClick={closeModal}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-lg text-slate-200 transition-colors hover:bg-slate-700"
        >
          ×
        </button>

        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Bilancio settimanale
        </p>
        <h2
          id="weekly-metabolic-modal-title"
          className="mb-5 pr-10 text-base font-semibold text-slate-100"
        >
          Livella metabolica
        </h2>

        {/* Tubo livella */}
        <div className="relative mx-auto mb-6 flex w-64 max-w-full flex-col items-center">
          <div className="relative h-8 w-full overflow-hidden rounded-full border border-slate-600 bg-slate-800">
            {/* Zona neutra (dead-band) */}
            <div
              className="pointer-events-none absolute inset-y-0 rounded-sm bg-cyan-500/10"
              style={{ left: `${deadBandLeft}%`, width: `${deadBandWidth}%` }}
              aria-hidden
            />
            {/* Tacche zona perfetta */}
            <div
              className="pointer-events-none absolute bottom-1 top-1 w-0.5 bg-cyan-400/70"
              style={{ left: `${deadBandLeft}%` }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute bottom-1 top-1 w-0.5 bg-cyan-400/70"
              style={{ left: `${deadBandLeft + deadBandWidth}%` }}
              aria-hidden
            />
            {/* Marcatori estremi */}
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-500">
              −
            </span>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-slate-500">
              +
            </span>
            {/* Bolla */}
            <div
              className={`absolute top-1 h-6 w-6 rounded-full transition-all duration-700 ease-out ${STATUS_BUBBLE_CLASS[safeStatus]}`}
              style={{ left: bubbleLeft }}
              aria-hidden
            />
          </div>
          <div className="mt-2 flex w-full justify-between text-[10px] text-slate-500">
            <span>Deficit</span>
            <span>In linea</span>
            <span>Surplus</span>
          </div>
        </div>

        {/* Diagnostica */}
        <div className="space-y-2 text-center">
          <p className="text-2xl font-bold tabular-nums text-slate-50">
            {formatWeekBalance(weekBalance)}
          </p>
          <p
            className={`text-sm font-medium ${
              safeStatus === 'inline'
                ? 'text-cyan-400'
                : safeStatus === 'surplus'
                  ? 'text-orange-400'
                  : 'text-purple-400'
            }`}
          >
            {STATUS_MESSAGE[safeStatus]}
          </p>
          <p className="text-xs text-slate-500">
            Target {Math.round(weekTarget)} kcal · Assunte {Math.round(weekIntake)} kcal ·{' '}
            {daysWithLog}/{daysAnalyzed} giorni tracciati
          </p>
          {weekStart ? (
            <p className="text-[10px] text-slate-600">Settimana dal {weekStart}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={closeModal}
          className="mt-6 w-full rounded-xl border border-slate-600 bg-slate-800 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
        >
          Chiudi
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        onKeyDown={onSpiaKeyDown}
        className={`inline-flex h-3 w-3 shrink-0 rounded-full transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 ${STATUS_SPIA_CLASS[safeStatus]} ${className}`.trim()}
        aria-label={`Bilancio settimanale: ${STATUS_MESSAGE[safeStatus]}. ${formatWeekBalance(weekBalance)}. Apri dettagli.`}
        title={STATUS_MESSAGE[safeStatus]}
      />

      {typeof document !== 'undefined' && modalPanel ? createPortal(modalPanel, document.body) : null}
    </>
  );
}
