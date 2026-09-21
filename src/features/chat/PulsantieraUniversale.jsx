import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { stashActivitySheetTempTab } from '../../activityCatalog';
import { METABOLIC_FOCUS_LABEL } from './metabolicFocus';
import { decimalToTimeStr, toCanonicalMealType } from '../../coreEngine';
import {
  countUnresolvedMealDraftItems,
  extractUnassignedDraftBlocks,
  formatInboxDraftCardLabel,
} from '../../utils/mealDraftStatus';
import MealTrashSection from '../../components/MealTrashSection';
import MealTrashSheet from '../../components/MealTrashSheet';
import StimulusCockpitOverlay from './StimulusCockpitOverlay';
import { useSmartQuickActions } from '../predictive/useSmartQuickActions';

const PILLARS = [
  { id: 'pasti', icon: '🍽', label: 'Pasti' },
  { id: 'rapidi', icon: '⚡', label: 'Rapidi' },
  { id: 'attivita', icon: '🏃', label: 'Attività' },
  { id: 'report', icon: '📊', label: 'Report' },
  { id: 'tutti', icon: '⋯', label: 'Tutti' },
];

const CATEGORY_LABELS = {
  pasti: 'Pasti',
  rapidi: 'Rapidi',
  attivita: 'Attività',
  report: 'Report',
  tutti: 'Tutte le azioni',
  'guidato-pasto': 'Per quale pasto vuoi che ti guidi?',
};

const GUIDED_MEAL_PICKER_ID = 'guidato-pasto';

function pointFromPointerOrTouch(event) {
  if (event?.touches?.length) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  if (event?.changedTouches?.length) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  }
  const x = Number(event?.clientX);
  const y = Number(event?.clientY);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

const GUIDED_MEAL_ITEMS = [
  { id: 'colazione', icon: '🍳', label: 'Colazione', action: 'startGuidedMeal', mealType: 'colazione' },
  { id: 'spuntino', icon: '🍎', label: 'Spuntino', action: 'startGuidedMeal', mealType: 'snack' },
  { id: 'pranzo', icon: '🍽️', label: 'Pranzo', action: 'startGuidedMeal', mealType: 'pranzo' },
  { id: 'cena', icon: '🌙', label: 'Cena', action: 'startGuidedMeal', mealType: 'cena' },
];

const SUBMENUS = {
  pasti: [
    { id: 'manuale', icon: '🔎', label: 'Manuale', action: 'openManual' },
    { id: 'guidato', icon: '✨', label: 'Guidato AI', action: 'pickGuidedMeal' },
  ],
  rapidi: [
    { id: 'acqua', icon: '💧', label: 'Acqua', action: 'shortcut', shortcutId: 'acqua' },
    { id: 'caffe', icon: '☕', label: 'Caffè', action: 'shortcut', shortcutId: 'caffe' },
    { id: 'pisolino', icon: '😴', label: 'Pisolino', action: 'shortcut', shortcutId: 'pisolino' },
  ],
  attivita: [
    { id: 'allenamento', icon: '🏋️', label: 'Allenamento', action: 'openActivity', defaultTab: 'pesi' },
    { id: 'camminata', icon: '🚶', label: 'Camminata', action: 'openActivity', defaultTab: 'camminata' },
    { id: 'corsa', icon: '🏃', label: 'Corsa', action: 'openActivity', defaultTab: 'corsa' },
    { id: 'piano', icon: '🗓️', label: 'Piano', action: 'openPlan' },
  ],
  report: [
    {
      id: 'report-ieri',
      icon: '📰',
      label: 'Report di Ieri',
      action: 'send',
      message: 'Genera il report di ieri',
      intent: 'GENERATE_PERIOD_REPORT',
      reportKind: 'yesterday',
    },
    {
      id: 'insight-clinico',
      icon: '⚡',
      label: METABOLIC_FOCUS_LABEL,
      action: 'send',
      message: METABOLIC_FOCUS_LABEL,
      intent: 'REQUEST_CLINICAL_INSIGHT',
      isHiddenUserMessage: true,
      visibleUserText: `⚡ ${METABOLIC_FOCUS_LABEL}`,
    },
    {
      id: 'sintesi-settimanale',
      icon: '📅',
      label: 'Sintesi Settimanale',
      action: 'send',
      message: 'Genera la sintesi settimanale',
      intent: 'GENERATE_PERIOD_REPORT',
      reportKind: 'weekly',
    },
    {
      id: 'trend-mensile',
      icon: '📈',
      label: 'Trend Mensile',
      action: 'send',
      message: 'Genera il trend mensile',
      intent: 'GENERATE_PERIOD_REPORT',
      reportKind: 'monthly',
    },
  ],
};

/** Vocabolario completo — pilastro "Tutti". */
const VOCABULARY_SECTIONS = [
  {
    id: 'alimentazione',
    title: 'Alimentazione',
    items: [
      { id: 'manuale', icon: '🔎', label: 'Pasto manuale', action: 'openManual' },
      { id: 'guidato', icon: '✨', label: 'Inserimento guidato', action: 'pickGuidedMeal' },
      { id: 'acqua', icon: '💧', label: 'Acqua', action: 'shortcut', shortcutId: 'acqua' },
      { id: 'caffe', icon: '☕', label: 'Caffè', action: 'shortcut', shortcutId: 'caffe' },
      { id: 'te', icon: '🍵', label: 'Tè', action: 'shortcut', shortcutId: 'tea' },
      { id: 'energy', icon: '🥤', label: 'Energy', action: 'shortcut', shortcutId: 'energy' },
      { id: 'alcool', icon: '🍷', label: 'Alcol', action: 'send', message: 'Alcol' },
      { id: 'integratori', icon: '💊', label: 'Integratori', action: 'send', message: 'Integratori' },
    ],
  },
  {
    id: 'attivita',
    title: 'Attività',
    items: [
      { id: 'allenamento', icon: '🏋️', label: 'Allenamento', action: 'openActivity', defaultTab: 'pesi' },
      { id: 'camminata', icon: '🚶', label: 'Camminata', action: 'openActivity', defaultTab: 'camminata' },
      { id: 'corsa', icon: '🏃', label: 'Corsa', action: 'openActivity', defaultTab: 'corsa' },
      { id: 'piano', icon: '🗓️', label: 'Piano', action: 'openPlan' },
      { id: 'peso', icon: '⚖️', label: 'Peso', action: 'send', message: 'Peso' },
    ],
  },
  {
    id: 'report',
    title: 'Report',
    items: [
      {
        id: 'report-ieri',
        icon: '📰',
        label: 'Report di Ieri',
        action: 'send',
        message: 'Genera il report di ieri',
        intent: 'GENERATE_PERIOD_REPORT',
        reportKind: 'yesterday',
      },
      {
        id: 'insight-clinico',
        icon: '⚡',
        label: METABOLIC_FOCUS_LABEL,
        action: 'send',
        message: METABOLIC_FOCUS_LABEL,
        intent: 'REQUEST_CLINICAL_INSIGHT',
        isHiddenUserMessage: true,
        visibleUserText: `⚡ ${METABOLIC_FOCUS_LABEL}`,
      },
      {
        id: 'sintesi-settimanale',
        icon: '📅',
        label: 'Sintesi Settimanale',
        action: 'send',
        message: 'Genera la sintesi settimanale',
        intent: 'GENERATE_PERIOD_REPORT',
        reportKind: 'weekly',
      },
      {
        id: 'trend-mensile',
        icon: '📈',
        label: 'Trend Mensile',
        action: 'send',
        message: 'Genera il trend mensile',
        intent: 'GENERATE_PERIOD_REPORT',
        reportKind: 'monthly',
      },
    ],
  },
  {
    id: 'recupero',
    title: 'Recupero',
    items: [
      { id: 'pisolino', icon: '😴', label: 'Pisolino', action: 'shortcut', shortcutId: 'pisolino' },
      { id: 'meditazione', icon: '🧘', label: 'Meditazione', action: 'send', message: 'Meditazione' },
      { id: 'sonno', icon: '🌙', label: 'Sonno', action: 'send', message: 'Sonno' },
      {
        id: 'insight-clinico',
        icon: '⚡',
        label: METABOLIC_FOCUS_LABEL,
        action: 'send',
        message: METABOLIC_FOCUS_LABEL,
        intent: 'REQUEST_CLINICAL_INSIGHT',
        isHiddenUserMessage: true,
        visibleUserText: `⚡ ${METABOLIC_FOCUS_LABEL}`,
      },
    ],
  },
];

/** Griglia responsive con scroll sicuro su cataloghi lunghi. */
const GRID_COMPACT = 'grid w-full max-w-md grid-cols-2 gap-3 sm:grid-cols-2';
const GRID_CATALOG = 'grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4';

function resolveCompactGridClass(itemCount) {
  if (itemCount >= 4) return GRID_COMPACT;
  if (itemCount === 3) return 'grid w-full max-w-md grid-cols-2 gap-3 sm:grid-cols-3';
  return 'grid w-full max-w-sm grid-cols-2 gap-3';
}

function PillarButton({ icon, label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'kentu-pulsantiera__btn flex h-auto min-h-0 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 transition-colors',
        active
          ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
          : 'border-zinc-700/80 bg-zinc-900/90 text-zinc-100 hover:border-cyan-400/35 hover:bg-zinc-800',
      ].join(' ')}
    >
      <span className="text-base leading-none" aria-hidden>{icon}</span>
      <span className="max-w-full truncate text-[0.62rem] font-semibold leading-tight tracking-wide uppercase">{label}</span>
    </button>
  );
}

function OverlayActionButton({ icon, label, onClick, disabled, compact = false, dense = false }) {
  const sizeClass = dense
    ? 'min-h-[3.35rem] gap-1 px-2 py-1.5'
    : compact
      ? 'min-h-[4.75rem] gap-2 px-3 py-3'
      : 'min-h-[5.5rem] gap-2.5 px-4 py-4';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex flex-col items-center justify-center rounded-2xl border',
        sizeClass,
        'border-white/12 bg-white/[0.06] text-zinc-100 shadow-[0_8px_32px_rgba(0,0,0,0.35)]',
        'backdrop-blur-sm transition-all duration-150',
        'hover:border-cyan-400/45 hover:bg-cyan-500/10 hover:shadow-[0_12px_40px_rgba(34,211,238,0.12)]',
        'active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
        'disabled:pointer-events-none disabled:opacity-45',
      ].join(' ')}
    >
      <span className={`leading-none ${dense ? 'text-xl' : compact ? 'text-2xl' : 'text-3xl'}`} aria-hidden>{icon}</span>
      <span className={`text-center font-semibold leading-tight whitespace-nowrap ${dense ? 'text-[10px]' : 'text-xs sm:text-sm'}`}>
        {label}
      </span>
    </button>
  );
}

function OverlayActionGrid({ items, disabled, onSelectItem, gridClass, compact = false }) {
  return (
    <div className={gridClass}>
      {items.map((item) => (
        <OverlayActionButton
          key={item.id}
          icon={item.icon}
          label={item.label}
          disabled={disabled}
          compact={compact}
          onClick={() => onSelectItem(item)}
        />
      ))}
    </div>
  );
}

/**
 * Vetrina ghiacciata: overlay glassmorphism con azioni centrate.
 * @param {'compact'|'catalog'} layout — catalog = Tutti (scroll + griglia ampia)
 */
function SubmenuFocusOverlay({
  categoryLabel,
  subtitle = 'Scegli azione',
  items = [],
  sections = null,
  layout = 'compact',
  disabled,
  onClose,
  onSelectItem,
  cancelLabel = 'Annulla',
  emptyMessage = '',
}) {
  const isCatalog = layout === 'catalog';
  const hasSections = Array.isArray(sections) && sections.length > 0;
  const flatItems = hasSections
    ? sections.flatMap((section) => section.items || [])
    : items;
  const itemCount = flatItems.length;
  const emptyText = String(emptyMessage || '').trim();

  if (typeof document === 'undefined') return null;
  if (!itemCount && !emptyText) return null;

  const gridClass = isCatalog ? GRID_CATALOG : resolveCompactGridClass(itemCount);
  const panelMaxWidth = isCatalog ? 'max-w-3xl' : 'max-w-lg';

  return createPortal(
    <>
      <div
        className="kentu-submenu-focus-backdrop fixed inset-0 z-[100040] bg-black/60 backdrop-blur-md"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Sottomenu ${categoryLabel}`}
        className="pointer-events-none fixed inset-0 z-[100041] flex items-center justify-center px-4 py-6 sm:px-6 sm:py-8"
      >
        <div
          className={`kentu-submenu-focus-panel pointer-events-auto flex max-h-[90dvh] w-full ${panelMaxWidth} flex-col items-center gap-4 overflow-hidden`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="shrink-0 text-center">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {subtitle}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-zinc-50">{categoryLabel}</h2>
          </div>

          <div
            className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-0.5 pb-1"
          >
            {!itemCount && emptyText ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-400">
                {emptyText}
              </p>
            ) : hasSections ? (
              <div className="flex flex-col gap-5">
                {sections.map((section) => (
                  <section key={section.id}>
                    <h3 className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {section.title}
                    </h3>
                    <OverlayActionGrid
                      items={section.items}
                      disabled={disabled}
                      onSelectItem={onSelectItem}
                      gridClass={gridClass}
                      compact
                    />
                  </section>
                ))}
              </div>
            ) : (
              <OverlayActionGrid
                items={items}
                disabled={disabled}
                onSelectItem={onSelectItem}
                gridClass={gridClass}
              />
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className={[
              'mt-auto flex-shrink-0 rounded-full border border-zinc-600/80 bg-zinc-900/80 px-5 py-2.5',
              'text-sm font-medium text-zinc-300 backdrop-blur-sm transition-colors',
              'hover:border-zinc-500 hover:bg-zinc-800 hover:text-white',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40',
            ].join(' ')}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

/**
 * Pulsantiera a 4 pilastri → overlay focus → routing verso chat / FastMealLogger / one-tap.
 */
export default function PulsantieraUniversale({
  onOpenManualView,
  onOpenActivityView,
  onOpenPlanView = null,
  onManualShortcut,
  onSendChatMessage,
  onSelectInboxDraft = null,
  onDropInboxOntoMeal = null,
  onDropInboxOntoDraft = null,
  onTrashMeal = null,
  trashMeals = [],
  onRestoreTrashMeal = null,
  onPurgeTrashMeal = null,
  onDeleteWorkout = null,
  extraPendingDrafts = [],
  onConfirmSessionDraft = null,
  onEditSessionDraft = null,
  onCancelSessionDraft = null,
  onOpenSessions = null,
  dailyLog = [],
  manualNodes = [],
  fullHistory = {},
  fourCylinder = null,
  disabled = false,
  isDiabetesAppMode = false,
  isAiGuidedModeActive = false,
  embedded = false,
}) {
  const [activeCategory, setActiveCategory] = useState(null);
  const [guidedMealOrigin, setGuidedMealOrigin] = useState(null);
  const [inboxDrag, setInboxDrag] = useState(null);
  const [showMealTrash, setShowMealTrash] = useState(false);
  const inboxDragRef = useRef({
    timer: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    block: null,
    armed: false,
    suppressTapUntil: 0,
  });

  const smartRapidi = useSmartQuickActions({
    fullHistory,
    dailyLog,
    manualNodes,
  });

  const closeMenus = useCallback(() => {
    setActiveCategory(null);
    setGuidedMealOrigin(null);
    setShowMealTrash(false);
    setInboxDrag(null);
    inboxDragRef.current.armed = false;
    inboxDragRef.current.block = null;
    inboxDragRef.current.pointerId = null;
  }, []);

  const handleOverlayClose = useCallback(() => {
    if (activeCategory === GUIDED_MEAL_PICKER_ID && guidedMealOrigin) {
      setActiveCategory(guidedMealOrigin);
      setGuidedMealOrigin(null);
      return;
    }
    closeMenus();
  }, [activeCategory, guidedMealOrigin, closeMenus]);

  useEffect(() => {
    if (isAiGuidedModeActive) closeMenus();
  }, [isAiGuidedModeActive, closeMenus]);

  useEffect(() => {
    if (!activeCategory) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') handleOverlayClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeCategory, handleOverlayClose]);

  const resolveItemPresentation = useCallback((item) => {
    if (!item || item.action !== 'openPlan') return item;
    if (isDiabetesAppMode) {
      return { ...item, icon: '💊', label: 'Terapia' };
    }
    return { ...item, icon: '🗓️', label: 'Piano' };
  }, [isDiabetesAppMode]);

  const dispatchItem = useCallback((item) => {
    if (disabled || !item) return;
    if (item.action === 'openManual') {
      closeMenus();
      onOpenManualView?.();
      return;
    }
    if (item.action === 'openActivity') {
      closeMenus();
      const defaultTab = stashActivitySheetTempTab(item.defaultTab || 'pesi');
      const payload = {
        defaultTab,
        category: item.category || (defaultTab === 'pesi' ? 'strength' : null),
      };
      if (item.targetMuscle) payload.targetMuscle = item.targetMuscle;
      if (Array.isArray(item.muscles) && item.muscles.length > 0) {
        payload.muscles = item.muscles;
      }
      onOpenActivityView?.(payload);
      return;
    }
    if (item.action === 'openPlan') {
      closeMenus();
      onOpenPlanView?.();
      return;
    }
    if (item.action === 'shortcut') {
      const shortcutId = String(item.shortcutId || item.id || '').trim();
      if (!shortcutId) return;
      closeMenus();
      onManualShortcut?.(shortcutId);
      return;
    }
    if (item.action === 'pickGuidedMeal') {
      setGuidedMealOrigin(activeCategory === GUIDED_MEAL_PICKER_ID ? guidedMealOrigin : activeCategory);
      setActiveCategory(GUIDED_MEAL_PICKER_ID);
      return;
    }
    if (item.action === 'startGuidedMeal') {
      const mealType = String(item.mealType || '').trim();
      if (!mealType) return;
      closeMenus();
      onSendChatMessage?.('', {
        intent: 'START_MCDRIVE_WIZARD',
        mealType,
        skipUserBubble: true,
      });
      return;
    }
    if (item.action === 'send') {
      const text = String(item.message || item.label || '').trim();
      if (!text) return;
      closeMenus();
      const extras = {};
      if (item.intent) extras.intent = item.intent;
      if (item.reportKind) extras.reportKind = item.reportKind;
      if (item.skipUserBubble === true) extras.skipUserBubble = true;
      if (item.isHiddenUserMessage === true) extras.isHiddenUserMessage = true;
      if (item.visibleUserText) extras.visibleUserText = String(item.visibleUserText);
      onSendChatMessage?.(text, Object.keys(extras).length ? extras : undefined);
    }
  }, [
    closeMenus,
    disabled,
    activeCategory,
    guidedMealOrigin,
    onOpenManualView,
    onOpenActivityView,
    onOpenPlanView,
    onManualShortcut,
    onSendChatMessage,
  ]);

  const handlePillarClick = useCallback((pillarId) => {
    if (disabled) return;
    setActiveCategory((prev) => (prev === pillarId ? null : pillarId));
  }, [disabled]);

  const overlayConfig = useMemo(() => {
    if (!activeCategory) return null;

    if (activeCategory === GUIDED_MEAL_PICKER_ID) {
      return {
        categoryLabel: CATEGORY_LABELS[GUIDED_MEAL_PICKER_ID],
        subtitle: 'Guidato AI',
        items: GUIDED_MEAL_ITEMS,
        layout: 'compact',
      };
    }

    if (activeCategory === 'rapidi') {
      const items = (smartRapidi.items || []).map((rawItem) => ({
        ...resolveItemPresentation(rawItem),
        id: rawItem.id,
      }));
      return {
        categoryLabel: CATEGORY_LABELS.rapidi,
        subtitle: smartRapidi.band?.label || 'Scegli azione',
        items,
        emptyMessage: items.length === 0
          ? 'Nessuna abitudine in questa fascia oraria'
          : '',
        layout: 'compact',
      };
    }

    if (activeCategory === 'tutti') {
      const sections = VOCABULARY_SECTIONS.map((section) => ({
        id: section.id,
        title: section.title,
        items: section.items.map((rawItem) => ({
          ...resolveItemPresentation(rawItem),
          id: `${section.id}-${rawItem.id}`,
        })),
      }));
      const itemCount = sections.reduce((sum, section) => sum + section.items.length, 0);
      if (itemCount === 0) return null;
      return {
        categoryLabel: CATEGORY_LABELS.tutti,
        subtitle: 'Vocabolario',
        sections,
        layout: 'catalog',
      };
    }

    // "Pasti" e "Attività" usano overlay custom (lista pasti / sismografi stimolo).
    if (activeCategory === 'pasti' || activeCategory === 'attivita') return null;

    const items = (SUBMENUS[activeCategory] || []).map((rawItem) => ({
      ...resolveItemPresentation(rawItem),
      id: rawItem.id,
    }));
    if (items.length === 0) return null;

    return {
      categoryLabel: CATEGORY_LABELS[activeCategory] || 'Azioni',
      subtitle: 'Scegli azione',
      items,
      layout: 'compact',
    };
  }, [activeCategory, resolveItemPresentation, smartRapidi]);

  const pastiToday = useMemo(() => {
    const log = Array.isArray(dailyLog) ? dailyLog : [];
    const items = log.filter(
      (e) => (e?.type === 'food' || e?.type === 'recipe')
        && String(e?.mealType || '').trim().length > 0,
    );

    const labelByBase = {
      colazione: 'Colazione',
      pranzo: 'Pranzo',
      cena: 'Cena',
      snack: 'Spuntino',
      spuntino: 'Spuntino',
    };

    // Note: nel diario il slot "id" usato dagli editori è composito (mealType+time),
    // quindi emettiamo `editingMealId` nello stesso formato.
    const groups = new Map();
    items.forEach((it) => {
      const mealTypeBase = toCanonicalMealType(String(it.mealType || '').split('_')[0])
        || String(it.mealType || '').split('_')[0].trim().toLowerCase();
      const t = typeof it.mealTime === 'number' && Number.isFinite(it.mealTime)
        ? Number(it.mealTime)
        : 12;
      const typeKey = String(it.mealType || '').trim() || mealTypeBase;
      const slotId = `${typeKey}_${t}`;

      if (!groups.has(slotId)) {
        groups.set(slotId, {
          slotId,
          mealTypeBase,
          mealTime: t,
          foods: [],
        });
      }
      groups.get(slotId).foods.push(it);
    });

    return Array.from(groups.values())
      .sort((a, b) => (Number(b.mealTime) || 0) - (Number(a.mealTime) || 0))
      .map((g) => ({
        ...g,
        pendingCount: countUnresolvedMealDraftItems(g.foods),
        timeStr: decimalToTimeStr(g.mealTime),
        title: `${(labelByBase[g.mealTypeBase] || g.mealTypeBase)} - ${decimalToTimeStr(g.mealTime)}`,
      }));
  }, [dailyLog]);

  const inboxBlocks = useMemo(() => extractUnassignedDraftBlocks(dailyLog), [dailyLog]);

  const resolveInboxDropTarget = useCallback((x, y, ignoreDraftId = '') => {
    if (typeof document === 'undefined') return null;
    const skipId = String(ignoreDraftId || '').trim();
    const stack = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(x, y)
      : [document.elementFromPoint(x, y)];
    for (const el of stack) {
      if (!el || typeof el.closest !== 'function') continue;
      const row = el.closest('[data-inbox-drop-kind]');
      if (!row) continue;
      const kind = String(row.getAttribute('data-inbox-drop-kind') || '').trim();
      const id = String(row.getAttribute('data-inbox-drop-id') || '').trim();
      if (!kind || !id) continue;
      if (kind === 'draft' && skipId && id === skipId) continue;
      return { kind, id };
    }
    return null;
  }, []);

  const isInboxDragging = inboxDrag != null;

  const releaseInboxDrag = useCallback(() => {
    inboxDragRef.current.armed = false;
    inboxDragRef.current.block = null;
    inboxDragRef.current.pointerId = null;
    setInboxDrag(null);
  }, []);

  useEffect(() => {
    if (activeCategory === 'pasti') return undefined;
    if (inboxDragRef.current.armed) releaseInboxDrag();
    return undefined;
  }, [activeCategory, releaseInboxDrag]);

  useEffect(() => {
    if (!isInboxDragging) return undefined;
    let finished = false;
    const onMove = (event) => {
      if (event.cancelable) event.preventDefault();
      const { x, y } = pointFromPointerOrTouch(event);
      const dropTarget = resolveInboxDropTarget(x, y, inboxDragRef.current.block?.id);
      setInboxDrag((prev) => (
        prev
          ? { ...prev, x, y, dropTarget }
          : prev
      ));
    };
    const finish = (event) => {
      if (finished) return;
      finished = true;
      const { x, y } = pointFromPointerOrTouch(event);
      const dropTarget = resolveInboxDropTarget(x, y, inboxDragRef.current.block?.id);
      const block = inboxDragRef.current.block;
      inboxDragRef.current.armed = false;
      inboxDragRef.current.block = null;
      inboxDragRef.current.pointerId = null;
      inboxDragRef.current.suppressTapUntil = Date.now() + 500;
      setInboxDrag(null);
      if (!dropTarget?.id || !block) return;
      if (dropTarget.kind === 'draft') {
        if (String(dropTarget.id) === String(block.id)) return;
        const other = inboxBlocks.find((item) => String(item.id) === String(dropTarget.id));
        if (!other) return;
        onDropInboxOntoDraft?.(block, other);
        return;
      }
      if (dropTarget.kind !== 'meal') return;
      const meal = pastiToday.find((item) => item.slotId === dropTarget.id);
      if (!meal) return;
      onDropInboxOntoMeal?.(block, {
        slotKey: meal.slotId,
        slotId: meal.slotId,
        mealType: meal.foods[0]?.mealType || meal.mealTypeBase,
        mealTime: meal.mealTime,
        foods: meal.foods,
        label: meal.title,
      });
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', finish);
    window.addEventListener('touchcancel', finish);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', finish);
      window.removeEventListener('touchcancel', finish);
    };
  }, [isInboxDragging, pastiToday, inboxBlocks, onDropInboxOntoMeal, onDropInboxOntoDraft, resolveInboxDropTarget]);

  const startInboxHandleDrag = useCallback((event, block) => {
    if (disabled || event.button === 2) return;
    if (event.type === 'touchstart' && typeof window !== 'undefined' && window.PointerEvent) {
      return;
    }
    if (inboxDragRef.current.armed) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    const { x, y } = pointFromPointerOrTouch(event);
    inboxDragRef.current.startX = x;
    inboxDragRef.current.startY = y;
    inboxDragRef.current.block = block;
    inboxDragRef.current.pointerId = event.pointerId ?? 'touch';
    inboxDragRef.current.armed = true;
    try {
      event.currentTarget?.releasePointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
    setInboxDrag({
      block,
      x,
      y,
      dropTarget: null,
    });
  }, [disabled]);

  const onInboxCardClick = useCallback((event, block) => {
    event.preventDefault();
    event.stopPropagation();
    if (inboxDragRef.current.armed) return;
    if (Date.now() < (inboxDragRef.current.suppressTapUntil || 0)) return;
    onSelectInboxDraft?.(block);
  }, [onSelectInboxDraft]);

  const pastiOverlay = activeCategory === 'pasti' ? (
    createPortal(
      <>
        <div
          className="kentu-submenu-focus-backdrop fixed inset-0 z-[100040] bg-black/60 backdrop-blur-md"
          aria-hidden
          onClick={handleOverlayClose}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sottomenu Pasti"
          className="pointer-events-none fixed inset-0 z-[100041] flex items-center justify-center px-4 py-6 sm:px-6 sm:py-8"
        >
          <div
            className="kentu-submenu-focus-panel pointer-events-auto flex max-h-[90dvh] w-full max-w-lg flex-col items-center gap-4 overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="relative w-full shrink-0 text-center">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Scegli pasto
              </p>
              <h2 className="mt-1 text-xl font-semibold text-zinc-50">Pasti</h2>
              {Array.isArray(trashMeals) && trashMeals.length > 0 ? (
                <button
                  type="button"
                  className="meal-trash-badge-btn"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setShowMealTrash(true);
                  }}
                  aria-label={`Apri cestino, ${trashMeals.length} pasti`}
                  title="Cestino"
                >
                  🗑️
                  <span className="meal-trash-badge-btn__count">{trashMeals.length}</span>
                </button>
              ) : null}
            </div>

            <div className="mx-auto grid w-full max-w-sm shrink-0 grid-cols-2 gap-3 px-4 [&>button]:w-full">
              <OverlayActionButton
                icon={SUBMENUS.pasti.find((i) => i.id === 'manuale')?.icon || '🔎'}
                label={SUBMENUS.pasti.find((i) => i.id === 'manuale')?.label || 'Manuale'}
                onClick={() => dispatchItem(SUBMENUS.pasti.find((i) => i.id === 'manuale'))}
              />
              <OverlayActionButton
                icon={SUBMENUS.pasti.find((i) => i.id === 'guidato')?.icon || '✨'}
                label={SUBMENUS.pasti.find((i) => i.id === 'guidato')?.label || 'Guidato AI'}
                onClick={() => dispatchItem(SUBMENUS.pasti.find((i) => i.id === 'guidato'))}
              />
            </div>

            <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden px-4 pb-1">
              {inboxBlocks.length > 0 ? (
                <section className="inbox-pasti-top mb-3 max-h-[38%] shrink-0 overflow-y-auto overscroll-contain">
                  <h3 className="inbox-drafts__title">📥 Inbox (Bozze in sospeso)</h3>
                  <p className="mb-2 text-[0.68rem] text-slate-500">
                    Tocco per smistare · trascina dalla maniglia su un pasto o su un'altra bozza
                  </p>
                  <div className="inbox-drafts__list">
                    {inboxBlocks.map((block) => {
                      const isDragging = inboxDrag?.block?.id === block.id;
                      const isDraftDropTarget = !isDragging
                        && inboxDrag?.dropTarget?.kind === 'draft'
                        && inboxDrag.dropTarget.id === block.id;
                      return (
                      <div
                        key={block.id}
                        data-inbox-drop-kind="draft"
                        data-inbox-drop-id={block.id}
                        className={[
                          'inbox-drafts__card',
                          isDragging ? 'inbox-drafts__card--dragging' : '',
                          isDraftDropTarget ? 'inbox-drafts__card--drop-target' : '',
                        ].join(' ')}
                      >
                        <button
                          type="button"
                          className="inbox-drafts__drag-handle"
                          aria-label="Trascina bozza su un pasto o su un'altra bozza"
                          onPointerDown={(event) => startInboxHandleDrag(event, block)}
                          onTouchStart={(event) => startInboxHandleDrag(event, block)}
                          onContextMenu={(event) => event.preventDefault()}
                        >
                          <span className="inbox-drafts__grip" aria-hidden>
                            <span /><span /><span /><span /><span /><span />
                          </span>
                        </button>
                        <button
                          type="button"
                          className="inbox-drafts__card-main"
                          onClick={(event) => onInboxCardClick(event, block)}
                        >
                          <span className="inbox-drafts__card-label">
                            {formatInboxDraftCardLabel(block)}
                          </span>
                          <span className="inbox-drafts__card-cta">Smista</span>
                        </button>
                      </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <h3 className="inbox-drafts__title inbox-drafts__title--muted">I tuoi Pasti</h3>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  {pastiToday.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-700/80 px-4 py-8 text-center text-sm text-slate-500">
                      Nessun pasto registrato oggi.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {pastiToday.map((meal) => {
                        const foodsForMcDrive = meal.foods.map((f) => ({
                          foodName: f.foodName || f.name || f.desc || f.label || '',
                          grams: f.grams ?? f.qta ?? f.weight ?? f.qty ?? 0,
                          kcal: f.kcal ?? f.cal ?? 0,
                          pro: f.pro ?? f.prot ?? 0,
                          carb: f.carb ?? f.carbo ?? f.cho ?? 0,
                          fat: f.fat ?? f.fatTotal ?? 0,
                          foodDbKey: f.foodDbKey ?? f.matchedKey ?? null,
                          itemId: f.itemId ?? f.id ?? null,
                          status: f.status || null,
                          spokenFoodName: f.spokenFoodName || f.foodName || f.name || f.desc || '',
                          servingLabel: f.servingLabel || null,
                          coffeeShopProductId: f.coffeeShopProductId || null,
                        }));
                        const isDropTarget = inboxDrag?.dropTarget?.kind === 'meal'
                          && inboxDrag.dropTarget.id === meal.slotId;

                        return (
                          <div
                            key={meal.slotId}
                            data-inbox-drop-kind="meal"
                            data-inbox-drop-id={meal.slotId}
                            className={[
                              'flex items-center justify-between gap-3 rounded-xl border bg-slate-900/40 px-3 py-2',
                              isDropTarget
                                ? 'border-amber-400/80 ring-2 ring-amber-400/50'
                                : 'border-slate-800/80',
                            ].join(' ')}
                          >
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <div className="truncate text-sm font-semibold text-slate-100">
                                  {meal.title}
                                </div>
                                {meal.pendingCount > 0 ? (
                                  <span className="inline-flex shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-amber-400">
                                    {meal.pendingCount} da calcolare
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  closeMenus();
                                  onOpenManualView?.({ editingMealId: meal.slotId });
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-800/60 text-cyan-200 transition-colors hover:border-cyan-500/40 hover:bg-slate-800/90 active:scale-[0.98]"
                                aria-label="Modifica pasto"
                                title="Modifica"
                              >
                                ✏️
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  onTrashMeal?.({
                                    slotKey: meal.slotId,
                                    slotId: meal.slotId,
                                    mealType: meal.foods[0]?.mealType || meal.mealTypeBase,
                                    mealTime: meal.mealTime,
                                    foods: meal.foods,
                                    label: meal.title,
                                  });
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-800/60 text-rose-300 transition-colors hover:border-rose-500/40 hover:bg-slate-800/90 active:scale-[0.98]"
                                aria-label="Sposta pasto nel cestino"
                                title="Cestino"
                              >
                                🗑️
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  closeMenus();
                                  onSendChatMessage?.('', {
                                    intent: 'START_MCDRIVE_WIZARD',
                                    mealType: meal.mealTypeBase,
                                    editingMealId: meal.slotId,
                                    editingFoods: foodsForMcDrive,
                                    editingExactTime: meal.timeStr,
                                    skipUserBubble: true,
                                  });
                                }}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-800/60 text-cyan-200 transition-colors hover:border-cyan-500/40 hover:bg-slate-800/90 active:scale-[0.98]"
                                aria-label="Guidami modifica"
                                title="Guidato AI"
                              >
                                ✨
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>

            {inboxDrag ? createPortal(
              <div
                className="inbox-drag-ghost"
                style={{ left: inboxDrag.x, top: inboxDrag.y }}
              >
                {formatInboxDraftCardLabel(inboxDrag.block || {})}
              </div>,
              document.body,
            ) : null}

            <button
              type="button"
              onClick={handleOverlayClose}
              className={[
                'mt-auto flex-shrink-0 rounded-full border border-zinc-600/80 bg-zinc-900/80 px-5 py-2.5',
                'text-sm font-medium text-zinc-300 backdrop-blur-sm transition-colors',
                'hover:border-zinc-500 hover:bg-zinc-800 hover:text-white',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40',
              ].join(' ')}
            >
              Annulla
            </button>
          </div>
        </div>
      </>,
      document.body,
    )
  ) : null;

  const attivitaCockpit = (
    <StimulusCockpitOverlay
      open={activeCategory === 'attivita'}
      onClose={handleOverlayClose}
      fourCylinder={fourCylinder}
      fullHistory={fullHistory}
      dailyLog={dailyLog}
      disabled={disabled}
      isDiabetesAppMode={isDiabetesAppMode}
      onOpenActivity={(payload) => dispatchItem({
        action: 'openActivity',
        ...payload,
      })}
      onOpenPlan={() => dispatchItem({ action: 'openPlan' })}
      onDeleteWorkout={onDeleteWorkout}
      extraPendingDrafts={extraPendingDrafts}
      manualNodes={manualNodes}
      onConfirmSessionDraft={onConfirmSessionDraft}
      onEditSessionDraft={onEditSessionDraft}
      onCancelSessionDraft={onCancelSessionDraft}
      onOpenSessions={onOpenSessions}
    />
  );

  const submenuOverlay = pastiOverlay || (overlayConfig ? (
    <SubmenuFocusOverlay
      key={activeCategory}
      categoryLabel={overlayConfig.categoryLabel}
      subtitle={overlayConfig.subtitle}
      items={overlayConfig.items}
      sections={overlayConfig.sections}
      layout={overlayConfig.layout}
      emptyMessage={overlayConfig.emptyMessage}
      disabled={disabled}
      onClose={handleOverlayClose}
      onSelectItem={dispatchItem}
      cancelLabel={activeCategory === GUIDED_MEAL_PICKER_ID ? 'Indietro' : 'Annulla'}
    />
  ) : null);

  if (isAiGuidedModeActive) return null;

  return (
    <div
      className={[
        'kentu-pulsantiera relative flex h-auto w-full flex-none shrink-0 flex-col gap-1 py-1',
        embedded ? 'z-10' : 'z-[100045]',
      ].join(' ')}
    >
      {submenuOverlay}
      {attivitaCockpit}
      <MealTrashSheet
        open={showMealTrash && activeCategory === 'pasti'}
        items={trashMeals}
        onRestore={onRestoreTrashMeal}
        onPurge={onPurgeTrashMeal}
        onClose={() => setShowMealTrash(false)}
      />

      <div
        className="kentu-pulsantiera__row flex h-auto w-full flex-none flex-row flex-nowrap items-center justify-around gap-1"
        role="toolbar"
        aria-label="Pulsantiera universale"
      >
        {PILLARS.map((pillar) => (
          <PillarButton
            key={pillar.id}
            icon={pillar.icon}
            label={pillar.label}
            active={activeCategory === pillar.id}
            onClick={() => handlePillarClick(pillar.id)}
          />
        ))}
      </div>
    </div>
  );
}
