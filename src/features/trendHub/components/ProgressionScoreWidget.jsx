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
  neutral: '#a78bfa',
};

const EMPTY_BREAKDOWN = Object.freeze({
  nutritionScore: 0,
  trainingScore: 0,
  sleepScore: 0,
  nutritionTolerancePct: 0,
  nutritionDaysScored: 0,
  workoutSessions: 0,
  workoutTarget: 8,
  sleepAvg: null,
  sleepTarget: 7.5,
});

/**
 * Hero Punteggio Progressione — simmetrico a SaluteLongevityHero + pagella a scomparsa.
 * `compact`: anello ridotto per slide gemella Home (niente pagella).
 */
export default function ProgressionScoreWidget({
  score = null,
  breakdown = null,
  size = 200,
  compact = false,
  onClick = null,
} = {}) {
  const [showDetails, setShowDetails] = useState(false);
  const uid = useId().replace(/:/g, '');
  const gradId = `progression-grad-${uid}`;
  const ringSize = compact ? Math.min(Number(size) || 96, 110) : (Number(size) || 200);
  const value = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Math.round(Number(score)))) : null;
  const pct = value ?? 0;
  const tone = toneFromScore(value);
  const stroke = compact ? 8 : 14;
  const r = (ringSize - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const center = ringSize / 2;
  const strokeColor = TONE_STROKE[tone] || TONE_STROKE.neutral;

  const b = breakdown && typeof breakdown === 'object' ? breakdown : EMPTY_BREAKDOWN;
  const nutritionScore = Number(b.nutritionScore) || 0;
  const trainingScore = Number(b.trainingScore) || 0;
  const sleepScore = Number(b.sleepScore) || 0;
  const nutritionTolerancePct = Number.isFinite(Number(b.nutritionTolerancePct))
    ? Number(b.nutritionTolerancePct)
    : 0;
  const workoutSessions = Math.max(0, Math.round(Number(b.workoutSessions) || 0));
  const workoutTarget = Math.max(1, Math.round(Number(b.workoutTarget) || 8));
  const sleepAvg = Number.isFinite(Number(b.sleepAvg)) && Number(b.sleepAvg) > 0
    ? Number(b.sleepAvg)
    : null;
  const sleepTarget = Number.isFinite(Number(b.sleepTarget)) && Number(b.sleepTarget) > 0
    ? Number(b.sleepTarget)
    : 7.5;

  const aria = useMemo(
    () => (value == null
      ? 'Punteggio Progressione non disponibile'
      : compact
        ? `Punteggio Progressione ${value} su 100`
        : `Punteggio Progressione ${value} su 100. Tocca per ${showDetails ? 'nascondere' : 'mostrare'} il dettaglio.`),
    [value, showDetails, compact],
  );

  const ring = (
    <div
      className="relative"
      style={{ width: ringSize, height: ringSize }}
    >
      <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} className="block" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="1" />
            <stop offset="100%" stopColor="#c084fc" stopOpacity="0.85" />
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
        <span className={`font-bold uppercase tracking-[0.14em] text-slate-400 ${compact ? 'text-[0.5rem]' : 'text-[0.65rem]'}`}>
          Progressione
        </span>
        <span className={`mt-0.5 font-black tabular-nums leading-none text-slate-50 ${compact ? 'text-2xl' : 'mt-1 text-5xl'}`}>
          {value != null ? value : '—'}
        </span>
        {!compact ? (
          <span className="mt-1 text-xs font-semibold text-slate-500">/ 100</span>
        ) : null}
      </div>
    </div>
  );

  if (compact) {
    const clickable = typeof onClick === 'function';
    const Wrapper = clickable ? 'button' : 'section';
    const wrapperProps = clickable
      ? {
          type: 'button',
          onClick,
          className: 'flex w-full max-w-full cursor-pointer flex-col items-center justify-center border-0 bg-transparent px-1 py-1 transition-transform active:scale-[0.98]',
        }
      : {
          className: 'flex w-full max-w-full flex-col items-center justify-center px-1 py-1',
        };
    return (
      <Wrapper {...wrapperProps} aria-label={aria}>
        {ring}
      </Wrapper>
    );
  }

  return (
    <section
      className="flex w-full flex-col items-center justify-center px-2 py-3"
      aria-label={aria}
    >
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="relative cursor-pointer rounded-full border-0 bg-transparent p-0 transition-transform duration-200 ease-out hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400/60 active:scale-[1.02]"
        style={{ width: ringSize, height: ringSize }}
        aria-expanded={showDetails}
        aria-controls={`progression-pagella-${uid}`}
      >
        {ring}
      </button>

      <p className="mt-2 max-w-[18rem] text-center text-[10px] uppercase tracking-wider text-slate-500">
        {showDetails ? 'Tocca per chiudere' : 'Tocca per il breakdown · Aderenza 14gg'}
      </p>

      <div
        id={`progression-pagella-${uid}`}
        className={`w-full max-w-sm overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
          showDetails
            ? 'mt-3 max-h-56 opacity-100'
            : 'mt-0 max-h-0 opacity-0'
        }`}
        aria-hidden={!showDetails}
      >
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Pagella aderenza
          </p>
          <ul className="space-y-1.5 text-[12px] leading-snug text-slate-200">
            <li className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 shrink text-slate-300">🍏 Nutrizione</span>
              <span className="tabular-nums text-right text-slate-100">
                {nutritionScore.toFixed(1)} / 33.3 pt
                <span className="ml-1 text-slate-500">
                  (tolleranza media {nutritionTolerancePct.toFixed(0)}%)
                </span>
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 shrink text-slate-300">🏋️ Allenamento</span>
              <span className="tabular-nums text-right text-slate-100">
                {trainingScore.toFixed(1)} / 33.3 pt
                <span className="ml-1 text-slate-500">
                  ({workoutSessions} / {workoutTarget} completate)
                </span>
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 shrink text-slate-300">🛌 Recupero</span>
              <span className="tabular-nums text-right text-slate-100">
                {sleepScore.toFixed(1)} / 33.3 pt
                <span className="ml-1 text-slate-500">
                  (Media {sleepAvg != null ? `${sleepAvg.toFixed(1)}h` : 'n/d'} / Target {sleepTarget.toFixed(1)}h)
                </span>
              </span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
