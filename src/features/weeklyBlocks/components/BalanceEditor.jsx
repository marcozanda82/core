import { useState } from 'react';
import { createPortal } from 'react-dom';
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
 * @param {string} dayKey
 * @returns {string}
 */
function formatDayKeyLabel(dayKey) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    const parts = dayKey.split('-').map((x) => parseInt(x, 10));
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' });
    }
  }
  return DAY_LABELS[dayKey] ?? dayKey;
}

/**
 * @param {DayBlock} block
 * @param {number} deltaKcal
 * @returns {DayBlock}
 */
function blockWithDelta(block, deltaKcal) {
  const delta = Math.round(Number(deltaKcal) || 0);
  const status = delta > 0 ? 'surplus' : delta < 0 ? 'deficit' : 'maintenance';
  return {
    ...block,
    calorieStrategy: {
      ...block.calorieStrategy,
      status,
      deltaKcal: delta,
    },
    meta: { ...block.meta, source: 'user', updatedAt: Date.now() },
  };
}

/**
 * @param {{
 *   dayKey: string,
 *   dayLabel?: string,
 *   block: DayBlock,
 *   onSave: (block: DayBlock) => void,
 *   onClose: () => void,
 * }} props
 */
export default function BalanceEditor({ dayKey, dayLabel: dayLabelProp, block, onSave, onClose }) {
  const [deltaKcal, setDeltaKcal] = useState(Number(block.calorieStrategy?.deltaKcal) || 0);
  const dayLabel = dayLabelProp ?? formatDayKeyLabel(dayKey);

  const handleSave = () => {
    onSave(blockWithDelta(block, deltaKcal));
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
        aria-labelledby="balance-editor-title"
        className="w-full max-w-md rounded-t-2xl border border-slate-600 bg-slate-900 p-5 shadow-2xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-violet-400/70">
          Card Bilancio — Override
        </p>
        <h3 id="balance-editor-title" className="mb-4 text-base font-semibold text-slate-100">
          Bilancio calorico — {dayLabel}
        </h3>

        <div className="mb-5 rounded-xl border border-violet-500/25 bg-violet-950/30 p-4">
          <HybridNumberInput
            label="Delta calorico giornaliero"
            value={deltaKcal}
            onChange={setDeltaKcal}
            step={10}
          />
          <p className="mt-2 text-center text-[10px] text-slate-500">
            Surplus positivo · Deficit negativo · 0 = mantenimento
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
            className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition-colors hover:bg-violet-500 active:bg-violet-700"
          >
            Applica Bilancio
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(panel, document.body) : panel;
}
