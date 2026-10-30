import React, { useMemo } from 'react';
import { ENERGY_IRREGULAR_PCT } from '../focusEnergyVariability.js';

const DAY_INITIALS = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];

/**
 * @param {string} iso
 */
function weekdayInitial(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '·';
  return DAY_INITIALS[d.getDay()] || '·';
}

/**
 * SVG sparkline kcal (ultimi giorni + giorno analisi).
 * @param {{
 *   points?: { date: string, kcal: number }[],
 *   targetKcal?: number|null,
 *   analysisDate?: string|null,
 * }} props
 */
export function EnergySparkline({ points = [], targetKcal = null, analysisDate = null }) {
  const series = useMemo(
    () => (Array.isArray(points) ? points.filter((p) => Number.isFinite(Number(p?.kcal))) : []),
    [points],
  );
  const target = Number(targetKcal);

  if (series.length < 2 || !Number.isFinite(target) || target <= 0) return null;

  const w = 320;
  const h = 96;
  const padX = 14;
  const padTop = 12;
  const padBottom = 22;
  const plotH = h - padTop - padBottom;
  const plotW = w - padX * 2;

  const values = series.map((p) => Number(p.kcal));
  const bandLo = target * (1 - ENERGY_IRREGULAR_PCT);
  const bandHi = target * (1 + ENERGY_IRREGULAR_PCT);
  const minV = Math.min(...values, bandLo) * 0.96;
  const maxV = Math.max(...values, bandHi) * 1.04;
  const span = Math.max(1, maxV - minV);

  const xAt = (i) => padX + (series.length === 1 ? plotW / 2 : (i / (series.length - 1)) * plotW);
  const yAt = (v) => padTop + (1 - (v - minV) / span) * plotH;

  const yLo = yAt(bandLo);
  const yHi = yAt(bandHi);
  const bandY = Math.min(yLo, yHi);
  const bandH = Math.abs(yLo - yHi);
  const yTarget = yAt(target);

  const line = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(Number(p.kcal)).toFixed(1)}`)
    .join(' ');

  const aria = series
    .map((p) => `${p.date}: ${Math.round(Number(p.kcal))} kcal`)
    .join('; ');

  return (
    <div className="kf-v-spark">
      <svg
        className="kf-v-spark-svg"
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height="auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Andamento energia. Target ${Math.round(target)} kcal. ${aria}`}
      >
        <rect
          x={padX}
          y={bandY}
          width={plotW}
          height={Math.max(2, bandH)}
          className="kf-v-spark-band"
          rx="4"
        />
        <line
          x1={padX}
          x2={padX + plotW}
          y1={yTarget}
          y2={yTarget}
          className="kf-v-spark-target"
        />
        <path d={line} className="kf-v-spark-line" fill="none" />
        {series.map((p, i) => {
          const kcal = Number(p.kcal);
          const outside = kcal < bandLo || kcal > bandHi;
          const isAnalysis = analysisDate && p.date === analysisDate;
          return (
            <g key={p.date || i}>
              <circle
                cx={xAt(i)}
                cy={yAt(kcal)}
                r={isAnalysis ? 5.5 : 3.6}
                className={
                  isAnalysis
                    ? 'kf-v-spark-dot kf-v-spark-dot--analysis'
                    : (outside ? 'kf-v-spark-dot kf-v-spark-dot--out' : 'kf-v-spark-dot kf-v-spark-dot--in')
                }
              />
              <text
                x={xAt(i)}
                y={h - 6}
                textAnchor="middle"
                className="kf-v-spark-day"
              >
                {weekdayInitial(p.date)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="kf-v-spark-legend" aria-hidden="true">
        <span className="kf-v-spark-leg kf-v-spark-leg--band">fascia ±15%</span>
        <span className="kf-v-spark-leg kf-v-spark-leg--out">fuori fascia</span>
      </div>
    </div>
  );
}

export default EnergySparkline;
