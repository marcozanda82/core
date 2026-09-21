import { useMemo } from 'react';
import {
  SMART_QUICK_LOOKBACK_DAYS,
  SMART_QUICK_MAX_SLOTS,
  rankSmartQuickActions,
} from './smartQuickActions.js';

/**
 * Motore predittivo del menu Rapidi: top 4 azioni nella fascia oraria corrente
 * (ultimi 30 giorni). Senza dati → `items` vuoto.
 *
 * @param {{
 *   fullHistory?: object,
 *   dailyLog?: object[],
 *   manualNodes?: object[],
 *   lookbackDays?: number,
 *   limit?: number,
 * }} [opts]
 */
export function useSmartQuickActions({
  fullHistory = {},
  dailyLog = [],
  manualNodes = [],
  lookbackDays = SMART_QUICK_LOOKBACK_DAYS,
  limit = SMART_QUICK_MAX_SLOTS,
} = {}) {
  const hourBucket = new Date().getHours();

  return useMemo(
    () => rankSmartQuickActions({
      fullHistory,
      dailyLog,
      manualNodes,
      lookbackDays,
      limit,
    }),
    [fullHistory, dailyLog, manualNodes, lookbackDays, limit, hourBucket],
  );
}

export default useSmartQuickActions;
