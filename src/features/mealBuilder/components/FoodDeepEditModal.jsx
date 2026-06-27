import React, { useEffect, useState } from 'react';
import { Check, Clipboard, RotateCcw, Trash2, X } from 'lucide-react';
import FoodThumbnail from './FoodThumbnail';
import ImageSelectionSheet from './ImageSelectionSheet';
import AdvancedNutrientsEditSections from './AdvancedNutrientsEditSections';
import { FOOD_ICONS_LIBRARY } from '../utils/FoodIcons';
import {
  applyDeepEditFormToItem,
  buildDeepEditFormState,
  restoreDeepEditFormFromDefaults,
} from '../utils/deepEditFoodUtils';const inputClassName =
  'w-full rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/50';

export default function FoodDeepEditModal({ foodItem, isOpen, onClose, onSave }) {
  const [form, setForm] = useState(() => buildDeepEditFormState(foodItem || {}));
  const [customImage, setCustomImage] = useState(null);
  const [customEmoji, setCustomEmoji] = useState(null);
  const [customIcon, setCustomIcon] = useState(null);
  const [isImageSheetOpen, setIsImageSheetOpen] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  useEffect(() => {
    if (isOpen && foodItem) {
      setForm(buildDeepEditFormState(foodItem));
      setCustomImage(foodItem.customImage || foodItem.row?.customImage || null);
      setCustomEmoji(foodItem.customEmoji || foodItem.row?.customEmoji || null);
      setCustomIcon(foodItem.customIcon || foodItem.row?.customIcon || null);
      setIsImageSheetOpen(false);
      setCopiedJson(false);
    }
  }, [isOpen, foodItem]);

  if (!isOpen || !foodItem) return null;

  const name = foodItem.desc || foodItem.name || 'Alimento';
  const isCatalogEdit = foodItem._editSource === 'catalog';
  const hasCustomIcon = Boolean(customImage || customEmoji || customIcon);

  const patchForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const handleRestoreDefaults = () => {
    setForm((prev) => restoreDeepEditFormFromDefaults(foodItem, prev));
  };

  const handleSelectEmoji = (emoji) => {
    setCustomEmoji(emoji);
    setCustomImage(null);
    setCustomIcon(null);
  };

  const handleSelectImage = (dataUrl) => {
    setCustomImage(dataUrl);
    setCustomEmoji(null);
    setCustomIcon(null);
  };

  const handleSelectVectorIcon = (iconId) => {
    setCustomIcon(iconId);
    setCustomImage(null);
    setCustomEmoji(null);
  };

  const handleRemoveIcon = () => {
    setCustomImage(null);
    setCustomEmoji(null);
    setCustomIcon(null);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave?.(applyDeepEditFormToItem(foodItem, form, { customImage, customEmoji, customIcon }));
    onClose?.();
  };

  const handleCopyJson = async () => {
    const currentFood = applyDeepEditFormToItem(foodItem, form, {
      customImage,
      customEmoji,
      customIcon,
    });
    const jsonString = JSON.stringify(currentFood, null, 2);
    await navigator.clipboard.writeText(jsonString);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <>
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
              <button
                type="button"
                onClick={() => setIsImageSheetOpen(true)}
                aria-label={`Cambia icona per ${name}`}
                className="shrink-0 rounded-xl ring-offset-2 ring-offset-[#050a12] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400"
              >
                <FoodThumbnail
                  name={name}
                  customImage={customImage}
                  customEmoji={customEmoji}
                  customIcon={customIcon}
                  sizeClassName="h-14 w-14"
                  emojiClassName="text-2xl"
                />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-cyan-400/80">
                  Modifica alimento
                </p>
                <h3 className="mt-1 truncate text-lg font-semibold text-slate-100">{name}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsImageSheetOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:text-white"
                  >
                    Cambia icona
                  </button>
                  {hasCustomIcon ? (
                    <button
                      type="button"
                      onClick={handleRemoveIcon}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-2.5 py-1.5 text-xs font-medium text-red-300 transition-colors hover:border-red-400/50 hover:text-red-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Rimuovi icona
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
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Scegli icona
              </h4>
              <p className="mb-3 text-xs leading-relaxed text-slate-500">
                Icone vettoriali tematiche · oppure usa &quot;Cambia icona&quot; per foto o emoji.
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {FOOD_ICONS_LIBRARY.map(({ id, label, color, icon: Icon }) => {
                  const isSelected = customIcon === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSelectVectorIcon(id)}
                      aria-label={`Icona ${label}`}
                      aria-pressed={isSelected}
                      className={`flex shrink-0 flex-col items-center gap-1 rounded-xl border p-2 transition-colors ${
                        isSelected
                          ? 'border-cyan-500/70 bg-cyan-950/40 ring-1 ring-cyan-500/30'
                          : 'border-slate-800 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-800/80'
                      }`}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/90 ring-1 ring-slate-700/60">
                        <Icon className={`h-5 w-5 ${color}`} aria-hidden />
                      </span>
                      <span className="max-w-[4.5rem] truncate text-[9px] font-medium text-slate-400">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mb-5">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Porzione
              </h4>
              <p className="mb-3 text-xs leading-relaxed text-slate-500">
                Questo serve solo per i tasti + e − nel diario.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">Nome unità</span>
                  <input
                    type="text"
                    value={form.unitName ?? ''}
                    onChange={(event) => patchForm({ unitName: event.target.value })}
                    placeholder="es. Fetta, Uovo, Porzione..."
                    className={inputClassName}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-400">Peso unitario (g)</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step="any"
                    value={form.defaultUnitWeight ?? ''}
                    onChange={(event) => patchForm({ defaultUnitWeight: event.target.value })}
                    placeholder="es. 25, 50, 100"
                    className={inputClassName}
                  />
                </label>
              </div>
            </section>

            <section className="mb-5">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Macro principali · per 100g
              </h4>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-amber-500/30 bg-amber-950/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                  Valori per 100g
                </span>
              </div>
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
                Micronutrienti avanzati
              </h4>
              <AdvancedNutrientsEditSections
                form={form}
                onFieldChange={(key, value) => patchForm({ [key]: value })}
                inputClassName={inputClassName}
              />
            </section>          </div>

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
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleCopyJson}
                className="flex items-center gap-1 rounded border border-slate-800 bg-slate-900/40 px-2 py-1 text-[10px] font-mono text-slate-500 transition-colors hover:text-cyan-400"
              >
                {copiedJson ? (
                  <Check className="h-3 w-3 text-green-400" />
                ) : (
                  <Clipboard className="h-3 w-3" />
                )}
                {copiedJson ? 'JSON Copiato!' : 'Copia JSON'}
              </button>
            </div>
          </div>
        </form>
      </div>

      <ImageSelectionSheet
        isOpen={isImageSheetOpen}
        onClose={() => setIsImageSheetOpen(false)}
        foodName={name}
        onSelectEmoji={handleSelectEmoji}
        onSelectImage={handleSelectImage}
      />
    </>
  );
}
