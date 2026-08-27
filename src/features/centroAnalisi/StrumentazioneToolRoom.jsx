import React, { Suspense, lazy, useCallback, useMemo } from 'react';
import { GLASS_SURFACE_CLASS } from './glassStyles';
import { useStrumentazioneMapData } from './useStrumentazioneMapData';

const MetabolicUnifiedView = lazy(() => import('../../MetabolicUnifiedView'));

/**
 * Layout viewport — replica trend-tab-shell (Sala Comandi) + fix faccia radar.
 * MetabolicBubbleRadar NON usa Recharts: è SVG + framer-motion.
 * La telemetria legge mapData (pilastri); il bubble legge dailyHistory + mapData.fourCylinderStrategic
 * — entrambi già calcolati in useStrumentazioneMapData (fourCylinder/activeLog inclusi nel motore).
 *
 * Il face collassava perché index.css impone height:100% + width:auto + aspect-ratio senza larghezza risolta.
 */
const VIEWPORT_BASE = [
  'w-full min-w-0',
  '[&_.trend-tool-segmented]:hidden',
  '[&_.trend-sticky-controls]:!gap-1.5 [&_.trend-sticky-controls]:!p-2',
  '[&_.trend-timeframe-tablist]:!gap-0.5',
];

const VIEWPORT_COMPASS = [
  'flex flex-col w-full flex-1 min-h-0 pt-1',
  '[&_.trend-unified-root]:flex [&_.trend-unified-root]:min-h-0 [&_.trend-unified-root]:flex-1',
  '[&_.trend-unified-root]:w-full [&_.trend-unified-root]:max-w-none',
  '[&_.trend-unified-root]:!overflow-visible',
  '[&_.trend-tool-stage]:flex [&_.trend-tool-stage]:min-h-0 [&_.trend-tool-stage]:flex-1',
  '[&_.trend-tool-stage]:w-full [&_.trend-tool-stage]:items-stretch [&_.trend-tool-stage]:justify-start',
  '[&_.trend-tool-stage]:!overflow-visible [&_.trend-tool-stage]:!pt-2 [&_.trend-tool-stage]:!pb-3',
  '[&_.metabolic-compass-root]:!mt-1 [&_.metabolic-compass-root]:!overflow-visible',
  '[&_.metabolic-compass-bezel-wrap]:!overflow-visible [&_.metabolic-compass-bezel-wrap]:!px-3 [&_.metabolic-compass-bezel-wrap]:!pt-2',
  '[&_.metabolic-compass-interaction-surface]:!gap-4 [&_.metabolic-compass-interaction-surface]:!overflow-visible',
  '[&_.metabolic-compass-micro-suggestion]:!mt-3 [&_.metabolic-compass-ambient-debug]:!mt-2',
];

/** Colonna scrollabile: timeframe → telemetria → grafico (nessun overlap). */
const VIEWPORT_RADAR = [
  'flex flex-col gap-3 w-full max-w-md mx-auto',
];

const VIEWPORT_MAP = [
  'flex flex-col w-full flex-1 min-h-0 pt-1',
  '[&_.trend-unified-root]:flex [&_.trend-unified-root]:min-h-0 [&_.trend-unified-root]:flex-1',
  '[&_.trend-unified-root]:w-full [&_.trend-unified-root]:max-w-none',
  '[&_.trend-unified-root]:!overflow-visible',
  '[&_.trend-tool-stage]:flex [&_.trend-tool-stage]:min-h-0 [&_.trend-tool-stage]:flex-1',
  '[&_.trend-tool-stage]:w-full [&_.trend-tool-stage]:items-stretch',
  '[&_.trend-tool-stage]:!overflow-visible [&_.trend-tool-stage]:!pt-2 [&_.trend-tool-stage]:!pb-3',
];

function viewportClassForTool(activeTool) {
  const tool = String(activeTool || 'COMPASS').toUpperCase();
  if (tool === 'RADAR') return [...VIEWPORT_BASE, ...VIEWPORT_RADAR].join(' ');
  if (tool === 'MAP') return [...VIEWPORT_BASE, ...VIEWPORT_MAP].join(' ');
  return [...VIEWPORT_BASE, ...VIEWPORT_COMPASS].join(' ');
}

function GlassSpinner({ label = 'Sincronizzo strumentazione…' }) {
  return (
    <section
      className={`flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-busy
      aria-live="polite"
    >
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-sky-300"
        aria-hidden
      />
      <p className="text-sm text-zinc-400">{label}</p>
    </section>
  );
}

const TOOL_TABS = [
  { tool: 'COMPASS', roomId: 'bussola', icon: '🧭', label: 'Bussola' },
  { tool: 'RADAR', roomId: 'radar', icon: '📡', label: 'Radar' },
  { tool: 'MAP', roomId: 'mappa', icon: '🗺️', label: 'Mappa' },
];

export const STRUMENTAZIONE_ROOM_TO_TOOL = Object.freeze(
  Object.fromEntries(TOOL_TABS.map((t) => [t.roomId, t.tool])),
);

/** Pulsantiera cabina di pilotaggio — esportata per l'header di CentroAnalisiView. */
export function StrumentazioneToolTabs({ activeRoomId = 'bussola', onSwitchRoom }) {
  if (typeof onSwitchRoom !== 'function') return null;
  const active = String(activeRoomId || 'bussola').toLowerCase();

  return (
    <div
      role="tablist"
      aria-label="Strumenti cabina di pilotaggio"
      className={`flex w-full gap-1 rounded-2xl p-1 ${GLASS_SURFACE_CLASS}`}
    >
      {TOOL_TABS.map((tab) => {
        const selected = active === tab.roomId;
        return (
          <button
            key={tab.roomId}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={tab.label}
            title={tab.label}
            onClick={() => onSwitchRoom(tab.roomId)}
            className={[
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-[0.7rem] font-semibold transition-all duration-200',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
              selected
                ? 'border-cyan-500/40 bg-cyan-500/20 text-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.22)]'
                : 'border-transparent bg-transparent text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100',
            ].join(' ')}
          >
            <span className="text-base leading-none" aria-hidden>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function GlassNotice({ title, body }) {
  return (
    <section
      className={`flex min-h-[14rem] flex-col items-center justify-center gap-2 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-live="polite"
    >
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-400">{body}</p>
    </section>
  );
}

/**
 * Shell condivisa Bussola / Mappa / Radar — importa MetabolicUnifiedView in sola lettura.
 * Props allineate a SalaComandi.jsx (tab bussola): nessuna prop aggiuntiva esiste sull'API originale.
 */
export default function StrumentazioneToolRoom({
  store,
  activeTool,
  label,
  onSwitchRoom = null,
  /** Tab bar gestita dall'header Centro Analisi quando false. */
  showToolTabs = false,
  /** SSOT Longevità/Progressione per telemetria radar. */
  telemetryContext = null,
}) {
  const {
    ready,
    isAuthenticated,
    fullHistory,
    userTargets,
    bodyMetricsHistory,
    todayDate,
    activeLog,
    fourCylinder,
  } = store || {};

  const {
    dailyHistory,
    mapData,
    selectedTimeframe,
    setSelectedTimeframe,
  } = useStrumentazioneMapData(store);

  const handleToolRequestHandled = useCallback(() => {}, []);

  /** Stesso contratto di Sala Comandi — fourCylinder/activeLog alimentano mapData nel hook, non come prop dirette. */
  const unifiedProps = useMemo(
    () => ({
      mapData: mapData ?? {},
      dailyHistory,
      bodyMetricsHistory,
      compassScreenActive: true,
      fullHistory,
      userTargets,
      projectionAnchorDate: todayDate,
      selectedTimeframe,
      onTimeframeChange: setSelectedTimeframe,
      activeToolRequest: activeTool,
      onActiveToolRequestHandled: handleToolRequestHandled,
      telemetryContext,
      layoutVariant: 'strumentazione',
    }),
    [
      mapData,
      dailyHistory,
      bodyMetricsHistory,
      fullHistory,
      userTargets,
      todayDate,
      selectedTimeframe,
      setSelectedTimeframe,
      activeTool,
      handleToolRequestHandled,
      telemetryContext,
    ],
  );

  if (!ready) {
    return <GlassSpinner label={`Sincronizzo ${label}…`} />;
  }

  if (!isAuthenticated) {
    return (
      <GlassNotice
        title="Dati non disponibili"
        body="Accedi da KentuOS per leggere bussola, mappa e radar in sola lettura."
      />
    );
  }

  return (
    <div
      className="strumentazione-room w-full min-w-0 overflow-visible"
      data-strumentazione-tool={activeTool}
      data-daily-history-days={dailyHistory?.length ?? 0}
      data-has-four-cylinder={Boolean(fourCylinder) ? '1' : '0'}
      data-has-active-log={Array.isArray(activeLog) && activeLog.length > 0 ? '1' : '0'}
      aria-label={label}
    >
      {showToolTabs ? (
        <StrumentazioneToolTabs
          activeRoomId={TOOL_TABS.find((t) => t.tool === activeTool)?.roomId || 'bussola'}
          onSwitchRoom={onSwitchRoom}
        />
      ) : null}
      <div className={viewportClassForTool(activeTool)}>
        <Suspense fallback={<GlassSpinner label={`Carico ${label}…`} />}>
          <MetabolicUnifiedView
            key={activeTool}
            {...unifiedProps}
          />
        </Suspense>
      </div>
    </div>
  );
}
