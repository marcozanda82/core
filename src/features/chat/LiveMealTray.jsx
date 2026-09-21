import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeftRight, ChevronRight, Inbox, Info, Pencil, ScanBarcode, Search, Sparkles, Trash2, Utensils } from 'lucide-react';
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
  MCDRIVE_ADD_MORE_CHIP,
  MCDRIVE_CANCEL_CHIP,
  MCDRIVE_FINISH_CHIP,
  MCDRIVE_SAVE_CONFIRM_CHIP,
  buildMcDriveItemFromSearchResult,
  classifyMcdriveMacroVsTarget,
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
  const qtyLine = `${grams} g${kcal > 0 ? ` • ${kcal} kcal` : ''}`;
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

function MacroCompareRow({ label, actual, target, unit = 'g' }) {
  const a = Number(actual) || 0;
  const t = Number(target) || 0;
  const status = classifyMcdriveMacroVsTarget(a, t);
  const pct = t > 0 ? Math.min(100, Math.round((a / t) * 100)) : 0;
  const actualLabel = unit === 'kcal' ? Math.round(a) : Math.round(a);
  const targetLabel = unit === 'kcal' ? Math.round(t) : Math.round(t);

  return (
    <div className={`kentu-meal-tray__macro-row kentu-meal-tray__macro-row--${status}`}>
      <div className="kentu-meal-tray__macro-row-top">
        <span className="kentu-meal-tray__macro-label">{label}</span>
        <span className="kentu-meal-tray__macro-values">
          {actualLabel}{unit === 'kcal' ? '' : unit} / {targetLabel || '—'}{unit === 'kcal' ? ' kcal' : unit}
        </span>
      </div>
      <div className="kentu-meal-tray__macro-bar" aria-hidden>
        <div
          className="kentu-meal-tray__macro-bar-fill"
          style={{ width: `${t > 0 ? pct : 0}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Lavagna McDrive: vassoio interattivo + confronto target + edit potenziato.
 */
function LiveMealTray({
  tray = null,
  active = true,
  immersive = false,
  disabled = false,
  onCancel,
  onFinish,
  onSave,
  onAddMore,
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
  personalDb = null,
  kentuItDb = null,
  globalDb = null,
  offDb = null,
  openScannerNonce = 0,
  onAcquireExternalFood = null,
  onChangeMealType = null,
}) {
  const items = Array.isArray(tray?.items) ? tray.items : [];
  const resolvedTotals = tray?.resolvedTotals && typeof tray.resolvedTotals === 'object'
    ? tray.resolvedTotals
    : (tray?.totals && typeof tray.totals === 'object' ? tray.totals : EMPTY_MCDRIVE_TOTALS);
  const mealType = tray?.mealType || null;
  const mealTypeLabel = String(tray?.mealTypeLabel || '').trim()
    || formatMcdriveMealTypeLabel(mealType);
  const hasRaw = tray?.hasRaw === true || draftHasRawMcDriveItems(items);
  const hasDisambiguationPending = hasPendingMcDriveEnrichment(items);
  const needsCalculate = hasRaw || hasDisambiguationPending;
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

  const hasTargets = Number(mealTargets.kcal) > 0
    || Number(mealTargets.pro) > 0
    || Number(mealTargets.carbo) > 0
    || Number(mealTargets.fat) > 0;

  const hasNutrientGap = useMemo(() => {
    if (!hasTargets) return false;
    const gapKcal = Math.max(0, Number(mealTargets.kcal) - Number(resolvedTotals.kcal));
    const gapPro = Math.max(0, Number(mealTargets.pro) - Number(resolvedTotals.pro));
    const gapCarbo = Math.max(0, Number(mealTargets.carbo) - Number(resolvedTotals.carbo));
    const gapFat = Math.max(0, Number(mealTargets.fat) - Number(resolvedTotals.fat));
    return gapKcal > 5 || gapPro > 0.5 || gapCarbo > 0.5 || gapFat > 0.5;
  }, [hasTargets, mealTargets, resolvedTotals]);

  const canOpenSolver = items.length >= 1 || hasNutrientGap;

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
          ? 'kentu-meal-tray kentu-meal-tray--native kentu-meal-tray--immersive relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden'
          : 'kentu-meal-tray kentu-meal-tray--native relative flex h-full max-h-[min(55vh,100%)] w-full flex-col overflow-hidden'
      }
      role="group"
      aria-label={`Calibrazione ${mealTypeLabel}`}
    >
      {/* Header fisso: flex-none — lo scroll è solo sulla lista sotto */}
      <div className="kentu-meal-tray__header kentu-meal-tray__header--calibration flex-none">
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
        {hasTargets ? (
          <div className="kentu-meal-tray__target-grid" aria-label="Confronto vassoio / target pasto">
            <MacroCompareRow label="Kcal" actual={resolvedTotals.kcal} target={mealTargets.kcal} unit="kcal" />
            <MacroCompareRow label="Proteine" actual={resolvedTotals.pro} target={mealTargets.pro} />
            <MacroCompareRow label="Carboidrati" actual={resolvedTotals.carbo} target={mealTargets.carbo} />
            <MacroCompareRow label="Grassi" actual={resolvedTotals.fat} target={mealTargets.fat} />
          </div>
        ) : (
          <div className="kentu-meal-tray__calibration-macros" aria-label="Totali risolti sul vassoio">
            {hasAnyResolvedMacros ? (
              <>
                <span>{Math.round(Number(resolvedTotals.kcal) || 0)} kcal</span>
                <span>P {Math.round(Number(resolvedTotals.pro) || 0)}g</span>
                <span>C {Math.round(Number(resolvedTotals.carbo) || 0)}g</span>
                <span>G {Math.round(Number(resolvedTotals.fat) || 0)}g</span>
              </>
            ) : (
              <>
                <span>— kcal</span>
                <span>P —</span>
                <span>C —</span>
                <span>G —</span>
              </>
            )}
          </div>
        )}
      </div>

      <div
        className={
          immersive
            ? 'kentu-meal-tray__scroll kentu-meal-tray__scroll--immersive min-h-0 flex-1 overflow-y-auto overscroll-contain'
            : 'kentu-meal-tray__scroll min-h-0 max-h-[40vh] flex-1 overflow-y-auto overscroll-contain'
        }
      >
        {items.length === 0 ? (
          <div className="space-y-2 px-1 py-2">
            <p className="kentu-meal-tray__estimate-banner" role="status">
              Nessun alimento sul vassoio.
            </p>
            {active ? (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-500/35 bg-cyan-500/5 px-3 py-2.5 text-sm font-medium text-cyan-300 transition hover:border-cyan-400/50 hover:bg-cyan-500/10 disabled:opacity-50"
                disabled={disabled || isSaving}
                onClick={() => onAddMore?.()}
              >
                + Aggiungi un altro alimento
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="kentu-meal-tray__list">
            {displayItems.map(({ item, index }, displayIndex) => {
              const name = sanitizeFoodDisplayName(item?.foodName || item?.name || 'Alimento');
              const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qta) || 0));
              const visualStatus = resolveMcDriveVisualStatus(item);
              const isRaw = visualStatus === 'raw';
              const isProcessing = visualStatus === 'processing';
              const isPending = visualStatus === 'pending_enrichment'
                || visualStatus === 'requires_disambiguation'
                || isMcDriveDisambiguationStatus(item);
              const isResolved = visualStatus === 'resolved';
              const isSkipped = visualStatus === 'skipped';
              // LIFO: displayIndex 0 = ultimo inserimento (in cima).
              const isLatestInsert = displayIndex === 0;
              const highlightLatest = isLatestInsert && isRaw;
              const highlightSolver = solverHighlightIds.has(String(item?.id || ''));
              const habitualGrams = lookupRecentFoodPortionGrams({
                id: item?.foodDbKey,
                name,
              });
              const showHabitualBadge = item?.habitualPortion === true
                || (habitualGrams > 0 && grams === habitualGrams && item?.isEstimated === true);
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
                  aria-label={isPending ? `Scegli ${name}` : `Azioni per ${name}`}
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
                        highlightLatest
                          ? 'text-base font-bold text-cyan-300'
                          : isSkipped
                            ? 'text-sm text-slate-500'
                            : 'text-sm font-medium text-white',
                      ].filter(Boolean).join(' ')}
                      title={showHabitualBadge ? `Porzione abituale ${grams} g` : undefined}
                    >
                      {grams} g
                    </span>
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
            {active ? (
              <li className="kentu-meal-tray__row kentu-meal-tray__row--add">
                <div className="flex w-full items-center gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-500/35 bg-cyan-500/5 px-3 py-2.5 text-sm font-medium text-cyan-300 transition hover:border-cyan-400/50 hover:bg-cyan-500/10 disabled:opacity-50"
                    disabled={disabled || isSaving}
                    onClick={() => onAddMore?.()}
                  >
                    + Aggiungi un altro alimento
                  </button>
                  <button
                    type="button"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-500/35 bg-cyan-500/10 text-cyan-300 transition hover:border-cyan-400/50 hover:bg-cyan-500/20 disabled:opacity-50"
                    disabled={disabled || isSaving}
                    onClick={() => openScanner()}
                    aria-label="Scansiona barcode"
                    title="Scanner barcode"
                  >
                    <ScanBarcode className="h-5 w-5" />
                  </button>
                </div>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      {active ? (
        <div className="kentu-meal-tray__footer flex-none">
          <KentuButton
            variant="secondary"
            className="kentu-meal-tray__solver kentu-btn--sm min-w-[96px] shrink-0"
            disabled={disabled || isSaving || !canOpenSolver}
            onClick={() => setShowSolverModal(true)}
            title={canOpenSolver ? 'Bilancia pasto con Kentu Solver' : 'Aggiungi alimenti o attendi target pasto'}
          >
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Bilancia
            </span>
          </KentuButton>
          <KentuButton
            variant="secondary"
            className="kentu-meal-tray__cancel"
            disabled={disabled || isSaving}
            onClick={() => onCancel?.()}
          >
            {MCDRIVE_CANCEL_CHIP.label}
          </KentuButton>
          {needsCalculate ? (
            <KentuButton
              variant="primary"
              className={[
                'kentu-meal-tray__confirm',
                hasDisambiguationPending ? 'ring-2 ring-amber-400/70' : '',
              ].filter(Boolean).join(' ')}
              disabled={disabled || isSaving || items.length === 0 || hasDisambiguationPending}
              onClick={() => onFinish?.()}
              title={hasDisambiguationPending
                ? 'Ci sono alimenti da confermare — tocca le voci evidenziate'
                : undefined}
            >
              {hasDisambiguationPending
                ? '⚠️ Risolvi alimenti dubbi'
                : MCDRIVE_FINISH_CHIP.label}
            </KentuButton>
          ) : (
            <>
              <KentuButton
                variant="secondary"
                className="kentu-meal-tray__add-more"
                disabled={disabled || isSaving}
                onClick={() => onAddMore?.()}
              >
                {MCDRIVE_ADD_MORE_CHIP.label}
              </KentuButton>
              <KentuButton
                variant="primary"
                className={[
                  'kentu-meal-tray__confirm',
                  hasDisambiguationPending ? 'ring-2 ring-amber-400/70' : '',
                ].filter(Boolean).join(' ')}
                disabled={disabled || isSaving || items.length === 0 || !hasAnyResolvedMacros || hasDisambiguationPending}
                title={hasDisambiguationPending
                  ? 'Ci sono alimenti da confermare — tocca le voci evidenziate'
                  : undefined}
                onClick={async () => {
                  if (isSaving) return;
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
                  : hasDisambiguationPending
                    ? '⚠️ Risolvi alimenti dubbi'
                    : MCDRIVE_SAVE_CONFIRM_CHIP.label}
              </KentuButton>
            </>
          )}
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
  );
}

export default memo(LiveMealTray);
