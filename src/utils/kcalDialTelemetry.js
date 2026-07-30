/**
 * Soglie e scala per il doppio anello kcal (Home).
 *
 * @typedef {{
 *   deficitKcal?: number,
 *   targetStartKcal?: number,
 *   targetEndKcal?: number,
 *   surplusKcal?: number,
 *   maxScaleKcal?: number,
 *   targetBandKcal?: number,
 * }} KcalDialThresholdOverrides
 */

const DEFAULT_TARGET_BAND = 80;
const DEFAULT_SURPLUS_MARGIN = 140;
const DEFAULT_MAX_SCALE_PADDING = 500;

/**
 * @param {number} kcal
 * @param {number} maxScale
 * @returns {number} radianti, 0 kcal = ore 12, senso orario
 */
export function kcalToAngleRad(kcal, maxScale) {
  const max = Math.max(1, Number(maxScale) || 1);
  const ratio = Math.max(0, Math.min(1, (Number(kcal) || 0) / max));
  return -Math.PI / 2 + ratio * 2 * Math.PI;
}

/**
 * @param {{
 *   tdeeKcal?: number | null,
 *   dailyTargetKcal?: number,
 *   consumedKcal?: number,
 *   plannedDelta?: number,
 *   thresholds?: KcalDialThresholdOverrides | null,
 * }} input
 */
export function resolveKcalDialTelemetry(input = {}) {
  const overrides = input.thresholds && typeof input.thresholds === 'object'
    ? input.thresholds
    : {};

  const dailyTarget = Math.max(
    1,
    Math.round(Number(input.dailyTargetKcal) || Number(overrides.targetEndKcal) || 2500),
  );
  const band = Math.max(
    20,
    Math.round(Number(overrides.targetBandKcal) || DEFAULT_TARGET_BAND),
  );

  let targetEnd = Math.round(Number(overrides.targetEndKcal) || dailyTarget);
  let targetStart = Math.round(
    Number(overrides.targetStartKcal) || targetEnd - band,
  );
  const tdee = Math.round(Number(input.tdeeKcal) || 0);
  let deficit = Math.round(
    Number(overrides.deficitKcal) || (tdee > 0 ? tdee : targetStart - 130),
  );
  const surplusMargin = Math.max(
    40,
    Math.round(Number(overrides.surplusMarginKcal) || DEFAULT_SURPLUS_MARGIN),
  );
  let surplus = Math.round(Number(overrides.surplusKcal) || targetEnd + surplusMargin);

  if (targetStart >= targetEnd) {
    targetStart = targetEnd - band;
  }
  if (deficit >= targetStart) {
    deficit = Math.max(0, targetStart - 40);
  }
  if (surplus <= targetEnd) {
    surplus = targetEnd + surplusMargin;
  }

  const consumed = Math.max(0, Math.round(Number(input.consumedKcal) || 0));

  let maxScale = Math.round(Number(overrides.maxScaleKcal) || 0);
  if (!(maxScale > 0)) {
    // Fondo scala unico: target + 500 (allinea carburante e nodi)
    maxScale = Math.max(targetEnd + DEFAULT_MAX_SCALE_PADDING, 2000);
  }
  // I nodi devono restare dentro la scala condivisa
  if (surplus >= maxScale) {
    maxScale = surplus + Math.max(150, Math.round(DEFAULT_MAX_SCALE_PADDING * 0.3));
  }
  if (consumed > maxScale) {
    maxScale = Math.max(maxScale, consumed + 100);
  }

  return {
    deficitKcal: deficit,
    targetStartKcal: targetStart,
    targetEndKcal: targetEnd,
    surplusKcal: surplus,
    maxScaleKcal: maxScale,
    consumedKcal: consumed,
  };
}

/**
 * Stato HUD centrale in base alle kcal consumate vs soglie.
 *
 * @param {{
 *   consumedKcal?: number,
 *   targetStartKcal?: number,
 *   targetEndKcal?: number,
 * }} telemetry
 * @returns {{ zone: 'under' | 'target' | 'surplus', text: string, color: string }}
 */
export function resolveKcalZoneHudLabel(telemetry = {}) {
  const consumed = Math.max(0, Math.round(Number(telemetry.consumedKcal) || 0));
  const start = Math.max(0, Math.round(Number(telemetry.targetStartKcal) || 0));
  const end = Math.max(start, Math.round(Number(telemetry.targetEndKcal) || start));

  if (consumed > end) {
    return {
      zone: 'surplus',
      text: `🔴 SURPLUS (≥ ${end})`,
      color: '#f87171',
    };
  }
  if (consumed >= start) {
    return {
      zone: 'target',
      text: `🟢 ZONA TARGET (${start} – ${end})`,
      color: '#4ade80',
    };
  }
  return {
    zone: 'under',
    text: `🟣 Sotto Target (< ${start})`,
    color: '#c084fc',
  };
}

export function polarToCartesian(cx, cy, r, angleRad) {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

/**
 * Arco SVG da angolo a angolo (senso orario).
 */
export function describeArc(cx, cy, r, startRad, endRad) {
  if (endRad <= startRad) return '';
  const start = polarToCartesian(cx, cy, r, startRad);
  const end = polarToCartesian(cx, cy, r, endRad);
  const largeArc = endRad - startRad > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}
