import React from 'react';

export const PHANTOM_REPORT_ROOT_ID = 'kentu-phantom-report';

/** Mock premium per test rendering PDF (Dark Mode Telemetria). */
export const PHANTOM_DAILY_REPORT_MOCK = Object.freeze({
  brand: 'Kentu',
  reportLabel: 'DAILY REPORT',
  dateLabel: '21 Agosto 2026',
  userName: 'Marco',
  dailyScore: 82,
  dailyScoreMax: 100,
  calories: { value: 2180, target: 2250 },
  protein: { value: 154, target: 160, unit: 'g' },
  carbs: { value: 198, target: 220, unit: 'g' },
  fat: { value: 72, target: 70, unit: 'g' },
  fiber: { value: 28, target: 30, unit: 'g' },
  sleep: { label: '7h 32m', hours: 7.53 },
  recovery: { value: 79, max: 100 },
  meals: [
    {
      time: '07:40',
      meal: 'Colazione',
      foods: 'Yogurt greco, avena, mirtilli',
      kcal: 420,
      prot: 32,
      carb: 48,
      fat: 12,
    },
    {
      time: '13:15',
      meal: 'Pranzo',
      foods: 'Pollo, riso basmati, verdure',
      kcal: 680,
      prot: 52,
      carb: 62,
      fat: 18,
    },
    {
      time: '16:30',
      meal: 'Spuntino',
      foods: 'Whey + banana',
      kcal: 280,
      prot: 28,
      carb: 32,
      fat: 4,
    },
    {
      time: '20:10',
      meal: 'Cena',
      foods: 'Salmone, patate, insalata',
      kcal: 800,
      prot: 42,
      carb: 56,
      fat: 38,
    },
  ],
  totals: { kcal: 2180, prot: 154, carb: 198, fat: 72 },
  training: {
    title: 'Upper Body',
    durationLabel: '84 min',
    detail: 'Push · Volume moderato · RPE 7',
  },
  insight:
    'Giornata positiva: aderenza calorica e proteica solide, sonno nella fascia ottimale. Focus per domani: anticipare i carboidrati pre-allenamento e chiudere la finestra alimentare entro le 21:00.',
});

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
 * @param {{ data?: object, visibleForDebug?: boolean }} props
 */
export default function PhantomDailyReport({
  data = null,
  visibleForDebug = false,
} = {}) {
  const d = { ...PHANTOM_DAILY_REPORT_MOCK, ...(data && typeof data === 'object' ? data : {}) };
  const meals = Array.isArray(d.meals) ? d.meals : PHANTOM_DAILY_REPORT_MOCK.meals;
  const totals = d.totals || PHANTOM_DAILY_REPORT_MOCK.totals;

  const rootClass = [
    'w-[800px] min-h-[1130px] bg-slate-950 text-slate-100 p-8 font-sans',
    'box-border',
    visibleForDebug
      ? 'relative left-0 opacity-100'
      : 'fixed top-0 left-0 -z-[9999] opacity-0 pointer-events-none',
  ].join(' ');

  return (
    <div
      id={PHANTOM_REPORT_ROOT_ID}
      className={rootClass}
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
              {meals.map((row, idx) => (
                <tr key={`${row.time}-${idx}`} className="border-b border-slate-800">
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
              ))}
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
}
