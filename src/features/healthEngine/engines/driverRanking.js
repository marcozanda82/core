/**
 * Ranking deterministico dei driver.
 * score = magnitude * severity * confidenceWeight
 */

import { CERTAINTY_LEVELS } from '../contracts/healthSnapshot.types.js';
import {
  CONFIDENCE_WEIGHTS,
  DRIVER_DIRECTIONS,
  GLOBAL_DRIVER_LIMIT,
  SEVERITY_WEIGHTS,
} from '../contracts/healthSystem.types.js';

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

export function confidenceWeight(certainty) {
  const key = String(certainty || '');
  if (Object.prototype.hasOwnProperty.call(CONFIDENCE_WEIGHTS, key)) {
    return CONFIDENCE_WEIGHTS[key];
  }
  return CONFIDENCE_WEIGHTS.ESTIMATED;
}

export function severityWeight(direction) {
  if (direction === DRIVER_DIRECTIONS.NEGATIVE) return SEVERITY_WEIGHTS.NEGATIVE;
  if (direction === DRIVER_DIRECTIONS.POSITIVE) return SEVERITY_WEIGHTS.POSITIVE;
  return SEVERITY_WEIGHTS.NEUTRAL;
}

/**
 * @param {import('../contracts/healthSystem.types.js').Driver} driver
 * @returns {number}
 */
export function computeDriverRankScore(driver) {
  const magnitude = Math.max(0, Math.min(1, Number(driver?.magnitude) || 0));
  return round4(
    magnitude
    * severityWeight(driver?.direction)
    * confidenceWeight(driver?.certainty || CERTAINTY_LEVELS.ESTIMATED),
  );
}

/**
 * @param {Array<{ driver: import('../contracts/healthSystem.types.js').Driver, pillar: string }>} tagged
 * @returns {import('../contracts/healthSystem.types.js').DriverRankRow[]}
 */
export function rankDrivers(tagged) {
  const rows = (Array.isArray(tagged) ? tagged : []).map((item) => {
    const driver = item.driver;
    const severity = severityWeight(driver.direction);
    const conf = confidenceWeight(driver.certainty);
    return {
      id: driver.id,
      rankScore: computeDriverRankScore(driver),
      magnitude: Math.max(0, Math.min(1, Number(driver.magnitude) || 0)),
      severity,
      confidenceWeight: conf,
      direction: driver.direction,
      pillar: item.pillar,
    };
  });

  rows.sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return String(a.pillar).localeCompare(String(b.pillar));
  });

  return rows;
}

/**
 * @param {Array<{ driver: import('../contracts/healthSystem.types.js').Driver, pillar: string }>} tagged
 * @param {number} [limit]
 * @returns {import('../contracts/healthSystem.types.js').Driver[]}
 */
export function pickGlobalDrivers(tagged, limit = GLOBAL_DRIVER_LIMIT) {
  const ranked = rankDrivers(tagged);
  const seen = new Set();
  const out = [];
  for (let i = 0; i < ranked.length && out.length < limit; i += 1) {
    const row = ranked[i];
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const hit = tagged.find((t) => t.driver.id === row.id && t.pillar === row.pillar);
    if (hit) out.push({ ...hit.driver });
  }
  return out;
}
