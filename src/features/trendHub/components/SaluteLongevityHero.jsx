import React, { useId, useMemo } from 'react';
import {
  buildLongevityPagellaInsight,
  getLongevityFeedback,
  longevityStatusLabel,
  longevityToneFromScore,
  pillarPctFromLongevityScore,
} from '../utils/longevityInsightGenerator';

export { getLongevityFeedback, buildLongevityPagellaInsight };

const TONE_STROKE = {
  good: '#34d399',
  mid: '#fbbf24',
  low: '#f87171',
  neutral: '#22d3ee',
};

/**
 * Livello 1 — Hero: anello Longevità + stato metabolico.
 * `compact`: anello ridotto per slide gemella Home (niente status verbose).
 * La Pagella vive in `MetabolicReportCard` (Livello 2).
 */
export default function SaluteLongevityHero({
  score = null,
  size = 168,
  compact = false,
  onClick = null,
} = {}) {
  const uid = useId().replace(/:/g, '');
  const gradId = `longevity-grad-${uid}`;
  const ringSize = compact ? Math.min(Number(size) || 96, 110) : (Number(size) || 168);
  const value = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Math.round(Number(score)))) : null;
  const pct = value ?? 0;
  const tone = longevityToneFromScore(value);
  const stroke = compact ? 8 : 12;
  const r = (ringSize - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const center = ringSize / 2;
  const strokeColor = TONE_STROKE[tone] || TONE_STROKE.neutral;
  const statusLabel = longevityStatusLabel(value);

  const aria = useMemo(
    () => (value == null
      ? 'Punteggio Longevità non disponibile'
      : `Punteggio Longevità ${value} su 100 · ${statusLabel}`),
    [value, statusLabel],
  );

  const ring = (
    <div
      className="relative"
      style={{ width: ringSize, height: ringSize }}
    >
      <div
        className="pointer-events-none absolute inset-[-10%] rounded-full opacity-70 blur-2xl"
        style={{
          background: `radial-gradient(circle, ${strokeColor}33 0%, transparent 68%)`,
        }}
        aria-hidden
      />
      <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} className="relative block" aria-hidden>
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
        <span className={`font-bold uppercase tracking-[0.14em] text-slate-400 ${compact ? 'text-[0.5rem]' : 'text-[0.6rem]'}`}>
          Longevità
        </span>
        <span className={`mt-0.5 font-black tabular-nums leading-none text-slate-50 ${compact ? 'text-2xl' : 'mt-0.5 text-4xl'}`}>
          {value != null ? value : '—'}
        </span>
        {!compact ? (
          <span className="mt-0.5 text-[11px] font-semibold text-slate-500">/ 100</span>
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
      className="flex w-full flex-col items-center justify-center px-1 py-1"
      aria-label={aria}
    >
      {ring}
      <p className="mt-1.5 max-w-[18rem] text-center text-[10px] uppercase tracking-wider text-slate-400">
        {value != null ? (
          <>
            <span className="font-semibold text-slate-300">{statusLabel}</span>
            <span className="text-slate-600"> · </span>
            <span>Media 14gg</span>
          </>
        ) : (
          'In calibrazione'
        )}
      </p>
    </section>
  );
}

/** @deprecated Usare pillarPctFromLongevityScore */
export function pillarPct(score) {
  return pillarPctFromLongevityScore(score);
}
