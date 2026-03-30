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
  const scoreColor = score > 90 ? '#00e5ff' : score >= 75 ? '#fb923c' : '#ef4444';
  const isEpic = score > 90;

  const background = isEpic
    ? 'radial-gradient(ellipse 130% 90% at 50% -10%, rgba(0, 229, 255, 0.22) 0%, rgba(8, 18, 28, 0.92) 42%, #06080d 100%)'
    : 'linear-gradient(165deg, #171a22 0%, #0e1016 48%, #08090e 100%)';

  const containerShadow = isEpic
    ? '0 0 48px rgba(0, 229, 255, 0.28), 0 0 96px rgba(0, 229, 255, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.08)'
    : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)';

  const numberTextShadow = isEpic
    ? '0 0 32px rgba(0, 229, 255, 0.6), 0 0 64px rgba(0, 229, 255, 0.35), 0 0 96px rgba(0, 229, 255, 0.15)'
    : 'none';

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 560,
        margin: '0 auto',
        padding: '28px 20px 22px',
        borderRadius: 20,
        border: isEpic ? '1px solid rgba(0, 229, 255, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
        background,
        boxSizing: 'border-box',
        boxShadow: containerShadow,
        textAlign: 'center',
        ...wrapStyle,
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          fontWeight: 800,
          letterSpacing: '0.35em',
          color: isEpic ? 'rgba(0, 229, 255, 0.85)' : 'rgba(148, 163, 184, 0.95)',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        KENTU SCORE
      </div>

      <div
        style={{
          fontSize: '6rem',
          fontWeight: 900,
          lineHeight: 1,
          color: scoreColor,
          textShadow: numberTextShadow,
          marginBottom: 20,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {score}
        <span
          style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            marginLeft: 4,
            verticalAlign: 'super',
            opacity: 0.92,
          }}
        >
          %
        </span>
      </div>

      <div
        style={{
          maxWidth: 480,
          margin: '0 auto',
          background: 'rgba(0, 0, 0, 0.55)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: '14px 16px',
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          justifyContent: 'center',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '1.35rem', lineHeight: 1, flexShrink: 0 }} aria-hidden>
          🧑‍🏫
        </span>
        <p
          style={{
            margin: 0,
            fontSize: '0.9rem',
            lineHeight: 1.55,
            color: 'rgba(241, 245, 249, 0.95)',
            fontStyle: 'italic',
          }}
        >
          {coachText}
        </p>
      </div>
    </div>
  );
}
