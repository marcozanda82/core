import React, { useMemo } from 'react';
import MealDialPieChart from '../charts/MealDialPieChart';

/**
 * Cruscotto essenziale tab Oggi (utenti non Pro): tachimetro pasti, macro, fase metabolica.
 * Solo props — la logica di tap sulla torta è locale ma usa solo callback/dati passati.
 */
export default function EssentialTodayCruscotto({
  userTargets,
  totali,
  dynamicDailyKcal,
  baseKcal,
  activeDialMode,
  setActiveDialMode,
  selectedMealCenter,
  setSelectedMealCenter,
  setSelectedNodeReport,
  mealPieDisplayData,
  selectedMealCenterIndex,
  loadMealToConstructor,
  setDailyMacroSheetOpen,
  handleOpenAiCoachSuggestionModal,
  setIsAiCoachBulbHovered,
  isAiCoachSuggestionActive,
  isAiCoachInsightArmed,
  isAiCoachBulbHovered,
  aiCoachBulbPulseCycles,
}) {
  const dial = useMemo(() => {
    const targetProt = userTargets?.prot ?? 150;
    const targetCarb = userTargets?.carb ?? 200;
    const targetFat = userTargets?.fatTotal ?? userTargets?.fat ?? 65;
    const dialDailyTargetKcal = Math.round(
      Number(dynamicDailyKcal) || Number(baseKcal) || Number(userTargets?.kcal ?? 2500),
    );
    const dialConsumedKcal = Math.round(Number(totali?.kcal) || 0);
    const dialKcalSurplus =
      dialConsumedKcal > dialDailyTargetKcal ? dialConsumedKcal - dialDailyTargetKcal : 0;
    const dialKcalRemaining = Math.max(0, dialDailyTargetKcal - dialConsumedKcal);
    return {
      targetProt,
      targetCarb,
      targetFat,
      dialDailyTargetKcal,
      dialConsumedKcal,
      dialKcalSurplus,
      dialKcalRemaining,
    };
  }, [userTargets, totali, dynamicDailyKcal, baseKcal]);

  const {
    targetProt,
    targetCarb,
    targetFat,
    dialDailyTargetKcal,
    dialConsumedKcal,
    dialKcalSurplus,
    dialKcalRemaining,
  } = dial;

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '8px', padding: '4px 14px 0', marginBottom: 0, overflowX: 'hidden', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', flex: 1, minHeight: 0 }}>
        <div
          style={{ position: 'relative', width: '310px', height: '310px', margin: '0 auto 0 auto', zIndex: 10, flexShrink: 0 }}
          onClick={() => {
            setSelectedMealCenter(null);
            setActiveDialMode('kcal');
          }}
        >
          <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'visible' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenAiCoachSuggestionModal();
              }}
              onMouseEnter={() => setIsAiCoachBulbHovered(true)}
              onMouseLeave={() => setIsAiCoachBulbHovered(false)}
              disabled={!isAiCoachSuggestionActive || !isAiCoachInsightArmed}
              aria-label={isAiCoachSuggestionActive && isAiCoachInsightArmed ? 'Apri suggerimento metabolico' : 'Nessun suggerimento metabolico attivo'}
              title={isAiCoachSuggestionActive && isAiCoachInsightArmed ? 'Suggerimento attivo' : 'Nessun suggerimento attivo'}
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                zIndex: 2,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 999,
                width: 32,
                height: 32,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                lineHeight: 1,
                padding: 0,
                cursor: isAiCoachSuggestionActive && isAiCoachInsightArmed ? 'pointer' : 'default',
                color: isAiCoachSuggestionActive && isAiCoachInsightArmed ? '#facc15' : '#64748b',
                opacity: isAiCoachSuggestionActive && isAiCoachInsightArmed ? 0.85 : 0.55,
                transform: isAiCoachBulbHovered && isAiCoachSuggestionActive && isAiCoachInsightArmed ? 'scale(1.1)' : 'scale(1)',
                transition: 'transform 140ms ease, opacity 180ms ease, box-shadow 180ms ease',
                animation: isAiCoachSuggestionActive && isAiCoachInsightArmed && aiCoachBulbPulseCycles > 0
                  ? `pulseDot 460ms ease-in-out ${aiCoachBulbPulseCycles}`
                  : 'none',
                boxShadow: isAiCoachSuggestionActive && isAiCoachInsightArmed ? '0 0 5px rgba(250,204,21,0.12)' : 'none',
              }}
            >
              💡
            </button>
            <div
              className={selectedMealCenter ? 'tachimeter-center tachimeter-center-reset' : 'tachimeter-center'}
              onClick={(e) => {
                e.stopPropagation();
                if (selectedMealCenter && selectedMealCenter.id && selectedMealCenter.id !== 'rimanenti') {
                  loadMealToConstructor(String(selectedMealCenter.id));
                  return;
                }
                setDailyMacroSheetOpen(true);
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
              title={!selectedMealCenter ? 'Apri raggi X giornalieri' : undefined}
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
                      {Math.round(selectedMealCenter.kcal ?? selectedMealCenter.value ?? 0)} kcal
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
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', pointerEvents: 'none' }}>
                  <div
                    style={{
                      fontSize: '3rem',
                      fontWeight: 'bold',
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
                      <span style={{ fontSize: '2.35rem', letterSpacing: '0.02em' }}>
                        + {dialKcalSurplus}{' '}
                        <span style={{ fontSize: '0.42em', fontWeight: 700 }}>kcal</span>
                      </span>
                    )}
                    {activeDialMode === 'kcal' && dialKcalSurplus <= 0 && dialKcalRemaining}
                    {activeDialMode === 'pro' && Math.round(totali?.prot || 0)}
                    {activeDialMode === 'cho' && Math.round(totali?.carb || 0)}
                    {activeDialMode === 'fat' && Math.round(totali?.fatTotal ?? totali?.fat ?? 0)}
                  </div>
                  <div style={{ color: '#888', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '2px' }}>
                    {activeDialMode === 'kcal' && (dialKcalSurplus > 0 ? 'SURPLUS' : 'restanti')}
                    {activeDialMode === 'pro' && 'g Proteine'}
                    {activeDialMode === 'cho' && 'g Carboidrati'}
                    {activeDialMode === 'fat' && 'g Grassi'}
                  </div>
                  <div style={{ color: '#555', fontSize: '0.8rem', marginTop: '4px' }}>
                    {activeDialMode === 'kcal' &&
                      (dialKcalSurplus > 0
                        ? `obiettivo ${dialDailyTargetKcal} kcal · assunte ${dialConsumedKcal}`
                        : `obiettivo ${dialDailyTargetKcal} kcal`)}
                    {activeDialMode === 'pro' && `obiettivo ${Math.round(targetProt)} g`}
                    {activeDialMode === 'cho' && `obiettivo ${Math.round(targetCarb)} g`}
                    {activeDialMode === 'fat' && `obiettivo ${Math.round(targetFat)} g`}
                  </div>
                </div>
              )}
            </div>
            <div style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
              <MealDialPieChart
                mealPieDisplayData={mealPieDisplayData}
                selectedMealCenterIndex={selectedMealCenterIndex}
                selectedMealCenter={selectedMealCenter}
                onMealLabelClick={(fullEntry) => {
                  if (!fullEntry || fullEntry.id === 'rimanenti') return;
                  setSelectedMealCenter(fullEntry);
                }}
                onPieSliceClick={(data, index, e) => {
                  if (e && e.stopPropagation) e.stopPropagation();
                  if (data.id === 'rimanenti') return;
                  const pastoCorrente = mealPieDisplayData.find((m) => m?.id === data.id);
                  if (!pastoCorrente) {
                    console.warn('[EssentialTodayCruscotto] meal pie entry not found', { id: data.id });
                    return;
                  }
                  const compositeId = String(pastoCorrente.id);
                  if (selectedMealCenter && selectedMealCenter.id === data.id) {
                    loadMealToConstructor(compositeId);
                    return;
                  }
                  setSelectedMealCenter(pastoCorrente);
                  setSelectedNodeReport(null);
                }}
              />
            </div>
          </div>
        </div>
        <div style={{ flexGrow: 1, minHeight: '2vh' }} aria-hidden />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%', marginBottom: '16px', gap: '8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '4px', width: '100%', flexShrink: 0 }}>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  setActiveDialMode('pro');
                }
              }}
              onClick={(ev) => {
                ev.stopPropagation();
                setActiveDialMode('pro');
              }}
              style={{
                flex: 1,
                background: '#1a1a1c',
                border: activeDialMode === 'pro' ? '1px solid #b666d2' : '1px solid #333',
                borderRadius: '12px',
                padding: '8px 4px',
                textAlign: 'center',
                boxShadow:
                  activeDialMode === 'pro'
                    ? '0 0 0 2px rgba(182, 102, 210, 0.45), 0 4px 14px rgba(182, 102, 210, 0.2)'
                    : '0 4px 10px rgba(0,0,0,0.5)',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              <div style={{ color: '#b666d2', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', whiteSpace: 'nowrap' }}>Proteine</div>
              <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                {Math.round(totali?.prot || 0)} <span style={{ color: '#555', fontSize: '0.75rem' }}>/ {Math.round(targetProt)} g</span>
              </div>
            </div>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  setActiveDialMode('cho');
                }
              }}
              onClick={(ev) => {
                ev.stopPropagation();
                setActiveDialMode('cho');
              }}
              style={{
                flex: 1,
                background: '#1a1a1c',
                border: activeDialMode === 'cho' ? '1px solid #00ff88' : '1px solid #333',
                borderRadius: '12px',
                padding: '8px 4px',
                textAlign: 'center',
                boxShadow:
                  activeDialMode === 'cho'
                    ? '0 0 0 2px rgba(0, 255, 136, 0.35), 0 4px 14px rgba(0, 255, 136, 0.15)'
                    : '0 4px 10px rgba(0,0,0,0.5)',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              <div style={{ color: '#00ff88', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', whiteSpace: 'nowrap' }}>Carboidrati</div>
              <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                {Math.round(totali?.carb || 0)} <span style={{ color: '#555', fontSize: '0.75rem' }}>/ {Math.round(targetCarb)} g</span>
              </div>
            </div>
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  setActiveDialMode('fat');
                }
              }}
              onClick={(ev) => {
                ev.stopPropagation();
                setActiveDialMode('fat');
              }}
              style={{
                flex: 1,
                background: '#1a1a1c',
                border: activeDialMode === 'fat' ? '1px solid #ffd700' : '1px solid #333',
                borderRadius: '12px',
                padding: '8px 4px',
                textAlign: 'center',
                boxShadow:
                  activeDialMode === 'fat'
                    ? '0 0 0 2px rgba(255, 215, 0, 0.4), 0 4px 14px rgba(255, 215, 0, 0.12)'
                    : '0 4px 10px rgba(0,0,0,0.5)',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              <div style={{ color: '#ffd700', fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px', whiteSpace: 'nowrap' }}>Grassi</div>
              <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                {Math.round(totali?.fatTotal ?? totali?.fat ?? 0)} <span style={{ color: '#555', fontSize: '0.75rem' }}>/ {Math.round(targetFat)} g</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
