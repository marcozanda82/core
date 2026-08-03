import { useCallback, useState } from 'react';
import {
  DEFAULT_TREND_HUB_HEMISPHERE,
  TREND_HUB_HEMISPHERE_LS_KEY,
  TREND_HUB_HEMISPHERES,
} from '../../../constants/salaComandiConstants';

/**
 * @param {unknown} value
 * @returns {'progressione' | 'salute'}
 */
export function normalizeTrendHubHemisphere(value) {
  const v = String(value || '').trim().toLowerCase();
  return TREND_HUB_HEMISPHERES.includes(v) ? v : DEFAULT_TREND_HUB_HEMISPHERE;
}

/**
 * @returns {'progressione' | 'salute'}
 */
export function readPersistedTrendHubHemisphere() {
  if (typeof localStorage === 'undefined') return DEFAULT_TREND_HUB_HEMISPHERE;
  try {
    return normalizeTrendHubHemisphere(localStorage.getItem(TREND_HUB_HEMISPHERE_LS_KEY));
  } catch {
    return DEFAULT_TREND_HUB_HEMISPHERE;
  }
}

/**
 * @param {'progressione' | 'salute' | string} hemisphere
 */
export function persistTrendHubHemisphere(hemisphere) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TREND_HUB_HEMISPHERE_LS_KEY, normalizeTrendHubHemisphere(hemisphere));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Stato emisfero Trend Hub sincronizzato con localStorage (`kentu_trend_hemisphere`).
 * Default: `progressione`.
 *
 * @returns {{
 *   hemisphere: 'progressione' | 'salute',
 *   setHemisphere: (next: 'progressione' | 'salute' | string) => void,
 *   isProgressione: boolean,
 *   isSalute: boolean,
 * }}
 */
export function useTrendHubHemisphere() {
  const [hemisphere, setHemisphereState] = useState(readPersistedTrendHubHemisphere);

  const setHemisphere = useCallback((next) => {
    const normalized = normalizeTrendHubHemisphere(next);
    setHemisphereState(normalized);
    persistTrendHubHemisphere(normalized);
  }, []);

  return {
    hemisphere,
    setHemisphere,
    isProgressione: hemisphere === 'progressione',
    isSalute: hemisphere === 'salute',
  };
}

export default useTrendHubHemisphere;
