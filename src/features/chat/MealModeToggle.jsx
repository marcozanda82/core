/**
 * Toggle a pillola Manuale | AI — controllo principale anticamera pasti.
 */

import { PREFERRED_MEAL_MODE } from '../../platform/preferredMealMode.js';

/**
 * @param {{
 *   mode: 'manual'|'ai',
 *   onChange: (next: 'manual'|'ai') => void,
 *   disabled?: boolean,
 *   className?: string,
 * }} props
 */
export default function MealModeToggle({
  mode,
  onChange,
  disabled = false,
  className = '',
}) {
  const isAi = mode === PREFERRED_MEAL_MODE.AI;
  return (
    <div
      role="tablist"
      aria-label="Modalità inserimento pasto"
      className={[
        'inline-flex w-full max-w-sm rounded-full border-2 border-white/25',
        'bg-zinc-950 p-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.45)]',
        className,
      ].filter(Boolean).join(' ')}
    >
      <button
        type="button"
        role="tab"
        aria-selected={!isAi}
        disabled={disabled}
        onClick={() => {
          if (!isAi) return;
          onChange?.(PREFERRED_MEAL_MODE.MANUAL);
        }}
        className={[
          'min-h-11 flex-1 rounded-full px-4 py-2.5 text-sm font-bold tracking-wide transition-all duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
          'disabled:cursor-default disabled:opacity-100',
          !isAi
            ? 'bg-white text-zinc-950 shadow-[0_4px_16px_rgba(255,255,255,0.22)]'
            : 'text-zinc-300 hover:bg-white/10 hover:text-white',
        ].join(' ')}
      >
        Manuale
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={isAi}
        disabled={disabled}
        onClick={() => {
          if (isAi) return;
          onChange?.(PREFERRED_MEAL_MODE.AI);
        }}
        className={[
          'min-h-11 flex-1 rounded-full px-4 py-2.5 text-sm font-bold tracking-wide transition-all duration-150',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80',
          'disabled:cursor-default disabled:opacity-100',
          isAi
            ? 'bg-cyan-400 text-zinc-950 shadow-[0_4px_18px_rgba(34,211,238,0.45)]'
            : 'text-zinc-300 hover:bg-cyan-400/15 hover:text-cyan-100',
        ].join(' ')}
      >
        AI
      </button>
    </div>
  );
}
