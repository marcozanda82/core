import { Check } from 'lucide-react';
import { DAILY_PROTOCOL_STATUS, getDailyProtocolDef } from './dailyProtocols';
import { generateDraftsFromTimeline, setProtocolStatus } from './dailyProtocolStore';
import { PROTOCOL_TIMELINE_GENERATING_TEXT } from './generateDynamicTimeline';

export function ProtocolPlanLoader({
  label = PROTOCOL_TIMELINE_GENERATING_TEXT,
} = {}) {
  return (
    <div
      className="flex w-full items-start gap-3 rounded-2xl border border-cyan-400/20 bg-zinc-950/80 px-3.5 py-3"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="mt-1 flex h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)]" />
      <div className="min-w-0">
        <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
          Architetto metabolico
        </p>
        <p className="m-0 mt-1 text-[13px] font-medium leading-snug text-zinc-100">
          {label}
        </p>
      </div>
    </div>
  );
}

/**
 * Itinerario verticale del protocollo giornaliero (piano in planning).
 * @param {'full' | 'cta'} [variant]
 */
export default function ProtocolTimeline({
  protocolId = null,
  events = null,
  approved = false,
  onApprove = null,
  variant = 'full',
} = {}) {
  const def = getDailyProtocolDef(protocolId);
  const rows = Array.isArray(events) ? events.filter((row) => row && row.time && row.title) : [];

  const handleApprove = () => {
    if (approved || rows.length === 0) return;
    generateDraftsFromTimeline(protocolId, rows);
    setProtocolStatus(DAILY_PROTOCOL_STATUS.ACTIVE);
    onApprove?.(protocolId);
  };

  if (rows.length === 0 && variant !== 'cta') return null;
  if (rows.length === 0 && variant === 'cta' && !approved) return null;

  const approveButton = approved ? (
    <p className="m-0 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-center text-[12px] font-semibold text-emerald-200">
      Piano operativo
    </p>
  ) : (
    <button
      type="button"
      onClick={handleApprove}
      className={[
        'inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-400/40',
        'bg-emerald-500/90 py-2.5 text-[13px] font-bold text-emerald-50',
        'shadow-[0_8px_22px_rgba(16,185,129,0.28)] transition hover:bg-emerald-400',
        'active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50',
      ].join(' ')}
    >
      <Check className="h-4 w-4" strokeWidth={2.6} aria-hidden />
      Approva Piano
    </button>
  );

  if (variant === 'cta') {
    return (
      <div className="w-full shrink-0 px-1 pb-1 pt-1">
        {approveButton}
      </div>
    );
  }

  return (
    <section
      className="w-full rounded-2xl border border-cyan-400/20 bg-zinc-950/80 px-3.5 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-md"
      aria-label="Timeline del protocollo"
    >
      <header className="mb-3 flex items-center gap-2">
        <span className="text-lg leading-none" aria-hidden>{def?.icona || '🗓'}</span>
        <div className="min-w-0">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
            Piano della giornata
          </p>
          <p className="m-0 truncate text-[13px] font-semibold text-zinc-50">
            {def?.nome || 'Protocollo'}
          </p>
        </div>
      </header>

      <ol className="m-0 list-none p-0">
        {rows.map((row, index) => {
          const last = index === rows.length - 1;
          return (
            <li key={`${row.time}-${row.title}-${index}`} className="flex gap-3">
              <div className="flex w-12 shrink-0 flex-col items-end pt-0.5">
                <span className="font-mono text-[11px] font-semibold tabular-nums text-cyan-200">
                  {row.time}
                </span>
              </div>
              <div className="flex w-4 shrink-0 flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 rounded-full border border-cyan-300/80 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.65)]" />
                {last ? null : (
                  <span className="mt-1 min-h-[1.65rem] w-px flex-1 bg-gradient-to-b from-cyan-400/50 to-white/10" />
                )}
              </div>
              <div className={`min-w-0 flex-1 ${last ? 'pb-1' : 'pb-3.5'}`}>
                <p className="m-0 text-[13px] font-medium leading-snug text-zinc-100">
                  {row.icon ? <span className="mr-1" aria-hidden>{row.icon}</span> : null}
                  {row.title}
                </p>
                {row.focus ? (
                  <p className="m-0 mt-0.5 text-[11px] leading-snug text-zinc-400">
                    {row.focus}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-3">{approveButton}</div>
    </section>
  );
}
