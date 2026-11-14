/**
 * Colore di una casella del calendario Focus.
 * Una sola funzione per punteggio, forza e stato del giorno.
 */

const STOPS = Object.freeze([
  [0, [0xB2, 0x3A, 0x28]],
  [0.35, [0xD9, 0x73, 0x3A]],
  [0.55, [0xE6, 0xC0, 0x6A]],
  [0.65, [0xE4, 0xDC, 0xC8]],
  [0.75, [0x93, 0xB8, 0xEC]],
  [1, [0x2F, 0x63, 0xD6]],
]);

const ELECTRIC = [28, 86, 255];
const DARK_TEXT = [26, 20, 12];
const LIGHT_TEXT = [255, 255, 255];

/**
 * @param {number|null|undefined} score
 * @param {number|null|undefined} forceIntensity
 * @param {string|null|undefined} dayStatus
 */
export function dayColor(score, forceIntensity, dayStatus) {
  const status = String(dayStatus || '');
  if (status === 'hole') return plain('hole');
  if (status === 'paused') return plain('pause');
  if (status === 'in_progress') return plain('today');
  if (status === 'future') return plain('future');
  const value = Number(score);
  if (!Number.isFinite(value)) return plain('hole');

  const center = fittedColor(paint(value, forceIntensity), value);
  return {
    kind: 'score',
    background: rgbCss(center.rgb),
    color: rgbCss(center.ink),
    border: 'transparent',
    late: status === 'late',
    approximate: status === 'approximate',
  };
}

/** Colore piatto al punteggio, lo stesso centro della casella. */
export function daySwatch(score) {
  const value = clamp01(Number(score) || 0);
  return fittedColor(paint(value, 0), value).rgb;
}

/** Luminosità, croma e tinta OKLab del colore piatto, per la tavola. */
export function dayScaleMetrics(score) {
  const rgb = daySwatch(score);
  const [l, c, h] = rgbToOklch(rgb);
  return { rgb, l, c, h };
}

export function contrastRatio(a, b) {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function plain(kind) {
  return {
    kind,
    background: 'transparent',
    color: 'inherit',
    border: 'transparent',
    late: false,
    approximate: false,
  };
}

function paint(score, forceIntensity) {
  let rgb = sample(score);
  if (score >= 0.75) {
    const mix = clamp01(Number(forceIntensity) || 0) * 0.7;
    rgb = rgb.map((channel, index) => Math.round(channel + (ELECTRIC[index] - channel) * mix));
  }
  return rgb;
}

const STOP_LAB = STOPS.map(([at, rgb]) => [at, rgbToOklab(rgb)]);

function sample(score) {
  const value = clamp01(score);
  let left = STOP_LAB[0];
  let right = STOP_LAB[STOP_LAB.length - 1];
  for (let index = 0; index < STOP_LAB.length - 1; index += 1) {
    if (value >= STOP_LAB[index][0] && value <= STOP_LAB[index + 1][0]) {
      left = STOP_LAB[index];
      right = STOP_LAB[index + 1];
      break;
    }
  }
  const span = right[0] - left[0] || 1;
  const t = (value - left[0]) / span;
  const lab = [
    left[1][0] + (right[1][0] - left[1][0]) * t,
    left[1][1] + (right[1][1] - left[1][1]) * t,
    left[1][2] + (right[1][2] - left[1][2]) * t,
  ];
  return oklabToRgb(avoidGreenCyan(lab));
}

/** La retta in OKLab non ruota la tinta. Se cade comunque su verde o ciano, torna neutra. */
function avoidGreenCyan(lab) {
  const c = Math.hypot(lab[1], lab[2]);
  if (c < 0.02) return lab;
  let hue = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  if (hue >= 140 && hue <= 220) return [lab[0], 0, 0];
  return lab;
}

function fittedColor(rgb, value) {
  const preferLight = value < 0.45 || value > 0.9;
  const order = preferLight ? [LIGHT_TEXT, DARK_TEXT] : [DARK_TEXT, LIGHT_TEXT];
  for (const ink of order) {
    if (contrastRatio(ink, rgb) >= 4.5) return { rgb, ink };
  }
  const ink = contrastRatio(DARK_TEXT, rgb) >= contrastRatio(LIGHT_TEXT, rgb) ? DARK_TEXT : LIGHT_TEXT;
  const toward = ink === DARK_TEXT ? 255 : 0;
  let low = 0;
  let high = 1;
  let current = rgb.slice();
  for (let step = 0; step < 14; step += 1) {
    const t = (low + high) / 2;
    const next = rgb.map((channel) => Math.round(channel + (toward - channel) * t));
    if (contrastRatio(ink, next) >= 4.5) {
      current = next;
      high = t;
    } else {
      low = t;
    }
  }
  return { rgb: current, ink };
}

function rgbToOklch(rgb) {
  const [L, a, b] = rgbToOklab(rgb);
  const c = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, c, h];
}

function rgbToOklab(rgb) {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function oklabToRgb(lab) {
  const L = lab[0];
  const a = lab[1];
  const b = lab[2];
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

function srgbToLinear(channel) {
  const x = channel / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel) {
  const x = Math.min(1, Math.max(0, channel));
  const s = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
}

function relativeLuminance(rgb) {
  const channels = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function rgbCss(rgb) {
  return `rgb(${rgb.join(',')})`;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
