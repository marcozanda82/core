import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  Circle,
  CircleDot,
  Clock,
  Flame,
  Leaf,
  Moon,
  Shield,
  Utensils,
  Zap,
} from 'lucide-react';

const SATIETY_MAP = {
  HIGH_SATIETY: {
    label: 'Alta sazietà',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  LOW_SATIETY: {
    label: 'Bassa sazietà',
    className: 'border-orange-500/25 bg-orange-500/10 text-orange-300',
  },
};

const NOVA_MAP = {
  1: { label: 'NOVA 1 · Naturale', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  2: { label: 'NOVA 2 · Lavorato', className: 'border-lime-500/25 bg-lime-500/10 text-lime-300' },
  3: { label: 'NOVA 3 · Processato', className: 'border-amber-500/30 bg-amber-500/10 text-amber-300' },
  4: { label: 'NOVA 4 · Ultra-processato', className: 'border-red-500/30 bg-red-500/10 text-red-300' },
};

const GLYCEMIC_MAP = {
  IG_LOW: { label: 'IG Basso', className: 'text-emerald-400' },
  IG_MED: { label: 'IG Medio', className: 'text-amber-400' },
  IG_HIGH: { label: 'IG Alto', className: 'text-red-400' },
};

const INFLAMMATION_MAP = {
  ANTI: { label: 'Antinfiammatorio', className: 'text-emerald-400', Icon: Shield },
  NEUTRAL: { label: 'Neutro', className: 'text-zinc-400', Icon: Shield },
  PRO: { label: 'Pro-infiammatorio', className: 'text-red-400', Icon: Flame },
};

const PROTEIN_MAP = {
  COMPLETE: { label: 'Proteine complete', className: 'text-emerald-400', Icon: Circle },
  INCOMPLETE: { label: 'Proteine incomplete', className: 'text-amber-400', Icon: CircleDot },
  NONE: { label: 'Proteine assenti', className: 'text-zinc-500', Icon: Circle },
};

const TIMING_MAP = {
  ANY: { label: 'Sempre adatto', className: 'text-zinc-300', Icon: Clock },
  PRE_WORKOUT: { label: 'Pre-workout', className: 'text-cyan-300', Icon: Zap },
  POST_WORKOUT: { label: 'Post-workout', className: 'text-sky-300', Icon: Zap },
  EVENING_CALM: { label: 'Serale · calmante', className: 'text-indigo-300', Icon: Moon },
};

const ALLERGEN_MAP = {
  GLUTEN: { label: 'Contiene glutine', className: 'border-red-500/30 bg-red-500/10 text-red-300' },
  LACTOSE: { label: 'Contiene lattosio', className: 'border-orange-500/30 bg-orange-500/10 text-orange-300' },
};

function hasSemanticContent(tags) {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return false;
  return Object.keys(tags).length > 0;
}

function GlanceBadge({ icon: Icon, label, className }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide',
        className,
      ].join(' ')}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
      {label}
    </span>
  );
}

function MatrixCell({ icon: Icon, title, label, toneClassName, iconMuted = false }) {
  return (
    <div className="flex min-h-[4.25rem] flex-col justify-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <Icon
          className={[
            'h-3.5 w-3.5 shrink-0',
            iconMuted ? 'text-zinc-600' : toneClassName,
          ].join(' ')}
          aria-hidden
        />
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-zinc-500">{title}</span>
      </div>
      <span className={`text-xs font-semibold leading-tight ${toneClassName}`}>{label}</span>
    </div>
  );
}

export default function FoodSemanticProfile({ tags = null }) {
  const profile = useMemo(() => {
    if (!hasSemanticContent(tags)) return null;

    const satiety = SATIETY_MAP[tags.satiety] ?? null;
    const novaGroup = Number(tags.novaGroup);
    const nova = Number.isFinite(novaGroup) ? NOVA_MAP[novaGroup] ?? null : null;

    const glycemic = GLYCEMIC_MAP[tags.glycemicIndex] ?? null;
    const inflammation = INFLAMMATION_MAP[tags.inflammation] ?? null;
    const protein = PROTEIN_MAP[tags.proteinQuality] ?? null;
    const timing = TIMING_MAP[tags.timing] ?? null;

    const showFodmapAlert = tags.fodmap === 'FODMAP_HIGH';
    const allergens = (Array.isArray(tags.allergens) ? tags.allergens : [])
      .map((key) => ALLERGEN_MAP[key] ?? { label: String(key), className: 'border-red-500/30 bg-red-500/10 text-red-300' });

    const showGlance = Boolean(satiety || nova);
    const showMatrix = Boolean(glycemic || inflammation || protein || timing);
    const showAlerts = showFodmapAlert || allergens.length > 0;

    if (!showGlance && !showMatrix && !showAlerts) return null;

    return {
      satiety,
      nova,
      glycemic,
      inflammation,
      protein,
      timing,
      showFodmapAlert,
      allergens,
      showGlance,
      showMatrix,
      showAlerts,
    };
  }, [tags]);

  if (!profile) return null;

  const {
    satiety,
    nova,
    glycemic,
    inflammation,
    protein,
    timing,
    showFodmapAlert,
    allergens,
    showGlance,
    showMatrix,
    showAlerts,
  } = profile;

  const InflammationIcon = inflammation?.Icon ?? Shield;
  const ProteinIcon = protein?.Icon ?? Circle;
  const TimingIcon = timing?.Icon ?? Clock;

  return (
    <section
      className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-md"
      aria-label="Profilo clinico alimento"
    >
      {showGlance ? (
        <div className="flex flex-wrap items-center gap-2">
          {satiety ? (
            <GlanceBadge icon={Utensils} label={satiety.label} className={satiety.className} />
          ) : null}
          {nova ? (
            <GlanceBadge icon={Leaf} label={nova.label} className={nova.className} />
          ) : null}
        </div>
      ) : null}

      {showMatrix ? (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-md">
          <MatrixCell
            icon={Activity}
            title="Glicemia"
            label={glycemic?.label ?? '—'}
            toneClassName={glycemic?.className ?? 'text-zinc-500'}
            iconMuted={!glycemic}
          />
          <MatrixCell
            icon={InflammationIcon}
            title="Infiammazione"
            label={inflammation?.label ?? '—'}
            toneClassName={inflammation?.className ?? 'text-zinc-500'}
            iconMuted={!inflammation}
          />
          <MatrixCell
            icon={ProteinIcon}
            title="Proteine"
            label={protein?.label ?? '—'}
            toneClassName={protein?.className ?? 'text-zinc-500'}
            iconMuted={!protein}
          />
          <MatrixCell
            icon={TimingIcon}
            title="Timing"
            label={timing?.label ?? '—'}
            toneClassName={timing?.className ?? 'text-zinc-500'}
            iconMuted={!timing}
          />
        </div>
      ) : null}

      {showAlerts ? (
        <div className="space-y-2">
          {showFodmapAlert ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
              <span>FODMAP elevati — possibile sensibilità intestinale</span>
            </div>
          ) : null}
          {allergens.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {allergens.map((allergen) => (
                <span
                  key={allergen.label}
                  className={[
                    'inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold',
                    allergen.className,
                  ].join(' ')}
                >
                  {allergen.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
