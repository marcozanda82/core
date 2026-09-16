import React, { Suspense, useState } from 'react';
import { useCentroAnalisiReadStore } from '../../centroAnalisi/useCentroAnalisiReadStore.js';
import StrumentazioneToolRoom, {
  STRUMENTAZIONE_ROOM_TO_TOOL,
} from '../../centroAnalisi/StrumentazioneToolRoom.jsx';
import CalibrazioneTargetRoom from '../../centroAnalisi/CalibrazioneTargetRoom.jsx';
import KentuLazySectionFallback from '../../../components/KentuLazySectionFallback.jsx';

const LAB_META = {
  STRUMENTI_LEGACY: { title: 'Strumenti', kind: 'strumenti' },
  AUTOPILOTA: { title: 'Calibrazione', kind: 'autopilota' },
};

/**
 * Overlay laboratorio: Strumenti unificati (Bussola / Radar / Mappa) e Calibrazione.
 * La Timeline resta sull'overlay Sala Comandi (AnalisiTimelineTab).
 */
export default function HealthCockpitLabOverlay({
  tool = null,
  onClose = null,
  calibrazioneHandlers = null,
} = {}) {
  const id = String(tool || '').toUpperCase();
  const meta = LAB_META[id] || null;
  const store = useCentroAnalisiReadStore();
  const [roomId, setRoomId] = useState('bussola');

  if (!meta) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
      onClick={(e) => {
        // Click sul backdrop (non sul foglio) chiude l'overlay
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      {/* Bottom Sheet Container */}
      <div
        className="w-full h-[85vh] bg-zinc-950 border-t border-white/10 rounded-t-[2.5rem] shadow-2xl flex flex-col overflow-hidden transform transition-transform animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* iOS-style Drag Handle */}
        <div className="w-12 h-1.5 bg-zinc-700 rounded-full mx-auto mt-4 mb-4 flex-shrink-0"></div>

        {/* Header */}
        <header className="flex shrink-0 items-center justify-between px-6 mb-2">
          <h2 className="text-xl font-bold tracking-tight text-white">
            {meta.title}
          </h2>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="p-2 bg-white/5 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
            aria-label="Chiudi laboratorio"
          >
            <svg 
              className="w-5 h-5" 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2.5} 
                d="M6 18L18 6M6 6l12 12" 
              />
            </svg>
          </button>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-12 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <Suspense fallback={<KentuLazySectionFallback label={`Carico ${meta.title}…`} />}>
            {meta.kind === 'autopilota' ? (
              <CalibrazioneTargetRoom
                store={store}
                handlers={calibrazioneHandlers}
              />
            ) : (
              <StrumentazioneToolRoom
                store={store}
                activeTool={STRUMENTAZIONE_ROOM_TO_TOOL[roomId] || 'COMPASS'}
                label={meta.title}
                onSwitchRoom={setRoomId}
                showToolTabs
              />
            )}
          </Suspense>
        </div>
      </div>
    </div>
  );
}
