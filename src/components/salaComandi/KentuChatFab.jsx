/**
 * Pulsante flottante Emblema Kentu — apre la chat (slot centrale bottom nav).
 */

export default function KentuChatFab({
  visible = false,
  onOpen = null,
  showNotificationBadge = false,
}) {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => onOpen?.()}
      className={[
        'fixed left-1/2 z-[100010] flex -translate-x-1/2 flex-col items-center justify-end gap-0.5',
        'bottom-[calc(0.2rem+env(safe-area-inset-bottom,0px))] top-auto',
        'overflow-visible border-none bg-transparent p-0 shadow-none focus:outline-none',
        'transition-transform duration-300 ease-in-out active:scale-95',
      ].join(' ')}
      aria-label="Kentu AI"
      aria-pressed={false}
    >
      <div
        aria-hidden
        className="lunar-breathe pointer-events-none absolute -inset-5 z-0 rounded-full bg-white/30 blur-2xl"
      />
      <span className="relative z-[1] flex h-[58px] w-[58px] items-center justify-center">
        {showNotificationBadge ? (
          <span
            aria-hidden
            className="absolute right-0.5 top-0.5 z-10 h-2.5 w-2.5 rounded-full bg-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.85)]"
          />
        ) : null}
        <img
          src="/EmblemaKbianca.png"
          alt=""
          width={58}
          height={58}
          decoding="async"
          className="relative z-[1] h-full w-full object-contain drop-shadow-[0_0_15px_rgba(0,150,255,0.8)]"
        />
      </span>
      <span
        className={[
          'relative z-[1] pb-1 text-[10px] font-semibold leading-none tracking-tight',
          'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.65)]',
        ].join(' ')}
      >
        Kentu AI
      </span>
    </button>
  );
}
