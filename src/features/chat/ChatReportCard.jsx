import React, { useCallback, useMemo, useState } from 'react';
import { Share2 } from 'lucide-react';
import { REPORT_COVER_SRC } from '../commandTerminal/conversation/reportCommandIntent';
import { shareOrDownloadKentuReportPdf } from './downloadKentuReportPdf';
import PhantomDailyReport, {
  PHANTOM_REPORT_ROOT_ID,
} from './PhantomDailyReport.jsx';

/**
 * Card essenziale bollettino in chat + template fantasma PDF off-screen (dati reali).
 *
 * @param {{
 *   markdown?: string,
 *   title?: string,
 *   coverSrc?: string,
 *   ready?: boolean,
 *   reportData?: object|null,
 *   dailyLog?: object[],
 *   userTargets?: object|null,
 *   healthScore?: object|number|null,
 *   userDisplayName?: string,
 * }} props
 */
export default function ChatReportCard({
  markdown = '',
  title = 'Bollettino Kentu',
  coverSrc = REPORT_COVER_SRC,
  ready = true,
  reportData = null,
  dailyLog = [],
  userTargets = null,
  healthScore = null,
  userDisplayName = '',
} = {}) {
  const body = String(markdown || '').trim();
  const [isSharing, setIsSharing] = useState(false);

  const reportLabel = useMemo(() => {
    if (title && title !== 'Bollettino Kentu') {
      return String(title).replace(/^[^A-Za-z0-9]+/, '').toUpperCase() || 'DAILY REPORT';
    }
    return 'DAILY REPORT';
  }, [title]);

  /** Snapshot messaggio: usato solo se non c’è diario live (priorità giornata corrente). */
  const snapshotOverride = useMemo(() => {
    if (Array.isArray(dailyLog) && dailyLog.length > 0) return null;
    if (!reportData || typeof reportData !== 'object') return null;
    if (Array.isArray(reportData.meals) || reportData.calories || reportData.totals) {
      return reportData;
    }
    return null;
  }, [dailyLog, reportData]);

  const handleShare = useCallback(async () => {
    if (!ready || isSharing) return;
    setIsSharing(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await shareOrDownloadKentuReportPdf({
        title: title || 'Kentu Daily Report',
        filename: `KentuOS_DailyReport_${today}.pdf`,
        elementId: PHANTOM_REPORT_ROOT_ID,
      });
    } catch (error) {
      console.error('Errore condivisione PDF:', error);
      if (typeof window !== 'undefined') {
        window.alert('Impossibile condividere il PDF. Riprova.');
      }
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, ready, title]);

  if (!ready || !body) return null;

  return (
    <>
      <PhantomDailyReport
        data={snapshotOverride}
        dailyLog={dailyLog}
        userTargets={userTargets}
        healthScore={healthScore}
        userDisplayName={userDisplayName}
        insight={body.slice(0, 480)}
        reportLabel={reportLabel}
      />
      <article className="relative w-full max-w-[min(92%,28rem)] overflow-hidden rounded-2xl border border-cyan-500/25 bg-slate-950/80 shadow-lg shadow-black/30 transition-opacity duration-500 ease-out">
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
    </>
  );
}
