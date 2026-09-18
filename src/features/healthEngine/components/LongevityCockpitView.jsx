import {
  buildLongevityCockpitCards,
  longevityStatusLabel,
  longevityToneFromScore,
} from '../../trendHub/utils/longevityInsightGenerator';

const TONE_TEXT = {
  good: 'text-emerald-300',
  mid: 'text-amber-300',
  low: 'text-rose-400',
  neutral: 'text-cyan-300',
};

const TONE_GLOW = {
  good: 'drop-shadow-[0_0_18px_rgba(52,211,153,0.45)]',
  mid: 'drop-shadow-[0_0_18px_rgba(251,191,36,0.4)]',
  low: 'drop-shadow-[0_0_18px_rgba(251,113,133,0.4)]',
  neutral: 'drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]',
};

const BAR_FILL = {
  good: 'bg-emerald-400',
  mid: 'bg-amber-400',
  low: 'bg-rose-400',
  neutral: 'bg-cyan-400',
};

const CHIP_CLASS = {
  good: 'bg-emerald-500/15 text-emerald-300',
  mid: 'bg-amber-500/15 text-amber-300',
  low: 'bg-rose-500/15 text-rose-300',
  neutral: 'bg-white/10 text-zinc-300',
};

function PillarCard({
  icon,
  title,
  valueLabel,
  subtitle,
  chip = null,
  note = '',
  pct,
  tone = 'neutral',
  onClick = null,
}) {
  const clickable = typeof onClick === 'function';
  const fill = BAR_FILL[tone] || BAR_FILL.neutral;
  const width = Math.max(0, Math.min(100, Number(pct) || 0));
  const ariaParts = [title, valueLabel, subtitle, chip?.label, note].filter(Boolean);

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      className={[
        'flex w-full flex-col rounded-2xl border border-white/5 bg-zinc-900/50 py-2.5 px-3 text-left',
        'transition-all',
        clickable ? 'cursor-pointer active:scale-95' : 'cursor-default',
      ].join(' ')}
      aria-label={ariaParts.join(': ')}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
        {icon} {title}
      </span>
      <span className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
        {valueLabel}
      </span>
      {chip?.label ? (
        <span
          className={`mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CHIP_CLASS[chip.tone] || CHIP_CLASS.neutral}`}
        >
          {chip.label}
        </span>
      ) : null}
      {subtitle ? (
        <span className="mt-0.5 text-xs font-medium leading-snug text-zinc-500">
          {subtitle}
        </span>
      ) : null}
      {note ? (
        <span className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-400">
          {note}
        </span>
      ) : null}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${fill}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </button>
  );
}

/**
 * Vista di test isolata: punteggio Longevità + 4 card Cockpit (SSOT longevityResult).
 * Non modifica HealthCockpit né i suoi calcoli.
 */
export default function LongevityCockpitView({
  longevityResult = null,
  onOpenStimulusCockpit = null,
  onOpenMetabolicFocus = null,
} = {}) {
  const score = Number(longevityResult?.finalScore);
  const hasScore = Number.isFinite(score);
  const tone = longevityToneFromScore(hasScore ? score : null);
  const cards = buildLongevityCockpitCards(longevityResult);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Cockpit Longevità (preview)"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-2">
        <div className="mx-auto flex w-full max-w-md flex-col gap-5">
          <header className="text-center">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-zinc-500">
              Cockpit Longevità
            </p>
            <div
              className={`mt-3 text-[4.25rem] font-semibold leading-none tracking-tight ${TONE_TEXT[tone]} ${TONE_GLOW[tone]}`}
              aria-label={hasScore ? `Punteggio longevità ${Math.round(score)}` : 'Punteggio non disponibile'}
            >
              {hasScore ? Math.round(score) : '—'}
            </div>
            <p className="mt-2 px-4 text-sm font-medium leading-snug text-zinc-400">
              {longevityStatusLabel(hasScore ? score : null)}
            </p>
          </header>

          <div className="mb-4 mt-2 grid w-full grid-cols-2 gap-3">
            <PillarCard
              {...cards.activity}
              onClick={onOpenStimulusCockpit}
            />
            <PillarCard
              {...cards.metabolism}
              onClick={onOpenMetabolicFocus}
            />
            <PillarCard {...cards.nutrition} />
            <PillarCard {...cards.recovery} />
          </div>
        </div>
      </div>
    </section>
  );
}
