/**
 * Tab Planning: wizard CTA + piano settimanale.
 */

import { lazy, Suspense } from 'react';
import KentuLazySectionFallback from '../KentuLazySectionFallback';
import { getTodayString } from '../../coreEngine';

const WeeklyPlanning = lazy(() => import('../WeeklyPlanning'));

export default function PlanningTabPanel({
  weeklyPlan = null,
  setWeeklyPlan = null,
  currentTrackerDate = null,
  userTargets = null,
  setPlanningWizardHydrateNonce = null,
  setPlanningWizardOverlayOpen = null,
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        padding: '20px 16px',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        width: '100%',
        boxSizing: 'border-box',
        gap: 14,
      }}
    >
      <p style={{ margin: 0, fontSize: '0.88rem', color: 'rgba(200,210,220,0.95)', lineHeight: 1.45 }}>
        Pianifica attività, fasce orarie e pasti (ghost) per oggi. I dati confermati restano su Firebase sotto{' '}
        <code style={{ fontSize: '0.75rem', color: '#7dd3fc' }}>planning/</code>.
      </p>
      <button
        type="button"
        onClick={() => {
          setPlanningWizardHydrateNonce?.((n) => n + 1);
          setPlanningWizardOverlayOpen?.(true);
        }}
        style={{
          padding: '14px 18px',
          borderRadius: 14,
          border: '1px solid rgba(0, 229, 255, 0.45)',
          background: 'rgba(0, 229, 255, 0.15)',
          color: '#e0faff',
          fontWeight: 800,
          fontSize: '0.9rem',
          cursor: 'pointer',
        }}
      >
        Apri pianificazione guidata
      </button>
      <div
        style={{
          marginTop: 8,
          paddingTop: 18,
          borderTop: '1px solid rgba(255,255,255,0.12)',
        }}
      >
        <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#e8f4ff' }}>Piano settimanale</h3>
        <Suspense fallback={<KentuLazySectionFallback label="Pianificazione…" />}>
          <WeeklyPlanning
            value={weeklyPlan}
            onChange={setWeeklyPlan}
            anchorDate={new Date(`${currentTrackerDate || getTodayString()}T12:00:00`)}
            profileDailyKcal={Number(userTargets?.kcal) || 2000}
          />
        </Suspense>
      </div>
    </div>
  );
}
