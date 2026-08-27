/**
 * Pulsante flottante Emblema Kentu — apre la chat (slot centrale bottom nav).
 */

export default function KentuChatFab({
  visible = false,
  engineReady = true,
  onOpen = null,
  onBlockedOpen = null,
  showNotificationBadge = false,
}) {
  if (!visible) return null;

  const handleClick = () => {
    if (!engineReady) {
      onBlockedOpen?.();
      return;
    }
    onOpen?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!engineReady}
      className={[
        'fixed left-1/2 z-[100010] flex -translate-x-1/2 flex-col items-center justify-end gap-0.5',
        'bottom-[calc(0.2rem+env(safe-area-inset-bottom,0px))] top-auto',
        'overflow-visible border-none bg-transparent p-0 shadow-none focus:outline-none',
        'transition-transform duration-300 ease-in-out',
        engineReady ? 'active:scale-95' : 'pointer-events-auto cursor-wait opacity-80',
      ].join(' ')}
      aria-label={engineReady ? 'Kentu AI' : 'Kentu AI — allineamento in corso'}
      aria-busy={!engineReady}
      aria-disabled={!engineReady}
      aria-pressed={false}
    >
      <div
        aria-hidden
        className={[
          'lunar-breathe pointer-events-none absolute -inset-5 z-0 rounded-full bg-white/30 blur-2xl',
          !engineReady ? 'animate-pulse' : '',
        ].join(' ')}
      />
      <span className="relative z-[1] flex h-[58px] w-[58px] items-center justify-center">
        {!engineReady ? (
          <span
            aria-hidden
            className="absolute inset-0 z-[2] m-auto h-5 w-5 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-300"
          />
        ) : null}
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
          className={[
            'relative z-[1] h-full w-full object-contain drop-shadow-[0_0_15px_rgba(0,150,255,0.8)]',
            !engineReady ? 'opacity-75' : '',
          ].join(' ')}
        />
      </span>
      <span
        className={[
          'relative z-[1] pb-1 text-[10px] font-semibold leading-none tracking-tight',
          engineReady
            ? 'text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.65)]'
            : 'text-zinc-400',
        ].join(' ')}
      >
        Kentu AI
      </span>
    </button>
  );
}
