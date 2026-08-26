import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { stashActivitySheetTempTab } from '../../activityCatalog';
import { decimalToTimeStr } from '../../coreEngine';

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
      icon: '🩺',
      label: 'Insight Clinico',
      action: 'send',
      message: 'Insight Clinico',
      intent: 'REQUEST_CLINICAL_INSIGHT',
      isHiddenUserMessage: true,
      visibleUserText: '🩺 Insight Clinico',
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
        icon: '🩺',
        label: 'Insight Clinico',
        action: 'send',
        message: 'Insight Clinico',
        intent: 'REQUEST_CLINICAL_INSIGHT',
        isHiddenUserMessage: true,
        visibleUserText: '🩺 Insight Clinico',
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
        icon: '🩺',
        label: 'Insight Clinico',
        action: 'send',
        message: 'Insight Clinico',
        intent: 'REQUEST_CLINICAL_INSIGHT',
        isHiddenUserMessage: true,
        visibleUserText: '🩺 Insight Clinico',
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
        'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-2 transition-colors',
        active
          ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
          : 'border-zinc-700/80 bg-zinc-900/90 text-zinc-100 hover:border-cyan-400/35 hover:bg-zinc-800',
      ].join(' ')}
    >
      <span className="text-lg leading-none" aria-hidden>{icon}</span>
      <span className="truncate text-[0.65rem] font-semibold tracking-wide uppercase">{label}</span>
    </button>
  );
}

function OverlayActionButton({ icon, label, onClick, disabled, compact = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex flex-col items-center justify-center gap-2 rounded-2xl border',
        compact ? 'min-h-[4.75rem] px-3 py-3' : 'min-h-[5.5rem] gap-2.5 px-4 py-4',
        'border-white/12 bg-white/[0.06] text-zinc-100 shadow-[0_8px_32px_rgba(0,0,0,0.35)]',
        'backdrop-blur-sm transition-all duration-150',
        'hover:border-cyan-400/45 hover:bg-cyan-500/10 hover:shadow-[0_12px_40px_rgba(34,211,238,0.12)]',
        'active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
        'disabled:pointer-events-none disabled:opacity-45',
      ].join(' ')}
    >
      <span className={`leading-none ${compact ? 'text-2xl' : 'text-3xl'}`} aria-hidden>{icon}</span>
      <span className="text-center text-xs font-semibold leading-tight sm:text-sm">{label}</span>
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
}) {
  const isCatalog = layout === 'catalog';
  const hasSections = Array.isArray(sections) && sections.length > 0;
  const flatItems = hasSections
    ? sections.flatMap((section) => section.items || [])
    : items;
  const itemCount = flatItems.length;

  if (!itemCount || typeof document === 'undefined') return null;

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
            {hasSections ? (
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
  dailyLog = [],
  disabled = false,
  isDiabetesAppMode = false,
  isAiGuidedModeActive = false,
}) {
  const [activeCategory, setActiveCategory] = useState(null);
  const [guidedMealOrigin, setGuidedMealOrigin] = useState(null);

  const closeMenus = useCallback(() => {
    setActiveCategory(null);
    setGuidedMealOrigin(null);
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
      onOpenActivityView?.({ defaultTab });
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

    // "Pasti" gestito con overlay custom (2 sezioni + lista).
    if (activeCategory === 'pasti') return null;

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
  }, [activeCategory, resolveItemPresentation]);

  const pastiToday = useMemo(() => {
    const log = Array.isArray(dailyLog) ? dailyLog : [];
    const items = log.filter(
      (e) => (e?.type === 'food' || e?.type === 'recipe')
        && typeof e?.mealTime === 'number'
        && Number.isFinite(e.mealTime)
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
      const mealTypeBase = String(it.mealType || '').split('_')[0].trim().toLowerCase();
      const base = mealTypeBase;
      const t = Number(it.mealTime);
      const slotId = `${base}_${t}`;

      if (!groups.has(slotId)) {
        groups.set(slotId, {
          slotId,
          mealTypeBase: base,
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
        timeStr: decimalToTimeStr(g.mealTime),
        title: `${(labelByBase[g.mealTypeBase] || g.mealTypeBase)} - ${decimalToTimeStr(g.mealTime)}`,
      }));
  }, [dailyLog]);

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
            <div className="shrink-0 text-center">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Scegli pasto
              </p>
              <h2 className="mt-1 text-xl font-semibold text-zinc-50">Pasti</h2>
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

            <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-4 pb-1">
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
                    }));

                    return (
                      <div
                        key={meal.slotId}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-100">
                            {meal.title}
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

  const submenuOverlay = pastiOverlay || (overlayConfig ? (
    <SubmenuFocusOverlay
      key={activeCategory}
      categoryLabel={overlayConfig.categoryLabel}
      subtitle={overlayConfig.subtitle}
      items={overlayConfig.items}
      sections={overlayConfig.sections}
      layout={overlayConfig.layout}
      disabled={disabled}
      onClose={handleOverlayClose}
      onSelectItem={dispatchItem}
      cancelLabel={activeCategory === GUIDED_MEAL_PICKER_ID ? 'Indietro' : 'Annulla'}
    />
  ) : null);

  if (isAiGuidedModeActive) return null;

  return (
    <div className="relative z-[100045] flex w-full shrink-0 flex-col gap-2 py-2">
      {submenuOverlay}

      <div
        className="grid w-full grid-cols-5 gap-1.5 sm:gap-2"
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
