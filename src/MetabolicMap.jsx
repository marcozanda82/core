import React, { useMemo, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { sortBiometricsByTimeAsc } from './biometricHistory';
import {
  calculateBodyComposition,
  calculateDynamicTarget,
} from './features/salaComandi/engines/adaptiveTDEEEngine';

/** Fattore di scala: quanti punti SVG vale 1 Kg di differenza dal target. */
const KG_TO_SVG_SCALE = 2.5;

const DEFAULT_TARGET_FAT_KG = 15;
const DEFAULT_TARGET_LEAN_KG = 60;

const ROUTE_VOCABULARY = {
  longevity: {
    nw: 'STRESS SISTEMICO',
    ne: 'SOVRACCARICO',
    sw: 'FRAGILITÀ',
    se: 'SINDROME METABOLICA',
    center: 'EQUILIBRIO (LONGEVITÀ)',
  },
  performance: {
    nw: 'PICCO ATLETICO',
    ne: 'BULKING SPORCO',
    sw: 'DEALLENAMENTO',
    se: 'FUORI FORMA',
    center: 'TARGET STRUTTURALE',
  },
  definition: {
    nw: 'TIRAGGIO ESTREMO',
    ne: 'MASSA SPORCA',
    sw: 'CATABOLISMO',
    se: 'APPANNAMENTO',
    center: 'CONDIZIONE ESTETICA',
  },
};

/**
 * Converte i Kg reali in coordinate SVG (0-100), centrando il Target a (50,50).
 * SVG Y è invertito (cresce verso il basso), quindi sottraiamo per andare "su" (più muscolo).
 */
function mapKgToSvg(fatKg, leanKg, targetFatKg, targetLeanKg) {
  const dx = (fatKg - targetFatKg) * KG_TO_SVG_SCALE;
  const dy = (leanKg - targetLeanKg) * KG_TO_SVG_SCALE;
  return {
    cx: 50 + dx,
    cy: 50 - dy,
  };
}

function buildHistoricalWeighInsFromBodyMetrics(bodyMetricsHistory) {
  if (!Array.isArray(bodyMetricsHistory) || bodyMetricsHistory.length === 0) {
    return [];
  }

  const sorted = sortBiometricsByTimeAsc(bodyMetricsHistory);
  const out = [];

  for (const entry of sorted) {
    const weight = Number(entry?.weight);
    const bfRaw = entry?.bodyFat;
    if (!Number.isFinite(weight) || weight <= 0) continue;
    if (bfRaw == null || bfRaw === '') continue;
    const bodyFat = Number(bfRaw);
    if (!Number.isFinite(bodyFat) || bodyFat < 0) continue;

    const { fatMassKg, leanMassKg } = calculateBodyComposition(weight, bodyFat);
    if (fatMassKg <= 0 && leanMassKg <= 0) continue;

    out.push({
      fatMassKg,
      leanMassKg,
      weightKg: weight,
      bodyFatPct: bodyFat,
      date: entry?.date,
      id: entry?.id,
    });
  }

  return out;
}

/**
 * Mappa topografica cartesiana (Faro): asse X = massa grassa (kg), asse Y = massa magra (kg).
 * Centro = obiettivo compositivo. Storico pesate, ancora (ultima pesata), cometa (previsione).
 */
export default function MetabolicMap({
  targetFatKg,
  targetLeanKg,
  historicalWeighIns: historicalWeighInsProp,
  expectedFatDeltaKg = 0,
  expectedLeanDeltaKg = 0,
  bodyMetricsHistory = [],
  userGender = 'M',
  userHeightCm = 174,
  metabolicGoal,
  selectedRoute: selectedRouteProp,
}) {
  const [selectedPoint, setSelectedPoint] = useState(null);

  const selectedRoute = useMemo(() => {
    const normalizedGoal = String(metabolicGoal || '').toUpperCase();
    if (normalizedGoal === 'LONGEVITY') return 'longevity';
    if (normalizedGoal === 'PERFORMANCE') return 'performance';
    if (normalizedGoal === 'DEFINITION') return 'definition';
    if (typeof selectedRouteProp === 'string' && selectedRouteProp) return selectedRouteProp;
    return 'longevity';
  }, [metabolicGoal, selectedRouteProp]);

  const historicalWeighIns = useMemo(() => {
    if (Array.isArray(historicalWeighInsProp) && historicalWeighInsProp.length > 0) {
      return historicalWeighInsProp;
    }
    return buildHistoricalWeighInsFromBodyMetrics(bodyMetricsHistory);
  }, [historicalWeighInsProp, bodyMetricsHistory]);

  // Estrai i valori dinamici in base alla rotta selezionata
  const { targetFatKg: dynamicFatKg, targetLeanKg: dynamicLeanKg } = useMemo(() => {
    // Se il parent passa userGender o userHeight, usali. Altrimenti fallback statici.
    const genderResolved = typeof userGender === 'string' && userGender.trim() ? userGender : 'M';
    const heightResolved =
      Number.isFinite(Number(userHeightCm)) && Number(userHeightCm) > 0 ? Number(userHeightCm) : 174;
    return calculateDynamicTarget(genderResolved, heightResolved, selectedRoute);
  }, [selectedRoute, userGender, userHeightCm]);

  // Usa i target dinamici come centro della mappa (Faro),
  // ignorando temporaneamente i target passati dal parent.
  const activeTargetFat = dynamicFatKg;
  const activeTargetLean = dynamicLeanKg;

  const hasHistory = historicalWeighIns.length > 0;
  const currentPos = hasHistory
    ? historicalWeighIns[historicalWeighIns.length - 1]
    : { fatMassKg: activeTargetFat, leanMassKg: activeTargetLean };

  const targetSvg = { cx: 50, cy: 50 };

  const historicalPoints = useMemo(
    () =>
      historicalWeighIns.map((p, index) => ({
        ...mapKgToSvg(p.fatMassKg, p.leanMassKg, activeTargetFat, activeTargetLean),
        id: p?.id || `historical-point-${index}`,
        date: p?.date || null,
        weightKg: Number.isFinite(Number(p?.weightKg)) ? Number(p.weightKg) : null,
        bodyFatPct: Number.isFinite(Number(p?.bodyFatPct)) ? Number(p.bodyFatPct) : null,
      })),
    [historicalWeighIns, activeTargetFat, activeTargetLean],
  );

  const anchorSvg = mapKgToSvg(
    currentPos.fatMassKg,
    currentPos.leanMassKg,
    activeTargetFat,
    activeTargetLean,
  );

  const fatDelta = Number(expectedFatDeltaKg) || 0;
  const leanDelta = Number(expectedLeanDeltaKg) || 0;
  const predictedFatReal = currentPos.fatMassKg + fatDelta;
  const predictedLeanReal = currentPos.leanMassKg + leanDelta;
  const cometSvg = mapKgToSvg(
    predictedFatReal,
    predictedLeanReal,
    activeTargetFat,
    activeTargetLean,
  );
  const hasRealPrediction = fatDelta !== 0 || leanDelta !== 0;
  const dx_needle = cometSvg.cx - anchorSvg.cx;
  const dy_needle = cometSvg.cy - anchorSvg.cy;
  const distance_needle = Math.sqrt(dx_needle * dx_needle + dy_needle * dy_needle);
  const needleAngle = distance_needle > 0 ? (Math.atan2(dy_needle, dx_needle) * 180) / Math.PI : -90;
  const showCompassNeedle = hasRealPrediction && distance_needle > 0;

  const routeVocabulary = ROUTE_VOCABULARY[selectedRoute] || ROUTE_VOCABULARY.longevity;
  const selectedPointDateLabel = useMemo(() => {
    if (!selectedPoint?.date) return '—';
    const parsed = new Date(selectedPoint.date);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
  }, [selectedPoint]);

  return (
    <div
      className="overscroll-none touch-none"
      style={{
        width: '100%',
        maxWidth: 400,
        margin: '0 auto',
        position: 'relative',
        overscrollBehavior: 'none',
        touchAction: 'none',
      }}
    >
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={4}
        wheel={{ step: 0.1 }}
        pinch={{ step: 5 }}
        doubleClick={{ disabled: true }}
      >
        {({ zoomToElement, resetTransform, state: zoomState }) => (
          <div className="relative w-full h-full">
            <TransformComponent
              wrapperClass="w-full h-full cursor-grab active:cursor-grabbing overscroll-none touch-none"
              wrapperStyle={{ width: '100%', height: '100%', overscrollBehavior: 'none', touchAction: 'none' }}
              contentStyle={{ width: '100%' }}
            >
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="Mappa composizione corporea: massa grassa e massa magra rispetto all'obiettivo"
                style={{ width: '100%', background: '#12181f', borderRadius: 16 }}
                onClick={() => setSelectedPoint(null)}
              >
        {/* NW: Picco Atletico */}
        <rect x="0" y="0" width="50" height="50" fill="rgba(16, 185, 129, 0.05)" />
        {/* NE: Bulking Sporco */}
        <rect x="50" y="0" width="50" height="50" fill="rgba(245, 158, 11, 0.05)" />
        {/* SW: Sottopeso / deperimento */}
        <rect x="0" y="50" width="50" height="50" fill="rgba(156, 163, 175, 0.05)" />
        {/* SE: Palude sedentaria */}
        <rect x="50" y="50" width="50" height="50" fill="rgba(225, 29, 72, 0.05)" />

        <line
          x1="50"
          y1="0"
          x2="50"
          y2="100"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="0.5"
          strokeDasharray="2 2"
        />
        <line
          x1="0"
          y1="50"
          x2="100"
          y2="50"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="0.5"
          strokeDasharray="2 2"
        />

        {/* Etichette dei Quadranti (Camaleonte per rotta selezionata) */}
        <text x="5" y="10" fill="rgba(245, 158, 11, 0.4)" fontSize="4" fontWeight="bold">
          {routeVocabulary.nw}
        </text>
        <text
          x="95"
          y="10"
          fill="rgba(225, 29, 72, 0.4)"
          fontSize="4"
          fontWeight="bold"
          textAnchor="end"
        >
          {routeVocabulary.ne}
        </text>
        <text x="5" y="95" fill="rgba(156, 163, 175, 0.4)" fontSize="4" fontWeight="bold">
          {routeVocabulary.sw}
        </text>
        <text
          x="95"
          y="95"
          fill="rgba(225, 29, 72, 0.4)"
          fontSize="4"
          fontWeight="bold"
          textAnchor="end"
        >
          {routeVocabulary.se}
        </text>

        {/* Etichette degli Assi Cartesiani */}
        <text x="52" y="98" fill="rgba(255,255,255,0.5)" fontSize="3.5">
          Massa Grassa (kg) →
        </text>
        <text
          x="2"
          y="48"
          fill="rgba(255,255,255,0.5)"
          fontSize="3.5"
          transform="rotate(-90 2 48)"
        >
          Massa Magra (kg) →
        </text>

        <circle cx={targetSvg.cx} cy={targetSvg.cy} r="3" fill="#facc15" opacity="0.2" />
        <circle cx={targetSvg.cx} cy={targetSvg.cy} r="1" fill="#facc15" />
        <text x="50" y="46" textAnchor="middle" fill="rgba(250, 204, 21, 0.65)" fontSize="3.2" fontWeight="bold">
          {routeVocabulary.center}
        </text>

            {historicalPoints.map((point, i, arr) => {
              const minOpacity = 0.15;
              const maxOpacity = 1.0;
              const opacity =
                minOpacity + ((maxOpacity - minOpacity) * (i / (arr.length - 1 || 1)));
              const nextPoint = i < arr.length - 1 ? arr[i + 1] : null;
              return (
                <g key={point.id || i}>
                  {nextPoint && (
                    <line
                      x1={point.cx}
                      y1={point.cy}
                      x2={nextPoint.cx}
                      y2={nextPoint.cy}
                      stroke="rgba(148,163,184,0.9)"
                      strokeWidth="0.8"
                      strokeLinecap="round"
                      style={{
                        opacity,
                        transition: 'all 1.2s cubic-bezier(0.25, 1, 0.5, 1)',
                      }}
                    />
                  )}

                  <circle
                    cx={point.cx}
                    cy={point.cy}
                    r="0.95"
                    stroke="#cbd5e1"
                    strokeWidth="0.22"
                    fill={selectedPoint?.id === point.id ? '#ffffff' : '#64748b'}
                    style={{
                      fillOpacity: opacity,
                      strokeOpacity: opacity,
                      transition: 'all 1.2s cubic-bezier(0.25, 1, 0.5, 1)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.setAttribute('r', '1.2');
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.setAttribute('r', selectedPoint?.id === point.id ? '1.15' : '0.95');
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPoint(point);
                    }}
                  />
                </g>
              );
            })}

        {/* La Bussola del Presente (Ancora + Vettore Direzionale) */}
            {hasHistory && (
              <g
                id="kentu-anchor"
                pointerEvents="none"
                style={{
                  transform: `translate(${anchorSvg.cx}px, ${anchorSvg.cy}px)`,
                  transformOrigin: '0px 0px',
                  transition: 'transform 1.2s cubic-bezier(0.25, 1, 0.5, 1)',
                }}
              >
                <circle r="4" fill="#3b82f6" fillOpacity="0.4">
                  <animate attributeName="r" values="4; 6; 4" dur="2s" repeatCount="indefinite" />
                  <animate
                    attributeName="fill-opacity"
                    values="0.4; 0; 0.4"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>

                <circle r="4" fill="rgba(15, 23, 42, 0.9)" stroke="#3b82f6" strokeWidth="1" />

                {showCompassNeedle && (
                  <g
                    transform={`rotate(${needleAngle})`}
                    style={{
                      transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      transformOrigin: '0px 0px',
                    }}
                  >
                    <polygon points="-1.5,-1.2 3.5,0 -1.5,1.2" fill="#ef4444" />
                  </g>
                )}

                <circle r="1.2" fill="#94a3b8" />
                <circle r="0.5" fill="#f8fafc" />
              </g>
            )}

            {selectedPoint && (
              <foreignObject
                x={selectedPoint.cx - 12}
                y={selectedPoint.cy - 9}
                width="24"
                height="6"
                style={{ overflow: 'visible', pointerEvents: 'none' }}
                className="pointer-events-none"
              >
                <div
                  className="bg-slate-900/90 border border-slate-700 rounded px-1.5 py-1 flex items-center justify-center shadow-lg backdrop-blur-sm transition-transform duration-75"
                  style={{
                    transform: `scale(${0.2 / (zoomState?.scale || 1)})`,
                    transformOrigin: 'center bottom',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    background: 'rgba(15, 23, 42, 0.9)',
                    borderColor: 'rgba(71, 85, 105, 0.9)',
                  }}
                >
                  <span className="text-slate-300 text-[9px] font-mono tracking-wider uppercase">
                    {selectedPointDateLabel}
                  </span>
                </div>
              </foreignObject>
            )}
              </svg>
            </TransformComponent>

            {/* Controlli Spaziali Mappa */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-1 bg-slate-900/70 backdrop-blur-md border border-slate-700 p-1 rounded-lg z-10 shadow-xl">
              <button
                type="button"
                onClick={() =>
                  zoomToElement(
                    'kentu-anchor',
                    (zoomState?.scale || 1) + 0.5,
                    400,
                    'easeOutCubic',
                  )
                }
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
                title="Zoom In"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="M12 5v14" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() =>
                  zoomToElement(
                    'kentu-anchor',
                    Math.max(0.5, (zoomState?.scale || 1) - 0.5),
                    400,
                    'easeOutCubic',
                  )
                }
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700/50 rounded transition-colors"
                title="Zoom Out"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                </svg>
              </button>

              <div className="w-6 h-px bg-slate-700 mx-auto my-0.5" />

              <button
                type="button"
                onClick={() => resetTransform()}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-[#38bdf8] hover:bg-slate-700/50 rounded transition-colors"
                title="Ricentra Mappa"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                  <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </TransformWrapper>
    </div>
  );
}
