import React, { useId, useMemo, useState } from 'react';

function toneFromScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 75) return 'good';
  if (n >= 50) return 'mid';
  return 'low';
}

const TONE_STROKE = {
  good: '#34d399',
  mid: '#fbbf24',
  low: '#f87171',
  neutral: '#22d3ee',
};

const EMPTY_BREAKDOWN = Object.freeze({
  cardioScore: 0,
  weightsScore: 0,
  sleepScore: 0,
  whtrMultiplier: 1,
  cardioMins: 0,
  uniqueGroups: 0,
  sleepAvg: null,
});

/**
 * Livello 1 — Hero: Punteggio Longevità (radial / donut) + pagella metabolica a scomparsa.
 */
export default function SaluteLongevityHero({
  score = null,
  breakdown = null,
  size = 200,
} = {}) {
  const [showDetails, setShowDetails] = useState(false);
  const uid = useId().replace(/:/g, '');
  const gradId = `longevity-grad-${uid}`;
  const value = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Math.round(Number(score)))) : null;
  const pct = value ?? 0;
  const tone = toneFromScore(value);
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const center = size / 2;
  const strokeColor = TONE_STROKE[tone] || TONE_STROKE.neutral;

  const b = breakdown && typeof breakdown === 'object' ? breakdown : EMPTY_BREAKDOWN;
  const cardioScore = Number(b.cardioScore) || 0;
  const weightsScore = Number(b.weightsScore) || 0;
  const sleepScore = Number(b.sleepScore) || 0;
  const whtrMultiplier = Number.isFinite(Number(b.whtrMultiplier)) ? Number(b.whtrMultiplier) : 1;
  const cardioMins = Math.round(Number(b.cardioMins) || 0);
  const uniqueGroups = Math.max(0, Math.min(5, Math.round(Number(b.uniqueGroups) || 0)));
  const sleepAvg = Number.isFinite(Number(b.sleepAvg)) && Number(b.sleepAvg) > 0
    ? Number(b.sleepAvg)
    : null;
  const criticalThreshold = Number.isFinite(Number(b.criticalThreshold))
    ? Number(b.criticalThreshold)
    : null;
  const userHeight = Number.isFinite(Number(b.userHeight)) ? Number(b.userHeight) : null;

  const aria = useMemo(
    () => (value == null
      ? 'Punteggio Longevità non disponibile'
      : `Punteggio Longevità ${value} su 100. Tocca per ${showDetails ? 'nascondere' : 'mostrare'} il dettaglio.`),
    [value, showDetails],
  );

  return (
    <section
      className="flex w-full flex-col items-center justify-center px-2 py-3"
      aria-label={aria}
    >
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="relative cursor-pointer rounded-full border-0 bg-transparent p-0 transition-transform duration-200 ease-out hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/60 active:scale-[1.02]"
        style={{ width: size, height: size }}
        aria-expanded={showDetails}
        aria-controls={`longevity-pagella-${uid}`}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block" aria-hidden>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="1" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.85" />
            </linearGradient>
          </defs>
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={stroke}
          />
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${Math.max(0, c - dash)}`}
            transform={`rotate(-90 ${center} ${center})`}
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-slate-400">
            Longevità
          </span>
          <span className="mt-1 text-5xl font-black tabular-nums leading-none text-slate-50">
            {value != null ? value : '—'}
          </span>
          <span className="mt-1 text-xs font-semibold text-slate-500">/ 100</span>
        </div>
      </button>

      <p className="mt-2 max-w-[18rem] text-center text-[10px] uppercase tracking-wider text-slate-500">
        {showDetails ? 'Tocca per chiudere' : 'Tocca per la pagella · Media 14gg'}
      </p>

      <div
        id={`longevity-pagella-${uid}`}
        className={`w-full max-w-sm overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
          showDetails
            ? 'mt-3 max-h-56 opacity-100'
            : 'mt-0 max-h-0 opacity-0'
        }`}
        aria-hidden={!showDetails}
      >
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Pagella metabolica
          </p>
          <ul className="space-y-1.5 text-[12px] leading-snug text-slate-200">
            <li className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 shrink text-slate-300">🏃‍♂️ Cardio</span>
              <span className="tabular-nums text-right text-slate-100">
                {cardioScore.toFixed(1)} / 33.3 pt
                <span className="ml-1 text-slate-500">({cardioMins} min)</span>
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 shrink text-slate-300">🏋️ Pesi</span>
              <span className="tabular-nums text-right text-slate-100">
                {weightsScore.toFixed(1)} / 33.3 pt
                <span className="ml-1 text-slate-500">({uniqueGroups}/5 gruppi)</span>
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 shrink text-slate-300">🛌 Sonno</span>
              <span className="tabular-nums text-right text-slate-100">
                {sleepScore.toFixed(1)} / 33.3 pt
                <span className="ml-1 text-slate-500">
                  ({sleepAvg != null ? `${sleepAvg.toFixed(1)} h` : 'n/d'})
                </span>
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-2 border-t border-white/5 pt-1.5">
              <span className="min-w-0 shrink text-slate-300">⚖️ Filtro Strutturale</span>
              <span className="tabular-nums text-right font-semibold text-cyan-300/90">
                {whtrMultiplier}x
                {criticalThreshold != null && (
                  <span className="ml-1 font-normal text-slate-500">
                    (soglia {criticalThreshold.toFixed(0)} cm
                    {userHeight != null ? ` · h ${userHeight.toFixed(0)}` : ''})
                  </span>
                )}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
