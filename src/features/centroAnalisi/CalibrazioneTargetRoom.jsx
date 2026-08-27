import React from 'react';
import MetabolicTrendChart from '../../components/MetabolicTrendChart';

/**
 * Stanza Centro Analisi — Calibrazione Target & Bilancio (Ghost Car, autopilota, slider).
 */
export default function CalibrazioneTargetRoom({ store, handlers = null }) {
  const h = handlers && typeof handlers === 'object' ? handlers : {};
  const {
    fullHistory,
    activeLog,
    userTargets,
    todayDate,
  } = store || {};

  return (
    <div className="w-full min-w-0 px-0.5 pb-8">
      <header className="mb-3 px-1">
        <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Pilota energetico
        </p>
        <h2 className="m-0 mt-1 text-base font-semibold text-slate-50">
          Calibrazione Target &amp; Bilancio
        </h2>
        <p className="m-0 mt-1 text-[11px] leading-relaxed text-slate-400">
          Regola deficit o surplus giornaliero, traiettoria Ghost Car a 7 giorni, autopilota e recupero del debito calorico.
        </p>
      </header>

      <MetabolicTrendChart
        fullHistory={fullHistory}
        userTargets={userTargets}
        activeLog={activeLog}
        activeDate={h.activeDate || todayDate}
        settingsBaseKcal={h.settingsBaseKcal ?? null}
        committedGoal={h.committedGhostGoal ?? 'maintain'}
        committedDeltaKcal={h.committedGhostDeltaKcal ?? null}
        effectiveDeltaKcal={h.effectiveGhostDeltaKcal ?? null}
        autoCompensationDelta={h.autoCompensationDelta ?? 0}
        rollingDebt={h.rollingDebt ?? null}
        ghostAutoPilotEnabled={h.ghostAutoPilotEnabled !== false}
        onToggleGhostAutoPilot={h.onToggleGhostAutoPilot ?? null}
        onApplyGoal={h.onApplyGhostSimGoal ?? null}
        activeCompensation={h.activeCompensation ?? null}
        compensationDateIso={h.activeDate || todayDate}
        onConfirmCompensation={h.onConfirmCompensation ?? null}
        onClearCompensation={h.onClearCompensation ?? null}
      />
    </div>
  );
}
