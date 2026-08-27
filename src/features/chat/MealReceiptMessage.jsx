import React, { useEffect, useId, useRef, useState } from 'react';
import AmountStepper from '../mealBuilder/components/AmountStepper';
import { CHAT_SUCCESS_AVATAR_SRC } from './chatMessageKind.js';

const NEEDS_RESOLUTION = 'NEEDS_RESOLUTION';

function formatSigned(value, unit = '') {
  const n = Math.round(Number(value) || 0);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n}${unit}`;
}

function BudgetRow({ label, value, unit }) {
  const n = Number(value) || 0;
  const negative = n < 0;
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px] leading-snug">
      <span className="min-w-0 shrink text-slate-400">{label}</span>
      <span
        className={`shrink-0 tabular-nums font-semibold ${
          negative ? 'text-rose-400' : 'text-emerald-300/90'
        }`}
      >
        {formatSigned(n, unit)}
      </span>
    </div>
  );
}

function ManualMacrosForm({
  item,
  disabled = false,
  saving = false,
  labelImageUri = null,
  initialValues = null,
  onCancel,
  onSubmit,
}) {
  const seed = initialValues && typeof initialValues === 'object' ? initialValues : item;
  const [kcal, setKcal] = useState(() => {
    const n = Math.round(Number(seed?.kcal) || 0);
    return n > 0 ? String(n) : '';
  });
  const [pro, setPro] = useState(() => {
    const n = Number(seed?.pro);
    return Number.isFinite(n) && n > 0 ? String(n) : '';
  });
  const [carbo, setCarbo] = useState(() => {
    const n = Number(seed?.carbo);
    return Number.isFinite(n) && n > 0 ? String(n) : '';
  });
  const [fat, setFat] = useState(() => {
    const n = Number(seed?.fat);
    return Number.isFinite(n) && n > 0 ? String(n) : '';
  });

  useEffect(() => {
    if (!initialValues || typeof initialValues !== 'object') return;
    const nextKcal = Math.round(Number(initialValues.kcal) || 0);
    const nextPro = Number(initialValues.pro);
    const nextCarbo = Number(initialValues.carbo);
    const nextFat = Number(initialValues.fat);
    setKcal(nextKcal > 0 ? String(nextKcal) : '');
    setPro(Number.isFinite(nextPro) && nextPro > 0 ? String(nextPro) : '');
    setCarbo(Number.isFinite(nextCarbo) && nextCarbo > 0 ? String(nextCarbo) : '');
    setFat(Number.isFinite(nextFat) && nextFat > 0 ? String(nextFat) : '');
  }, [initialValues]);

  const parseNum = (raw) => {
    const n = Number(String(raw).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const hasVisionPrefill = initialValues
    && ['kcal', 'pro', 'carbo', 'fat'].some((k) => Number(initialValues[k]) > 0);

  return (
    <form
      className="mt-2 space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.({
          kcal: Math.round(parseNum(kcal)),
          pro: Math.round(parseNum(pro) * 10) / 10,
          carbo: Math.round(parseNum(carbo) * 10) / 10,
          fat: Math.round(parseNum(fat) * 10) / 10,
        });
      }}
    >
      <p className="m-0 text-[11px] font-semibold text-amber-100/90">
        Inserisci i valori per {item?.foodName || 'questo alimento'}
        {hasVisionPrefill
          ? ' (precompilati da etichetta — verifica e conferma)'
          : labelImageUri
            ? ' (foto acquisita)'
            : ''}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { id: 'kcal', label: 'kcal', value: kcal, set: setKcal },
          { id: 'pro', label: 'P (g)', value: pro, set: setPro },
          { id: 'carbo', label: 'C (g)', value: carbo, set: setCarbo },
          { id: 'fat', label: 'G (g)', value: fat, set: setFat },
        ].map((field) => (
          <label key={field.id} className="flex flex-col gap-0.5 text-[10px] text-slate-400">
            {field.label}
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              disabled={disabled}
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
              className="rounded-lg border border-slate-600/70 bg-slate-900 px-2 py-1.5 text-[12px] text-slate-100 outline-none focus:border-cyan-500/60"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 pt-0.5">
        <button
          type="submit"
          disabled={disabled || saving}
          className="rounded-lg bg-cyan-600/90 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-40"
        >
          {saving ? 'Salvataggio…' : 'Applica e salva nel DB'}
        </button>
        <button
          type="button"
          disabled={disabled || saving}
          onClick={onCancel}
          className="rounded-lg border border-slate-600/70 bg-slate-800/80 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-40"
        >
          Annulla
        </button>
      </div>
    </form>
  );
}

function ResolutionActions({
  itemIdx,
  disabled = false,
  isProcessing = false,
  statusHint = '',
  onScanBarcode = null,
  onUseLabelPhoto = null,
  onOpenManual = null,
  onCorrectName = null,
}) {
  const primaryBtnClass =
    'inline-flex flex-1 min-w-[9.5rem] items-center justify-center gap-1.5 rounded-xl border border-cyan-500/45 bg-cyan-950/40 px-3 py-2.5 text-[12px] font-semibold text-cyan-100 transition hover:border-cyan-400/70 hover:bg-cyan-900/50 disabled:opacity-40';
  const secondaryBtnClass =
    'inline-flex items-center gap-1 rounded-lg border border-slate-600/70 bg-slate-900/90 px-2 py-1.5 text-[11px] font-medium text-slate-100 transition hover:border-cyan-500/50 hover:bg-slate-800 disabled:opacity-40';

  return (
    <div className="mt-2 space-y-2">
      <p className="m-0 text-[11px] font-semibold text-amber-300/95">
        Alimento non trovato — aggiungilo al tuo database
      </p>
      {isProcessing ? (
        <p className="m-0 flex items-center gap-2 text-[11px] text-cyan-300/90" role="status">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-cyan-400" />
          Elaborazione immagine…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Azioni principali">
            <button
              type="button"
              className={primaryBtnClass}
              disabled={disabled}
              onClick={() => onScanBarcode?.(itemIdx)}
            >
              📷 Scansione Codice a Barre
            </button>
            <button
              type="button"
              className={primaryBtnClass}
              disabled={disabled}
              onClick={() => onUseLabelPhoto?.(itemIdx)}
            >
              🏷️ Foto Etichetta
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Altre opzioni">
            <button
              type="button"
              className={secondaryBtnClass}
              disabled={disabled}
              onClick={() => onCorrectName?.(itemIdx)}
            >
              ✏️ Correggi Nome
            </button>
            <button
              type="button"
              className={secondaryBtnClass}
              disabled={disabled}
              onClick={() => onOpenManual?.(itemIdx)}
            >
              ✍️ Inserisci Manualmente
            </button>
          </div>
        </>
      )}
      {statusHint ? (
        <p className="m-0 text-[10px] text-slate-500" role="status">
          {statusHint}
        </p>
      ) : null}
    </div>
  );
}

function ReceiptItemRow({
  item,
  itemIdx,
  disabled = false,
  isProcessing = false,
  manualOpen = false,
  labelImageUri = null,
  initialValues = null,
  onSelectAlternative = null,
  onUpdateItemGrams = null,
  onScanBarcode = null,
  onUseLabelPhoto = null,
  onManualResolve = null,
  onManualOpen = null,
  onCorrectNameSubmit = null,
  statusHint = '',
}) {
  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(() => String(item?.foodName || item?.name || '').trim());
  const nameInputRef = useRef(null);
  const rootRef = useRef(null);
  const listId = useId();
  const name = String(item?.foodName || item?.name || 'Alimento').trim();
  const grams = Math.round(Number(item?.grams) || 0);
  const icon = String(item?.icon || '🍽️').trim() || '🍽️';
  const alternatives = Array.isArray(item?.alternatives) ? item.alternatives : [];
  const canSwap = typeof onSelectAlternative === 'function' && alternatives.length > 1;
  const needsResolution = String(item?.status || '') === NEEDS_RESOLUTION;

  useEffect(() => {
    setDraftName(String(item?.foodName || item?.name || '').trim());
  }, [item?.foodName, item?.name]);

  useEffect(() => {
    if (!editingName) return undefined;
    const t = window.setTimeout(() => {
      nameInputRef.current?.focus?.();
      nameInputRef.current?.select?.();
    }, 0);
    return () => window.clearTimeout(t);
  }, [editingName]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocPointer = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const submitNameCorrection = () => {
    const next = String(draftName || '').trim();
    if (!next) return;
    setEditingName(false);
    void onCorrectNameSubmit?.(itemIdx, next);
  };

  return (
    <li
      ref={rootRef}
      className={`relative ${needsResolution ? 'rounded-xl border border-amber-500/35 bg-amber-950/20 px-2 py-2' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 w-2/3 max-w-[66.666%] flex-1 whitespace-normal break-words text-[13px] leading-snug text-slate-100">
          <span className="mr-1.5 inline-block" aria-hidden>{icon}</span>
          {editingName && needsResolution ? (
            <input
              ref={nameInputRef}
              type="text"
              value={draftName}
              disabled={disabled || isProcessing}
              aria-label="Correggi nome alimento"
              className="ml-0.5 inline-block max-w-[min(100%,14rem)] rounded-md border border-cyan-500/50 bg-slate-900 px-2 py-1 text-[13px] text-slate-100 outline-none focus:border-cyan-400"
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitNameCorrection();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setDraftName(name);
                  setEditingName(false);
                }
              }}
              onBlur={() => {
                // Non chiudere subito: lascia Invio/Annulla gestiti da keydown.
              }}
            />
          ) : (
            name
          )}
          {canSwap && !needsResolution ? (
            <button
              type="button"
              className="ml-1.5 inline-flex align-middle items-center justify-center rounded-md border border-slate-600/60 bg-slate-800/80 px-1 py-0.5 text-[12px] leading-none text-cyan-300/90 transition hover:border-cyan-500/50 hover:bg-slate-700/80 disabled:opacity-40"
              disabled={disabled}
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-controls={open ? listId : undefined}
              aria-label={`Sostituisci ${name}`}
              title="Sostituisci alimento"
              onClick={() => setOpen((prev) => !prev)}
            >
              🔄
            </button>
          ) : null}
        </span>
        {typeof onUpdateItemGrams === 'function' && !needsResolution ? (
          <AmountStepper
            variant="kentu"
            size="sm"
            unitLabel="g"
            step={5}
            min={1}
            value={grams}
            disabled={disabled || isProcessing}
            className="kentu-meal-receipt__stepper w-1/3 max-w-[33.333%] shrink"
            onChange={(nextGrams) => {
              const parsed = Math.max(1, Math.round(Number(nextGrams) || 0));
              onUpdateItemGrams(itemIdx, parsed);
            }}
          />
        ) : (
          <span className="w-1/3 max-w-[33.333%] shrink-0 pt-0.5 text-right text-[12px] font-semibold tabular-nums text-slate-400">
            {grams}
            g
          </span>
        )}
      </div>

      {needsResolution && editingName ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={disabled || isProcessing}
            className="rounded-lg bg-cyan-600/90 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-40"
            onClick={submitNameCorrection}
          >
            Riprova ricerca
          </button>
          <button
            type="button"
            disabled={disabled || isProcessing}
            className="rounded-lg border border-slate-600/70 bg-slate-800/80 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-40"
            onClick={() => {
              setDraftName(name);
              setEditingName(false);
            }}
          >
            Annulla
          </button>
        </div>
      ) : null}

      {needsResolution && !manualOpen && !editingName ? (
        <ResolutionActions
          itemIdx={itemIdx}
          disabled={disabled}
          isProcessing={isProcessing}
          statusHint={statusHint}
          onScanBarcode={onScanBarcode}
          onUseLabelPhoto={onUseLabelPhoto}
          onOpenManual={onManualOpen}
          onCorrectName={() => setEditingName(true)}
        />
      ) : null}

      {needsResolution && manualOpen ? (
        <ManualMacrosForm
          item={item}
          disabled={disabled}
          saving={isProcessing}
          labelImageUri={labelImageUri}
          initialValues={initialValues}
          onCancel={() => onManualOpen?.(null)}
          onSubmit={(macros) => {
            void onManualResolve?.(itemIdx, macros);
          }}
        />
      ) : null}

      {canSwap && open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 m-0 max-h-40 list-none overflow-y-auto rounded-xl border border-slate-600/70 bg-slate-950 p-1 shadow-lg"
        >
          {alternatives.map((alt) => {
            const altKey = String(alt.foodDbKey || alt.foodName);
            const isActive = String(item.foodDbKey || '') === altKey
              || name.toLowerCase() === String(alt.foodName || '').toLowerCase();
            return (
              <li key={altKey} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-slate-800/90 ${
                    isActive ? 'bg-cyan-950/50 text-cyan-100' : 'text-slate-100'
                  }`}
                  onClick={() => {
                    onSelectAlternative?.(itemIdx, alt);
                    setOpen(false);
                  }}
                >
                  <span className="text-[12px] font-medium leading-snug">
                    {alt.foodName}
                  </span>
                  <span className="text-[10px] tabular-nums text-slate-400">
                    {Math.round(Number(alt.kcal) || 0)}
                    {' '}
                    kcal · P
                    {' '}
                    {Math.round(Number(alt.pro) || 0)}
                    g
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Scontrino digitale post-registrazione / anteprima pasto (stile McDrive).
 * In anteprima WIP: `onSelectAlternative` abilita 🔄 inline sulle voci ambigue.
 * Voci `NEEDS_RESOLUTION`: azioni Codice a Barre / Foto / Manuale.
 *
 * @param {{
 *   receipt?: object | null,
 *   disabled?: boolean,
 *   onSelectAlternative?: ((itemIndex: number, alternative: object) => void) | null,
 *   onScanBarcode?: ((itemIndex: number) => void) | null,
 *   onUseLabelPhoto?: ((itemIndex: number) => void) | null,
 *   onCorrectNameSubmit?: ((itemIndex: number, newName: string) => void | Promise<void>) | null,
 *   processingItemIdx?: number | null,
 *   manualOpenForIdx?: number | null,
 *   onManualOpenForIdx?: ((idx: number | null) => void) | null,
 *   statusHint?: string,
 *   statusHintForIdx?: number | null,
 *   pendingImageUriByIdx?: Record<number, string>,
 *   prefilledMacrosByIdx?: Record<number, object>,
 * }} props
 */
export default function MealReceiptMessage({
  receipt = null,
  disabled = false,
  onSelectAlternative = null,
  onUpdateItemGrams = null,
  onScanBarcode = null,
  onUseLabelPhoto = null,
  onManualResolve = null,
  onCorrectNameSubmit = null,
  processingItemIdx = null,
  manualOpenForIdx = null,
  onManualOpenForIdx = null,
  statusHint = '',
  statusHintForIdx = null,
  pendingImageUriByIdx = {},
  prefilledMacrosByIdx = {},
}) {
  if (!receipt || typeof receipt !== 'object') return null;

  const title = String(receipt.title || '✅ Pasto Registrato').trim();
  const timeString = String(receipt.timeString || '').trim();
  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const totals = receipt.totals && typeof receipt.totals === 'object' ? receipt.totals : {};
  const budget = receipt.budgetRemaining && typeof receipt.budgetRemaining === 'object'
    ? receipt.budgetRemaining
    : null;

  const kcal = Math.round(Number(totals.kcal) || 0);
  const pro = Math.round(Number(totals.pro) || 0);
  const carbo = Math.round(Number(totals.carbo) || 0);
  const fat = Math.round(Number(totals.fat) || 0);
  const unresolvedCount = items.filter((it) => String(it?.status || '') === NEEDS_RESOLUTION).length;

  return (
    <article
      className="box-border w-full max-w-full overflow-visible rounded-2xl border border-slate-600/50 bg-slate-950/85 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md"
      aria-label={title}
    >
      <header className="min-w-0">
        <div className="flex items-start gap-2.5">
          <img
            src={CHAT_SUCCESS_AVATAR_SRC}
            alt=""
            className="mt-0.5 h-14 w-14 shrink-0 object-contain"
            width={56}
            height={56}
            draggable={false}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <h3 className="m-0 text-[15px] font-bold leading-snug text-slate-50">
              {title.replace(/^✅\s*/, '')}
            </h3>
            <p className="mt-1 m-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-slate-400">
              {timeString ? <span>{timeString}</span> : null}
              {timeString ? <span aria-hidden className="text-slate-600">·</span> : null}
              <span className="tabular-nums">{kcal} kcal</span>
              <span aria-hidden className="text-slate-600">·</span>
              <span className="tabular-nums">P {pro}g</span>
              <span className="tabular-nums">C {carbo}g</span>
              <span className="tabular-nums">G {fat}g</span>
            </p>
          </div>
        </div>
        {unresolvedCount > 0 ? (
          <p className="mt-1.5 m-0 text-[11px] font-medium text-amber-300/90" role="status">
            {unresolvedCount === 1
              ? '1 alimento da risolvere prima di salvare'
              : `${unresolvedCount} alimenti da risolvere prima di salvare`}
          </p>
        ) : null}
      </header>

      <div className="my-2.5 border-b border-slate-700/80" role="presentation" />

      <ul className="m-0 list-none space-y-1.5 overflow-visible p-0">
        {items.map((item, idx) => (
          <ReceiptItemRow
            key={`${item?.foodName || 'food'}_${item?.grams}_${idx}`}
            item={item}
            itemIdx={idx}
            disabled={disabled}
            isProcessing={processingItemIdx === idx}
            manualOpen={manualOpenForIdx === idx}
            labelImageUri={pendingImageUriByIdx?.[idx] || null}
            initialValues={prefilledMacrosByIdx?.[idx] || null}
            onSelectAlternative={onSelectAlternative}
            onUpdateItemGrams={onUpdateItemGrams}
            onScanBarcode={onScanBarcode}
            onUseLabelPhoto={onUseLabelPhoto}
            onManualResolve={onManualResolve}
            onManualOpen={(itemIndex) => onManualOpenForIdx?.(itemIndex)}
            onCorrectNameSubmit={onCorrectNameSubmit}
            statusHint={statusHintForIdx === idx ? statusHint : ''}
          />
        ))}
      </ul>

      {budget ? (
        <>
          <div className="my-2.5 border-b border-slate-700/80" role="presentation" />
          <footer className="space-y-1">
            <p className="m-0 mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Budget rimanente
            </p>
            <BudgetRow label="Calorie" value={budget.kcal} unit=" kcal" />
            <BudgetRow label="Proteine" value={budget.pro} unit="g" />
            <BudgetRow label="Carboidrati" value={budget.carbo} unit="g" />
            <BudgetRow label="Grassi" value={budget.fat} unit="g" />
          </footer>
        </>
      ) : null}
    </article>
  );
}

export { NEEDS_RESOLUTION as MEAL_RECEIPT_NEEDS_RESOLUTION };
