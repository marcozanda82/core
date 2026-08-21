import React, { useCallback, useState } from 'react';
import { Share2 } from 'lucide-react';
import { REPORT_COVER_SRC } from '../commandTerminal/conversation/reportCommandIntent';
import { shareOrDownloadKentuReportPdf } from './downloadKentuReportPdf';

/**
 * Card essenziale bollettino in chat: copertina + titolo + Condividi.
 * Il Markdown completo resta solo nel PDF condiviso (non in chat).
 *
 * @param {{ markdown?: string, title?: string, coverSrc?: string, ready?: boolean }} props
 */
export default function ChatReportCard({
  markdown = '',
  title = 'Bollettino Kentu',
  coverSrc = REPORT_COVER_SRC,
  ready = true,
} = {}) {
  const body = String(markdown || '').trim();
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = useCallback(async () => {
    if (!body || isSharing) return;
    setIsSharing(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await shareOrDownloadKentuReportPdf({
        title,
        markdown: body,
        coverSrc,
        filename: `KentuOS_Bollettino_${today}.pdf`,
      });
    } catch (error) {
      console.error('Errore condivisione PDF:', error);
      if (typeof window !== 'undefined') {
        window.alert('Impossibile condividere il PDF. Riprova.');
      }
    } finally {
      setIsSharing(false);
    }
  }, [body, coverSrc, isSharing, title]);

  if (!ready || !body) return null;

  return (
    <article className="w-full max-w-[min(92%,28rem)] overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950/80 shadow-lg shadow-black/30 transition-opacity duration-500 ease-out">
      <img
        src={coverSrc}
        alt="Copertina report"
        className="mb-2 h-32 w-full rounded-t-lg object-cover"
        loading="lazy"
      />
      <div className="space-y-3 px-3.5 pb-3.5 pt-1">
        <h2 className="m-0 text-sm font-semibold leading-snug text-slate-50">
          📊 Bollettino Pronto per la Condivisione
        </h2>
        <button
          type="button"
          onClick={() => {
            void handleShare();
          }}
          disabled={isSharing}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/15 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-cyan-100 transition-colors hover:border-cyan-300/60 hover:bg-cyan-500/25 disabled:cursor-wait disabled:opacity-60"
        >
          <Share2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {isSharing ? 'Preparazione…' : '📤 Condividi'}
        </button>
      </div>
    </article>
  );
}
