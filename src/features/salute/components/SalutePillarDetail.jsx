import { lazy, Suspense, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import CardioAnalysisCard from '../../trendHub/components/CardioAnalysisCard';
import { formatFastingHoursLabel } from '../../trendHub/utils/saluteDashboardMetrics';
import { MUSCLE_STIMULUS_DAILY_DECAY_FACTOR } from '../../trendHub/utils/muscleSpillover';
import SaluteSleepDetail from './SaluteSleepDetail';
import { SALUTE_FROST, saluteTheme } from '../utils/saluteVisualTheme';

const MuscleTelemetryHub = lazy(() => import('../../trendHub/components/MuscleTelemetryHub'));

function formatPts(score, max) {
  if (!Number.isFinite(Number(score))) return `— / ${max}`;
  return `${Math.round(Number(score))} / ${max}`;
}

function formatDateIt(iso) {
  const key = String(iso || '').slice(0, 10);
  const parts = key.split('-');
  if (parts.length !== 3) return key || '—';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

const markdownComponents = {
  img: () => null,
  h1: ({ children }) => <h3 className="mb-2 mt-0 text-sm font-semibold text-slate-50">{children}</h3>,
  h2: ({ children }) => <h4 className="mb-1.5 mt-3 text-[13px] font-semibold text-slate-100">{children}</h4>,
  h3: ({ children }) => <h5 className="mb-1 mt-2 text-[12px] font-medium text-cyan-200/90">{children}</h5>,
  p: ({ children }) => <p className="mb-2 mt-0 text-[13px] leading-relaxed text-slate-300">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 mt-1 list-disc space-y-1 pl-4 text-[13px] text-slate-300">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 mt-1 list-decimal space-y-1 pl-4 text-[13px] text-slate-300">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-slate-100">{children}</strong>,
};

function districtTriageClass(triage) {
  const raw = String(triage || '').toUpperCase();
  if (raw === 'STIMOLO OTTIMALE') return 'text-emerald-200';
  if (raw === 'STIMOLO PARZIALE') return 'text-slate-300';
  if (raw === 'DA STIMOLARE') return 'text-amber-200';
  return 'text-slate-400';
}

function Expandable({ title, children, defaultOpen = false, accentClass = 'border-white/10' }) {
  return (
    <details
      open={defaultOpen || undefined}
      className={`rounded-2xl ${SALUTE_FROST.nested} ${accentClass}`}
    >
      <summary className="cursor-pointer list-none px-4 py-3.5 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400 marker:content-none [&::-webkit-details-marker]:hidden">
        {title}
      </summary>
      <div className="space-y-3 border-t border-white/[0.06] px-4 py-3.5">
        {children}
      </div>
    </details>
  );
}

function CardioDetail({ pillar, glycemic, fastingTrend, fastingData, fullHistory, activeLog, todayDate }) {
  const theme = saluteTheme('cardio');
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5">
        <Kpi label="Punteggio" value={formatPts(pillar.score, pillar.max)} accentClass={theme.kpiBorder} valueClass={theme.value} />
        <Kpi label="Minuti" value={`${pillar.minutes}`} hint={`target ${pillar.targetMinutes}`} accentClass={theme.kpiBorder} />
        <Kpi label="Finestra" value={`${pillar.windowDays} giorni`} accentClass={theme.kpiBorder} />
        <Kpi
          label="Trend"
          value={pillar.trendAvailable ? 'Disponibile' : 'Non disponibile'}
          accentClass={theme.kpiBorder}
        />
      </div>
      {Number.isFinite(Number(pillar.days)) ? (
        <p className="m-0 text-[13px] leading-relaxed text-slate-400">
          Giorni con cardio nella finestra: {pillar.days}
        </p>
      ) : null}

      <Expandable title="Analisi cardio" accentClass={theme.kpiBorder}>
        <p className="m-0 text-[12px] leading-relaxed text-slate-400">
          Indicatore di volume e zone. Non è un secondo punteggio Salute.
        </p>
        <CardioAnalysisCard
          fullHistory={fullHistory}
          activeLog={activeLog}
          activeDate={todayDate}
          todayBurnKcal={0}
        />
      </Expandable>

      <Expandable title="Digiuno e rischio glicemico" accentClass={theme.kpiBorder}>
        <p className="m-0 text-[12px] leading-relaxed text-slate-400">
          Analisi contestuale. Non sostituisce il Longevity Score.
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <Kpi
            label="Ore digiuno ora"
            value={formatFastingHoursLabel(glycemic?.hoursFasted ?? fastingData?.hoursFasted)}
          />
          <Kpi
            label="Media 14 giorni"
            value={formatFastingHoursLabel(fastingTrend?.averageHours)}
          />
        </div>
        {Number.isFinite(Number(glycemic?.percent)) ? (
          <p className="m-0 text-[12px] text-slate-400">
            Rischio glicemico (analisi): {Math.round(Number(glycemic.percent))}%
          </p>
        ) : (
          <p className="m-0 text-[13px] text-slate-400">Rischio glicemico non disponibile.</p>
        )}
        {glycemic?.breakdown?.lines ? (
          <ul className="m-0 list-disc space-y-1 pl-4 text-[12px] leading-relaxed text-slate-400">
            <li>{glycemic.breakdown.lines.sensitivity}</li>
            <li>{glycemic.breakdown.lines.acute}</li>
            <li>{glycemic.breakdown.lines.structural}</li>
          </ul>
        ) : null}
      </Expandable>
    </div>
  );
}

function StrengthDetail({ pillar, showTelemetry, onToggleTelemetry, fourCylinder, fullHistory, activeLog, todayDate }) {
  const theme = saluteTheme('strength');
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5">
        <Kpi label="Punteggio" value={formatPts(pillar.score, pillar.max)} accentClass={theme.kpiBorder} valueClass={theme.value} />
        <Kpi label="Distretti" value={`${pillar.covered} / ${pillar.targetDistricts}`} accentClass={theme.kpiBorder} />
        <Kpi
          label="Sessioni"
          value={Number.isFinite(Number(pillar.sessions)) ? String(pillar.sessions) : '—'}
          accentClass={theme.kpiBorder}
        />
        <Kpi label="Decay" value={`−${Math.round(MUSCLE_STIMULUS_DAILY_DECAY_FACTOR * 100)}%/g`} accentClass={theme.kpiBorder} />
      </div>
      {pillar.districts.length > 0 ? (
        <ul className="m-0 space-y-2 p-0">
          {pillar.districts.map((row) => (
            <li
              key={row.id}
              className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 ${SALUTE_FROST.nested}`}
            >
              <span className="text-[14px] font-medium text-slate-50">{row.label}</span>
              <span className="shrink-0 text-right">
                <span className="text-[15px] font-semibold tabular-nums text-slate-50">
                  {Math.round(Number(row.total) || 0)}%
                </span>
                <span className={`ml-1.5 text-[10px] font-medium uppercase tracking-[0.08em] ${districtTriageClass(row.triage)}`}>
                  {row.triage || 'n/d'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-slate-400">Stimolo distretti non disponibile.</p>
      )}
      <p className="m-0 text-[12px] leading-relaxed text-slate-400">
        Lo spillover è quello già calcolato dal motore. Qui non viene ricalcolato.
      </p>
      <button
        type="button"
        onClick={onToggleTelemetry}
        className="flex min-h-12 w-full items-center justify-center rounded-2xl border border-violet-400/35 bg-violet-500/10 px-4 text-[13px] font-medium text-violet-100 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm"
      >
        {showTelemetry ? 'Nascondi telemetria muscolare' : 'Apri telemetria muscolare'}
      </button>
      {showTelemetry ? (
        <Suspense fallback={<p className="m-0 text-[13px] text-slate-400">Caricamento telemetria…</p>}>
          <MuscleTelemetryHub
            fourCylinder={fourCylinder}
            fullHistory={fullHistory}
            activeLog={activeLog}
            activeDate={todayDate}
            onBack={onToggleTelemetry}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function NutritionDetail({ pillar, reportRead, healthReportStatus, recentNutritionScores }) {
  const theme = saluteTheme('nutrition');
  const history = Array.isArray(reportRead?.history) ? reportRead.history : [];
  const markdown = String(reportRead?.bulletinMarkdown || '').trim();
  const vote = reportRead?.reportVote;
  const fallbackNote = pillar.clinicalNote;
  const hasReportDeep = Boolean(
    markdown
    || vote != null
    || fallbackNote
    || history.length > 0
    || (Array.isArray(recentNutritionScores) && recentNutritionScores.length > 0)
    || healthReportStatus === 'empty'
    || (reportRead && !reportRead.hydrated),
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5">
        <Kpi label="Score Salute" value={formatPts(pillar.score, pillar.max)} accentClass={theme.kpiBorder} valueClass={theme.value} />
        <Kpi label="Fonte" value={pillar.sourceLabel || 'Non disponibile'} accentClass={theme.kpiBorder} />
        <Kpi label="Proteine" value={pillar.proteinLabel || 'Non disponibile'} accentClass={theme.kpiBorder} />
        <Kpi label="Digiuno" value={pillar.fastingLabel || 'Non disponibile'} accentClass={theme.kpiBorder} />
      </div>

      {hasReportDeep ? (
        <Expandable title="Approfondisci referto" accentClass={theme.kpiBorder}>
          {vote != null ? (
            <p className="m-0 text-[13px] text-slate-300">
              Valutazione del referto AI
              {' '}
              <span className="tabular-nums text-slate-50">{vote} / 100</span>
            </p>
          ) : null}
          {fallbackNote ? (
            <p className="m-0 text-[13px] leading-relaxed text-slate-300">{fallbackNote}</p>
          ) : null}
          {reportRead && !reportRead.hydrated ? (
            <p className="m-0 text-[13px] text-slate-400">Caricamento referto…</p>
          ) : markdown ? (
            <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
          ) : healthReportStatus === 'empty' ? (
            <p className="m-0 text-[13px] text-slate-400">
              Nessun diario ieri — il bollettino comparirà dopo il primo giorno completo.
            </p>
          ) : !markdown ? (
            <p className="m-0 text-[13px] text-slate-400">Referto AI non disponibile.</p>
          ) : null}
          {history.length > 0 ? (
            <section>
                <p className="mb-2 mt-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  Storico referti
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
          {Array.isArray(recentNutritionScores) && recentNutritionScores.length > 0 ? (
            <p className="m-0 text-[12px] text-slate-400">
              Serie usata dal pilastro: {recentNutritionScores.map((n) => Math.round(Number(n) || 0)).join(' · ')}
            </p>
          ) : null}
        </Expandable>
      ) : null}
    </div>
  );
}

function Kpi({ label, value, hint, accentClass = 'border-white/[0.08]', valueClass = 'text-slate-50' }) {
  return (
    <div className={`rounded-2xl px-3.5 py-3 ${SALUTE_FROST.nested} ${accentClass}`}>
      <p className="m-0 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className={`m-0 mt-1.5 text-[17px] font-semibold leading-tight tabular-nums ${valueClass}`}>{value}</p>
      {hint ? <p className="m-0 mt-1 text-[11px] text-slate-400">{hint}</p> : null}
    </div>
  );
}

export default function SalutePillarDetail({
  pillarId,
  viewModel,
  glycemic,
  fastingTrend,
  fastingData,
  fullHistory,
  activeLog,
  todayDate,
  fourCylinder,
  sleepTrend,
  sleepLog,
  sleepReference,
  reportRead,
  healthReportStatus,
  recentNutritionScores,
}) {
  const [showTelemetry, setShowTelemetry] = useState(false);
  const pillar = useMemo(() => {
    if (pillarId === 'cardio') return viewModel.pillars.cardio;
    if (pillarId === 'strength') return viewModel.pillars.strength;
    if (pillarId === 'sleep') return viewModel.pillars.sleep;
    if (pillarId === 'nutrition') return viewModel.pillars.nutrition;
    return null;
  }, [pillarId, viewModel]);

  if (!pillar) return null;

  const theme = saluteTheme(pillarId);

  return (
    <section
      className={`rounded-[22px] border p-4 sm:p-5 ${SALUTE_FROST.card} ${theme.sheetBorder}`}
      aria-label={`Dettaglio ${pillar.label}`}
    >
      <h2 className={`m-0 text-[12px] font-medium uppercase tracking-[0.14em] ${theme.label}`}>
        {pillarId === 'sleep' ? '🌙 Sonno & Recupero' : pillar.label}
      </h2>
      {pillarId === 'cardio' ? (
        <div className="mt-4">
          <CardioDetail
            pillar={pillar}
            glycemic={glycemic}
            fastingTrend={fastingTrend}
            fastingData={fastingData}
            fullHistory={fullHistory}
            activeLog={activeLog}
            todayDate={todayDate}
          />
        </div>
      ) : null}
      {pillarId === 'strength' ? (
        <div className="mt-4">
          <StrengthDetail
            pillar={pillar}
            showTelemetry={showTelemetry}
            onToggleTelemetry={() => setShowTelemetry((v) => !v)}
            fourCylinder={fourCylinder}
            fullHistory={fullHistory}
            activeLog={activeLog}
            todayDate={todayDate}
          />
        </div>
      ) : null}
      {pillarId === 'sleep' ? (
        <div className="mt-4">
          <SaluteSleepDetail
            pillar={pillar}
            sleepTrend={sleepTrend}
            sleepLog={sleepLog}
            sleepReference={sleepReference}
          />
        </div>
      ) : null}
      {pillarId === 'nutrition' ? (
        <div className="mt-4">
          <NutritionDetail
            pillar={pillar}
            reportRead={reportRead}
            healthReportStatus={healthReportStatus}
            recentNutritionScores={recentNutritionScores}
          />
        </div>
      ) : null}
    </section>
  );
}
