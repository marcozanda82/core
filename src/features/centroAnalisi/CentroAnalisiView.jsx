import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CENTRO_ANALISI_AREAS,
  findCentroAnalisiArea,
  findCentroAnalisiRoom,
} from './centroAnalisiTree';
import { GLASS_SURFACE_CLASS } from './glassStyles';
import StrumentazioneToolRoom, {
  STRUMENTAZIONE_ROOM_TO_TOOL,
  StrumentazioneToolTabs,
} from './StrumentazioneToolRoom';
import PremiumAmbientBackground from './PremiumAmbientBackground';
import { useCentroAnalisiReadStore } from './useCentroAnalisiReadStore';
import { useStrumentazioneMapData } from './useStrumentazioneMapData';
import {
  CentroAnalisiLiveCard,
  LongevityLivePreview,
  ProgressionLivePreview,
  StrumentazioneLivePreview,
  TimelineLivePreview,
  CalibrazioneTargetLivePreview,
} from './CentroAnalisiLiveCards';
import CalibrazioneTargetRoom from './CalibrazioneTargetRoom';
import {
  calculateProgressionScore,
} from '../trendHub/utils/saluteDashboardMetrics';
import {
  buildProgressionLogsWindow,
  LONGEVITY_WINDOW_DAYS,
  selectTodayLog,
} from '../trendHub/utils/saluteHistorySeries';
import { computeTotali } from '../../useBiochimico';
import { mapMetricsToPillars } from '../metabolic/pillarsMapperLegacy';
import { getTodayString } from '../../coreEngine';

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
 * Centro Analisi — hub con Live Cards.
 * Salute / Progressione → Fotografia Home. Strumentazione → Bussola. Timeline → overlay 24h.
 */
const DEFAULT_STRUMENTAZIONE_ROOM = 'bussola';

export default function CentroAnalisiView({
  onExit = null,
  embedded = false,
  onOpenFotografiaSalute = null,
  onOpenFotografiaProgressione = null,
  onOpenTimelineMetabolica = null,
  initialAreaId = null,
  /** Anteprime live da SalaComandi (SSOT giorno selezionato). */
  livePreview = null,
  /** Handler Ghost Car / autopilota (solo da SalaComandi embedded). */
  calibrazioneHandlers = null,
} = {}) {
  const deepLinkedAreaRef = useRef((() => {
    const id = String(initialAreaId || '').toLowerCase();
    return id === 'strumentazione' || id === 'calibrazione_target' ? id : null;
  })());

  const [areaId, setAreaId] = useState(() => {
    const id = String(initialAreaId || '').toLowerCase();
    if (id === 'strumentazione' || id === 'calibrazione_target') return id;
    return null;
  });
  const [roomId, setRoomId] = useState(() => {
    const id = String(initialAreaId || '').toLowerCase();
    return id === 'strumentazione' ? DEFAULT_STRUMENTAZIONE_ROOM : null;
  });
  const centroAnalisiStore = useCentroAnalisiReadStore();
  const { mapData } = useStrumentazioneMapData(centroAnalisiStore);

  useEffect(() => {
    const id = String(initialAreaId || '').toLowerCase();
    if (id === 'calibrazione_target') {
      setAreaId('calibrazione_target');
      setRoomId(null);
      deepLinkedAreaRef.current = 'calibrazione_target';
      return;
    }
    if (id === 'strumentazione') {
      setAreaId('strumentazione');
      setRoomId(DEFAULT_STRUMENTAZIONE_ROOM);
      deepLinkedAreaRef.current = 'strumentazione';
    }
  }, [initialAreaId]);

  const preview = livePreview && typeof livePreview === 'object' ? livePreview : {};

  const fallbackProgression = useMemo(() => {
    const {
      fullHistory,
      activeLog,
      userTargets,
      todayDate,
    } = centroAnalisiStore || {};
    const scoreDate = String(preview.scoreDate || todayDate || getTodayString()).slice(0, 10);
    const todayLiveLog = selectTodayLog(fullHistory, scoreDate, activeLog, scoreDate === getTodayString());
    const logs = buildProgressionLogsWindow({
      fullHistory,
      todayDate: scoreDate,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog,
    });
    return calculateProgressionScore(
      {
        days: logs.days,
        todayDate: logs.todayDate,
        sleepAvgHours: logs.sleepAvgHours,
        workoutSessionsTotal: logs.workoutSessionsTotal,
      },
      userTargets || {},
    );
  }, [centroAnalisiStore, preview.scoreDate]);

  const fallbackMacroPreview = useMemo(() => {
    const totals = computeTotali(Array.isArray(centroAnalisiStore?.activeLog) ? centroAnalisiStore.activeLog : []);
    const targets = centroAnalisiStore?.userTargets || {};
    return {
      prot: Number(totals?.prot) || 0,
      carb: Number(totals?.carb) || 0,
      fat: Number(totals?.fatTotal ?? totals?.fat) || 0,
      targetProt: Number(targets?.prot) || 0,
      targetCarb: Number(targets?.carb) || 0,
      targetFat: Number(targets?.fatTotal ?? targets?.fat) || 0,
    };
  }, [centroAnalisiStore?.activeLog, centroAnalisiStore?.userTargets]);

  const longevityScore = preview.longevityScore ?? null;
  const longevityBars = preview.longevityBars ?? [];
  const progressionScore = preview.progressionScore ?? fallbackProgression.finalScore;
  const macroPreview = preview.macroPreview ?? fallbackMacroPreview;
  const gradientStops = preview.gradientStops ?? null;
  const timelinePoints = preview.timelinePoints ?? [];
  const mealHours = preview.mealHours ?? [];
  const compassX = Number(mapData?.visualVector?.x ?? mapData?.compassDirection?.x) || 0;
  const compassY = Number(mapData?.visualVector?.y ?? mapData?.compassDirection?.y) || 0;
  const mapX = Number(mapData?.mapPositionInertial?.x ?? mapData?.x) || 0;
  const mapY = Number(mapData?.mapPositionInertial?.y ?? mapData?.y) || 0;
  const mapZoneColor = mapData?.mapZoneColor || mapData?.mapPresentation?.auraColor || '#22d3ee';

  const radarPillars = useMemo(() => {
    if (!mapData) return null;
    return mapMetricsToPillars({
      energyBalance: mapData.energyBalance,
      trainingLoadAxis: mapData.metabolicMapInputs?.trainingLoad,
      meanTraining01: mapData.metabolicMapInputs?.meanTraining01,
      sleepPenalty: mapData.sleepPenalty,
      longevityScore: mapData.longevityScore,
      distance: mapData.distance,
    });
  }, [mapData]);

  const area = useMemo(() => findCentroAnalisiArea(areaId), [areaId]);
  const room = useMemo(
    () => (areaId && roomId ? findCentroAnalisiRoom(areaId, roomId) : null),
    [areaId, roomId],
  );
  const isStrumentazione = area?.id === 'strumentazione';
  const isCalibrazione = area?.id === 'calibrazione_target';
  const isStrumentazioneRoom = isStrumentazione && Boolean(room);

  const handleBack = useCallback(() => {
    if (areaId === 'strumentazione') {
      if (deepLinkedAreaRef.current === 'strumentazione') {
        onExit?.();
        return;
      }
      setRoomId(null);
      setAreaId(null);
      return;
    }
    if (areaId === 'calibrazione_target') {
      if (deepLinkedAreaRef.current === 'calibrazione_target') {
        onExit?.();
        return;
      }
      setAreaId(null);
      return;
    }
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
      onOpenFotografiaSalute?.();
      return;
    }
    if (itemId === 'progressione') {
      onOpenFotografiaProgressione?.();
      return;
    }
    if (itemId === 'timeline_metabolica') {
      onOpenTimelineMetabolica?.();
      return;
    }
    if (itemId === 'strumentazione') {
      setAreaId('strumentazione');
      setRoomId(DEFAULT_STRUMENTAZIONE_ROOM);
      return;
    }
    if (itemId === 'calibrazione_target') {
      setAreaId('calibrazione_target');
      setRoomId(null);
    }
  }, [onOpenFotografiaProgressione, onOpenFotografiaSalute, onOpenTimelineMetabolica]);

  const title = isStrumentazione
    ? (area?.label || 'Strumentazione')
    : (room?.label || area?.label || 'Centro Analisi');
  const activeStrumentazioneRoom = roomId || DEFAULT_STRUMENTAZIONE_ROOM;
  const telemetryContext = useMemo(() => ({
    longevityScore: preview.longevityScore ?? null,
    longevityBreakdown: preview.longevityBreakdown ?? null,
    progressionScore: preview.progressionScore ?? fallbackProgression.finalScore,
    progressionBreakdown: preview.progressionBreakdown ?? fallbackProgression.breakdown,
    activeLog: centroAnalisiStore?.activeLog ?? [],
    userTargets: centroAnalisiStore?.userTargets ?? null,
  }), [
    preview.longevityScore,
    preview.longevityBreakdown,
    preview.progressionScore,
    preview.progressionBreakdown,
    fallbackProgression,
    centroAnalisiStore?.activeLog,
    centroAnalisiStore?.userTargets,
  ]);
  const showHubTitle = !area;
  const backLabel = '← Indietro';

  const renderLivePreview = (itemId) => {
    if (itemId === 'salute') {
      return <LongevityLivePreview score={longevityScore} bars={longevityBars} />;
    }
    if (itemId === 'progressione') {
      return (
        <ProgressionLivePreview
          score={progressionScore}
          macros={macroPreview}
        />
      );
    }
    if (itemId === 'strumentazione') {
      return (
        <StrumentazioneLivePreview
          compassX={compassX}
          compassY={compassY}
          mapX={mapX}
          mapY={mapY}
          mapZoneColor={mapZoneColor}
          radarPillars={radarPillars}
        />
      );
    }
    if (itemId === 'timeline_metabolica') {
      return (
        <TimelineLivePreview
          timelinePoints={timelinePoints}
          mealHours={mealHours}
          gradientStops={gradientStops}
        />
      );
    }
    if (itemId === 'calibrazione_target') {
      const cp = preview.calibrazionePreview ?? {};
      return (
        <CalibrazioneTargetLivePreview
          fullHistory={centroAnalisiStore?.fullHistory}
          userTargets={centroAnalisiStore?.userTargets}
          activeLog={centroAnalisiStore?.activeLog}
          activeDate={cp.activeDate ?? preview.scoreDate}
          settingsBaseKcal={cp.settingsBaseKcal ?? null}
          committedGhostGoal={cp.committedGhostGoal ?? 'maintain'}
          committedGhostDeltaKcal={cp.committedGhostDeltaKcal ?? null}
          effectiveGhostDeltaKcal={cp.effectiveGhostDeltaKcal ?? null}
          ghostAutoPilotEnabled={cp.ghostAutoPilotEnabled !== false}
          autoCompensationDelta={cp.autoCompensationDelta ?? 0}
        />
      );
    }
    return null;
  };

  return (
    <div
      className={[
        'relative isolate flex min-h-0 w-full flex-col overflow-hidden bg-transparent text-zinc-100',
        embedded ? 'h-full flex-1' : 'h-full max-h-[100dvh] [height:100dvh]',
      ].join(' ')}
    >
      <PremiumAmbientBackground
        activeRoomId={isStrumentazione ? activeStrumentazioneRoom : (room?.id || null)}
      />

      <header className="relative z-10 shrink-0 px-3 pt-2 sm:px-5">
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
        {isStrumentazione ? (
          <div className="mt-2">
            <StrumentazioneToolTabs
              activeRoomId={activeStrumentazioneRoom}
              onSwitchRoom={setRoomId}
            />
          </div>
        ) : null}
      </header>

      <main
        className={`relative z-10 mx-auto flex w-full ${isStrumentazioneRoom ? 'max-w-2xl' : 'max-w-lg'} min-h-0 flex-1 flex-col overflow-hidden px-4 pt-1 sm:px-6`}
      >
        {showHubTitle ? (
          <div className="shrink-0 text-center">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Scegli una macro-area
            </p>
          </div>
        ) : null}

        <div
          className={[
            'min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain',
            showHubTitle ? 'mt-2' : 'mt-1',
            isStrumentazione ? 'pb-8' : 'pb-24 [padding-bottom:max(6rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))]',
          ].join(' ')}
        >
          {!area ? (
            <div className="grid w-full grid-cols-2 gap-3">
              {CENTRO_ANALISI_AREAS.map((item) => {
                if (item.id === 'timeline_metabolica' && typeof onOpenTimelineMetabolica !== 'function') {
                  return null;
                }
                return (
                  <CentroAnalisiLiveCard
                    key={item.id}
                    title={item.label}
                    description={item.hint}
                    wide={item.id === 'strumentazione' || item.id === 'timeline_metabolica' || item.id === 'calibrazione_target'}
                    preview={renderLivePreview(item.id)}
                    onClick={() => openHubItem(item.id)}
                  />
                );
              })}
            </div>
          ) : null}

          {isStrumentazione ? (
            <StrumentazioneToolRoom
              store={centroAnalisiStore}
              activeTool={STRUMENTAZIONE_ROOM_TO_TOOL[activeStrumentazioneRoom] || 'COMPASS'}
              label={room?.label || 'Strumentazione'}
              onSwitchRoom={setRoomId}
              showToolTabs={false}
              telemetryContext={telemetryContext}
            />
          ) : null}

          {isCalibrazione ? (
            <CalibrazioneTargetRoom
              store={centroAnalisiStore}
              handlers={calibrazioneHandlers}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
