import { useMemo } from 'react';
import {
  clamp01,
  createDefaultFourCylinderState,
  fourCylinderFromPhysiologyModel,
} from '../features/salaComandi/engines/fourCylinderEngine';

/** Stesso catalogo cilindri di MetabolicDiagnostics (Trend → Diag). */
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
 * Classi identiche a MetabolicDiagnostics.jsx
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
      };
    case 'warning':
      return {
        border: 'border-orange-500/60',
        bg: 'bg-orange-950/30',
        bar: 'bg-gradient-to-r from-orange-600 to-amber-400',
        text: 'text-orange-200',
        glow: 'shadow-[0_0_18px_rgba(249,115,22,0.25)]',
      };
    case 'stable':
      return {
        border: 'border-slate-600/50',
        bg: 'bg-slate-900/50',
        bar: 'bg-gradient-to-r from-slate-500 to-slate-400',
        text: 'text-slate-300',
        glow: '',
      };
    default:
      return {
        border: 'border-emerald-500/45',
        bg: 'bg-emerald-950/25',
        bar: 'bg-gradient-to-r from-emerald-600 to-emerald-400',
        text: 'text-emerald-200',
        glow: 'shadow-[0_0_14px_rgba(52,211,153,0.2)]',
      };
  }
}

function formatPct(value) {
  return `${Math.round(clamp01(value) * 100)}%`;
}

/**
 * Widget compatto Home: clone visivo/logico dei sismografi Diag (4 cilindri).
 *
 * @param {{ fourCylinder?: object | null }} props
 */
export default function MuscleStimulusWidget({ fourCylinder: fourCylinderProp = null }) {
  const state = useMemo(() => {
    if (fourCylinderProp && typeof fourCylinderProp === 'object') {
      return fourCylinderFromPhysiologyModel({ fourCylinder: fourCylinderProp });
    }
    return createDefaultFourCylinderState();
  }, [fourCylinderProp]);

  const cylinders = useMemo(
    () => MUSCLE_CYLINDERS.map((cyl) => {
      const value = clamp01(state.decay?.[cyl.id]);
      return {
        ...cyl,
        value,
        level: muscleTriageLevel(value),
      };
    }),
    [state],
  );

  return (
    <div className="mt-2 w-full shrink-0 rounded-xl border border-cyan-500/35 bg-gradient-to-r from-cyan-950/70 via-slate-800/60 to-orange-950/50 px-3 py-2.5 shadow-lg shadow-cyan-900/20 backdrop-blur-sm">
      <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
        Stimolo muscolare
      </p>

      <div className="flex flex-col gap-1">
        {cylinders.map((cyl) => {
          const styles = muscleLevelClasses(cyl.level);
          return (
            <div
              key={cyl.id}
              className={[
                'rounded-lg border px-2 py-1',
                styles.border,
                styles.bg,
                styles.glow,
              ].join(' ')}
            >
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <span className={`truncate text-[10px] font-bold uppercase tracking-wide ${styles.text}`}>
                  {cyl.label}
                </span>
                <span className={`shrink-0 font-mono text-[10px] font-bold tabular-nums ${styles.text}`}>
                  {formatPct(cyl.value)}
                </span>
              </div>

              {/* Barra sismografo — stesse classi Diag, altezza compatta */}
              <div className="relative h-1.5 overflow-hidden rounded-md border border-white/5 bg-black/50">
                <div
                  className={`absolute inset-y-0 left-0 ${styles.bar} opacity-90 transition-all duration-500`}
                  style={{ width: `${Math.max(cyl.value * 100, 2)}%` }}
                />
                <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.04)_0px,rgba(255,255,255,0.04)_1px,transparent_1px,transparent_6px)]" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
