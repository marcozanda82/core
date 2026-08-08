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
import {
  hypertrophyTriageLabel,
  hypertrophyTriageTone,
  HYPERTROPHY_DECAY_HORIZON_DAYS,
  HYPERTROPHY_SESSION_BOOST,
  HYPERTROPHY_TRIAGE_STIMULATE_MAX,
  HYPERTROPHY_TRIAGE_RECOVERY_MAX,
} from '../utils/hypertrophyMath';

function getToneClasses(percent) {
  const tone = hypertrophyTriageTone(percent);
  if (tone === 'good') {
    return { bar: 'bg-emerald-400', border: 'border-emerald-500/40', text: 'text-emerald-400' };
  }
  if (tone === 'warning') {
    return { bar: 'bg-cyan-400', border: 'border-cyan-500/40', text: 'text-cyan-300' };
  }
  if (percent > 0) {
    return { bar: 'bg-amber-500', border: 'border-amber-500/40', text: 'text-amber-400' };
  }
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

  const fromRootFlat = inflateFlatLevelsToDecay(fourCylinderProp);
  if (muscleDecaySum(fromRootFlat) > 0) return fromRootFlat;

  if (fourCylinderProp.decay && typeof fourCylinderProp.decay === 'object') {
    const fromNestedFlat = inflateFlatLevelsToDecay(fourCylinderProp.decay);
    if (muscleDecaySum(fromNestedFlat) > 0) return fromNestedFlat;
  }

  return found ? mapped : null;
}

/**
 * SSOT: tip della serie telemetria (hypertrophyMath via buildFourCylinderTelemetrySeries).
 * @param {object | null | undefined} fourCylinderProp
 * @param {object | null | undefined} fullHistory
 * @param {string} todayIso
 * @returns {Record<string, number>}
 */
function resolveHypertrophyLevels01(fourCylinderProp, fullHistory, todayIso) {
  if (fullHistory && typeof fullHistory === 'object' && Object.keys(fullHistory).length > 0) {
    const series = buildFourCylinderTelemetrySeries(fullHistory, {
      daysBack: Math.max(14, HYPERTROPHY_DECAY_HORIZON_DAYS + 1),
      endDate: todayIso,
      fourCylinder: fourCylinderProp,
    });
    const last = series[series.length - 1];
    if (last) {
      return {
        legs: clamp01(last.legs),
        chest: clamp01(last.chest),
        back_shoulders: clamp01(last.back_shoulders),
        arms: clamp01(last.arms),
        core: clamp01(last.core),
      };
    }
  }

  const mapped = mapFourCylinderPropToDecay(fourCylinderProp);
  return mapped || createDefaultFourCylinderState().decay;
}

/**
 * @param {Array<{ id: string, label: string, shortLabel: string, percent: number }>} cylinders
 * @returns {{ percent: number, peakLabel: string }}
 */
function computeGlobalLoad(cylinders) {
  if (!cylinders.length) return { percent: 0, peakLabel: '—' };
  let peak = cylinders[0];
  for (const cyl of cylinders) {
    if (cyl.percent > peak.percent) peak = cyl;
  }
  return {
    percent: peak.percent,
    peakLabel: peak.shortLabel,
  };
}

function ProgressBarRow({
  label,
  percent,
  tone,
  ariaLabel,
  as: Comp = 'div',
  onClick,
  hint = null,
  triageLabel = null,
}) {
  const interactive = Comp === 'button' || typeof onClick === 'function';
  const sharedClass = `flex w-full items-center gap-2 rounded-xl border ${tone.border} bg-slate-900/80 px-2.5 py-2 shadow-lg backdrop-blur-sm text-left`;
  const totalPct = percent;
  const triage = triageLabel || hypertrophyTriageLabel(totalPct);

  return (
    <Comp
      type={Comp === 'button' ? 'button' : undefined}
      role={Comp === 'div' ? 'listitem' : undefined}
      aria-label={ariaLabel || `${label} ${totalPct} percento, ${triage}`}
      onClick={onClick}
      className={
        interactive
          ? `${sharedClass} cursor-pointer transition-transform outline-none active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-cyan-500/50`
          : sharedClass
      }
      style={interactive ? { WebkitTapHighlightColor: 'transparent' } : undefined}
    >
      <span className={`w-[4.5rem] shrink-0 text-[10px] font-bold tracking-wider ${tone.text}`}>
        {label}
      </span>
      <div className="relative h-4 min-w-0 flex-1 overflow-hidden rounded bg-slate-950 ring-1 ring-white/10">
        <div
          className={`absolute left-0 top-0 h-full transition-all duration-1000 ease-out ${tone.bar}`}
          style={{ width: `${totalPct}%` }}
        />
        <div
          className="absolute inset-0 opacity-25 mix-blend-overlay"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to right, transparent, transparent 3px, #000 3px, #000 4px)',
          }}
        />
      </div>
      <div className="flex w-[5.5rem] shrink-0 flex-col items-end leading-tight">
        <span className="text-[11px] font-bold tabular-nums text-slate-200">
          {totalPct}%
        </span>
        <span className={`max-w-full truncate text-[8px] font-semibold tracking-wide ${tone.text}`}>
          {triage}
        </span>
      </div>
      {hint ? (
        <span className="sr-only">{hint}</span>
      ) : null}
    </Comp>
  );
}

/**
 * Widget sismografi muscolari — Accumulo Dinamico (hypertrophyMath SSOT).
 *
 * - `compact` (Home): una barra = picco; tap → onOpenDetail (DIAG).
 * - `detailed`: 5 barre con triage DA STIMOLARE / IN RECUPERO / STIMOLO OTTIMALE.
 *
 * Scala: +65%/sessione, decadimento non-lineare 7gg, cap 100%.
 * @param {{
 *   fourCylinder?: object | null,
 *   fullHistory?: object | null,
 *   todayIso?: string,
 *   variant?: 'compact' | 'detailed',
 *   onOpenDetail?: (() => void) | null,
 * }} props
 */
export default function MuscleStimulusWidget({
  fourCylinder: fourCylinderProp = null,
  fullHistory = null,
  todayIso = '',
  variant = 'detailed',
  onOpenDetail = null,
} = {}) {
  const day = String(todayIso || getTodayString()).slice(0, 10);

  const cylinders = useMemo(() => {
    const levels = resolveHypertrophyLevels01(fourCylinderProp, fullHistory, day);
    return MUSCLE_CYLINDER_DEFS.map((cyl) => {
      const level = normalizeLevel(levels?.[cyl.id]);
      const ratio = level == null ? 0 : level;
      const percent = Math.round(ratio * 100);
      return {
        ...cyl,
        percent,
        sufficient: percent > HYPERTROPHY_TRIAGE_STIMULATE_MAX,
        optimal: percent > HYPERTROPHY_TRIAGE_RECOVERY_MAX,
        triageLabel: hypertrophyTriageLabel(percent),
      };
    });
  }, [fourCylinderProp, fullHistory, day]);

  const globalLoad = useMemo(() => computeGlobalLoad(cylinders), [cylinders]);

  if (variant === 'compact') {
    const tone = getToneClasses(globalLoad.percent);
    const clickable = typeof onOpenDetail === 'function';
    const fillPercent = globalLoad.percent;
    const ariaLabel = clickable
      ? `Carico muscolare globale ${fillPercent} percento, picco ${globalLoad.peakLabel}. Apri diagnostica.`
      : `Carico muscolare globale ${fillPercent} percento, picco ${globalLoad.peakLabel}`;

    return (
      <div
        className="w-full"
        aria-label={ariaLabel}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? onOpenDetail : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenDetail();
                }
              }
            : undefined
        }
      >
        <div
          className={[
            'rounded-xl border bg-slate-900/80 shadow-lg backdrop-blur-sm',
            tone.border,
            clickable
              ? [
                  'cursor-pointer transition-all duration-200',
                  'hover:border-amber-400/55 hover:bg-slate-900/95 hover:shadow-[0_0_20px_rgba(251,191,36,0.22)]',
                  'active:scale-[0.99]',
                ].join(' ')
              : '',
            'p-2.5',
          ].filter(Boolean).join(' ')}
          style={clickable ? { WebkitTapHighlightColor: 'transparent' } : undefined}
        >
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <span className={`text-[10px] font-bold tracking-wider ${tone.text}`}>
              ACCUMULO {HYPERTROPHY_DECAY_HORIZON_DAYS}GG
            </span>
            <span className="text-[11px] font-bold tabular-nums text-slate-200">
              {fillPercent}
              <span className="font-semibold text-slate-500">%</span>
            </span>
          </div>

          <div className="relative h-5 w-full overflow-hidden rounded bg-slate-950 ring-1 ring-white/10">
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-600 via-orange-500 to-yellow-400 transition-all duration-1000 ease-out"
              style={{
                width: `${fillPercent}%`,
                boxShadow:
                  fillPercent > 0
                    ? '0 0 14px rgba(251, 191, 36, 0.45), inset 0 1px 0 rgba(255,255,255,0.25)'
                    : 'none',
              }}
            />
            <div
              className="absolute inset-0 opacity-25 mix-blend-overlay"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(to right, transparent, transparent 3px, #000 3px, #000 4px)',
              }}
            />
          </div>

          <p className="mt-1.5 text-[9px] text-slate-600">
            Picco {globalLoad.peakLabel}
            {` · +${HYPERTROPHY_SESSION_BOOST}%/sessione · curva ${HYPERTROPHY_DECAY_HORIZON_DAYS}gg`}
            {clickable ? ' · tocca per i dettagli' : ''}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label="Sismografi muscolari">
      <p className="mb-0.5 px-0.5 text-[9px] text-slate-500">
        Accumulo dinamico · +{HYPERTROPHY_SESSION_BOOST}%/sessione · decadimento {HYPERTROPHY_DECAY_HORIZON_DAYS}gg
      </p>
      {cylinders.map((cyl) => {
        const tone = getToneClasses(cyl.percent);
        return (
          <ProgressBarRow
            key={cyl.id}
            label={cyl.shortLabel}
            percent={cyl.percent}
            tone={tone}
            triageLabel={cyl.triageLabel}
            ariaLabel={`${cyl.label} ${cyl.percent} percento, ${cyl.triageLabel}`}
          />
        );
      })}
    </div>
  );
}
