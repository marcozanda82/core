import React from 'react';
import { createPortal } from 'react-dom';
import PlanningWizard from '../../PlanningWizard';
import PesataDrawer from '../../components/drawers/PesataDrawer';

export default function OverlayHost({
  showUnsavedMealWarning,
  setShowUnsavedMealWarning,
  finalizeMealBuilderCloseEmpty,
  showWeightModal,
  setShowWeightModal,
  inputWeightDate,
  setInputWeightDate,
  inputWeight,
  setInputWeight,
  inputFat,
  setInputFat,
  drawerMuscleMass,
  setDrawerMuscleMass,
  drawerBodyWater,
  setDrawerBodyWater,
  drawerVisceralFat,
  setDrawerVisceralFat,
  handleSaveBodyMetrics,
  planningWizardOverlayOpen,
  setPlanningWizardOverlayOpen,
  activeLog,
  userTargets,
  kentuDailyCalorieStrategy,
  planningWizardBurnedKcal,
  remotePlanning,
  planningWizardInitialMeals,
  planningWizardHydrateNonce,
  weeklyPlan,
  planningDateKey,
  handlePlanningWizardConfirm,
  handleGeneratePlanGhostMealDraft,
  showUndoToast,
  handleUndo,
  bodyMetricsSaveToast,
}) {
  return (
    <>
      {showUnsavedMealWarning &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-meal-warning-title"
            onClick={() => setShowUnsavedMealWarning(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100050,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              background: 'rgba(0,0,0,0.72)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 360,
                borderRadius: 16,
                padding: '22px 20px 18px',
                background: 'linear-gradient(165deg, #1e2128 0%, #12141a 100%)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 24px 48px rgba(0,0,0,0.55)',
              }}
            >
              <h3
                id="unsaved-meal-warning-title"
                style={{
                  margin: '0 0 12px',
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  color: '#f5f5f5',
                  letterSpacing: '0.02em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span aria-hidden>⚠️</span> Attenzione
              </h3>
              <p style={{ margin: '0 0 22px', fontSize: '0.9rem', lineHeight: 1.5, color: 'rgba(226,232,240,0.88)' }}>
                Hai inserito degli alimenti che non sono stati salvati. Sei sicuro di voler uscire perdendo le modifiche?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowUnsavedMealWarning(false)}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid rgba(0,229,255,0.35)',
                    background: 'rgba(0,229,255,0.12)',
                    color: '#00e5ff',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Resta
                </button>
                <button
                  type="button"
                  onClick={finalizeMealBuilderCloseEmpty}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid rgba(248,113,113,0.45)',
                    background: 'rgba(248,113,113,0.12)',
                    color: '#f87171',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Esci e perdi dati
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <PesataDrawer
        showWeightModal={showWeightModal}
        setShowWeightModal={setShowWeightModal}
        inputWeightDate={inputWeightDate}
        setInputWeightDate={setInputWeightDate}
        inputWeight={inputWeight}
        setInputWeight={setInputWeight}
        inputFat={inputFat}
        setInputFat={setInputFat}
        drawerMuscleMass={drawerMuscleMass}
        setDrawerMuscleMass={setDrawerMuscleMass}
        drawerBodyWater={drawerBodyWater}
        setDrawerBodyWater={setDrawerBodyWater}
        drawerVisceralFat={drawerVisceralFat}
        setDrawerVisceralFat={setDrawerVisceralFat}
        handleSaveBodyMetrics={handleSaveBodyMetrics}
      />

      {planningWizardOverlayOpen &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 100025,
              background: 'rgba(0,0,0,0.88)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => setPlanningWizardOverlayOpen(false)}
            role="presentation"
          >
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 400, maxHeight: '90vh', overflow: 'auto' }}>
              <PlanningWizard
                dailyLog={activeLog || []}
                userTargets={userTargets}
                calorieStrategy={kentuDailyCalorieStrategy}
                burnedKcalBonus={planningWizardBurnedKcal}
                firebasePlanning={remotePlanning}
                initialMeals={planningWizardInitialMeals}
                hydrateNonce={planningWizardHydrateNonce}
                weeklyPlan={weeklyPlan}
                planningDateKey={planningDateKey}
                onClose={() => setPlanningWizardOverlayOpen(false)}
                onConfirmApply={handlePlanningWizardConfirm}
                onGeneratePlanGhostMealDraft={handleGeneratePlanGhostMealDraft}
              />
            </div>
          </div>,
          document.body
        )}

      {showUndoToast && (
        <div style={{ position: 'fixed', bottom: 'calc(80px + 75px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)', zIndex: 10001, display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', background: '#1a1a1c', border: '1px solid #333', borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          <span style={{ color: '#e0e0e0', fontSize: '0.9rem' }}>Orario modificato</span>
          <button type="button" onClick={handleUndo} style={{ padding: '8px 16px', fontSize: '0.8rem', fontWeight: 'bold', background: 'rgba(0, 229, 255, 0.15)', border: '1px solid #00e5ff', borderRadius: '10px', color: '#00e5ff', cursor: 'pointer' }}>
            ANNULLA
          </button>
        </div>
      )}

      {bodyMetricsSaveToast && (
        <div style={{ position: 'fixed', bottom: 'calc(80px + 75px + env(safe-area-inset-bottom, 0px))', left: '50%', transform: 'translateX(-50%)', zIndex: 100021, padding: '12px 22px', background: '#1a1a1c', border: '1px solid #00e676', borderRadius: '16px', boxShadow: '0 8px 24px rgba(0,230,118,0.2)' }} role="status">
          <span style={{ color: '#00e676', fontSize: '0.9rem', fontWeight: '600' }}>Pesata registrata con successo!</span>
        </div>
      )}
    </>
  );
}
