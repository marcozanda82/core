import { useMemo } from 'react';
import {
  clamp01,
  createDefaultFourCylinderState,
  fourCylinderFromPhysiologyModel,
} from '../features/salaComandi/engines/fourCylinderEngine';

const CYLINDERS = [
  { id: 'push', label: 'SPINTA' },
  { id: 'pull', label: 'TRAZ.' },
  { id: 'legs', label: 'GAMBE' },
];

function getToneClasses(percent) {
  if (percent >= 75) return { bar: 'bg-cyan-500', border: 'border-cyan-500/40', text: 'text-cyan-400' };
  if (percent >= 40) return { bar: 'bg-yellow-500', border: 'border-yellow-500/40', text: 'text-yellow-400' };
  if (percent >= 25) return { bar: 'bg-orange-500', border: 'border-orange-500/40', text: 'text-orange-400' };
  if (percent > 0) return { bar: 'bg-red-500', border: 'border-red-500/40', text: 'text-red-400' };
  return { bar: 'bg-slate-600', border: 'border-slate-700/50', text: 'text-slate-400' };
}

/**
 * Widget Home: 3 card affiancate con barre spesse a tacche (stile sismografo).
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
    () => CYLINDERS.map((cyl) => {
      const ratio = clamp01(state.decay?.[cyl.id]);
      return {
        ...cyl,
        percent: Math.round(ratio * 100),
      };
    }),
    [state],
  );

  return (
    <div className="grid grid-cols-3 gap-2">
      {cylinders.map((cyl) => {
        const tone = getToneClasses(cyl.percent);
        return (
          <div
            key={cyl.id}
            className={`flex flex-col justify-between rounded-xl border ${tone.border} bg-slate-900/80 p-2.5 shadow-lg backdrop-blur-sm`}
          >
            <div className="mb-2.5 flex items-center justify-between">
              <span className={`text-[10px] font-bold tracking-wider ${tone.text}`}>
                {cyl.label}
              </span>
              <span className="text-[11px] font-bold text-slate-200">
                {cyl.percent}%
              </span>
            </div>

            <div className="relative h-5 w-full overflow-hidden rounded bg-slate-950 ring-1 ring-white/10">
              <div
                className={`absolute left-0 top-0 h-full transition-all duration-1000 ease-out ${tone.bar}`}
                style={{ width: `${cyl.percent}%` }}
              />
              <div
                className="absolute inset-0 opacity-25 mix-blend-overlay"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(to right, transparent, transparent 3px, #000 3px, #000 4px)',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
