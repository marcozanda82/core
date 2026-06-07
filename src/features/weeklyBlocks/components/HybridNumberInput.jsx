/**
 * @param {{
 *   label: string,
 *   value: number,
 *   onChange: (value: number) => void,
 *   step?: number,
 *   disabled?: boolean,
 * }} props
 */
export default function HybridNumberInput({ label, value, onChange, step = 10, disabled = false }) {
  const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;

  const applyChange = (next) => {
    if (disabled) return;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => applyChange(numericValue - step)}
          disabled={disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-lg font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Diminuisci ${label}`}
        >
          −
        </button>
        <input
          type="number"
          value={numericValue}
          disabled={disabled}
          onChange={(e) => {
            const parsed = e.target.value === '' ? 0 : Number(e.target.value);
            applyChange(Number.isFinite(parsed) ? parsed : 0);
          }}
          className="w-20 border-0 bg-transparent text-center text-xl font-bold tabular-nums text-slate-50 outline-none [appearance:textfield] disabled:opacity-40 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => applyChange(numericValue + step)}
          disabled={disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-lg font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Aumenta ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
