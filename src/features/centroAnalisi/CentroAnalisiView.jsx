import React, { useCallback, useMemo, useState } from 'react';
import {
  CENTRO_ANALISI_AREAS,
  findCentroAnalisiArea,
  findCentroAnalisiRoom,
} from './centroAnalisiTree';
import { GLASS_SURFACE_CLASS } from './glassStyles';
import MetabolismoRoom from './MetabolismoRoom';
import SonnoRoom from './SonnoRoom';
import BiometrieRoom from './BiometrieRoom';
import ClinicaRoom from './ClinicaRoom';
import BussolaRoom from './BussolaRoom';
import MappaRoom from './MappaRoom';
import RadarRoom from './RadarRoom';
import RecuperoRoom from './RecuperoRoom';
import AllenamentoRoom from './AllenamentoRoom';
import NutrizioneRoom from './NutrizioneRoom';
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

function BreadcrumbTrail({ crumbs, onSelect }) {
  return (
    <nav aria-label="Percorso" className="min-w-0 flex-1">
      <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-[0.72rem] font-semibold tracking-wide sm:text-sm">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={crumb.id} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <span className="shrink-0 text-zinc-500" aria-hidden>›</span>
              ) : null}
              {isLast ? (
                <span className="truncate text-cyan-100" aria-current="page">
                  {crumb.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(crumb.id)}
                  className="truncate text-zinc-400 transition-colors hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
                >
                  {crumb.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
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
 * Scheletro isolato del Centro Analisi.
 * La stanza Metabolismo legge il diario in sola lettura; SnapshotHub/SaluteView restano intatti.
 */
export default function CentroAnalisiView({ onExit = null, embedded = false } = {}) {
  const [areaId, setAreaId] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const centroAnalisiStore = useCentroAnalisiReadStore();

  const area = useMemo(() => findCentroAnalisiArea(areaId), [areaId]);
  const room = useMemo(
    () => (areaId && roomId ? findCentroAnalisiRoom(areaId, roomId) : null),
    [areaId, roomId],
  );

  const crumbs = useMemo(() => {
    const list = [
      { id: 'kentuos', label: 'KentuOS' },
      { id: 'hub', label: 'Centro Analisi' },
    ];
    if (area) list.push({ id: `area:${area.id}`, label: area.label });
    if (area && room) list.push({ id: `room:${room.id}`, label: room.label });
    return list;
  }, [area, room]);

  const goHub = useCallback(() => {
    setAreaId(null);
    setRoomId(null);
  }, []);

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

  const handleCrumb = useCallback((crumbId) => {
    if (crumbId === 'kentuos') {
      onExit?.();
      return;
    }
    if (crumbId === 'hub') {
      goHub();
      return;
    }
    if (String(crumbId).startsWith('area:')) {
      setRoomId(null);
    }
  }, [goHub, onExit]);

  const title = room?.label || area?.label || 'Centro Analisi';
  const subtitle = room
    ? 'Stanza'
    : area
      ? area.kicker
      : 'Scegli una macro-area';
  const isStrumentazioneRoom = area?.id === 'strumentazione' && Boolean(room);

  return (
    <div
      className={[
        'relative isolate flex min-h-0 w-full flex-col overflow-hidden bg-transparent text-zinc-100',
        embedded ? 'h-full flex-1' : 'h-full max-h-[100dvh] [height:100dvh]',
      ].join(' ')}
    >
      <PremiumAmbientBackground activeRoomId={room?.id} />

      {/* Layer 10 — lastre di vetro */}
      <header className="relative z-10 shrink-0 px-3 pt-3 sm:px-5">
        <div className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${GLASS_SURFACE_CLASS}`}>
          <button
            type="button"
            onClick={handleBack}
            className={[
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-cyan-200',
              GLASS_SURFACE_CLASS,
              'transition-all duration-150 hover:border-white/25 hover:bg-white/[0.08]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40',
            ].join(' ')}
            aria-label={areaId || roomId ? 'Torna indietro' : 'Torna a KentuOS'}
            title="Indietro"
          >
            ←
          </button>
          <BreadcrumbTrail crumbs={crumbs} onSelect={handleCrumb} />
        </div>
      </header>

      <main
        className={`relative z-10 mx-auto flex w-full ${isStrumentazioneRoom ? 'max-w-2xl' : 'max-w-lg'} min-h-0 flex-1 flex-col overflow-hidden px-4 pt-6 sm:px-6`}
      >
        <div className="shrink-0 text-center">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {subtitle}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-zinc-50">{title}</h1>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-24 [padding-bottom:max(6rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))]">
          {!area ? (
            <div className="grid w-full grid-cols-2 gap-3">
              {CENTRO_ANALISI_AREAS.map((item) => (
                <GlassCardButton
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  hint={item.hint}
                  wide={item.id === 'strumentazione'}
                  onClick={() => {
                    setAreaId(item.id);
                    setRoomId(null);
                  }}
                />
              ))}
            </div>
          ) : null}

          {area && !room ? (
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

          {area && room ? (
            room.id === 'metabolismo' ? (
              <MetabolismoRoom store={centroAnalisiStore} />
            ) : room.id === 'sonno' ? (
              <SonnoRoom store={centroAnalisiStore} />
            ) : room.id === 'biometrie' ? (
              <BiometrieRoom store={centroAnalisiStore} />
            ) : room.id === 'clinica' ? (
              <ClinicaRoom store={centroAnalisiStore} />
            ) : room.id === 'bussola' ? (
              <BussolaRoom store={centroAnalisiStore} onSwitchRoom={setRoomId} />
            ) : room.id === 'mappa' ? (
              <MappaRoom store={centroAnalisiStore} onSwitchRoom={setRoomId} />
            ) : room.id === 'radar' ? (
              <RadarRoom store={centroAnalisiStore} onSwitchRoom={setRoomId} />
            ) : room.id === 'recupero' ? (
              <RecuperoRoom store={centroAnalisiStore} />
            ) : room.id === 'allenamento' ? (
              <AllenamentoRoom store={centroAnalisiStore} />
            ) : room.id === 'nutrizione' ? (
              <NutrizioneRoom store={centroAnalisiStore} />
            ) : (
              <PlaceholderRoomPanel area={area} room={room} />
            )
          ) : null}
        </div>
      </main>
    </div>
  );
}
