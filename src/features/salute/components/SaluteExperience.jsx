import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { METABOLIC_FOCUS_LABEL } from '../../chat/metabolicFocus';
import { useSaluteExperienceData } from '../hooks/useSaluteExperienceData';
import {
  formatSleepClock,
  formatSleepHoursShort,
} from '../utils/sleepReference';
import {
  pillarSemaphoreFromScore,
  SALUTE_FROST,
  SALUTE_INSIGHT_THEME,
  SALUTE_PILLAR_THEME,
  SALUTE_SEMAPHORE,
  saluteTheme,
  sleepSemaphoreFromDelta,
} from '../utils/saluteVisualTheme';
import SaluteDetailSheet from './SaluteDetailSheet';

const SalutePillarDetail = lazy(() => import('./SalutePillarDetail'));
const SaluteAdvancedPanel = lazy(() => import('./SaluteAdvancedPanel'));
const SaluteFocusMetabolicoCard = lazy(() =>
  import('./SaluteFocusMetabolico').then((mod) => ({ default: mod.SaluteFocusMetabolicoCard })),
);
const SaluteFocusMetabolicoBody = lazy(() =>
  import('./SaluteFocusMetabolico').then((mod) => ({ default: mod.SaluteFocusMetabolicoBody })),
);

const PILLAR_ORDER = ['cardio', 'strength', 'sleep', 'nutrition'];

function formatPts(score, max) {
  if (!Number.isFinite(Number(score))) return `— / ${max}`;
  return `${Math.round(Number(score))} / ${max}`;
}

function insightTheme(kind) {
  return SALUTE_INSIGHT_THEME[kind] || SALUTE_INSIGHT_THEME.action;
}

function detailTitle(activeDetail, viewModel) {
  if (activeDetail === 'focus') return METABOLIC_FOCUS_LABEL;
  if (activeDetail === 'sleep') return 'Sonno & Recupero';
  return viewModel?.pillars?.[activeDetail]?.label || SALUTE_PILLAR_THEME[activeDetail]?.title || '';
}

function sleepPreview(pillar, sleepTrend, sleepReference) {
  const avg = Number.isFinite(Number(sleepTrend?.avg14Days))
    ? Number(sleepTrend.avg14Days)
    : Number.isFinite(Number(pillar?.averageHours))
      ? Number(pillar.averageHours)
      : null;
  const ref = Number(sleepReference?.effectiveHours);
  const delta = avg != null && Number.isFinite(ref) ? avg - ref : null;
  return {
    avg,
    ref: Number.isFinite(ref) ? ref : null,
    semaphore: sleepSemaphoreFromDelta(delta),
  };
}

function FrostSheen() {
  return <span className={SALUTE_FROST.sheen} aria-hidden />;
}

function IconBadge({ icon, wrapClass }) {
  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[13px] ${wrapClass}`}
      aria-hidden
    >
      {icon}
    </span>
  );
}

function SemaphoreBadge({ semaphore }) {
  if (!semaphore) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${semaphore.wrap} ${semaphore.text}`}>
      <span aria-hidden>{semaphore.emoji}</span>
      {semaphore.label}
    </span>
  );
}

export default function SaluteExperience({ embedded = false, host = null } = {}) {
  const navigate = useNavigate();
  const [activeDetail, setActiveDetail] = useState(null);
  const [allowP1, setAllowP1] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAllowP1(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const data = useSaluteExperienceData({
    host,
    loadReports: allowP1,
    loadSleepLog: activeDetail === 'sleep',
    loadSheetMetrics: Boolean(activeDetail),
  });
  const shellClass = embedded
    ? 'relative flex h-full min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-[#0A0E14] text-slate-50'
    : 'relative min-h-[100dvh] bg-[#0A0E14] text-slate-50';
  const innerPad = embedded
    ? 'mx-auto w-full max-w-3xl px-4 pb-6 pt-5 sm:px-8 sm:pt-8'
    : 'mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:px-8 sm:pt-8';

  if (data.loading) {
    return (
      <div
        className={embedded
          ? 'flex h-full min-h-0 flex-1 items-center justify-center bg-[#0A0E14] px-6'
          : 'flex min-h-[100dvh] flex-col bg-[#0A0E14] px-4 pt-4'}
        aria-busy
        aria-label="Caricamento Salute"
      >
        {embedded ? null : (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex min-h-11 w-fit items-center rounded-full px-1 text-[13px] font-medium text-slate-300 hover:text-cyan-200"
          >
            ← Home
          </button>
        )}
        <div className={embedded ? undefined : 'flex flex-1 items-center justify-center px-6'}>
          <p className="m-0 text-[12px] font-medium uppercase tracking-[0.18em] text-cyan-200/70">
            Allineamento…
          </p>
        </div>
      </div>
    );
  }

  const { viewModel } = data;
  const score = viewModel.score.hasScore ? viewModel.score.finalScore : null;
  const sheetOpen = Boolean(activeDetail);
  const sheetTheme = saluteTheme(activeDetail || 'cardio');
  const metabolicAccent = viewModel.metabolic.hasWaist
    ? (viewModel.metabolic.isCutting
      ? {
        label: 'text-amber-300/90',
        icon: '📉',
        iconWrap: 'border-amber-400/30 bg-amber-500/12',
        semaphore: SALUTE_SEMAPHORE.warn,
      }
      : {
        label: 'text-emerald-300/85',
        icon: '⚖️',
        iconWrap: 'border-emerald-400/30 bg-emerald-500/12',
        semaphore: SALUTE_SEMAPHORE.ok,
      })
    : {
      label: 'text-slate-300',
      icon: '⚖️',
      iconWrap: 'border-white/15 bg-white/[0.05]',
      semaphore: null,
    };

  return (
    <main className={shellClass}>
      <span className={SALUTE_FROST.page} aria-hidden />
      <div className={`relative ${innerPad}`}>
        {embedded ? null : (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex min-h-11 items-center rounded-full px-1 text-[13px] font-medium text-slate-300 hover:text-cyan-200"
            >
              ← Home
            </button>
          </div>
        )}
        <header className="relative mb-7 text-center">
          <p className="m-0 text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-200/70">
            Salute
          </p>
          <div className="relative mx-auto mt-3 inline-flex items-center justify-center">
            <span
              className="pointer-events-none absolute inset-[-10%] rounded-full opacity-50 blur-xl"
              style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.14) 0%, transparent 70%)' }}
              aria-hidden
            />
            <p className="relative m-0 font-mono text-[72px] font-semibold leading-none tabular-nums tracking-tight text-cyan-50 sm:text-[88px]">
              {score == null ? '—' : score}
            </p>
          </div>
          <p className="m-0 mt-3 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300">
            Longevità
          </p>
        </header>

        <section className="mb-5 grid grid-cols-2 gap-3 sm:gap-3.5" aria-label="Quattro pilastri">
          {PILLAR_ORDER.map((id) => {
            const pillar = viewModel.pillars[id];
            const theme = saluteTheme(id);
            const selected = activeDetail === id;
            const sleep = id === 'sleep'
              ? sleepPreview(pillar, data.sleepTrend, data.sleepReference)
              : null;
            const semaphore = sleep
              ? sleep.semaphore
              : pillarSemaphoreFromScore(pillar.score);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveDetail(id)}
                className={`min-h-[7.5rem] rounded-[22px] border px-4 py-3.5 text-left transition ${SALUTE_FROST.card} ${
                  selected ? theme.cardSelected : theme.card
                }`}
                aria-haspopup="dialog"
                aria-expanded={selected}
                aria-label={`${theme.title}. ${formatPts(pillar.score, pillar.max)}. ${semaphore.label}. Apri approfondimento`}
              >
                <FrostSheen />
                <div className="flex items-center gap-2">
                  <IconBadge icon={theme.icon} wrapClass={theme.iconWrap} />
                  <p className={`m-0 min-w-0 text-[10px] font-medium uppercase tracking-[0.14em] ${theme.label}`}>
                    {theme.title}
                  </p>
                </div>
                <p className={`relative m-0 mt-2.5 font-mono text-[32px] font-semibold leading-none tabular-nums tracking-tight sm:text-[34px] ${theme.value}`}>
                  {formatPts(pillar.score, pillar.max)}
                </p>
                {sleep ? (
                  <div className="relative mt-2 space-y-1">
                    <p className="m-0 text-[11px] leading-snug text-slate-300">
                      {sleep.avg != null ? `${formatSleepHoursShort(sleep.avg)} media 14g` : 'Notti non registrate'}
                    </p>
                    {sleep.ref != null ? (
                      <p className="m-0 text-[11px] leading-snug text-violet-200/80">
                        Riferimento {formatSleepClock(sleep.ref)}
                      </p>
                    ) : null}
                    <SemaphoreBadge semaphore={semaphore} />
                  </div>
                ) : (
                  <div className="relative mt-2 space-y-1.5">
                    <p className="m-0 text-[12px] leading-snug text-slate-400">
                      {pillar.context}
                    </p>
                    <SemaphoreBadge semaphore={semaphore} />
                  </div>
                )}
              </button>
            );
          })}
        </section>

        <section
          className={`relative mb-5 overflow-hidden rounded-[22px] border border-white/[0.10] px-4 py-4 sm:px-5 ${SALUTE_FROST.card}`}
          aria-label="Stato metabolico"
        >
          <FrostSheen />
          <div className="relative flex items-center gap-2">
            <IconBadge icon={metabolicAccent.icon} wrapClass={metabolicAccent.iconWrap} />
            <p className={`m-0 text-[10px] font-medium uppercase tracking-[0.14em] ${metabolicAccent.label}`}>
              {viewModel.metabolic.title}
            </p>
            {metabolicAccent.semaphore ? (
              <span className="ml-auto">
                <SemaphoreBadge semaphore={metabolicAccent.semaphore} />
              </span>
            ) : null}
          </div>
          <p className="relative m-0 mt-1.5 text-[15px] leading-relaxed text-slate-50">
            {viewModel.metabolic.body}
          </p>
          {viewModel.metabolic.hasWaist ? (
            <p className="relative m-0 mt-2 text-[12px] leading-relaxed text-slate-400">
              Vita {Number(viewModel.metabolic.waistCm).toFixed(1)} cm
              {viewModel.metabolic.heightCm != null ? ` · altezza ${Math.round(viewModel.metabolic.heightCm)} cm` : ''}
              {viewModel.metabolic.thresholdCm != null ? ` · soglia ${Number(viewModel.metabolic.thresholdCm).toFixed(1)} cm` : ''}
            </p>
          ) : null}
        </section>

        <section className={`relative mb-5 overflow-hidden rounded-[22px] border border-white/[0.10] px-4 py-4 sm:px-5 ${SALUTE_FROST.card}`} aria-label="Cosa sta succedendo">
          <FrostSheen />
          {viewModel.analysis.length === 0 ? (
            <p className="m-0 text-[14px] text-slate-400">
              Analisi non disponibile.
            </p>
          ) : (
            <ul className="relative m-0 space-y-3.5 p-0">
              {viewModel.analysis.map((item) => {
                const tone = insightTheme(item.kind);
                return (
                  <li key={`${item.kind}-${item.id}`} className="flex gap-3">
                    <span className={`mt-1.5 h-7 w-0.5 shrink-0 rounded-full ${tone.bar}`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className={`m-0 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] ${tone.label}`}>
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${tone.iconWrap}`} aria-hidden>
                          {tone.icon}
                        </span>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
                        {item.label}
                      </p>
                      <p className="m-0 mt-1 text-[15px] leading-relaxed text-slate-50">
                        {item.text}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {allowP1 ? (
          <Suspense fallback={null}>
            <SaluteFocusMetabolicoCard
              report={data.reportRead?.latestReport}
              hydrated={data.reportRead?.hydrated}
              open={activeDetail === 'focus'}
              onOpen={() => setActiveDetail('focus')}
            />
          </Suspense>
        ) : null}

        <SaluteDetailSheet
          open={sheetOpen}
          title={detailTitle(activeDetail, viewModel)}
          icon={sheetTheme.icon}
          accentClass={sheetTheme.sheetBorder}
          iconWrapClass={sheetTheme.iconWrap}
          onClose={() => setActiveDetail(null)}
        >
          <Suspense fallback={<p className="m-0 text-[13px] text-slate-400">Apertura…</p>}>
            {activeDetail === 'focus' ? (
              <SaluteFocusMetabolicoBody
                report={data.reportRead?.latestReport}
                analysisDate={data.reportRead?.latestDate}
                todayDate={data.todayDate}
                hydrated={data.reportRead?.hydrated}
                history={data.reportRead?.history || []}
                nutritionPillar={viewModel.pillars.nutrition}
                recentNutritionScores={data.recentNutritionScores}
              />
            ) : null}
            {activeDetail && activeDetail !== 'focus' ? (
              <SalutePillarDetail
                pillarId={activeDetail}
                viewModel={viewModel}
                glycemic={data.glycemic}
                fastingTrend={data.fastingTrend}
                fastingData={data.fastingData}
                fullHistory={data.fullHistory}
                activeLog={data.activeLog}
                todayDate={data.todayDate}
                fourCylinder={data.fourCylinder}
                sleepTrend={data.sleepTrend}
                sleepLog={data.sleepLog}
                sleepReference={data.sleepReference}
                reportRead={data.reportRead}
                healthReportStatus={data.healthReportStatus}
                recentNutritionScores={data.recentNutritionScores}
              />
            ) : null}
          </Suspense>
        </SaluteDetailSheet>

        {allowP1 ? (
          <Suspense fallback={null}>
            <SaluteAdvancedPanel
              biometrics={data.biometrics}
              metabolic={viewModel.metabolic}
              fourCylinder={data.fourCylinder}
              fullHistory={data.fullHistory}
              activeLog={data.activeLog}
              todayDate={data.todayDate}
              longevityResult={data.longevityResult}
              isDev={data.isDev}
            />
          </Suspense>
        ) : null}
      </div>
    </main>
  );
}
