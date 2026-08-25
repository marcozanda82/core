/**
 * Pulsante flottante Emblema Kentu — apre la chat.
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
        'fixed left-1/2 z-[100010] flex h-[72px] w-[72px] -translate-x-1/2 items-center justify-center',
        'bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] top-auto',
        'overflow-visible border-none bg-transparent p-0 shadow-none focus:outline-none',
        'transition-transform duration-300 ease-in-out active:scale-95',
      ].join(' ')}
      aria-label="Apri chat Kentu"
      aria-pressed={false}
    >
      <div
        aria-hidden
        className="lunar-breathe pointer-events-none absolute -inset-5 z-0 rounded-full bg-white/30 blur-2xl"
      />
      {showNotificationBadge ? (
        <span
          aria-hidden
          className="absolute right-1 top-1 z-10 h-2.5 w-2.5 rounded-full bg-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.85)]"
        />
      ) : null}
      <img
        src="/EmblemaKbianca.png"
        alt="Kentu"
        width={72}
        height={72}
        decoding="async"
        className="relative z-[1] h-full w-full object-contain drop-shadow-[0_0_15px_rgba(0,150,255,0.8)]"
      />
    </button>
  );
}
