import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, RotateCcw, Trash2, X } from 'lucide-react';
import FoodThumbnail from './FoodThumbnail';
import {
  applyDeepEditFormToItem,
  buildDeepEditFormState,
  DEEP_EDIT_MICRO_FIELDS,
  getDeepEditUnits,
  resolveUnitIdFromUnit,
  resolveUnitWeight,
  restoreDeepEditFormFromDefaults,
} from '../utils/deepEditFoodUtils';

const inputClassName =
  'w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50';

export default function FoodDeepEditModal({ foodItem, isOpen, onClose, onSave }) {
  const [form, setForm] = useState(() => buildDeepEditFormState(foodItem || {}));
  const [customImage, setCustomImage] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && foodItem) {
      setForm(buildDeepEditFormState(foodItem));
      setCustomImage(foodItem.customImage || foodItem.row?.customImage || null);
    }
  }, [isOpen, foodItem]);

  const units = useMemo(
    () => (foodItem ? getDeepEditUnits(foodItem) : []),
    [foodItem],
  );

  if (!isOpen || !foodItem) return null;

  const name = foodItem.desc || foodItem.name || 'Alimento';
  const isCatalogEdit = foodItem._editSource === 'catalog';

  const patchForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleUnitChange = (event) => {
    const nextUnitId = event.target.value;
    const weight = Number(form.weight) || 0;
    const unitWeight = resolveUnitWeight(foodItem, nextUnitId);
    const nextMultiplier =
      nextUnitId === 'g'
        ? weight
        : unitWeight > 0
          ? Math.round((weight / unitWeight) * 100) / 100 || 1
          : 1;
    patchForm({
      selectedUnit: nextUnitId,
      multiplier: String(nextMultiplier),
    });
  };

  const handleMultiplierChange = (event) => {
    const raw = event.target.value;
    const selectedUnit = form.selectedUnit || 'g';
    if (raw === '') {
      patchForm({ multiplier: '', weight: '' });
      return;
    }
    const mult = Number(raw);
    if (!Number.isFinite(mult) || mult < 0) return;
    const unitWeight = resolveUnitWeight(foodItem, selectedUnit);
    const nextWeight = selectedUnit === 'g' ? mult : mult * unitWeight;
    patchForm({
      multiplier: raw,
      weight: String(Math.round(nextWeight)),
    });
  };

  const handleWeightChange = (event) => {
    const raw = event.target.value;
    if (raw === '') {
      patchForm({ weight: '', multiplier: '' });
      return;
    }
    const nextWeight = Number(raw);
    if (!Number.isFinite(nextWeight) || nextWeight < 0) return;
    const selectedUnit = form.selectedUnit || 'g';
    const unitWeight = resolveUnitWeight(foodItem, selectedUnit);
    patchForm({
      weight: raw,
      multiplier:
        selectedUnit === 'g'
          ? raw
          : String(unitWeight > 0 ? Math.round((nextWeight / unitWeight) * 100) / 100 : 1),
    });
  };

  const handleRestoreDefaults = () => {
    setForm((prev) => restoreDeepEditFormFromDefaults(foodItem, prev));
  };

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleRemoveImage = () => {
    setCustomImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave?.(applyDeepEditFormToItem(foodItem, form, customImage));
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[100055] flex flex-col justify-end bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Modifica ${name}`}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Chiudi modifica alimento"
        onClick={onClose}
      />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-700 bg-[#050a12] shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 px-4 py-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <FoodThumbnail
              name={name}
              customImage={customImage}
              sizeClassName="h-14 w-14"
              emojiClassName="text-2xl"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-cyan-400/80">
                Modifica alimento
              </p>
              <h3 className="mt-1 truncate text-lg font-semibold text-slate-100">{name}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="icon-upload"
                  onChange={handleImageUpload}
                />
                <label
                  htmlFor="icon-upload"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-white"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Cambia foto
                </label>
                {customImage ? (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-300 transition-colors hover:border-red-400/50 hover:text-red-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Rimuovi foto
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-700 p-2 text-slate-300 hover:text-white"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <section className="mb-5">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Porzione
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 block">
                <span className="mb-1 block text-xs text-slate-400">Unità</span>
                <select
                  value={form.selectedUnit || 'g'}
                  onChange={handleUnitChange}
                  className={inputClassName}
                >
                  <option value="g">g</option>
                  {units.map((unit) => {
                    const unitId = resolveUnitIdFromUnit(unit);
                    return (
                      <option key={`${unitId}-${unit.grams}`} value={unitId}>
                        {unit.label} ({unit.grams}g)
                      </option>
                    );
                  })}
                </select>
              </label>

              {form.selectedUnit !== 'g' ? (
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">Quantità unità</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={form.multiplier}
                    onChange={handleMultiplierChange}
                    className={inputClassName}
                  />
                </label>
              ) : null}

              <label className={form.selectedUnit !== 'g' ? 'block' : 'col-span-2 block'}>
                <span className="mb-1 block text-xs text-slate-400">Peso (g)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={form.weight}
                  onChange={handleWeightChange}
                  className={inputClassName}
                />
              </label>
            </div>
          </section>

          <section className="mb-5">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Macro · porzione
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'kcal', label: 'Kcal' },
                { key: 'prot', label: 'Proteine (g)' },
                { key: 'carb', label: 'Carboidrati (g)' },
                { key: 'fat', label: 'Grassi (g)' },
              ].map(({ key, label }) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs text-slate-400">{label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={form[key]}
                    onChange={(event) => patchForm({ [key]: event.target.value })}
                    className={inputClassName}
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Micro · porzione
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {DEEP_EDIT_MICRO_FIELDS.map(({ key, label }) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs text-slate-400">{label}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={form[key] ?? '0'}
                    onChange={(event) => patchForm({ [key]: event.target.value })}
                    className={inputClassName}
                  />
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="shrink-0 space-y-2 border-t border-slate-800 px-4 py-4">
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          >
            <RotateCcw className="h-4 w-4" />
            Ripristina default da database
          </button>
          <button
            type="submit"
            className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
          >
            {isCatalogEdit ? 'Salva' : 'Applica modifiche'}
          </button>
        </div>
      </form>
    </div>
  );
}
