import { Compass, X } from 'lucide-react';
import { DAILY_PROTOCOL_STATUS } from './dailyProtocols';
import { useDailyProtocol } from './dailyProtocolStore';

const STATUS_LABEL = {
  [DAILY_PROTOCOL_STATUS.PLANNING]: 'In pianificazione',
  [DAILY_PROTOCOL_STATUS.ACTIVE]: 'In corso',
  [DAILY_PROTOCOL_STATUS.COMPLETED]: 'Completato',
};

/**
 * Banner Home: apre il Kentu AI Workspace per impostare il protocollo in chat.
 */
export default function DailyProtocolHomeBanner({
  onOpenChat = null,
} = {}) {
  const {
    activeDailyProtocol,
    protocolStatus,
    protocolDef,
    isProtocolBannerDismissed,
    dismissProtocolBanner,
  } = useDailyProtocol();

  if (isProtocolBannerDismissed) return null;

  const hasProtocol = Boolean(activeDailyProtocol && protocolDef);
  const statusLabel = hasProtocol
    ? (STATUS_LABEL[protocolStatus] || STATUS_LABEL[DAILY_PROTOCOL_STATUS.PLANNING])
    : 'Apri →';

  return (
    <div
      className={[
        'home-oggi-rigid relative flex w-full shrink-0 items-center rounded-xl border px-3 py-1.5 text-left shadow-md backdrop-blur-sm',
        hasProtocol
          ? 'border-emerald-400/25 bg-gradient-to-r from-emerald-950/40 via-slate-900/35 to-cyan-950/25'
          : 'border-cyan-400/25 bg-gradient-to-r from-cyan-950/40 via-slate-900/35 to-violet-950/25',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dismissProtocolBanner?.();
        }}
        className="absolute right-1.5 top-1 z-10 rounded-md p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
        aria-label="Ignora protocollo di oggi"
        title="Ignora"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onOpenChat?.()}
        aria-label={hasProtocol
          ? `Apri Kentu AI: protocollo ${protocolDef.nome}`
          : 'Apri Kentu AI e imposta il focus di oggi'}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-0.5 pr-7 text-left transition-transform active:scale-[0.99]"
      >
        <span
          className={[
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-base',
            hasProtocol
              ? 'border-emerald-400/25 bg-emerald-500/10'
              : 'border-cyan-400/25 bg-cyan-500/10 text-cyan-200',
          ].join(' ')}
          aria-hidden
        >
          {hasProtocol ? protocolDef.icona : <Compass className="h-3.5 w-3.5" strokeWidth={2.2} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            {hasProtocol ? 'Protocollo di oggi' : 'Pianifica giornata'}
          </span>
          <span className="mt-0.5 block truncate text-[13px] font-semibold leading-snug text-zinc-50">
            {hasProtocol ? protocolDef.nome : 'Imposta il focus di oggi'}
          </span>
        </span>
        <span className={`shrink-0 text-[11px] font-medium ${hasProtocol ? 'text-emerald-300/80' : 'text-cyan-300/80'}`}>
          {statusLabel}
        </span>
      </button>
    </div>
  );
}
