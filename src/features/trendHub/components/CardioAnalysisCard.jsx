import React, { useMemo } from 'react';
import CardioProgressBar from '../../../components/CardioProgressBar';
import { getTodayString } from '../../../coreEngine';
import {
  buildCardioDetailsBreakdown,
  summarizeCardioAnalysis,
} from '../../commandTerminal/context/cardioCylinderStatus';
import { collectRecentWorkoutLogs } from '../../commandTerminal/context/kentuGlobalState';

const ZONE_ROWS = [
  { id: 'z2', label: 'Z2 aerobica', color: 'bg-cyan-400' },
  { id: 'z3', label: 'Z3 moderata', color: 'bg-amber-400' },
  { id: 'z4', label: 'Z4–Z5 alta', color: 'bg-rose-400' },
];

function useCardioAnalysis({ fullHistory, activeLog, activeDate, todayBurnKcal }) {
  return useMemo(() => {
    try {
      const todayIso = getTodayString();
      const viewerDate = String(activeDate || '').slice(0, 10);
      const mergeActiveLog = !viewerDate || viewerDate === todayIso;
      const pools = collectRecentWorkoutLogs(
        fullHistory || {},
        mergeActiveLog && Array.isArray(activeLog) ? activeLog : [],
        todayIso,
      );
      const breakdown = buildCardioDetailsBreakdown(pools.cardioLogs, pools.workoutLogs, {
        nowMs: Date.now(),
      });
      return summarizeCardioAnalysis(breakdown, { todayBurnKcal });
    } catch (error) {
      console.warn('[CardioAnalysisCard] analysis failed', error);
      return summarizeCardioAnalysis(null, { todayBurnKcal });
    }
  }, [fullHistory, activeLog, activeDate, todayBurnKcal]);
}

function KpiTile({ label, value, unit }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 px-2.5 py-2">
      <p className="m-0 text-[8px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="m-0 mt-0.5 font-mono text-lg font-bold tabular-nums leading-none text-slate-50">
        {value}
        <span className="ml-0.5 text-[10px] font-semibold text-slate-500">{unit}</span>
      </p>
    </div>
  );
}

/**
 * Card cardio di primo livello in Salute / Centro Analisi.
 * Minuti 7g, kcal, zone, riconoscimento tapis/cyclette — kcal allineate al TDEE.
 */
export default function CardioAnalysisCard({
  fullHistory = null,
  activeLog = null,
  activeDate = null,
  todayBurnKcal = 0,
} = {}) {
  const analysis = useCardioAnalysis({
    fullHistory,
    activeLog,
    activeDate,
    todayBurnKcal,
  });

  const zoneTotal = analysis.zoneMinutes.z2
    + analysis.zoneMinutes.z3
    + analysis.zoneMinutes.z4;

  return (
    <section
      className="flex flex-col gap-2 rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-cyan-950/35 to-slate-950/90 p-2.5"
      aria-label="Indicatore cardio settimanale"
    >
      <header>
        <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300/90">
          Indicatore cardio
        </p>
        <p className="m-0 mt-0.5 text-[11px] leading-snug text-slate-400">
          Minuti aerobici 7g, calorie bruciate e zone di intensità
        </p>
      </header>

      <CardioProgressBar
        fullHistory={fullHistory}
        activeLog={activeLog}
        activeDate={activeDate}
      />

      <div className="grid grid-cols-2 gap-1.5">
        <KpiTile
          label="Minuti 7g"
          value={`${analysis.weeklyMinutes}`}
          unit={`/ ${analysis.weeklyTarget}`}
        />
        <KpiTile
          label="Kcal cardio 7g"
          value={String(analysis.weeklyKcal)}
          unit="kcal"
        />
        <KpiTile
          label="Oggi nel TDEE"
          value={String(analysis.todayBurnKcal)}
          unit="kcal"
        />
        <KpiTile
          label="Mancanti"
          value={String(Math.round(analysis.remainingMinutes))}
          unit="min"
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-black/25 px-2.5 py-2">
        <p className="m-0 mb-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
          Zone di frequenza / intensità
        </p>
        <div className="space-y-1.5">
          {ZONE_ROWS.map((zone) => {
            const mins = Number(analysis.zoneMinutes[zone.id]) || 0;
            const pct = zoneTotal > 0 ? Math.round((mins / zoneTotal) * 100) : 0;
            return (
              <div key={zone.id} className="flex items-center gap-2">
                <span className="w-[5.5rem] shrink-0 text-[9px] uppercase tracking-wide text-slate-500">
                  {zone.label}
                </span>
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full ${zone.color}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-mono text-[10px] tabular-nums text-slate-300">
                  {Math.round(mins)}′
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {analysis.equipment.length > 0 ? (
          analysis.equipment.map((item) => (
            <span
              key={item.id}
              className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100"
            >
              {item.label}
              {' '}
              ·
              {item.sessions}
            </span>
          ))
        ) : (
          <span className="text-[10px] text-slate-500">
            Nessun tapis / cyclette riconosciuto nella finestra 7g
          </span>
        )}
      </div>

      <p className="m-0 text-[9px] leading-snug text-slate-600">
        Il dispendio odierno entra nel target calorico (TDEE) e nel bilancio globale.
      </p>
    </section>
  );
}
