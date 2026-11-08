import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, ChevronDown, ChevronRight, ChevronUp, Inbox, Info, Pencil, ScanBarcode, Search, Trash2, Utensils, Zap } from 'lucide-react';
import AmountStepper from '../mealBuilder/components/AmountStepper';
import FoodDetailModal from '../mealBuilder/components/FoodDetailModal';
import UniversalSearchModal from '../mealBuilder/components/UniversalSearchModal';
import BarcodeScannerOverlay from '../mealBuilder/components/BarcodeScannerOverlay';
import { resolveFoodVisual } from '../mealBuilder/utils/foodIconUtils';
import KentuSolverModal from '../../components/solver/KentuSolverModal';
import { KentuButton } from '../../components/kentuos/KentuOSUI';
import KentuTimeSelector from '../../components/kentuos/KentuTimeSelector';
import { resolveMealItemDisplayIcon } from '../../utils/foodCategoryIcon';
import { withMealSavingOverlay } from '../../utils/mealSavingOverlayController';
import {
  draftFoodsToSolverItems,
  solverProposalToMcDriveItem,
} from '../../utils/solverEngine';
import useBarcodeScanner from '../mealBuilder/hooks/useBarcodeScanner';
import {
  EMPTY_MCDRIVE_TOTALS,
  MCDRIVE_CANCEL_CHIP,
  MCDRIVE_SAVE_CONFIRM_CHIP,
  buildMcDriveItemFromHabitShortcut,
  buildMcDriveItemFromSearchResult,
  draftHasRawMcDriveItems,
  formatMcdriveMealTypeLabel,
  normalizeMcdriveMealType,
  MCDRIVE_MEAL_TYPE_OPTIONS,
  hasPendingMcDriveEnrichment,
  isMcDriveDisambiguationStatus,
  isMcDriveRawItem,
} from '../commandTerminal/conversation/mcdriveWizard.js';
import { lookupRecentFoodPortionGrams } from '../commandTerminal/conversation/userPortionsMemory.js';
import { sanitizeFoodDisplayName } from '../../utils/foodVisualResolver';
import {
  formatAssistedGramsLabel,
  isEstimatedQuantitySource,
} from '../commandTerminal/conversation/assistedQuantityPresentation.js';
import { usePredictiveFoodBlocks } from '../mealBuilder/hooks/usePredictiveFoodBlocks.js';

/**
 * Libreria completa degli sfondi pasto (pasti, stagioni, festività, evergreen).
 * Vite risolve ogni `.webp` in URL di asset a build time, sottocartelle incluse.
 */
const mealBackdropModules = import.meta.glob(
  '../../assets/sfondi-pasti/**/*.webp',
  { eager: true, import: 'default' },
);

const MEAL_BACKDROP_URLS = Object.keys(mealBackdropModules)
  .sort((a, b) => a.localeCompare(b, 'it'))
  .map((key) => {
    const value = mealBackdropModules[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (value && typeof value.default === 'string' && value.default.length > 0) return value.default;
    return '';
  })
  .filter(Boolean);

/** Uno sfondo diverso a ogni apertura della lavagna, senza ripetere subito l'ultimo. */
function pickMealBackdropUrl(urls) {
  if (!urls.length) return '';
  let previous = -1;
  try {
    const stored = Number(sessionStorage.getItem('kentu-meal-tray-backdrop'));
    if (Number.isInteger(stored)) previous = stored;
  } catch {
    previous = -1;
  }
  let index = Math.floor(Math.random() * urls.length);
  if (urls.length > 1 && index === previous) {
    index = (index + 1) % urls.length;
  }
  try {
    sessionStorage.setItem('kentu-meal-tray-backdrop', String(index));
  } catch {
    /* sessione non disponibile: la scelta casuale resta valida per questa apertura */
  }
  return urls[index];
}

/** Normalizza status lavagna per UI (validating → processing). */
function resolveMcDriveVisualStatus(item) {
  const status = String(item?.status || '').toLowerCase();
  if (status === 'validating') return 'processing';
  if (status === 'requires_disambiguation') return 'requires_disambiguation';
  if (status === 'raw' || status === 'processing' || status === 'pending_enrichment' || status === 'skipped' || status === 'resolved') {
    return status;
  }
  if (isMcDriveRawItem(item)) return 'raw';
  if (Number(item?.kcal) > 0 || item?.foodDbKey) return 'resolved';
  return 'raw';
}

function McDriveStatusIcon({ visualStatus, item = null, foodName = '' }) {
  if (visualStatus === 'processing') {
    return (
      <span
        className="kentu-meal-tray__status-icon inline-flex h-4 w-4 shrink-0 items-center justify-center"
        aria-hidden
      >
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-500 border-t-cyan-300" />
      </span>
    );
  }
  if (visualStatus === 'resolved') {
    const emoji = resolveMealItemDisplayIcon(
      item || { foodName, status: 'resolved' },
      { isDraft: false },
    );
    return (
      <span className="kentu-meal-tray__status-icon shrink-0 text-base leading-none" aria-hidden>
        {emoji}
      </span>
    );
  }
  if (visualStatus === 'pending_enrichment' || visualStatus === 'requires_disambiguation') {
    return (
      <span className="kentu-meal-tray__status-icon shrink-0 text-sm leading-none" aria-hidden>
        ⚠️
      </span>
    );
  }
  if (visualStatus === 'skipped') {
    return (
      <span className="kentu-meal-tray__status-icon shrink-0 text-sm leading-none opacity-60" aria-hidden>
        ⚪
      </span>
    );
  }
  // raw — placeholder neutro (niente euristica nome → insalata/foglia)
  return (
    <span
      className="kentu-meal-tray__status-icon inline-flex h-4 w-4 shrink-0 items-center justify-center text-slate-400 opacity-80"
      aria-hidden
      title="In bozza"
    >
      <Utensils className="h-3.5 w-3.5" strokeWidth={2} />
    </span>
  );
}

function getCurrentTimeHHmm() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function roundMacro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function buildTrayFoodDetailPayload(item, personalDb = null) {
  if (!item) return null;
  const name = sanitizeFoodDisplayName(item.foodName || item.name || 'Alimento');
  const grams = Math.max(1, Math.round(Number(item.grams ?? item.qta) || 0));
  const existingRow = item.row && typeof item.row === 'object' ? item.row : null;
  const foodDbKey = String(
    item.foodDbKey || existingRow?.foodDbKey || existingRow?.id || '',
  ).trim() || null;

  const row = existingRow
    ? { ...existingRow }
    : {
      desc: name,
      name,
      kcal: Math.round((Number(item.kcal) || 0) * (100 / grams)),
      prot: roundMacro((Number(item.pro ?? item.prot) || 0) * (100 / grams)),
      carb: roundMacro((Number(item.carbo ?? item.carb) || 0) * (100 / grams)),
      fat: roundMacro((Number(item.fat ?? item.fatTotal) || 0) * (100 / grams)),
      foodDbKey,
    };

  const displayTile = {
    desc: name,
    label: name,
    name,
    foodDbKey,
    id: foodDbKey || item.id || null,
    row,
    defaultUnitWeight: Number(existingRow?.defaultUnitWeight || existingRow?.servingGrams) || grams,
    units: existingRow?.units,
    defaultUnit: existingRow?.defaultUnit,
    customEmoji: existingRow?.customEmoji || existingRow?.icon || item.icon,
    customImage: existingRow?.customImage || existingRow?.imageUrl,
    semanticTags: existingRow?.semanticTags || item.semanticTags || null,
  };

  return {
    displayTile,
    tileVisual: resolveFoodVisual(displayTile, personalDb),
    defaultUnitWeight: Number(existingRow?.defaultUnitWeight || existingRow?.servingGrams) || grams,
  };
}

function buildTrayDetailDraftFoods(item) {
  if (!item) return [];
  const name = sanitizeFoodDisplayName(item.foodName || item.name || 'Alimento');
  const grams = Math.max(1, Math.round(Number(item.grams ?? item.qta) || 0));
  const foodDbKey = String(
    item.foodDbKey || item.row?.foodDbKey || item.row?.id || '',
  ).trim() || null;
  return [{
    foodDbKey,
    desc: name,
    name,
    weight: grams,
    qta: grams,
  }];
}

function isUnassociatedTrayItem(item, visualStatus) {
  const status = visualStatus || resolveMcDriveVisualStatus(item);
  return status === 'raw'
    || status === 'pending_enrichment'
    || status === 'requires_disambiguation'
    || status === 'processing';
}

function MealItemActionSheet({
  open = false,
  item = null,
  onClose = null,
  onChoose = null,
  onEditGrams = null,
  onRename = null,
  onReplace = null,
  onInspect = null,
  onRemove = null,
  onReturnToInbox = null,
}) {

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !item || typeof document === 'undefined') return null;

  const name = sanitizeFoodDisplayName(item.foodName || item.name || 'Alimento');
  const grams = Math.max(0, Math.round(Number(item.grams ?? item.qta) || 0));
  const kcal = Math.round(Number(item.kcal) || 0);
  const emoji = resolveMealItemDisplayIcon(item, { isDraft: false });
  const qtyLine = `${formatAssistedGramsLabel(grams, item.quantitySource)}${kcal > 0 ? ` • ${kcal} kcal` : ''}${isEstimatedQuantitySource(item.quantitySource) ? ' · stimati' : ''}`;
  const visualStatus = resolveMcDriveVisualStatus(item);
  const unassociated = isUnassociatedTrayItem(item, visualStatus);
  const canChoose = visualStatus === 'pending_enrichment'
    || visualStatus === 'requires_disambiguation'
    || isMcDriveDisambiguationStatus(item);
  const canInspect = visualStatus === 'resolved' || kcal > 0 || Boolean(item?.foodDbKey);

  const run = (handler) => () => {
    onClose?.();
    handler?.();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100080] flex items-end justify-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label="Chiudi menu alimento"
        onClick={() => onClose?.()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Azioni per ${name}`}
        className="relative z-[1] w-full max-w-md animate-in slide-in-from-bottom duration-300 rounded-t-3xl border-t border-white/10 bg-gray-900/60 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex justify-center" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-white/25" />
        </div>

        <header className="flex items-start gap-3 pb-3">
          <span className="mt-0.5 shrink-0 text-2xl leading-none" aria-hidden>
            {emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="m-0 truncate text-[1.05rem] font-semibold leading-snug text-slate-50">
              {name}
            </h3>
            <p className="m-0 mt-0.5 text-[13px] font-medium tabular-nums text-slate-400">
              {qtyLine}
            </p>
          </div>
        </header>

        <div className="border-t border-white/10 pt-2" />

        <div className="flex flex-col gap-1.5 pb-1" role="menu">
          {canChoose ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-amber-100 transition active:bg-amber-500/15 hover:bg-amber-500/10"
              onClick={run(onChoose)}
            >
              <Search className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
              Scegli alimento
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-100 transition active:bg-white/10 hover:bg-white/5"
            onClick={run(onEditGrams)}
          >
            <Pencil className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
            Modifica quantità
          </button>

          {unassociated ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-100 transition active:bg-white/10 hover:bg-white/5"
              onClick={run(onRename)}
            >
              <Pencil className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
              Modifica nome
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-100 transition active:bg-white/10 hover:bg-white/5"
            onClick={run(onReplace)}
          >
            <ArrowLeftRight className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
            Sostituisci con alimento DB
          </button>

          {canInspect ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-100 transition active:bg-white/10 hover:bg-white/5"
              onClick={run(onInspect)}
            >
              <Info className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
              Scheda Alimento
            </button>
          ) : null}

          {onReturnToInbox ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-amber-100 transition active:bg-amber-500/15 hover:bg-amber-500/10"
              onClick={run(onReturnToInbox)}
            >
              <Inbox className="h-5 w-5 shrink-0 text-amber-300" aria-hidden />
              Rimanda in Inbox
            </button>
          ) : null}

          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-rose-400 transition hover:bg-rose-500/10 active:bg-rose-500/15"
            onClick={run(onRemove)}
          >
            <Trash2 className="h-5 w-5 shrink-0" aria-hidden />
            Elimina
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Cold-start: catalogo base strutturato (fast-track) se l'utente non ha ancora abitudini. */
/** Cold-start: 20 card sempre disponibili se l'utente non ha abitudini. */
const defaultColdStartItems = Object.freeze([
  { id: 'caffe', name: 'Caffè espresso', text: 'Caffè espresso', emoji: '☕', qty: 30, unit: 'ml', kcal: 3, proteins: 0.2, carbs: 0, fats: 0 },
  { id: 'cappuccino', name: 'Cappuccino', text: 'Cappuccino', emoji: '☕', qty: 180, unit: 'ml', kcal: 120, proteins: 6, carbs: 10, fats: 6 },
  { id: 'cornetto', name: 'Cornetto', text: 'Cornetto', emoji: '🥐', qty: 50, unit: 'g', kcal: 200, proteins: 4, carbs: 26, fats: 9 },
  { id: 'latte', name: 'Latte parz. scremato', text: 'Latte parz. scremato', emoji: '🥛', qty: 200, unit: 'ml', kcal: 90, proteins: 7, carbs: 10, fats: 3 },
  { id: 'yogurt', name: 'Yogurt greco', text: 'Yogurt greco', emoji: '🥣', qty: 150, unit: 'g', kcal: 120, proteins: 15, carbs: 5, fats: 4 },
  { id: 'mela', name: 'Mela', text: 'Mela', emoji: '🍎', qty: 150, unit: 'g', kcal: 80, proteins: 0.4, carbs: 21, fats: 0.3 },
  { id: 'banana', name: 'Banana', text: 'Banana', emoji: '🍌', qty: 120, unit: 'g', kcal: 105, proteins: 1.3, carbs: 27, fats: 0.3 },
  { id: 'pane', name: 'Pane bianco', text: 'Pane bianco', emoji: '🍞', qty: 50, unit: 'g', kcal: 130, proteins: 4.5, carbs: 25, fats: 1 },
  { id: 'pasta', name: 'Pasta al pomodoro', text: 'Pasta al pomodoro', emoji: '🍝', qty: 100, unit: 'g', kcal: 350, proteins: 12, carbs: 70, fats: 2 },
  { id: 'riso', name: 'Riso basmati', text: 'Riso basmati', emoji: '🍚', qty: 80, unit: 'g', kcal: 280, proteins: 5.5, carbs: 62, fats: 0.5 },
  { id: 'pollo', name: 'Petto di pollo', text: 'Petto di pollo', emoji: '🍗', qty: 150, unit: 'g', kcal: 165, proteins: 31, carbs: 0, fats: 3.6 },
  { id: 'uova', name: 'Uova sode', text: 'Uova sode', emoji: '🥚', qty: 100, unit: 'g', kcal: 140, proteins: 12, carbs: 1, fats: 10 },
  { id: 'tonno', name: 'Tonno al naturale', text: 'Tonno al naturale', emoji: '🐟', qty: 80, unit: 'g', kcal: 90, proteins: 20, carbs: 0, fats: 1 },
  { id: 'insalata', name: 'Insalata mista', text: 'Insalata mista', emoji: '🥗', qty: 120, unit: 'g', kcal: 35, proteins: 1.5, carbs: 5, fats: 0.4 },
  { id: 'olio', name: 'Olio EVO', text: 'Olio EVO', emoji: '🫒', qty: 10, unit: 'g', kcal: 90, proteins: 0, carbs: 0, fats: 10 },
  { id: 'parmigiano', name: 'Parmigiano', text: 'Parmigiano', emoji: '🧀', qty: 20, unit: 'g', kcal: 80, proteins: 7, carbs: 0, fats: 6 },
  { id: 'prosciutto', name: 'Prosciutto crudo', text: 'Prosciutto crudo', emoji: '🥓', qty: 40, unit: 'g', kcal: 100, proteins: 10, carbs: 0, fats: 7 },
  { id: 'avena', name: 'Fiocchi d\'avena', text: 'Fiocchi d\'avena', emoji: '🌾', qty: 40, unit: 'g', kcal: 150, proteins: 5, carbs: 27, fats: 3 },
  { id: 'mandorle', name: 'Mandorle', text: 'Mandorle', emoji: '🥜', qty: 20, unit: 'g', kcal: 115, proteins: 4, carbs: 4, fats: 10 },
  { id: 'acqua', name: 'Acqua', text: 'Acqua', emoji: '💧', qty: 250, unit: 'ml', kcal: 0, proteins: 0, carbs: 0, fats: 0 },
]);
const MCDRIVE_HABIT_FALLBACKS = defaultColdStartItems;

function DraftResumeBanner({
  itemCount = 0,
  mealLabel = 'pasto',
  kcal = 0,
  disabled = false,
  onResume = null,
}) {
  if (itemCount <= 0 || typeof onResume !== 'function') return null;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onResume}
      className={[
        'kentu-meal-tray__draft-banner mb-1.5 flex w-full items-center justify-between gap-2 rounded-xl',
        'border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-left',
        'transition hover:border-amber-300/50 hover:bg-amber-500/15',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50',
        'disabled:pointer-events-none disabled:opacity-45',
      ].join(' ')}
    >
      <span className="min-w-0">
        <span className="block text-[0.72rem] font-semibold text-amber-100">
          Hai una bozza in sospeso — Riprendi
        </span>
        <span className="mt-0.5 block truncate text-[0.65rem] text-amber-100/70">
          {mealLabel}
          {' · '}
          {itemCount}
          {itemCount === 1 ? ' alimento' : ' alimenti'}
          {kcal > 0 ? ` · ${Math.round(kcal)} kcal` : ''}
        </span>
      </span>
      <span className="shrink-0 text-sm" aria-hidden>⚠️</span>
    </button>
  );
}

function normalizeHabitMatchKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:g|kg|ml|pz|x)?\b/gi, ' ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectTrayHabitMatchKeys(items = []) {
  const keys = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = String(item?.id || '').trim();
    const foodDbKey = String(item?.foodDbKey || item?.key || '').trim();
    const name = sanitizeFoodDisplayName(item?.foodName || item?.name || '', '');
    if (id) keys.add(`id:${id.toLowerCase()}`);
    if (foodDbKey) keys.add(`db:${foodDbKey.toLowerCase()}`);
    const nameKey = normalizeHabitMatchKey(name);
    if (nameKey) keys.add(`name:${nameKey}`);
  });
  return keys;
}

function habitCardIsOnTray(card, trayKeys) {
  if (!(trayKeys instanceof Set) || trayKeys.size === 0) return false;
  const id = String(card?.id || '').trim();
  const foodDbKey = String(card?.foodDbKey || '').trim();
  const nameKey = normalizeHabitMatchKey(card?.name || card?.label || '');
  if (id && (trayKeys.has(`id:${id.toLowerCase()}`) || trayKeys.has(`db:${id.toLowerCase()}`))) {
    return true;
  }
  if (foodDbKey && trayKeys.has(`db:${foodDbKey.toLowerCase()}`)) return true;
  if (nameKey && trayKeys.has(`name:${nameKey}`)) return true;
  return false;
}

/**
 * Carosello orizzontale abitudini / quick-add (sopra Scanner / Annulla).
 * Cold start obbligatorio: se habits è vuoto → catalogo default 20 item.
 */
function HabitsCarousel({
  habits = [],
  disabled = false,
  onQuickAdd = null,
}) {
  const userHabits = Array.isArray(habits) ? habits : [];
  // Cold start: array vuoto `[]` → sempre i 20 default (mai carosello vuoto).
  const itemsToRender = (userHabits && userHabits.length > 0)
    ? userHabits
    : defaultColdStartItems.map((card) => ({ ...card }));
  const canAdd = typeof onQuickAdd === 'function' && !disabled;

  return (
    <div
      className="kentu-meal-tray__habits w-full flex-none"
      role="region"
      aria-label="Abitudini rapide"
    >
      <div
        className={[
          'kentu-meal-tray__habits-scroll flex gap-2 overflow-x-auto overscroll-x-contain px-0.5 pb-1 pt-0.5',
          'snap-x snap-mandatory scroll-smooth',
          '[-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        ].join(' ')}
      >
        {itemsToRender.map((card) => {
          const name = String(card.name || card.label || '').trim() || 'Alimento';
          const kcal = Math.round(Number(card.kcal) || 0);
          const emoji = card.emoji || '🍽️';
          const text = String(card.text || name).trim();
          const dimmed = card.dimmed === true;
          return (
            <button
              key={card.id || `${name}-${text}`}
              type="button"
              disabled={!canAdd || dimmed}
              aria-label={dimmed ? `${name} già nel vassoio` : `Aggiungi ${name}`}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!canAdd || dimmed) return;
                onQuickAdd(card);
              }}
              className={[
                'kentu-meal-tray__habit-card flex w-[5.75rem] shrink-0 snap-start flex-col items-stretch gap-1 rounded-2xl',
                'border border-white/12 bg-zinc-900/80 px-2.5 py-2 text-left',
                'shadow-[0_8px_20px_rgba(0,0,0,0.28)]',
                'touch-manipulation select-none',
                'transition-all duration-150',
                dimmed
                  ? 'opacity-35'
                  : 'hover:border-cyan-400/45 hover:bg-cyan-500/10 active:scale-[0.97]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
                'disabled:pointer-events-none disabled:opacity-45',
              ].join(' ')}
            >
              <span className="text-lg leading-none" aria-hidden>{emoji}</span>
              <span className="truncate text-[0.72rem] font-semibold leading-tight text-zinc-100">
                {name}
              </span>
              <span className="text-[0.65rem] font-medium tabular-nums text-zinc-400">
                {kcal > 0 ? `${kcal} kcal` : '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Striscia compatta Attuale / Target sotto il selettore pasto. */
function MacroActualTargetStrip({ actual = EMPTY_MCDRIVE_TOTALS, targets = EMPTY_MCDRIVE_TOTALS }) {
  const aKcal = Math.round(Number(actual?.kcal) || 0);
  const aPro = Math.round(Number(actual?.pro) || 0);
  const aCarbo = Math.round(Number(actual?.carbo) || 0);
  const aFat = Math.round(Number(actual?.fat) || 0);
  const tKcal = Math.round(Number(targets?.kcal) || 0);
  const tPro = Math.round(Number(targets?.pro) || 0);
  const tCarbo = Math.round(Number(targets?.carbo) || 0);
  const tFat = Math.round(Number(targets?.fat) || 0);
  const hasTargets = tKcal > 0 || tPro > 0 || tCarbo > 0 || tFat > 0;

  return (
    <div
      className="kentu-meal-tray__calibration-macros kentu-meal-tray__calibration-macros--compare gap-x-3 gap-y-1 text-[0.78rem] leading-tight"
      aria-label={hasTargets ? 'Totali vassoio rispetto al riferimento pasto' : 'Totali risolti sul vassoio'}
    >
      <span className="whitespace-nowrap tabular-nums">
        <span className="font-semibold text-cyan-300">{aKcal}</span>
        {hasTargets ? (
          <span className="font-medium text-slate-400">{` / ${tKcal} kcal`}</span>
        ) : (
          <span className="font-medium text-slate-400"> kcal</span>
        )}
      </span>
      <span className="whitespace-nowrap tabular-nums">
        <span className="font-semibold text-cyan-300">{`P ${aPro}`}</span>
        {hasTargets ? (
          <span className="font-medium text-slate-400">{`/${tPro}g`}</span>
        ) : (
          <span className="font-medium text-slate-400">g</span>
        )}
      </span>
      <span className="whitespace-nowrap tabular-nums">
        <span className="font-semibold text-cyan-300">{`C ${aCarbo}`}</span>
        {hasTargets ? (
          <span className="font-medium text-slate-400">{`/${tCarbo}g`}</span>
        ) : (
          <span className="font-medium text-slate-400">g</span>
        )}
      </span>
      <span className="whitespace-nowrap tabular-nums">
        <span className="font-semibold text-cyan-300">{`G ${aFat}`}</span>
        {hasTargets ? (
          <span className="font-medium text-slate-400">{`/${tFat}g`}</span>
        ) : (
          <span className="font-medium text-slate-400">g</span>
        )}
      </span>
    </div>
  );
}

function LiveMealTray({
  tray = null,
  active = true,
  immersive = false,
  disabled = false,
  onCancel,
  onFinish,
  onSave,
  onAddMore,
  onQuickAdd = null,
  onRemoveItem,
  onReturnItemToInbox = null,
  onUpdateGrams,
  onUpdateItemName = null,
  onUpdateMealTime = null,
  onApplyAlternative = null,
  onReplaceFromSearch = null,
  onAppendSolverItems = null,
  onRequestDisambiguation = null,
  getMealTargets = null,
  todayLog = null,
  fullHistory = null,
  effectiveDailyKcal = null,
  dailyMacroTargets = null,
  personalDb = null,
  kentuItDb = null,
  globalDb = null,
  offDb = null,
  openScannerNonce = 0,
  onAcquireExternalFood = null,
  onChangeMealType = null,
  wipMealItems = null,
  wipMealTotals = null,
  wipMealType = null,
  onClearWipMeal = null,
}) {
  const items = Array.isArray(tray?.items) ? tray.items : [];
  const [mealBackdropUrl] = useState(() => pickMealBackdropUrl(MEAL_BACKDROP_URLS));
  const wipItems = Array.isArray(wipMealItems) ? wipMealItems : [];
  const resolvedTotals = tray?.resolvedTotals && typeof tray.resolvedTotals === 'object'
    ? tray.resolvedTotals
    : (tray?.totals && typeof tray.totals === 'object' ? tray.totals : EMPTY_MCDRIVE_TOTALS);
  const mealType = tray?.mealType || null;
  const mealTypeLabel = String(tray?.mealTypeLabel || '').trim()
    || formatMcdriveMealTypeLabel(mealType);
  const hasRaw = tray?.hasRaw === true || draftHasRawMcDriveItems(items);
  const hasDisambiguationPending = hasPendingMcDriveEnrichment(items);
  /** Auto-calcolo in corso: raw/processing ancora da risolvere (senza bottone Calcola). */
  const isAutoResolving = hasRaw && !hasDisambiguationPending;

  const predictiveBlocks = usePredictiveFoodBlocks(fullHistory, mealType, 12);
  const baseHabitCards = useMemo(() => {
    const fromHistory = (Array.isArray(predictiveBlocks) ? predictiveBlocks : []).map((block) => {
      const name = sanitizeFoodDisplayName(block?.desc || block?.label || '', '') || 'Alimento';
      const qta = Math.max(1, Math.round(Number(block?.qta) || 0) || 100);
      const visual = resolveFoodVisual(
        { name, desc: name, foodDbKey: block?.foodDbKey },
        personalDb,
      );
      return {
        id: String(block?.key || block?.foodDbKey || name),
        foodDbKey: block?.foodDbKey ? String(block.foodDbKey) : '',
        name,
        foodName: name,
        qty: qta,
        grams: qta,
        unit: 'g',
        kcal: Number(block?.kcal ?? block?.cal) || 0,
        proteins: Number(block?.prot) || 0,
        carbs: Number(block?.carb) || 0,
        fats: Number(block?.fat ?? block?.fatTotal) || 0,
        emoji: visual?.customEmoji || visual?.fallbackEmoji || '🍽️',
        status: 'resolved',
      };
    });

    // Cold start / catalogo ricco: se niente storico → default 20.
    // Se storico scarso, completa con i default non già presenti (per nome).
    if (fromHistory.length === 0) {
      return MCDRIVE_HABIT_FALLBACKS.map((card) => ({ ...card }));
    }
    const seen = new Set(
      fromHistory.map((card) => normalizeHabitMatchKey(card.name)).filter(Boolean),
    );
    const padded = [...fromHistory];
    MCDRIVE_HABIT_FALLBACKS.forEach((fb) => {
      const key = normalizeHabitMatchKey(fb.name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      padded.push({ ...fb });
    });
    return padded;
  }, [predictiveBlocks, personalDb]);

  const [habitsOpen, setHabitsOpen] = useState(true);

  useEffect(() => {
    // Sempre aperto di default; riapri se il vassoio si svuota.
    if (items.length === 0) setHabitsOpen(true);
  }, [items.length]);

  const trayHabitKeys = useMemo(
    () => collectTrayHabitMatchKeys(Array.isArray(items) ? items : []),
    [items],
  );

  const habitCards = useMemo(() => {
    const source = Array.isArray(baseHabitCards) ? baseHabitCards : [];
    const filtered = source
      .filter((card) => card && typeof card === 'object' && !habitCardIsOnTray(card, trayHabitKeys))
      .map((card) => ({ ...card, dimmed: false }));
    // Mai passare un array "pseudo-vuoto": se filtro azzera tutto → cold start 20.
    if (filtered.length === 0) {
      return defaultColdStartItems.map((card) => ({ ...card, dimmed: false }));
    }
    return filtered;
  }, [baseHabitCards, trayHabitKeys]);

  const handleHabitQuickAdd = useCallback((habitCard) => {
    const habit = habitCard && typeof habitCard === 'object' ? habitCard : null;
    if (!habit) return;

    const resolvedItem = buildMcDriveItemFromHabitShortcut(habit);
    if (!resolvedItem?.foodName) {
      console.warn('[LiveMealTray] Habit shortcut invalida:', habit);
      return;
    }

    setHabitsOpen(true);

    // Iniezione diretta resolved → niente NLP / match DB.
    if (typeof onAppendSolverItems === 'function') {
      onAppendSolverItems([resolvedItem]);
      return;
    }
    // Fallback bridge: item già resolved (mai stringa testuale).
    if (typeof onQuickAdd === 'function') {
      onQuickAdd(resolvedItem);
    }
  }, [onAppendSolverItems, onQuickAdd]);

  const wipDraftForSlot = useMemo(() => {
    if (wipItems.length === 0) return null;
    const traySlot = normalizeMcdriveMealType(mealType);
    const wipSlot = normalizeMcdriveMealType(wipMealType);
    return {
      items: wipItems,
      count: wipItems.length,
      mealLabel: formatMcdriveMealTypeLabel(wipSlot || traySlot || 'pranzo'),
      kcal: Number(wipMealTotals?.kcal) || wipItems.reduce((sum, it) => sum + (Number(it?.kcal) || 0), 0),
      slotMismatch: Boolean(traySlot && wipSlot && traySlot !== wipSlot),
    };
  }, [wipItems, wipMealType, wipMealTotals, mealType]);

  // Banner bozze: force-on temporaneo per smoke test UI, poi ripristinare a false.
  const FORCE_SHOW_WIP_BANNER = true; // TODO: restore condition → false
  const showWipBanner = FORCE_SHOW_WIP_BANNER || Boolean(wipDraftForSlot);
  const wipMealState = {
    wipItemsCount: wipItems.length,
    wipMealType,
    wipDraftForSlot,
    FORCE_SHOW_WIP_BANNER,
    showWipBanner,
  };
  const currentMealSlot = mealType;
  console.log('Stato Bozza Corrente:', wipMealState, 'Slot Attuale:', currentMealSlot);

  const handleResumeWipDraft = useCallback(() => {
    if (!wipDraftForSlot?.items?.length) return;
    const resolved = wipDraftForSlot.items
      .map((item) => buildMcDriveItemFromHabitShortcut({
        id: item?.id,
        name: item?.foodName || item?.name,
        foodName: item?.foodName || item?.name,
        foodDbKey: item?.foodDbKey || item?.key || '',
        qty: item?.grams ?? item?.weight ?? item?.qta,
        unit: 'g',
        kcal: item?.kcal ?? item?.cal,
        proteins: item?.pro ?? item?.prot ?? item?.proteins,
        carbs: item?.carbo ?? item?.carb ?? item?.carbs,
        fats: item?.fat ?? item?.fatTotal ?? item?.fats,
        emoji: item?.emoji || item?.icon,
      }))
      .filter(Boolean);
    if (resolved.length === 0) return;
    onAppendSolverItems?.(resolved);
    onClearWipMeal?.();
    setHabitsOpen(true);
  }, [wipDraftForSlot, onAppendSolverItems, onClearWipMeal]);

  const [editingIndex, setEditingIndex] = useState(null);
  const [renamingIndex, setRenamingIndex] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [searchIndex, setSearchIndex] = useState(null);
  const [actionSheetIndex, setActionSheetIndex] = useState(null);
  const [inspectIndex, setInspectIndex] = useState(null);
  const [showSolverModal, setShowSolverModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [solverFeedback, setSolverFeedback] = useState(null);
  const [solverHighlightIds, setSolverHighlightIds] = useState(() => new Set());
  const solverFeedbackTimerRef = useRef(null);
  const solverHighlightTimerRef = useRef(null);
  const lastScannerNonceRef = useRef(0);
  const skipRenameBlurRef = useRef(false);
  const [addSearchOpen, setAddSearchOpen] = useState(false);
  const [preferManualSearch, setPreferManualSearch] = useState(false);
  const [preferManualBarcode, setPreferManualBarcode] = useState('');

  const appendSearchResultToTray = useCallback((result) => {
    if (!result) return;
    const name = sanitizeFoodDisplayName(result?.desc || result?.name || result?.row?.name || '');
    const foodId = String(result?.key || result?.id || result?.foodDbKey || result?.row?.id || '').trim();
    const recentGrams = lookupRecentFoodPortionGrams({
      id: foodId,
      name,
    });
    const serving = Math.round(Number(
      result?.servingSize ?? result?.row?.servingSize ?? result?.grams ?? result?.row?.defaultUnitWeight,
    ) || 0);
    const grams = Math.max(1, recentGrams || serving || 100);
    const item = buildMcDriveItemFromSearchResult(result, grams);
    if (recentGrams > 0) item.habitualPortion = true;
    onAppendSolverItems?.([item]);
  }, [onAppendSolverItems]);

  const {
    isOpen: isScannerOpen,
    open: openScanner,
    close: closeScanner,
    videoRef: barcodeVideoRef,
    error: scannerError,
    isResolving: isScannerResolving,
    notFound: scannerNotFound,
  } = useBarcodeScanner({
    personalDb,
    onAcquireExternalFood,
    onFoodResolved: (food) => {
      appendSearchResultToTray(food);
      setAddSearchOpen(false);
      setSearchIndex(null);
      setPreferManualSearch(false);
      setPreferManualBarcode('');
    },
  });

  useEffect(() => {
    const nonce = Number(openScannerNonce) || 0;
    if (!nonce || nonce === lastScannerNonceRef.current) return;
    lastScannerNonceRef.current = nonce;
    if (disabled) return;
    openScanner();
  }, [openScannerNonce, openScanner, disabled]);

  useEffect(() => {
    if (editingIndex != null || searchIndex != null || isScannerOpen || inspectIndex != null || renamingIndex != null) {
      setActionSheetIndex(null);
    }
  }, [editingIndex, searchIndex, isScannerOpen, inspectIndex, renamingIndex]);

  useEffect(() => {
    if (actionSheetIndex == null) return;
    if (actionSheetIndex < 0 || actionSheetIndex >= items.length) {
      setActionSheetIndex(null);
    }
  }, [actionSheetIndex, items.length]);

  useEffect(() => {
    if (inspectIndex == null) return;
    if (inspectIndex < 0 || inspectIndex >= items.length) {
      setInspectIndex(null);
    }
  }, [inspectIndex, items.length]);

  useEffect(() => {
    if (renamingIndex == null) return;
    if (renamingIndex < 0 || renamingIndex >= items.length) {
      setRenamingIndex(null);
    }
  }, [renamingIndex, items.length]);

  const commitItemName = useCallback((index, nextName) => {
    const cleaned = sanitizeFoodDisplayName(nextName, '');
    setRenamingIndex(null);
    setRenameDraft('');
    if (!cleaned) return;
    const current = sanitizeFoodDisplayName(
      items[index]?.foodName || items[index]?.name || '',
      '',
    );
    if (cleaned === current) return;
    onUpdateItemName?.(index, cleaned);
  }, [items, onUpdateItemName]);

  const startRename = useCallback((index, currentName) => {
    setRenameDraft(currentName || '');
    setRenamingIndex(index);
    setActionSheetIndex(null);
    setEditingIndex(null);
  }, []);

  const exactTimeValue = String(tray?.exactTime || tray?.timeString || '').trim();
  const [localExactTime, setLocalExactTime] = useState(
    () => exactTimeValue || getCurrentTimeHHmm(),
  );
  const localExactTimeRef = useRef(exactTimeValue || getCurrentTimeHHmm());
  const timeDirtyRef = useRef(false);
  const didSeedTimeRef = useRef(false);

  useEffect(() => {
    if (!exactTimeValue) return undefined;
    if (timeDirtyRef.current && localExactTimeRef.current && localExactTimeRef.current !== exactTimeValue) {
      return undefined;
    }
    timeDirtyRef.current = false;
    setLocalExactTime(exactTimeValue);
    localExactTimeRef.current = exactTimeValue;
    return undefined;
  }, [exactTimeValue]);

  useEffect(() => {
    if (didSeedTimeRef.current) return undefined;
    didSeedTimeRef.current = true;
    if (exactTimeValue) return undefined;
    const seeded = localExactTimeRef.current || getCurrentTimeHHmm();
    if (!localExactTime) {
      setLocalExactTime(seeded);
      localExactTimeRef.current = seeded;
    }
    onUpdateMealTime?.(seeded);
    return undefined;
  }, [exactTimeValue, localExactTime, onUpdateMealTime]);

  const handleTrayTimeChange = useCallback((next) => {
    const normalized = String(next || '').trim();
    if (!normalized) return;
    timeDirtyRef.current = true;
    setLocalExactTime(normalized);
    localExactTimeRef.current = normalized;
    onUpdateMealTime?.(normalized);
  }, [onUpdateMealTime]);

  const mealTargets = useMemo(() => {
    if (typeof getMealTargets === 'function' && mealType) {
      const t = getMealTargets(mealType);
      if (t && typeof t === 'object') {
        return {
          kcal: Number(t.kcal) || 0,
          pro: Number(t.prot ?? t.pro) || 0,
          carbo: Number(t.carb ?? t.carbo) || 0,
          fat: Number(t.fat ?? t.fatTotal) || 0,
        };
      }
    }
    const fromTray = tray?.mealTargets;
    if (fromTray && typeof fromTray === 'object') {
      return {
        kcal: Number(fromTray.kcal) || 0,
        pro: Number(fromTray.pro ?? fromTray.prot) || 0,
        carbo: Number(fromTray.carbo ?? fromTray.carb) || 0,
        fat: Number(fromTray.fat ?? fromTray.fatTotal) || 0,
      };
    }
    return { ...EMPTY_MCDRIVE_TOTALS };
  }, [getMealTargets, mealType, tray?.mealTargets]);

  const hasAnyResolvedMacros = useMemo(
    () => items.some((item) => {
      const status = String(item?.status || '').toLowerCase();
      return status === 'resolved' || (!isMcDriveRawItem(item) && Number(item?.kcal) > 0);
    }),
    [items],
  );

  const solverExistingFoods = useMemo(
    () => draftFoodsToSolverItems(items),
    [items],
  );

  const solverTargets = useMemo(
    () => ({
      kcal: mealTargets.kcal,
      prot: mealTargets.pro,
      carb: mealTargets.carbo,
      fat: mealTargets.fat,
    }),
    [mealTargets],
  );

  useEffect(
    () => () => {
      if (solverFeedbackTimerRef.current) window.clearTimeout(solverFeedbackTimerRef.current);
      if (solverHighlightTimerRef.current) window.clearTimeout(solverHighlightTimerRef.current);
    },
    [],
  );

  const handleSolverApply = useCallback(
    (proposals) => {
      const confirmed = (proposals || []).filter(Boolean);
      if (confirmed.length === 0) return;

      const mcItems = confirmed.map((proposal) => solverProposalToMcDriveItem(proposal));
      onAppendSolverItems?.(mcItems);

      const nextHighlightIds = new Set(mcItems.map((item) => item.id).filter(Boolean));
      setSolverHighlightIds(nextHighlightIds);

      const label = mcItems.length === 1
        ? `Consulto: ${sanitizeFoodDisplayName(mcItems[0].foodName || '', '') || 'Alimento'}`
        : `Consulto: ${mcItems.length} alimenti aggiunti`;
      setSolverFeedback(label);

      if (solverFeedbackTimerRef.current) window.clearTimeout(solverFeedbackTimerRef.current);
      if (solverHighlightTimerRef.current) window.clearTimeout(solverHighlightTimerRef.current);
      solverFeedbackTimerRef.current = window.setTimeout(() => setSolverFeedback(null), 2400);
      solverHighlightTimerRef.current = window.setTimeout(() => setSolverHighlightIds(new Set()), 2800);
    },
    [onAppendSolverItems],
  );

  // Solo visualizzazione LIFO: ultimo inserito in cima. Gli indici restano quelli dell'array stato.
  const displayItems = useMemo(
    () => items.map((item, index) => ({ item, index })).reverse(),
    [items],
  );

  return (
    <div
      className={
        immersive
          ? 'kentu-meal-tray kentu-meal-tray--native kentu-meal-tray--immersive relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-cover bg-center'
          : 'kentu-meal-tray kentu-meal-tray--native relative flex h-full max-h-[min(62vh,100%)] w-full min-h-0 flex-col overflow-hidden bg-cover bg-center'
      }
      style={mealBackdropUrl ? {
        backgroundImage: `url("${mealBackdropUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      } : undefined}
      role="group"
      aria-label={`Calibrazione ${mealTypeLabel}`}
    >
      {mealBackdropUrl ? (
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-black/80 backdrop-blur-xs"
          aria-hidden
        />
      ) : null}
      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {/* Header fisso: flex-none — lo scroll è solo sulla lista sotto */}
      <div className={`kentu-meal-tray__header kentu-meal-tray__header--calibration flex-none${mealBackdropUrl ? ' !bg-transparent' : ''}`}>
        <div className="kentu-meal-tray__calibration-title-row">
          <div className="kentu-meal-tray__calibration-title-group">
            <span className="kentu-meal-tray__badge">Calibrazione</span>
            <h3 className="kentu-meal-tray__calibration-title">
              {typeof onChangeMealType === 'function' ? (
                <label className="inline-flex min-w-0 items-center">
                  <span className="sr-only">Tipo pasto</span>
                  <select
                    value={normalizeMcdriveMealType(mealType) || 'pranzo'}
                    disabled={disabled}
                    aria-label="Tipo pasto"
                    className="max-w-[11rem] truncate rounded-md border border-white/15 bg-zinc-900/80 px-1.5 py-0.5 text-inherit font-inherit outline-none focus:border-cyan-400/80 disabled:opacity-50"
                    onChange={(event) => {
                      const next = String(event.target.value || '').trim();
                      if (next) onChangeMealType(next);
                    }}
                  >
                    {MCDRIVE_MEAL_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : mealTypeLabel}
            </h3>
          </div>
          <KentuTimeSelector
            value={localExactTime || exactTimeValue}
            disabled={disabled}
            onChange={handleTrayTimeChange}
          />
        </div>
        <MacroActualTargetStrip
          actual={resolvedTotals}
          targets={mealTargets}
        />
        {showWipBanner ? (
          <DraftResumeBanner
            itemCount={wipDraftForSlot?.count || (FORCE_SHOW_WIP_BANNER ? 2 : 0)}
            mealLabel={wipDraftForSlot?.mealLabel || mealTypeLabel || 'Pasto'}
            kcal={wipDraftForSlot?.kcal || 0}
            disabled={disabled || isSaving}
            onResume={wipDraftForSlot ? handleResumeWipDraft : () => {
              console.log('[LiveMealTray] Banner bozze tap (demo — nessuna WIP reale)');
            }}
          />
        ) : null}
      </div>

      {/* Lista scrollabile: footer Salva resta flex-none sotto (anche con 20+ voci). */}
      <div
        className={
          immersive
            ? 'kentu-meal-tray__scroll kentu-meal-tray__scroll--immersive min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]'
            : 'kentu-meal-tray__scroll min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]'
        }
      >
        {items.length === 0 ? (
          <div className="kentu-meal-tray__empty flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-4 py-3 text-center">
            <p className="text-[0.85rem] font-medium text-zinc-400">
              Vassoio vuoto
            </p>
            <p className="max-w-[16rem] text-[0.72rem] leading-snug text-zinc-500">
              Scrivi un alimento, usa lo Scanner o scegli dalle abitudini sotto.
            </p>
          </div>
        ) : (
          <ul className="kentu-meal-tray__list">
            {displayItems.map(({ item, index }, displayIndex) => {
              const name = sanitizeFoodDisplayName(item?.foodName || item?.name || 'Alimento');
              const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qta) || 0));
              const visualStatus = resolveMcDriveVisualStatus(item);
              const isRaw = visualStatus === 'raw';
              const isProcessing = visualStatus === 'processing'
                || (isAutoResolving && isRaw);
              const isPending = visualStatus === 'pending_enrichment'
                || visualStatus === 'requires_disambiguation'
                || isMcDriveDisambiguationStatus(item);
              const isResolved = visualStatus === 'resolved';
              const isSkipped = visualStatus === 'skipped';
              // LIFO: displayIndex 0 = ultimo inserimento (in cima).
              const isLatestInsert = displayIndex === 0;
              const highlightLatest = isLatestInsert && isRaw && !isAutoResolving;
              const highlightSolver = solverHighlightIds.has(String(item?.id || ''));
              const showHabitualBadge = item?.quantitySource === 'user-history'
                || item?.habitualPortion === true;
              const quantityEstimated = isEstimatedQuantitySource(item?.quantitySource);
              const gramsLabel = formatAssistedGramsLabel(grams, item?.quantitySource);
              const kcal = Math.round(Number(item?.kcal) || 0);
              const key = String(item?.id || item?.foodDbKey || `${name}-${index}`);
              const isEditing = editingIndex === index && active;
              const isRenaming = renamingIndex === index && active;
              const canEditName = active && !disabled && isUnassociatedTrayItem(item, visualStatus);
              const alternatives = Array.isArray(item?.alternatives) ? item.alternatives : [];

              const rowStatusClass = highlightSolver
                ? 'kentu-meal-tray__row--solver border-l-4 border-violet-400 bg-violet-500/15 ring-1 ring-violet-300/30'
                : highlightLatest
                ? 'kentu-meal-tray__row--latest-raw border-l-4 border-cyan-400 bg-cyan-500/10'
                : isRaw
                  ? 'kentu-meal-tray__row--raw text-white'
                  : isProcessing
                    ? 'kentu-meal-tray__row--processing font-medium text-cyan-500 animate-pulse'
                    : isResolved
                      ? 'kentu-meal-tray__row--resolved font-bold text-white bg-transparent'
                      : isSkipped
                        ? 'kentu-meal-tray__row--skipped line-through text-slate-500'
                        : isPending
                          ? 'kentu-meal-tray__row--pending cursor-pointer border border-amber-400/70 bg-amber-500/10 text-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)]'
                          : '';

              const nameStatusClass = highlightLatest
                ? 'font-bold not-italic text-cyan-300 text-base leading-snug'
                : isRaw
                  ? 'font-normal not-italic text-white'
                  : isProcessing
                    ? 'font-medium text-cyan-500 animate-pulse'
                    : isResolved
                      ? 'font-bold text-white'
                      : isSkipped
                        ? 'line-through text-slate-500'
                        : isPending
                          ? 'text-amber-200'
                          : '';

              const rowClickable = active && !isEditing && !isRenaming && !disabled;

              const handleRowActivate = () => {
                if (!rowClickable) return;
                setActionSheetIndex(index);
              };

              return (
                <li
                  key={key}
                  className={[
                    'kentu-meal-tray__row',
                    'kentu-meal-tray__row--enter',
                    'transition-all duration-300',
                    'animate-in fade-in slide-in-from-top-2 duration-300',
                    rowStatusClass,
                    isEditing ? 'kentu-meal-tray__row--editing' : '',
                    rowClickable ? 'cursor-pointer select-none active:scale-[0.99] active:bg-white/5' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={rowClickable ? handleRowActivate : undefined}
                  onKeyDown={rowClickable ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleRowActivate();
                    }
                  } : undefined}
                  role={rowClickable ? 'button' : undefined}
                  tabIndex={rowClickable ? 0 : undefined}
                  aria-label={isPending ? `Scegli ${name}` : (quantityEstimated ? `Azioni per ${name}, ${gramsLabel} stimati` : `Azioni per ${name}`)}
                >
                  <div className="kentu-meal-tray__row-main flex min-w-0 flex-1 items-center gap-2">
                    <McDriveStatusIcon
                      visualStatus={visualStatus}
                      item={item}
                      foodName={name}
                    />
                    {isRenaming ? (
                      <input
                        type="text"
                        value={renameDraft}
                        disabled={disabled}
                        aria-label={`Correggi nome ${name}`}
                        className="kentu-meal-tray__name min-w-0 flex-1 rounded-md border border-cyan-500/50 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-400"
                        autoFocus
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            skipRenameBlurRef.current = true;
                            commitItemName(index, renameDraft);
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            skipRenameBlurRef.current = true;
                            setRenamingIndex(null);
                            setRenameDraft('');
                          }
                        }}
                        onBlur={() => {
                          if (skipRenameBlurRef.current) {
                            skipRenameBlurRef.current = false;
                            return;
                          }
                          commitItemName(index, renameDraft);
                        }}
                      />
                    ) : (
                      <span
                        className={[
                          'kentu-meal-tray__name min-w-0 flex-1 text-left',
                          canEditName ? 'flex items-center gap-1' : 'truncate',
                          nameStatusClass,
                        ].filter(Boolean).join(' ')}
                        title={name}
                      >
                        <span className="min-w-0 truncate">{name}</span>
                        {canEditName ? (
                          <button
                            type="button"
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-cyan-300/80 transition hover:bg-white/10 hover:text-cyan-200"
                            aria-label={`Modifica nome ${name}`}
                            title="Correggi nome"
                            onClick={(event) => {
                              event.stopPropagation();
                              startRename(index, name);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        ) : null}
                      </span>
                    )}
                    <span
                      className={[
                        'kentu-meal-tray__grams font-mono shrink-0 transition-all duration-300',
                        quantityEstimated ? 'kentu-meal-tray__grams--estimated' : '',
                        highlightLatest
                          ? 'text-base font-bold text-cyan-300'
                          : isSkipped
                            ? 'text-sm text-slate-500'
                            : 'text-sm font-medium text-white',
                      ].filter(Boolean).join(' ')}
                      title={
                        quantityEstimated
                          ? `${gramsLabel} stimati — tocca per correggere`
                          : (showHabitualBadge ? `Porzione abituale ${grams} g` : undefined)
                      }
                      onClick={quantityEstimated && active && !disabled && !isEditing ? (event) => {
                        event.stopPropagation();
                        setEditingIndex(index);
                      } : undefined}
                    >
                      {gramsLabel}
                    </span>
                    {quantityEstimated ? (
                      <span className="kentu-meal-tray__qty-est shrink-0">stimati</span>
                    ) : null}
                    {showHabitualBadge ? (
                      <span className="shrink-0 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-cyan-300/90">
                        abituale
                      </span>
                    ) : null}
                    {isPending ? (
                      <span className="kentu-meal-tray__kcal shrink-0 text-[0.65rem] text-amber-300/90 max-w-[5.5rem] truncate">
                        Scegli
                      </span>
                    ) : isProcessing ? (
                      <span className="kentu-meal-tray__kcal shrink-0 text-xs text-cyan-400">…</span>
                    ) : isSkipped ? (
                      <span className="kentu-meal-tray__kcal shrink-0 text-xs text-slate-500">—</span>
                    ) : (isResolved || kcal > 0) ? (
                      <span
                        className={[
                          'kentu-meal-tray__kcal shrink-0 font-mono text-xs tabular-nums',
                          nameStatusClass,
                        ].filter(Boolean).join(' ')}
                      >
                        {kcal} kcal
                      </span>
                    ) : null}
                    {active && !isEditing && isRaw && onReturnItemToInbox ? (
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-amber-300/90 transition hover:bg-amber-500/15 hover:text-amber-200"
                        aria-label={`Rimanda ${name} in Inbox`}
                        title="Rimanda in Inbox"
                        onClick={(event) => {
                          event.stopPropagation();
                          onReturnItemToInbox(index);
                        }}
                      >
                        <Inbox className="h-4 w-4" strokeWidth={2.2} />
                      </button>
                    ) : null}
                    {active && !isEditing ? (
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-white/25"
                        strokeWidth={2}
                        aria-hidden
                      />
                    ) : null}
                  </div>

                  {active && isEditing ? (
                    <div
                      className="kentu-meal-tray__edit-panel"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <label className="kentu-meal-tray__edit-field">
                        <span className="kentu-meal-tray__edit-label">Grammi</span>
                        <AmountStepper
                          variant="kentu"
                          size="sm"
                          unitLabel="g"
                          step={5}
                          min={1}
                          max={2500}
                          value={grams}
                          disabled={disabled}
                          autoFocusInput
                          className="kentu-meal-tray__stepper"
                          onChange={(nextGrams) => {
                            const parsed = Math.max(1, Math.min(2500, Math.round(Number(nextGrams) || 0)));
                            onUpdateGrams?.(index, parsed);
                          }}
                        />
                      </label>

                      {isResolved && alternatives.length > 0 ? (
                        <label className="kentu-meal-tray__edit-field">
                          <span className="kentu-meal-tray__edit-label">Alternativa</span>
                          <select
                            className="kentu-meal-tray__select"
                            disabled={disabled}
                            defaultValue=""
                            onChange={(event) => {
                              const altIdx = Number(event.target.value);
                              if (!Number.isFinite(altIdx) || altIdx < 0) return;
                              const alt = alternatives[altIdx];
                              if (!alt) return;
                              onApplyAlternative?.(index, alt);
                              event.target.value = '';
                            }}
                          >
                            <option value="">Cambia alimento…</option>
                            {alternatives.map((alt, altIdx) => (
                              <option key={`${alt.foodDbKey || alt.foodName}-${altIdx}`} value={altIdx}>
                                {sanitizeFoodDisplayName(alt.foodName || '', '') || 'Alternativa'}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}

                      <div className="kentu-meal-tray__edit-actions">
                        {isResolved ? (
                          <KentuButton
                            variant="secondary"
                            className="kentu-btn--sm"
                            disabled={disabled}
                            onClick={() => setSearchIndex(index)}
                          >
                            🔍 Cerca nel DB
                          </KentuButton>
                        ) : null}
                        <KentuButton
                          variant="primary"
                          className="kentu-btn--sm"
                          disabled={disabled}
                          onClick={() => setEditingIndex(null)}
                        >
                          Applica
                        </KentuButton>
                        {isRaw ? (
                          <button
                            type="button"
                            className="kentu-meal-tray__remove"
                            disabled={disabled || !onReturnItemToInbox}
                            onClick={() => {
                              setEditingIndex(null);
                              onReturnItemToInbox?.(index);
                            }}
                            aria-label={`Rimanda ${name} in Inbox`}
                            title="Rimanda in Inbox"
                          >
                            📥
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="kentu-meal-tray__remove"
                          disabled={disabled}
                          onClick={() => {
                            setEditingIndex(null);
                            onRemoveItem?.(index);
                          }}
                          aria-label={`Elimina ${name}`}
                          title="Elimina"
                        >
                          ❌
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {active ? (
        <div className={`kentu-meal-tray__footer flex-none shrink-0${mealBackdropUrl ? ' !bg-transparent' : ''}`}>
          <div className="kentu-meal-tray__habits-dock mb-1.5 flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="inline-flex items-center gap-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                <Zap className="h-3 w-3 text-amber-300/90" aria-hidden />
                Abitudini
              </span>
              <button
                type="button"
                className={[
                  'inline-flex h-7 w-7 items-center justify-center rounded-full',
                  'border border-white/12 bg-white/[0.06] text-zinc-300',
                  'transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-100',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
                  'disabled:opacity-45',
                ].join(' ')}
                disabled={disabled}
                aria-expanded={habitsOpen}
                aria-controls="kentu-meal-tray-habits"
                title={habitsOpen ? 'Nascondi abitudini' : 'Mostra abitudini'}
                onClick={() => setHabitsOpen((open) => !open)}
              >
                {habitsOpen ? (
                  <ChevronDown className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronUp className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
            {/* Niente grid-rows-[0fr]/hidden: aperti = montati nel DOM, chiusi = unmount (evita h=0). */}
            {habitsOpen ? (
              <div id="kentu-meal-tray-habits">
                {isAutoResolving ? (
                  <p
                    className="mb-1 px-0.5 text-[0.7rem] font-medium text-cyan-300/90"
                    role="status"
                    aria-live="polite"
                  >
                    Calcolo in corso…
                  </p>
                ) : null}
                <HabitsCarousel
                  habits={habitCards}
                  disabled={disabled || isSaving}
                  onQuickAdd={handleHabitQuickAdd}
                />
              </div>
            ) : null}
          </div>
          <div className="kentu-meal-tray__footer-row">
            <KentuButton
              variant="secondary"
              className="kentu-meal-tray__scan flex-1"
              disabled={disabled || isSaving}
              onClick={() => openScanner()}
              title="Scansiona barcode"
            >
              <span className="inline-flex items-center justify-center gap-1.5">
                <ScanBarcode className="h-4 w-4 shrink-0" aria-hidden />
                Scanner
              </span>
            </KentuButton>
            <KentuButton
              variant="secondary"
              className="kentu-meal-tray__cancel flex-1"
              disabled={disabled || isSaving}
              onClick={() => onCancel?.()}
            >
              {MCDRIVE_CANCEL_CHIP.label}
            </KentuButton>
          </div>
          <KentuButton
            variant="primary"
            className={[
              'kentu-meal-tray__confirm',
              hasDisambiguationPending ? 'ring-2 ring-amber-400/70' : '',
            ].filter(Boolean).join(' ')}
            disabled={
              disabled
              || isSaving
              || items.length === 0
              || isAutoResolving
              || hasDisambiguationPending
              || !hasAnyResolvedMacros
            }
            title={
              hasDisambiguationPending
                ? 'Ci sono alimenti da confermare — tocca le voci evidenziate'
                : isAutoResolving
                  ? 'Calcolo automatico in corso…'
                  : undefined
            }
            onClick={async () => {
              if (isSaving || isAutoResolving || hasDisambiguationPending) return;
              try {
                await withMealSavingOverlay(async () => {
                  setIsSaving(true);
                  const timeToSave = String(
                    localExactTimeRef.current || localExactTime || exactTimeValue || getCurrentTimeHHmm(),
                  ).trim();
                  await Promise.resolve(onSave?.(items, {
                    exactTime: timeToSave,
                    timeString: timeToSave,
                  }));
                });
              } catch (err) {
                console.error('[LiveMealTray] salvataggio fallito', err);
              } finally {
                setIsSaving(false);
              }
            }}
          >
            {isSaving
              ? 'Salvataggio…'
              : isAutoResolving
                ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span
                      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950"
                      aria-hidden
                    />
                    Calcolo in corso…
                  </span>
                )
                : hasDisambiguationPending
                  ? '⚠️ Risolvi alimenti dubbi'
                  : MCDRIVE_SAVE_CONFIRM_CHIP.label}
          </KentuButton>
        </div>
      ) : null}

      {solverFeedback ? (
        <div
          role="status"
          className="pointer-events-none absolute bottom-[4.75rem] left-1/2 z-20 max-w-[92%] -translate-x-1/2 rounded-full border border-violet-400/40 bg-slate-950/95 px-3 py-1.5 text-[11px] font-semibold text-violet-100 shadow-lg backdrop-blur-sm"
        >
          ✓ {solverFeedback}
        </div>
      ) : null}

      <KentuSolverModal
        open={showSolverModal}
        onClose={() => setShowSolverModal(false)}
        targets={solverTargets}
        existingFoods={solverExistingFoods}
        mealType={mealType}
        onApply={handleSolverApply}
        elevated
      />

      <UniversalSearchModal
        isOpen={searchIndex != null || addSearchOpen}
        onClose={() => {
          setSearchIndex(null);
          setAddSearchOpen(false);
          setPreferManualSearch(false);
          setPreferManualBarcode('');
        }}
        initialQuery={
          searchIndex != null
            ? sanitizeFoodDisplayName(
              items[searchIndex]?.spokenFoodName
              || items[searchIndex]?.foodName
              || items[searchIndex]?.name
              || '',
              '',
            )
            : ''
        }
        personalDb={personalDb}
        kentuItDb={kentuItDb}
        globalDb={globalDb}
        offDb={offDb}
        onOpenScanner={() => openScanner()}
        onSaveManualFood={onAcquireExternalFood}
        scannerError={scannerError}
        isScannerResolving={isScannerResolving}
        preferManualEntry={preferManualSearch}
        preferManualBarcode={preferManualBarcode}
        onSelectFood={(result) => {
          if (searchIndex != null) {
            onReplaceFromSearch?.(searchIndex, result);
            setSearchIndex(null);
            setEditingIndex(null);
            return;
          }
          appendSearchResultToTray(result);
          setPreferManualSearch(false);
          setPreferManualBarcode('');
        }}
      />

      <BarcodeScannerOverlay
        isOpen={isScannerOpen}
        onClose={closeScanner}
        videoRef={barcodeVideoRef}
        error={scannerError}
        isResolving={isScannerResolving}
        notFound={scannerNotFound}
        onInsertManually={(ean) => {
          closeScanner();
          setPreferManualBarcode(String(ean || '').trim());
          setPreferManualSearch(true);
          setAddSearchOpen(true);
        }}
      />

      <MealItemActionSheet
        open={actionSheetIndex != null && editingIndex == null && searchIndex == null && inspectIndex == null && renamingIndex == null && !isScannerOpen}
        item={actionSheetIndex != null ? items[actionSheetIndex] : null}
        onClose={() => setActionSheetIndex(null)}
        onChoose={() => {
          if (actionSheetIndex != null) onRequestDisambiguation?.(actionSheetIndex);
        }}
        onEditGrams={() => {
          if (actionSheetIndex != null) setEditingIndex(actionSheetIndex);
        }}
        onRename={() => {
          if (actionSheetIndex == null) return;
          const target = items[actionSheetIndex];
          startRename(
            actionSheetIndex,
            sanitizeFoodDisplayName(target?.foodName || target?.name || '', ''),
          );
        }}
        onReplace={() => {
          if (actionSheetIndex != null) setSearchIndex(actionSheetIndex);
        }}
        onInspect={() => {
          if (actionSheetIndex != null) setInspectIndex(actionSheetIndex);
        }}
        onRemove={() => {
          if (actionSheetIndex != null) onRemoveItem?.(actionSheetIndex);
        }}
        onReturnToInbox={
          actionSheetIndex != null
          && String(items[actionSheetIndex]?.status || '').toLowerCase() === 'raw'
            ? () => onReturnItemToInbox?.(actionSheetIndex)
            : null
        }
      />

      {inspectIndex != null && items[inspectIndex] && typeof document !== 'undefined' ? createPortal(
        <div className="relative z-[100085]">
          <FoodDetailModal
            food={buildTrayFoodDetailPayload(items[inspectIndex], personalDb)}
            draftFoods={buildTrayDetailDraftFoods(items[inspectIndex])}
            onClose={() => setInspectIndex(null)}
            onConfirm={(nextGrams) => {
              const grams = Math.max(1, Math.round(Number(nextGrams) || 0));
              if (inspectIndex != null) onUpdateGrams?.(inspectIndex, grams);
              setInspectIndex(null);
            }}
          />
        </div>,
        document.body,
      ) : null}
      </div>
    </div>
  );
}

export default memo(LiveMealTray);
