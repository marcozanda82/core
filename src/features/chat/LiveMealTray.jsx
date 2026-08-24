import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Info, Sparkles } from 'lucide-react';
import AmountStepper from '../mealBuilder/components/AmountStepper';
import UniversalSearchModal from '../mealBuilder/components/UniversalSearchModal';
import FoodDetailModal from '../mealBuilder/components/FoodDetailModal';
import KentuSolverModal from '../../components/solver/KentuSolverModal';
import { KentuButton } from '../../components/kentuos/KentuOSUI';
import { getFoodIcon } from '../../utils/getFoodIcon';
import { withMealSavingOverlay } from '../../utils/mealSavingOverlayController';
import {
  draftFoodsToSolverItems,
  solverProposalToMcDriveItem,
} from '../../utils/solverEngine';
import {
  EMPTY_MCDRIVE_TOTALS,
  MCDRIVE_ADD_MORE_CHIP,
  MCDRIVE_CANCEL_CHIP,
  MCDRIVE_FINISH_CHIP,
  MCDRIVE_SAVE_CONFIRM_CHIP,
  classifyMcdriveMacroVsTarget,
  draftHasRawMcDriveItems,
  formatMcdriveMealTypeLabel,
  hasPendingMcDriveEnrichment,
  isMcDriveDisambiguationStatus,
  isMcDriveRawItem,
} from '../commandTerminal/conversation/mcdriveWizard.js';

/** Normalizza status lavagna per UI (validating → processing). */
function resolveMcDriveVisualStatus(item) {
  const status = String(item?.status || '').toLowerCase();
  if (status === 'validating') return 'processing';
  if (status === 'requires_disambiguation') return 'requires_disambiguation';
  if (status === 'raw' || status === 'processing' || status === 'pending_enrichment' || status === 'skipped' || status === 'resolved') {
    return status;
  }
  if (isMcDriveRawItem(item)) return 'raw';
  if (Number(item?.kcal) > 0 || item?.foodDbKey) return 'resolved';
  return 'raw';
}

function McDriveStatusIcon({ visualStatus, foodName, macros }) {
  if (visualStatus === 'processing') {
    return (
      <span
        className="kentu-meal-tray__status-icon inline-flex h-4 w-4 shrink-0 items-center justify-center"
        aria-hidden
      >
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-500 border-t-cyan-300" />
      </span>
    );
  }
  if (visualStatus === 'resolved') {
    return (
      <span className="kentu-meal-tray__status-icon shrink-0 text-base leading-none" aria-hidden>
        {getFoodIcon(foodName, macros)}
      </span>
    );
  }
  if (visualStatus === 'pending_enrichment' || visualStatus === 'requires_disambiguation') {
    return (
      <span className="kentu-meal-tray__status-icon shrink-0 text-sm leading-none" aria-hidden>
        ⚠️
      </span>
    );
  }
  if (visualStatus === 'skipped') {
    return (
      <span className="kentu-meal-tray__status-icon shrink-0 text-sm leading-none opacity-60" aria-hidden>
        ⚪
      </span>
    );
  }
  // raw — icona categoria soft o pallino vuoto
  return (
    <span className="kentu-meal-tray__status-icon shrink-0 text-base leading-none opacity-70" aria-hidden>
      {getFoodIcon(foodName, macros)}
    </span>
  );
}

function buildInspectFoodPayload(item) {
  const name = String(item?.foodName || item?.name || 'Alimento').trim();
  const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qta) || 100));
  const row = item?.row && typeof item.row === 'object'
    ? item.row
    : {
      desc: name,
      name,
      kcal: Number(item?.kcal) || 0,
      prot: Number(item?.pro ?? item?.prot) || 0,
      carb: Number(item?.carbo ?? item?.carb) || 0,
      fat: Number(item?.fat) || 0,
      foodDbKey: item?.foodDbKey || null,
    };
  return {
    displayTile: {
      desc: name,
      label: name,
      name,
      foodDbKey: item?.foodDbKey || row.foodDbKey || null,
      row,
      kcal: Number(row.kcal ?? item?.kcal) || 0,
      prot: Number(row.prot ?? item?.pro ?? item?.prot) || 0,
      carb: Number(row.carb ?? item?.carbo ?? item?.carb) || 0,
      fat: Number(row.fatTotal ?? row.fat ?? item?.fat) || 0,
    },
    tileVisual: { name },
    defaultUnitWeight: grams,
  };
}

function MacroCompareRow({ label, actual, target, unit = 'g' }) {
  const a = Number(actual) || 0;
  const t = Number(target) || 0;
  const status = classifyMcdriveMacroVsTarget(a, t);
  const pct = t > 0 ? Math.min(100, Math.round((a / t) * 100)) : 0;
  const actualLabel = unit === 'kcal' ? Math.round(a) : Math.round(a);
  const targetLabel = unit === 'kcal' ? Math.round(t) : Math.round(t);

  return (
    <div className={`kentu-meal-tray__macro-row kentu-meal-tray__macro-row--${status}`}>
      <div className="kentu-meal-tray__macro-row-top">
        <span className="kentu-meal-tray__macro-label">{label}</span>
        <span className="kentu-meal-tray__macro-values">
          {actualLabel}{unit === 'kcal' ? '' : unit} / {targetLabel || '—'}{unit === 'kcal' ? ' kcal' : unit}
        </span>
      </div>
      <div className="kentu-meal-tray__macro-bar" aria-hidden>
        <div
          className="kentu-meal-tray__macro-bar-fill"
          style={{ width: `${t > 0 ? pct : 0}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Lavagna McDrive: vassoio interattivo + confronto target + edit potenziato.
 */
function LiveMealTray({
  tray = null,
  active = true,
  immersive = false,
  disabled = false,
  onCancel,
  onFinish,
  onSave,
  onAddMore,
  onRemoveItem,
  onUpdateGrams,
  onUpdateMealTime = null,
  onApplyAlternative = null,
  onReplaceFromSearch = null,
  onAppendSolverItems = null,
  onRequestDisambiguation = null,
  getMealTargets = null,
  personalDb = null,
  kentuItDb = null,
  globalDb = null,
  offDb = null,
}) {
  const items = Array.isArray(tray?.items) ? tray.items : [];
  const resolvedTotals = tray?.resolvedTotals && typeof tray.resolvedTotals === 'object'
    ? tray.resolvedTotals
    : (tray?.totals && typeof tray.totals === 'object' ? tray.totals : EMPTY_MCDRIVE_TOTALS);
  const mealType = tray?.mealType || null;
  const mealTypeLabel = String(tray?.mealTypeLabel || '').trim()
    || formatMcdriveMealTypeLabel(mealType);
  const hasRaw = tray?.hasRaw === true || draftHasRawMcDriveItems(items);
  const hasDisambiguationPending = hasPendingMcDriveEnrichment(items);
  const needsCalculate = hasRaw || hasDisambiguationPending;
  const [editingIndex, setEditingIndex] = useState(null);
  const [searchIndex, setSearchIndex] = useState(null);
  const [inspectItem, setInspectItem] = useState(null);
  const [showSolverModal, setShowSolverModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [solverFeedback, setSolverFeedback] = useState(null);
  const [solverHighlightIds, setSolverHighlightIds] = useState(() => new Set());
  const solverFeedbackTimerRef = useRef(null);
  const solverHighlightTimerRef = useRef(null);
  const exactTimeValue = String(tray?.exactTime || tray?.timeString || '').trim();

  const mealTargets = useMemo(() => {
    if (typeof getMealTargets === 'function' && mealType) {
      const t = getMealTargets(mealType);
      if (t && typeof t === 'object') {
        return {
          kcal: Number(t.kcal) || 0,
          pro: Number(t.prot ?? t.pro) || 0,
          carbo: Number(t.carb ?? t.carbo) || 0,
          fat: Number(t.fat ?? t.fatTotal) || 0,
        };
      }
    }
    const fromTray = tray?.mealTargets;
    if (fromTray && typeof fromTray === 'object') {
      return {
        kcal: Number(fromTray.kcal) || 0,
        pro: Number(fromTray.pro ?? fromTray.prot) || 0,
        carbo: Number(fromTray.carbo ?? fromTray.carb) || 0,
        fat: Number(fromTray.fat ?? fromTray.fatTotal) || 0,
      };
    }
    return { ...EMPTY_MCDRIVE_TOTALS };
  }, [getMealTargets, mealType, tray?.mealTargets]);

  const hasAnyResolvedMacros = useMemo(
    () => items.some((item) => {
      const status = String(item?.status || '').toLowerCase();
      return status === 'resolved' || (!isMcDriveRawItem(item) && Number(item?.kcal) > 0);
    }),
    [items],
  );

  const hasTargets = Number(mealTargets.kcal) > 0
    || Number(mealTargets.pro) > 0
    || Number(mealTargets.carbo) > 0
    || Number(mealTargets.fat) > 0;

  const hasNutrientGap = useMemo(() => {
    if (!hasTargets) return false;
    const gapKcal = Math.max(0, Number(mealTargets.kcal) - Number(resolvedTotals.kcal));
    const gapPro = Math.max(0, Number(mealTargets.pro) - Number(resolvedTotals.pro));
    const gapCarbo = Math.max(0, Number(mealTargets.carbo) - Number(resolvedTotals.carbo));
    const gapFat = Math.max(0, Number(mealTargets.fat) - Number(resolvedTotals.fat));
    return gapKcal > 5 || gapPro > 0.5 || gapCarbo > 0.5 || gapFat > 0.5;
  }, [hasTargets, mealTargets, resolvedTotals]);

  const canOpenSolver = items.length >= 1 || hasNutrientGap;

  const solverExistingFoods = useMemo(
    () => draftFoodsToSolverItems(items),
    [items],
  );

  const solverTargets = useMemo(
    () => ({
      kcal: mealTargets.kcal,
      prot: mealTargets.pro,
      carb: mealTargets.carbo,
      fat: mealTargets.fat,
    }),
    [mealTargets],
  );

  useEffect(
    () => () => {
      if (solverFeedbackTimerRef.current) window.clearTimeout(solverFeedbackTimerRef.current);
      if (solverHighlightTimerRef.current) window.clearTimeout(solverHighlightTimerRef.current);
    },
    [],
  );

  const handleSolverApply = useCallback(
    (proposals) => {
      const confirmed = (proposals || []).filter(Boolean);
      if (confirmed.length === 0) return;

      const mcItems = confirmed.map((proposal) => solverProposalToMcDriveItem(proposal));
      onAppendSolverItems?.(mcItems);

      const nextHighlightIds = new Set(mcItems.map((item) => item.id).filter(Boolean));
      setSolverHighlightIds(nextHighlightIds);

      const label = mcItems.length === 1
        ? `Consulto: ${mcItems[0].foodName}`
        : `Consulto: ${mcItems.length} alimenti aggiunti`;
      setSolverFeedback(label);

      if (solverFeedbackTimerRef.current) window.clearTimeout(solverFeedbackTimerRef.current);
      if (solverHighlightTimerRef.current) window.clearTimeout(solverHighlightTimerRef.current);
      solverFeedbackTimerRef.current = window.setTimeout(() => setSolverFeedback(null), 2400);
      solverHighlightTimerRef.current = window.setTimeout(() => setSolverHighlightIds(new Set()), 2800);
    },
    [onAppendSolverItems],
  );

  // Solo visualizzazione LIFO: ultimo inserito in cima. Gli indici restano quelli dell'array stato.
  const displayItems = useMemo(
    () => items.map((item, index) => ({ item, index })).reverse(),
    [items],
  );

  return (
    <div
      className={
        immersive
          ? 'kentu-meal-tray kentu-meal-tray--native kentu-meal-tray--immersive relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden'
          : 'kentu-meal-tray kentu-meal-tray--native relative flex h-full max-h-[min(55vh,100%)] w-full flex-col overflow-hidden'
      }
      role="group"
      aria-label={`Calibrazione ${mealTypeLabel}`}
    >
      {/* Header fisso: flex-none — lo scroll è solo sulla lista sotto */}
      <div className="kentu-meal-tray__header kentu-meal-tray__header--calibration flex-none">
        <div className="kentu-meal-tray__calibration-title-row">
          <div className="kentu-meal-tray__calibration-title-group">
            <span className="kentu-meal-tray__badge">Calibrazione</span>
            <h3 className="kentu-meal-tray__calibration-title">{mealTypeLabel}</h3>
          </div>
          <label
            htmlFor="mcdrive-meal-time"
            className="kentu-meal-tray__time-chip inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-800/70 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition-colors hover:border-cyan-500/35"
          >
            <span aria-hidden>🕒</span>
            <input
              id="mcdrive-meal-time"
              type="time"
              value={exactTimeValue}
              onChange={(e) => {
                const next = String(e?.target?.value || '').trim();
                onUpdateMealTime?.(next);
              }}
              onClick={(e) => {
                if (typeof e?.currentTarget?.showPicker === 'function') {
                  try {
                    e.currentTarget.showPicker();
                  } catch {
                    /* ignored */
                  }
                }
              }}
              className="min-w-0 cursor-pointer border-none bg-transparent p-0 text-xs font-semibold leading-none text-cyan-200 outline-none [color-scheme:dark]"
            />
          </label>
        </div>
        {hasTargets ? (
          <div className="kentu-meal-tray__target-grid" aria-label="Confronto vassoio / target pasto">
            <MacroCompareRow label="Kcal" actual={resolvedTotals.kcal} target={mealTargets.kcal} unit="kcal" />
            <MacroCompareRow label="Proteine" actual={resolvedTotals.pro} target={mealTargets.pro} />
            <MacroCompareRow label="Carboidrati" actual={resolvedTotals.carbo} target={mealTargets.carbo} />
            <MacroCompareRow label="Grassi" actual={resolvedTotals.fat} target={mealTargets.fat} />
          </div>
        ) : (
          <div className="kentu-meal-tray__calibration-macros" aria-label="Totali risolti sul vassoio">
            {hasAnyResolvedMacros ? (
              <>
                <span>{Math.round(Number(resolvedTotals.kcal) || 0)} kcal</span>
                <span>P {Math.round(Number(resolvedTotals.pro) || 0)}g</span>
                <span>C {Math.round(Number(resolvedTotals.carbo) || 0)}g</span>
                <span>G {Math.round(Number(resolvedTotals.fat) || 0)}g</span>
              </>
            ) : (
              <>
                <span>— kcal</span>
                <span>P —</span>
                <span>C —</span>
                <span>G —</span>
              </>
            )}
          </div>
        )}
      </div>

      <div
        className={
          immersive
            ? 'kentu-meal-tray__scroll kentu-meal-tray__scroll--immersive min-h-0 flex-1 overflow-y-auto overscroll-contain'
            : 'kentu-meal-tray__scroll min-h-0 max-h-[40vh] flex-1 overflow-y-auto overscroll-contain'
        }
      >
        {items.length === 0 ? (
          <div className="space-y-2 px-1 py-2">
            <p className="kentu-meal-tray__estimate-banner" role="status">
              Nessun alimento sul vassoio.
            </p>
            {active ? (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-500/35 bg-cyan-500/5 px-3 py-2.5 text-sm font-medium text-cyan-300 transition hover:border-cyan-400/50 hover:bg-cyan-500/10 disabled:opacity-50"
                disabled={disabled || isSaving}
                onClick={() => onAddMore?.()}
              >
                + Aggiungi un altro alimento
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="kentu-meal-tray__list">
            {displayItems.map(({ item, index }, displayIndex) => {
              const name = String(item?.foodName || item?.name || 'Alimento').trim();
              const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qta) || 0));
              const visualStatus = resolveMcDriveVisualStatus(item);
              const isRaw = visualStatus === 'raw';
              const isProcessing = visualStatus === 'processing';
              const isPending = visualStatus === 'pending_enrichment'
                || visualStatus === 'requires_disambiguation'
                || isMcDriveDisambiguationStatus(item);
              const isResolved = visualStatus === 'resolved';
              const isSkipped = visualStatus === 'skipped';
              // LIFO: displayIndex 0 = ultimo inserimento (in cima).
              const isLatestInsert = displayIndex === 0;
              const highlightLatest = isLatestInsert && isRaw;
              const highlightSolver = solverHighlightIds.has(String(item?.id || ''));
              const kcal = Math.round(Number(item?.kcal) || 0);
              const key = String(item?.id || item?.foodDbKey || `${name}-${index}`);
              const isEditing = editingIndex === index && active;
              const alternatives = Array.isArray(item?.alternatives) ? item.alternatives : [];

              let detailLabel = '';
              if (isPending) detailLabel = 'Tocca per scegliere l\'alimento esatto';
              else if (isProcessing) detailLabel = 'analisi…';
              else if (isSkipped) detailLabel = 'tralasciato';
              else if (isRaw) detailLabel = ''; // nessun calcolo visibile
              else if (isResolved || kcal > 0) detailLabel = `${kcal} kcal`;

              const rowStatusClass = highlightSolver
                ? 'kentu-meal-tray__row--solver border-l-4 border-violet-400 bg-violet-500/15 ring-1 ring-violet-300/30'
                : highlightLatest
                ? 'kentu-meal-tray__row--latest-raw border-l-4 border-cyan-400 bg-cyan-500/10'
                : isRaw
                  ? 'kentu-meal-tray__row--raw text-white'
                  : isProcessing
                    ? 'kentu-meal-tray__row--processing font-medium text-cyan-500 animate-pulse'
                    : isResolved
                      ? 'kentu-meal-tray__row--resolved font-bold text-white bg-transparent'
                      : isSkipped
                        ? 'kentu-meal-tray__row--skipped line-through text-slate-500'
                        : isPending
                          ? 'kentu-meal-tray__row--pending cursor-pointer border border-amber-400/70 bg-amber-500/10 text-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)]'
                          : '';

              const nameStatusClass = highlightLatest
                ? 'font-bold not-italic text-cyan-300 text-base leading-snug'
                : isRaw
                  ? 'font-normal not-italic text-white'
                  : isProcessing
                    ? 'font-medium text-cyan-500 animate-pulse'
                    : isResolved
                      ? 'font-bold text-white'
                      : isSkipped
                        ? 'line-through text-slate-500'
                        : isPending
                          ? 'text-amber-200'
                          : '';

              return (
                <li
                  key={key}
                  className={[
                    'kentu-meal-tray__row',
                    'kentu-meal-tray__row--enter',
                    'transition-all duration-300',
                    'animate-in fade-in slide-in-from-top-2 duration-300',
                    rowStatusClass,
                    isEditing ? 'kentu-meal-tray__row--editing' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={isPending && active && !isEditing ? () => onRequestDisambiguation?.(index) : undefined}
                  onKeyDown={isPending && active && !isEditing ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onRequestDisambiguation?.(index);
                    }
                  } : undefined}
                  role={isPending && active ? 'button' : undefined}
                  tabIndex={isPending && active ? 0 : undefined}
                >
                  <div className="kentu-meal-tray__row-main flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <McDriveStatusIcon
                        visualStatus={visualStatus}
                        foodName={name}
                        macros={{
                          kcal: Number(item?.kcal) || 0,
                          prot: Number(item?.pro ?? item?.prot) || 0,
                          carb: Number(item?.carbo ?? item?.carb) || 0,
                          fat: Number(item?.fat) || 0,
                        }}
                      />
                      <div className="kentu-meal-tray__row-text min-w-0">
                        <button
                          type="button"
                          className={[
                            'kentu-meal-tray__name',
                            'transition-all duration-300 text-left max-w-full',
                            nameStatusClass,
                            active ? 'cursor-pointer hover:text-cyan-200' : '',
                          ].filter(Boolean).join(' ')}
                          disabled={!active || disabled}
                          onClick={(event) => {
                            event.stopPropagation();
                            setInspectItem(item);
                          }}
                          title="Apri scheda alimento"
                        >
                          {name}
                        </button>
                        {detailLabel ? (
                          <span
                            className={[
                              'kentu-meal-tray__kcal',
                              'transition-all duration-300',
                              nameStatusClass,
                            ].filter(Boolean).join(' ')}
                          >
                            {detailLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={[
                        'kentu-meal-tray__grams font-mono shrink-0 transition-all duration-300',
                        highlightLatest
                          ? 'text-base font-bold text-cyan-300'
                          : isSkipped
                            ? 'text-sm text-slate-500'
                            : 'text-sm font-medium text-white',
                      ].filter(Boolean).join(' ')}
                    >
                      {grams} g
                    </span>
                  </div>

                  {active && isEditing ? (
                    <div className="kentu-meal-tray__edit-panel">
                      <label className="kentu-meal-tray__edit-field">
                        <span className="kentu-meal-tray__edit-label">Grammi</span>
                        <AmountStepper
                          variant="kentu"
                          size="sm"
                          unitLabel="g"
                          step={5}
                          min={1}
                          max={2500}
                          value={grams}
                          disabled={disabled}
                          autoFocusInput
                          className="kentu-meal-tray__stepper"
                          onChange={(nextGrams) => {
                            const parsed = Math.max(1, Math.min(2500, Math.round(Number(nextGrams) || 0)));
                            onUpdateGrams?.(index, parsed);
                          }}
                        />
                      </label>

                      {isResolved && alternatives.length > 0 ? (
                        <label className="kentu-meal-tray__edit-field">
                          <span className="kentu-meal-tray__edit-label">Alternativa</span>
                          <select
                            className="kentu-meal-tray__select"
                            disabled={disabled}
                            defaultValue=""
                            onChange={(event) => {
                              const altIdx = Number(event.target.value);
                              if (!Number.isFinite(altIdx) || altIdx < 0) return;
                              const alt = alternatives[altIdx];
                              if (!alt) return;
                              onApplyAlternative?.(index, alt);
                              event.target.value = '';
                            }}
                          >
                            <option value="">Cambia alimento…</option>
                            {alternatives.map((alt, altIdx) => (
                              <option key={`${alt.foodDbKey || alt.foodName}-${altIdx}`} value={altIdx}>
                                {alt.foodName || 'Alternativa'}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      <div className="kentu-meal-tray__edit-actions">
                        {isResolved ? (
                          <KentuButton
                            variant="secondary"
                            className="kentu-btn--sm"
                            disabled={disabled}
                            onClick={() => setSearchIndex(index)}
                          >
                            🔍 Cerca nel DB
                          </KentuButton>
                        ) : null}
                        <KentuButton
                          variant="primary"
                          className="kentu-btn--sm"
                          disabled={disabled}
                          onClick={() => setEditingIndex(null)}
                        >
                          Applica
                        </KentuButton>
                        <button
                          type="button"
                          className="kentu-meal-tray__remove"
                          disabled={disabled}
                          onClick={() => {
                            setEditingIndex(null);
                            onRemoveItem?.(index);
                          }}
                          aria-label={`Elimina ${name}`}
                          title="Elimina"
                        >
                          ❌
                        </button>
                      </div>
                    </div>
                  ) : active ? (
                    <div
                      className="kentu-meal-tray__row-controls"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="kentu-meal-tray__remove inline-flex items-center justify-center"
                        disabled={disabled}
                        onClick={() => setSearchIndex(index)}
                        aria-label={`Cambia associazione di ${name}`}
                        title="Cambia associazione"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="kentu-meal-tray__remove inline-flex items-center justify-center"
                        disabled={disabled}
                        onClick={() => setInspectItem(item)}
                        aria-label={`Scheda alimento ${name}`}
                        title="Scheda alimento"
                      >
                        <Info className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="kentu-meal-tray__remove"
                        disabled={disabled}
                        onClick={() => setEditingIndex(index)}
                        aria-label={`Modifica ${name}`}
                        title="Modifica"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        className="kentu-meal-tray__remove"
                        disabled={disabled}
                        onClick={() => onRemoveItem?.(index)}
                        aria-label={`Elimina ${name}`}
                        title="Elimina"
                      >
                        ❌
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
            {active ? (
              <li className="kentu-meal-tray__row kentu-meal-tray__row--add">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-500/35 bg-cyan-500/5 px-3 py-2.5 text-sm font-medium text-cyan-300 transition hover:border-cyan-400/50 hover:bg-cyan-500/10 disabled:opacity-50"
                  disabled={disabled || isSaving}
                  onClick={() => onAddMore?.()}
                >
                  + Aggiungi un altro alimento
                </button>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {active ? (
        <div className="kentu-meal-tray__footer flex-none">
          <KentuButton
            variant="secondary"
            className="kentu-meal-tray__solver kentu-btn--sm min-w-[96px] shrink-0"
            disabled={disabled || isSaving || !canOpenSolver}
            onClick={() => setShowSolverModal(true)}
            title={canOpenSolver ? 'Bilancia pasto con Kentu Solver' : 'Aggiungi alimenti o attendi target pasto'}
          >
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Bilancia
            </span>
          </KentuButton>
          <KentuButton
            variant="secondary"
            className="kentu-meal-tray__cancel"
            disabled={disabled || isSaving}
            onClick={() => onCancel?.()}
          >
            {MCDRIVE_CANCEL_CHIP.label}
          </KentuButton>
          {needsCalculate ? (
            <KentuButton
              variant="primary"
              className={[
                'kentu-meal-tray__confirm',
                hasDisambiguationPending ? 'ring-2 ring-amber-400/70' : '',
              ].filter(Boolean).join(' ')}
              disabled={disabled || isSaving || items.length === 0 || hasDisambiguationPending}
              onClick={() => onFinish?.()}
              title={hasDisambiguationPending
                ? 'Ci sono alimenti da confermare — tocca le voci evidenziate'
                : undefined}
            >
              {hasDisambiguationPending
                ? '⚠️ Risolvi alimenti dubbi'
                : MCDRIVE_FINISH_CHIP.label}
            </KentuButton>
          ) : (
            <>
              <KentuButton
                variant="secondary"
                className="kentu-meal-tray__add-more"
                disabled={disabled || isSaving}
                onClick={() => onAddMore?.()}
              >
                {MCDRIVE_ADD_MORE_CHIP.label}
              </KentuButton>
              <KentuButton
                variant="primary"
                className={[
                  'kentu-meal-tray__confirm',
                  hasDisambiguationPending ? 'ring-2 ring-amber-400/70' : '',
                ].filter(Boolean).join(' ')}
                disabled={disabled || isSaving || items.length === 0 || !hasAnyResolvedMacros || hasDisambiguationPending}
                title={hasDisambiguationPending
                  ? 'Ci sono alimenti da confermare — tocca le voci evidenziate'
                  : undefined}
                onClick={async () => {
                  if (isSaving) return;
                  try {
                    await withMealSavingOverlay(async () => {
                      setIsSaving(true);
                      await Promise.resolve(onSave?.());
                    });
                  } catch (err) {
                    console.error('[LiveMealTray] salvataggio fallito', err);
                  } finally {
                    setIsSaving(false);
                  }
                }}
              >
                {isSaving
                  ? 'Salvataggio…'
                  : hasDisambiguationPending
                    ? '⚠️ Risolvi alimenti dubbi'
                    : MCDRIVE_SAVE_CONFIRM_CHIP.label}
              </KentuButton>
            </>
          )}
        </div>
      ) : null}

      {solverFeedback ? (
        <div
          role="status"
          className="pointer-events-none absolute bottom-[4.75rem] left-1/2 z-20 max-w-[92%] -translate-x-1/2 rounded-full border border-violet-400/40 bg-slate-950/95 px-3 py-1.5 text-[11px] font-semibold text-violet-100 shadow-lg backdrop-blur-sm"
        >
          ✓ {solverFeedback}
        </div>
      ) : null}

      <KentuSolverModal
        open={showSolverModal}
        onClose={() => setShowSolverModal(false)}
        targets={solverTargets}
        existingFoods={solverExistingFoods}
        mealType={mealType}
        onApply={handleSolverApply}
        elevated
      />

      <UniversalSearchModal
        isOpen={searchIndex != null}
        onClose={() => setSearchIndex(null)}
        initialQuery={
          searchIndex != null
            ? String(
              items[searchIndex]?.spokenFoodName
              || items[searchIndex]?.foodName
              || items[searchIndex]?.name
              || '',
            ).trim()
            : ''
        }
        personalDb={personalDb}
        kentuItDb={kentuItDb}
        globalDb={globalDb}
        offDb={offDb}
        onSelectFood={(result) => {
          if (searchIndex == null) return;
          onReplaceFromSearch?.(searchIndex, result);
          setSearchIndex(null);
          setEditingIndex(null);
        }}
      />

      {inspectItem ? (
        <FoodDetailModal
          food={buildInspectFoodPayload(inspectItem)}
          inspectOnly
          onClose={() => setInspectItem(null)}
        />
      ) : null}
    </div>
  );
}

export default memo(LiveMealTray);
