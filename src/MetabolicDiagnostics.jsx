import React, { useMemo, useState } from 'react';
import {
  clamp01,
  createDefaultFourCylinderState,
  fourCylinderFromPhysiologyModel,
} from './features/salaComandi/engines/fourCylinderEngine';
import { buildFourCylinderTelemetrySeries, getDaysSinceLastStimulus, getLastSleepSnapshot, formatInactivityDaysLabel, formatInactivitySuffix } from './features/salaComandi/utils/fourCylinderTelemetryHistory';
import { getTodayString } from './coreEngine';
import TelemetryChart from './TelemetryChart';

const SYSTEMIC_CRITICAL_THRESHOLD = 0.7;

/** @type {Array<{ id: 'push' | 'pull' | 'legs', label: string, subtitle: string }>} */
const MUSCLE_CYLINDERS = [
  { id: 'push', label: 'Spinta', subtitle: 'Petto · Spalle · Tricipiti' },
  { id: 'pull', label: 'Trazione', subtitle: 'Dorso · Bicipiti' },
  { id: 'legs', label: 'Gambe', subtitle: 'Lower · Core' },
];

/**
 * @param {number} value 0–1
 * @returns {'critical' | 'warning' | 'stable' | 'good'}
 */
function muscleTriageLevel(value) {
  const v = clamp01(value);
  if (v < 0.25) return 'critical';
  if (v < 0.5) return 'warning';
  if (v < 0.75) return 'stable';
  return 'good';
}

/**
 * @param {'critical' | 'warning' | 'stable' | 'good'} level
 */
function muscleLevelClasses(level) {
  switch (level) {
    case 'critical':
      return {
        border: 'border-red-500/70',
        bg: 'bg-red-950/40',
        bar: 'bg-gradient-to-r from-red-600 to-red-400',
        text: 'text-red-300',
        glow: 'shadow-[0_0_24px_rgba(239,68,68,0.35)]',
        badge: 'bg-red-500/20 text-red-200 border-red-500/40',
      };
    case 'warning':
      return {
        border: 'border-orange-500/60',
        bg: 'bg-orange-950/30',
        bar: 'bg-gradient-to-r from-orange-600 to-amber-400',
        text: 'text-orange-200',
        glow: 'shadow-[0_0_18px_rgba(249,115,22,0.25)]',
        badge: 'bg-orange-500/15 text-orange-100 border-orange-500/35',
      };
    case 'stable':
      return {
        border: 'border-slate-600/50',
        bg: 'bg-slate-900/50',
        bar: 'bg-gradient-to-r from-slate-500 to-slate-400',
        text: 'text-slate-300',
        glow: '',
        badge: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
      };
    default:
      return {
        border: 'border-emerald-500/45',
        bg: 'bg-emerald-950/25',
        bar: 'bg-gradient-to-r from-emerald-600 to-emerald-400',
        text: 'text-emerald-200',
        glow: 'shadow-[0_0_14px_rgba(52,211,153,0.2)]',
        badge: 'bg-emerald-500/15 text-emerald-100 border-emerald-500/35',
      };
  }
}

function formatPct(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

/**
 * Pagina diagnostica 4 cilindri — triage dinamico fatica sistemica + sismografi muscolari.
 *
 * @param {{ fourCylinder?: object | null, fullHistory?: object | null }} props
 */
export default function MetabolicDiagnostics({
  fourCylinder: fourCylinderProp = null,
  fullHistory = null,
}) {
  const [historyDays, setHistoryDays] = useState(30);
  const state = useMemo(() => {
    if (fourCylinderProp && typeof fourCylinderProp === 'object') {
      return fourCylinderFromPhysiologyModel({ fourCylinder: fourCylinderProp });
    }
    return createDefaultFourCylinderState();
  }, [fourCylinderProp]);

  const systemic = clamp01(state.systemic_fatigue);
  const isSystemicCritical = systemic >= SYSTEMIC_CRITICAL_THRESHOLD;

  const sortedMuscles = useMemo(() => {
    const todayIso = getTodayString();
    return MUSCLE_CYLINDERS.map((cyl) => {
      const value = clamp01(state.decay?.[cyl.id]);
      return {
        ...cyl,
        value,
        level: muscleTriageLevel(value),
        rank: value,
        daysSinceStimulus: getDaysSinceLastStimulus(fullHistory, cyl.id, { todayIso }),
      };
    }).sort((a, b) => a.rank - b.rank);
  }, [state.decay, fullHistory]);

  const telemetrySeries = useMemo(
    () => buildFourCylinderTelemetrySeries(fullHistory, {
      daysBack: historyDays,
      endDate: getTodayString(),
    }),
    [fullHistory, historyDays],
  );

  const lastSleep = useMemo(
    () => getLastSleepSnapshot(fullHistory, { todayIso: getTodayString() }),
    [fullHistory],
  );

  const sleepDebtCritical =
    !lastSleep.found
    || lastSleep.isPoorSleep
    || (lastSleep.daysSince != null && lastSleep.daysSince >= 1);
  const sleepRecoveryActive = lastSleep.found && lastSleep.optimizedRecovery && !sleepDebtCritical;

  const sleepDaysLabel = !lastSleep.found
    ? 'Nessun log · 7g'
    : lastSleep.daysSince === 0
      ? 'Ultimo log: oggi'
      : lastSleep.daysSince === 1
        ? 'Manca da 1 giorno'
        : `Manca da ${lastSleep.daysSince} giorni`;

  return (
    <div
      aria-label="Diagnostica 4 cilindri"
      className="absolute inset-0 overflow-y-auto pb-40 px-3 pt-2"
    >
      <header className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            KentuOS · Telemetria
          </p>
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">
            Diagnostica muscolare
          </h2>
        </div>
        <span className="rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[10px] text-slate-400">
          v{state.engineVersion ?? 1}
        </span>
      </header>

      {/* Fatica sistemica — triage in cima */}
      {isSystemicCritical ? (
        <div
          className={[
            'relative overflow-hidden rounded-xl border-2 border-red-500/80',
            'bg-gradient-to-br from-red-950/80 via-red-900/50 to-black/70',
            'px-4 py-5 animate-pulse',
            'shadow-[0_0_40px_rgba(220,38,38,0.45)]',
          ].join(' ')}
        >
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.03)_0px,rgba(255,255,255,0.03)_1px,transparent_1px,transparent_4px)]" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300/90">
            Allarme sistema
          </p>
          <p className="mt-1 text-lg font-bold uppercase tracking-wider text-red-100">
            Warning: Sovrallenamento
          </p>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-red-200/80">
            Fatica sistemica oltre la soglia operativa. Riduci volume e priorità il recupero.
          </p>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-red-300/70">Systemic load</p>
              <p className="font-mono text-4xl font-bold tabular-nums text-red-100">
                {formatPct(systemic)}
              </p>
            </div>
            <div className="h-3 flex-1 overflow-hidden rounded-full border border-red-500/40 bg-black/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-700 via-red-500 to-orange-400 transition-all duration-500"
                style={{ width: `${systemic * 100}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={[
                'inline-block h-2 w-2 shrink-0 rounded-full',
                systemic < 0.35 ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]' : 'bg-slate-500',
              ].join(' ')}
            />
            <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-300">
              Fatica sistemica
            </span>
          </div>
          <span
            className={[
              'shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[11px] tabular-nums',
              systemic < 0.35
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                : 'border-slate-600/50 bg-slate-800/60 text-slate-400',
            ].join(' ')}
          >
            {formatPct(systemic)}
          </span>
        </div>
      )}

      {/* Centralina recupero — 2° pilastro (Sonno) */}
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Centralina recupero · Sonno
        </p>
        <article
          className={[
            'relative overflow-hidden rounded-xl border-2 px-3 py-3 font-mono',
            sleepDebtCritical
              ? 'border-red-500/80 bg-gradient-to-br from-red-950/75 via-red-900/40 to-black/70 shadow-[0_0_28px_rgba(220,38,38,0.35)]'
              : sleepRecoveryActive
                ? 'border-emerald-700/55 bg-gradient-to-br from-emerald-950/40 via-slate-950/70 to-black/60'
                : 'border-slate-600/50 bg-slate-900/60',
          ].join(' ')}
        >
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.03)_0px,rgba(255,255,255,0.03)_1px,transparent_1px,transparent_4px)]" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className={[
                  'text-[11px] font-bold uppercase tracking-[0.14em]',
                  sleepDebtCritical
                    ? 'text-red-200'
                    : sleepRecoveryActive
                      ? 'text-emerald-200'
                      : 'text-slate-300',
                ].join(' ')}
              >
                {sleepDebtCritical
                  ? '⚠️ Debito di sonno critico'
                  : sleepRecoveryActive
                    ? '✓ Recupero attivo'
                    : '○ Recupero nominale'}
              </p>
              <p className="mt-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                Ultima notte · {lastSleep.date || '—'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[9px] uppercase tracking-widest text-slate-500">Ore</p>
              <p
                className={[
                  'text-2xl font-bold tabular-nums',
                  sleepDebtCritical ? 'text-red-100' : sleepRecoveryActive ? 'text-emerald-100' : 'text-slate-100',
                ].join(' ')}
              >
                {lastSleep.found ? lastSleep.hours.toFixed(1) : '—'}
                <span className="ml-0.5 text-xs font-normal text-slate-500">h</span>
              </p>
            </div>
          </div>
          <div className="relative mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-2 text-[10px]">
            <span className={sleepDebtCritical ? 'text-red-300/90' : 'text-slate-400'}>
              {sleepDaysLabel}
            </span>
            <span className="tabular-nums text-slate-500">
              EFF {lastSleep.found ? formatPct(lastSleep.efficiency) : '—'}
              {lastSleep.found && lastSleep.recoverySystemic > 0
                ? ` · ΔSYS ${formatPct(lastSleep.recoverySystemic)}`
                : ''}
            </span>
          </div>
        </article>
      </div>

      {/* Sismografi muscolari — ordinati dal più critico (≈0) al più ok (≈1) */}
      <div className="mt-3 flex flex-col gap-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Sismografi muscolari · triage
        </p>

        {sortedMuscles.map((cyl, index) => {
          const styles = muscleLevelClasses(cyl.level);
          const isTopPriority = index === 0 && cyl.value < 0.75;

          return (
            <article
              key={cyl.id}
              className={[
                'rounded-xl border px-3 py-3 transition-all duration-300',
                styles.border,
                styles.bg,
                styles.glow,
                isTopPriority ? 'scale-[1.01]' : '',
              ].join(' ')}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-slate-500">#{index + 1}</span>
                    <h3 className={`text-sm font-bold uppercase tracking-wide ${styles.text}`}>
                      {cyl.label}
                    </h3>
                    {isTopPriority ? (
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${styles.badge}`}>
                        Priorità
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">{cyl.subtitle}</p>
                  {cyl.value < 0.25 ? (
                    <p className="mt-1.5">
                      <span className="font-mono text-xs tracking-wider text-red-500">
                        ⚠️ FERMO DA {formatInactivityDaysLabel(cyl.daysSinceStimulus)}{' '}
                        {formatInactivitySuffix(cyl.daysSinceStimulus)}
                      </span>
                    </p>
                  ) : null}
                </div>
                <span className={`font-mono text-lg font-bold tabular-nums ${styles.text}`}>
                  {formatPct(cyl.value)}
                </span>
              </div>

              {/* Barra sismografo */}
              <div className="relative h-8 overflow-hidden rounded-md border border-white/5 bg-black/50">
                <div
                  className={`absolute inset-y-0 left-0 ${styles.bar} opacity-90 transition-all duration-500`}
                  style={{ width: `${Math.max(cyl.value * 100, 2)}%` }}
                />
                <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.04)_0px,rgba(255,255,255,0.04)_1px,transparent_1px,transparent_6px)]" />
                {/* Tick marks */}
                <div className="pointer-events-none absolute inset-0 flex justify-between px-1">
                  {[0, 25, 50, 75, 100].map((tick) => (
                    <span
                      key={tick}
                      className="w-px self-stretch bg-white/10"
                      style={{ marginLeft: tick === 0 ? 0 : undefined }}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-1.5 flex justify-between text-[9px] uppercase tracking-wider text-slate-600">
                <span>0 · Atrofia</span>
                <span>1 · Stimolo max</span>
              </div>
            </article>
          );
        })}
      </div>

      {/* Storico impilato — cursore sincronizzato Recharts */}
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Archivio telemetria
          </p>
          <div className="flex rounded-md border border-white/10 bg-black/40 p-0.5">
            {[14, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setHistoryDays(days)}
                className={[
                  'rounded px-2 py-0.5 font-mono text-[10px] transition-colors',
                  historyDays === days
                    ? 'bg-white/10 text-slate-100'
                    : 'text-slate-500 hover:text-slate-300',
                ].join(' ')}
              >
                {days}g
              </button>
            ))}
          </div>
        </div>
        <TelemetryChart data={telemetrySeries} />
      </div>

      <footer className="mt-1 rounded-lg border border-dashed border-white/10 bg-black/30 px-3 py-2">
        <p className="text-[10px] leading-relaxed text-slate-500">
          Ultimo processamento:{' '}
          <span className="font-mono text-slate-400">{state.lastProcessedDate || '—'}</span>
          {' · '}
          Decadimento virtuale applicato a mezzanotte locale.
        </p>
      </footer>
    </div>
  );
}
