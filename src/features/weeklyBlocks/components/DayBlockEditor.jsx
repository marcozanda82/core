import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ACTIVITY_CATALOG,
  ACTIVITY_OPTIONS,
  activityTypeFromBlock,
} from '../activityCatalog';

/** @typedef {import('../weeklyBlockSchema').DayBlock} DayBlock */

const DRAFT_PROFILE_KCAL = 2200;

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
 * @param {DayBlock | null | undefined} block
 * @returns {{ activityType: string, burnKcal: number, deltaKcal: number }}
 */
function editorStateFromBlock(block) {
  if (!block) {
    return {
      activityType: 'Forza - Gambe',
      burnKcal: ACTIVITY_CATALOG['Forza - Gambe'].burnKcal,
      deltaKcal: ACTIVITY_CATALOG['Forza - Gambe'].deltaKcal,
    };
  }

  const activityType = activityTypeFromBlock(block);
  const burnKcal = Number(block.activity?.estimatedBurnKcal) || 0;
  const deltaKcal = Number(block.calorieStrategy?.deltaKcal) || 0;

  return { activityType, burnKcal, deltaKcal };
}

/**
 * @param {string} dayKey
 * @param {{ activityType: string, burnKcal: number, deltaKcal: number }} state
 * @returns {DayBlock}
 */
function dayBlockFromEditorState(dayKey, { activityType, burnKcal, deltaKcal }) {
  const burn = Math.round(Number(burnKcal) || 0);
  const delta = Math.round(Number(deltaKcal) || 0);
  const status = delta > 0 ? 'surplus' : delta < 0 ? 'deficit' : 'maintenance';

  /** @type {DayBlock['activity']} */
  let activity;

  switch (activityType) {
    case 'Riposo':
      activity = { kind: 'REST', focus: [] };
      break;
    case 'Cardio':
      activity = {
        kind: 'CARDIO',
        focus: [],
        hour: '18:00',
        estimatedBurnKcal: burn,
        memoryKey: 'CARDIO',
      };
      break;
    case 'Forza - Spinta':
      activity = {
        kind: 'WORKOUT',
        focus: ['Petto', 'Spalle'],
        hour: '18:00',
        estimatedBurnKcal: burn,
        memoryKey: 'WORKOUT_Petto_Spalle',
      };
      break;
    case 'Forza - Gambe':
    default:
      activity = {
        kind: 'WORKOUT',
        focus: ['Gambe'],
        hour: '18:00',
        estimatedBurnKcal: burn,
        memoryKey: 'WORKOUT_Gambe',
      };
      break;
  }

  return {
    date: dayKey,
    activity,
    calorieStrategy: {
      status,
      deltaKcal: delta,
      profileKcalBase: DRAFT_PROFILE_KCAL,
    },
    meta: { source: 'user', updatedAt: Date.now() },
  };
}

/**
 * @param {{
 *   label: string,
 *   value: number,
 *   onChange: (value: number) => void,
 *   onManualChange: () => void,
 *   step?: number,
 * }} props
 */
function HybridNumberInput({ label, value, onChange, onManualChange, step = 10 }) {
  const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;

  const applyChange = (next) => {
    onManualChange();
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => applyChange(numericValue - step)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-lg font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
          aria-label={`Diminuisci ${label}`}
        >
          −
        </button>
        <input
          type="number"
          value={numericValue}
          onChange={(e) => {
            const parsed = e.target.value === '' ? 0 : Number(e.target.value);
            applyChange(Number.isFinite(parsed) ? parsed : 0);
          }}
          className="w-20 border-0 bg-transparent text-center text-xl font-bold tabular-nums text-slate-50 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => applyChange(numericValue + step)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-lg font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
          aria-label={`Aumenta ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   dayKey: string,
 *   initialData: DayBlock | null,
 *   onSave: (block: DayBlock) => void,
 *   onClose: () => void,
 * }} props
 */
export default function DayBlockEditor({ dayKey, initialData, onSave, onClose }) {
  const initial = editorStateFromBlock(initialData);
  const [activityType, setActivityType] = useState(initial.activityType);
  const [burnKcal, setBurnKcal] = useState(initial.burnKcal);
  const [deltaKcal, setDeltaKcal] = useState(initial.deltaKcal);
  const [burnKcalTouched, setBurnKcalTouched] = useState(false);
  const [deltaKcalTouched, setDeltaKcalTouched] = useState(false);
  const skipDefaultsEffect = useRef(true);

  const dayLabel = DAY_LABELS[dayKey] ?? dayKey;

  useEffect(() => {
    if (skipDefaultsEffect.current) {
      skipDefaultsEffect.current = false;
      return;
    }

    const defaults = ACTIVITY_CATALOG[activityType];
    if (!defaults) return;

    if (!burnKcalTouched) setBurnKcal(defaults.burnKcal);
    if (!deltaKcalTouched) setDeltaKcal(defaults.deltaKcal);
  }, [activityType, burnKcalTouched, deltaKcalTouched]);

  const handleSave = () => {
    onSave(dayBlockFromEditorState(dayKey, { activityType, burnKcal, deltaKcal }));
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
        aria-labelledby="day-block-editor-title"
        className="w-full max-w-md rounded-t-2xl border border-slate-600 bg-slate-900 p-5 shadow-2xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Pianificazione giorno
        </p>
        <h3 id="day-block-editor-title" className="mb-4 text-base font-semibold text-slate-100">
          Pianifica {dayLabel}
        </h3>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Tipo attività</span>
          <select
            value={activityType}
            onChange={(e) => setActivityType(e.target.value)}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-100 outline-none transition-colors focus:border-cyan-500/50"
          >
            {ACTIVITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
            <HybridNumberInput
              label="Dispendio (Allenamento)"
              value={burnKcal}
              onChange={setBurnKcal}
              onManualChange={() => setBurnKcalTouched(true)}
            />
            <p className="mt-2 text-center text-[10px] text-slate-500">kcal stimate</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
            <HybridNumberInput
              label="Bilancio Calorico"
              value={deltaKcal}
              onChange={setDeltaKcal}
              onManualChange={() => setDeltaKcalTouched(true)}
            />
            <p className="mt-2 text-center text-[10px] text-slate-500">surplus / deficit</p>
          </div>
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
            className="flex-1 rounded-xl bg-cyan-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-900/30 transition-colors hover:bg-cyan-500 active:bg-cyan-700"
          >
            Applica al Giorno
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(panel, document.body) : panel;
}
