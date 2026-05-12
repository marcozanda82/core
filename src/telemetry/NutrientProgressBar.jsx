import React from 'react';
import { computeNutrientContributionBreakdown } from '../nutrition/computeNutrientContributionBreakdown';
import NutrientDrilldownList from '../nutrition/NutrientDrilldownList';

/**
 * Barra telemetria giornaliera + accordion drilldown contributi (solo presentazione + motore puro breakdown).
 *
 * @param {{
 *   label: string,
 *   current: number,
 *   target: number,
 *   unit?: string,
 *   nutrientKey?: string | null,
 *   drilldownKey: string | null,
 *   onToggleNutrientDrilldown: (key: string) => void,
 *   drilldownFoodEntriesForToday: unknown[],
 * }} props
 */
export default function NutrientProgressBar({
  label,
  current,
  target,
  unit = 'g',
  nutrientKey = null,
  drilldownKey,
  onToggleNutrientDrilldown,
  drilldownFoodEntriesForToday,
}) {
  const c = Number(current) ?? 0;
  const t = Number(target) ?? 0;
  const p = t > 0 ? Math.min((c / t) * 100, 100) : 0;
  const color = p >= 100 ? '#00e676' : p > 50 ? '#00e5ff' : '#ff6d00';
  const expanded = nutrientKey != null && drilldownKey === nutrientKey;
  const breakdownData =
    expanded && nutrientKey
      ? computeNutrientContributionBreakdown(drilldownFoodEntriesForToday, nutrientKey)
      : null;

  return (
    <div style={{ marginBottom: '12px' }}>
      <div
        role={nutrientKey ? 'button' : undefined}
        tabIndex={nutrientKey ? 0 : undefined}
        onKeyDown={
          nutrientKey
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggleNutrientDrilldown(nutrientKey);
                }
              }
            : undefined
        }
        style={{ cursor: nutrientKey ? 'pointer' : 'default', transition: 'transform 0.2s' }}
        onClick={() => {
          if (!nutrientKey) return;
          onToggleNutrientDrilldown(nutrientKey);
        }}
        onMouseEnter={(e) => nutrientKey && (e.currentTarget.style.transform = 'scale(1.02)')}
        onMouseLeave={(e) => nutrientKey && (e.currentTarget.style.transform = 'scale(1)')}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#aaa', marginBottom: '4px' }}>
          <span>{label}</span>
          <span>{Math.round(c)} / {Math.round(t)} {unit}</span>
        </div>
        <div style={{ height: '12px', background: '#333', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: '6px', transition: 'width 0.5s' }} />
        </div>
      </div>
      {expanded && breakdownData ? (
        <div
          style={{ marginTop: 12 }}
          onClick={(e) => e.stopPropagation()}
          role="region"
          aria-label={`Contributi ${label}`}
        >
          <NutrientDrilldownList breakdownData={breakdownData} />
        </div>
      ) : null}
    </div>
  );
}
