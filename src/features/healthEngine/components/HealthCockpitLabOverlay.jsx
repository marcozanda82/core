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
      className="absolute inset-0 z-20 flex flex-col bg-[#050a12] text-zinc-100"
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onClose?.()}
          className="flex h-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-cyan-200 transition hover:border-white/25 hover:bg-white/[0.08]"
          aria-label="Chiudi laboratorio"
        >
          ← Indietro
        </button>
        <h2 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">
          {meta.title}
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] pt-2">
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
  );
}
