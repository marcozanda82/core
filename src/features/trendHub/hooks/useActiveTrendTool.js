import { useCallback, useState } from 'react';
import {
  DEFAULT_TREND_PROGRESSIONE_TOOL,
  TREND_ACTIVE_TOOL_LS_KEY,
  TREND_PROGRESSIONE_TOOLS,
} from '../../../constants/salaComandiConstants';

/**
 * @param {unknown} value
 * @returns {'COMPASS' | 'RADAR' | 'MAP'}
 */
export function normalizeTrendProgressioneTool(value) {
  const v = String(value || '').trim().toUpperCase();
  // Legacy DIAG → COMPASS (la diagnostica vive in SnapshotHub).
  if (v === 'DIAG') return DEFAULT_TREND_PROGRESSIONE_TOOL;
  return TREND_PROGRESSIONE_TOOLS.includes(v) ? v : DEFAULT_TREND_PROGRESSIONE_TOOL;
}

/**
 * @returns {'COMPASS' | 'RADAR' | 'MAP'}
 */
export function readPersistedTrendProgressioneTool() {
  if (typeof localStorage === 'undefined') return DEFAULT_TREND_PROGRESSIONE_TOOL;
  try {
    return normalizeTrendProgressioneTool(localStorage.getItem(TREND_ACTIVE_TOOL_LS_KEY));
  } catch {
    return DEFAULT_TREND_PROGRESSIONE_TOOL;
  }
}

/**
 * @param {string} tool
 */
export function persistTrendProgressioneTool(tool) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TREND_ACTIVE_TOOL_LS_KEY, normalizeTrendProgressioneTool(tool));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Tool attivo nello Storico (COMPASS/RADAR/MAP), sincronizzato con
 * localStorage `kentu_active_trend_tool`.
 *
 * @returns {{
 *   activeTool: 'COMPASS' | 'RADAR' | 'MAP',
 *   setActiveTool: (next: string) => void,
 * }}
 */
export function useActiveTrendTool() {
  const [activeTool, setActiveToolState] = useState(readPersistedTrendProgressioneTool);

  const setActiveTool = useCallback((next) => {
    const normalized = normalizeTrendProgressioneTool(next);
    setActiveToolState(normalized);
    persistTrendProgressioneTool(normalized);
  }, []);

  return { activeTool, setActiveTool };
}

export default useActiveTrendTool;
