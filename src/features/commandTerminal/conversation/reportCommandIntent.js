import { addDays } from '../../../calendarDateUtils.js';
import { TRACKER_STORICO_KEY, getLogFromStoricoTree, normalizeLogData } from '../../../coreEngine';
import { computeTotali } from '../../../useBiochimico';
import { computeSleepEngineSnapshot } from '../../../hooks/useSleepEngine';
import {
  computeDayMaxFastingWindowHours,
} from '../../../utils/dayTrackingStatus';
import { selectStoricoDayNode } from '../../trendHub/utils/healthContextSelectors';

/** Copertina statica bollettini chat (`public/report.jpg`). */
export const REPORT_COVER_SRC = '/report.jpg';

/** Video intro mascotte al trigger report (`public/reportanimazione.mp4`). */
export const REPORT_ANIMATION_SRC = '/reportanimazione.mp4';

export const REPORT_KINDS = Object.freeze({
  YESTERDAY: 'yesterday',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
});

const REPORT_MATCHERS = [
  {
    kind: REPORT_KINDS.YESTERDAY,
    patterns: [
      /\breport\s+di\s+ieri\b/i,
      /\bbollettino\s+di\s+ieri\b/i,
      /\bgenera\s+(?:il\s+)?report\s+di\s+ieri\b/i,
      /\banalisi\s+(?:di\s+)?ieri\b/i,
    ],
  },
  {
    kind: REPORT_KINDS.WEEKLY,
    patterns: [
      /\bsintesi\s+settimanale\b/i,
      /\breport\s+settimanale\b/i,
      /\bgenera\s+(?:la\s+)?sintesi\s+settimanale\b/i,
      /\btrend\s+settimanale\b/i,
    ],
  },
  {
    kind: REPORT_KINDS.MONTHLY,
    patterns: [
      /\btrend\s+mensile\b/i,
      /\breport\s+mensile\b/i,
      /\bsintesi\s+mensile\b/i,
      /\bgenera\s+(?:il\s+)?trend\s+mensile\b/i,
    ],
  },
];

/**
 * @param {string} userText
 * @param {{ reportKind?: string, intent?: string }} [options]
 * @returns {{ kind: string, label: string } | null}
 */
export function matchReportCommand(userText, options = {}) {
  const forced = String(options.reportKind || options.kind || '').trim().toLowerCase();
  if (forced === 'yesterday' || forced === REPORT_KINDS.YESTERDAY) {
    return { kind: REPORT_KINDS.YESTERDAY, label: 'Report di ieri' };
  }
  if (forced === 'weekly' || forced === REPORT_KINDS.WEEKLY) {
    return { kind: REPORT_KINDS.WEEKLY, label: 'Sintesi settimanale' };
  }
  if (forced === 'monthly' || forced === REPORT_KINDS.MONTHLY) {
    return { kind: REPORT_KINDS.MONTHLY, label: 'Trend mensile' };
  }

  const intent = String(options.intent || '').trim().toUpperCase();
  if (intent === 'GENERATE_PERIOD_REPORT' || intent === 'GENERATE_REPORT') {
    // intent senza kind → prova il testo, altrimenti ieri
  }

  const text = String(userText || '').trim();
  if (!text) {
    if (intent === 'GENERATE_PERIOD_REPORT' || intent === 'GENERATE_REPORT') {
      return { kind: REPORT_KINDS.YESTERDAY, label: 'Report di ieri' };
    }
    return null;
  }

  for (const entry of REPORT_MATCHERS) {
    if (entry.patterns.some((re) => re.test(text))) {
      const label = entry.kind === REPORT_KINDS.YESTERDAY
        ? 'Report di ieri'
        : entry.kind === REPORT_KINDS.WEEKLY
          ? 'Sintesi settimanale'
          : 'Trend mensile';
      return { kind: entry.kind, label };
    }
  }

  if (intent === 'GENERATE_PERIOD_REPORT' || intent === 'GENERATE_REPORT') {
    return { kind: REPORT_KINDS.YESTERDAY, label: 'Report di ieri' };
  }
  return null;
}

function safeToday(currentState) {
  const fromState = String(currentState?.todayDate || currentState?.activeDate || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromState)) return fromState;
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayLabel(iso) {
  const parts = String(iso || '').split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

function avg(nums) {
  const list = (nums || []).filter((n) => Number.isFinite(n));
  if (!list.length) return null;
  return Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 10) / 10;
}

/**
 * Aggrega telemetria sul periodo richiesto (sola lettura, zero DB cibo).
 * @param {object} currentState
 * @param {string} kind
 */
export function buildPeriodReportData(currentState = {}, kind = REPORT_KINDS.YESTERDAY) {
  const today = safeToday(currentState);
  const fullHistory = currentState?.fullHistory && typeof currentState.fullHistory === 'object'
    ? currentState.fullHistory
    : {};
  const userTargets = currentState?.userTargets || {};

  let startOffset = 1;
  let endOffsetExclusive = 2;
  let title = '📰 Report di Ieri';
  let periodLabel = 'Ieri';

  if (kind === REPORT_KINDS.WEEKLY) {
    startOffset = 1;
    endOffsetExclusive = 8;
    title = '📅 Sintesi Settimanale';
    periodLabel = 'Ultimi 7 giorni';
  } else if (kind === REPORT_KINDS.MONTHLY) {
    startOffset = 1;
    endOffsetExclusive = 31;
    title = '📈 Trend Mensile';
    periodLabel = 'Ultimi 30 giorni';
  }

  const days = [];
  for (let offset = startOffset; offset < endOffsetExclusive; offset += 1) {
    const dateStr = addDays(today, -offset);
    const dayNode = selectStoricoDayNode(fullHistory, dateStr)
      || fullHistory[TRACKER_STORICO_KEY(dateStr)]
      || null;
    const log = normalizeLogData(getLogFromStoricoTree(fullHistory, dateStr) || dayNode?.log || []);
    const totali = computeTotali(log);
    const sleep = computeSleepEngineSnapshot(log);
    const fastingH = computeDayMaxFastingWindowHours(dayNode);
    const workouts = log.filter((e) => e?.type === 'workout' && e?.isGhost !== true);
    days.push({
      date: dateStr,
      label: formatDayLabel(dateStr),
      kcal: Math.round(Number(totali?.kcal) || 0),
      prot: Math.round(Number(totali?.prot) || 0),
      carb: Math.round(Number(totali?.carb) || 0),
      fat: Math.round(Number(totali?.fatTotal ?? totali?.fat) || 0),
      sleepHours: sleep?.hasSleepData ? Math.round((sleep.totalSleepHours || 0) * 10) / 10 : null,
      fastingHours: fastingH,
      workoutCount: workouts.length,
    });
  }

  const tracked = days.filter((d) => d.kcal > 0 || d.sleepHours != null || d.workoutCount > 0);
  return {
    kind,
    title,
    periodLabel,
    today,
    targetKcal: Math.round(Number(userTargets?.kcal) || 0) || null,
    targetProt: Math.round(Number(userTargets?.prot) || 0) || null,
    days,
    sampleDays: tracked.length,
    avgKcal: avg(tracked.map((d) => d.kcal).filter((n) => n > 0)),
    avgProt: avg(tracked.map((d) => d.prot).filter((n) => n > 0)),
    avgSleep: avg(tracked.map((d) => d.sleepHours).filter((n) => n != null)),
    avgFasting: avg(tracked.map((d) => d.fastingHours).filter((n) => n != null)),
    workoutSessions: tracked.reduce((s, d) => s + (d.workoutCount || 0), 0),
  };
}

/**
 * Markdown locale (fallback + base per LLM).
 * @param {ReturnType<typeof buildPeriodReportData>} data
 */
export function formatPeriodReportMarkdown(data) {
  if (!data) return '';
  const lines = [
    data.title,
    '',
    `**Periodo:** ${data.periodLabel}`,
    `**Giorni con telemetria:** ${data.sampleDays}`,
    '',
    '### 🔬 Nutrizione',
  ];

  if (data.avgKcal != null) {
    lines.push(
      `- Media kcal: **${data.avgKcal}**`
      + (data.targetKcal ? ` (target ${data.targetKcal})` : ''),
    );
  } else {
    lines.push('- Nessun pasto tracciato nel periodo.');
  }
  if (data.avgProt != null) {
    lines.push(
      `- Media proteine: **${data.avgProt} g**`
      + (data.targetProt ? ` (target ${data.targetProt} g)` : ''),
    );
  }

  lines.push('', '### 😴 Sonno & Digiuno');
  lines.push(
    data.avgSleep != null
      ? `- Media sonno: **${data.avgSleep} h**`
      : '- Sonno: dato insufficiente nel periodo.',
  );
  lines.push(
    data.avgFasting != null
      ? `- Media finestra digiuno: **${data.avgFasting} h**`
      : '- Digiuno: dato insufficiente nel periodo.',
  );

  lines.push('', '### 🏋️ Attività');
  lines.push(`- Sessioni allenamento: **${data.workoutSessions}**`);

  if (data.kind === REPORT_KINDS.YESTERDAY && data.days[0]) {
    const d = data.days[0];
    lines.push('', '### 📋 Dettaglio giornata');
    lines.push(`- Data: **${d.label}**`);
    lines.push(`- Kcal ${d.kcal} · P ${d.prot}g · C ${d.carb}g · F ${d.fat}g`);
    if (d.sleepHours != null) lines.push(`- Sonno: **${d.sleepHours} h**`);
    if (d.fastingHours != null) lines.push(`- Digiuno max: **${d.fastingHours} h**`);
  } else if (data.days.length > 1) {
    lines.push('', '### 📊 Giorni chiave');
    const highlights = [...data.days]
      .filter((d) => d.kcal > 0 || d.sleepHours != null)
      .slice(0, 5);
    for (const d of highlights) {
      lines.push(
        `- **${d.label}:** ${d.kcal} kcal`
        + (d.sleepHours != null ? ` · sonno ${d.sleepHours}h` : '')
        + (d.workoutCount ? ` · workout ×${d.workoutCount}` : ''),
      );
    }
  }

  lines.push(
    '',
    '---',
    '_Bollettino telemetrico Kentu · nessuna voce alimentare inventata._',
  );
  return lines.join('\n');
}

export function buildReportSystemInstruction(data) {
  return [
    'Sei un analista clinico Kentu (Minion-Ingegnere telemetria).',
    'Scrivi un bollettino Markdown elegante sul periodo richiesto.',
    'REGOLE:',
    `1. Titolo esatto: ${data.title}`,
    '2. Tre sezioni ### con emoji (Nutrizione, Sonno & Digiuno, Attività).',
    '3. Usa elenchi e **grassetto**. Tono autorevole, breve.',
    '4. NON inventare cibi. Usa SOLO i dati JSON forniti.',
    '5. NON includere immagini Markdown (la copertina è gestita dall\'app).',
    '6. Rispondi SOLO con Markdown (niente JSON, niente wrapper).',
  ].join(' ');
}
