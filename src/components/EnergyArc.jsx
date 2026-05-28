import React, { useId, useMemo } from 'react';
import {
  METABOLIC_PHASE_LEGEND,
  resolveMetabolicPhaseId,
} from '../features/salaComandi/utils/metabolicPhaseColors';

function resolveMetabolicPhaseIcon(hoursFasted) {
  const phaseId = resolveMetabolicPhaseId(hoursFasted);
  const entry = METABOLIC_PHASE_LEGEND.find((phase) => phase.id === phaseId);
  return entry?.icon ?? METABOLIC_PHASE_LEGEND[0].icon;
}

/** Arco semicircolare Body Battery — look neon sottile; icona fase metabolica al centro. */
export default function EnergyArc({
  percentage,
  size = 'small',
  hasNapBoost = false,
  showText = true,
  textMode = 'percent',
  accentColor = '#22d3ee',
  hoursFasted,
  metabolicIcon,
}) {
  const arcColor = String(accentColor || '#22d3ee').trim() || '#22d3ee';
  const filterUid = useId().replace(/:/g, '');
  const energyVal = Number(percentage);
  const arcP = Math.min(100, Math.max(0, Number.isFinite(energyVal) ? energyVal : 0));
  const large = size === 'large';
  const w = large ? 200 : 52;
  const h = large ? 118 : 38;
  const r = large ? 82 : 21;
  const sw = large ? 5 : 2.25;
  const cx = w / 2;
  const cy = h - (large ? 10 : 7);
  const x1 = cx - r;
  const x2 = cx + r;
  const arcLen = Math.PI * r;
  const dashOffset = arcLen * (1 - arcP / 100);
  const gid = `${large ? 'eaL' : 'eaS'}_${filterUid}`;
  const pctRounded = Math.round(Number.isFinite(energyVal) ? energyVal : 0);
  const phaseIcon = useMemo(() => {
    if (metabolicIcon) return metabolicIcon;
    if (hoursFasted != null && hoursFasted !== '') {
      return resolveMetabolicPhaseIcon(hoursFasted);
    }
    return null;
  }, [metabolicIcon, hoursFasted]);

  const centerLabel =
    showText && textMode === 'energy'
      ? `Energia ${pctRounded}%`
      : showText
        ? `${pctRounded}%`
        : null;

  const overlayPadBottom = large ? 14 : 7;
  const iconMarginTop = large ? -22 : -11;
  const iconMarginBottom = large ? 6 : 3;
  const iconFontSize = large ? '1.875rem' : '0.95rem';
  const labelFontSize = large ? '1.35rem' : '10px';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: large ? 8 : 4 }}>
        <div style={{ position: 'relative', width: w, height: h }}>
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
          <defs>
            <filter id={gid} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation={large ? 3.2 : 1.4} result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d={`M ${x1} ${cy} A ${r} ${r} 0 0 1 ${x2} ${cy}`}
            fill="none"
            stroke="#27272a"
            strokeWidth={sw + 1}
            strokeLinecap="round"
            opacity={0.95}
          />
          <path
            d={`M ${x1} ${cy} A ${r} ${r} 0 0 1 ${x2} ${cy}`}
            fill="none"
            stroke={arcColor}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={arcLen}
            strokeDashoffset={dashOffset}
            style={{
              transition: 'stroke-dashoffset 0.55s ease-out, stroke 0.45s ease-out',
              filter: `url(#${gid})`,
            }}
          />
          </svg>

          {(phaseIcon || centerLabel) ? (
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                pointerEvents: 'none',
                paddingBottom: overlayPadBottom,
                boxSizing: 'border-box',
              }}
            >
              {phaseIcon ? (
                <span
                  aria-hidden
                  title="Fase metabolica attuale"
                  style={{
                    display: 'block',
                    flexShrink: 0,
                    fontSize: iconFontSize,
                    lineHeight: 1,
                    marginTop: iconMarginTop,
                    marginBottom: iconMarginBottom,
                    filter: `drop-shadow(0 0 6px ${arcColor}aa) drop-shadow(0 1px 2px rgba(0,0,0,0.85))`,
                  }}
                >
                  {phaseIcon}
                </span>
              ) : null}
              {centerLabel ? (
                <span
                  style={{
                    display: 'block',
                    flexShrink: 0,
                    fontSize: labelFontSize,
                    fontWeight: 800,
                    color: '#ecfdf5',
                    letterSpacing: large ? '0.06em' : '-0.03em',
                    textShadow: `0 0 10px ${arcColor}73`,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {centerLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {hasNapBoost ? (
          <span
            style={{
              fontSize: large ? '1.75rem' : '0.85rem',
              lineHeight: 1,
              filter: 'drop-shadow(0 0 6px rgba(34,211,238,0.85))',
              color: '#22d3ee',
              marginBottom: large ? 18 : 4,
            }}
            title="Boost sonnellino"
            aria-hidden
          >
            💤
          </span>
        ) : null}
      </div>
    </div>
  );
}
