import React from 'react';

/**
 * Card compatta coach metabolico (solo presentazione).
 *
 * @param {{
 *   insight: {
 *     severity: 'info' | 'warning' | 'good',
 *     title: string,
 *     message: string,
 *     reason: string | null,
 *     actionLabel: string | null,
 *   } | null | undefined,
 * }} props
 */
export default function MetabolicCoachCard({ insight } = {}) {
  if (!insight || !insight.title) return null;

  const borderTint =
    insight.severity === 'warning'
      ? 'rgba(200, 140, 110, 0.42)'
      : insight.severity === 'good'
        ? 'rgba(110, 170, 140, 0.38)'
        : 'rgba(255,255,255,0.1)';

  return (
    <aside
      aria-label="Suggerimento coach metabolico"
      style={{
        marginTop: 14,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${borderTint}`,
        background: 'rgba(18, 22, 26, 0.82)',
        maxWidth: 400,
        marginLeft: 'auto',
        marginRight: 'auto',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 650,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'rgba(180, 195, 210, 0.55)',
          marginBottom: 6,
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        Coach
      </div>
      <h4
        style={{
          margin: '0 0 6px',
          fontSize: 13,
          fontWeight: 600,
          color: 'rgba(236, 240, 245, 0.94)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        {insight.title}
      </h4>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.45,
          color: 'rgba(200, 210, 220, 0.9)',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        {insight.message}
      </p>
      {insight.reason ? (
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 10,
            lineHeight: 1.35,
            color: 'rgba(160, 175, 190, 0.72)',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          {insight.reason}
        </p>
      ) : null}
      {insight.actionLabel ? (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            fontWeight: 600,
            color: 'rgba(200, 220, 235, 0.85)',
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          }}
        >
          {insight.actionLabel}
        </div>
      ) : null}
    </aside>
  );
}
