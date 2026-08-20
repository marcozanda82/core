import React from 'react';
import { Activity } from 'lucide-react';

/**
 * Bottom Navigation "Arc Reactor": tab icon-only + slot centrale (Emblema flottante gestito da SalaComandi).
 */
export default function BottomChrome({
  BOTTOM_NAV_ITEMS,
  handleBottomNavTabSelect,
  activeBottomTab,
}) {
  const leftItems = (BOTTOM_NAV_ITEMS || []).filter((t) => t.id === 'oggi' || t.id === 'analisi');
  const rightItems = (BOTTOM_NAV_ITEMS || []).filter(
    (t) => t.id === 'bussola' || t.id === 'menu' || t.id === 'pianifica',
  );

  const renderTab = (t) => {
    const isActive = activeBottomTab === t.id;
    const label = t.label || t.id;
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => handleBottomNavTabSelect(t.id)}
        aria-current={isActive ? 'page' : undefined}
        aria-label={label}
        title={label}
        className="flex min-w-0 flex-1 items-center justify-center bg-transparent p-0.5"
      >
        <span
          className={[
            'flex h-9 w-9 items-center justify-center rounded-xl text-[1.2rem] leading-none transition-all duration-300',
            isActive
              ? 'scale-105 bg-cyan-500/15 text-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.4)]'
              : 'text-zinc-500 opacity-75 hover:opacity-100',
          ].join(' ')}
          aria-hidden
        >
          {t.id === 'bussola' ? <Activity size={20} strokeWidth={2.2} /> : t.icon}
        </span>
      </button>
    );
  };

  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed bottom-0 left-0 right-0 z-40 h-12 w-full overflow-visible px-1 pb-[env(safe-area-inset-bottom,0px)]"
      style={{ boxSizing: 'border-box', overflow: 'visible' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md"
      />

      <div className="relative z-10 flex h-full w-full items-center justify-around overflow-visible">
        {leftItems.map(renderTab)}
        <div className="relative flex flex-1 items-center justify-center overflow-visible" aria-hidden />
        {rightItems.slice(0, 2).map(renderTab)}
      </div>
    </nav>
  );
}
