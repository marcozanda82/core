/**
 * Shell fullscreen chat Kentu (slide dal basso).
 * I children tipicamente includono KentuChatUI lazy.
 */

export default function KentuChatShell({
  mounted = false,
  open = false,
  children = null,
}) {
  if (!mounted) return null;

  return (
    <div
      className={[
        'fixed inset-0 z-[100001] flex h-[100dvh] max-h-[100dvh] w-full flex-col bg-zinc-950',
        'transform transition-transform duration-300 ease-in-out will-change-transform',
        open ? 'translate-y-0' : 'translate-y-full pointer-events-none',
      ].join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label="Chat Kentu"
      aria-hidden={!open}
    >
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden h-full"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
