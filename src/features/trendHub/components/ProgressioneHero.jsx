import React, { useId, useMemo } from 'react';
import {
  progressionStatusLabel,
  progressionToneFromScore,
} from '../utils/progressionInsightGenerator';

const TONE_STROKE = {
  good: '#34d399',
  mid: '#fbbf24',
  low: '#f87171',
  neutral: '#a78bfa',
};

/**
 * L1 — Hero anello Progressione + micro-label stato.
 */
export default function ProgressioneHero({
  score = null,
  microLabel = null,
  size = 148,
  compact = false,
  onClick = null,
} = {}) {
  const uid = useId().replace(/:/g, '');
  const gradId = `progression-hero-${uid}`;
  const ringSize = compact ? Math.min(Number(size) || 96, 110) : (Number(size) || 148);
  const value = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Math.round(Number(score)))) : null;
  const pct = value ?? 0;
  const tone = progressionToneFromScore(value);
  const stroke = compact ? 8 : 12;
  const r = (ringSize - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const center = ringSize / 2;
  const strokeColor = TONE_STROKE[tone] || TONE_STROKE.neutral;
  const statusLabel = progressionStatusLabel(value);
  const label = microLabel || (value != null ? `${statusLabel.toUpperCase()} • TARGET ATTIVO` : 'IN CALIBRAZIONE');

  const aria = useMemo(
    () => (value == null
      ? 'Punteggio Progressione non disponibile'
      : `Punteggio Progressione ${value} su 100 · ${statusLabel}`),
    [value, statusLabel],
  );

  const ring = (
    <div className="relative" style={{ width: ringSize, height: ringSize }}>
      <div
        className="pointer-events-none absolute inset-[-10%] rounded-full opacity-70 blur-2xl"
        style={{ background: `radial-gradient(circle, ${strokeColor}33 0%, transparent 68%)` }}
        aria-hidden
      />
      <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} className="relative block" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="1" />
            <stop offset="100%" stopColor="#c084fc" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <circle cx={center} cy={center} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
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
          Progressione
        </span>
        <span className={`mt-0.5 font-black tabular-nums leading-none text-slate-50 ${compact ? 'text-2xl' : 'text-4xl'}`}>
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
      : { className: 'flex w-full max-w-full flex-col items-center justify-center px-1 py-1' };
    return (
      <Wrapper {...wrapperProps} aria-label={aria}>
        {ring}
      </Wrapper>
    );
  }

  return (
    <section className="flex w-full flex-col items-center justify-center px-1 py-1" aria-label={aria}>
      {ring}
      <p className="mt-1.5 max-w-[20rem] text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-200/80">
        {label}
      </p>
    </section>
  );
}
