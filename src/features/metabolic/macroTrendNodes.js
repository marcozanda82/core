import { applyEnergyDeadBandToKcalBalance } from '../../metabolicDirectionEngine';
import { convertToSvgCoords } from './bubbleRadarCoords';
import { mapMetricsToPillars, pillarsToBubbleCoords } from './pillarsMapperLegacy';

const MACRO_WINDOWS = {
  '30d': 30,
  '14d': 14,
  '7d': 7,
  '1d': 1,
};

export const SNAKE_ORDER = ['30d', '14d', '7d', '1d'];

/** Scala assoluta del radar: invariata rispetto al timeframe UI selezionato. */
const ABSOLUTE_IMPACT_MULTIPLIER = 1;

const GHOST_OPACITIES_BY_COUNT = {
  1: [0.3],
  2: [0.3, 0.6],
  3: [0.3, 0.45, 0.6],
};

/**
 * Calcola le coordinate bolla (x,y ∈ [-100,100]) per le 4 finestre macro
 * e l'array completo del binario SVG 30d → 1d.
 *
 * @param {Array<{ kcalBalance?: number, trainingLoad?: number, sleepHours?: number | null, date?: string }>} dailyHistory
 * @param {number} [referenceTdee=2000]
 * @returns {{
 *   nodes: Record<'30d' | '14d' | '7d' | '1d', { x: number, y: number, svgX: number, svgY: number }>,
 *   svgRail: Array<{ key: '30d' | '14d' | '7d' | '1d', x: number, y: number, svgX: number, svgY: number }>,
 * }}
 */
export function computeMacroTrendNodes(dailyHistory, referenceTdee = 2000) {
  const days = Array.isArray(dailyHistory) ? dailyHistory : [];
  /** @type {Record<string, { x: number, y: number, svgX: number, svgY: number }>} */
  const nodes = {};
  /** @type {Array<{ key: string, x: number, y: number, svgX: number, svgY: number }>} */
  const svgRail = [];

  for (const tf of SNAKE_ORDER) {
    const windowDays = MACRO_WINDOWS[tf];
    const slice = days.length <= windowDays ? days : days.slice(-windowDays);
    const coords = sliceToBubbleCoords(slice, ABSOLUTE_IMPACT_MULTIPLIER, referenceTdee);
    const { svgX, svgY } = convertToSvgCoords(coords.x, coords.y);
    nodes[tf] = { x: coords.x, y: coords.y, svgX, svgY };
    svgRail.push({ key: tf, x: coords.x, y: coords.y, svgX, svgY });
  }

  return { nodes, svgRail };
}

/**
 * Catena visibile del serpente in base al timeframe selezionato (inclusivo verso il passato).
 *
 * @param {string} selectedTimeframe es. '7d', '1d'
 * @param {Record<string, { x: number, y: number }>} macroNodes
 * @returns {{
 *   showSnake: boolean,
 *   ghostNodes: Array<{ key: string, x: number, y: number, opacity: number }>,
 *   polylineNodes: Array<{ x: number, y: number }>,
 * }}
 */
export function buildTimeframeSnakeChain(selectedTimeframe, macroNodes) {
  const tf = normalizeTimeframe(selectedTimeframe);
  const headIndex = SNAKE_ORDER.indexOf(tf);
  if (headIndex <= 0) {
    return { showSnake: false, ghostNodes: [], polylineNodes: [] };
  }

  const chainKeys = SNAKE_ORDER.slice(0, headIndex + 1);
  const ghostKeys = chainKeys.slice(0, -1);
  const opacities = GHOST_OPACITIES_BY_COUNT[ghostKeys.length] || ghostKeys.map(() => 0.4);

  const ghostNodes = ghostKeys.map((key, index) => {
    const node = macroNodes?.[key] || { x: 0, y: 0 };
    return {
      key,
      x: node.x,
      y: node.y,
      opacity: opacities[index] ?? 0.4,
    };
  });

  const polylineNodes = chainKeys.map((key) => macroNodes?.[key] || { x: 0, y: 0 });

  return { showSnake: true, ghostNodes, polylineNodes };
}

/**
 * @param {Array<{ kcalBalance?: number, trainingLoad?: number, sleepHours?: number | null }>} slice
 * @param {number} impactMultiplier
 * @param {number} referenceTdee
 */
function sliceToBubbleCoords(slice, impactMultiplier = 1, referenceTdee = 2000) {
  if (!slice.length) {
    return { x: 0, y: 0 };
  }

  const n = slice.length;
  let sumKcal = 0;
  let sumTraining = 0;
  let sumSleep = 0;
  let sleepCount = 0;

  for (let i = 0; i < slice.length; i += 1) {
    const day = slice[i];
    sumKcal += Number(day?.kcalBalance) || 0;
    sumTraining += clamp(Number(day?.trainingLoad) || 0, 0, 100);
    const sleepH = Number(day?.sleepHours);
    if (Number.isFinite(sleepH) && sleepH > 0) {
      sumSleep += sleepH;
      sleepCount += 1;
    }
  }

  const meanKcal = sumKcal / n;
  const meanTraining01 = sumTraining / n;
  const meanSleep = sleepCount > 0 ? sumSleep / sleepCount : 8;
  const sleepPenalty = meanSleep < 7.5 ? Math.max(0, 7.5 - meanSleep) : 0;

  const { adjusted: meanKcalForAxes } = applyEnergyDeadBandToKcalBalance(meanKcal, referenceTdee);
  const energyBalance = clamp((meanKcalForAxes / 5) * impactMultiplier, -100, 100);
  const trainingLoadAxis = clamp((((meanTraining01 - 35) / 65) * 100) * impactMultiplier, -100, 100);
  const distance = Math.hypot(energyBalance, trainingLoadAxis);

  const pillars = mapMetricsToPillars({
    energyBalance,
    trainingLoadAxis,
    meanTraining01,
    sleepPenalty,
    longevityScore: NaN,
    distance,
  });

  return pillarsToBubbleCoords(pillars);
}

/**
 * @param {string} timeframe
 * @returns {'30d' | '14d' | '7d' | '1d'}
 */
function normalizeTimeframe(timeframe) {
  const tf = String(timeframe || '7d').toLowerCase();
  if (tf === '30d') return '30d';
  if (tf === '14d') return '14d';
  if (tf === '1d') return '1d';
  return '7d';
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
