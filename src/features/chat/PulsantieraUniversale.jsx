import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { stashActivitySheetTempTab } from '../../activityCatalog';

const PILLARS = [
  { id: 'pasti', icon: '🍽', label: 'Pasti' },
  { id: 'rapidi', icon: '⚡', label: 'Rapidi' },
  { id: 'attivita', icon: '🏃', label: 'Attività' },
  { id: 'tutti', icon: '⋯', label: 'Tutti' },
];

const SUBMENUS = {
  pasti: [
    { id: 'manuale', icon: '🔎', label: 'Manuale', action: 'openManual' },
    { id: 'guidato', icon: '✨', label: 'Guidato AI', action: 'send', message: 'Inserimento guidato pasto', intent: 'START_MCDRIVE_WIZARD' },
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
  ],
};

/** Vocabolario discovery — drawer "Tutti". */
const VOCABULARY_SECTIONS = [
  {
    id: 'alimentazione',
    title: 'Alimentazione',
    items: [
      { id: 'manuale', icon: '🔎', label: 'Pasto manuale', action: 'openManual' },
      { id: 'guidato', icon: '✨', label: 'Inserimento guidato', action: 'send', message: 'Inserimento guidato pasto', intent: 'START_MCDRIVE_WIZARD' },
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
      { id: 'peso', icon: '⚖️', label: 'Peso', action: 'send', message: 'Peso' },
    ],
  },
  {
    id: 'recupero',
    title: 'Recupero',
    items: [
      { id: 'pisolino', icon: '😴', label: 'Pisolino', action: 'shortcut', shortcutId: 'pisolino' },
      { id: 'meditazione', icon: '🧘', label: 'Meditazione', action: 'send', message: 'Meditazione' },
      { id: 'sonno', icon: '🌙', label: 'Sonno', action: 'send', message: 'Sonno' },
    ],
  },
];

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

function SubActionButton({ icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-[4.5rem] flex-shrink-0 flex-col items-center rounded-xl border border-zinc-700/80 bg-zinc-900/90 px-2.5 py-2 text-zinc-100 transition-colors hover:border-cyan-400/40 hover:bg-zinc-800"
    >
      <span className="text-xl leading-none" aria-hidden>{icon}</span>
      <span className="mt-1 text-[0.65rem] font-medium">{label}</span>
    </button>
  );
}

/**
 * Pulsantiera a 4 pilastri → sottomenu → routing verso chat / FastMealLogger / one-tap.
 */
export default function PulsantieraUniversale({
  onOpenManualView,
  onOpenActivityView,
  onManualShortcut,
  onSendChatMessage,
  disabled = false,
}) {
  const [activeCategory, setActiveCategory] = useState(null);

  const closeMenus = useCallback(() => {
    setActiveCategory(null);
  }, []);

  useEffect(() => {
    if (activeCategory !== 'tutti') return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') closeMenus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeCategory, closeMenus]);

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
      console.log('DEBUG: pulsantiera openActivity →', defaultTab);
      onOpenActivityView?.({ defaultTab });
      return;
    }
    if (item.action === 'shortcut') {
      const shortcutId = String(item.shortcutId || item.id || '').trim();
      if (!shortcutId) return;
      closeMenus();
      onManualShortcut?.(shortcutId);
      return;
    }
    if (item.action === 'send') {
      const text = String(item.message || item.label || '').trim();
      if (!text) return;
      closeMenus();
      onSendChatMessage?.(text, item.intent ? { intent: item.intent } : undefined);
    }
  }, [
    closeMenus,
    disabled,
    onOpenManualView,
    onOpenActivityView,
    onManualShortcut,
    onSendChatMessage,
  ]);

  const handlePillarClick = useCallback((pillarId) => {
    if (disabled) return;
    setActiveCategory((prev) => (prev === pillarId ? null : pillarId));
  }, [disabled]);

  const subItems = activeCategory && activeCategory !== 'tutti'
    ? (SUBMENUS[activeCategory] || [])
    : [];

  const tuttiDrawer = activeCategory === 'tutti' && typeof document !== 'undefined'
    ? createPortal(
      <>
        <div
          className="fixed inset-0 z-[100050] bg-black/55 backdrop-blur-[2px]"
          aria-hidden
          onClick={closeMenus}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tutte le azioni"
          className="fixed inset-x-0 bottom-0 z-[100051] flex max-h-[55dvh] flex-col rounded-t-3xl border-t border-zinc-700/80 bg-[#0b0f14] shadow-[0_-12px_40px_rgba(0,0,0,0.55)]"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">Vocabolario</p>
              <h2 className="text-base font-semibold text-zinc-100">Tutte le azioni</h2>
            </div>
            <button
              type="button"
              onClick={closeMenus}
              aria-label="Chiudi"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {VOCABULARY_SECTIONS.map((section) => (
              <section key={section.id} className="mb-4 last:mb-0">
                <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {section.title}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {section.items.map((item) => (
                    <li key={`${section.id}-${item.id}`}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => dispatchItem(item)}
                        className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5 text-left text-sm text-zinc-100 transition-colors hover:border-cyan-500/35 hover:bg-zinc-800/90 disabled:opacity-50"
                      >
                        <span className="text-lg" aria-hidden>{item.icon}</span>
                        <span className="font-medium">{item.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </>,
      document.body,
    )
    : null;

  return (
    <div className="flex w-full shrink-0 flex-col gap-2 py-2">
      {subItems.length > 0 ? (
        <div
          className="flex w-full items-center gap-2 overflow-x-auto px-0.5 scrollbar-hide"
          role="toolbar"
          aria-label="Sottomenu azioni"
        >
          <button
            type="button"
            onClick={closeMenus}
            aria-label="Chiudi sottomenu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700/80 bg-zinc-900/90 text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            ←
          </button>
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto scrollbar-hide">
            {subItems.map((item) => (
              <SubActionButton
                key={item.id}
                icon={item.icon}
                label={item.label}
                onClick={() => dispatchItem(item)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="grid w-full grid-cols-4 gap-2"
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

      {tuttiDrawer}
    </div>
  );
}
