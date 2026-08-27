import React from 'react';
import { Activity, BookOpen } from 'lucide-react';

/**
 * Bottom Navigation "Arc Reactor": tab con icona + label + slot centrale (Emblema flottante da SalaComandi).
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
        className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 bg-transparent px-0.5 pb-1 pt-1.5"
      >
        <span
          className={[
            'flex h-8 w-8 items-center justify-center rounded-xl text-[1.15rem] leading-none transition-all duration-300',
            isActive
              ? 'scale-105 bg-cyan-500/15 text-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.4)]'
              : 'text-zinc-500 opacity-75 hover:opacity-100',
          ].join(' ')}
          aria-hidden
        >
          {t.id === 'bussola' ? (
            <Activity size={18} strokeWidth={2.2} />
          ) : t.id === 'analisi' ? (
            <BookOpen size={18} strokeWidth={2.2} />
          ) : (
            t.icon
          )}
        </span>
        <span
          className={[
            'max-w-full truncate text-[10px] font-medium leading-none tracking-tight transition-colors duration-300',
            isActive ? 'text-cyan-300' : 'text-slate-400',
          ].join(' ')}
        >
          {label}
        </span>
      </button>
    );
  };

  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed bottom-0 left-0 right-0 z-40 min-h-[3.5rem] w-full overflow-visible px-1 pb-[env(safe-area-inset-bottom,0px)]"
      style={{ boxSizing: 'border-box', overflow: 'visible' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md"
      />

      <div className="relative z-10 flex min-h-[3.5rem] w-full items-stretch justify-around overflow-visible">
        {leftItems.map(renderTab)}
        {/* Slot centrale: spazio per Emblema K + label «Kentu AI» (KentuChatFab). */}
        <div className="relative flex flex-1 items-center justify-center overflow-visible" aria-hidden />
        {rightItems.slice(0, 2).map(renderTab)}
      </div>
    </nav>
  );
}
