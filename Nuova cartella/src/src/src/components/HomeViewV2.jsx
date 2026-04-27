import React from 'react';

/**
 * New Home UI candidate (isolated from HomeView for safe iteration).
 * Intentionally minimal: no business logic changes, only presentation.
 */
export default function HomeViewV2({
  longevity,
  explanation,
  dailyKcalConsumed,
  dailyKcalTarget,
}) {
  const score =
    longevity != null && typeof longevity.score === 'number' && !Number.isNaN(longevity.score)
      ? Math.round(longevity.score)
      : 0;
  const safeTarget =
    typeof dailyKcalTarget === 'number' && !Number.isNaN(dailyKcalTarget) ? Math.round(dailyKcalTarget) : null;
  const safeConsumed =
    typeof dailyKcalConsumed === 'number' && !Number.isNaN(dailyKcalConsumed) ? Math.round(dailyKcalConsumed) : null;
  const surplus =
    safeTarget != null && safeConsumed != null && safeConsumed > safeTarget
      ? safeConsumed - safeTarget
      : 0;

  return (
    <div style={{ padding: 16, maxWidth: 700, margin: '0 auto', display: 'grid', gap: 12 }}>
      <div
        style={{
          borderRadius: 16,
          padding: '14px 16px',
          background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.9), rgba(2, 6, 23, 0.92))',
          border: '1px solid rgba(148, 163, 184, 0.22)',
        }}
      >
        <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.12em', fontWeight: 700 }}>
          HOME V2 (DEV)
        </div>
        <div style={{ marginTop: 6, fontSize: 38, fontWeight: 800, color: '#e2e8f0', lineHeight: 1 }}>
          {score}
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: '#cbd5e1' }}>Longevity Score</div>
      </div>

      {safeTarget != null && safeConsumed != null ? (
        <div
          style={{
            borderRadius: 14,
            padding: '12px 14px',
            background: 'rgba(15, 23, 42, 0.72)',
            border: '1px solid rgba(148, 163, 184, 0.2)',
          }}
        >
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Bilancio calorico</div>
          {surplus > 0 ? (
            <div style={{ marginTop: 6, color: '#f87171', fontSize: 24, fontWeight: 800 }}>+{surplus} kcal</div>
          ) : (
            <div style={{ marginTop: 6, color: '#e2e8f0', fontSize: 20, fontWeight: 700 }}>
              {Math.max(0, safeTarget - safeConsumed)} kcal
            </div>
          )}
        </div>
      ) : null}

      {typeof explanation === 'string' && explanation.trim() ? (
        <div
          style={{
            borderRadius: 14,
            padding: '12px 14px',
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(148, 163, 184, 0.18)',
            color: '#cbd5e1',
            lineHeight: 1.55,
            fontSize: 14,
          }}
        >
          {explanation}
        </div>
      ) : null}
    </div>
  );
}

