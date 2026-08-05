import React from 'react';

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

/**
 * Scontrino digitale post-registrazione pasto (stile McDrive).
 *
 * @param {{
 *   receipt?: {
 *     title?: string,
 *     timeString?: string,
 *     items?: Array<{ foodName?: string, grams?: number, icon?: string }>,
 *     totals?: { kcal?: number, pro?: number, carbo?: number, fat?: number },
 *     budgetRemaining?: { kcal?: number, pro?: number, carbo?: number, fat?: number } | null,
 *   } | null,
 * }} props
 */
export default function MealReceiptMessage({ receipt = null }) {
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

  return (
    <article
      className="box-border w-full max-w-full overflow-hidden rounded-2xl border border-slate-600/50 bg-slate-950/85 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md"
      aria-label={title}
    >
      <header className="min-w-0">
        <h3 className="m-0 text-[15px] font-bold leading-snug text-slate-50">
          {title}
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
      </header>

      <div className="my-2.5 border-b border-slate-700/80" role="presentation" />

      <ul className="m-0 list-none space-y-1.5 p-0">
        {items.map((item, idx) => {
          const name = String(item?.foodName || item?.name || 'Alimento').trim();
          const grams = Math.round(Number(item?.grams) || 0);
          const icon = String(item?.icon || '🥗').trim() || '🥗';
          return (
            <li
              key={`${name}_${grams}_${idx}`}
              className="flex items-start justify-between gap-3"
            >
              <span className="min-w-0 flex-1 whitespace-normal break-words text-[13px] leading-snug text-slate-100">
                <span className="mr-1.5 inline-block" aria-hidden>{icon}</span>
                {name}
              </span>
              <span className="shrink-0 pt-0.5 text-[12px] font-semibold tabular-nums text-slate-400">
                {grams}
                g
              </span>
            </li>
          );
        })}
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
