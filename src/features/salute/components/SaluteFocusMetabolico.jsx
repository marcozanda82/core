import { useState } from 'react';
import { METABOLIC_FOCUS_LABEL } from '../../chat/metabolicFocus';
import SaluteClinicalInsight from '../../trendHub/components/SaluteClinicalInsight';
import { SALUTE_FROST } from '../utils/saluteVisualTheme';

const COVER_SRC = '/analisi_macro.png';

function clipLine(value, max = 92) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 40 ? cut.slice(0, sp) : cut).trim()}…`;
}

function formatDateIt(iso) {
  const key = String(iso || '').slice(0, 10);
  const parts = key.split('-');
  if (parts.length !== 3) return key || '—';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function previewLines(report) {
  if (!report || typeof report !== 'object') return [];
  return [
    { id: 'inflammation', label: 'Stato infiammatorio', text: clipLine(report.inflammationSummary) },
    { id: 'timing', label: 'Equilibrio glicemico', text: clipLine(report.timingFeedback) },
    { id: 'sleep', label: 'Sonno e recupero', text: clipLine(report.sleepCorrelationInsight) },
  ].filter((row) => row.text);
}

export function SaluteFocusMetabolicoCard({
  report = null,
  hydrated = false,
  open = false,
  onOpen = null,
} = {}) {
  const lines = previewLines(report);

  return (
    <button
      type="button"
      onClick={() => onOpen?.()}
      className={`mb-5 flex w-full flex-col rounded-[22px] border border-white/12 text-left transition hover:border-fuchsia-400/45 ${SALUTE_FROST.card}`}
      aria-label={`${METABOLIC_FOCUS_LABEL}. Apri analisi`}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <img
        src={COVER_SRC}
        alt=""
        className="h-20 w-full object-cover sm:h-24"
        loading="lazy"
      />
      <span
        className={SALUTE_FROST.sheen}
        aria-hidden
      />
      <div className="px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-fuchsia-400/35 bg-fuchsia-500/15 text-[13px]"
            aria-hidden
          >
            🔬
          </span>
          <p className="m-0 text-[10px] font-medium uppercase tracking-[0.14em] text-fuchsia-300">
            {METABOLIC_FOCUS_LABEL}
          </p>
        </div>
        <p className="m-0 mt-1.5 text-[15px] leading-relaxed text-slate-50">
          L&apos;analisi AI della tua situazione di oggi
        </p>
        {!hydrated ? (
          <p className="m-0 mt-3 text-[13px] text-slate-400">Caricamento analisi…</p>
        ) : lines.length > 0 ? (
          <ul className="mt-3 space-y-2.5">
            {lines.map((row) => (
              <li key={row.id}>
                <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  {row.label}
                </p>
                <p className="m-0 mt-0.5 text-[14px] leading-snug text-slate-200">{row.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 mt-3 text-[13px] text-slate-400">
            Analisi non ancora disponibile.
          </p>
        )}
        <p className="m-0 mt-4 text-[13px] font-medium text-fuchsia-300">
          Apri analisi →
        </p>
      </div>
    </button>
  );
}

export function SaluteFocusMetabolicoBody({
  report = null,
  analysisDate = '',
  todayDate = '',
  hydrated = false,
  history = [],
  nutritionPillar = null,
  recentNutritionScores = [],
} = {}) {
  const [showData, setShowData] = useState(false);
  const vote = Number.isFinite(Number(report?.dailyScore))
    ? Math.round(Number(report.dailyScore))
    : null;
  const insightStatus = !hydrated
    ? 'loading'
    : (report ? 'ready' : 'empty');

  return (
    <div className="space-y-5">
      <p className="m-0 text-[12px] font-medium uppercase tracking-[0.14em] text-fuchsia-300/85">
        Analisi metabolica del mattino
      </p>

      <SaluteClinicalInsight
        embedded
        report={report}
        analysisDate={analysisDate}
        todayDate={todayDate}
        status={insightStatus}
      />

      <div className={`rounded-2xl ${SALUTE_FROST.nested}`}>
        <button
          type="button"
          onClick={() => setShowData((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between px-4 text-left"
          aria-expanded={showData}
          aria-controls="salute-focus-analisi-dati"
        >
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
            Vedi dati dell&apos;analisi
          </span>
          <span className="text-[13px] text-slate-400">{showData ? 'Nascondi' : 'Mostra'}</span>
        </button>
        {showData ? (
          <div
            id="salute-focus-analisi-dati"
            className="space-y-3 border-t border-white/[0.06] px-4 pb-4 pt-3.5"
          >
            {vote != null ? (
              <p className="m-0 text-[14px] text-slate-200">
                Valutazione del referto AI
                {' '}
                <span className="tabular-nums text-slate-50">{vote} / 100</span>
              </p>
            ) : (
              <p className="m-0 text-[13px] text-slate-400">
                Valutazione del referto AI non disponibile.
              </p>
            )}
            {nutritionPillar?.sourceLabel ? (
              <p className="m-0 text-[13px] text-slate-400">
                Fonte del pilastro Nutrizione: {nutritionPillar.sourceLabel}
              </p>
            ) : null}
            {Array.isArray(recentNutritionScores) && recentNutritionScores.length > 0 ? (
              <p className="m-0 text-[13px] text-slate-400">
                Serie usata dal pilastro:
                {' '}
                {recentNutritionScores.map((n) => Math.round(Number(n) || 0)).join(' · ')}
              </p>
            ) : null}
            {history.length > 0 ? (
              <section>
                <p className="mb-2 mt-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  Storico referti · valutazione del referto AI
                </p>
                <ul className="m-0 space-y-1.5 p-0">
                  {history.map((row) => (
                    <li
                      key={row.date}
                      className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-[13px] ${SALUTE_FROST.micro}`}
                    >
                      <span className="text-slate-200">{formatDateIt(row.date)}</span>
                      <span className="tabular-nums text-slate-400">
                        {row.reportVote != null ? `${row.reportVote} / 100` : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
