import React, { useMemo } from 'react';
import {
  METABOLIC_PHASE_COLORS,
  buildMetabolicGradientId,
} from '../../features/salaComandi/utils/metabolicPhaseColors';

const DEFAULT_STOPS = [
  { offset: '0%', color: METABOLIC_PHASE_COLORS.digestiva },
  { offset: '100%', color: METABOLIC_PHASE_COLORS.digestiva },
];

function normalizeStopOffset(offset) {
  if (offset == null) return '0%';
  if (typeof offset === 'number' && Number.isFinite(offset)) return `${offset}%`;
  const raw = String(offset).trim();
  if (!raw) return '0%';
  return raw.endsWith('%') ? raw : `${raw}%`;
}

/** Gradiente orizzontale fasi metaboliche (asse X = timeline 24h). */
export default function MetabolicTimelineGradient({
  id,
  stops,
  fillStopOpacity = 0.58,
  strokeStopOpacity = 1,
  variant = 'fill',
  gradientUnits = 'objectBoundingBox',
}) {
  const safeStops = stops?.length ? stops : DEFAULT_STOPS;
  const stopOpacity = variant === 'stroke' ? strokeStopOpacity : fillStopOpacity;

  return (
    <linearGradient
      id={id}
      gradientUnits={gradientUnits}
      spreadMethod="pad"
      x1="0%"
      y1="0%"
      x2="100%"
      y2="0%"
    >
      {safeStops.map((stop, index) => (
        <stop
          key={`${id}-${stop.offset}-${stop.color}-${index}`}
          offset={normalizeStopOffset(stop.offset)}
          stopColor={stop.color}
          stopOpacity={stop.stopOpacity ?? stopOpacity}
        />
      ))}
    </linearGradient>
  );
}

/** Defs condivise grafico Energia SNC (%): area metabolica + riserva fisica. */
export function SncEnergyChartGradients({
  metabolicGradientStops,
  energyGradientId,
  energyGradientIdPrefix = 'colorEnergia',
  riservaGradientId = 'colorRiserva',
}) {
  const resolvedEnergyGradientId = useMemo(() => {
    if (energyGradientId) return energyGradientId;
    return buildMetabolicGradientId(metabolicGradientStops, energyGradientIdPrefix);
  }, [energyGradientId, metabolicGradientStops, energyGradientIdPrefix]);

  return (
    <>
      <MetabolicTimelineGradient id={resolvedEnergyGradientId} stops={metabolicGradientStops} />
      <linearGradient id={riservaGradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#00e676" stopOpacity={0.5} />
        <stop offset="100%" stopColor="#00e676" stopOpacity={0.0} />
      </linearGradient>
    </>
  );
}

/** Hook: id dinamico + url fill/stroke per Area Recharts (allineato al bbox area). */
export function useMetabolicChartGradient(stops, prefix = 'colorEnergia') {
  return useMemo(() => {
    const gradientId = buildMetabolicGradientId(stops, prefix);
    const url = `url(#${gradientId})`;
    return { gradientId, fill: url, stroke: url };
  }, [stops, prefix]);
}
