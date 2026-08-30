import React, { useMemo } from 'react';
import CardioProgressBar from '../../components/CardioProgressBar';
import TelemetryChart from '../../TelemetryChart';
import ProgressionScoreWidget from '../trendHub/components/ProgressionScoreWidget';
import { calculateProgressionScore } from '../trendHub/utils/saluteDashboardMetrics';
import {
  buildProgressionLogsWindow,
  LONGEVITY_WINDOW_DAYS,
  workoutDurationMinutes,
} from '../trendHub/utils/saluteHistorySeries';
import { collectRecentWorkoutLogs } from '../commandTerminal/context/kentuGlobalState';
import { buildFourCylinderTelemetrySeries } from '../salaComandi/utils/fourCylinderTelemetryHistory';
import { GLASS_SURFACE_CLASS } from './glassStyles';

function GlassSpinner({ label = 'Sincronizzo i dati di allenamento…' }) {
  return (
    <section
      className={`flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-busy
      aria-live="polite"
    >
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-lime-300"
        aria-hidden
      />
      <p className="text-sm text-zinc-400">{label}</p>
    </section>
  );
}

function GlassNotice({ title, body }) {
  return (
    <section
      className={`flex min-h-[14rem] flex-col items-center justify-center gap-2 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-live="polite"
    >
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-400">{body}</p>
    </section>
  );
}

function sessionTitle(entry) {
  const name = String(entry?.desc || entry?.name || entry?.activity || '').trim();
  if (name) return name;
  const kind = String(entry?.workoutType || entry?.subType || '').trim();
  return kind || 'Sessione';
}

function sessionKindLabel(entry) {
  const typeId = String(
    entry?.workoutType ?? entry?.subType ?? entry?.activityType ?? '',
  ).toLowerCase();
  if (['cardio', 'hiit', 'liss'].includes(typeId)) return 'Cardio';
  if (typeId === 'pesi' || typeId === 'workout' || typeId === '') return 'Pesi';
  return typeId;
}

function formatSessionDate(iso) {
  const raw = String(iso || '').slice(0, 10);
  const parts = raw.split('-');
  if (parts.length < 3) return raw || '—';
  return `${parts[2]}/${parts[1]}`;
}

/**
 * Stanza Allenamento — score sessioni, volume cardio e storico (sola lettura).
 * Non modifica SnapshotHub / Sala Comandi / trendHub.
 */
export default function AllenamentoRoom({ store }) {
  const {
    ready,
    isAuthenticated,
    fourCylinder,
    activeLog,
    fullHistory,
    userTargets,
    todayDate,
  } = store || {};

  const progressionResult = useMemo(() => {
    const logs = buildProgressionLogsWindow({
      fullHistory,
      todayDate,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog: activeLog,
    });
    return calculateProgressionScore(
      {
        days: logs.days,
        todayDate: logs.todayDate,
        sleepAvgHours: logs.sleepAvgHours,
        workoutSessionsTotal: logs.workoutSessionsTotal,
      },
      userTargets || {},
      {
        fourCylinder,
        fullHistory,
        activeLog,
        activeDate: todayDate,
      },
    );
  }, [fullHistory, todayDate, activeLog, userTargets, fourCylinder]);

  const recentSessions = useMemo(() => {
    const pools = collectRecentWorkoutLogs(
      fullHistory || {},
      Array.isArray(activeLog) ? activeLog : [],
      todayDate,
    );
    const all = Array.isArray(pools?.all) ? pools.all : [];
    return [...all].sort((a, b) => String(b.__dateKey || '').localeCompare(String(a.__dateKey || '')));
  }, [fullHistory, activeLog, todayDate]);

  const telemetrySeries = useMemo(
    () => buildFourCylinderTelemetrySeries(fullHistory, {
      daysBack: 14,
      endDate: todayDate,
      fourCylinder,
      todayLiveLog: Array.isArray(activeLog) ? activeLog : null,
    }),
    [fullHistory, todayDate, fourCylinder, activeLog],
  );

  if (!ready) {
    return <GlassSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <GlassNotice
        title="Dati non disponibili"
        body="Accedi da KentuOS per leggere sessioni, volume cardio e trend di carico in sola lettura."
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className={`flex flex-col items-center rounded-2xl px-3 py-5 ${GLASS_SURFACE_CLASS}`}>
        <ProgressionScoreWidget
          score={progressionResult.finalScore}
          breakdown={progressionResult.breakdown}
          size={188}
        />
      </div>

      <CardioProgressBar
        fullHistory={fullHistory}
        activeLog={activeLog}
        activeDate={todayDate}
      />

      <section
        className={`flex flex-col gap-2 rounded-2xl px-3 py-3 ${GLASS_SURFACE_CLASS}`}
        aria-label="Sessioni recenti"
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Sessioni · ultimi 7 giorni
        </p>
        {recentSessions.length === 0 ? (
          <p className="m-0 text-sm text-zinc-500">Nessuna sessione registrata nella finestra.</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {recentSessions.map((entry, index) => {
              const minutes = workoutDurationMinutes(entry);
              return (
                <li
                  key={entry.id || `${entry.__dateKey}:${index}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm font-semibold text-zinc-100">
                      {sessionTitle(entry)}
                    </p>
                    <p className="m-0 mt-0.5 text-[11px] text-zinc-500">
                      {formatSessionDate(entry.__dateKey)} · {sessionKindLabel(entry)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-cyan-200">
                    {minutes > 0 ? `${minutes} min` : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {telemetrySeries.length > 0 ? (
        <section
          className={`flex flex-col gap-2 rounded-2xl px-2 py-3 ${GLASS_SURFACE_CLASS}`}
          aria-label="Trend stimolo muscolare"
        >
          <p className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Trend carico muscolare · 14g
          </p>
          <TelemetryChart data={telemetrySeries} />
        </section>
      ) : null}
    </div>
  );
}
