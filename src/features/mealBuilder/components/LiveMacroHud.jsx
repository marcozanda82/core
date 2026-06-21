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
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="relative h-2 overflow-hidden rounded-full bg-slate-800">
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
      <p className="mt-1 truncate text-[10px] text-slate-500">
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

export default function LiveMacroHud({
  mealTargets = {},
  mealConsumed = {},
  draftTotals = {},
  className = '',
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
          ? `rounded-xl border border-slate-800 p-3 ${className}`
          : 'mb-4 rounded-xl border border-slate-800 bg-slate-900/50 p-3'
      }
    >
      <p className="mb-2 text-xs font-medium text-slate-300">Target pasto</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
