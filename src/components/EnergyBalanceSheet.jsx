import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  calculateTargetSleepHours,
  computeAgeAdjustedMetabolicPenalty,
  computeSleepBandLayout,
  describeSleepAlignment,
  formatSleepHours,
  formatSleepTargetInfoNote,
  getTodaySleepRestedFeedback,
  loadSleepLearningState,
  recordSleepRestedFeedback,
  runWeeklySleepLearningAdjustment,
  sleepRangeTone,
  sleepProgressTone,
  toneColor,
} from '../utils/sleepUtils';

const SWIPE_CLOSE_THRESHOLD_PX = 72;

function StatusBar({
  icon,
  label,
  value,
  subValue,
  pct,
  tone,
  hint,
}) {
  const clampedPct = Math.max(0, Math.min(100, Number(pct) || 0));
  const color = toneColor(tone);

  return (
    <div className="energy-balance-status">
      <div className="energy-balance-status__row">
        <span className="energy-balance-status__icon" aria-hidden>{icon}</span>
        <div className="energy-balance-status__meta">
          <span className="energy-balance-status__label">{label}</span>
          <span className="energy-balance-status__value" style={{ color }}>
            {value}
          </span>
        </div>
        {subValue ? (
          <span className="energy-balance-status__sub">{subValue}</span>
        ) : null}
      </div>
      <div className="energy-balance-status__track" aria-hidden>
        <div
          className="energy-balance-status__fill"
          style={{ width: `${clampedPct}%`, background: color }}
        />
      </div>
      {hint ? <p className="energy-balance-status__hint">{hint}</p> : null}
    </div>
  );
}

function SleepRangeBand({
  hoursSlept,
  range,
  tone,
  hint,
  hasSleep,
}) {
  const color = toneColor(tone);
  const layout = computeSleepBandLayout(hasSleep ? hoursSlept : range.ideal, range);
  const bandWidth = Math.max(0, layout.bandEndPct - layout.bandStartPct);

  return (
    <div className="energy-balance-status energy-balance-sleep-range">
      <div className="energy-balance-status__row">
        <span className="energy-balance-status__icon" aria-hidden>🌙</span>
        <div className="energy-balance-status__meta">
          <span className="energy-balance-status__label">Sonno</span>
          <span className="energy-balance-status__value" style={{ color }}>
            {hasSleep
              ? `${formatSleepHours(hoursSlept)} · range ${range.min.toFixed(1)}–${range.max.toFixed(1)}h`
              : `— · range ${range.min.toFixed(1)}–${range.max.toFixed(1)}h`}
          </span>
        </div>
        {hasSleep ? (
          <span className="energy-balance-status__sub">{formatSleepHours(hoursSlept)}</span>
        ) : null}
      </div>

      <div
        className="energy-balance-sleep-band"
        role="img"
        aria-label={
          hasSleep
            ? `Sonno ${formatSleepHours(hoursSlept)} rispetto al range ${range.min}–${range.max} ore`
            : `Range sonno ideale ${range.min}–${range.max} ore`
        }
      >
        <div className="energy-balance-sleep-band__track">
          <div
            className="energy-balance-sleep-band__comfort"
            style={{
              left: `${layout.bandStartPct}%`,
              width: `${bandWidth}%`,
              background: `${color}33`,
              borderColor: `${color}66`,
            }}
          />
          {hasSleep ? (
            <div
              className="energy-balance-sleep-band__marker"
              style={{ left: `${layout.markerPct}%`, background: color }}
              aria-hidden
            />
          ) : null}
        </div>
        <div className="energy-balance-sleep-band__scale" aria-hidden>
          <span>{layout.viewMin.toFixed(1)}h</span>
          <span className="energy-balance-sleep-band__scale-center">{range.ideal.toFixed(1)}h</span>
          <span>{layout.viewMax.toFixed(1)}h</span>
        </div>
      </div>

      {hint ? <p className="energy-balance-status__hint">{hint}</p> : null}
    </div>
  );
}

function resolveGlobalTone(sleepTone, energyTone) {
  const order = { bad: 0, warn: 1, good: 2 };
  const worst = order[sleepTone] <= order[energyTone] ? sleepTone : energyTone;
  if (worst === 'bad') {
    return { tone: 'bad', label: 'Recupero critico', icon: '🔴' };
  }
  if (worst === 'warn') {
    return { tone: 'warn', label: 'Recupero parziale', icon: '🟡' };
  }
  return { tone: 'good', label: 'Equilibrio ok', icon: '🟢' };
}

/**
 * Bottom sheet — sonno, drain energetico e bilancio calorico netto.
 */
export default function EnergyBalanceSheet({
  isOpen,
  onClose,
  userAge = 30,
  recoveryScore = 0,
  totalSleepHours = 0,
  bodyBatteryLevel,
  dynamicDailyKcal = 0,
  consumedKcal = 0,
  workoutBurnKcal = 0,
  basalDrainKcal,
}) {
  const dragStartYRef = useRef(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [personalOffsetHours, setPersonalOffsetHours] = useState(0);
  const [restedToday, setRestedToday] = useState(null);

  useEffect(() => {
    const state = loadSleepLearningState();
    const adjusted = runWeeklySleepLearningAdjustment(state);
    setPersonalOffsetHours(adjusted.personalOffsetHours);
    setRestedToday(getTodaySleepRestedFeedback());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setDragOffset(0);
  }, [isOpen]);

  const handleTouchStart = useCallback((e) => {
    dragStartYRef.current = e.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchMove = useCallback((e) => {
    const startY = dragStartYRef.current;
    if (startY == null) return;
    const delta = (e.touches[0]?.clientY ?? startY) - startY;
    if (delta > 0) setDragOffset(delta);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragOffset >= SWIPE_CLOSE_THRESHOLD_PX) onClose();
    setDragOffset(0);
    dragStartYRef.current = null;
  }, [dragOffset, onClose]);

  const handleRestedFeedback = useCallback((feltRested) => {
    const slept = Number(totalSleepHours) || 0;
    if (slept <= 0) return;
    const range = calculateTargetSleepHours(
      Number(userAge) || 30,
      personalOffsetHours,
    );
    const next = recordSleepRestedFeedback({ hoursSlept: slept, range, feltRested });
    setPersonalOffsetHours(next.personalOffsetHours);
    setRestedToday(feltRested);
  }, [totalSleepHours, userAge, personalOffsetHours]);

  const metrics = useMemo(() => {
    const slept = Number(totalSleepHours) || 0;
    const hasSleep = slept > 0;
    const ageYears = Number(userAge);
    const safeAge = Number.isFinite(ageYears) && ageYears >= 0 ? ageYears : 30;
    const sleepRange = calculateTargetSleepHours(safeAge, personalOffsetHours);
    const sleepTone = hasSleep ? sleepRangeTone(slept, sleepRange) : 'bad';
    const sleepDeviation = hasSleep ? slept - sleepRange.ideal : 0;
    const metabolicPenalty = hasSleep
      ? computeAgeAdjustedMetabolicPenalty(slept, sleepRange, recoveryScore)
      : 1.08;

    const battery = Number.isFinite(Number(bodyBatteryLevel))
      ? Math.round(Number(bodyBatteryLevel))
      : Math.round(Number(recoveryScore) || 0);
    const energyPct = Math.max(0, Math.min(100, battery));
    const energyTone = sleepProgressTone(energyPct);

    const tdee = Math.round(Number(dynamicDailyKcal) || 0);
    const kcalIn = Math.round(Number(consumedKcal) || 0);
    const kcalOut = Math.round(
      (Number(basalDrainKcal) || 0) + (Number(workoutBurnKcal) || 0),
    );
    const netKcal = kcalIn - kcalOut;
    const intakePct = tdee > 0 ? Math.min(100, (kcalIn / tdee) * 100) : 0;
    const netTone = tdee <= 0
      ? 'warn'
      : intakePct >= 90 && intakePct <= 110
        ? 'good'
        : intakePct >= 75
          ? 'warn'
          : 'bad';

    const global = resolveGlobalTone(sleepTone, energyTone);

    return {
      hasSleep,
      sleepRange,
      sleepTone,
      sleepDeviation,
      metabolicPenalty,
      battery,
      energyPct,
      energyTone,
      tdee,
      kcalIn,
      kcalOut,
      netKcal,
      intakePct,
      netTone,
      global,
      safeAge,
      targetInfoNote: formatSleepTargetInfoNote(safeAge, sleepRange),
      sleepFeedback: describeSleepAlignment(slept, sleepRange),
    };
  }, [
    totalSleepHours,
    userAge,
    personalOffsetHours,
    recoveryScore,
    bodyBatteryLevel,
    dynamicDailyKcal,
    consumedKcal,
    workoutBurnKcal,
    basalDrainKcal,
  ]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="energy-balance-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="energy-balance-title"
        className="energy-balance-panel vetrina-sheet-enter"
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: dragOffset > 0 ? 'none' : 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="energy-balance-panel__chrome">
          <div className="energy-balance-panel__handle" aria-hidden />
          <button
            type="button"
            className="energy-balance-panel__close"
            onClick={onClose}
            aria-label="Chiudi bilancio energetico"
          >
            ✕
          </button>
        </div>

        <header className="energy-balance-header energy-balance-header--compact">
          <h2 id="energy-balance-title" className="energy-balance-header__title">
            Bilancio Energetico
          </h2>
        </header>

        <div className="energy-balance-scroll">
          <div
            className="energy-balance-global"
            style={{ borderColor: `${toneColor(metrics.global.tone)}44` }}
          >
            <span className="energy-balance-global__icon" aria-hidden>
              {metrics.global.icon}
            </span>
            <div className="energy-balance-global__text">
              <span
                className="energy-balance-global__label"
                style={{ color: toneColor(metrics.global.tone) }}
              >
                {metrics.global.label}
              </span>
              <span className="energy-balance-global__sub">
                Penalità ×{metrics.metabolicPenalty.toFixed(2)}
              </span>
            </div>
          </div>

          <SleepRangeBand
            hoursSlept={totalSleepHours}
            range={metrics.sleepRange}
            tone={metrics.sleepTone}
            hint={metrics.hasSleep ? metrics.sleepFeedback : undefined}
            hasSleep={metrics.hasSleep}
          />
          <p className="energy-balance-age-note">{metrics.targetInfoNote}</p>

          {metrics.hasSleep ? (
            <div className="energy-balance-rested-prompt">
              <span className="energy-balance-rested-prompt__label">Sentito riposato?</span>
              <div className="energy-balance-rested-prompt__actions">
                <button
                  type="button"
                  className={`energy-balance-rested-btn${restedToday === true ? ' energy-balance-rested-btn--active' : ''}`}
                  onClick={() => handleRestedFeedback(true)}
                  aria-pressed={restedToday === true}
                >
                  Sì
                </button>
                <button
                  type="button"
                  className={`energy-balance-rested-btn${restedToday === false ? ' energy-balance-rested-btn--active' : ''}`}
                  onClick={() => handleRestedFeedback(false)}
                  aria-pressed={restedToday === false}
                >
                  No
                </button>
              </div>
              {restedToday != null ? (
                <p className="energy-balance-rested-prompt__saved">
                  Feedback registrato — l&apos;app calibra il range nel tempo
                </p>
              ) : null}
            </div>
          ) : null}

          <StatusBar
            icon="⚡"
            label="Energia"
            value={`${metrics.battery}%`}
            subValue="Body Battery"
            pct={metrics.energyPct}
            tone={metrics.energyTone}
            hint={
              Number(workoutBurnKcal) > 0
                ? `−${Math.round(Number(workoutBurnKcal))} kcal workout`
                : undefined
            }
          />

          <StatusBar
            icon="⚖️"
            label="Bilancio"
            value={
              metrics.tdee > 0
                ? `${metrics.netKcal >= 0 ? '+' : ''}${metrics.netKcal} kcal`
                : `${metrics.kcalIn} kcal`
            }
            subValue={
              metrics.tdee > 0
                ? `${metrics.kcalIn} in · ${metrics.kcalOut} out`
                : null
            }
            pct={metrics.intakePct}
            tone={metrics.netTone}
            hint={
              metrics.tdee > 0
                ? `Target ${metrics.tdee} kcal`
                : undefined
            }
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
