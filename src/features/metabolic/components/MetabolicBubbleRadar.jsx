import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { animate, motion, useMotionValue } from 'framer-motion';
import { convertToSvgCoords } from '../bubbleRadarCoords';
import { computeMacroTrendNodes, SNAKE_ORDER } from '../macroTrendNodes';

const TIMEFRAME_PROGRESS_FALLBACK = {
  '30d': 0,
  '14d': 0.33,
  '7d': 0.66,
  '1d': 1,
};

const COMET_SPRING = { type: 'spring', stiffness: 30, damping: 15, mass: 1.2 };

/**
 * Radar a bolla con Serpente dei Timeframe (30g → 14g → 7g → Ieri).
 * Binario fantasma invisibile + animazione spring lungo la curva (framer-motion).
 *
 * @param {{
 *   pillars?: {
 *     ipertrofia?: number,
 *     definizione?: number,
 *     longevita?: number,
 *     energia?: number,
 *   } | null,
 *   dailyHistory?: Array<Record<string, unknown>>,
 *   selectedTimeframe?: string,
 * }} props
 */
export default function MetabolicBubbleRadar({
  pillars,
  dailyHistory = [],
  selectedTimeframe = '1d',
}) {
  const ghostRailRef = useRef(null);
  const railLengthRef = useRef(0);
  const progressTargetsRef = useRef({ ...TIMEFRAME_PROGRESS_FALLBACK });

  const currentIndex = resolveTimeframeIndex(selectedTimeframe);
  const headKey = SNAKE_ORDER[currentIndex];

  const { nodes: macroNodes, svgRail } = useMemo(
    () => computeMacroTrendNodes(dailyHistory),
    [dailyHistory],
  );

  const fullPathD = useMemo(() => getSmoothPath(svgRail), [svgRail]);

  const railStartNode = macroNodes['30d'] || svgRail[0] || { svgX: 50, svgY: 50 };

  const progress = useMotionValue(0);
  const headX = useMotionValue(railStartNode.svgX);
  const headY = useMotionValue(railStartNode.svgY);

  useLayoutEffect(() => {
    const pathEl = ghostRailRef.current;
    if (!pathEl || !fullPathD) return;
    railLengthRef.current = pathEl.getTotalLength();
    progressTargetsRef.current = computeProgressTargetsOnPath(pathEl, svgRail);
    progress.set(progress.get());
  }, [fullPathD, svgRail, progress]);

  useEffect(() => {
    const pathEl = ghostRailRef.current;
    if (!pathEl || !fullPathD) return;

    const target =
      progressTargetsRef.current[headKey] ?? TIMEFRAME_PROGRESS_FALLBACK[headKey] ?? 0;
    const totalLength = pathEl.getTotalLength();
    if (totalLength <= 0) return;

    const syncHead = (value) => {
      const clamped = Math.max(0, Math.min(1, value));
      const point = pathEl.getPointAtLength(clamped * totalLength);
      headX.set(point.x);
      headY.set(point.y);
    };

    const controls = animate(progress, target, {
      ...COMET_SPRING,
      onUpdate: syncHead,
    });

    return () => controls.stop();
  }, [headKey, fullPathD, svgRail, progress, headX, headY]);

  return (
    <section aria-label="Radar metabolico a bolla" className="trend-bubble-radar">
      <div className="trend-bubble-radar__face">
        <EdgeLabel position="top" color="#f472b6">
          Ipertrofia
        </EdgeLabel>
        <EdgeLabel position="bottom" color="#22d3ee">
          Definizione
        </EdgeLabel>
        <EdgeLabel position="right" color="#a3e635">
          Energia
        </EdgeLabel>
        <EdgeLabel position="left" color="#818cf8">
          Longevità
        </EdgeLabel>

        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          className="trend-bubble-radar__svg"
        >
          <defs>
            <linearGradient id="comet-fade" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#818cf8" stopOpacity="0" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0.8" />
            </linearGradient>
            <filter id="bubble-head-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="1.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Reticolo di base */}
          <line x1="50" y1="0" x2="50" y2="100" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
          <line x1="0" y1="50" x2="100" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />

          {/* Binario Fantasma (Invisibile) */}
          <path ref={ghostRailRef} d={fullPathD} opacity={0} fill="none" />

          {/* Scia Animata (Cometa) */}
          <motion.path
            d={fullPathD}
            fill="none"
            stroke="url(#comet-fade)"
            strokeWidth="6"
            strokeLinecap="round"
            style={{ pathLength: progress, pathOffset: 0 }}
            filter="url(#bubble-head-glow)"
            opacity={0.6}
          />
          <motion.path
            d={fullPathD}
            fill="none"
            stroke="#818cf8"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ pathLength: progress, pathOffset: 0 }}
          />

          {/* La Ghigliottina: Render Nodi Fantasma (Solo Passato) */}
          {(() => {
            const rawTf = String(selectedTimeframe || '7d').toLowerCase();
            const safeTf = rawTf.includes('auto') ? '7d' : rawTf.replace('g', 'd');
            const SNAKE_ORDER = ['30d', '14d', '7d', '1d'];
            const ghostCurrentIndex = Math.max(0, SNAKE_ORDER.indexOf(safeTf));

            return SNAKE_ORDER.map((key, nodeIndex) => {
              if (nodeIndex >= ghostCurrentIndex) return null;

              const node = macroNodes?.[key];
              if (!node) return null;
              const { svgX, svgY } = convertToSvgCoords(node.x, node.y);

              return (
                <g key={`ghost-${key}`}>
                  <circle cx={svgX} cy={svgY} r="2.5" fill="rgba(129, 140, 248, 0.4)" />
                  <text x={svgX + 4} y={svgY + 2} fontSize="4" fill="rgba(255,255,255,0.3)">
                    {key.replace('d', 'gg')}
                  </text>
                </g>
              );
            });
          })()}

          {/* Testa della Cometa (Bolla Principale Animata) */}
          <motion.circle
            cx={headX}
            cy={headY}
            r="4"
            fill="#a3e635"
            filter="url(#bubble-head-glow)"
          />
          <motion.circle
            cx={headX}
            cy={headY}
            r="2"
            fill="#fff"
          />
        </svg>
      </div>
    </section>
  );
}

/**
 * Normalizza il timeframe UI/motore e restituisce l'indice su SNAKE_ORDER.
 *
 * @param {string} selectedTimeframe
 * @returns {number}
 */
function resolveTimeframeIndex(selectedTimeframe) {
  const rawTf = String(selectedTimeframe || '7d').toLowerCase();
  const safeTf = rawTf.includes('auto') ? '7d' : rawTf.replace('g', 'd');
  return Math.max(0, SNAKE_ORDER.indexOf(safeTf));
}

/**
 * Campiona il binario per allineare ogni nodo macro alla sua frazione di arco.
 *
 * @param {SVGPathElement} pathEl
 * @param {Array<{ key: string, svgX: number, svgY: number }>} railPoints
 * @returns {Record<string, number>}
 */
function computeProgressTargetsOnPath(pathEl, railPoints) {
  const totalLength = pathEl.getTotalLength();
  if (totalLength <= 0) return { ...TIMEFRAME_PROGRESS_FALLBACK };

  /** @type {Record<string, number>} */
  const targets = {};
  const samples = 240;

  for (const point of railPoints) {
    let bestT = 0;
    let bestDist = Infinity;

    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const sample = pathEl.getPointAtLength(t * totalLength);
      const dist = (sample.x - point.svgX) ** 2 + (sample.y - point.svgY) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestT = t;
      }
    }

    targets[point.key] = bestT;
  }

  return targets;
}

/**
 * Curva fluida Catmull-Rom → Bézier cubica attraverso i punti del serpente.
 *
 * @param {Array<{ svgX: number, svgY: number }>} points
 * @returns {string}
 */
export function getSmoothPath(points) {
  if (!Array.isArray(points) || points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0].svgX} ${points[0].svgY}`;
  }
  if (points.length === 2) {
    return `M ${points[0].svgX} ${points[0].svgY} L ${points[1].svgX} ${points[1].svgY}`;
  }

  const coords = points.map((p) => ({ x: p.svgX, y: p.svgY }));
  let d = `M ${coords[0].x} ${coords[0].y}`;

  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[i - 1] || coords[0];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || coords[coords.length - 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

/**
 * @param {{
 *   position: 'top' | 'bottom' | 'left' | 'right',
 *   color: string,
 *   children: React.ReactNode,
 * }} props
 */
function EdgeLabel({ position, color, children }) {
  const base = {
    position: 'absolute',
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color,
    textShadow: `0 0 8px ${color}66`,
    pointerEvents: 'none',
    zIndex: 2,
    whiteSpace: 'nowrap',
  };

  const pos =
    position === 'top'
      ? { top: 8, left: '50%', transform: 'translateX(-50%)' }
      : position === 'bottom'
        ? { bottom: 8, left: '50%', transform: 'translateX(-50%)' }
        : position === 'left'
          ? { left: 8, top: '50%', transform: 'translateY(-50%)' }
          : { right: 8, top: '50%', transform: 'translateY(-50%)' };

  return <span style={{ ...base, ...pos }}>{children}</span>;
}
