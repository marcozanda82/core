import React, { lazy, Suspense, useCallback, useState } from 'react';
import { useHealthSystemState } from '../hooks/useHealthSystemState.js';
import HealthCockpit from './HealthCockpit.jsx';
import PillarInsightOverlay from './PillarInsightOverlay.jsx';
import KentuLazySectionFallback from '../../../components/KentuLazySectionFallback.jsx';

const HealthCockpitLabOverlay = lazy(() => import('./HealthCockpitLabOverlay.jsx'));

const EVIDENCE_TOOL_BY_PILLAR = {
  recovery: 'TIMELINE',
  metabolism: 'TIMELINE',
  nutrition: 'AUTOPILOTA',
  activity: 'STRUMENTI_LEGACY',
};

/**
 * Schermo connesso: riceve i dati Sala Comandi e li passa all'hook, senza logica fisiologica.
 */
export default function HealthCockpitScreen({
  dateStr = '',
  onNavigatePrevDay = null,
  onNavigateNextDay = null,
  onOpenTimeline = null,
  calibrazioneHandlers = null,
  ...engineProps
} = {}) {
  const { healthState, isReady, isLoading } = useHealthSystemState(engineProps);
  const [labTool, setLabTool] = useState(null);
  const [selectedPillarId, setSelectedPillarId] = useState(null);
  
  const todayStr = new Date().toISOString().slice(0, 10);

  const handleOpenLabTool = useCallback((toolId) => {
    const id = String(toolId || '').toUpperCase();
    if (id === 'TIMELINE') {
      onOpenTimeline?.();
      return;
    }
    setLabTool(id);
  }, [onOpenTimeline]);

  const handleOpenEvidence = useCallback((pillarId) => {
    setSelectedPillarId(null);
    const tool = EVIDENCE_TOOL_BY_PILLAR[pillarId] || 'TIMELINE';
    handleOpenLabTool(tool);
  }, [handleOpenLabTool]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <HealthCockpit
        healthState={healthState}
        isReady={isReady}
        isLoading={isLoading}
        dateStr={dateStr}
        todayStr={todayStr}
        onNavigatePrevDay={onNavigatePrevDay}
        onNavigateNextDay={onNavigateNextDay}
        onOpenLabTool={handleOpenLabTool}
        onOpenPillarAnalysis={setSelectedPillarId}
      />
      {selectedPillarId ? (
        <PillarInsightOverlay
          pillarId={selectedPillarId}
          healthState={healthState}
          onClose={() => setSelectedPillarId(null)}
          onOpenEvidence={handleOpenEvidence}
        />
      ) : null}
      {labTool ? (
        <Suspense fallback={<KentuLazySectionFallback label="Laboratorio…" />}>
          <HealthCockpitLabOverlay
            tool={labTool}
            onClose={() => setLabTool(null)}
            calibrazioneHandlers={calibrazioneHandlers}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
