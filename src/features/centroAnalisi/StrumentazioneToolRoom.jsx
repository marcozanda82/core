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
const VIEWPORT_CLASS = [
  'flex flex-col w-full flex-1 min-h-[550px]',
  '[&_.trend-tool-segmented]:hidden',
  '[&_.trend-unified-root]:flex [&_.trend-unified-root]:min-h-0 [&_.trend-unified-root]:flex-1',
  '[&_.trend-unified-root]:w-full [&_.trend-unified-root]:max-w-none',
  '[&_.trend-tool-stage]:flex [&_.trend-tool-stage]:min-h-0 [&_.trend-tool-stage]:flex-1',
  '[&_.trend-tool-stage]:w-full [&_.trend-tool-stage]:items-stretch [&_.trend-tool-stage]:justify-stretch',
  '[&_.trend-radar-panel]:flex [&_.trend-radar-panel]:min-h-0 [&_.trend-radar-panel]:flex-1',
  '[&_.trend-radar-panel]:w-full',
  '[&_.trend-radar-shell]:flex [&_.trend-radar-shell]:min-h-[20rem] [&_.trend-radar-shell]:flex-1',
  '[&_.trend-radar-shell]:w-full',
  '[&_.trend-bubble-radar]:flex [&_.trend-bubble-radar]:w-full [&_.trend-bubble-radar]:min-h-[20rem]',
  '[&_.trend-bubble-radar]:items-center [&_.trend-bubble-radar]:justify-center',
  /* Override critico: width:auto + height:100% → box 0×0 fuori da tab shell */
  '[&_.trend-bubble-radar__face]:!relative',
  '[&_.trend-bubble-radar__face]:!mx-auto',
  '[&_.trend-bubble-radar__face]:!aspect-square',
  '[&_.trend-bubble-radar__face]:!h-auto',
  '[&_.trend-bubble-radar__face]:!w-full',
  '[&_.trend-bubble-radar__face]:!max-w-[min(100%,20rem)]',
  '[&_.trend-bubble-radar__face]:!min-h-[16rem]',
  '[&_.trend-bubble-radar__svg]:!relative',
].join(' ');

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
  { tool: 'RADAR', roomId: 'radar', icon: '🕸️', label: 'Radar' },
  { tool: 'MAP', roomId: 'mappa', icon: '🗺️', label: 'Mappa' },
];

function ToolSwitchTabs({ activeTool, onSwitchRoom }) {
  if (typeof onSwitchRoom !== 'function') return null;

  return (
    <div
      role="tablist"
      aria-label="Strumento"
      className={`mb-2 flex w-full gap-1 rounded-2xl p-0.5 ${GLASS_SURFACE_CLASS}`}
    >
      {TOOL_TABS.map((tab) => {
        const selected = activeTool === tab.tool;
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
              'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 transition-all duration-150',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
              selected
                ? 'bg-white/15 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.28)]'
                : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100',
            ].join(' ')}
          >
            <span className="text-lg leading-none" aria-hidden>{tab.icon}</span>
            <span className={[
              'text-[0.6rem] font-semibold tracking-tight',
              selected ? 'text-cyan-200' : 'text-zinc-500',
            ].join(' ')}
            >
              {tab.label}
            </span>
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
export default function StrumentazioneToolRoom({ store, activeTool, label, onSwitchRoom = null }) {
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
      className="strumentazione-room w-full min-w-0"
      data-strumentazione-tool={activeTool}
      data-daily-history-days={dailyHistory?.length ?? 0}
      data-has-four-cylinder={Boolean(fourCylinder) ? '1' : '0'}
      data-has-active-log={Array.isArray(activeLog) && activeLog.length > 0 ? '1' : '0'}
      aria-label={label}
    >
      <ToolSwitchTabs activeTool={activeTool} onSwitchRoom={onSwitchRoom} />
      <div className={VIEWPORT_CLASS}>
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
