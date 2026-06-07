import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { get, ref, set } from 'firebase/database';
import WorkoutView from '../../../drawers/vistas/WorkoutView';
import {
  createDayBlock,
  createEmptyWeeklyBlockPlan,
  draftFromPlansForIsoWindow,
  isUserAssignedDayBlock,
  resolveBlockKcalTarget,
  sanitizeWeeklyBlockPlanFromFirebase,
  stripUndefinedDeep,
  weeklyBlockPlanToFirebasePayload,
} from '../weeklyBlockSchema';
import { getWeekStartMondayKeyLocal } from '../../../weeklyPlanning';
import {
  activityLabelFromBlock,
  buildDayBlockFromPlannerAction,
  buildPlannerComboHistoryFromDraft,
  intensityFromBlock,
  plannerInitialDataFromDayBlock,
} from '../activityCatalog';
import {
  distributeCalories,
  getWeeklyTargetLabel,
  WEEKLY_TARGET_RANGE,
} from '../utils/calorieDistributor';
import BalanceEditor from './BalanceEditor';
import './WeeklyBuilderHeatmapSlider.css';

const DRAFT_PROFILE_KCAL = 2200;

/** Obiettivi macro rapidi (chip sotto lo slider). */
const WEEKLY_TARGET_PRESETS = [
  { label: 'DEF ++', val: -1400 },
  { label: 'DEF +', val: -700 },
  { label: 'ZERO', val: 0 },
  { label: 'MASS +', val: 1400 },
  { label: 'MASS ++', val: 2100 },
];

/** Distanza massima (kcal) per calare luminosità chip → 0. */
const CHIP_PROXIMITY_SPAN = 700;

/**
 * @param {number} value
 * @returns {number} 0–100
 */
function sliderValuePercent(value) {
  const { min, max } = WEEKLY_TARGET_RANGE;
  const span = max - min;
  if (span <= 0) return 50;
  return Math.max(0, Math.min(100, ((Number(value) - min) / span) * 100));
}

/**
 * @param {number} current
 * @param {number} target
 * @returns {number} 0–1
 */
function chipProximityWeight(current, target) {
  return Math.max(0, Math.min(1, 1 - Math.abs(current - target) / CHIP_PROXIMITY_SPAN));
}

/** @typedef {import('../weeklyBlockSchema').DayBlock} DayBlock */

/**
 * @typedef {object} DynamicWeekDay
 * @property {string} key — ISO YYYY-MM-DD (chiave draftBlocks / Firebase)
 * @property {string} isoDate
 * @property {string} label — nome giorno (es. Mercoledì)
 * @property {string} short — abbreviazione (es. Mer)
 * @property {string} temporalLabel — Oggi, Domani o data breve
 * @property {number} dayOffset — 0 = oggi
 */

const IT_WEEKDAY_NAMES = [
  'Domenica',
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
];
const IT_WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

/**
 * @param {Date} [anchor]
 * @returns {string}
 */
function toLocalIsoDate(anchor) {
  const d = anchor instanceof Date ? anchor : new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Finestra mobile di 7 giorni a partire da oggi (o da `anchor`).
 * @param {Date} [anchor]
 * @returns {DynamicWeekDay[]}
 */
export function getDynamicWeekDays(anchor = new Date()) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  /** @type {DynamicWeekDay[]} */
  const days = [];

  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const isoDate = toLocalIsoDate(d);
    const dow = d.getDay();
    let temporalLabel;
    if (i === 0) temporalLabel = 'Oggi';
    else if (i === 1) temporalLabel = 'Domani';
    else temporalLabel = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });

    days.push({
      key: isoDate,
      isoDate,
      label: IT_WEEKDAY_NAMES[dow],
      short: IT_WEEKDAY_SHORT[dow],
      temporalLabel,
      dayOffset: i,
    });
  }

  return days;
}

/**
 * @param {DynamicWeekDay[] | null | undefined} [dynamicDays]
 * @returns {Record<string, DayBlock | null>}
 */
function createEmptyDraftBlocks(dynamicDays) {
  const days =
    Array.isArray(dynamicDays) && dynamicDays.length > 0 ? dynamicDays : getDynamicWeekDays();
  /** @type {Record<string, DayBlock | null>} */
  const blocks = {};
  days.forEach(({ key }) => {
    if (!key) return;
    blocks[key] = null;
  });
  return blocks;
}

/**
 * @param {string[]} isoDates
 * @returns {Record<string, string[]>}
 */
function groupIsoDatesByWeekMonday(isoDates) {
  /** @type {Record<string, string[]>} */
  const groups = {};
  isoDates.forEach((iso) => {
    const weekMonday = getWeekStartMondayKeyLocal(iso);
    if (!groups[weekMonday]) groups[weekMonday] = [];
    groups[weekMonday].push(iso);
  });
  return groups;
}

/**
 * @param {DayBlock} block
 * @param {number} deltaKcal
 * @returns {DayBlock}
 */
function applyDeltaToBlock(block, deltaKcal) {
  const delta = Math.round(Number(deltaKcal) || 0);
  const status = delta > 0 ? 'surplus' : delta < 0 ? 'deficit' : 'maintenance';
  return {
    ...block,
    calorieStrategy: {
      ...block.calorieStrategy,
      status,
      deltaKcal: delta,
      profileKcalBase: block.calorieStrategy?.profileKcalBase ?? DRAFT_PROFILE_KCAL,
    },
    meta: { ...block.meta, source: 'user', updatedAt: Date.now() },
  };
}

/**
 * @param {DayBlock | null | undefined} block
 * @returns {string}
 */
function formatBurnKcal(block) {
  const burn = Number(block?.activity?.estimatedBurnKcal) || 0;
  if (burn <= 0) return '0 KCAL';
  return `− ${burn.toLocaleString('it-IT')} KCAL`;
}

/**
 * @param {DayBlock | null | undefined} block
 * @returns {string}
 */
function formatDeltaKcal(block) {
  const delta = Number(block?.calorieStrategy?.deltaKcal) || 0;
  if (delta > 0) return `+ ${delta.toLocaleString('it-IT')} KCAL`;
  if (delta < 0) return `${delta.toLocaleString('it-IT')} KCAL`;
  return '0 KCAL';
}

/**
 * @param {import('../weeklyBlockSchema').WeeklyBlockPlan} plan
 * @param {string} isoDate
 * @param {DayBlock} draft
 */
function mergeDraftIntoPlanBlock(plan, isoDate, draft) {
  plan.blocks[isoDate] = createDayBlock(isoDate, draft.activity, draft.calorieStrategy, {
    ...draft.meta,
    source: 'user',
    updatedAt: Date.now(),
  });
}

/** @param {Record<string, DayBlock | null>} draftBlocks @param {DynamicWeekDay[]} dynamicDays */
function computeDistributedDeltaSum(draftBlocks, dynamicDays) {
  return dynamicDays.reduce((sum, { key }) => {
    const block = draftBlocks[key];
    return sum + (block ? Number(block.calorieStrategy?.deltaKcal) || 0 : 0);
  }, 0);
}

/**
 * @param {DayBlock | null | undefined} block
 */
function hasActionBlock(block) {
  return isUserAssignedDayBlock(block);
}

/**
 * @param {Record<string, DayBlock | null>} draftBlocks
 * @param {DynamicWeekDay[]} dynamicDays
 */
function buildActionsFingerprint(draftBlocks, dynamicDays) {
  return dynamicDays.map(({ key }) => {
    const block = draftBlocks[key];
    if (!hasActionBlock(block)) return `${key}:empty`;
    return [
      key,
      block.meta?.plannerWorkoutType ?? '',
      block.meta?.plannerIntensity ?? intensityFromBlock(block),
      block.activity?.kind ?? '',
      (block.activity?.focus || []).join('+'),
      block.activity?.estimatedBurnKcal ?? 0,
    ].join(':');
  }).join('|');
}

function computeDraftSummary(draftBlocks, dynamicDays, profileKcal = DRAFT_PROFILE_KCAL) {
  const filled = dynamicDays.map(({ key }) => draftBlocks[key]).filter(Boolean);
  const totalKcal = filled.reduce(
    (sum, block) => sum + resolveBlockKcalTarget(block, profileKcal),
    0
  );
  const filledCount = filled.length;
  const meanKcal = filledCount > 0 ? Math.round(totalKcal / filledCount) : 0;

  return {
    totalKcal,
    meanKcal,
    filledCount,
    totalSlots: dynamicDays.length,
  };
}

/**
 * @param {{
 *   localSliderValue: number,
 *   onLocalChange: (value: number) => void,
 *   onRelease: (value: number) => void,
 *   committedLabel: string,
 * }} props
 */
function HeatmapBudgetSlider({ localSliderValue, onLocalChange, onRelease, committedLabel }) {
  const [isSettled, setIsSettled] = useState(true);
  const thumbPercent = sliderValuePercent(localSliderValue);

  const handleRelease = useCallback(
    (input) => {
      const released = Number(input.value);
      setIsSettled(true);
      onRelease(released);
    },
    [onRelease]
  );

  return (
    <div className="weekly-heatmap-slider-wrap">
      <input
        type="range"
        min={WEEKLY_TARGET_RANGE.min}
        max={WEEKLY_TARGET_RANGE.max}
        step={WEEKLY_TARGET_RANGE.step}
        value={localSliderValue}
        onChange={(e) => onLocalChange(Number(e.target.value))}
        onPointerDown={() => setIsSettled(false)}
        onPointerUp={(e) => handleRelease(e.currentTarget)}
        onPointerCancel={(e) => handleRelease(e.currentTarget)}
        onKeyUp={(e) => {
          if (
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' ||
            e.key === 'ArrowUp' ||
            e.key === 'ArrowDown' ||
            e.key === 'Home' ||
            e.key === 'End'
          ) {
            handleRelease(e.currentTarget);
          }
        }}
        className={`weekly-heatmap-slider${isSettled ? ' weekly-heatmap-slider--settled' : ''}`}
        aria-label="Budget calorico settimanale"
        aria-valuetext={
          isSettled ? committedLabel : `${getWeeklyTargetLabel(localSliderValue)} (anteprima)`
        }
      />
      <div className="weekly-heatmap-indicator-track" aria-hidden>
        <div
          className="weekly-heatmap-indicator weekly-heatmap-indicator--visible"
          style={{ left: `${thumbPercent}%` }}
        >
          <span className="weekly-heatmap-indicator-arrow" />
          <span className="weekly-heatmap-indicator-line" />
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   weeklyTargetKcal: number,
 *   localSliderValue: number,
 *   onLocalSliderChange: (value: number) => void,
 *   onSliderRelease: (value: number) => void,
 *   onPresetSelect: (value: number) => void,
 *   dynamicDays: DynamicWeekDay[],
 *   draftBlocks: Record<string, DayBlock | null>,
 *   isDistributed: boolean,
 *   allActionsAssigned: boolean,
 * }} props
 */
function MacroStrategyHeader({
  weeklyTargetKcal,
  localSliderValue,
  onLocalSliderChange,
  onSliderRelease,
  onPresetSelect,
  dynamicDays,
  draftBlocks,
  isDistributed,
  allActionsAssigned,
}) {
  const { totalKcal, meanKcal, filledCount, totalSlots } = useMemo(
    () => computeDraftSummary(draftBlocks, dynamicDays),
    [draftBlocks, dynamicDays]
  );
  const distributedSum = useMemo(
    () => computeDistributedDeltaSum(draftBlocks, dynamicDays),
    [draftBlocks, dynamicDays]
  );
  const targetLabel = getWeeklyTargetLabel(weeklyTargetKcal);
  const sliderDrift = isDistributed && distributedSum !== weeklyTargetKcal;
  const isSliderPreviewing = localSliderValue !== weeklyTargetKcal;

  return (
    <header className="sticky top-0 z-10 -mx-1 mb-4 rounded-xl border border-slate-700/80 bg-slate-900/95 px-4 py-4 shadow-lg backdrop-blur-md">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        Cabina di regia — Macro-Strategia
      </p>

      <div className="mb-3">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-xs font-medium text-slate-400">Budget settimanale</span>
          <span className="text-sm font-bold text-cyan-300">
            {targetLabel}
            {isSliderPreviewing ? (
              <span className="ml-1.5 text-[10px] font-medium text-slate-500">
                → anteprima {getWeeklyTargetLabel(localSliderValue)}
              </span>
            ) : null}
          </span>
        </div>
        <HeatmapBudgetSlider
          localSliderValue={localSliderValue}
          onLocalChange={onLocalSliderChange}
          onRelease={onSliderRelease}
          committedLabel={targetLabel}
        />
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-600">
          <span>{WEEKLY_TARGET_RANGE.min}</span>
          <span>0</span>
          <span>+{WEEKLY_TARGET_RANGE.max}</span>
        </div>
        <div
          className="mt-3 grid w-full grid-cols-5 gap-1"
          role="group"
          aria-label="Obiettivi macro rapidi"
        >
          {WEEKLY_TARGET_PRESETS.map(({ label, val }) => {
            const proximity = chipProximityWeight(localSliderValue, val);
            const isActive = proximity >= 0.55;
            const chipOpacity = 0.42 + proximity * 0.58;
            const chipBrightness = 0.78 + proximity * 0.42;
            const borderAlpha = 0.25 + proximity * 0.75;
            const textAlpha = 0.45 + proximity * 0.55;

            return (
              <button
                key={val}
                type="button"
                onClick={() => onPresetSelect(val)}
                aria-pressed={proximity >= 0.92}
                title={getWeeklyTargetLabel(val)}
                style={{
                  opacity: chipOpacity,
                  filter: `brightness(${chipBrightness})`,
                  borderColor: isActive
                    ? `rgba(34, 211, 238, ${borderAlpha})`
                    : 'rgba(71, 85, 105, 0.65)',
                  color: isActive
                    ? `rgba(226, 232, 240, ${textAlpha})`
                    : 'rgba(148, 163, 184, 0.75)',
                  backgroundColor: isActive
                    ? `rgba(34, 211, 238, ${0.08 + proximity * 0.22})`
                    : `rgba(30, 41, 59, ${0.55 + proximity * 0.35})`,
                }}
                className={`weekly-heatmap-chip min-w-0 border px-0.5 py-2 text-center text-[9px] font-bold truncate rounded hover:brightness-110 sm:text-[10px]${
                  isActive ? ' active ring-2 ring-cyan-400' : ''
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {sliderDrift ? (
          <p className="mt-1 text-[10px] text-amber-400/90">
            Override manuali: Σ reale {distributedSum >= 0 ? '+' : ''}
            {distributedSum.toLocaleString('it-IT')} kcal
          </p>
        ) : null}
        {allActionsAssigned && isDistributed ? (
          <p className="mt-1 text-[10px] text-cyan-400/90">
            {isSliderPreviewing
              ? 'Rilascia lo slider per applicare il nuovo budget ai bilanci'
              : 'Trascina lo slider e rilascia per aggiornare i bilanci'}
          </p>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-slate-700/60 pt-3">
        <span className="text-sm font-bold tabular-nums text-slate-50">
          Σ delta {distributedSum >= 0 ? '+' : ''}
          {distributedSum.toLocaleString('it-IT')} kcal
        </span>
        <span className="text-sm text-slate-500">|</span>
        <span className="text-sm tabular-nums text-slate-400">
          Target assoluto {totalKcal.toLocaleString('it-IT')} kcal
        </span>
        <span className="text-sm text-slate-500">|</span>
        <span className="text-sm font-medium tabular-nums text-cyan-400">
          Media {meanKcal.toLocaleString('it-IT')}/g
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {filledCount}/{totalSlots} azioni assegnate
        {!allActionsAssigned ? ' — compila tutti e 7 i giorni per sbloccare i bilanci' : ''}
        {allActionsAssigned && isDistributed ? ' — bilanci aggiornati in tempo reale' : ''}
      </p>
    </header>
  );
}

/**
 * @param {{
 *   day: DynamicWeekDay,
 *   block: DayBlock | null,
 *   isDistributed: boolean,
 *   onActionClick: () => void,
 *   onBalanceClick: () => void,
 * }} props
 */
function DayCard({ day, block, isDistributed, onActionClick, onBalanceClick }) {
  const hasAction = block != null;
  const delta = Number(block?.calorieStrategy?.deltaKcal) || 0;
  const balanceUnlocked = isDistributed && hasAction;

  const balanceTone = balanceUnlocked
    ? delta > 0
      ? 'border-emerald-500/40 bg-emerald-950/50 text-emerald-300 hover:border-emerald-400/60 cursor-pointer'
      : delta < 0
        ? 'border-violet-500/40 bg-violet-950/50 text-violet-300 hover:border-violet-400/60 cursor-pointer'
        : 'border-slate-500/40 bg-slate-800/80 text-slate-300 hover:border-slate-400/60 cursor-pointer'
    : 'border-slate-700/50 bg-slate-900/70 text-slate-500 opacity-50 cursor-not-allowed';

  return (
    <article className="rounded-xl border border-slate-600/60 bg-slate-900/60 p-3 shadow-md backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-200">{day.label}</p>
          <p
            className={`text-[10px] uppercase tracking-wide ${
              day.dayOffset <= 1 ? 'font-semibold text-cyan-400/90' : 'text-slate-500'
            }`}
          >
            {day.temporalLabel}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onActionClick}
          className="rounded-lg border border-amber-500/35 bg-gradient-to-br from-amber-950/70 to-orange-950/40 px-3 py-3 text-left transition-colors hover:border-amber-400/55 hover:from-amber-950/90"
        >
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-amber-500/80">
            Azione
          </p>
          {hasAction ? (
            <>
              <p className="truncate text-sm font-semibold text-amber-100">
                {activityLabelFromBlock(block)}
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums tracking-tight text-amber-300">
                {formatBurnKcal(block)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-medium text-amber-200/40">Seleziona Allenamento</p>
          )}
        </button>

        <button
          type="button"
          onClick={balanceUnlocked ? onBalanceClick : undefined}
          disabled={!balanceUnlocked}
          className={`rounded-lg border px-3 py-3 text-left transition-colors ${balanceTone}`}
        >
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest opacity-80">
            Bilancio
          </p>
          {balanceUnlocked ? (
            <>
              <p className="text-sm font-medium opacity-90">
                {delta > 0 ? 'Surplus' : delta < 0 ? 'Deficit' : 'Neutro'}
              </p>
              <p className="mt-2 text-lg font-bold tabular-nums tracking-tight">
                {formatDeltaKcal(block)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-medium">Compila i 7 giorni…</p>
          )}
        </button>
      </div>
    </article>
  );
}

/**
 * @param {{
 *   db: import('firebase/database').Database | null | undefined,
 *   userUid: string | null | undefined,
 *   weekStart: string | null | undefined,
 *   authReady?: boolean,
 *   onSaveSuccess?: () => void,
 * }} [props]
 */
export default function WeeklyBuilder({
  db,
  userUid,
  weekStart,
  authReady = true,
  onSaveSuccess,
} = {}) {
  const dynamicDays = useMemo(() => getDynamicWeekDays(), []);
  const dynamicIsoKeys = useMemo(() => dynamicDays.map((d) => d.key), [dynamicDays]);
  const primaryWeekMonday = useMemo(
    () => getWeekStartMondayKeyLocal(weekStart || undefined),
    [weekStart]
  );
  const weekMondaysInWindow = useMemo(() => {
    const unique = new Set(dynamicIsoKeys.map((iso) => getWeekStartMondayKeyLocal(iso)));
    return [...unique];
  }, [dynamicIsoKeys]);

  const [draftBlocks, setDraftBlocks] = useState(() => createEmptyDraftBlocks(getDynamicWeekDays()));
  const [weeklyTargetKcal, setWeeklyTargetKcal] = useState(WEEKLY_TARGET_RANGE.default);
  const [localSliderValue, setLocalSliderValue] = useState(WEEKLY_TARGET_RANGE.default);
  const [isDistributed, setIsDistributed] = useState(false);
  const [actionEditorDayKey, setActionEditorDayKey] = useState(/** @type {string | null} */ (null));
  const [balanceEditorDayKey, setBalanceEditorDayKey] = useState(/** @type {string | null} */ (null));
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [planReady, setPlanReady] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(
    /** @type {{ type: 'success' | 'error', message: string } | null} */ (null)
  );
  const skipInitialDistributeRef = useRef(false);

  const plannerComboHistory = useMemo(
    () => buildPlannerComboHistoryFromDraft(draftBlocks, actionEditorDayKey ?? undefined),
    [draftBlocks, actionEditorDayKey]
  );

  const allActionsAssigned = useMemo(
    () => dynamicDays.every(({ key }) => hasActionBlock(draftBlocks[key])),
    [draftBlocks, dynamicDays]
  );

  const actionsFingerprint = useMemo(
    () => buildActionsFingerprint(draftBlocks, dynamicDays),
    [draftBlocks, dynamicDays]
  );

  useEffect(() => {
    setLocalSliderValue(weeklyTargetKcal);
  }, [weeklyTargetKcal]);

  const handleSliderRelease = useCallback((releasedValue) => {
    const val = Math.round(Number(releasedValue));
    if (!Number.isFinite(val)) return;
    setWeeklyTargetKcal(val);
  }, []);

  const handlePresetSelect = useCallback((val) => {
    const rounded = Math.round(Number(val));
    if (!Number.isFinite(rounded)) return;
    setLocalSliderValue(rounded);
    setWeeklyTargetKcal(rounded);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const uid = userUid?.trim();

    if (!authReady) return undefined;

    setIsLoadingPlan(true);
    setPlanReady(false);
    skipInitialDistributeRef.current = false;

    if (!db || !uid) {
      setDraftBlocks(createEmptyDraftBlocks(dynamicDays));
      setWeeklyTargetKcal(WEEKLY_TARGET_RANGE.default);
      setIsDistributed(false);
      setIsLoadingPlan(false);
      setPlanReady(true);
      return undefined;
    }

    Promise.all(
      weekMondaysInWindow.map(async (weekMonday) => {
        const snap = await get(ref(db, `users/${uid}/weeklyBlockPlan/${weekMonday}`));
        return { weekMonday, raw: snap.exists() ? snap.val() : null };
      })
    )
      .then((entries) => {
        if (cancelled) return;
        /** @type {Record<string, unknown>} */
        const plansByWeekMonday = {};
        entries.forEach(({ weekMonday, raw }) => {
          if (raw) plansByWeekMonday[weekMonday] = raw;
        });

        const hasAnyPlan = Object.keys(plansByWeekMonday).length > 0;
        if (!hasAnyPlan) {
          setDraftBlocks(createEmptyDraftBlocks(dynamicDays));
          setWeeklyTargetKcal(WEEKLY_TARGET_RANGE.default);
          setIsDistributed(false);
          return;
        }

        const { draftBlocks: loaded, weeklyTargetKcal: wTarget, allActionsAssigned: complete } =
          draftFromPlansForIsoWindow(
            dynamicIsoKeys,
            plansByWeekMonday,
            primaryWeekMonday,
            WEEKLY_TARGET_RANGE.default
          );
        setDraftBlocks(loaded);
        setWeeklyTargetKcal(wTarget);
        if (complete) {
          skipInitialDistributeRef.current = true;
          setIsDistributed(true);
        } else {
          setIsDistributed(false);
        }
      })
      .catch((err) => {
        console.error('[WeeklyBuilder] Caricamento piano fallito:', err);
        if (!cancelled) {
          setSaveFeedback({
            type: 'error',
            message: 'Errore nel caricamento del piano salvato.',
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPlan(false);
          setPlanReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, db, dynamicDays, dynamicIsoKeys, primaryWeekMonday, userUid, weekMondaysInWindow]);

  useEffect(() => {
    if (!planReady) return;

    if (!allActionsAssigned) {
      setIsDistributed(false);
      return;
    }

    if (skipInitialDistributeRef.current) {
      skipInitialDistributeRef.current = false;
      setIsDistributed(true);
      return;
    }

    const daysList = dynamicDays.map(({ key }) => ({
      dayKey: key,
      intensity: intensityFromBlock(draftBlocks[key]),
    }));

    const distributed = distributeCalories(weeklyTargetKcal, daysList);

    setDraftBlocks((prev) => {
      let changed = false;
      const next = { ...prev };
      distributed.forEach(({ dayKey, deltaKcal }) => {
        const block = prev[dayKey];
        if (!block) return;
        const rounded = Math.round(deltaKcal);
        const current = Math.round(Number(block.calorieStrategy?.deltaKcal) || 0);
        if (current !== rounded) changed = true;
        next[dayKey] = applyDeltaToBlock(block, rounded);
      });
      return changed ? next : prev;
    });
    setIsDistributed(true);
  }, [planReady, weeklyTargetKcal, actionsFingerprint, allActionsAssigned, dynamicDays]);

  const applyPlannerAction = useCallback(
    (action) => {
      const dayKey = actionEditorDayKey;
      if (!dayKey || !action) return;
      setDraftBlocks((prev) => ({
        ...prev,
        [dayKey]: buildDayBlockFromPlannerAction(dayKey, action, prev[dayKey]),
      }));
      setActionEditorDayKey(null);
    },
    [actionEditorDayKey]
  );

  const applyBalanceBlock = useCallback(
    (block) => {
      const dayKey = balanceEditorDayKey;
      if (!dayKey) return;
      setDraftBlocks((prev) => ({
        ...prev,
        [dayKey]: block,
      }));
      setBalanceEditorDayKey(null);
    },
    [balanceEditorDayKey]
  );

  const handleSaveWeek = useCallback(async () => {
    if (isSaving) return;

    const uid = userUid?.trim();

    if (!authReady) {
      setSaveFeedback({ type: 'error', message: 'Autenticazione in corso…' });
      return;
    }

    if (!db || !uid) {
      setSaveFeedback({ type: 'error', message: 'Devi essere loggato per salvare la settimana.' });
      return;
    }

    if (!allActionsAssigned) {
      setSaveFeedback({
        type: 'error',
        message: 'Compila tutti e 7 i giorni prima di salvare la pianificazione.',
      });
      return;
    }

    setIsSaving(true);
    setSaveFeedback(null);

    try {
      const weekGroups = groupIsoDatesByWeekMonday(dynamicIsoKeys);

      await Promise.all(
        Object.entries(weekGroups).map(async ([weekMonday, isoDates]) => {
          const planRef = ref(db, `users/${uid}/weeklyBlockPlan/${weekMonday}`);
          const snap = await get(planRef);
          const plan = snap.exists()
            ? sanitizeWeeklyBlockPlanFromFirebase(snap.val(), weekMonday)
            : createEmptyWeeklyBlockPlan(weekMonday);

          isoDates.forEach((isoDate) => {
            const draft = draftBlocks[isoDate];
            if (!draft || !hasActionBlock(draft)) return;
            mergeDraftIntoPlanBlock(plan, isoDate, draft);
          });

          if (weekMonday === primaryWeekMonday) {
            plan.weeklyKcalTarget = Math.round(Number(weeklyTargetKcal) || 0);
          }

          const payload = stripUndefinedDeep(weeklyBlockPlanToFirebasePayload(plan));
          await set(planRef, payload);
        })
      );

      setSaveFeedback({ type: 'success', message: 'Settimana salvata! La Livella a Bolla si aggiornerà.' });
      if (typeof onSaveSuccess === 'function') {
        window.setTimeout(() => onSaveSuccess(), 1400);
      }
    } catch (err) {
      console.error('[WeeklyBuilder] Salvataggio fallito:', err);
      setSaveFeedback({
        type: 'error',
        message: 'Errore di rete durante il salvataggio. Riprova.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    allActionsAssigned,
    authReady,
    db,
    draftBlocks,
    dynamicIsoKeys,
    isSaving,
    onSaveSuccess,
    primaryWeekMonday,
    userUid,
    weeklyTargetKcal,
  ]);

  if (isLoadingPlan) {
    return (
      <div className="mx-auto flex min-h-[40vh] w-full max-w-lg flex-col items-center justify-center px-3 py-12 text-slate-100">
        <p className="text-sm font-medium text-slate-400">Caricamento piano in corso…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg px-3 py-4 text-slate-100">
      <div className="mb-2">
        <h2 className="text-lg font-bold text-slate-50">Costruttore della Settimana</h2>
        <p className="text-sm text-slate-500">
          Top-down: imposta il budget settimanale. Bottom-up: assegna le attività.
        </p>
      </div>

      <MacroStrategyHeader
        weeklyTargetKcal={weeklyTargetKcal}
        localSliderValue={localSliderValue}
        onLocalSliderChange={setLocalSliderValue}
        onSliderRelease={handleSliderRelease}
        onPresetSelect={handlePresetSelect}
        dynamicDays={dynamicDays}
        draftBlocks={draftBlocks}
        isDistributed={isDistributed}
        allActionsAssigned={allActionsAssigned}
      />

      <div className="flex flex-col gap-3">
        {dynamicDays.map((day) => (
          <DayCard
            key={day.key}
            day={day}
            block={draftBlocks[day.key]}
            isDistributed={isDistributed}
            onActionClick={() => setActionEditorDayKey(day.key)}
            onBalanceClick={() => setBalanceEditorDayKey(day.key)}
          />
        ))}
      </div>

      <div className="mt-8 border-t border-slate-700/60 pt-6">
        {!userUid && authReady ? (
          <p className="mb-3 text-center text-xs text-amber-400/90">
            Accedi per salvare la pianificazione su Firebase.
          </p>
        ) : null}
        {!allActionsAssigned ? (
          <p className="mb-3 text-center text-xs text-slate-500">
            Compila tutti e 7 i giorni per abilitare il salvataggio.
          </p>
        ) : null}
        <button
          type="button"
          onClick={handleSaveWeek}
          disabled={isSaving || !userUid || !authReady || !allActionsAssigned}
          className="w-full rounded-xl bg-cyan-600 py-4 text-base font-bold text-white shadow-lg shadow-cyan-900/40 transition-colors hover:bg-cyan-500 active:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? 'Salvataggio…' : 'Salva Pianificazione'}
        </button>
        <p className="mt-2 text-center text-[10px] text-slate-600">
          Le modifiche restano in bozza finché non premi Salva.
        </p>
      </div>

      {saveFeedback ? (
        <div
          role="status"
          className={`fixed bottom-24 left-1/2 z-[100002] max-w-[min(90vw,320px)] -translate-x-1/2 rounded-xl px-4 py-2.5 text-center text-sm font-semibold shadow-lg ${
            saveFeedback.type === 'success'
              ? 'border border-cyan-500/40 bg-cyan-950/95 text-cyan-200'
              : 'border border-red-500/40 bg-red-950/95 text-red-200'
          }`}
        >
          {saveFeedback.message}
        </div>
      ) : null}

      {actionEditorDayKey != null && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="presentation"
              className="fixed inset-0 z-[100001] flex items-end justify-center overflow-y-auto bg-black/75 p-3 sm:items-center"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setActionEditorDayKey(null);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className="my-auto w-full max-w-lg rounded-2xl border border-slate-600 bg-[#111] p-4 shadow-2xl"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <WorkoutView
                  isPlannerMode
                  initialData={plannerInitialDataFromDayBlock(draftBlocks[actionEditorDayKey])}
                  comboHistory={plannerComboHistory}
                  onSaveAction={applyPlannerAction}
                  onClose={() => setActionEditorDayKey(null)}
                />
              </div>
            </div>,
            document.body
          )
        : null}

      {balanceEditorDayKey != null && draftBlocks[balanceEditorDayKey] ? (
        <BalanceEditor
          dayKey={balanceEditorDayKey}
          dayLabel={(() => {
            const d = dynamicDays.find((day) => day.key === balanceEditorDayKey);
            return d ? `${d.label} · ${d.temporalLabel}` : undefined;
          })()}
          block={draftBlocks[balanceEditorDayKey]}
          onSave={applyBalanceBlock}
          onClose={() => setBalanceEditorDayKey(null)}
        />
      ) : null}
    </div>
  );
}
