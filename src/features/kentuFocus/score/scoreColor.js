/**
 * Colore del giorno. Lo score percorre l'arancio-rosso fino al blu chiaro.
 * forceIntensity scurisce quel blu verso il blu elettrico solo se il giorno
 * è già sulla rotta: una giornata sotto soglia non diventa blu grazie alla forza.
 */

import { ON_TRACK_SCORE, SCORE_COLORS } from './scoreConfig.kds-3.js';

export function dayScoreColor(score, forceIntensity = 0) {
  if (score == null || !Number.isFinite(Number(score))) {
    return { hex: SCORE_COLORS.missing, tone: 'missing', forceApplied: false };
  }
  const t = clamp01(Number(score));
  let rgb = lerp(hexRgb(SCORE_COLORS.orangeRed), hexRgb(SCORE_COLORS.lightBlue), t);
  const force = t >= ON_TRACK_SCORE ? clamp01(Number(forceIntensity) || 0) : 0;
  if (force > 0) {
    rgb = lerp(rgb, hexRgb(SCORE_COLORS.electricBlue), force);
  }
  return {
    hex: rgbHex(rgb),
    tone: t >= ON_TRACK_SCORE ? 'on_track' : 'off_blue',
    forceApplied: force > 0,
  };
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function hexRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a, b, t) {
  return a.map((channel, i) => Math.round(channel + (b[i] - channel) * t));
}

function rgbHex([r, g, b]) {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}
