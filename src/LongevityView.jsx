import React, { useMemo, useState } from 'react';
import { calculateConsolidatedAverageScore as calculateAverageScore } from './longevityStats';
import OptimizationCard from './OptimizationCard';
import { buildOptimizationDailyDataFromLog } from './optimizationIndex';
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
  toCanonicalMealType,
  buildPredictiveCompositionDailyRows,
  computePredictionReliabilityPercent,
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
import { KentuDisciplineTrendChart, AlcoholRecoveryComposedChart } from './LifestyleTelemetryCharts';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

/** Tooltip composizione: segue X del dato, ancorato in alto sul chartArea per non coprire le curve. */
Tooltip.positioners.bodyCompositionTopBand = function bodyCompositionTopBand(items) {
  if (!items?.length) return false;
  const chart = items[0].chart;
  const { chartArea } = chart;
  if (!chartArea || chartArea.width <= 0) return false;
  let xSum = 0;
  let n = 0;
  for (let i = 0; i < items.length; i++) {
    const el = items[i].element;
    if (el && typeof el.hasValue === 'function' && el.hasValue()) {
      const pos = el.tooltipPosition();
      xSum += pos.x;
      n += 1;
    }
  }
  if (!n) return false;
  return {
    x: xSum / n,
    y: chartArea.top + 14,
    xAlign: 'center',
    yAlign: 'bottom',
  };
};

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

    const foods = L.filter((e) => e.type === 'food' || e.type === 'recipe');
    const bySlot = {};
    foods.forEach((f) => {
      const raw = getSlotKey(f) || f.mealType || 'other';
      const base = String(raw).split('_')[0];
      const slotCanon = toCanonicalMealType(base);
      bySlot[slotCanon] = (bySlot[slotCanon] || 0) + (Number(f.prot ?? f.pro) || 0);
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
  const targetHi = Math.max(0, Math.min(5, Math.round(hpSum / n)));

  /** Cinque slot ufficiali (stessi id usati nel diario / KentuOS). */
  const mealTypes = ['merenda1', 'merenda_am', 'pranzo', 'merenda_pm', 'cena'];
  const nMeals = mealTypes.length;
  const span = Math.max(0.5, avgLast - avgFirst);
  const step = nMeals > 1 ? span / (nMeals - 1) : 0;
  const times = Array.from({ length: nMeals }, (_, i) =>
    Math.min(23.99, Math.max(0, avgFirst + i * step))
  );

  let slotProt = Array(nMeals).fill(avgP / nMeals);
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
  const otherCarb = remCarb / Math.max(1, nMeals - 1);

  const virt = [];
  mealTypes.forEach((mealType, i) => {
    virt.push({
      type: 'food',
      mealType,
      mealTime: times[i],
      prot: slotProt[i],
      carb: mealType === 'cena' ? avgDinnerCho : otherCarb,
      kcal: avgK / nMeals,
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

function formatAxisFromIso(iso) {
  if (!iso || typeof iso !== 'string') return '—';
  const p = iso.split('-');
  if (p.length !== 3) return '—';
  return `${p[2]}/${p[1]}`;
}

/** Grafico composizione: storico pesate e/o serie predittiva (peso + kg muscolatura stimata, tratteggio su stime). */
function BodyCompositionChart({ history, predictiveDailyRows }) {
  const { chartData, chartOptions } = useMemo(() => {
    if (predictiveDailyRows && predictiveDailyRows.length > 0) {
      const rows = predictiveDailyRows;
      const labels = rows.map((r) => formatAxisFromIso(r.isoDate));
      const weightData = rows.map((r) => (Number.isFinite(Number(r.weightKg)) ? Number(r.weightKg) : null));
      const muscleKgData = rows.map((r) =>
        Number.isFinite(Number(r.muscleMassKg)) ? Number(r.muscleMassKg) : null
      );
      const fatData = rows.map((r) =>
        r.bodyFat != null && Number.isFinite(Number(r.bodyFat)) ? Number(r.bodyFat) : null
      );
      const musclePctData = rows.map((r) =>
        r.musclePct != null && Number.isFinite(Number(r.musclePct)) ? Number(r.musclePct) : null
      );
      const waterData = rows.map((r) =>
        r.waterPct != null && Number.isFinite(Number(r.waterPct)) ? Number(r.waterPct) : null
      );

      const hasBodyFatLine = fatData.some((v) => v != null);
      const hasMusclePctLine = musclePctData.some((v) => v != null);
      const hasWaterLine = waterData.some((v) => v != null);
      const hasRightAxis = hasBodyFatLine || hasMusclePctLine || hasWaterLine;

      const kgVals = [...weightData, ...muscleKgData].filter((v) => v != null && Number.isFinite(v));
      let wMin = kgVals.length ? Math.min(...kgVals) : 0;
      let wMax = kgVals.length ? Math.max(...kgVals) : 80;
      wMin -= 2;
      wMax += 2;
      if (wMin < 1) wMin = 1;
      if (wMax <= wMin) wMax = wMin + 5;

      const allPctValues = [...fatData, ...musclePctData, ...waterData].filter(
        (v) => v != null && Number.isFinite(v)
      );
      let fMin = 0;
      let fMax = 40;
      if (allPctValues.length > 0) {
        fMin = Math.min(...allPctValues) - 2;
        fMax = Math.max(...allPctValues) + 2;
        fMin = Math.max(0, fMin);
        fMax = Math.min(100, fMax);
        if (fMin >= fMax) fMax = fMin + 5;
      }

      const datasets = [
        {
          label: 'Peso (kg)',
          data: weightData,
          borderColor: '#00d2ff',
          backgroundColor: 'rgba(0, 210, 255, 0.08)',
          borderWidth: 3,
          tension: 0.25,
          fill: false,
          segment: {
            borderDash: (ctx) => {
              const r0 = rows[ctx.p0DataIndex];
              const r1 = rows[ctx.p1DataIndex];
              if (!r0 || !r1) return undefined;
              if (r0.weightIsReal && r1.weightIsReal) return undefined;
              return [6, 4];
            },
          },
          pointRadius: (ctx) => (rows[ctx.dataIndex]?.weightIsReal ? 4 : 0),
          pointHoverRadius: (ctx) => (rows[ctx.dataIndex]?.weightIsReal ? 5 : 3),
          pointBackgroundColor: '#00d2ff',
          pointBorderColor: '#0a0a0a',
          pointBorderWidth: 1,
          yAxisID: 'y',
        },
        {
          label: 'Massa muscolare stimata (kg)',
          data: muscleKgData,
          borderColor: '#22d3ee',
          backgroundColor: 'transparent',
          borderWidth: 2,
          tension: 0.25,
          fill: false,
          segment: {
            borderDash: (ctx) => {
              const r0 = rows[ctx.p0DataIndex];
              const r1 = rows[ctx.p1DataIndex];
              if (!r0 || !r1) return undefined;
              if (r0.muscleMassIsReal && r1.muscleMassIsReal) return undefined;
              return [5, 5];
            },
          },
          pointRadius: (ctx) => (rows[ctx.dataIndex]?.muscleMassIsReal ? 3 : 0),
          pointHoverRadius: 4,
          pointBackgroundColor: '#22d3ee',
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

      if (hasMusclePctLine) {
        datasets.push({
          label: 'Muscoli (%)',
          data: musclePctData,
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
          ticks: { color: '#7dd3fc', font: { size: 11 } },
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
          ticks: { color: '#94a3b8', font: { size: 11 } },
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
              position: 'bodyCompositionTopBand',
              mode: 'index',
              intersect: false,
              caretPadding: 10,
              caretSize: 5,
              cornerRadius: 8,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              titleColor: '#e5e5e5',
              bodyColor: '#d4d4d4',
              borderColor: 'rgba(255,255,255,0.12)',
              borderWidth: 1,
              padding: 10,
              displayColors: false,
              callbacks: {
                label: (context) => {
                  const i = context.dataIndex;
                  const ds = context.dataset.label || '';
                  const w = weightData[i];
                  const mk = muscleKgData[i];
                  if (ds.includes('Peso')) {
                    const est = rows[i]?.weightIsReal ? '' : ' (stima)';
                    return w != null ? `Peso${est}: ${Number(w).toFixed(2)} kg` : '—';
                  }
                  if (ds.includes('muscolare')) {
                    const est = rows[i]?.muscleMassIsReal ? '' : ' (stima)';
                    return mk != null ? `Muscolo${est}: ${Number(mk).toFixed(2)} kg` : '—';
                  }
                  const bf = fatData[i];
                  const mus = musclePctData[i];
                  const wat = waterData[i];
                  if (bf != null) return `Grasso: ${Number(bf).toFixed(1)}%`;
                  if (mus != null) return `Muscoli %: ${Number(mus).toFixed(1)}%`;
                  if (wat != null) return `Acqua: ${Number(wat).toFixed(1)}%`;
                  return ds;
                },
              },
            },
          },
          scales,
        },
      };
    }

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
            position: 'bodyCompositionTopBand',
            mode: 'index',
            intersect: false,
            caretPadding: 10,
            caretSize: 5,
            cornerRadius: 8,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            titleColor: '#e5e5e5',
            bodyColor: '#d4d4d4',
            borderColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            filter: (tooltipItem) => tooltipItem.datasetIndex === 0,
            callbacks: {
              label: (context) => {
                const i = context.dataIndex;
                const parts = [];
                const w = weightData[i];
                if (w != null && Number.isFinite(Number(w))) {
                  parts.push(`Peso: ${Number(w).toFixed(1)}kg`);
                }
                const bf = fatData[i];
                if (bf != null && Number.isFinite(Number(bf))) {
                  parts.push(`Grasso: ${Number(bf).toFixed(1)}%`);
                }
                const mus = muscleData[i];
                if (mus != null && Number.isFinite(Number(mus))) {
                  parts.push(`Muscoli: ${Number(mus).toFixed(1)}%`);
                }
                const wat = waterData[i];
                if (wat != null && Number.isFinite(Number(wat))) {
                  parts.push(`Acqua: ${Number(wat).toFixed(1)}%`);
                }
                return parts.length ? parts.join(' | ') : '—';
              },
            },
          },
        },
        scales,
      },
    };
  }, [history, predictiveDailyRows]);

  return (
    <div style={{ height: '250px', width: '100%', position: 'relative' }}>
      <Line data={chartData} options={chartOptions} />
    </div>
  );
}

function TdeeHistoryLineChart({ history }) {
  const { chartData, chartOptions } = useMemo(() => {
    const labels = history.map((h) =>
      typeof h.date === 'string' && h.date.length >= 10 ? h.date : String(h.date ?? '—')
    );
    const data = history.map((h) => (Number.isFinite(Number(h.tdee)) ? Number(h.tdee) : 0));
    const nums = data.filter((n) => Number.isFinite(n));
    const minV = nums.length ? Math.min(...nums) : 0;
    const maxV = nums.length ? Math.max(...nums) : 2000;
    const span = Math.max(30, maxV - minV);
    const pad = Math.max(40, Math.round(span * 0.25));

    return {
      chartData: {
        labels,
        datasets: [
          {
            label: 'TDEE (kcal)',
            data,
            borderColor: '#f97316',
            backgroundColor: 'rgba(249, 115, 22, 0.2)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: '#f97316',
            pointBorderColor: '#0a0a0a',
            pointBorderWidth: 1,
          },
        ],
      },
      chartOptions: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15,15,18,0.95)',
            titleColor: '#e5e5e5',
            bodyColor: '#cbd5e1',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            callbacks: {
              label: (ctx) => `TDEE: ${ctx.parsed.y} kcal`,
              afterLabel: (ctx) => {
                const row = history[ctx.dataIndex];
                if (!row) return '';
                const hasMacro =
                  row.prot != null || row.carb != null || row.fat != null;
                if (!hasMacro) return '';
                return `P ${row.prot ?? '—'}g · Carb ${row.carb ?? '—'}g · Fat ${row.fat ?? '—'}g`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#888', maxRotation: 45, font: { size: 10 } },
            border: { color: 'rgba(255,255,255,0.08)' },
          },
          y: {
            beginAtZero: false,
            min: Math.max(400, minV - pad),
            max: maxV + pad,
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#fdba74', font: { size: 10 } },
            border: { display: false },
          },
        },
      },
    };
  }, [history]);

  return (
    <div style={{ height: 220, width: '100%', position: 'relative' }}>
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
  /** Storico ricalibrazioni TDEE (nodo `tdee_history`) */
  tdeeHistory = [],
  /** Errori predizione vs pesate reali (`predictive_body_calibration.errors` su Firebase) */
  predictionCalibration = null,
  /** Punteggio longevità del giorno tracker (live) per il trend Kentu */
  todayScore = null,
}) {
  const [timeWindow, setTimeWindow] = useState(30);
  const [telemetryTab, setTelemetryTab] = useState('fisiologia');
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

  const optimizationDailyData = useMemo(
    () => buildOptimizationDailyDataFromLog(mediatedStarLog || []),
    [mediatedStarLog]
  );

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

  /** Solo per il grafico Chart.js: allineato al timeWindow (il twin metabolico usa sempre `bodyMetricsHistory` intero). */
  const chartBodyMetrics = useMemo(() => {
    const tw = Math.max(1, Math.min(366, Number(timeWindow) || 1));
    const limitDate = addDays(anchorDate, -(tw === 1 ? 7 : tw));
    return bodyMetricsHistory.filter((m) => {
      if (m?.date && typeof m.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date)) {
        return m.date >= limitDate;
      }
      const ts = Number(m?.timestamp);
      if (Number.isFinite(ts)) {
        const d = new Date(ts);
        const offset = d.getTimezoneOffset() * 60000;
        const dayStr = new Date(d.getTime() - offset).toISOString().slice(0, 10);
        return dayStr >= limitDate;
      }
      return false;
    });
  }, [bodyMetricsHistory, timeWindow, anchorDate]);

  const compositionPredictiveRows = useMemo(() => {
    if (!fullHistory || userTargets == null || !(Number(userTargets.kcal) > 0)) return null;
    const tw = Math.max(1, Math.min(366, Number(timeWindow) || 1));
    const limitDate = addDays(anchorDate, -(tw === 1 ? 7 : tw));
    const rows = buildPredictiveCompositionDailyRows({
      fullHistory,
      bodyMetricsHistory,
      rangeStartIso: limitDate,
      rangeEndIso: anchorDate,
      baseTdeeKcal: userTargets.kcal,
    });
    return rows.length > 0 ? rows : null;
  }, [fullHistory, userTargets, timeWindow, anchorDate, bodyMetricsHistory]);

  const compositionReliabilityPct = useMemo(
    () => computePredictionReliabilityPercent(predictionCalibration?.errors),
    [predictionCalibration?.errors]
  );

  const chartTdeeHistory = useMemo(() => {
    const tw = Math.max(1, Math.min(366, Number(timeWindow) || 1));
    const limitDate = addDays(anchorDate, -(tw === 1 ? 7 : tw));
    return (tdeeHistory || []).filter((r) => {
      if (r?.date && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
        return r.date >= limitDate;
      }
      const ts = Number(r?.timestamp);
      if (Number.isFinite(ts)) {
        const d = new Date(ts);
        const offset = d.getTimezoneOffset() * 60000;
        const dayStr = new Date(d.getTime() - offset).toISOString().slice(0, 10);
        return dayStr >= limitDate;
      }
      return false;
    });
  }, [tdeeHistory, timeWindow, anchorDate]);

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

      <div
        role="tablist"
        aria-label="Periodo dettaglio pilastri"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 8,
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: '16px 20px',
          margin: '0 -20px 24px -20px',
          backgroundColor: 'rgba(17, 17, 17, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
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

      <div
        role="tablist"
        aria-label="Telemetria: fisiologia o stile di vita"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 10,
          marginBottom: 20,
        }}
      >
        {[
          { id: 'fisiologia', label: 'Fisiologia' },
          { id: 'stile', label: 'Stile di vita' },
        ].map(({ id, label }) => {
          const active = telemetryTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTelemetryTab(id)}
              style={{
                padding: '8px 18px',
                borderRadius: 999,
                border: active ? '1px solid rgba(168, 85, 247, 0.55)' : '1px solid rgba(255,255,255,0.12)',
                background: active ? 'rgba(168, 85, 247, 0.18)' : 'transparent',
                color: active ? '#e9d5ff' : 'rgba(255,255,255,0.75)',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.04em',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {telemetryTab === 'fisiologia' && (
      <>
      {/* 1. Indice di ottimizzazione (giorno del tracker) + didascalia periodo */}
      <div
        style={{
          ...SECTION_CARD,
          background: 'transparent',
          border: 'none',
          padding: 0,
          textAlign: 'center',
        }}
      >
        <OptimizationCard dailyData={optimizationDailyData} targets={userTargets} />
        <div style={{ fontSize: '0.72rem', opacity: 0.55, marginTop: 8, color: '#94a3b8', lineHeight: 1.4 }}>
          Punteggio longevità medio (fine {statsPeriodEndLabel}): {averageScore != null ? `${averageScore} / 100` : '—'}
          {bioScore != null ? ` · Score vista tracker: ${bioScore}` : ''}
        </div>
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

      {/* Storico TDEE (allineato al timeWindow) */}
      <div style={SECTION_CARD}>
        <div
          style={{
            fontSize: '1rem',
            fontWeight: 'bold',
            marginBottom: 14,
            color: '#e5e5e5',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span aria-hidden>📈</span>
          Efficienza Metabolica (Storico TDEE)
        </div>
        {chartTdeeHistory.length === 0 ? (
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#888', lineHeight: 1.5 }}>
            Nessuna ricalibrazione del TDEE registrata in questo periodo.
          </p>
        ) : (
          <TdeeHistoryLineChart history={chartTdeeHistory} />
        )}
      </div>

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
          <>
            {compositionReliabilityPct != null && (
              <div
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(34, 211, 238, 0.35)',
                  background: 'rgba(34, 211, 238, 0.08)',
                  fontSize: '0.78rem',
                  color: '#a5f3fc',
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: '#22d3ee' }}>Trend di affidabilità stime</strong>
                {' — '}
                confronto tra peso previsto dal motore energetico e pesate reali: indicatore{' '}
                <strong>{compositionReliabilityPct}%</strong>
                {compositionReliabilityPct >= 75
                  ? ' (allineamento buono).'
                  : compositionReliabilityPct >= 45
                    ? ' (da monitorare).'
                    : ' (alta divergenza: continua a pesarti con costanza).'}
              </div>
            )}
            <BodyCompositionChart
              history={chartBodyMetrics}
              predictiveDailyRows={compositionPredictiveRows}
            />
            {compositionPredictiveRows && (
              <p style={{ margin: '10px 0 0', fontSize: '0.68rem', color: '#666', lineHeight: 1.4 }}>
                Linea continua e punti visibili = pesata reale o dato impedenziometrico; tratteggio = giorni stimati dal
                bilancio energetico (7700 kcal ≈ 1 kg). La massa muscolare in kg segue la stessa logica.
              </p>
            )}
          </>
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
      </>
      )}

      {telemetryTab === 'stile' && (
        <div style={SECTION_CARD}>
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 'bold',
              marginBottom: 8,
              color: '#e5e5e5',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: '1px solid #2a2a2a',
              paddingBottom: 12,
            }}
          >
            <span aria-hidden>📡</span>
            Telemetria avanzata · Stile di vita
          </div>
          <p style={{ margin: '0 0 18px', fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
            Trend comportamentali separati dal cruscotto quotidiano: disciplina (Kentu Score da storico rischi) e impatto
            dell&apos;alcol sul recupero (Body Battery / ricarica notturna del giorno dopo).
          </p>

          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#c4b5fd', marginBottom: 10 }}>
              Kentu Score — trend disciplina
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: '#888', lineHeight: 1.45 }}>
              Media mobile a 5 giorni sul punteggio longevità (matrice rischi giornaliera, 0–100). Valori più alti =
              minore rischio aggregato nel periodo.
            </p>
            <KentuDisciplineTrendChart
              scoreHistory={scoreHistory}
              anchorDate={anchorDate}
              timeWindow={timeWindow}
              todayScore={todayScore}
            />
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#a78bfa', marginBottom: 10 }}>
              Alcol vs recupero
            </div>
            <AlcoholRecoveryComposedChart
              fullHistory={fullHistory}
              userTargets={userTargets}
              anchorDate={anchorDate}
              timeWindow={timeWindow}
            />
          </div>
        </div>
      )}

    </div>
  );
}
