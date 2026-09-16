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
  dailyLog = null,
  ...engineProps
} = {}) {
  // 🔥 FIX CRITICO: Passa dailyLog all'hook (era perso prima!)
  const { healthState, isReady, isLoading } = useHealthSystemState({
    ...engineProps,
    dailyLog, // ← Ora il diario grezzo viene passato all'engine
  });
  const [labTool, setLabTool] = useState(null);
  const [selectedPillarId, setSelectedPillarId] = useState(null);
  
  const todayStr = new Date().toISOString().slice(0, 10);

  const handleCopyDebugJson = useCallback(() => {
    try {
      const debugData = {
        data: dateStr || new Date().toISOString().slice(0, 10),
        diario: dailyLog || [],
        salute: healthState || null,
      };
      const jsonString = JSON.stringify(debugData, null, 2);
      
      navigator.clipboard.writeText(jsonString)
        .then(() => {
          alert('✅ JSON di Debug copiato negli appunti!');
        })
        .catch(err => {
          console.error('Errore copia:', err);
          // Fallback per browser senza Clipboard API
          const ta = document.createElement('textarea');
          ta.value = jsonString;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          alert('✅ JSON di Debug copiato negli appunti!');
        });
    } catch (err) {
      console.error('Errore export JSON:', err);
      alert('❌ Errore durante l\'export del JSON');
    }
  }, [dateStr, dailyLog, healthState]);

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
        onCopyDebugJson={handleCopyDebugJson}
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
