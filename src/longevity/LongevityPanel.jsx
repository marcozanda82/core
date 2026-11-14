import React from 'react';
import { featureFlags } from '../config/featureFlags.js';
import LongevityView from '../LongevityView';

/**
 * Shell tab «Progressi / Longevità»: scroll + delega a LongevityView.
 * Tutti i calcoli e i dataset restano nel parent (SalaComandi).
 */
export default function LongevityPanel(props) {
  if (!featureFlags.longevityDashboard) return null;
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        width: '100%',
      }}
    >
      <LongevityView {...props} />
    </div>
  );
}
