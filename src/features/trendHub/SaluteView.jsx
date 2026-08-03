import React from 'react';
import BiometricsHealthCard from './components/BiometricsHealthCard';
import HealthFoodQualityCard from './components/HealthFoodQualityCard';
import SleepTrackerWidget from './components/SleepTrackerWidget';
import { useHealthDailyReport } from './hooks/useHealthDailyReport';
import { useSleepLog } from './hooks/useSleepLog';

/**
 * Emisfero Salute — layout P2 a due macro-sezioni:
 * 1) Metriche fisiche (biometriche + sonno)
 * 2) Analisi qualitativa (referto IA)
 *
 * Contratto snello P1 (da TrendHub / useHealthContext):
 * - recentBodyMetrics, yesterdayLog, relevantFoodDatabase, analysisDate
 */
export default function SaluteView({
  recentBodyMetrics = [],
  yesterdayLog = [],
  analysisDate = '',
  relevantFoodDatabase = {},
  onSaveBiometrics = null,
  todayDate = '',
  db = null,
  uid = null,
  setFoodDb = null,
  enabled = true,
} = {}) {
  const sleep = useSleepLog({
    db,
    uid,
    date: todayDate,
    enabled,
  });

  const health = useHealthDailyReport({
    db,
    uid,
    enabled,
    todayDate,
    yesterdayLog,
    analysisDate,
    foodDatabase: relevantFoodDatabase,
    setFoodDb,
    morningSleepLog: sleep.entry,
  });

  return (
    <div className="trend-salute-view" role="region" aria-label="Area Salute">
      <section
        className="trend-salute-section"
        aria-labelledby="salute-metrics-heading"
      >
        <header className="trend-salute-section__head">
          <h2 id="salute-metrics-heading" className="trend-salute-section__title">
            Metriche fisiche
          </h2>
          <p className="trend-salute-section__subtitle">
            Controllo quotidiano · corpo e recupero
          </p>
        </header>
        <div className="trend-salute-section__stack">
          <BiometricsHealthCard
            recentBodyMetrics={recentBodyMetrics}
            onSaveBiometrics={onSaveBiometrics}
            todayDate={todayDate}
          />
          <SleepTrackerWidget
            entry={sleep.entry}
            hydrated={sleep.hydrated}
            saving={sleep.saving}
            errorMessage={sleep.errorMessage}
            onSave={sleep.save}
            onSaved={() => {
              if (health.report && !health.report.sleepCorrelationInsight) {
                void health.refresh();
              }
            }}
          />
        </div>
      </section>

      <section
        className="trend-salute-section trend-salute-section--analysis"
        aria-labelledby="salute-analysis-heading"
      >
        <header className="trend-salute-section__head">
          <h2 id="salute-analysis-heading" className="trend-salute-section__title">
            Analisi qualitativa
          </h2>
          <p className="trend-salute-section__subtitle">
            Referto IA su cibo di ieri e recupero
          </p>
        </header>
        <div className="trend-salute-section__stack">
          <HealthFoodQualityCard
            report={health.report}
            analysisDate={health.analysisDate || analysisDate}
            status={health.status}
            errorMessage={health.errorMessage}
            isRefreshing={health.isRefreshing}
            unknownCount={health.unknownCount}
            foodCount={health.foodCount}
            onRefresh={health.refresh}
          />
        </div>
      </section>
    </div>
  );
}
