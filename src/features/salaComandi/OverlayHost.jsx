import React, { Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import PesataDrawer from '../../components/drawers/PesataDrawer';

const PlanningWizard = lazy(() => import('../../PlanningWizard'));

export default function OverlayHost({
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
              <Suspense fallback={null}>
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
              </Suspense>
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
