/**
 * Token visivi Kentu Timeline — allineati a TimelineNodi / index.css (barra grafici).
 * Usati dalla Vetrina (FastMealLogger) e riutilizzabili altrove.
 */
export const KENTU_TIMELINE = {
  strip: {
    heightPx: 55,
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    border: '1px solid #222',
  },
  axis: {
    heightPx: 2,
    background: 'rgba(255, 255, 255, 0.14)',
  },
  colors: {
    meal: '#00e5ff',
    mealBg: 'rgba(0,229,255,0.15)',
    mealBgMuted: 'rgba(0,0,0,0.6)',
    ghostBg: 'rgba(0,229,255,0.06)',
    ghostBgActive: 'rgba(0,229,255,0.14)',
    ghostBorder: 'rgba(0, 229, 255, 0.4)',
    ghostBorderActive: 'rgba(0, 229, 255, 0.78)',
    ghostGlow: '0 0 12px rgba(0,229,255,0.35)',
    mealGlow: '0 0 8px rgba(0,229,255,0.4)',
  },
  /** Nodi pasti già loggati (non in focus) — come importanceStyle in TimelineNodi */
  loggedNode: {
    opacity: 0.35,
    filter: 'grayscale(100%)',
    sizePx: 28,
    zIndex: 1,
  },
  /** Nodo fantasma pasto in editing */
  ghostNode: {
    opacity: 0.82,
    sizePx: 36,
    zIndex: 20,
    scale: 1.12,
  },
  timeLabel: {
    color: '#00e5ff',
    fontSize: '0.65rem',
  },
  ghostTimeLabel: {
    color: 'rgba(0,229,255,0.92)',
    fontSize: '0.68rem',
  },
  /** Label orarie sopra la barra (ergonomia mobile) */
  label: {
    gapPx: 8,
    sectionPaddingTopPx: 22,
  },
};

/** Posizione label oraria sopra il nodo, centrata sull'asse X del nodo. */
export function kentuTimelineLabelAboveStyle(leftPercent, nodeRadiusPx) {
  const gap = KENTU_TIMELINE.label.gapPx;
  return {
    left: `${leftPercent}%`,
    top: `calc(50% - ${nodeRadiusPx}px - ${gap}px)`,
    transform: 'translate(-50%, -100%)',
  };
}

export function kentuTimelineStripStyle(compact = false) {
  const h = compact ? 44 : KENTU_TIMELINE.strip.heightPx;
  return {
    position: 'relative',
    width: '100%',
    height: `${h}px`,
    background: KENTU_TIMELINE.strip.background,
    borderRadius: `${KENTU_TIMELINE.strip.borderRadius}px`,
    border: KENTU_TIMELINE.strip.border,
    overflow: 'visible',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
  };
}

export function kentuTimelineAxisStyle() {
  return {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: `${KENTU_TIMELINE.axis.heightPx}px`,
    marginTop: `${-KENTU_TIMELINE.axis.heightPx / 2}px`,
    background: KENTU_TIMELINE.axis.background,
    borderRadius: 1,
    pointerEvents: 'none',
  };
}
