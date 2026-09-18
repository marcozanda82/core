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
      {/* Full-height sheet: il Radar deve stare nello spazio verticale disponibile, non in 85vh. */}
      <div
        className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden border-t border-white/10 bg-zinc-950 shadow-2xl transform transition-transform animate-in slide-in-from-bottom duration-300"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* iOS-style Drag Handle */}
        <div className="mx-auto mb-3 mt-3 h-1.5 w-12 flex-shrink-0 rounded-full bg-zinc-700"></div>

        {/* Header */}
        <header className="mb-2 flex shrink-0 items-center justify-between px-6">
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
        <div
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-6 pb-[max(2rem,env(safe-area-inset-bottom,0px))] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        >
          <div className="flex h-full min-h-0 flex-1 flex-col">
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
    </div>
  );
}
