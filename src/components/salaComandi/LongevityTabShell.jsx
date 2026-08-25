/**
 * Tab Longevità: shell scrollabile + LongevityView lazy.
 */

import { lazy, Suspense } from 'react';
import KentuLazySectionFallback from '../KentuLazySectionFallback';

const LongevityView = lazy(() => import('../../LongevityView'));

export default function LongevityTabShell({
  longevityData = null,
  userAge = null,
  bodyMetricsHistory = null,
  longevityScoreHistory = [],
  currentTrackerDate = null,
  fullHistory = null,
  userTargets = null,
  userProfile = null,
  handleUpdateTDEE = null,
  tdeeHistory = null,
  predictiveCalibration = null,
  handleCSVUpload = null,
  handleQuickWeighInFromHistory = null,
  handleDeleteBodyMetrics = null,
  pastDaysStorico = null,
  weeklyTrendData = null,
  weeklyMicrosTotals = null,
  weeklyKcalChartReference = null,
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        paddingBottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          width: '100%',
        }}
      >
        <Suspense fallback={<KentuLazySectionFallback label="Longevità…" />}>
          <LongevityView
            data={longevityData}
            minimalOnly={false}
            showPriorityFocus
            userAge={userAge}
            bodyMetricsHistory={bodyMetricsHistory}
            scoreHistory={longevityScoreHistory}
            periodAnchorDate={currentTrackerDate}
            fullHistory={fullHistory}
            userTargets={userTargets}
            userProfile={userProfile}
            onUpdateTDEE={handleUpdateTDEE}
            tdeeHistory={tdeeHistory}
            predictionCalibration={predictiveCalibration}
            onBalanceCsvImport={handleCSVUpload}
            onQuickWeighInSubmit={handleQuickWeighInFromHistory}
            onDeleteBodyMetrics={handleDeleteBodyMetrics}
            pastDaysStorico={pastDaysStorico}
            weeklyTrendData={weeklyTrendData}
            weeklyMicrosTotals={weeklyMicrosTotals}
            weeklyKcalChartReference={weeklyKcalChartReference}
          />
        </Suspense>
      </div>
    </div>
  );
}
