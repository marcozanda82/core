import React, { useId, useMemo } from 'react';
import { longevityToneFromScore } from '../trendHub/utils/longevityInsightGenerator';
import { GLASS_SURFACE_CLASS } from './glassStyles';

const LONGEVITY_TONE_STROKE = {
  good: '#34d399',
  mid: '#fbbf24',
  low: '#f87171',
  neutral: '#22d3ee',
};

const PROGRESSION_TONE_STROKE = {
  good: '#34d399',
  mid: '#fbbf24',
  low: '#f87171',
  neutral: '#a78bfa',
};

const PILLAR_BAR_COLORS = {
  good: '#34d399',
  mid: '#fbbf24',
  low: '#f87171',
};

const MACRO_COLORS = {
  prot: '#a855f7',
  carb: '#22d3ee',
  fat: '#f97316',
};

function toneFromScore(score, palette = PROGRESSION_TONE_STROKE) {
  const n = Number(score);
  if (!Number.isFinite(n)) return palette.neutral;
  if (n >= 75) return palette.good;
  if (n >= 50) return palette.mid;
  return palette.low;
}

function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function fillPct(consumed, target) {
  const c = Number(consumed);
  const t = Number(target);
  if (!Number.isFinite(c) || !Number.isFinite(t) || t <= 0) return 0;
  return clampPct((c / t) * 100);
}

function MicroScoreRing({ score, size = 56, strokeWidth = 5, strokeColor = '#22d3ee', fontSize = '0.875rem' }) {
  const uid = useId().replace(/:/g, '');
  const gradId = `ca-ring-${uid}`;
  const value = Number.isFinite(Number(score)) ? clampPct(Number(score)) : null;
  const pct = value ?? 0;
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const center = size / 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="1" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.75" />
          </linearGradient>
        </defs>
        <circle cx={center} cy={center} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={strokeWidth} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-bold tabular-nums text-zinc-50"
        style={{ fontSize }}
        aria-hidden
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

function MicroBarRow({ label, pct, color, shortLabel = null }) {
  const safePct = clampPct(pct);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <span className="w-3 shrink-0 text-[7px] font-bold uppercase text-slate-500" title={label}>
        {shortLabel || label.slice(0, 1)}
      </span>
      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-800/90">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${safePct}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-6 shrink-0 text-right text-[7px] font-semibold tabular-nums text-slate-400">
        {safePct}%
      </span>
    </div>
  );
}

function MicroPillarBars({ bars = [] }) {
  const list = Array.isArray(bars) ? bars.slice(0, 4) : [];
  if (list.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 opacity-50">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-1 rounded-full bg-slate-800/80" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
      {list.map((bar) => (
        <MicroBarRow
          key={bar.id}
          label={bar.label}
          pct={bar.pct}
          color={PILLAR_BAR_COLORS[bar.tone] || PILLAR_BAR_COLORS.mid}
          shortLabel={
            bar.id === 'nutrition' ? 'N'
              : bar.id === 'weights' ? 'F'
                : bar.id === 'cardio' ? 'C'
                  : bar.id === 'sleep' ? 'S'
                    : null
          }
        />
      ))}
    </div>
  );
}

function MicroMacroBars({ macros }) {
  const m = macros && typeof macros === 'object' ? macros : {};
  const rows = [
    { key: 'prot', label: 'P', pct: fillPct(m.prot, m.targetProt), color: MACRO_COLORS.prot },
    { key: 'carb', label: 'C', pct: fillPct(m.carb, m.targetCarb), color: MACRO_COLORS.carb },
    { key: 'fat', label: 'G', pct: fillPct(m.fat, m.targetFat), color: MACRO_COLORS.fat },
  ];
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
      {rows.map((row) => (
        <MicroBarRow key={row.key} label={row.label} shortLabel={row.label} pct={row.pct} color={row.color} />
      ))}
    </div>
  );
}

function MiniCompass({ x = 0, y = 0 }) {
  const px = 50 + (Number(x) || 0) * 20;
  const py = 50 - (Number(y) || 0) * 20;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <rect x="2" y="2" width="46" height="46" rx="4" fill="rgba(244,63,94,0.12)" />
      <rect x="52" y="2" width="46" height="46" rx="4" fill="rgba(52,211,153,0.1)" />
      <rect x="2" y="52" width="46" height="46" rx="4" fill="rgba(251,191,36,0.1)" />
      <rect x="52" y="52" width="46" height="46" rx="4" fill="rgba(34,211,238,0.1)" />
      <circle cx="50" cy="50" r="44" fill="rgba(15,23,42,0.92)" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <line x1="50" y1="8" x2="50" y2="92" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
      <line x1="8" y1="50" x2="92" y2="50" stroke="rgba(255,255,255,0.08)" strokeWidth="0.8" />
      <line x1="50" y1="50" x2={px} y2={py} stroke="#67e8f9" strokeWidth="1.2" strokeOpacity="0.85" />
      <circle cx={px} cy={py} r="4.5" fill="#22d3ee" stroke="#fff" strokeWidth="1" />
      <circle cx="50" cy="50" r="2" fill="rgba(148,163,184,0.6)" />
    </svg>
  );
}

function MiniRadar({ pillars }) {
  const p = pillars && typeof pillars === 'object' ? pillars : {};
  const cx = 50;
  const cy = 50;
  const maxR = 38;
  const axes = [
    { angle: -90, value: p.ipertrofia },
    { angle: 0, value: p.energia },
    { angle: 90, value: p.definizione },
    { angle: 180, value: p.longevita },
  ];
  const toPoint = (angleDeg, value) => {
    const rad = (angleDeg * Math.PI) / 180;
    const r = (clampPct(value) / 100) * maxR;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const rings = [0.33, 0.66, 1].map((f) => (
    <polygon
      key={f}
      points={axes.map(({ angle }) => {
        const rad = (angle * Math.PI) / 180;
        const r = maxR * f;
        return `${cx + r * Math.cos(rad)},${cy + r * Math.sin(rad)}`;
      }).join(' ')}
      fill="none"
      stroke="rgba(255,255,255,0.08)"
      strokeWidth="0.6"
    />
  ));
  const poly = axes.map(({ angle, value }) => toPoint(angle, value));
  const polyStr = poly.map((pt) => `${pt.x},${pt.y}`).join(' ');

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      {rings}
      {axes.map(({ angle }) => {
        const rad = (angle * Math.PI) / 180;
        const x2 = cx + maxR * Math.cos(rad);
        const y2 = cy + maxR * Math.sin(rad);
        return (
          <line key={angle} x1={cx} y1={cy} x2={x2} y2={y2} stroke="rgba(255,255,255,0.1)" strokeWidth="0.6" />
        );
      })}
      <polygon points={polyStr} fill="rgba(129,140,248,0.25)" stroke="#818cf8" strokeWidth="1.2" />
      {poly.map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r="2" fill="#a3e635" stroke="#fff" strokeWidth="0.6" />
      ))}
    </svg>
  );
}

function MiniMap({ x = 0, y = 0, zoneColor = '#22d3ee' }) {
  const px = 50 + (Number(x) || 0) * 22;
  const py = 50 - (Number(y) || 0) * 22;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <rect x="4" y="4" width="92" height="92" rx="6" fill="rgba(15,23,42,0.95)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      <line x1="4" y1="50" x2="96" y2="50" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
      <line x1="50" y1="4" x2="50" y2="96" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
      <text x="8" y="14" fontSize="6" fill="rgba(148,163,184,0.7)">+</text>
      <text x="82" y="14" fontSize="6" fill="rgba(148,163,184,0.7)">−</text>
      <circle cx={px} cy={py} r="6" fill={zoneColor} fillOpacity="0.35" stroke={zoneColor} strokeWidth="1.5" />
      <circle cx={px} cy={py} r="2.5" fill="#fff" />
    </svg>
  );
}

function buildCurvePath(points, key, width, height, yMax = 100) {
  if (!Array.isArray(points) || points.length < 2) return '';
  return points.map((p, i) => {
    const hour = Number(p.hour ?? i);
    const val = Number(p[key]);
    const x = (hour / 24) * width;
    const y = height - (clampPct(val) / yMax) * height;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

function MicroTimelineChart({ points = [], mealHours = [], gradientStops = [] }) {
  const uid = useId().replace(/:/g, '');
  const width = 280;
  const chartH = 36;
  const stripH = 8;
  const totalH = chartH + stripH + 4;

  const series = useMemo(() => {
    if (Array.isArray(points) && points.length >= 2) return points;
    return Array.from({ length: 25 }, (_, hour) => ({
      hour,
      snc: 55 + Math.sin(hour / 3.5) * 18,
      metabolic: 48 + Math.cos(hour / 4) * 15,
    }));
  }, [points]);

  const sncPath = buildCurvePath(series, 'snc', width, chartH);
  const metaPath = buildCurvePath(series, 'metabolic', width, chartH);
  const metaArea = metaPath
    ? `${metaPath} L${width},${chartH} L0,${chartH} Z`
    : '';

  const meals = (Array.isArray(mealHours) ? mealHours : [])
    .map(Number)
    .filter((h) => Number.isFinite(h) && h >= 0 && h <= 24);

  return (
    <svg
      viewBox={`0 0 ${width} ${totalH}`}
      className="h-full w-full max-w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <linearGradient id={`ca-meta-fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00e676" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#00e676" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`ca-phase-strip-${uid}`} x1="0" y1="0" x2="1" y2="0">
          {Array.isArray(gradientStops) && gradientStops.length > 0
            ? gradientStops.map((s, i) => (
              <stop
                key={i}
                offset={String(s.offset || `${i * 25}%`)}
                stopColor={s.color}
                stopOpacity="0.95"
              />
            ))
            : (
              <>
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="35%" stopColor="#22d3ee" />
                <stop offset="65%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#22c55e" />
              </>
            )}
        </linearGradient>
      </defs>

      <rect x="0" y="0" width={width} height={chartH} fill="rgba(15,23,42,0.5)" rx="4" />

      {metaArea ? (
        <path d={metaArea} fill={`url(#ca-meta-fill-${uid})`} stroke="none" />
      ) : null}
      {metaPath ? (
        <path d={metaPath} fill="none" stroke="#00e676" strokeWidth="1.5" strokeLinejoin="round" />
      ) : null}
      {sncPath ? (
        <path d={sncPath} fill="none" stroke="#00e5ff" strokeWidth="2" strokeLinejoin="round" />
      ) : null}

      <rect
        x="0"
        y={chartH + 4}
        width={width}
        height={stripH}
        rx="3"
        fill={`url(#ca-phase-strip-${uid})`}
        opacity="0.85"
      />
      {meals.map((hour, idx) => (
        <g key={`${hour}-${idx}`}>
          <line
            x1={(hour / 24) * width}
            y1={chartH + 4}
            x2={(hour / 24) * width}
            y2={chartH + 4 + stripH}
            stroke="#fff"
            strokeWidth="1.2"
            strokeOpacity="0.9"
          />
          <circle
            cx={(hour / 24) * width}
            cy={chartH + 4 + stripH / 2}
            r="2"
            fill="#fbbf24"
            stroke="#fff"
            strokeWidth="0.6"
          />
        </g>
      ))}

      <text x="4" y="8" fontSize="6" fill="rgba(0,229,255,0.85)">SNC</text>
      <text x="4" y="16" fontSize="6" fill="rgba(0,230,118,0.85)">Met</text>
    </svg>
  );
}

const LIVE_CARD_CLASS = [
  'group flex w-full flex-col items-stretch gap-2.5 rounded-2xl px-3.5 py-3.5 text-left text-zinc-100',
  GLASS_SURFACE_CLASS,
  'transition-all duration-200',
  'hover:border-cyan-400/30 hover:bg-white/[0.08]',
  'hover:shadow-[0_0_24px_rgba(34,211,238,0.12)]',
  'active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
].join(' ');

export function CentroAnalisiLiveCard({
  title,
  description,
  preview,
  wide = false,
  onClick,
  ariaLabel,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[LIVE_CARD_CLASS, wide ? 'col-span-2' : ''].filter(Boolean).join(' ')}
      aria-label={ariaLabel || title}
    >
      <div
        className={[
          'flex w-full max-w-full items-center justify-center overflow-hidden rounded-xl border border-white/5 bg-slate-950/40 px-2 py-2',
          wide ? 'min-h-[5.25rem]' : 'min-h-[4.5rem]',
        ].join(' ')}
      >
        {preview}
      </div>
      <div className="min-w-0">
        <p className="m-0 text-xs font-semibold leading-tight text-zinc-50 sm:text-sm">{title}</p>
        <p className="m-0 mt-1 text-[0.65rem] font-medium leading-snug text-zinc-400">{description}</p>
      </div>
    </button>
  );
}

/** Miniatura Pagella Salute: anello + 4 barre pilastri. */
export function LongevityLivePreview({ score, bars = [] }) {
  const tone = longevityToneFromScore(score);
  const stroke = LONGEVITY_TONE_STROKE[tone] || LONGEVITY_TONE_STROKE.neutral;
  return (
    <div className="flex w-full max-w-full items-center gap-2.5 px-0.5">
      <MicroScoreRing score={score} strokeColor={stroke} size={52} strokeWidth={4} fontSize="0.75rem" />
      <MicroPillarBars bars={bars} />
    </div>
  );
}

/** Miniatura Progressione: anello score + barre macro giornaliere. */
export function ProgressionLivePreview({ score, macros = null }) {
  const stroke = toneFromScore(score, PROGRESSION_TONE_STROKE);
  return (
    <div className="flex w-full max-w-full items-center gap-2.5 px-0.5">
      <MicroScoreRing score={score} strokeColor={stroke} size={50} strokeWidth={4} fontSize="0.75rem" />
      <MicroMacroBars macros={macros} />
    </div>
  );
}

/** Panoramica Strumentazione: Bussola · Radar · Mappa affiancati. */
export function StrumentazioneLivePreview({
  compassX = 0,
  compassY = 0,
  mapX = 0,
  mapY = 0,
  mapZoneColor = '#22d3ee',
  radarPillars = null,
}) {
  return (
    <div className="grid w-full max-w-full grid-cols-3 gap-1.5">
      <div className="aspect-square min-h-0 overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
        <MiniCompass x={compassX} y={compassY} />
      </div>
      <div className="aspect-square min-h-0 overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
        <MiniRadar pillars={radarPillars} />
      </div>
      <div className="aspect-square min-h-0 overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
        <MiniMap x={mapX} y={mapY} zoneColor={mapZoneColor} />
      </div>
    </div>
  );
}

/** Panoramica Timeline 24h: curve SNC + metabolica + striscia fasi + pasti. */
export function TimelineLivePreview({ timelinePoints = [], mealHours = [], gradientStops = [] }) {
  return (
    <div className="h-[5rem] w-full max-w-full overflow-hidden">
      <MicroTimelineChart
        points={timelinePoints}
        mealHours={mealHours}
        gradientStops={gradientStops}
      />
    </div>
  );
}
