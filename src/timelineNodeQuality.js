/**
 * Stato qualità per nodi timeline: timing, sovrapposizioni, campioni modello fisiologico (chart).
 */

/** @typedef {'optimal' | 'neutral' | 'suboptimal'} TimelineNodeQuality */

function anchorsForNodeType(type) {
  if (type === 'meal' || type === 'ghost_meal') return [7.5, 12.5, 16, 19.5];
  if (type === 'work' || type === 'workout' || type === 'ghost_workout') return [9.5, 12, 18];
  if (type === 'cognitive') return [10, 15, 20];
  return [];
}

/**
 * Campiona chartData (ore 0…24, indice ≈ ora) a ora decimale.
 * @param {object[]|null|undefined} chartData
 * @param {number} hourDecimal
 * @returns {{ energy: number, digestione: number, cortisolo: number, neuro: number, glicemia: number } | null}
 */
export function sampleTimelineChartAtHour(chartData, hourDecimal) {
  if (!Array.isArray(chartData) || chartData.length === 0) return null;
  const clamped = Math.max(0, Math.min(24, Number(hourDecimal) || 0));
  const i0 = Math.min(chartData.length - 1, Math.max(0, Math.floor(clamped)));
  const i1 = Math.min(chartData.length - 1, i0 + 1);
  const frac = clamped - i0;
  const p0 = chartData[i0];
  const p1 = chartData[i1] || p0;
  if (!p0 || typeof p0 !== 'object') return null;
  const pick = (k) => {
    const a = p0[k];
    const b = p1?.[k];
    const na = typeof a === 'number' && !Number.isNaN(a) ? a : null;
    const nb = typeof b === 'number' && !Number.isNaN(b) ? b : null;
    if (na == null) return nb;
    if (nb == null) return na;
    return na + (nb - na) * frac;
  };
  const energy = pick('energy');
  const digestione = pick('digestione');
  const cortisolo = pick('cortisolo');
  const neuro = pick('neuro');
  const glicemia = pick('glicemia');
  if (
    energy == null &&
    digestione == null &&
    cortisolo == null &&
    neuro == null &&
    glicemia == null
  ) {
    return null;
  }
  return {
    energy: energy ?? 50,
    digestione: digestione ?? 0,
    cortisolo: cortisolo ?? 25,
    neuro: neuro ?? 70,
    glicemia: glicemia ?? 85,
  };
}

/**
 * Penalità timing vs finestre consigliate (ore). 0 = ottimo.
 */
function timingPenaltyHours(node) {
  const anchors = anchorsForNodeType(node.type);
  if (anchors.length === 0) return 0;
  const h = Number(node.time);
  if (!Number.isFinite(h)) return 0;
  let best = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const d = Math.abs(h - anchors[i]);
    if (d < best) best = d;
  }
  if (best <= 0.67) return 0;
  if (best <= 1.75) return 16;
  return 30;
}

function isLoadBearingType(type) {
  return type === 'work' || type === 'workout' || type === 'ghost_workout' || type === 'cognitive';
}

function isMealType(type) {
  return type === 'meal' || type === 'ghost_meal';
}

/**
 * @param {object} node
 * @param {object[]} allNodes
 * @param {object[]|null|undefined} chartData
 * @returns {TimelineNodeQuality}
 */
export function computeTimelineNodeQuality(node, allNodes, chartData) {
  if (!node || typeof node !== 'object') return 'neutral';

  let score = 100;
  score -= timingPenaltyHours(node);

  const stack = Number(node.stackIndex) || 0;
  score -= Math.min(26, stack * 13);

  const ch = sampleTimelineChartAtHour(chartData, node.time);

  if (isLoadBearingType(node.type) && ch) {
    if (ch.energy < 36) score -= 28;
    else if (ch.energy < 44) score -= 12;
    if (ch.digestione > 68) score -= 22;
    else if (ch.digestione > 58) score -= 10;
    if (ch.neuro < 38) score -= 10;
  }

  if (isMealType(node.type) && ch) {
    if (ch.digestione > 72) score -= 18;
    if (ch.energy < 30) score -= 14;
    const h = Number(node.time);
    if (Number.isFinite(h) && h >= 22.25) score -= 12;
  }

  if (node.type === 'work' || node.type === 'cognitive') {
    const mid = node.time + (node.duration || 1) * 0.5;
    const chMid = sampleTimelineChartAtHour(chartData, mid);
    if (chMid && chMid.energy < 34) score -= 8;
  }

  if (node.type === 'workout' || node.type === 'ghost_workout') {
    const meals = (allNodes || []).filter((n) => n && (n.type === 'meal' || n.type === 'ghost_meal'));
    const t = Number(node.time);
    if (Number.isFinite(t) && meals.length > 0) {
      let heavyBefore = false;
      for (let i = 0; i < meals.length; i++) {
        const m = meals[i];
        const mt = Number(m.time);
        if (!Number.isFinite(mt)) continue;
        const gap = t - mt;
        if (gap >= 0 && gap < 1.1) heavyBefore = true;
      }
      if (heavyBefore && ch && ch.digestione > 52) score -= 12;
    }
  }

  score = Math.max(0, Math.min(100, score));

  if (score >= 72) return 'optimal';
  if (score >= 48) return 'neutral';
  return 'suboptimal';
}

/** Ombre premium soft (Kentu): niente rosso acceso. */
export const TIMELINE_QUALITY_SHADOW = {
  optimal: '0 0 0 1px rgba(52,211,153,0.22), 0 0 14px rgba(16,185,129,0.14)',
  neutral: '0 0 0 1px rgba(250,204,21,0.14), 0 0 12px rgba(234,179,8,0.08)',
  suboptimalLo:
    '0 0 0 1px rgba(251,113,133,0.2), 0 0 14px rgba(244,63,94,0.09)',
  suboptimalHi:
    '0 0 0 1px rgba(251,113,133,0.28), 0 0 18px rgba(244,63,94,0.13)',
};

export function qualityShadowForState(quality, reduceMotion) {
  if (quality === 'optimal') return TIMELINE_QUALITY_SHADOW.optimal;
  if (quality === 'neutral') return TIMELINE_QUALITY_SHADOW.neutral;
  if (reduceMotion) return TIMELINE_QUALITY_SHADOW.suboptimalLo;
  return null;
}

/**
 * Mappa id nodo → qualità (per useMemo in TimelineNodi).
 * @param {object[]} nodes
 * @param {object[]|null|undefined} chartData
 * @returns {Map<string|number, TimelineNodeQuality>}
 */
export function buildTimelineNodeQualityMap(nodes, chartData) {
  const m = new Map();
  const list = Array.isArray(nodes) ? nodes : [];
  if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
    for (let i = 0; i < list.length; i++) {
      m.set(list[i].id, 'neutral');
    }
    return m;
  }
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (!n || n.id == null) continue;
    m.set(n.id, computeTimelineNodeQuality(n, list, chartData));
  }
  return m;
}
