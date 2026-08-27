import React from 'react';

const DEFAULT_TARGETS = {
  kcal: 2000,
  prot: 150,
  carb: 200,
  fat: 70,
};

const MACRO_ROWS = [
  { id: 'kcal', label: 'Kcal', unit: 'kcal', accent: 'bg-amber-400' },
  { id: 'prot', label: 'Prot', unit: 'g', accent: 'bg-red-500' },
  { id: 'carb', label: 'Carb', unit: 'g', accent: 'bg-blue-500' },
  { id: 'fat', label: 'Fat', unit: 'g', accent: 'bg-amber-600' },
];

function pickNumber(...candidates) {
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Normalizza alias legacy (pro/prot, carbo/carb, fat/fatTotal, cal/kcal). */
export function normalizeMacroBundle(source, defaults = {}) {
  const src = source && typeof source === 'object' ? source : {};

  return {
    kcal: pickNumber(src.kcal, src.cal, defaults.kcal, 0),
    prot: pickNumber(src.prot, src.pro, src.proteine, defaults.prot, 0),
    carb: pickNumber(src.carb, src.carbo, src.carboidrati, defaults.carb, 0),
    fat: pickNumber(src.fatTotal, src.fat, src.grassi, defaults.fat, 0),
  };
}

function formatMacroValue(value) {
  return String(Math.round(Number(value) || 0));
}

function MacroBar({ label, consumed, draft, target, unit, accentClass }) {
  const consumato = Math.max(0, Number(consumed) || 0);
  const bozza = Math.max(0, Number(draft) || 0);
  const targetValue = Math.max(0, Number(target) || 0);
  const safeTarget = targetValue > 0 ? targetValue : 1;
  const total = consumato + bozza;
  const isOverflow = targetValue > 0 && total > targetValue;

  const draftColor = isOverflow ? 'bg-red-500' : accentClass;
  const unitSuffix = unit === 'kcal' ? ' kcal' : unit;
  const consumedPct = Math.min((consumato / safeTarget) * 100, 100);
  const draftPct = Math.min((bozza / safeTarget) * 100, Math.max(0, 100 - consumedPct));

  return (
    <div className="min-w-0">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div className="absolute inset-0 flex h-full">
          {consumato > 0 ? (
            <div
              className="h-full shrink-0 bg-slate-500 transition-all duration-300"
              style={{ width: `${consumedPct}%` }}
            />
          ) : null}
          {bozza > 0 ? (
            <div
              className={`h-full shrink-0 transition-all duration-300 ${draftColor}`}
              style={{ width: `${draftPct}%` }}
            />
          ) : null}
        </div>
      </div>
      <p className="mt-0.5 truncate text-[10px] leading-tight text-slate-500">
        <span>{formatMacroValue(consumato)}</span>
        {bozza > 0 ? (
          <span className={isOverflow ? 'text-red-400' : 'text-cyan-400'}>
            +{formatMacroValue(bozza)}
          </span>
        ) : null}
        <span>
          {' '}
          / {formatMacroValue(targetValue)}
          {unitSuffix}
        </span>
        {isOverflow ? (
          <span className="ml-1 text-red-400" aria-label="Budget superato">
            ⚠
          </span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * Striscia ultra-compatta (max ~48px) — sticky riepilogo macro.
 */
export function CompactMealMacroStrip({
  draftTotals = {},
  mealConsumed = {},
  title = '',
  className = '',
  onExpand = null,
}) {
  const draft = normalizeMacroBundle(draftTotals);
  const consumed = normalizeMacroBundle(mealConsumed);
  const kcal = Math.round(draft.kcal + consumed.kcal);
  const prot = Math.round(draft.prot + consumed.prot);
  const carb = Math.round(draft.carb + consumed.carb);
  const fat = Math.round(draft.fat + consumed.fat);

  return (
    <div
      className={[
        'flex h-11 max-h-12 shrink-0 items-center gap-2 border-b border-slate-800/90 bg-slate-950/95 px-3 backdrop-blur-sm',
        className,
      ].filter(Boolean).join(' ')}
      role="status"
      aria-label={`Riepilogo pasto ${kcal} chilocalorie`}
    >
      {title ? (
        <span className="max-w-[28%] truncate text-xs font-semibold text-slate-200">{title}</span>
      ) : null}
      <p className="min-w-0 flex-1 truncate font-mono text-[11px] font-semibold tabular-nums leading-none text-slate-100 sm:text-xs">
        <span className="text-amber-300">🔥 {kcal} kcal</span>
        <span className="text-slate-600"> | </span>
        <span className="text-red-300">P: {prot}g</span>
        <span className="text-slate-600"> • </span>
        <span className="text-sky-300">C: {carb}g</span>
        <span className="text-slate-600"> • </span>
        <span className="text-amber-500">F: {fat}g</span>
      </p>
      {typeof onExpand === 'function' ? (
        <button
          type="button"
          onClick={onExpand}
          className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-300/90 transition-colors hover:bg-cyan-500/10 hover:text-cyan-200"
        >
          Dettagli
        </button>
      ) : null}
    </div>
  );
}

export default function LiveMacroHud({
  mealTargets = {},
  mealConsumed = {},
  draftTotals = {},
  className = '',
  compact = false,
}) {
  const consumed = normalizeMacroBundle(mealConsumed);
  const draft = normalizeMacroBundle(draftTotals);
  const targets = normalizeMacroBundle(mealTargets, DEFAULT_TARGETS);

  const resolvedTargets = {
    kcal: targets.kcal || DEFAULT_TARGETS.kcal,
    prot: targets.prot || DEFAULT_TARGETS.prot,
    carb: targets.carb || DEFAULT_TARGETS.carb,
    fat: targets.fat || DEFAULT_TARGETS.fat,
  };

  return (
    <div
      className={
        className
          ? `rounded-xl border border-slate-800 ${compact ? 'p-2' : 'p-2.5'} ${className}`
          : `mb-3 rounded-xl border border-slate-800 bg-slate-900/50 ${compact ? 'p-2' : 'p-2.5'}`
      }
    >
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        Target pasto
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
        {MACRO_ROWS.map(({ id, label, unit, accent }) => (
          <MacroBar
            key={id}
            label={label}
            consumed={consumed[id]}
            draft={draft[id]}
            target={resolvedTargets[id]}
            unit={unit}
            accentClass={accent}
          />
        ))}
      </div>
    </div>
  );
}
