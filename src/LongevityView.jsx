import React, { useMemo, useState } from 'react';
import {
  getAverageForPeriod,
  calculateConsolidatedAverageScore as calculateAverageScore,
  calculateProjectedAge,
} from './longevityStats';
import { computeTotali } from './useBiochimico';
import { calculateMetabolicVariance, KCAL_PER_KG_BODY_MASS } from './metabolicEngine';
import {
  getTodayString,
  computeDayEvaluations,
  addDays,
  TRACKER_STORICO_KEY,
  getLogFromStoricoTree,
  computeRiskMatrix,
  getSlotKey,
  getEquivalentMealTypes,
} from './coreEngine';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

function getColor(value) {
  if (value >= 75) return '#22c55e'; // verde
  if (value >= 50) return '#facc15'; // giallo
  return '#ef4444'; // rosso
}

const MATRIX_PILLAR_LABELS = {
  metabolic: 'Metabolico',
  cardio: 'Cardiovascolare',
  inflammatory: 'Infiammatorio',
  neuro: 'Neuro / sonno',
};

/** Stessi indicatori e label del modal «Report Giornaliero» in SalaComandi.jsx */
const DAY_STAR_EVAL_ROWS = [
  { key: 'muscle', label: 'Crescita Muscolare', emoji: '💪' },
  { key: 'fat', label: 'Perdita di Grasso', emoji: '🔥' },
  { key: 'neuro', label: 'Recupero Neurologico', emoji: '🧠' },
  { key: 'fast', label: 'Pulizia Cellulare (Digiuno)', emoji: '🕐' },
];

const SECTION_CARD = {
  background: '#111',
  padding: 16,
  borderRadius: 12,
  marginBottom: 24,
  border: '1px solid #333',
};

const PILLAR_KEYS = ['metabolic', 'cardio', 'inflammatory', 'neuro'];

function combinedDayLog(trackerData, dateStr) {
  if (!trackerData || !dateStr) return [];
  const log = getLogFromStoricoTree(trackerData, dateStr) || [];
  const node = trackerData[TRACKER_STORICO_KEY(dateStr)];
  const manual = Array.isArray(node?.manualNodes) ? node.manualNodes : [];
  return [...log, ...manual];
}

function dayLogQualifiesForStarEval(L) {
  const foods = L.filter((e) => e.type === 'food' || e.type === 'recipe');
  return foods.length > 0 || L.some((e) => e.type === 'sleep' || e.type === 'workout');
}

/** `periodEndDate` = ultimo giorno incluso (es. ieri rispetto all’anchor del tracker). */
function collectDayLogsInWindow(trackerData, periodEndDate, timeWindow) {
  const out = [];
  const tw = Math.max(1, Math.min(366, Number(timeWindow) || 1));
  for (let i = 0; i < tw; i++) {
    const dStr = addDays(periodEndDate, -i);
    const L = combinedDayLog(trackerData, dStr);
    if (dayLogQualifiesForStarEval(L)) out.push(L);
  }
  return out;
}

/**
 * Media nutrizionale/biochimica su più giorni → un log sintetico per una sola chiamata a computeDayEvaluations.
 * Un solo giorno valido: restituisce il log reale.
 */
function buildMediatedVirtualLog(dayLogs) {
  if (!dayLogs.length) return null;
  if (dayLogs.length === 1) return dayLogs[0];

  const n = dayLogs.length;
  let sumP = 0;
  let sumK = 0;
  let sumC = 0;
  let hpSum = 0;
  let dChoSum = 0;
  let nSleep = 0;
  let sumSleep = 0;
  let anyStrength = false;
  let anyLateCaffeine = false;
  let anyWorkout = false;
  let sumFirst = 0;
  let sumLast = 0;
  let nWithFoods = 0;

  for (const L of dayLogs) {
    const t = computeTotali(L);
    sumP += t.prot ?? 0;
    sumK += t.kcal ?? 0;
    sumC += t.carb ?? 0;

    const foods = L.filter((e) => e.type === 'food');
    const bySlot = {};
    foods.forEach((f) => {
      const slot = getSlotKey(f) || f.mealType || 'other';
      bySlot[slot] = (bySlot[slot] || 0) + (Number(f.prot ?? f.pro) || 0);
    });
    hpSum += Object.values(bySlot).filter((x) => x >= 20).length;

    const cenaEq = getEquivalentMealTypes('cena');
    dChoSum += foods
      .filter((f) => cenaEq.includes(f.mealType))
      .reduce((acc, item) => acc + (Number(item.carb ?? item.cho) || 0), 0);

    const sleepEntry = L.find((e) => e.type === 'sleep');
    if (sleepEntry) {
      sumSleep += sleepEntry.duration ?? sleepEntry.hours ?? 0;
      nSleep++;
    }

    if (
      L.some((x) => {
        if (x.type !== 'workout') return false;
        const sub = String(x.subType ?? x.workoutType ?? '').toLowerCase();
        return sub === 'pesi' || sub === 'hiit';
      })
    ) {
      anyStrength = true;
    }
    if (L.some((x) => x.type === 'workout')) anyWorkout = true;
    if (L.some((x) => x.type === 'stimulant' && parseFloat(x.time ?? x.mealTime ?? 0) >= 16)) {
      anyLateCaffeine = true;
    }

    let firstMealTime = 24;
    let lastMealTime = 0;
    foods.forEach((f) => {
      const tt = parseFloat(f.mealTime ?? f.time ?? 12);
      if (!Number.isNaN(tt)) {
        firstMealTime = Math.min(firstMealTime, tt);
        lastMealTime = Math.max(lastMealTime, tt);
      }
    });
    if (foods.length === 0) {
      sumFirst += 12;
      sumLast += 12;
    } else {
      sumFirst += firstMealTime;
      sumLast += lastMealTime;
    }
    nWithFoods++;
  }

  const avgP = sumP / n;
  const avgK = sumK / n;
  const avgC = sumC / n;
  const avgDinnerCho = dChoSum / n;
  const avgSleep = nSleep ? sumSleep / nSleep : 0;
  const avgFirst = sumFirst / nWithFoods;
  const avgLast = sumLast / nWithFoods;
  const targetHi = Math.max(0, Math.min(4, Math.round(hpSum / n)));

  const mealTypes = ['colazione', 'pranzo', 'spuntino', 'cena'];
  const span = Math.max(0.5, avgLast - avgFirst);
  const step = span / 3;
  const times = [avgFirst, avgFirst + step, avgFirst + 2 * step, avgLast].map((x) =>
    Math.min(23.99, Math.max(0, x))
  );

  let slotProt = [avgP / 4, avgP / 4, avgP / 4, avgP / 4];
  let hi = slotProt.filter((x) => x >= 20).length;
  for (let guard = 0; guard < 40 && hi < targetHi && avgP > 0; guard++) {
    const idx = slotProt.indexOf(Math.min(...slotProt));
    slotProt[idx] += 4;
    const s = slotProt.reduce((a, b) => a + b, 0);
    const scale = avgP / s;
    slotProt = slotProt.map((x) => x * scale);
    hi = slotProt.filter((x) => x >= 20).length;
  }

  const remCarb = Math.max(0, avgC - avgDinnerCho);
  const otherCarb = remCarb / 3;

  const virt = [];
  mealTypes.forEach((mealType, i) => {
    virt.push({
      type: 'food',
      mealType,
      mealTime: times[i],
      prot: slotProt[i],
      carb: mealType === 'cena' ? avgDinnerCho : otherCarb,
      kcal: avgK / 4,
    });
  });
  if (avgSleep > 0) {
    virt.push({ type: 'sleep', duration: avgSleep, hours: avgSleep });
  }
  if (anyStrength) {
    virt.push({ type: 'workout', subType: 'pesi' });
  } else if (anyWorkout) {
    virt.push({ type: 'workout', subType: 'cardio' });
  }
  if (anyLateCaffeine) {
    virt.push({ type: 'stimulant', time: 17, mealTime: 17 });
  }
  return virt;
}

function formatAxisDate(entry) {
  const ts = Number(entry?.timestamp);
  if (Number.isFinite(ts)) {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  if (entry?.date) {
    const d = new Date(entry.date);
    if (!Number.isNaN(d.getTime())) {
      return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }
  return '—';
}

function BodyCompositionChart({ history }) {
  const { chartData, chartOptions } = useMemo(() => {
    const labels = history.map(formatAxisDate);
    const weightData = history.map((e) => {
      const w = Number(e.weight);
      return Number.isFinite(w) ? w : null;
    });
    const fatData = history.map((e) => {
      if (e.bodyFat == null || e.bodyFat === '') return null;
      const f = Number(e.bodyFat);
      return Number.isFinite(f) ? f : null;
    });
    const muscleData = history.map((e) => {
      if (e.muscle == null || e.muscle === '') return null;
      const m = Number(e.muscle);
      return Number.isFinite(m) ? m : null;
    });
    const waterData = history.map((e) => {
      if (e.water == null || e.water === '') return null;
      const w = Number(e.water);
      return Number.isFinite(w) ? w : null;
    });

    const hasBodyFatLine = fatData.some((v) => v != null);
    const hasMuscleLine = muscleData.some((v) => v != null);
    const hasWaterLine = waterData.some((v) => v != null);
    const hasRightAxis = hasBodyFatLine || hasMuscleLine || hasWaterLine;

    const validWeights = weightData.filter((v) => v != null);
    let wMin = validWeights.length ? Math.min(...validWeights) : 0;
    let wMax = validWeights.length ? Math.max(...validWeights) : 80;
    if (validWeights.length === 1) {
      wMin -= 3;
      wMax += 3;
    } else {
      wMin -= 2;
      wMax += 2;
    }
    if (wMin < 1) wMin = 1;

    const allPctValues = [...fatData, ...muscleData, ...waterData].filter(
      (v) => v != null && Number.isFinite(v)
    );
    let fMin = 0;
    let fMax = 40;
    if (allPctValues.length > 0) {
      fMin = Math.min(...allPctValues) - 2;
      fMax = Math.max(...allPctValues) + 2;
      fMin = Math.max(0, fMin);
      fMax = Math.min(100, fMax);
      if (fMin >= fMax) {
        fMax = fMin + 5;
      }
    }

    const datasets = [
      {
        label: 'Peso (kg)',
        data: weightData,
        borderColor: '#00d2ff',
        backgroundColor: 'rgba(0, 210, 255, 0.08)',
        borderWidth: 3,
        tension: 0.3,
        fill: false,
        pointRadius: 4,
        pointBackgroundColor: '#00d2ff',
        pointBorderColor: '#0a0a0a',
        pointBorderWidth: 1,
        yAxisID: 'y',
      },
    ];

    if (hasBodyFatLine) {
      datasets.push({
        label: 'Massa Grassa (%)',
        data: fatData,
        borderColor: '#ff5e62',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [5, 5],
        tension: 0.3,
        fill: false,
        pointRadius: 3,
        pointBackgroundColor: '#ff5e62',
        pointBorderColor: '#0a0a0a',
        pointBorderWidth: 1,
        yAxisID: 'y1',
        spanGaps: false,
      });
    }

    if (hasMuscleLine) {
      datasets.push({
        label: 'Muscoli (%)',
        data: muscleData,
        borderColor: '#3b82f6',
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        fill: false,
        pointRadius: 3,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#0a0a0a',
        pointBorderWidth: 1,
        yAxisID: 'y1',
        spanGaps: false,
      });
    }

    if (hasWaterLine) {
      datasets.push({
        label: 'Acqua (%)',
        data: waterData,
        borderColor: '#06b6d4',
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        fill: false,
        pointRadius: 3,
        pointBackgroundColor: '#06b6d4',
        pointBorderColor: '#0a0a0a',
        pointBorderWidth: 1,
        yAxisID: 'y1',
        spanGaps: false,
      });
    }

    const scales = {
      x: {
        grid: { display: false },
        ticks: { color: '#888', maxRotation: 45, font: { size: 11 } },
        border: { color: 'rgba(255,255,255,0.08)' },
      },
      y: {
        type: 'linear',
        position: 'left',
        min: wMin,
        max: wMax,
        grid: { color: 'rgba(255,255,255,0.06)', drawBorder: false },
        ticks: { color: '#00d2ff', font: { size: 11 } },
        border: { display: false },
      },
    };

    if (hasRightAxis) {
      scales.y1 = {
        type: 'linear',
        position: 'right',
        min: fMin,
        max: fMax,
        grid: { drawOnChartArea: false },
        ticks: {
          color: '#94a3b8',
          font: { size: 11 },
        },
        border: { display: false },
      };
    }

    return {
      chartData: { labels, datasets },
      chartOptions: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: 'rgba(255, 255, 255, 0.7)',
              usePointStyle: true,
              boxWidth: 8,
              font: { size: 11 },
            },
          },
          tooltip: {
            backgroundColor: 'rgba(15,15,18,0.95)',
            titleColor: '#e5e5e5',
            bodyColor: '#ccc',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            filter: (tooltipItem) => {
              const y = tooltipItem.parsed?.y;
              return y != null && Number.isFinite(y);
            },
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || '';
                const y = context.parsed.y;
                if (!Number.isFinite(y)) return '';
                if (label.startsWith('Peso')) {
                  return ` ${label}: ${y.toFixed(1)} kg`;
                }
                return ` ${label}: ${y.toFixed(1)}%`;
              },
            },
          },
        },
        scales,
      },
    };
  }, [history]);

  return (
    <div style={{ height: '250px', width: '100%', position: 'relative' }}>
      <Line data={chartData} options={chartOptions} />
    </div>
  );
}

export default function LongevityView({
  data,
  showPriorityFocus = true,
  userAge,
  bodyMetricsHistory = [],
  scoreHistory = [],
  periodAnchorDate,
  /** Albero storico Firebase (tracker_data) per pilastri e log mediato sul periodo */
  fullHistory = null,
  userTargets = null,
  /** TDEE / kcal giornalieri di riferimento per il twin metabolico (default: userTargets.kcal) */
  metabolicTDEE = null,
  /** Salva nuovo TDEE su Firebase (es. autopilota metabolico) */
  onUpdateTDEE = null,
}) {
  const [timeWindow, setTimeWindow] = useState(30);
  const timeOptions = [
    { label: 'Ieri', value: 1 },
    { label: '7g', value: 7 },
    { label: '14g', value: 14 },
    { label: '30g', value: 30 },
  ];

  const anchorDate = periodAnchorDate || getTodayString();
  /** Fine comune del periodo statistiche: giorno prima dell’anchor (mai il giorno “live” del tracker). */
  const statsPeriodEnd = useMemo(() => addDays(anchorDate, -1), [anchorDate]);

  const averageScore = useMemo(
    () => calculateAverageScore(timeWindow, anchorDate, scoreHistory),
    [timeWindow, anchorDate, scoreHistory]
  );

  const bioScore =
    data && typeof data.score === 'number'
      ? data.score
      : data && typeof data.masterScore === 'number'
        ? data.masterScore
        : null;

  const hasUserAge = data && typeof userAge === 'number' && !Number.isNaN(userAge);
  const projectedAge =
    hasUserAge && typeof averageScore === 'number'
      ? calculateProjectedAge(userAge, averageScore)
      : null;

  /** Pilastri: media sui giorni [statsPeriodEnd …], allineata al selettore e a longevityStats (offset 1 sull’anchor). */
  const pillarBreakdownEntries = useMemo(() => {
    if (!fullHistory || !userTargets) return null;
    const sums = { metabolic: 0, cardio: 0, inflammatory: 0, neuro: 0 };
    let count = 0;
    const tw = Math.max(1, Math.min(366, Number(timeWindow) || 1));
    for (let i = 0; i < tw; i++) {
      const dStr = addDays(statsPeriodEnd, -i);
      const L = combinedDayLog(fullHistory, dStr);
      if (!dayLogQualifiesForStarEval(L)) continue;
      const m = computeRiskMatrix(fullHistory, userTargets, 1, addDays(dStr, 1));
      if (!m) continue;
      PILLAR_KEYS.forEach((k) => {
        sums[k] += m[k]?.score ?? 0;
      });
      count++;
    }
    if (count === 0) return null;
    return PILLAR_KEYS.map((key) => [key, Math.max(0, 100 - sums[key] / count)]);
  }, [fullHistory, userTargets, statsPeriodEnd, timeWindow]);

  /** Log mediato sul periodo che termina in statsPeriodEnd. */
  const mediatedStarLog = useMemo(() => {
    if (!fullHistory || !userTargets) return null;
    const logs = collectDayLogsInWindow(fullHistory, statsPeriodEnd, timeWindow);
    return buildMediatedVirtualLog(logs);
  }, [fullHistory, userTargets, statsPeriodEnd, timeWindow]);

  const dayStarReportDisplay = useMemo(() => {
    if (!mediatedStarLog || mediatedStarLog.length === 0) return null;
    const dailyReport = computeDayEvaluations(mediatedStarLog, userTargets);
    return dailyReport?.ready ? dailyReport : null;
  }, [mediatedStarLog, userTargets]);

  const statsPeriodEndLabel = useMemo(
    () =>
      new Date(`${statsPeriodEnd}T12:00:00`).toLocaleDateString('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [statsPeriodEnd]
  );

  const resolvedMetabolicTDEE = useMemo(() => {
    if (typeof metabolicTDEE === 'number' && Number.isFinite(metabolicTDEE) && metabolicTDEE > 0) {
      return metabolicTDEE;
    }
    const k = userTargets?.kcal;
    if (typeof k === 'number' && Number.isFinite(k) && k > 0) return k;
    return 2000;
  }, [metabolicTDEE, userTargets?.kcal]);

  const metabolicVariance = useMemo(
    () => calculateMetabolicVariance(bodyMetricsHistory, fullHistory, resolvedMetabolicTDEE),
    [bodyMetricsHistory, fullHistory, resolvedMetabolicTDEE]
  );

  const metabolicAutopilot = useMemo(() => {
    if (!metabolicVariance) return null;
    const daysBetween = Number(metabolicVariance.daysBetween);
    if (!Number.isFinite(daysBetween) || daysBetween < 5) {
      return { tooSoon: true, daysBetween };
    }
    const variance = Number(metabolicVariance.variance);
    if (!Number.isFinite(variance)) return null;
    const dailyError = (variance * KCAL_PER_KG_BODY_MASS) / daysBetween;
    let suggestedCorrection = -Math.round(dailyError);
    if (suggestedCorrection > 200) suggestedCorrection = 200;
    if (suggestedCorrection < -200) suggestedCorrection = -200;
    const currentTDEE = userTargets?.kcal || 2000;
    const newSuggestedTDEE = Math.max(800, Math.min(12000, Math.round(currentTDEE + suggestedCorrection)));
    const needsRecalibration = Math.abs(suggestedCorrection) >= 50;
    return {
      tooSoon: false,
      dailyError,
      suggestedCorrection,
      currentTDEE,
      newSuggestedTDEE,
      needsRecalibration,
      daysBetween,
    };
  }, [metabolicVariance, userTargets?.kcal]);

  const { deltaAge } = useMemo(() => {
    if (!data || typeof userAge !== 'number' || Number.isNaN(userAge)) {
      return { deltaAge: null };
    }
    const currentAvg = getAverageForPeriod(scoreHistory, timeWindow, 1, anchorDate, null);
    const previousAvg = getAverageForPeriod(scoreHistory, timeWindow, timeWindow + 1, anchorDate, null);
    if (currentAvg == null || previousAvg == null) {
      return { deltaAge: null };
    }
    const currentAge = calculateProjectedAge(userAge, Math.round(currentAvg));
    const previousAge = calculateProjectedAge(userAge, Math.round(previousAvg));
    if (currentAge == null || previousAge == null) {
      return { deltaAge: null };
    }
    return { deltaAge: currentAge - previousAge };
  }, [data, userAge, scoreHistory, timeWindow, anchorDate]);

  if (!data) {
    return (
      <div style={{ padding: 20, maxWidth: 600, margin: '0 auto', color: '#e5e5e5' }}>
        Nessun dato disponibile
      </div>
    );
  }

  const { breakdown, drivers, suggestions, priorityFocus } = data;
  const hasEngineBreakdown = breakdown && typeof breakdown === 'object' && breakdown.energia !== undefined;
  const fallbackBreakdownEntries = hasEngineBreakdown
    ? Object.entries(breakdown)
    : data.metabolic && data.cardio && data.inflammatory && data.neuro
      ? PILLAR_KEYS.map((key) => [key, Math.max(0, 100 - (data[key]?.score ?? 50))])
      : [];
  const breakdownEntries = pillarBreakdownEntries ?? fallbackBreakdownEntries;

  const hasInsightsBlock =
    (showPriorityFocus && priorityFocus) ||
    (drivers && drivers.length > 0) ||
    (suggestions && suggestions.length > 0);

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>

      {/* 1. Proiezione età + selettore temporale */}
      <div style={{ ...SECTION_CARD, textAlign: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', marginBottom: 14 }}>
          Età proiettata
        </div>
        {hasUserAge && averageScore == null ? (
          <>
            <div
              style={{
                fontSize: '0.95rem',
                opacity: 0.88,
                color: '#94a3b8',
                marginBottom: 16,
                lineHeight: 1.5,
                maxWidth: 360,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              Non ci sono ancora abbastanza giorni con dati consolidati nello storico per questo periodo. Registra più giornate passate per vedere l&apos;età proiettata.
            </div>
            {bioScore != null && (
              <>
                <div style={{ fontSize: 48, fontWeight: 'bold', color: getColor(bioScore) }}>{bioScore}</div>
                <div style={{ fontSize: 16, opacity: 0.7, color: '#a3a3a3', marginTop: 8 }}>Punteggio longevità (vista tracker)</div>
              </>
            )}
          </>
        ) : projectedAge != null ? (
          <>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap: 14,
                lineHeight: 1.05,
              }}
            >
              <div style={{ fontSize: '5rem', fontWeight: 900, color: getColor(averageScore), lineHeight: 1.05 }}>
                {projectedAge.toFixed(1)}
              </div>
              {deltaAge != null && Math.abs(deltaAge) > 0.05 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      fontSize: '1.15rem',
                      fontWeight: 600,
                      padding: '6px 12px',
                      borderRadius: 999,
                      background:
                        deltaAge > 0 ? 'rgba(74, 222, 128, 0.12)' : 'rgba(248, 113, 113, 0.12)',
                      border:
                        deltaAge > 0 ? '1px solid rgba(74, 222, 128, 0.35)' : '1px solid rgba(248, 113, 113, 0.35)',
                      color: deltaAge > 0 ? '#4ade80' : '#f87171',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {deltaAge > 0 ? `↑ +${deltaAge.toFixed(1)}` : `↓ ${deltaAge.toFixed(1)}`}
                  </div>
                  <div style={{ fontSize: '0.65rem', fontWeight: 500, color: 'rgba(148, 163, 184, 0.95)', letterSpacing: '0.02em' }}>
                    vs periodo precedente
                  </div>
                </div>
              )}
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600, marginTop: 12, letterSpacing: '0.04em', color: '#e5e5e5' }}>
              Anni di Età Proiettata
            </div>
            <div style={{ fontSize: '0.9rem', opacity: 0.6, marginTop: 10, color: '#a3a3a3' }}>
              Punteggio longevità medio sul periodo selezionato (fine{' '}
              {statsPeriodEndLabel}): {averageScore != null ? `${averageScore} / 100` : '—'}
            </div>
            <div
              role="tablist"
              aria-label="Periodo media mobile età proiettata"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 8,
                marginTop: 16,
              }}
            >
              {timeOptions.map((opt) => {
                const active = timeWindow === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTimeWindow(opt.value)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 999,
                      border: active ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.12)',
                      background: active ? 'rgba(255, 255, 255, 0.2)' : 'transparent',
                      color: active ? '#fff' : 'rgba(255,255,255,0.75)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: '0.75rem', opacity: 0.55, marginTop: 10, color: '#94a3b8', lineHeight: 1.4 }}>
              {timeWindow === 1
                ? `Proiezione basata sulla giornata che termina il ${statsPeriodEndLabel}.`
                : `Media degli ultimi ${timeWindow} giorni che terminano il ${statsPeriodEndLabel}.`}
            </div>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: '0.95rem',
                opacity: 0.85,
                color: '#94a3b8',
                marginBottom: 20,
                lineHeight: 1.45,
                maxWidth: 340,
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              Inserisci la tua Data di Nascita nel Profilo (Menu ≡) per sbloccare la tua Età Proiettata.
            </div>
            {bioScore != null && (
              <>
                <div style={{ fontSize: 64, fontWeight: 'bold', color: getColor(bioScore) }}>
                  {bioScore}
                </div>
                <div style={{ fontSize: 18, opacity: 0.7, color: '#a3a3a3' }}>Punteggio statistiche</div>
              </>
            )}
          </>
        )}
      </div>

      {/* 2. Dettaglio parametri (pilastri) */}
      {breakdownEntries.length > 0 && (
        <div style={SECTION_CARD}>
          <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: 6, color: '#e5e5e5' }}>
            Dettaglio parametri
          </div>
          <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: 14, lineHeight: 1.45 }}>
            {pillarBreakdownEntries
              ? `Media dei pilastri su ${timeWindow === 1 ? '1 giorno' : `${timeWindow} giorni`} con dati; fine periodo: ${statsPeriodEndLabel}.`
              : 'Snapshot dal punteggio longevità della vista tracker.'}
            {averageScore != null ? (
              <span style={{ display: 'block', marginTop: 6, color: '#94a3b8' }}>
                Punteggio longevità medio stesso periodo (selettore): {averageScore}/100.
              </span>
            ) : null}
          </div>
          {breakdownEntries.map(([key, value]) => (
            <div key={key} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ textTransform: 'capitalize', color: '#e5e5e5' }}>
                  {MATRIX_PILLAR_LABELS[key] || key}
                </span>
                <span style={{ color: '#cbd5e1' }}>{Math.round(value)}</span>
              </div>
              <div style={{
                height: 6,
                background: '#222',
                borderRadius: 4,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${Math.min(100, Math.max(0, value))}%`,
                  background: getColor(value),
                  height: '100%',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Priorità, indicatori chiave, azioni consigliate */}
      {hasInsightsBlock && (
        <div style={SECTION_CARD}>
          {drivers && drivers.length > 0 && (
            <div style={{ marginBottom: suggestions?.length || (showPriorityFocus && priorityFocus) ? 16 : 0 }}>
              <div style={{ marginBottom: 10, fontWeight: 'bold', color: '#e5e5e5' }}>Indicatori chiave</div>
              {drivers.map((d, i) => (
                <div key={`${d.type}-${d.key}-${i}`} style={{ marginBottom: 8, fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.45 }}>
                  {d.type === 'negative' ? '⚠️' : '✅'} {d.message}
                </div>
              ))}
            </div>
          )}
          {suggestions && suggestions.length > 0 && (
            <div style={{ marginBottom: showPriorityFocus && priorityFocus ? 16 : 0 }}>
              <div style={{ marginBottom: 10, fontWeight: 'bold', color: '#e5e5e5' }}>Azioni consigliate</div>
              {suggestions.map((s, i) => (
                <div key={i} style={{ marginBottom: 8, fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.45 }}>
                  → {s}
                </div>
              ))}
            </div>
          )}
          {showPriorityFocus && priorityFocus && (
            <div>
              <div style={{ fontSize: 12, opacity: 0.6, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em' }}>
                PRIORITÀ SUGGERITA
              </div>
              <div style={{ fontSize: 18, fontWeight: 'bold', marginTop: 6, color: '#e5e5e5' }}>
                {priorityFocus.title}
              </div>
              <div style={{ marginTop: 8, color: '#00e5ff', fontSize: '0.95rem' }}>
                → {priorityFocus.action}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Trend composizione corporea */}
      <div style={SECTION_CARD}>
        <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: 14, color: '#e5e5e5', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span aria-hidden>⚖️</span>
          Trend composizione corporea
        </div>
        {bodyMetricsHistory.length >= 2 && metabolicVariance && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 10,
              background: 'rgba(0, 229, 255, 0.06)',
              border: '1px dashed rgba(0, 229, 255, 0.35)',
            }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#00e5ff', letterSpacing: '0.08em', marginBottom: 8 }}>
              DEBUG · Motore metabolico predittivo
            </div>
            <div style={{ fontSize: '0.82rem', color: '#cbd5e1', lineHeight: 1.55 }}>
              {metabolicVariance.actualFatDelta != null &&
              metabolicVariance.actualLeanDelta != null ? (
                <>
                  <div>
                    Variazione Peso Totale:{' '}
                    <strong style={{ color: '#e5e5e5' }}>
                      {metabolicVariance.actualWeightDelta.toFixed(2)} kg
                    </strong>
                  </div>
                  <div style={{ marginTop: 4, paddingLeft: 10 }}>
                    ↳ Di cui Grasso (FM):{' '}
                    <strong style={{ color: '#e5e5e5' }}>
                      {metabolicVariance.actualFatDelta.toFixed(2)} kg
                    </strong>
                  </div>
                  <div style={{ marginTop: 4, paddingLeft: 10 }}>
                    ↳ Di cui Magra (FFM):{' '}
                    <strong style={{ color: '#e5e5e5' }}>
                      {metabolicVariance.actualLeanDelta.toFixed(2)} kg
                    </strong>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    Variazione Grasso Teorica:{' '}
                    <strong style={{ color: '#e5e5e5' }}>
                      {metabolicVariance.theoreticalWeightDelta.toFixed(2)} kg
                    </strong>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    Discrepanza Metabolica (su Grasso):{' '}
                    <strong style={{ color: '#e5e5e5' }}>
                      {metabolicVariance.variance.toFixed(2)} kg
                    </strong>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    Variazione Reale (ultimi {metabolicVariance.daysBetween} giorni):{' '}
                    <strong style={{ color: '#e5e5e5' }}>
                      {metabolicVariance.actualWeightDelta.toFixed(2)} kg
                    </strong>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    Variazione Teorica stimata:{' '}
                    <strong style={{ color: '#e5e5e5' }}>
                      {metabolicVariance.theoreticalWeightDelta.toFixed(2)} kg
                    </strong>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    Discrepanza Metabolica:{' '}
                    <strong style={{ color: '#e5e5e5' }}>
                      {metabolicVariance.variance.toFixed(2)} kg
                    </strong>
                  </div>
                </>
              )}
              <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#64748b' }}>
                TDEE {resolvedMetabolicTDEE} kcal/dì · Δ kcal cumulato{' '}
                {Math.round(metabolicVariance.cumulativeCaloricDelta)} kcal
              </div>
              {metabolicAutopilot != null && (
                <>
                  <hr
                    style={{
                      border: 'none',
                      borderTop: '1px solid #333',
                      margin: '12px 0',
                    }}
                  />
                  {metabolicAutopilot.tooSoon ? (
                    <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.45 }}>
                      Servono almeno 5 giorni tra le pesate per l&apos;autopilota.
                    </div>
                  ) : metabolicAutopilot.needsRecalibration ? (
                    <div style={{ marginTop: 2 }}>
                      <div
                        style={{
                          fontSize: '0.82rem',
                          color: '#fcd34d',
                          lineHeight: 1.5,
                          marginBottom: 10,
                        }}
                      >
                        ⚠️ Adattamento rilevato: il tuo metabolismo si sta discostando dalla teoria di circa{' '}
                        {Math.abs(Math.round(metabolicAutopilot.dailyError))} kcal al giorno.
                      </div>
                      {typeof onUpdateTDEE === 'function' ? (
                        <button
                          type="button"
                          onClick={() => onUpdateTDEE(metabolicAutopilot.newSuggestedTDEE)}
                          style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: 10,
                            border: '1px solid rgba(14, 165, 233, 0.5)',
                            background: 'linear-gradient(180deg, #0ea5e9 0%, #0284c7 100%)',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            boxShadow: '0 2px 12px rgba(14, 165, 233, 0.25)',
                          }}
                        >
                          Ricalibra TDEE a {metabolicAutopilot.newSuggestedTDEE} kcal
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.82rem', color: '#86efac', lineHeight: 1.45 }}>
                      ✅ TDEE perfettamente allineato al tuo metabolismo reale.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
        {bodyMetricsHistory.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#888', lineHeight: 1.5 }}>
            Nessuna pesata registrata. Usa il tasto + per inserire il tuo primo dato.
          </p>
        ) : (
          <BodyCompositionChart history={bodyMetricsHistory} />
        )}
      </div>

      {/* 5. Report a stelle (periodo che termina in statsPeriodEnd) */}
      <div style={SECTION_CARD}>
        <div
          style={{
            fontSize: '1rem',
            fontWeight: 'bold',
            marginBottom: 10,
            color: '#e5e5e5',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: '1px solid #222',
            paddingBottom: 12,
          }}
        >
          <span style={{ color: '#ffc107' }} aria-hidden>★</span>
          {timeWindow > 1 ? `Valutazione media periodo (${timeWindow} giorni)` : 'Report giornaliero'}
        </div>
        <p style={{ color: '#888', fontSize: '0.8rem', margin: '0 0 16px', lineHeight: 1.45 }}>
          {timeWindow > 1
            ? `Media su log consolidati degli ultimi ${timeWindow} giorni con dati; fine periodo: ${statsPeriodEndLabel}.`
            : `Giornata di riferimento: ${statsPeriodEndLabel}.`}
        </p>
        {dayStarReportDisplay ? (
          DAY_STAR_EVAL_ROWS.map(({ key, label, emoji }) => {
            const item = dayStarReportDisplay[key];
            const score =
              typeof item === 'object' && item != null && 'score' in item
                ? item.score
                : (Number(item) || 0);
            const reason =
              typeof item === 'object' && item != null && 'reason' in item ? item.reason : '';
            return (
              <div key={key} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#aaa',
                    marginBottom: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    {emoji} {label}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      style={{
                        color: n <= score ? '#ffc107' : '#333',
                        fontSize: '1.1rem',
                      }}
                      aria-hidden
                    >
                      ★
                    </span>
                  ))}
                </div>
                {reason ? (
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: '#888',
                      fontStyle: 'italic',
                      marginTop: 4,
                      lineHeight: 1.2,
                    }}
                  >
                    {reason}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#888', lineHeight: 1.5 }}>
            Nessun dato sufficiente nel periodo selezionato: nei giorni considerati servono almeno un pasto o ricetta nel
            diario, oppure sonno o allenamento.
          </p>
        )}
      </div>

    </div>
  );
}
