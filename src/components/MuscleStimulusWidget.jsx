import { useMemo } from 'react';
import {
  clamp01,
  createDefaultFourCylinderState,
  inflateFlatLevelsToDecay,
  muscleDecaySum,
  MUSCLE_CYLINDER_DEFS,
  MUSCLE_CYLINDER_IDS,
} from '../features/salaComandi/engines/fourCylinderEngine';
import { buildFourCylinderTelemetrySeries } from '../features/salaComandi/utils/fourCylinderTelemetryHistory';
import { getTodayString } from '../coreEngine';

function getToneClasses(percent) {
  if (percent >= 75) return { bar: 'bg-cyan-500', border: 'border-cyan-500/40', text: 'text-cyan-400' };
  if (percent >= 40) return { bar: 'bg-yellow-500', border: 'border-yellow-500/40', text: 'text-yellow-400' };
  if (percent >= 25) return { bar: 'bg-orange-500', border: 'border-orange-500/40', text: 'text-orange-400' };
  if (percent > 0) return { bar: 'bg-red-500', border: 'border-red-500/40', text: 'text-red-400' };
  return { bar: 'bg-slate-600', border: 'border-slate-700/50', text: 'text-slate-400' };
}

/**
 * Normalizza un livello grezzo: accetta scala 0–1 oppure 0–100.
 * @param {unknown} raw
 * @returns {number | null} null se assente/non numerico (non confondere con 0 reale)
 */
function normalizeLevel(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n > 1) return clamp01(n / 100);
  return clamp01(n);
}

/**
 * Legge un cilindro da tutte le shape note (nested v2, flat decay_*, top-level).
 * @param {object} src
 * @param {string} id
 * @returns {number | null}
 */
function readCylinderLevel(src, id) {
  if (!src || typeof src !== 'object') return null;
  const decayObj = src.decay && typeof src.decay === 'object' ? src.decay : null;
  const muscleObj = src.muscleDecay && typeof src.muscleDecay === 'object' ? src.muscleDecay : null;
  const levelsObj = src.levels && typeof src.levels === 'object' ? src.levels : null;

  const candidates = [
    decayObj?.[id],
    decayObj?.[`decay_${id}`],
    src[`decay_${id}`],
    src[id],
    muscleObj?.[id],
    muscleObj?.[`decay_${id}`],
    levelsObj?.[id],
    levelsObj?.[`decay_${id}`],
  ];

  for (const candidate of candidates) {
    const v = normalizeLevel(candidate);
    if (v != null) return v;
  }
  return null;
}

/**
 * Costruisce { legs, chest, … } senza passare da sanitize (che azzera se .decay ha chiavi flat).
 * @param {object | null | undefined} fourCylinderProp
 * @returns {Record<string, number> | null}
 */
function mapFourCylinderPropToDecay(fourCylinderProp) {
  if (!fourCylinderProp || typeof fourCylinderProp !== 'object') return null;

  /** @type {Record<string, number>} */
  const mapped = {};
  let found = false;
  for (const id of MUSCLE_CYLINDER_IDS) {
    const v = readCylinderLevel(fourCylinderProp, id);
    if (v != null) {
      mapped[id] = v;
      found = true;
    } else {
      mapped[id] = 0;
    }
  }
  if (found && muscleDecaySum(mapped) > 0) return mapped;

  // Flat snapshot-style sull'oggetto root
  const fromRootFlat = inflateFlatLevelsToDecay(fourCylinderProp);
  if (muscleDecaySum(fromRootFlat) > 0) return fromRootFlat;

  // Flat keys dentro .decay (es. { decay: { decay_chest: 0.12 } })
  if (fourCylinderProp.decay && typeof fourCylinderProp.decay === 'object') {
    const fromNestedFlat = inflateFlatLevelsToDecay(fourCylinderProp.decay);
    if (muscleDecaySum(fromNestedFlat) > 0) return fromNestedFlat;
  }

  return found ? mapped : null;
}

/**
 * @param {object | null | undefined} fourCylinderProp
 * @param {object | null | undefined} fullHistory
 * @param {string} todayIso
 * @returns {Record<string, number>}
 */
function resolveLiveMuscleDecay(fourCylinderProp, fullHistory, todayIso) {
  const mapped = mapFourCylinderPropToDecay(fourCylinderProp);
  if (mapped && muscleDecaySum(mapped) > 0) return mapped;

  if (fullHistory && typeof fullHistory === 'object' && Object.keys(fullHistory).length > 0) {
    const series = buildFourCylinderTelemetrySeries(fullHistory, {
      daysBack: 14,
      endDate: todayIso,
      fourCylinder: fourCylinderProp,
    });
    const last = series[series.length - 1];
    if (last && muscleDecaySum(last) > 0) {
      return {
        legs: clamp01(last.legs),
        chest: clamp01(last.chest),
        back_shoulders: clamp01(last.back_shoulders),
        arms: clamp01(last.arms),
        core: clamp01(last.core),
      };
    }
  }

  return mapped || createDefaultFourCylinderState().decay;
}

/**
 * Widget Home: 5 barre da fourCylinder (dual-read nested + flat).
 *
 * @param {{
 *   fourCylinder?: object | null,
 *   fullHistory?: object | null,
 *   todayIso?: string,
 * }} props
 */
export default function MuscleStimulusWidget({
  fourCylinder: fourCylinderProp = null,
  fullHistory = null,
  todayIso = '',
} = {}) {
  const cylinders = useMemo(
    () => {
      const day = String(todayIso || getTodayString()).slice(0, 10);
      const decay = resolveLiveMuscleDecay(fourCylinderProp, fullHistory, day);
      return MUSCLE_CYLINDER_DEFS.map((cyl) => {
        // Lettura esplicita — niente `value || 0` sulla chiave sbagliata
        const level = normalizeLevel(decay?.[cyl.id]);
        const ratio = level == null ? 0 : level;
        return {
          ...cyl,
          percent: Math.round(ratio * 100),
        };
      });
    },
    [fourCylinderProp, fullHistory, todayIso],
  );

  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label="Sismografi muscolari">
      {cylinders.map((cyl) => {
        const tone = getToneClasses(cyl.percent);
        return (
          <div
            key={cyl.id}
            role="listitem"
            aria-label={`${cyl.label} ${cyl.percent} percento`}
            className={`flex items-center gap-2 rounded-xl border ${tone.border} bg-slate-900/80 px-2.5 py-2 shadow-lg backdrop-blur-sm`}
          >
            <span className={`w-[4.5rem] shrink-0 text-[10px] font-bold tracking-wider ${tone.text}`}>
              {cyl.shortLabel}
            </span>
            <div className="relative h-4 min-w-0 flex-1 overflow-hidden rounded bg-slate-950 ring-1 ring-white/10">
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
            <span className="w-8 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-200">
              {cyl.percent}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
