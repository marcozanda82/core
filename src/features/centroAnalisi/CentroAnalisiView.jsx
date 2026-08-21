import React, { useCallback, useMemo, useState } from 'react';
import {
  CENTRO_ANALISI_AREAS,
  findCentroAnalisiArea,
  findCentroAnalisiRoom,
} from './centroAnalisiTree';
import { GLASS_SURFACE_CLASS } from './glassStyles';
import BussolaRoom from './BussolaRoom';
import MappaRoom from './MappaRoom';
import RadarRoom from './RadarRoom';
import PremiumAmbientBackground from './PremiumAmbientBackground';
import { useCentroAnalisiReadStore } from './useCentroAnalisiReadStore';

const GLASS_CARD_CLASS = [
  'flex flex-col items-center justify-center gap-2.5 rounded-2xl',
  'min-h-[6.25rem] px-4 py-4 text-zinc-100',
  GLASS_SURFACE_CLASS,
  'transition-all duration-150',
  'hover:border-white/25 hover:bg-white/[0.08]',
  'hover:shadow-[0_12px_40px_0_rgba(0,0,0,0.45)]',
  'active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
].join(' ');

function GlassCardButton({ icon, label, hint, onClick, wide = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[GLASS_CARD_CLASS, wide ? 'col-span-2 min-h-[5.5rem]' : ''].filter(Boolean).join(' ')}
    >
      <span className="text-3xl leading-none" aria-hidden>{icon}</span>
      <span className="text-center text-xs font-semibold leading-tight sm:text-sm">{label}</span>
      {hint ? (
        <span className="max-w-[16rem] text-center text-[0.65rem] font-medium leading-snug text-zinc-400">
          {hint}
        </span>
      ) : null}
    </button>
  );
}

function PlaceholderRoomPanel({ area, room }) {
  return (
    <section
      className={`flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-live="polite"
    >
      <span className="text-4xl leading-none" aria-hidden>{room.icon}</span>
      <h2 className="text-lg font-semibold text-zinc-50">{room.label}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-400">
        Stanza in fase di progettazione.
      </p>
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-600">
        {area.label} · placeholder
      </p>
    </section>
  );
}

/**
 * Centro Analisi — hub.
 * Salute / Progressione → stessa Fotografia della Home (`onOpenFotografia*`).
 * Strumentazione resta a stanze interne (Bussola / Mappa / Radar).
 */
export default function CentroAnalisiView({
  onExit = null,
  embedded = false,
  /** Apre la Fotografia Salute (stesso handler dei widget Home). */
  onOpenFotografiaSalute = null,
  /** Apre la Fotografia Progressione (stesso handler dei widget Home). */
  onOpenFotografiaProgressione = null,
  initialAreaId = null,
} = {}) {
  const [areaId, setAreaId] = useState(() => {
    const id = String(initialAreaId || '').toLowerCase();
    // Solo Strumentazione ha ancora drill-down interno
    return id === 'strumentazione' ? id : null;
  });
  const [roomId, setRoomId] = useState(null);
  const centroAnalisiStore = useCentroAnalisiReadStore();

  const area = useMemo(() => findCentroAnalisiArea(areaId), [areaId]);
  const room = useMemo(
    () => (areaId && roomId ? findCentroAnalisiRoom(areaId, roomId) : null),
    [areaId, roomId],
  );
  const isStrumentazione = area?.id === 'strumentazione';
  const isStrumentazioneRoom = isStrumentazione && Boolean(room);

  const handleBack = useCallback(() => {
    if (roomId) {
      setRoomId(null);
      return;
    }
    if (areaId) {
      setAreaId(null);
      return;
    }
    onExit?.();
  }, [areaId, onExit, roomId]);

  const openHubItem = useCallback((itemId) => {
    if (itemId === 'salute') {
      if (typeof onOpenFotografiaSalute === 'function') {
        onOpenFotografiaSalute();
        return;
      }
      return;
    }
    if (itemId === 'progressione') {
      if (typeof onOpenFotografiaProgressione === 'function') {
        onOpenFotografiaProgressione();
        return;
      }
      return;
    }
    if (itemId === 'strumentazione') {
      setAreaId('strumentazione');
      setRoomId(null);
    }
  }, [onOpenFotografiaProgressione, onOpenFotografiaSalute]);

  const title = room?.label || area?.label || 'Centro Analisi';
  const showHubTitle = !area;
  const backLabel = areaId || roomId
    ? '← Indietro'
    : (embedded ? '← Home' : '← Indietro');

  return (
    <div
      className={[
        'relative isolate flex min-h-0 w-full flex-col overflow-hidden bg-transparent text-zinc-100',
        embedded ? 'h-full flex-1' : 'h-full max-h-[100dvh] [height:100dvh]',
      ].join(' ')}
    >
      <PremiumAmbientBackground activeRoomId={room?.id || null} />

      <header className="relative z-10 shrink-0 px-3 pt-3 sm:px-5">
        <div className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${GLASS_SURFACE_CLASS}`}>
          <button
            type="button"
            onClick={handleBack}
            className={[
              'flex h-9 shrink-0 items-center justify-center rounded-xl px-3 text-sm font-semibold text-cyan-200',
              GLASS_SURFACE_CLASS,
              'transition-all duration-150 hover:border-white/25 hover:bg-white/[0.08]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40',
            ].join(' ')}
            aria-label={areaId || roomId ? 'Torna indietro' : 'Torna a KentuOS'}
            title="Indietro"
          >
            {backLabel}
          </button>
          <h1 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">
            {title}
          </h1>
        </div>
      </header>

      <main
        className={`relative z-10 mx-auto flex w-full ${isStrumentazioneRoom ? 'max-w-2xl' : 'max-w-lg'} min-h-0 flex-1 flex-col overflow-hidden px-4 pt-4 sm:px-6`}
      >
        {showHubTitle ? (
          <div className="shrink-0 text-center">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Scegli una macro-area
            </p>
          </div>
        ) : null}

        <div className="mt-4 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-24 [padding-bottom:max(6rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))]">
          {!area ? (
            <div className="grid w-full grid-cols-2 gap-3">
              {CENTRO_ANALISI_AREAS.map((item) => (
                <GlassCardButton
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  hint={item.hint}
                  wide={item.id === 'strumentazione'}
                  onClick={() => openHubItem(item.id)}
                />
              ))}
            </div>
          ) : null}

          {isStrumentazione && !room ? (
            <div className="grid w-full grid-cols-2 gap-3">
              {area.rooms.map((item) => (
                <GlassCardButton
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  onClick={() => setRoomId(item.id)}
                />
              ))}
            </div>
          ) : null}

          {isStrumentazione && room ? (
            room.id === 'bussola' ? (
              <BussolaRoom store={centroAnalisiStore} onSwitchRoom={setRoomId} />
            ) : room.id === 'mappa' ? (
              <MappaRoom store={centroAnalisiStore} onSwitchRoom={setRoomId} />
            ) : room.id === 'radar' ? (
              <RadarRoom store={centroAnalisiStore} onSwitchRoom={setRoomId} />
            ) : (
              <PlaceholderRoomPanel area={area} room={room} />
            )
          ) : null}
        </div>
      </main>
    </div>
  );
}
