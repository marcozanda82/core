import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { formatMetabolicCountdown, formatMetabolicPhaseClockLabel, formatMetabolicPhaseEta, formatMetabolicRelativeDuration, MAX_FASTING_HOURS } from '../features/salaComandi/utils/metabolicStateEngine';
import { METABOLIC_PHASES } from '../features/salaComandi/utils/metabolicPhaseConfig';
import MetabolicPhaseIcon from './MetabolicPhaseIcon';

const PHASE_HINTS = {
  digestione: 'Il corpo sta processando il pasto. Priorità al riposo digestivo.',
  assorbimento: 'Nutrienti in circolo. Ideale per camminata leggera o mobilità.',
  glicogeno: 'Energia da glicogeno muscolare. Ottimo per forza e ipertrofia.',
  transizione: 'Passaggio verso ossidazione dei grassi. Cardio moderato efficace.',
  brucio_grassi: 'I grassi sono la fonte principale. Performance aerobica.',
  autofagia: 'Fase di pulizia cellulare e rigenerazione profonda.',
  digiuno_profondo: 'Massima chiarezza mentale e adattamenti metabolici avanzati.',
};

const PX_PER_HOUR = 40;
/** Estensione visiva timeline = limite fisiologico digiuno. */
const DISPLAY_MAX_HOURS = MAX_FASTING_HOURS;
const RETURN_THRESHOLD_PX = 32;
const BG_BASE = 'rgb(15 23 42)';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hexToRgb(hex) {
  const normalized = String(hex ?? '#64748b').replace('#', '');
  if (normalized.length !== 6) return [100, 116, 139];
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function lerpHexColor(colorA, colorB, t) {
  const [r1, g1, b1] = hexToRgb(colorA);
  const [r2, g2, b2] = hexToRgb(colorB);
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  return `rgb(${r}, ${g}, ${b})`;
}

function buildPhaseBlocks() {
  return METABOLIC_PHASES.map((phase, index) => {
    const startHour = phase.minHours;
    const endHour = phase.maxHours === Infinity ? DISPLAY_MAX_HOURS : phase.maxHours;
    const durationHours = Math.max(0, endHour - startHour);
    return {
      ...phase,
      index,
      startHour,
      endHour,
      durationHours,
      widthPx: durationHours * PX_PER_HOUR,
      nextPhase: METABOLIC_PHASES[index + 1] ?? null,
    };
  });
}

const PHASE_BLOCKS = buildPhaseBlocks();

function resolvePhaseAtHours(hours) {
  const h = Math.max(0, Number(hours) || 0);
  return PHASE_BLOCKS.find((item) => h >= item.startHour && h < item.endHour)
    ?? PHASE_BLOCKS[PHASE_BLOCKS.length - 1];
}

function colorAtHours(hours) {
  const block = resolvePhaseAtHours(hours);
  const next = block.nextPhase;
  if (!next || block.durationHours <= 0) {
    return block.iconColor;
  }
  const progress = Math.max(0, Math.min(1, (hours - block.startHour) / block.durationHours));
  return lerpHexColor(block.iconColor, next.iconColor, progress);
}

function backgroundAtHours(hours) {
  const accent = colorAtHours(hours);
  return `color-mix(in srgb, ${accent} 24%, ${BG_BASE})`;
}

function MetabolicTimeCarousel({ hoursSinceLastMeal, lastMealConsumedAtMs }) {
  const scrollRef = useRef(null);
  const presentScrollRef = useRef(0);
  const [sidePad, setSidePad] = useState(0);
  const [bgColor, setBgColor] = useState(() => backgroundAtHours(0));
  const [showReturn, setShowReturn] = useState(false);
  const [viewHours, setViewHours] = useState(() => Math.max(0, Number(hoursSinceLastMeal) || 0));

  const phaseBlocks = PHASE_BLOCKS;
  const presentHours = Math.max(0, Number(hoursSinceLastMeal) || 0);
  presentScrollRef.current = presentHours * PX_PER_HOUR;

  const trackWidthPx = useMemo(
    () => sidePad * 2 + phaseBlocks.reduce((sum, block) => sum + block.widthPx, 0),
    [phaseBlocks, sidePad],
  );

  const viewPhase = useMemo(() => resolvePhaseAtHours(viewHours), [viewHours]);
  const viewPhaseClockLabel = useMemo(
    () => formatMetabolicPhaseClockLabel(lastMealConsumedAtMs, viewPhase.startHour),
    [lastMealConsumedAtMs, viewPhase.startHour],
  );
  const viewHoursUntil = Math.max(0, viewHours - presentHours);
  const viewMirinoLabel = useMemo(() => {
    if (lastMealConsumedAtMs == null) {
      return `${Math.floor(viewHours)}h ${String(Math.round((viewHours % 1) * 60)).padStart(2, '0')}m · ${viewPhase.label}`;
    }
    if (viewHoursUntil > 0.02) {
      const eta = formatMetabolicPhaseEta(lastMealConsumedAtMs, viewPhase.startHour, viewHoursUntil);
      return `${eta ?? viewPhaseClockLabel} · ${viewPhase.label}`;
    }
    return `${viewPhaseClockLabel} · ${viewPhase.label}`;
  }, [lastMealConsumedAtMs, viewHours, viewHoursUntil, viewPhase.label, viewPhase.startHour, viewPhaseClockLabel]);

  const measureSidePad = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return 0;
    return el.clientWidth / 2;
  }, []);

  const syncFromScroll = useCallback((scrollLeft) => {
    const hours = scrollLeft / PX_PER_HOUR;
    setViewHours(hours);
    setBgColor(backgroundAtHours(hours));
    setShowReturn(Math.abs(scrollLeft - presentScrollRef.current) > RETURN_THRESHOLD_PX);
  }, []);

  const scrollToPresent = useCallback((behavior = 'auto') => {
    const el = scrollRef.current;
    if (!el) return;
    const target = presentScrollRef.current;
    el.scrollTo({ left: target, behavior });
    syncFromScroll(target);
  }, [syncFromScroll]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const updatePad = () => {
      setSidePad(measureSidePad());
    };

    updatePad();
    const ro = new ResizeObserver(updatePad);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureSidePad]);

  useLayoutEffect(() => {
    if (sidePad <= 0) return;
    scrollToPresent('auto');
  }, [sidePad, presentHours, scrollToPresent]);

  useEffect(() => {
    presentScrollRef.current = presentHours * PX_PER_HOUR;
    if (!showReturn) {
      scrollToPresent('auto');
    }
  }, [presentHours, scrollToPresent, showReturn]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncFromScroll(el.scrollLeft);
  }, [syncFromScroll]);

  return (
    <div className="metabolic-carousel-root relative w-full">
      <div className="metabolic-carousel-shell">
        <div
          className="metabolic-carousel-now pointer-events-none absolute left-1/2 top-0 z-30 flex -translate-x-1/2 flex-col items-center"
          aria-hidden
        >
          <div className="h-full w-[2px] bg-cyan-400 shadow-[0_0_8px_cyan]" />
          <span className="mt-1 shrink-0 text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-400">
            NOW
          </span>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="metabolic-carousel-track scrollbar-hide relative"
          style={{
            backgroundColor: bgColor,
            transition: 'background-color 0.1s ease-out',
          }}
        >
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-[2px] -translate-y-1/2 bg-slate-800/80"
          style={{ left: 0, width: trackWidthPx }}
        />

        <div className="flex shrink-0 items-center" style={{ width: sidePad }} aria-hidden />

        {phaseBlocks.map((block) => {
          const phaseClockLabel = formatMetabolicPhaseClockLabel(lastMealConsumedAtMs, block.startHour);
          const isFuturePhase = block.startHour > presentHours + 0.02;
          const hoursUntilPhase = Math.max(0, block.startHour - presentHours);
          const phaseEtaLabel = isFuturePhase && lastMealConsumedAtMs != null
            ? formatMetabolicPhaseEta(lastMealConsumedAtMs, block.startHour, hoursUntilPhase)
            : phaseClockLabel;

          return (
          <div
            key={block.id}
            className="relative flex h-full shrink-0 flex-col items-center justify-center"
            style={{ width: block.widthPx }}
          >
            <div
              className="flex flex-col items-center justify-center"
              style={{ color: block.iconColor }}
            >
              <img
                src={block.iconPath}
                alt={block.label}
                draggable={false}
                className={`metabolic-carousel-icon object-contain drop-shadow-[0_0_12px_currentColor] transition-transform duration-300 ${
                  viewPhase.id === block.id
                    ? 'metabolic-carousel-icon--active'
                    : viewHours >= block.endHour
                      ? 'opacity-40 grayscale'
                      : 'opacity-30'
                }`}
              />
              <span
                className={`mt-2 max-w-[6rem] truncate px-1 text-center text-[9px] font-medium uppercase tracking-wide ${
                  viewPhase.id === block.id ? 'text-slate-100' : 'text-slate-500'
                }`}
              >
                {block.label}
              </span>
              {lastMealConsumedAtMs != null ? (
                <span
                  className={`mt-0.5 max-w-[7rem] truncate px-1 text-center font-mono text-[8px] tabular-nums ${
                    viewPhase.id === block.id ? 'text-cyan-300/90' : 'text-slate-500'
                  }`}
                  title={phaseEtaLabel}
                >
                  {phaseEtaLabel}
                </span>
              ) : null}
              <span className="mt-0.5 font-mono text-[8px] tabular-nums text-slate-600">
                {block.startHour}h–{block.endHour === DISPLAY_MAX_HOURS ? `${DISPLAY_MAX_HOURS}h+` : `${block.endHour}h`}
              </span>
            </div>
          </div>
          );
        })}

        <div className="flex shrink-0 items-center" style={{ width: sidePad }} aria-hidden />
      </div>
      </div>

      <p className="metabolic-sheet-rigid mt-2 text-center font-mono text-[10px] tabular-nums text-slate-500">
        Mirino: {viewMirinoLabel}
      </p>

      {showReturn ? (
        <button
          type="button"
          onClick={() => scrollToPresent('smooth')}
          className="absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-full border border-cyan-500/40 bg-slate-950/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.25)] backdrop-blur-sm transition-colors hover:border-cyan-400/70 hover:bg-slate-900"
        >
          ⊕ Torna al presente
        </button>
      ) : null}
    </div>
  );
}

export default function MetabolicTimelineSheet({
  isOpen,
  metabolicSnapshot,
  onClose,
  onNeuralReset,
}) {
  if (!isOpen || !metabolicSnapshot?.phase) return null;

  const {
    phase,
    nextPhase,
    hoursUntilNext,
    hoursSinceLastMeal,
    hasMealLogged,
    isOverloadOverride,
    overloadReason,
    biometrics,
    lastMealConsumedAtMs,
    nextPhaseEtaLabel,
    nextPhaseClockLabel,
  } = metabolicSnapshot;

  const isOverload = isOverloadOverride || phase.id === 'sovraccarico';
  const isFastingLimitOverload = overloadReason === 'fasting_limit';
  const hint = PHASE_HINTS[phase.id] || '';
  const countdown = formatMetabolicCountdown(hoursUntilNext);
  const nextPhaseDisplay = nextPhaseEtaLabel
    ?? (nextPhaseClockLabel && hoursUntilNext != null
      ? `${nextPhaseClockLabel} (tra ${formatMetabolicRelativeDuration(hoursUntilNext)})`
      : countdown !== '—' ? `tra ${formatMetabolicRelativeDuration(hoursUntilNext)}` : '—');
  const currentPhaseClockLabel = formatMetabolicPhaseClockLabel(lastMealConsumedAtMs, phase.minHours ?? 0);

  const handleNeuralReset = () => {
    onClose?.();
    onNeuralReset?.();
  };

  return (
    <>
      <button
        type="button"
        aria-label="Chiudi cruscotto metabolico"
        onClick={onClose}
        className="fixed inset-0 z-[100050] bg-black/55 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cruscotto metabolico"
        className="metabolic-sheet-root fixed inset-x-0 bottom-0 z-[100051] rounded-t-3xl border-t border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/40"
      >
        <div className="metabolic-sheet-rigid mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-slate-600" />

        {isOverload ? (
          <>
            <div className="metabolic-sheet-rigid metabolic-sheet-header text-center">
              <h2 className="text-xl font-bold uppercase tracking-[0.18em] text-red-400">
                SOVRACCARICO
              </h2>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-red-300/90">
                {isFastingLimitOverload
                  ? 'Limite digiuno superato. Rischio catabolismo e picco di cortisolo. Interrompere il digiuno.'
                  : 'Troppe stimolazioni, poco recupero.'}
              </p>
              {biometrics && !isFastingLimitOverload ? (
                <p className="mt-3 font-mono text-xs tabular-nums text-slate-500">
                  SNC {Math.round(biometrics.stressLevel)}%
                  {biometrics.recoveryScore != null ? ` · Recupero ${Math.round(biometrics.recoveryScore)}%` : ''}
                  {biometrics.sleepHours != null ? ` · Sonno ${biometrics.sleepHours.toFixed(1)}h` : ''}
                  {biometrics.sleepQuality != null && biometrics.sleepHours == null
                    ? ` · Sonno ${Math.round(biometrics.sleepQuality)}%`
                    : ''}
                </p>
              ) : null}
            </div>

            <div className="metabolic-sheet-icon-shell">
              <img
                src={phase.iconPath}
                alt={phase.label}
                draggable={false}
                className="metabolic-sheet-hero-icon object-contain drop-shadow-[0_0_30px_rgba(239,68,68,0.5)]"
              />
            </div>

            <div className="metabolic-sheet-rigid metabolic-sheet-actions">
              <button
                type="button"
                onClick={handleNeuralReset}
                className="w-full rounded-xl border border-red-500/50 bg-red-900/20 py-3.5 text-sm font-bold uppercase tracking-wide text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)] transition-colors hover:bg-red-900/40 active:scale-[0.98]"
              >
                ⚠️ SCARICA E RIPOSA
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Chiudi
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="metabolic-sheet-rigid metabolic-sheet-header text-center">
              <MetabolicPhaseIcon phase={phase} size="xl" withHalo />
              <h2 className="mt-3 text-xl font-bold uppercase tracking-wide text-slate-50">
                {phase.label}
              </h2>
              <p className="mt-1.5 text-sm font-medium" style={{ color: phase.iconColor }}>
                {phase.action}
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
                {hasMealLogged ? hint : 'Logga un pasto per attivare la timeline metabolica.'}
              </p>
              {hasMealLogged ? (
                <p className="mt-1.5 font-mono text-xs tabular-nums text-slate-500">
                  {Math.floor(hoursSinceLastMeal)}h {Math.round((hoursSinceLastMeal % 1) * 60)}m dall&apos;ultimo pasto
                  {currentPhaseClockLabel !== '—' ? (
                    <>
                      {' · '}
                      fase attiva dalle {currentPhaseClockLabel}
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>

            {nextPhase ? (
              <div className="metabolic-sheet-rigid metabolic-sheet-next rounded-2xl border border-slate-700/70 bg-slate-950/60 px-4 py-3 text-center">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Prossima fase
                </p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <MetabolicPhaseIcon phase={nextPhase} size="sm" />
                  <p className="text-sm font-semibold text-slate-200">{nextPhase.label}</p>
                </div>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-cyan-400">
                  {nextPhaseDisplay}
                </p>
              </div>
            ) : (
              <div className="metabolic-sheet-rigid metabolic-sheet-next rounded-2xl border border-teal-500/25 bg-teal-500/10 px-4 py-3 text-center text-sm text-teal-200">
                Fase massima raggiunta — mantieni idratazione e ascolta il corpo.
              </div>
            )}

            <div className="metabolic-sheet-stage">
              <MetabolicTimeCarousel
                hoursSinceLastMeal={hoursSinceLastMeal}
                lastMealConsumedAtMs={lastMealConsumedAtMs}
              />
            </div>

            <div className="metabolic-sheet-rigid">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
              >
                Chiudi
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
