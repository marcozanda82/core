import React from 'react';
import { TrendingUp } from 'lucide-react';

/**
 * Bottom Navigation "Arc Reactor": 4 tab + slot centrale (Emblema flottante gestito da SalaComandi).
 */
export default function BottomChrome({
  BOTTOM_NAV_ITEMS,
  handleBottomNavTabSelect,
  activeBottomTab,
}) {
  const leftItems = (BOTTOM_NAV_ITEMS || []).filter((t) => t.id === 'oggi' || t.id === 'analisi');
  const rightItems = (BOTTOM_NAV_ITEMS || []).filter(
    (t) => t.id === 'bussola' || t.id === 'pianifica' || t.id === 'menu',
  );

  const renderTab = (t) => {
    const isActive = activeBottomTab === t.id;
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => handleBottomNavTabSelect(t.id)}
        aria-current={isActive ? 'page' : undefined}
        className="flex min-w-0 flex-1 flex-col items-center justify-center bg-transparent p-1"
      >
        <span
          className={[
            'flex flex-col items-center gap-0.5 text-[0.65rem] transition-all duration-300',
            isActive
              ? 'translate-y-[-2px] scale-110 text-cyan-400 opacity-100 drop-shadow-[0_0_8px_rgba(0,229,255,0.45)]'
              : 'text-zinc-500 opacity-70',
          ].join(' ')}
        >
          <span className="inline-flex h-6 items-center justify-center text-[1.2rem] leading-none" aria-hidden>
            {t.id === 'bussola' ? <TrendingUp size={20} strokeWidth={2.2} /> : t.icon}
          </span>
          <span>{t.label}</span>
        </span>
      </button>
    );
  };

  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed bottom-0 left-0 right-0 z-40 h-16 w-full overflow-visible px-2 pb-[env(safe-area-inset-bottom,0px)]"
      style={{ boxSizing: 'border-box', overflow: 'visible' }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md"
      />

      <div className="relative z-10 flex h-full w-full items-center justify-around overflow-visible">
        {leftItems.map(renderTab)}
        {/* Slot centrale: spazio per Emblema flottante (fuori dalla nav) */}
        <div className="relative flex flex-1 items-center justify-center overflow-visible" aria-hidden />
        {rightItems.slice(0, 2).map(renderTab)}
      </div>
    </nav>
  );
}
