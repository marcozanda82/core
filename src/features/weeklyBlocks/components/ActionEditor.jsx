import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ACTIVITY_OPTIONS,
  activityTypeFromBlock,
  buildActionBlock,
  resolveHistoricalBurn,
} from '../activityCatalog';
import HybridNumberInput from './HybridNumberInput';

/** @typedef {import('../weeklyBlockSchema').DayBlock} DayBlock */

const DAY_LABELS = {
  lunedi: 'Lunedì',
  martedi: 'Martedì',
  mercoledi: 'Mercoledì',
  giovedi: 'Giovedì',
  venerdi: 'Venerdì',
  sabato: 'Sabato',
  domenica: 'Domenica',
};

/**
 * @param {{
 *   dayKey: string,
 *   initialData: DayBlock | null,
 *   burnHistory: Record<string, number>,
 *   onSave: (block: DayBlock) => void,
 *   onClose: () => void,
 * }} props
 */
export default function ActionEditor({ dayKey, initialData, burnHistory, onSave, onClose }) {
  const initialType = initialData ? activityTypeFromBlock(initialData) : 'Gambe';
  const initialBurn = initialData
    ? Number(initialData.activity?.estimatedBurnKcal) || 0
    : resolveHistoricalBurn(initialType, burnHistory);

  const [activityType, setActivityType] = useState(initialType);
  const [burnKcal, setBurnKcal] = useState(initialBurn);
  const skipHistoryEffect = useRef(true);

  const dayLabel = DAY_LABELS[dayKey] ?? dayKey;
  const isRest = activityType === 'Riposo';

  useEffect(() => {
    if (skipHistoryEffect.current) {
      skipHistoryEffect.current = false;
      return;
    }
    setBurnKcal(resolveHistoricalBurn(activityType, burnHistory));
  }, [activityType, burnHistory]);

  const handleSave = () => {
    onSave(buildActionBlock(dayKey, activityType, burnKcal, initialData));
  };

  const panel = (
    <div
      role="presentation"
      className="fixed inset-0 z-[100001] flex items-end justify-center bg-black/65 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-editor-title"
        className="w-full max-w-md rounded-t-2xl border border-slate-600 bg-slate-900 p-5 shadow-2xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-amber-500/70">
          Card Azione
        </p>
        <h3 id="action-editor-title" className="mb-4 text-base font-semibold text-slate-100">
          Allenamento — {dayLabel}
        </h3>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Tipo allenamento</span>
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-100 outline-none transition-colors focus:border-amber-500/50"
          >
            {ACTIVITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-950/30 p-4">
          <HybridNumberInput
            label="Dispendio (Allenamento)"
            value={burnKcal}
            onChange={setBurnKcal}
            step={10}
            disabled={isRest}
          />
          <p className="mt-2 text-center text-[10px] text-slate-500">
            {isRest
              ? 'Riposo: dispendio fisso a 0 kcal'
              : 'Default storico 250 kcal se mai inserito prima'}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-600 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-900/30 transition-colors hover:bg-amber-500 active:bg-amber-700"
          >
            Applica Azione
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(panel, document.body) : panel;
}
