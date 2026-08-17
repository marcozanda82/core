import React, { memo, useMemo, useState } from 'react';
import AmountStepper from '../mealBuilder/components/AmountStepper';
import UniversalSearchModal from '../mealBuilder/components/UniversalSearchModal';
import { KentuButton } from '../../components/kentuos/KentuOSUI';
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
  isMcDriveRawItem,
} from '../commandTerminal/conversation/mcdriveWizard.js';

/** Normalizza status lavagna per UI (validating → processing). */
function resolveMcDriveVisualStatus(item) {
  const status = String(item?.status || '').toLowerCase();
  if (status === 'validating') return 'processing';
  if (status === 'raw' || status === 'processing' || status === 'pending_enrichment' || status === 'skipped' || status === 'resolved') {
    return status;
  }
  if (isMcDriveRawItem(item)) return 'raw';
  if (Number(item?.kcal) > 0 || item?.foodDbKey) return 'resolved';
  return 'raw';
}

function McDriveStatusIcon({ visualStatus }) {
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
      <span className="kentu-meal-tray__status-icon shrink-0 text-sm leading-none" aria-hidden>
        🟢
      </span>
    );
  }
  if (visualStatus === 'pending_enrichment') {
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
  // raw — pallino vuoto grigio
  return (
    <span
      className="kentu-meal-tray__status-icon inline-flex h-4 w-4 shrink-0 items-center justify-center"
      aria-hidden
    >
      <span className="h-2.5 w-2.5 rounded-full border-2 border-slate-400/75 bg-transparent" />
    </span>
  );
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
  onApplyAlternative = null,
  onReplaceFromSearch = null,
  getMealTargets = null,
  personalDb = null,
  kentuItDb = null,
  globalDb = null,
}) {
  const items = Array.isArray(tray?.items) ? tray.items : [];
  const resolvedTotals = tray?.resolvedTotals && typeof tray.resolvedTotals === 'object'
    ? tray.resolvedTotals
    : (tray?.totals && typeof tray.totals === 'object' ? tray.totals : EMPTY_MCDRIVE_TOTALS);
  const mealType = tray?.mealType || null;
  const mealTypeLabel = String(tray?.mealTypeLabel || '').trim()
    || formatMcdriveMealTypeLabel(mealType);
  const hasRaw = tray?.hasRaw === true || draftHasRawMcDriveItems(items);
  const needsCalculate = hasRaw || hasPendingMcDriveEnrichment(items);
  const [editingIndex, setEditingIndex] = useState(null);
  const [searchIndex, setSearchIndex] = useState(null);

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

  // Solo visualizzazione LIFO: ultimo inserito in cima. Gli indici restano quelli dell'array stato.
  const displayItems = useMemo(
    () => items.map((item, index) => ({ item, index })).reverse(),
    [items],
  );

  return (
    <div
      className={
        immersive
          ? 'kentu-meal-tray kentu-meal-tray--native kentu-meal-tray--immersive flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden'
          : 'kentu-meal-tray kentu-meal-tray--native flex h-full max-h-[min(55vh,100%)] w-full flex-col overflow-hidden'
      }
      role="group"
      aria-label={`Calibrazione ${mealTypeLabel}`}
    >
      {/* Header fisso: flex-none — lo scroll è solo sulla lista sotto */}
      <div className="kentu-meal-tray__header kentu-meal-tray__header--calibration flex-none">
        <div className="kentu-meal-tray__calibration-title-row">
          <span className="kentu-meal-tray__badge">Calibrazione</span>
          <h3 className="kentu-meal-tray__calibration-title">{mealTypeLabel}</h3>
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
          <p className="kentu-meal-tray__estimate-banner" role="status">
            Nessun alimento sul vassoio.
          </p>
        ) : (
          <ul className="kentu-meal-tray__list">
            {displayItems.map(({ item, index }, displayIndex) => {
              const name = String(item?.foodName || item?.name || 'Alimento').trim();
              const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qta) || 0));
              const visualStatus = resolveMcDriveVisualStatus(item);
              const isRaw = visualStatus === 'raw';
              const isProcessing = visualStatus === 'processing';
              const isPending = visualStatus === 'pending_enrichment';
              const isResolved = visualStatus === 'resolved';
              const isSkipped = visualStatus === 'skipped';
              // LIFO: displayIndex 0 = ultimo inserimento (in cima).
              const isLatestInsert = displayIndex === 0;
              const highlightLatest = isLatestInsert && isRaw;
              const kcal = Math.round(Number(item?.kcal) || 0);
              const key = String(item?.id || item?.foodDbKey || `${name}-${index}`);
              const isEditing = editingIndex === index && active;
              const alternatives = Array.isArray(item?.alternatives) ? item.alternatives : [];

              let detailLabel = '';
              if (isPending) detailLabel = 'in attesa…';
              else if (isProcessing) detailLabel = 'analisi…';
              else if (isSkipped) detailLabel = 'tralasciato';
              else if (isRaw) detailLabel = ''; // nessun calcolo visibile
              else if (isResolved || kcal > 0) detailLabel = `${kcal} kcal`;

              const rowStatusClass = highlightLatest
                ? 'kentu-meal-tray__row--latest-raw border-l-4 border-cyan-400 bg-cyan-500/10'
                : isRaw
                  ? 'kentu-meal-tray__row--raw text-white'
                  : isProcessing
                    ? 'kentu-meal-tray__row--processing font-medium text-cyan-500 animate-pulse'
                    : isResolved
                      ? 'kentu-meal-tray__row--resolved font-bold text-white bg-green-500/10 border-l-4 border-green-500'
                      : isSkipped
                        ? 'kentu-meal-tray__row--skipped line-through text-slate-500'
                        : isPending
                          ? 'kentu-meal-tray__row--pending text-orange-400 bg-orange-500/20 border-l-4 border-orange-500'
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
                          ? 'text-orange-400'
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
                >
                  <div className="kentu-meal-tray__row-main flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      <McDriveStatusIcon visualStatus={visualStatus} />
                      <div className="kentu-meal-tray__row-text min-w-0">
                        <span
                          className={[
                            'kentu-meal-tray__name',
                            'transition-all duration-300',
                            nameStatusClass,
                          ].filter(Boolean).join(' ')}
                        >
                          {name}
                        </span>
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
                          value={grams}
                          disabled={disabled}
                          autoFocusInput
                          className="kentu-meal-tray__stepper"
                          onChange={(nextGrams) => {
                            const parsed = Math.max(1, Math.round(Number(nextGrams) || 0));
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
                    <div className="kentu-meal-tray__row-controls">
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
          </ul>
        )}
      </div>

      {active ? (
        <div className="kentu-meal-tray__footer flex-none">
          <KentuButton
            variant="secondary"
            className="kentu-meal-tray__cancel"
            disabled={disabled}
            onClick={() => onCancel?.()}
          >
            {MCDRIVE_CANCEL_CHIP.label}
          </KentuButton>
          {needsCalculate ? (
            <KentuButton
              variant="primary"
              className="kentu-meal-tray__confirm"
              disabled={disabled || items.length === 0 || hasPendingMcDriveEnrichment(items)}
              onClick={() => onFinish?.()}
            >
              {MCDRIVE_FINISH_CHIP.label}
            </KentuButton>
          ) : (
            <>
              <KentuButton
                variant="secondary"
                className="kentu-meal-tray__add-more"
                disabled={disabled}
                onClick={() => onAddMore?.()}
              >
                {MCDRIVE_ADD_MORE_CHIP.label}
              </KentuButton>
              <KentuButton
                variant="primary"
                className="kentu-meal-tray__confirm"
                disabled={disabled || items.length === 0 || !hasAnyResolvedMacros}
                onClick={() => onSave?.()}
              >
                {MCDRIVE_SAVE_CONFIRM_CHIP.label}
              </KentuButton>
            </>
          )}
        </div>
      ) : null}

      <UniversalSearchModal
        isOpen={searchIndex != null}
        onClose={() => setSearchIndex(null)}
        personalDb={personalDb}
        kentuItDb={kentuItDb}
        globalDb={globalDb}
        onSelectFood={(result) => {
          if (searchIndex == null) return;
          onReplaceFromSearch?.(searchIndex, result);
          setSearchIndex(null);
          setEditingIndex(null);
        }}
      />
    </div>
  );
}

export default memo(LiveMealTray);
