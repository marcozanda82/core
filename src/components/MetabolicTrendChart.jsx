import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  buildMetabolicCompensationSeries,
  withCompensationStrokeFields,
  resolveMetabolicTrendYDomain,
  GHOST_CORRIDOR_HALF_WIDTH_KCAL,
  GHOST_SIM_DELTA_MIN,
  GHOST_SIM_DELTA_MAX,
  GHOST_SIM_DELTA_STEP,
  clampGhostSimDelta,
  ghostSimDeltaSmartLabel,
  normalizeGhostSimGoal,
  resolveGhostDailyDeltaFromGoal,
} from '../utils/metabolicCompensationCurve';
import {
  COMPENSATION_DEVIATION_TRIGGER_KCAL,
  COMPENSATION_MAX_DAILY_SUGGEST_KCAL,
  COMPENSATION_DAYS_MIN,
  COMPENSATION_DAYS_MAX,
  COMPENSATION_DAILY_ABS_MAX,
  proposeCompensationPlan,
  resolveActiveCompensationOnDate,
} from '../utils/activeCompensation';

function formatKcal(n) {
  const v = Math.round(Number(n) || 0);
  if (v > 0) return `+${v}`;
  return String(v);
}

function clampCompensationDays(raw) {
  const n = Math.round(Number(raw) || 0);
  return Math.max(COMPENSATION_DAYS_MIN, Math.min(COMPENSATION_DAYS_MAX, n));
}

function clampCompensationDaily(raw) {
  const n = Math.round(Number(raw) || 0);
  return Math.max(-COMPENSATION_DAILY_ABS_MAX, Math.min(COMPENSATION_DAILY_ABS_MAX, n));
}

function GhostCarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  if (row.isOrigin) {
    return (
      <div className="rounded-lg border border-white/12 bg-[rgba(8,10,14,0.96)] px-3 py-2.5 text-xs shadow-[0_10px_28px_rgba(0,0,0,0.45)]">
        <p className="mb-1.5 font-semibold tracking-wide text-slate-100">
          Punto Zero
          <span className="ml-2 font-mono text-[10px] text-slate-500">{row.date}</span>
        </p>
        <p className="text-[10px] text-slate-400">Origine finestra — Ghost = target giornaliero di regime</p>
      </div>
    );
  }

  const title = row.isToday
    ? 'Oggi (target Autopilota)'
    : (row.isProjection ? 'Proiezione Ghost Car' : row.label);

  return (
    <div className="rounded-lg border border-white/12 bg-[rgba(8,10,14,0.96)] px-3 py-2.5 text-xs shadow-[0_10px_28px_rgba(0,0,0,0.45)]">
      <p className="mb-2 font-semibold tracking-wide text-slate-100">
        {title}
        <span className="ml-2 font-mono text-[10px] text-slate-500">{row.date}</span>
      </p>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-4">
          <span className="text-cyan-300">Ghost Car (kcal/g)</span>
          <span className="font-mono tabular-nums text-cyan-100">{formatKcal(row.ghost)}</span>
        </div>
        {row.real != null && !row.isToday && !row.isProjection ? (
          <div className="flex justify-between gap-4">
            <span className="text-orange-300">Reale (kcal/g)</span>
            <span className="font-mono tabular-nums text-orange-100">{formatKcal(row.real)}</span>
          </div>
        ) : null}
        {row.ghostDailyDelta != null && row.ghost !== row.ghostDailyDelta ? (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Target regime</span>
            <span className="font-mono tabular-nums text-slate-400">{formatKcal(row.ghostDailyDelta)}</span>
          </div>
        ) : null}
        <p className={`mt-1 text-[10px] font-semibold uppercase tracking-wider ${
          row.inCorridor ? 'text-emerald-400' : 'text-orange-400'
        }`}
        >
          {row.inCorridor ? '● Dentro corridoio (±300)' : '● Fuori corridoio'}
        </p>
      </div>
    </div>
  );
}

function GhostTodayDot({ cx, cy, payload }) {
  if (cx == null || cy == null || !payload?.isToday) return null;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={6}
        className="ghost-today-radar animate-ping"
        fill="#06b6d4"
        opacity={0.7}
      />
      <circle cx={cx} cy={cy} r={5} fill="#06b6d4" stroke="#ffffff" strokeWidth={2} />
    </g>
  );
}

function GhostLineDot(props) {
  const { cx, cy, payload } = props;
  if (payload?.isToday) return <GhostTodayDot cx={cx} cy={cy} payload={payload} />;
  if (payload?.isProjection) {
    return (
      <circle cx={cx} cy={cy} r={2.5} fill="#06b6d4" stroke="rgba(255,255,255,0.5)" strokeWidth={1} />
    );
  }
  return null;
}

/**
 * MetabolicTrendChart — simulatore What-If Ghost Car (Diag) + Rolling Balance.
 *
 * @param {{
 *   fullHistory?: object | null,
 *   userTargets?: object | null,
 *   activeLog?: Array | null,
 *   activeDate?: string | null,
 *   settingsBaseKcal?: number | null,
 *   committedGoal?: string | null,
 *   committedDeltaKcal?: number | null,
 *   effectiveDeltaKcal?: number | null,
 *   autoCompensationDelta?: number,
 *   rollingDebt?: object | null,
 *   ghostAutoPilotEnabled?: boolean,
 *   onToggleGhostAutoPilot?: ((enabled: boolean) => void) | null,
 *   onApplyGoal?: (deltaKcal: number) => void | Promise<void>,
 *   activeCompensation?: object | null,
 *   compensationDateIso?: string | null,
 *   onConfirmCompensation?: (plan: object) => void | Promise<void>,
 *   onClearCompensation?: () => void | Promise<void>,
 *   className?: string,
 * }} props
 */
export default function MetabolicTrendChart({
  fullHistory = null,
  userTargets = null,
  activeLog = null,
  activeDate = null,
  settingsBaseKcal = null,
  committedGoal = 'maintain',
  committedDeltaKcal = null,
  effectiveDeltaKcal = null,
  autoCompensationDelta = 0,
  rollingDebt = null,
  ghostAutoPilotEnabled = true,
  onToggleGhostAutoPilot = null,
  onApplyGoal = null,
  activeCompensation = null,
  compensationDateIso = null,
  onConfirmCompensation = null,
  onClearCompensation = null,
  className = '',
} = {}) {
  const committedDelta = clampGhostSimDelta(
    committedDeltaKcal != null && committedDeltaKcal !== ''
      ? committedDeltaKcal
      : resolveGhostDailyDeltaFromGoal(normalizeGhostSimGoal(committedGoal)),
  );
  const [sliderDelta, setSliderDelta] = useState(committedDelta);
  const [savedDelta, setSavedDelta] = useState(committedDelta);
  const savedDeltaRef = useRef(committedDelta);
  const lastParentCommittedRef = useRef(committedDelta);
  const [isApplying, setIsApplying] = useState(false);
  const [applyFeedback, setApplyFeedback] = useState(null);
  const applyFeedbackTimerRef = useRef(null);
  const [showRientroPanel, setShowRientroPanel] = useState(false);
  const [rientroDays, setRientroDays] = useState(3);
  const [rientroDailyDelta, setRientroDailyDelta] = useState(-250);
  const [isSavingCompensation, setIsSavingCompensation] = useState(false);

  useEffect(() => {
    savedDeltaRef.current = savedDelta;
  }, [savedDelta]);

  useEffect(() => {
    if (committedDelta === lastParentCommittedRef.current) return;
    lastParentCommittedRef.current = committedDelta;
    setSavedDelta(committedDelta);
    setSliderDelta((current) => (
      current !== savedDeltaRef.current ? current : committedDelta
    ));
  }, [committedDelta]);

  useEffect(
    () => () => {
      if (applyFeedbackTimerRef.current) window.clearTimeout(applyFeedbackTimerRef.current);
    },
    [],
  );

  const adjustSliderDelta = (deltaStep) => {
    setSliderDelta((prev) => clampGhostSimDelta(Number(prev) + deltaStep));
  };

  const autoDelta = ghostAutoPilotEnabled
    ? Math.round(Number(rollingDebt?.autoCompensationDelta ?? autoCompensationDelta) || 0)
    : 0;
  const netDebt = Math.round(Number(rollingDebt?.netDebt48h) || 0);
  const remainingDebt = Math.round(Number(rollingDebt?.remainingDebtAfterCap) || 0);
  const autopilotStrategy = rollingDebt?.strategy && typeof rollingDebt.strategy === 'object'
    ? rollingDebt.strategy
    : null;
  const autopilotZone = Math.round(Number(rollingDebt?.zone) || 0);
  const autopilotIcon = autopilotStrategy?.icon
    || (autopilotZone === 1 ? '⚡' : '🛡️');

  const series = useMemo(
    () => buildMetabolicCompensationSeries({
      fullHistory,
      userTargets,
      activeLog,
      activeDate,
      windowDays: 7,
      corridorHalfWidth: GHOST_CORRIDOR_HALF_WIDTH_KCAL,
      simulatedDeltaKcal: sliderDelta,
      settingsBaseKcal,
      includeToday: true,
      ghostAutoPilotEnabled,
      autoCompensationDelta: autoDelta,
      effectiveDeltaKcal: Math.round(Number(sliderDelta) || 0) + autoDelta,
      autopilotDays: rollingDebt?.strategy?.days || 0,
      autopilotFullRecovery: rollingDebt?.strategy?.fullRecovery !== false,
    }),
    [
      fullHistory,
      userTargets,
      activeLog,
      activeDate,
      sliderDelta,
      settingsBaseKcal,
      ghostAutoPilotEnabled,
      autoDelta,
      rollingDebt?.strategy?.days,
      rollingDebt?.strategy?.fullRecovery,
    ],
  );

  const chartPoints = useMemo(
    () => withCompensationStrokeFields(series.points),
    [series.points],
  );

  const { adherenceOk, latest, latestClosed, sigmaDelta, corridorHalfWidth, ghostDailyDelta } = series;
  const isPreview = sliderDelta !== savedDelta;
  const smartLabel = ghostSimDeltaSmartLabel(sliderDelta);
  const deltaDisplay = formatKcal(sliderDelta);

  const effectiveDelta = Math.round(Number(savedDelta) || 0) + autoDelta;
  const showRollingBadge = netDebt !== 0 || autoDelta !== 0;

  const yDomain = useMemo(
    () => resolveMetabolicTrendYDomain(chartPoints, corridorHalfWidth),
    [chartPoints, corridorHalfWidth],
  );

  const deviation = Math.round(
    Number(latestClosed?.cumulativeDeviation ?? latestClosed?.deviation ?? latest?.deviation) || 0,
  );
  const absDeviation = Math.abs(deviation);
  const showRientroTrigger = absDeviation >= COMPENSATION_DEVIATION_TRIGGER_KCAL;
  const compensationStatus = resolveActiveCompensationOnDate(
    activeCompensation,
    compensationDateIso,
  );

  const openRientroPanel = () => {
    const proposal = proposeCompensationPlan(deviation);
    setRientroDays(proposal.days || 1);
    setRientroDailyDelta(proposal.dailyDelta || (deviation > 0 ? -COMPENSATION_MAX_DAILY_SUGGEST_KCAL : COMPENSATION_MAX_DAILY_SUGGEST_KCAL));
    setShowRientroPanel(true);
  };

  const handleReset = () => {
    setSliderDelta(savedDelta);
  };

  const handleApply = async () => {
    if (typeof onApplyGoal !== 'function' || isApplying) return;
    const next = clampGhostSimDelta(sliderDelta);
    setIsApplying(true);
    try {
      await onApplyGoal(next);
      savedDeltaRef.current = next;
      setSavedDelta(next);
      setSliderDelta(next);
      setApplyFeedback(`Obiettivo metabolico aggiornato a ${formatKcal(next)} kcal/g`);
      if (applyFeedbackTimerRef.current) window.clearTimeout(applyFeedbackTimerRef.current);
      applyFeedbackTimerRef.current = window.setTimeout(() => setApplyFeedback(null), 2800);
    } catch (err) {
      console.warn('[Ghost What-If] apply failed', err);
      setApplyFeedback('Salvataggio non riuscito — riprova');
      if (applyFeedbackTimerRef.current) window.clearTimeout(applyFeedbackTimerRef.current);
      applyFeedbackTimerRef.current = window.setTimeout(() => setApplyFeedback(null), 3200);
    } finally {
      setIsApplying(false);
    }
  };

  const handleConfirmCompensation = async () => {
    if (typeof onConfirmCompensation !== 'function' || isSavingCompensation) return;
    const days = clampCompensationDays(rientroDays);
    const dailyDelta = clampCompensationDaily(rientroDailyDelta);
    if (days < 1 || dailyDelta === 0) return;
    setIsSavingCompensation(true);
    try {
      await onConfirmCompensation({
        dailyDelta,
        days,
        totalDeviation: deviation,
      });
      setShowRientroPanel(false);
    } finally {
      setIsSavingCompensation(false);
    }
  };

  const handleClearCompensation = async () => {
    if (typeof onClearCompensation !== 'function' || isSavingCompensation) return;
    setIsSavingCompensation(true);
    try {
      await onClearCompensation();
      setShowRientroPanel(false);
    } finally {
      setIsSavingCompensation(false);
    }
  };

  if (!chartPoints.length) {
    return (
      <div className={`rounded-xl border border-white/10 bg-slate-900/50 px-3 py-4 ${className}`.trim()}>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Calibrazione target
        </p>
        <p className="mt-2 text-xs text-slate-500">Dati insufficienti negli ultimi 7 giorni.</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 shadow-lg backdrop-blur-sm ${className}`.trim()}
      aria-label="Calibrazione target e bilancio Ghost Car"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Calibrazione Target &amp; Bilancio · 7g
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            What-If Ghost Car ±{corridorHalfWidth} kcal · oggi sul radar
              {ghostAutoPilotEnabled && autopilotStrategy?.days
                ? ` · rientro ${autopilotStrategy.days}g`
                : ''}
          </p>
        </div>
        <span
          className={[
            'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide',
            adherenceOk
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-orange-500/40 bg-orange-500/10 text-orange-300',
          ].join(' ')}
        >
          {adherenceOk ? 'In fascia' : 'Fuori fascia'}
        </span>
      </div>

      <div className="h-[180px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartPoints} margin={{ top: 8, right: 6, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="ghostCorridorFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(148, 163, 184, 0.28)" />
                <stop offset="50%" stopColor="rgba(100, 116, 139, 0.14)" />
                <stop offset="100%" stopColor="rgba(148, 163, 184, 0.22)" />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              tickLine={false}
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: '#64748b', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatKcal(v)}
              width={42}
            />
            <Tooltip content={<GhostCarTooltip />} />

            <Area
              type="linear"
              dataKey="corridorBase"
              stackId="ghostBand"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
            />
            <Area
              type="linear"
              dataKey="corridorWidth"
              stackId="ghostBand"
              stroke="none"
              fill="url(#ghostCorridorFill)"
              fillOpacity={1}
              isAnimationActive={false}
            />

            <Line
              type="linear"
              dataKey="ghost"
              name="Ghost Car"
              stroke="#22d3ee"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={GhostLineDot}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />

            <Line
              type="linear"
              dataKey="realCyan"
              stroke="#22d3ee"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#020617', stroke: '#22d3ee', strokeWidth: 1.5 }}
              activeDot={{ r: 5, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="realOrange"
              stroke="#fb923c"
              strokeWidth={2.25}
              dot={{ r: 3, fill: '#020617', stroke: '#fb923c', strokeWidth: 1.5 }}
              activeDot={{ r: 5, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-4 rounded-sm bg-slate-500/40" />
          Fascia Ghost
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-4 border-t-2 border-dashed border-cyan-400"
            aria-hidden
          />
          Traiettoria Ghost Car
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-sm bg-orange-400" />
          Reale (fino a ieri)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="relative inline-flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-white bg-cyan-400" />
          </span>
          Oggi
        </span>
        {latestClosed || latest ? (
          <span className="ml-auto font-mono tabular-nums text-slate-400">
            ΣΔ {sigmaDelta != null ? formatKcal(sigmaDelta) : '—'}
            {' · Ghost '}
            {formatKcal(latest?.ghost ?? ghostDailyDelta)}
            <span className="ml-1 text-slate-600">({formatKcal(ghostDailyDelta)}/g)</span>
          </span>
        ) : null}
      </div>

      {/* Rolling Balance — debito 48h + Autopilota */}
      <div className="mt-2 rounded-lg border border-white/10 bg-slate-900/50 px-2.5 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="switch"
            aria-checked={ghostAutoPilotEnabled === true}
            aria-label="Autopilota Rolling Balance"
            onClick={() => onToggleGhostAutoPilot?.(ghostAutoPilotEnabled !== true)}
            disabled={typeof onToggleGhostAutoPilot !== 'function'}
            className={[
              'rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-50',
              ghostAutoPilotEnabled
                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                : 'border-white/15 bg-slate-900/80 text-slate-400',
            ].join(' ')}
          >
            Autopilota {ghostAutoPilotEnabled ? 'ON' : 'OFF'}
          </button>
          {showRollingBadge ? (
            <p className="min-w-0 flex-1 text-[10px] leading-snug text-slate-300">
              {ghostAutoPilotEnabled ? (
                <>
                  <span className="mr-1" aria-hidden>{autopilotIcon}</span>
                  AUTOPILOTA ON: Debito 48h
                  <span className="ml-1 font-mono tabular-nums text-orange-300">
                    {formatKcal(netDebt)}
                  </span>
                  {autoDelta !== 0 ? (
                    <>
                      <span className="mx-1 text-slate-500">→ Oggi:</span>
                      <span className="font-mono tabular-nums text-cyan-300">
                        {formatKcal(autoDelta)} kcal/g
                      </span>
                      {autopilotStrategy?.label ? (
                        <span className="text-slate-500">
                          {' '}({autopilotStrategy.label})
                        </span>
                      ) : null}
                      <span className="text-slate-600"> | Effettivo: </span>
                      <span className="font-mono font-semibold tabular-nums text-cyan-200">
                        {formatKcal(effectiveDelta)} kcal
                      </span>
                    </>
                  ) : (
                    <span className="ml-1 text-slate-500">· in fascia</span>
                  )}
                </>
              ) : (
                <>
                  Debito 48h
                  <span className="ml-1 font-mono tabular-nums text-orange-300">
                    {formatKcal(netDebt)}
                  </span>
                </>
              )}
              {remainingDebt > 0 && ghostAutoPilotEnabled ? (
                <span className="ml-1 text-slate-500">
                  · resto {formatKcal(remainingDebt)}
                </span>
              ) : null}
            </p>
          ) : (
            <p className="min-w-0 flex-1 text-[10px] text-slate-500">
              {ghostAutoPilotEnabled
                ? `${autopilotIcon} AUTOPILOTA ON: nessun debito metabolico nelle ultime 48h`
                : 'Nessun debito metabolico nelle ultime 48h'}
            </p>
          )}
        </div>
        <p className="mt-1.5 font-mono text-[10px] tabular-nums text-slate-400">
          Manuale {formatKcal(savedDelta)}
          {ghostAutoPilotEnabled && autoDelta !== 0 ? (
            <>
              <span className="text-slate-600"> + Auto </span>
              {formatKcal(autoDelta)}
            </>
          ) : null}
          <span className="text-slate-600"> = </span>
          <span className="font-semibold text-cyan-200">{formatKcal(effectiveDelta)}</span>
          <span className="ml-1 text-slate-600">kcal/g effettive</span>
        </p>
      </div>

      {/* Slider sotto il grafico: la mano non copre le curve su mobile */}
      <div className="ghost-sim-slider mt-3" role="group" aria-label="Delta calorico giornaliero simulato">
        <div className="mb-1 flex items-baseline justify-between gap-2 px-0.5">
          <p className="min-w-0">
            <span className="font-mono text-sm font-semibold tabular-nums text-cyan-200">
              {deltaDisplay}
            </span>
            <span className="ml-1 text-[10px] text-slate-500">kcal/g</span>
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
              {smartLabel}
            </span>
          </p>
          {isPreview ? (
            <span className="shrink-0 text-[9px] text-amber-400/90">anteprima</span>
          ) : (
            <span className="shrink-0 text-[9px] text-emerald-500/80">salvato</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => adjustSliderDelta(-GHOST_SIM_DELTA_STEP)}
            disabled={isApplying || sliderDelta <= GHOST_SIM_DELTA_MIN}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-slate-900/80 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            aria-label="Diminuisci delta"
          >
            −
          </button>
          <input
            type="range"
            min={GHOST_SIM_DELTA_MIN}
            max={GHOST_SIM_DELTA_MAX}
            step={GHOST_SIM_DELTA_STEP}
            value={sliderDelta}
            onChange={(e) => setSliderDelta(clampGhostSimDelta(Number(e.target.value)))}
            disabled={isApplying}
            aria-valuemin={GHOST_SIM_DELTA_MIN}
            aria-valuemax={GHOST_SIM_DELTA_MAX}
            aria-valuenow={sliderDelta}
            aria-valuetext={`${deltaDisplay} kcal/g · ${smartLabel}`}
            className="ghost-sim-slider__input min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={() => adjustSliderDelta(GHOST_SIM_DELTA_STEP)}
            disabled={isApplying || sliderDelta >= GHOST_SIM_DELTA_MAX}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-slate-900/80 text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            aria-label="Aumenta delta"
          >
            +
          </button>
        </div>
        <div className="mt-0.5 flex justify-between px-0.5 font-mono text-[9px] text-slate-600">
          <span>−1000</span>
          <span>0</span>
          <span>+1000</span>
        </div>
      </div>

      {applyFeedback ? (
        <p
          role="status"
          className="mt-2 rounded-lg border border-emerald-400/35 bg-emerald-950/30 px-2.5 py-1.5 text-center text-[10px] font-semibold text-emerald-100"
        >
          ✓ {applyFeedback}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-slate-900/40 px-2.5 py-2">
        <button
          type="button"
          onClick={handleReset}
          disabled={isApplying}
          className="rounded-md border border-white/15 bg-slate-900/80 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          Ripristina
        </button>
        <button
          type="button"
          onClick={handleApply}
          disabled={isApplying}
          className="ml-auto rounded-md border border-cyan-400/40 bg-cyan-500/20 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50"
        >
          {isApplying ? 'Applico…' : 'Applica obiettivo'}
        </button>
      </div>

      {compensationStatus.isActive ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-950/25 px-2.5 py-2">
          <p className="min-w-0 flex-1 text-[10px] leading-snug text-violet-100/90">
            Rientro attivo:
            <span className="ml-1 font-mono tabular-nums text-violet-200">
              {formatKcal(compensationStatus.dailyDelta)} kcal/g
            </span>
            <span className="ml-1 text-violet-300/80">
              · {compensationStatus.daysRemaining}g rimast
              {compensationStatus.daysRemaining === 1 ? 'o' : 'i'}
            </span>
          </p>
          {!showRientroPanel ? (
            <>
              <button
                type="button"
                onClick={openRientroPanel}
                className="rounded-md border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-100"
              >
                Modifica
              </button>
              <button
                type="button"
                onClick={handleClearCompensation}
                disabled={isSavingCompensation || typeof onClearCompensation !== 'function'}
                className="rounded-md border border-white/15 bg-slate-900/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 disabled:opacity-50"
              >
                Annulla
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {!compensationStatus.isActive && showRientroTrigger && !showRientroPanel ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={openRientroPanel}
            className="w-full rounded-lg border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-950/45"
          >
            Pianifica Rientro
            <span className="ml-2 font-mono font-normal normal-case tracking-normal text-amber-200/80">
              scostamento {formatKcal(deviation)} kcal
            </span>
          </button>
        </div>
      ) : null}

      {showRientroPanel ? (
        <div
          className="mt-2 rounded-lg border border-amber-500/35 bg-amber-950/20 px-3 py-3"
          role="dialog"
          aria-label="Consiglio di Giunta — compensazione esplicita"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200/90">
                Consiglio di Giunta
              </p>
              <p className="mt-1 text-[11px] text-slate-300">
                Scostamento accumulato:
                <span className="ml-1 font-mono font-semibold text-amber-100">
                  {formatKcal(deviation)} kcal
                </span>
              </p>
              <p className="mt-0.5 text-[9px] text-slate-500">
                Proposta: tetto ±{COMPENSATION_MAX_DAILY_SUGGEST_KCAL} kcal/g · niente tagli automatici
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRientroPanel(false)}
              className="rounded-md border border-white/10 bg-slate-900/60 px-2 py-1 text-[10px] text-slate-400"
              aria-label="Chiudi consiglio"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[9px] uppercase tracking-wide text-slate-500">
              Giorni
              <input
                type="number"
                min={COMPENSATION_DAYS_MIN}
                max={COMPENSATION_DAYS_MAX}
                step={1}
                value={rientroDays}
                onChange={(e) => setRientroDays(clampCompensationDays(e.target.value))}
                className="rounded-md border border-white/15 bg-black/40 px-2 py-1.5 font-mono text-sm tabular-nums text-slate-100 outline-none focus:border-amber-400/50"
              />
            </label>
            <label className="flex flex-col gap-1 text-[9px] uppercase tracking-wide text-slate-500">
              Delta giornaliero
              <input
                type="number"
                min={-COMPENSATION_DAILY_ABS_MAX}
                max={COMPENSATION_DAILY_ABS_MAX}
                step={10}
                value={rientroDailyDelta}
                onChange={(e) => setRientroDailyDelta(clampCompensationDaily(e.target.value))}
                className="rounded-md border border-white/15 bg-black/40 px-2 py-1.5 font-mono text-sm tabular-nums text-slate-100 outline-none focus:border-amber-400/50"
              />
            </label>
          </div>

          <p className="mt-2 font-mono text-[10px] tabular-nums text-slate-400">
            Totale piano: {formatKcal(rientroDays * rientroDailyDelta)} kcal
            {' · '}
            {rientroDays}g × {formatKcal(rientroDailyDelta)}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const proposal = proposeCompensationPlan(deviation);
                setRientroDays(proposal.days || rientroDays);
                setRientroDailyDelta(proposal.dailyDelta || rientroDailyDelta);
              }}
              className="rounded-md border border-white/15 bg-slate-900/70 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300"
            >
              Riproponi
            </button>
            <button
              type="button"
              onClick={handleConfirmCompensation}
              disabled={
                isSavingCompensation
                || typeof onConfirmCompensation !== 'function'
                || clampCompensationDaily(rientroDailyDelta) === 0
              }
              className="ml-auto rounded-md border border-amber-400/40 bg-amber-500/20 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
            >
              {isSavingCompensation ? 'Salvo…' : 'Conferma'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
