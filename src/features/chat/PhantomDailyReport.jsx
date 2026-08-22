import React, { useMemo } from 'react';
import {
  buildPhantomDailyReportData,
  createEmptyPhantomDailyReportData,
  formatItalianDateLabel,
} from './buildPhantomDailyReportData.js';

export const PHANTOM_REPORT_ROOT_ID = 'kentu-phantom-report';

function clampPct(value, target) {
  const v = Number(value) || 0;
  const t = Number(target) || 0;
  if (t <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((v / t) * 100)));
}

function formatNum(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return Math.round(x).toLocaleString('it-IT');
}

function ScoreRing({ score = 0, max = 100 }) {
  const pct = clampPct(score, max);
  const size = 148;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;

  return (
    <div className="relative flex h-[148px] w-[148px] items-center justify-center">
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#1e293b"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#22d3ee"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Daily Score
        </span>
        <span className="mt-0.5 text-4xl font-bold tabular-nums text-white">
          {formatNum(score)}
          <span className="text-lg font-medium text-slate-500">/{formatNum(max)}</span>
        </span>
      </div>
    </div>
  );
}

function MiniStatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2.5 shadow-sm shadow-black/20">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold tabular-nums text-slate-50">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function MacroBar({ label, value, target, unit = 'g', barClass }) {
  const pct = clampPct(value, target);
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-slate-300">
          {formatNum(value)}{unit}
          <span className="text-slate-600"> / {formatNum(target)}{unit}</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Template fantasma A4 — Dark Mode Telemetria per html2pdf.
 * Montato off-screen; catturato via #kentu-phantom-report.
 *
 * Preferire props `dailyLog` / `userTargets` / `healthScore` (dati reali).
 * `data` resta un override opzionale (es. snapshot salvato nel messaggio).
 *
 * @param {{
 *   data?: object|null,
 *   dailyLog?: object[],
 *   userTargets?: object|null,
 *   healthScore?: object|number|null,
 *   userDisplayName?: string,
 *   insight?: string,
 *   reportLabel?: string,
 *   visibleForDebug?: boolean,
 * }} props
 */
export default function PhantomDailyReport({
  data = null,
  dailyLog = null,
  userTargets = null,
  healthScore = null,
  userDisplayName = '',
  insight = '',
  reportLabel = 'DAILY REPORT',
  visibleForDebug = false,
} = {}) {
  const d = useMemo(() => {
    const hasLiveInputs = (
      Array.isArray(dailyLog)
      || userTargets
      || healthScore != null
      || Boolean(userDisplayName)
      || Boolean(insight)
    );

    // Priorità: diario/target/score live della giornata; `data` solo come override/snapshot.
    if (hasLiveInputs) {
      return buildPhantomDailyReportData({
        dailyLog: Array.isArray(dailyLog) ? dailyLog : [],
        userTargets,
        healthScore,
        userDisplayName,
        insight,
        reportLabel,
        date: new Date(),
        overrides: data && typeof data === 'object' ? data : null,
      });
    }

    if (data && typeof data === 'object') {
      return {
        ...createEmptyPhantomDailyReportData({ reportLabel }),
        ...data,
        dateLabel: data.dateLabel
          ? String(data.dateLabel)
          : formatItalianDateLabel(new Date()),
      };
    }

    return createEmptyPhantomDailyReportData({ reportLabel });
  }, [
    data,
    dailyLog,
    userTargets,
    healthScore,
    userDisplayName,
    insight,
    reportLabel,
  ]);

  const meals = Array.isArray(d.meals) ? d.meals : [];
  const totals = d.totals || { kcal: 0, prot: 0, carb: 0, fat: 0 };

  // Off-screen senza opacity:0 / display:none (html2canvas li scarta).
  // Wrapper 0×0 + overflow clippa dalla vista; il figlio resta layoutato a 800×1130.
  const reportClass = [
    'w-[800px] h-[1130px] bg-slate-950 text-slate-100 p-8 font-sans box-border overflow-hidden',
    visibleForDebug ? 'relative' : '',
  ].filter(Boolean).join(' ');

  const report = (
    <div
      id={PHANTOM_REPORT_ROOT_ID}
      className={reportClass}
      aria-hidden={visibleForDebug ? undefined : true}
    >
      {/* Header */}
      <header className="mb-7 flex items-start justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-400/90">
            {d.brand || 'Kentu'}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            {d.reportLabel || 'DAILY REPORT'}
          </h1>
        </div>
        <div className="text-right">
          <div className="text-sm font-medium text-slate-200">{d.dateLabel}</div>
          <div className="mt-0.5 text-xs text-slate-500">{d.userName}</div>
        </div>
      </header>

      {/* Hero scores */}
      <section className="mb-7 grid grid-cols-[160px_1fr] items-center gap-5 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-5">
        <ScoreRing score={d.dailyScore} max={d.dailyScoreMax || 100} />
        <div className="grid grid-cols-2 gap-2.5">
          <MiniStatCard
            label="Calorie"
            value={`${formatNum(d.calories?.value)} / ${formatNum(d.calories?.target)}`}
            sub="kcal"
          />
          <MiniStatCard
            label="Proteine"
            value={`${formatNum(d.protein?.value)}g / ${formatNum(d.protein?.target)}g`}
          />
          <MiniStatCard
            label="Sonno"
            value={d.sleep?.label || '—'}
          />
          <MiniStatCard
            label="Recovery"
            value={`${formatNum(d.recovery?.value)}/${formatNum(d.recovery?.max || 100)}`}
          />
        </div>
      </section>

      {/* Diario alimentare */}
      <section className="mb-7">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          Diario Alimentare
        </h2>
        <div className="overflow-hidden rounded-xl border border-slate-800">
          <table className="table-auto w-full text-sm">
            <thead>
              <tr className="bg-slate-900 text-left text-[10px] uppercase tracking-[0.12em] text-slate-400">
                <th className="px-3 py-2.5 font-semibold">Ora</th>
                <th className="px-3 py-2.5 font-semibold">Pasto</th>
                <th className="px-3 py-2.5 font-semibold">Alimenti</th>
                <th className="px-3 py-2.5 text-right font-semibold">Kcal</th>
                <th className="px-3 py-2.5 text-right font-semibold">Prot</th>
                <th className="px-3 py-2.5 text-right font-semibold">Carb</th>
                <th className="px-3 py-2.5 text-right font-semibold">Grassi</th>
              </tr>
            </thead>
            <tbody>
              {meals.length === 0 ? (
                <tr className="border-b border-slate-800">
                  <td className="px-3 py-4 text-slate-500" colSpan={7}>
                    Nessun alimento registrato oggi
                  </td>
                </tr>
              ) : (
                meals.map((row, idx) => (
                  <tr key={`${row.time}-${row.meal}-${idx}`} className="border-b border-slate-800">
                    <td className="px-3 py-2.5 tabular-nums text-slate-400">{row.time}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-200">{row.meal}</td>
                    <td className="px-3 py-2.5 text-slate-400">{row.foods}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">
                      {formatNum(row.kcal)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                      {formatNum(row.prot)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                      {formatNum(row.carb)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">
                      {formatNum(row.fat)}
                    </td>
                  </tr>
                ))
              )}
              <tr className="bg-slate-900/90">
                <td className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-cyan-400" colSpan={3}>
                  Totali
                </td>
                <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-white">
                  {formatNum(totals.kcal)}
                </td>
                <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-white">
                  {formatNum(totals.prot)}
                </td>
                <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-white">
                  {formatNum(totals.carb)}
                </td>
                <td className="px-3 py-3 text-right text-sm font-bold tabular-nums text-white">
                  {formatNum(totals.fat)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Bottom split */}
      <section className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Nutrition
          </h3>
          <MacroBar
            label="Proteine"
            value={d.protein?.value}
            target={d.protein?.target}
            barClass="bg-blue-500"
          />
          <MacroBar
            label="Carboidrati"
            value={d.carbs?.value}
            target={d.carbs?.target}
            barClass="bg-cyan-400"
          />
          <MacroBar
            label="Grassi"
            value={d.fat?.value}
            target={d.fat?.target}
            barClass="bg-amber-400"
          />
          <MacroBar
            label="Fibre"
            value={d.fiber?.value}
            target={d.fiber?.target}
            barClass="bg-emerald-500"
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Training
            </h3>
            <div className="text-lg font-semibold text-white">
              {d.training?.title || '—'}
            </div>
            <div className="mt-1 text-sm text-cyan-300/90">
              {d.training?.durationLabel || ''}
            </div>
            {d.training?.detail ? (
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {d.training.detail}
              </p>
            ) : null}
          </div>

          <div className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              Sleep & Insight
            </h3>
            <p className="text-sm leading-relaxed text-slate-300">
              {d.insight || '—'}
            </p>
          </div>
        </div>
      </section>

      <footer className="mt-8 border-t border-slate-800 pt-3 text-center text-[10px] uppercase tracking-[0.18em] text-slate-600">
        KentuOS · Telemetria Giornaliera · Confidenziale
      </footer>
    </div>
  );

  if (visibleForDebug) {
    return report;
  }

  return (
    <div
      className="absolute top-0 left-0 w-0 h-0 overflow-hidden z-[-1] pointer-events-none"
      aria-hidden
    >
      {report}
    </div>
  );
}
