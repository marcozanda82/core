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

  return (
    <div
      className="kentu-meal-tray kentu-meal-tray--native flex h-full max-h-[60vh] w-full flex-col overflow-hidden"
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

      <div className="kentu-meal-tray__scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {items.length === 0 ? (
          <p className="kentu-meal-tray__estimate-banner" role="status">
            Nessun alimento sul vassoio.
          </p>
        ) : (
          <ul className="kentu-meal-tray__list">
            {items.map((item, index) => {
              const name = String(item?.foodName || item?.name || 'Alimento').trim();
              const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qta) || 0));
              const isRaw = isMcDriveRawItem(item);
              const status = String(item?.status || '').toLowerCase();
              const isResolved = status === 'resolved' || (!isRaw && Number(item?.kcal) > 0);
              const kcal = Math.round(Number(item?.kcal) || 0);
              const key = String(item?.id || item?.foodDbKey || `${name}-${index}`);
              const isEditing = editingIndex === index && active;
              const alternatives = Array.isArray(item?.alternatives) ? item.alternatives : [];

              // Status/kcal sotto il nome; i grammi sono sempre a destra (tag dedicato).
              let detailLabel = '';
              if (status === 'pending_enrichment') detailLabel = 'in attesa…';
              else if (status === 'validating') detailLabel = 'verifica…';
              else if (status === 'skipped') detailLabel = 'tralasciato';
              else if (isRaw) detailLabel = 'da calibrare';
              else if (isResolved || kcal > 0) detailLabel = `${kcal} kcal`;

              return (
                <li
                  key={key}
                  className={[
                    'kentu-meal-tray__row',
                    isRaw ? 'kentu-meal-tray__row--raw' : '',
                    status === 'pending_enrichment' ? 'kentu-meal-tray__row--pending' : '',
                    isEditing ? 'kentu-meal-tray__row--editing' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="kentu-meal-tray__row-main flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="kentu-meal-tray__row-text min-w-0">
                      <span className="kentu-meal-tray__name">{name}</span>
                      {detailLabel ? (
                        <span className="kentu-meal-tray__kcal">{detailLabel}</span>
                      ) : null}
                    </div>
                    <span className="kentu-meal-tray__grams font-mono text-sm opacity-80 shrink-0">
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
