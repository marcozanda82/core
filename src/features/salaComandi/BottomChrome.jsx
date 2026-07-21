import React from 'react';
import { TrendingUp } from 'lucide-react';

/**
 * Bottom Navigation "Arc Reactor": 4 tab + Kentu centrale sollevato.
 * La chat si apre dal bottone centrale (niente barra "Chiedi a Kentu" né FAB +).
 */
export default function BottomChrome({
  kentuChatNotificationBadge,
  openChat,
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
      className="fixed bottom-0 left-0 right-0 z-40 flex h-16 w-full items-center justify-around border-t border-zinc-800 bg-zinc-950/95 px-2 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md"
      style={{ boxSizing: 'border-box', overflow: 'visible' }}
    >
      {leftItems.map(renderTab)}

      {/* Slot centrale — Arc Reactor / Kentu */}
      <div className="relative flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={() => openChat?.()}
          aria-label="Apri chat Kentu"
          className={[
            'absolute -top-7 flex h-14 w-14 items-center justify-center rounded-full',
            'bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-600',
            'shadow-[0_8px_28px_rgba(0,229,255,0.45)]',
            'ring-4 ring-zinc-950 transition-transform active:scale-95',
          ].join(' ')}
        >
          {kentuChatNotificationBadge ? (
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.7)]"
            />
          ) : null}
          <img
            src="/nuova%20icon_fixed_192.png"
            alt=""
            width={30}
            height={30}
            decoding="async"
            className="h-8 w-8 object-contain"
          />
        </button>
      </div>

      {rightItems.slice(0, 2).map(renderTab)}
    </nav>
  );
}
