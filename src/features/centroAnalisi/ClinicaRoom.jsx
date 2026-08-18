import React, { useMemo } from 'react';
import SaluteClinicalInsight from '../trendHub/components/SaluteClinicalInsight';
import SaluteGlycemicRiskBar from '../trendHub/components/SaluteGlycemicRiskBar';
import { useHealthDailyReport } from '../trendHub/hooks/useHealthDailyReport';
import { buildBiometricsHealthSnapshot } from '../trendHub/utils/healthBiometrics';
import {
  resolveHealthAnalysisDate,
  selectDayLogFromStoricoNode,
  selectStoricoDayNode,
} from '../trendHub/utils/healthContextSelectors';
import {
  averageMuscleResidual,
  buildGlycemicRiskBreakdown,
  computeGlycemicRiskPercent,
  formatFastingHoursLabel,
  REFERENCE_HEIGHT_CM,
  resolveMorningSleepForInsight,
} from '../trendHub/utils/saluteDashboardMetrics';
import {
  buildSaluteLongevityWindow,
  LONGEVITY_WINDOW_DAYS,
} from '../trendHub/utils/saluteHistorySeries';
import HealthReportView from '../health/HealthReportView';
import TherapyPlanView from '../health/TherapyPlanView';
import TherapyPlanReadOnlyPanel from './TherapyPlanReadOnlyPanel';
import { GLASS_SURFACE_CLASS } from './glassStyles';

function GlassSpinner({ label = 'Sincronizzo i dati clinici…' }) {
  return (
    <section
      className={`flex min-h-[18rem] flex-col items-center justify-center gap-4 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-busy
      aria-live="polite"
    >
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-emerald-300"
        aria-hidden
      />
      <p className="text-sm text-zinc-400">{label}</p>
    </section>
  );
}

function GlassNotice({ title, body }) {
  return (
    <section
      className={`flex min-h-[14rem] flex-col items-center justify-center gap-2 rounded-2xl px-6 py-10 text-center ${GLASS_SURFACE_CLASS}`}
      aria-live="polite"
    >
      <h2 className="text-lg font-semibold text-zinc-50">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-zinc-400">{body}</p>
    </section>
  );
}

/**
 * TherapyPlanView non espone embedded/readOnly: in modalità clinica usiamo
 * il pannello parallelo con la stessa sorgente Firestore (fetchTherapyPlan).
 */
function TherapyPlanClinicaSlot({ uid, patientName, readOnly = true }) {
  if (readOnly) {
    return <TherapyPlanReadOnlyPanel uid={uid} patientName={patientName} />;
  }
  return <TherapyPlanView uid={uid} patientName={patientName} />;
}

/**
 * Stanza Clinica — rischio glicemico, insight IA, report e terapia in sola lettura.
 * Non modifica SnapshotHub / SaluteView / trendHub / health/.
 */
export default function ClinicaRoom({ store }) {
  const {
    ready,
    isAuthenticated,
    db,
    uid,
    todayDate,
    fullHistory,
    activeLog,
    bodyMetricsHistory,
    userProfile,
    fourCylinder,
    fastingData,
  } = store || {};

  const metricsHistory = Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : [];
  const patientName = String(userProfile?.displayName || userProfile?.name || '').trim();

  const heightCm = useMemo(() => {
    const fromProfile = Number(userProfile?.height ?? userProfile?.heightCm);
    return fromProfile > 0 ? fromProfile : REFERENCE_HEIGHT_CM;
  }, [userProfile]);

  const biometricsSnapshot = useMemo(
    () => buildBiometricsHealthSnapshot(metricsHistory),
    [metricsHistory],
  );

  const analysisDate = useMemo(
    () => resolveHealthAnalysisDate(todayDate),
    [todayDate],
  );

  const yesterdayLog = useMemo(
    () => selectDayLogFromStoricoNode(selectStoricoDayNode(fullHistory, analysisDate)),
    [fullHistory, analysisDate],
  );

  const morningSleep = useMemo(
    () => resolveMorningSleepForInsight(null, {
      todayDate,
      fullHistory,
      activeLog,
      todayLog: activeLog,
      activeLogIsToday: true,
    }),
    [todayDate, fullHistory, activeLog],
  );

  const longevityWindow = useMemo(
    () => buildSaluteLongevityWindow({
      fullHistory,
      bodyMetricsHistory: metricsHistory,
      todayDate,
      days: LONGEVITY_WINDOW_DAYS,
      todayLiveLog: activeLog,
    }),
    [fullHistory, metricsHistory, todayDate, activeLog],
  );

  const health = useHealthDailyReport({
    db,
    uid,
    enabled: isAuthenticated && ready,
    todayDate,
    yesterdayLog,
    analysisDate,
    foodDatabase: {},
    setFoodDb: null,
    morningSleepLog: morningSleep,
  });

  const hoursFasted = Number.isFinite(Number(fastingData?.hoursFasted))
    ? Number(fastingData.hoursFasted)
    : null;

  const glycemic = useMemo(
    () => computeGlycemicRiskPercent({
      hoursFasted,
      fourCylinder,
      waistCm: biometricsSnapshot.waistCm ?? longevityWindow.waistCm,
      heightCm,
    }),
    [hoursFasted, fourCylinder, biometricsSnapshot.waistCm, longevityWindow.waistCm, heightCm],
  );

  const glycemicBreakdown = useMemo(
    () => buildGlycemicRiskBreakdown({
      sleepAvgHours: longevityWindow.sleepAvgHours,
      cardioMinutesTotal: longevityWindow.cardioMinutesTotal,
      hoursFasted,
      activeLog,
      activeLogIsToday: true,
      todayDate,
      fullHistory,
      whtr: glycemic.whtr,
    }),
    [
      longevityWindow.sleepAvgHours,
      longevityWindow.cardioMinutesTotal,
      hoursFasted,
      activeLog,
      todayDate,
      fullHistory,
      glycemic.whtr,
    ],
  );

  const muscleAvg = averageMuscleResidual(fourCylinder);
  const muscleLabel = muscleAvg == null ? 'n/d' : `${Math.round(muscleAvg * 100)}%`;
  const fastingLabel = fastingData?.timeString || formatFastingHoursLabel(hoursFasted);

  if (!ready) {
    return <GlassSpinner />;
  }

  if (!isAuthenticated) {
    return (
      <GlassNotice
        title="Dati non disponibili"
        body="Accedi da KentuOS per leggere insight clinici, report e piano terapeutico."
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <SaluteGlycemicRiskBar
        riskPercent={glycemic.riskPercent}
        hoursFastedLabel={fastingLabel}
        muscleLabel={muscleLabel}
        whtr={glycemic.whtr}
        breakdown={glycemicBreakdown}
      />

      <SaluteClinicalInsight
        report={health.report}
        analysisDate={health.analysisDate || analysisDate}
        status={health.status}
        errorMessage={health.errorMessage}
        isRefreshing={health.isRefreshing}
        onRefresh={health.refresh}
      />

      <section
        className={`overflow-hidden rounded-2xl ${GLASS_SURFACE_CLASS}`}
        aria-label="Report medico diabete"
      >
        <HealthReportView uid={uid} patientName={patientName} embedded />
      </section>

      <TherapyPlanClinicaSlot uid={uid} patientName={patientName} readOnly />
    </div>
  );
}
