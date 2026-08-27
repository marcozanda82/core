/**
 * Tab Home / Oggi: quadrante pie + strip nutrienti + widget training/metabolico.
 * Dati dial da `useMealPieDialData` via props.
 */

import { lazy, Suspense } from 'react';
import DialMaintenanceMarker from '../DialMaintenanceMarker';
import KcalFuelTelemetryRing from '../KcalFuelTelemetryRing';
import HomeNutrientStrip from '../HomeNutrientStrip';
import TrainingBlockWidget from '../TrainingBlockWidget';
import MetabolicMonitorCard from '../MetabolicMonitorCard';
import KentuLazySectionFallback from '../KentuLazySectionFallback';
import { getTodayString } from '../../coreEngine';

const HomeMealPieDial = lazy(() => import('../charts/HomeMealPieDial'));

/**
 * @param {object} props
 */
export default function HomeOggiDialSection({
  activeDialMode = 'kcal',
  setActiveDialMode = null,
  dialHud = null,
  mealPieDisplayData = [],
  selectedMealCenter = null,
  selectedMealCenterIndex = -1,
  setSelectedMealCenter = null,
  totali = null,
  dynamicDailyKcal = 0,
  loadMealToConstructor = null,
  onOpenDiario = null,
  setShowDiarySheet = null,
  setShowCalorieDetailsSheet = null,
  setSelectedNodeReport = null,
  effectiveTargetsForCurrentDate = null,
  userTargets = null,
  setShowProteinSheet = null,
  setShowCarbsSheet = null,
  setShowFatSheet = null,
  setShowMineralsSheet = null,
  setShowVitaminsSheet = null,
  db = null,
  user = null,
  currentTrackerDate = null,
  userProfile = null,
  userModel = null,
  fullHistory = null,
  activeLog = [],
  bodyMetricsHistory = null,
  isSimulationMode = false,
  handleConfirmTrainingBlockSession = null,
  handlePostponeTrainingBlockSession = null,
  handleExecuteTrainingBlockSession = null,
  handleOpenTrendDiag = null,
  handleOpenTrendSalute = null,
  handleOpenTrendProgressione = null,
  trainingBlockCreatorOpen = false,
  setTrainingBlockCreatorOpen = null,
  metabolicSnapshot = null,
  physiologySnapshot = null,
  setShowSleepPrompt = null,
  setShowMetabolicSheet = null,
  showMissingSleepBanner = false,
  longevityResult = null,
}) {
  const hud = dialHud || {};
  const {
    targetProt = 150,
    targetCarb = 200,
    targetFat = 65,
    dialDailyTargetKcal = 0,
    dialKcalSurplus = 0,
    dialKcalRemaining = 0,
    dialKcalRestLabel = 'RESTANTI',
    showKcalTelemetryRings = false,
    telemetry = null,
    zoneHud = { text: '', color: '#888' },
    showMaintenanceMarker = false,
    maintenanceMarkerRatio = 0,
    maintenanceMarkerIsDeficit = false,
  } = hud;

  const homeDayKey = String(currentTrackerDate || getTodayString()).slice(0, 10);
  const missingSleep =
    showMissingSleepBanner
    || physiologySnapshot?.SLEEP?.status === 'alert';

  return (
    <div className="home-oggi-scroll">
      <div className="home-oggi-column" style={{ paddingLeft: 0, paddingRight: 0 }}>
        {missingSleep ? (
          <button
            type="button"
            className="home-oggi-rigid mb-3 flex w-full shrink-0 items-center gap-2.5 rounded-xl border border-indigo-400/35 bg-gradient-to-r from-indigo-950/80 via-slate-900/75 to-slate-900/55 px-3.5 py-3 text-left shadow-lg backdrop-blur-sm transition-transform active:scale-[0.99]"
            onClick={() => setShowSleepPrompt?.(true)}
            aria-label="Registra il sonno di stanotte"
          >
            <span className="text-xl leading-none" aria-hidden="true">🌙</span>
            <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-100">
              Registra il sonno di stanotte per calibrare il motore metabolico
            </span>
            <span className="shrink-0 text-xs font-medium text-indigo-300/90">Apri →</span>
          </button>
        ) : null}
        <div className="nutrition-cluster">
          <div
            className="kcal-dial-shell"
            onClick={() => {
              setSelectedMealCenter?.(null);
              setActiveDialMode?.('kcal');
            }}
          >
            <div className="kcal-dial-inner">
              <div
                className={selectedMealCenter ? 'tachimeter-center tachimeter-center-reset' : 'tachimeter-center'}
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedMealCenter && selectedMealCenter.id && selectedMealCenter.id !== 'rimanenti') {
                    loadMealToConstructor?.(String(selectedMealCenter.id));
                    return;
                  }
                  console.log('[Diario] tap centro tachimetro → apertura Diario Lista');
                  if (typeof onOpenDiario === 'function') onOpenDiario();
                  else setShowDiarySheet?.(true);
                }}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '66%',
                  height: '66%',
                  borderRadius: '50%',
                  background: '#0a0a0a',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '3px solid #111',
                  zIndex: 15,
                  boxShadow: `0 0 35px ${(dynamicDailyKcal - (totali?.kcal || 0)) >= 0 ? 'rgba(0,229,255,0.15)' : 'rgba(255,77,77,0.3)'}`,
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease, filter 0.2s ease',
                  pointerEvents: 'auto',
                }}
                title={!selectedMealCenter ? 'Apri diagnostica nutrizionale' : undefined}
              >
                {selectedMealCenter ? (
                  <div className="pieCenterInfo" style={{ textAlign: 'center', cursor: 'pointer' }}>
                    <div className="pieMealTitle" style={{ fontSize: '1rem', fontWeight: 'bold', color: selectedMealCenter.color ?? selectedMealCenter.fill ?? '#00e5ff' }}>
                      {selectedMealCenter.name || selectedMealCenter.label}
                    </div>
                    {selectedMealCenter.timeValue != null && (
                      <div style={{ fontSize: '0.85rem', color: '#aaa' }}>
                        {`${String(Math.floor(selectedMealCenter.timeValue)).padStart(2, '0')}:${String(Math.round((selectedMealCenter.timeValue % 1) * 60)).padStart(2, '0')}`}
                      </div>
                    )}
                    {activeDialMode === 'kcal' && (
                      <div className="pieMealKcal" style={{ fontSize: '0.8rem', color: '#888', marginTop: '2px' }}>
                        {Math.round(selectedMealCenter.actualKcal ?? selectedMealCenter.kcal ?? selectedMealCenter.value ?? 0)} kcal
                      </div>
                    )}
                    {activeDialMode === 'pro' && (
                      <div className="pieMealKcal" style={{ fontSize: '0.8rem', color: '#b666d2', marginTop: '2px' }}>
                        {Math.round(selectedMealCenter.prot ?? selectedMealCenter.payload?.macros?.pro ?? 0)} g Proteine
                      </div>
                    )}
                    {activeDialMode === 'cho' && (
                      <div className="pieMealKcal" style={{ fontSize: '0.8rem', color: '#00ff88', marginTop: '2px' }}>
                        {Math.round(selectedMealCenter.carb ?? selectedMealCenter.payload?.macros?.carb ?? 0)} g Carboidrati
                      </div>
                    )}
                    {activeDialMode === 'fat' && (
                      <div className="pieMealKcal" style={{ fontSize: '0.8rem', color: '#ffd700', marginTop: '2px' }}>
                        {Math.round(selectedMealCenter.fat ?? selectedMealCenter.payload?.macros?.fat ?? 0)} g Grassi
                      </div>
                    )}
                    <div className="pieMealMacros">
                      P {Math.round(selectedMealCenter.prot ?? selectedMealCenter.payload?.macros?.pro ?? 0)}g
                      C {Math.round(selectedMealCenter.carb ?? selectedMealCenter.payload?.macros?.carb ?? 0)}g
                      F {Math.round(selectedMealCenter.fat ?? selectedMealCenter.payload?.macros?.fat ?? 0)}g
                    </div>
                  </div>
                ) : (
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none', width: '88%' }}>
                    <div
                      className="kcal-dial-center-value"
                      style={{
                        color:
                          activeDialMode === 'kcal' && dialKcalSurplus > 0
                            ? '#ef4444'
                            : activeDialMode === 'pro'
                              ? '#b666d2'
                              : activeDialMode === 'cho'
                                ? '#00ff88'
                                : activeDialMode === 'fat'
                                  ? '#ffd700'
                                  : '#ff6b00',
                        textShadow:
                          activeDialMode === 'kcal' && dialKcalSurplus > 0
                            ? '0 0 18px rgba(239, 68, 68, 0.45)'
                            : '0 0 15px rgba(255, 107, 0, 0.35)',
                      }}
                    >
                      {activeDialMode === 'kcal' && dialKcalSurplus > 0 && (
                        <span className="kcal-dial-center-surplus" style={{ letterSpacing: '0.02em' }}>
                          + {dialKcalSurplus}{' '}
                          <span style={{ fontSize: '0.42em', fontWeight: 700 }}>Kcal</span>
                        </span>
                      )}
                      {activeDialMode === 'kcal' && dialKcalSurplus <= 0 && dialKcalRemaining}
                      {activeDialMode === 'pro' && Math.round(totali?.prot || 0)}
                      {activeDialMode === 'cho' && Math.round(totali?.carb || 0)}
                      {activeDialMode === 'fat' && Math.round(totali?.fatTotal ?? totali?.fat ?? 0)}
                    </div>
                    <div
                      className="kcal-dial-center-label"
                      style={{
                        color: activeDialMode === 'kcal' && dialKcalSurplus > 0 ? '#f87171' : '#888',
                        fontWeight: activeDialMode === 'kcal' && dialKcalSurplus > 0 ? 700 : 400,
                      }}
                    >
                      {activeDialMode === 'kcal' && dialKcalRestLabel}
                      {activeDialMode === 'pro' && 'g Proteine'}
                      {activeDialMode === 'cho' && 'g Carboidrati'}
                      {activeDialMode === 'fat' && 'g Grassi'}
                    </div>
                    {activeDialMode === 'kcal' && dialKcalSurplus <= 0 && zoneHud.text ? (
                      <div
                        className="kcal-dial-center-sub"
                        style={{
                          color: zoneHud.color,
                          marginTop: '4px',
                          fontWeight: 600,
                        }}
                      >
                        {zoneHud.text}
                      </div>
                    ) : null}
                    {activeDialMode === 'pro' && (
                      <div className="kcal-dial-center-sub" style={{ color: '#555', marginTop: '4px' }}>
                        {`obiettivo ${Math.round(targetProt)} g`}
                      </div>
                    )}
                    {activeDialMode === 'cho' && (
                      <div className="kcal-dial-center-sub" style={{ color: '#555', marginTop: '4px' }}>
                        {`obiettivo ${Math.round(targetCarb)} g`}
                      </div>
                    )}
                    {activeDialMode === 'fat' && (
                      <div className="kcal-dial-center-sub" style={{ color: '#555', marginTop: '4px' }}>
                        {`obiettivo ${Math.round(targetFat)} g`}
                      </div>
                    )}
                    {activeDialMode === 'kcal' && !selectedMealCenter ? (
                      <button
                        type="button"
                        className="kcal-dial-details-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowCalorieDetailsSheet?.(true);
                        }}
                      >
                        DETTAGLI
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
              <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
                {showKcalTelemetryRings && telemetry ? (
                  <KcalFuelTelemetryRing
                    consumedKcal={telemetry.consumedKcal}
                    dailyTargetKcal={dialDailyTargetKcal}
                    maxScaleKcal={telemetry.maxScaleKcal}
                  />
                ) : null}
                <Suspense fallback={<KentuLazySectionFallback label="Grafico pasti…" />}>
                  <HomeMealPieDial
                    mealPieDisplayData={mealPieDisplayData}
                    selectedMealCenterIndex={selectedMealCenterIndex}
                    selectedMealCenter={selectedMealCenter}
                    onSelectMealCenter={setSelectedMealCenter}
                    onPieSliceClick={(data, _index, e) => {
                      if (e && e.stopPropagation) e.stopPropagation();
                      if (data.id === 'rimanenti' || data.id === 'surplus') return;
                      const pastoCorrente = mealPieDisplayData.find((m) => m?.id === data.id);
                      if (!pastoCorrente) {
                        console.warn('[SalaComandi] meal pie entry not found', { id: data.id });
                        return;
                      }
                      const compositeId = String(pastoCorrente.id);
                      if (selectedMealCenter && selectedMealCenter.id === data.id) {
                        loadMealToConstructor?.(compositeId);
                        return;
                      }
                      setSelectedMealCenter?.(pastoCorrente);
                      setSelectedNodeReport?.(null);
                    }}
                  />
                </Suspense>
                {showMaintenanceMarker ? (
                  <DialMaintenanceMarker
                    tdeeRatio={maintenanceMarkerRatio}
                    isDeficit={maintenanceMarkerIsDeficit}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex w-full flex-col gap-2 box-border shrink-0"
          style={{ width: '100%', padding: '0 14px', boxSizing: 'border-box' }}
        >
          <HomeNutrientStrip
            totali={totali}
            targets={effectiveTargetsForCurrentDate}
            targetProt={effectiveTargetsForCurrentDate?.prot ?? userTargets?.prot ?? 150}
            targetCarb={effectiveTargetsForCurrentDate?.carb ?? userTargets?.carb ?? 200}
            targetFat={
              effectiveTargetsForCurrentDate?.fatTotal
              ?? effectiveTargetsForCurrentDate?.fat
              ?? userTargets?.fatTotal
              ?? userTargets?.fat
              ?? 65
            }
            onProteinClick={() => setShowProteinSheet?.(true)}
            onCarbsClick={() => setShowCarbsSheet?.(true)}
            onFatClick={() => setShowFatSheet?.(true)}
            onMineralsClick={() => setShowMineralsSheet?.(true)}
            onVitaminsClick={() => setShowVitaminsSheet?.(true)}
          />
          <TrainingBlockWidget
            db={db}
            userUid={user?.uid ?? null}
            todayIso={homeDayKey}
            userProfile={userProfile}
            fourCylinder={userModel?.fourCylinder ?? null}
            fullHistory={fullHistory}
            activeLog={activeLog}
            userTargets={userTargets}
            bodyMetricsHistory={bodyMetricsHistory}
            heightCm={Number(userProfile?.height) || Number(userProfile?.altezza) || null}
            isSimulationMode={isSimulationMode}
            onConfirmSession={handleConfirmTrainingBlockSession}
            onPostponeSession={handlePostponeTrainingBlockSession}
            onExecuteSession={handleExecuteTrainingBlockSession}
            onOpenTrendDiag={handleOpenTrendDiag}
            onOpenLongevity={handleOpenTrendSalute}
            onOpenProgressione={handleOpenTrendProgressione}
            creatorOpen={trainingBlockCreatorOpen}
            onCreatorOpenChange={setTrainingBlockCreatorOpen}
            longevityResult={longevityResult}
          />
          <MetabolicMonitorCard
            metabolicSnapshot={metabolicSnapshot}
            missingSleepData={missingSleep}
            onClick={() => {
              if (missingSleep) {
                setShowSleepPrompt?.(true);
                return;
              }
              setShowMetabolicSheet?.(true);
            }}
            onCenterTap={() => {
              if (missingSleep) {
                setShowSleepPrompt?.(true);
                return;
              }
              if (typeof onOpenDiario === 'function') onOpenDiario();
              else setShowDiarySheet?.(true);
            }}
          />
        </div>
      </div>
    </div>
  );
}
