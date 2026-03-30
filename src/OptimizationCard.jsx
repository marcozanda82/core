import React, { useMemo } from 'react';
import { calculateOptimizationIndex, optimizationCoachMessage } from './optimizationIndex';

/**
 * @param {{ kcalConsumed?: number, proteinConsumed?: number, sleepHours?: number }} dailyData
 * @param {{ kcal?: number, prot?: number }} targets
 */
export default function OptimizationCard({ dailyData, targets, style: wrapStyle }) {
  const { score, limitingFactor } = useMemo(
    () => calculateOptimizationIndex(dailyData || {}, targets || {}),
    [dailyData, targets]
  );
  const coachText = optimizationCoachMessage(limitingFactor);
  const headlineColor = score > 90 ? '#00e5ff' : score >= 75 ? '#fb923c' : '#ef4444';

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 560,
        margin: '0 auto',
        padding: '16px 14px',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'linear-gradient(165deg, #14161c 0%, #0d0f12 100%)',
        boxSizing: 'border-box',
        ...wrapStyle,
      }}
    >
      <div
        style={{
          fontSize: 'clamp(1.05rem, 3.5vw, 1.35rem)',
          fontWeight: 800,
          letterSpacing: '0.02em',
          color: headlineColor,
          textAlign: 'center',
          marginBottom: 14,
          textShadow: score > 90 ? '0 0 24px rgba(0,229,255,0.25)' : 'none',
        }}
      >
        Indice di Ottimizzazione: {score}%
      </div>
      <div
        style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          padding: '12px 14px',
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}
      >
        <span style={{ fontSize: '1.35rem', lineHeight: 1, flexShrink: 0 }} aria-hidden>
          🧑‍🏫
        </span>
        <p
          style={{
            margin: 0,
            fontSize: '0.88rem',
            lineHeight: 1.55,
            color: 'rgba(226,232,240,0.92)',
            fontStyle: 'italic',
          }}
        >
          {coachText}
        </p>
      </div>
    </div>
  );
}
