import { useId } from 'react';
import { CalendarDays, ChevronRight, PersonStanding } from 'lucide-react';

function asMinutes(value) {
  const n = Math.round(Number(value) || 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * Piano di recupero verso il target settimanale (sessioni da ~20 min).
 * @param {number} remainingMinutes
 * @returns {string}
 */
export function buildCatchUpHint(remainingMinutes) {
  const remaining = asMinutes(remainingMinutes);
  if (remaining <= 0) return 'Target raggiunto';
  const sessions = Math.min(4, Math.max(1, Math.round(remaining / 20) || 1));
  const per = Math.max(1, Math.round(remaining / sessions));
  if (sessions === 1) return `≈ ${per} min in 1 sessione`;
  return `≈ ${per} min × ${sessions} sessioni`;
}

/**
 * Split intensità + conteggio sessioni dalla breakdown 7g.
 * Moderata = Z2 / camminate / LISS. Alta = Z3–Z5 / HIIT / corsa.
 * @param {object | null} breakdown
 * @returns {{ moderateMinutes: number, highMinutes: number, sessionCount: number }}
 */
export function splitCardioIntensity(breakdown) {
  const walking = Array.isArray(breakdown?.walking?.sessions) ? breakdown.walking.sessions : [];
  const structured = Array.isArray(breakdown?.structuredCardio?.sessions)
    ? breakdown.structuredCardio.sessions
    : [];

  let moderateMinutes = 0;
  let highMinutes = 0;

  for (const session of walking) {
    moderateMinutes += Number(session?.minutes) || 0;
  }
  for (const session of structured) {
    const zone = String(session?.intensity?.id || '').toLowerCase();
    if (zone === 'z4' || zone === 'z5' || zone === 'z3') {
      highMinutes += Number(session?.minutes) || 0;
    } else {
      moderateMinutes += Number(session?.minutes) || 0;
    }
  }

  if (moderateMinutes === 0 && highMinutes === 0) {
    moderateMinutes = Number(breakdown?.walking?.minutes) || 0;
    highMinutes = Number(breakdown?.structuredCardio?.minutes) || 0;
  }

  return {
    moderateMinutes: asMinutes(moderateMinutes),
    highMinutes: asMinutes(highMinutes),
    sessionCount: walking.length + structured.length,
  };
}

function CircularTargetMeter({ percent = 0, size = 76, compact = false }) {
  const uid = useId().replace(/:/g, '');
  const gradId = `cardio-ring-${uid}`;
  const glowId = `cardio-glow-${uid}`;
  const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const stroke = compact ? 7 : 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const center = size / 2;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="rgba(148,163,184,0.18)"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${Math.max(0, c - dash)}`}
          transform={`rotate(-90 ${center} ${center})`}
          filter={`url(#${glowId})`}
          style={{ transition: 'stroke-dasharray 0.7s ease' }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`font-bold tabular-nums text-white ${compact ? 'text-[15px]' : 'text-lg'}`}>
          {pct}%
        </span>
        <span className="mt-0.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          del target
        </span>
      </div>
    </div>
  );
}

function IntensityCell({ icon, value, label, tone }) {
  const toneClass = tone === 'moderate'
    ? 'text-emerald-400'
    : tone === 'high'
      ? 'text-orange-400'
      : 'text-sky-300';
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 px-1 py-2 text-center">
      <span className={toneClass} aria-hidden>{icon}</span>
      <span className="text-[13px] font-bold tabular-nums leading-none text-white">
        {value}
      </span>
      <span className="text-[9px] font-medium leading-tight text-slate-400">
        {label}
      </span>
    </div>
  );
}

/**
 * Widget glass «Monitoraggio Cardio» — cerchio %, barre, debito e split intensità.
 *
 * @param {{
 *   fillPercent?: number,
 *   accumulatedMinutes?: number,
 *   weeklyTargetMinutes?: number,
 *   remainingMinutes?: number,
 *   moderateMinutes?: number,
 *   highMinutes?: number,
 *   sessionCount?: number,
 *   compact?: boolean,
 *   className?: string,
 * }} props
 */
export default function CardioWidget({
  fillPercent = 0,
  accumulatedMinutes = 0,
  weeklyTargetMinutes = 150,
  remainingMinutes = 0,
  moderateMinutes = 0,
  highMinutes = 0,
  sessionCount = 0,
  compact = false,
  className = '',
} = {}) {
  const accumulated = asMinutes(accumulatedMinutes);
  const target = Math.max(1, asMinutes(weeklyTargetMinutes) || 150);
  const remaining = asMinutes(remainingMinutes);
  const pct = Math.max(0, Math.min(100, Math.round(Number(fillPercent) || (accumulated / target) * 100)));
  const targetHit = remaining <= 0;
  const catchUp = buildCatchUpHint(remaining);
  const ringSize = compact ? 64 : 78;

  return (
    <div
      className={[
        'w-full rounded-2xl border border-blue-900/30 bg-slate-900/50 shadow-[0_8px_32px_rgba(0,0,0,0.35)]',
        'backdrop-blur-md',
        compact ? 'px-2.5 py-2.5' : 'px-3 py-3',
        className,
      ].join(' ')}
    >
      <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'}`}>
        <CircularTargetMeter percent={pct} size={ringSize} compact={compact} />

        <div className="min-w-0 flex-1">
          <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Cardio (7g)
          </p>
          <p className="m-0 mt-0.5 flex flex-wrap items-baseline gap-x-1.5 leading-tight">
            <span className={`font-bold tabular-nums text-white ${compact ? 'text-lg' : 'text-xl'}`}>
              {accumulated} min
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              su {target} min settimanali
            </span>
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-950/80 ring-1 ring-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
              style={{
                width: `${pct}%`,
                boxShadow: pct > 0 ? '0 0 10px rgba(34,211,238,0.45)' : 'none',
                transition: 'width 0.7s ease',
              }}
            />
          </div>
        </div>

        <div
          className={[
            'relative flex min-w-[5.75rem] max-w-[38%] shrink-0 flex-col justify-center rounded-xl border px-2.5 py-2',
            targetHit
              ? 'border-emerald-500/25 bg-emerald-950/40'
              : 'border-white/10 bg-black/40',
          ].join(' ')}
        >
          <p className={`m-0 pr-3 text-[11px] font-semibold leading-tight ${targetHit ? 'text-emerald-200' : 'text-white'}`}>
            {targetHit ? 'Target raggiunto' : `${remaining} min al target`}
          </p>
          <p className="m-0 mt-0.5 pr-3 text-[9px] font-medium leading-snug text-slate-400">
            {catchUp}
          </p>
          <ChevronRight
            className="absolute right-1 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
            strokeWidth={2.25}
            aria-hidden
          />
        </div>
      </div>

      <div
        className={[
          'mt-2.5 grid grid-cols-3 divide-x divide-white/10 overflow-hidden rounded-xl',
          'border border-white/10 bg-white/[0.04]',
        ].join(' ')}
      >
        <IntensityCell
          tone="moderate"
          icon={<PersonStanding className="h-3.5 w-3.5" strokeWidth={2.25} />}
          value={`${asMinutes(moderateMinutes)} min`}
          label="intensità moderata"
        />
        <IntensityCell
          tone="high"
          icon={<PersonStanding className="h-3.5 w-3.5" strokeWidth={2.25} />}
          value={`${asMinutes(highMinutes)} min`}
          label="alta intensità"
        />
        <IntensityCell
          tone="sessions"
          icon={<CalendarDays className="h-3.5 w-3.5" strokeWidth={2.25} />}
          value={`${Math.max(0, Math.round(Number(sessionCount) || 0))} sessioni`}
          label="questa settimana"
        />
      </div>
    </div>
  );
}
