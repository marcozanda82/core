import React from 'react';
import { DEBUG_TIME_GRID_HOURS, getDebugGridLineChartStyle } from './timeLayout';

/** Impostare false (o eliminare import + file) dopo verifica allineamento grafico/timeline. */
export const SHOW_TIME_ALIGNMENT_DEBUG = true;

/** Linee verticali ogni 6h sul contenitore del grafico (stesso mapping di NowVerticalLineOverlay). */
export default function TimeAlignmentChartDebugOverlay() {
  if (!SHOW_TIME_ALIGNMENT_DEBUG) return null;
  return (
    <>
      {DEBUG_TIME_GRID_HOURS.map((h) => (
        <div key={`time-debug-chart-${h}`} aria-hidden style={getDebugGridLineChartStyle(h)} />
      ))}
    </>
  );
}
