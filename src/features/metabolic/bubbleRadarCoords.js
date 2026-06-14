/** Margine interno viewBox (unità 0–100) per glow/stroke senza clip ai bordi. */
export const RADAR_SAFE_PADDING = 10;

/**
 * Mappa pilastri (x,y ∈ [-100, 100]) in coordinate SVG (viewBox 0–100) con safe zone.
 *
 * @param {number} x
 * @param {number} y
 * @returns {{ svgX: number, svgY: number }}
 */
export function convertToSvgCoords(x, y) {
  const clampedX = Math.max(-100, Math.min(100, Number(x) || 0));
  const clampedY = Math.max(-100, Math.min(100, Number(y) || 0));
  const padding = RADAR_SAFE_PADDING;
  const maxRadius = 50 - padding;
  return {
    svgX: 50 + (clampedX / 100) * maxRadius,
    svgY: 50 - (clampedY / 100) * maxRadius,
  };
}
