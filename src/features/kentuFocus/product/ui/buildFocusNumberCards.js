/**
 * Dati card "in numeri" — fatti da dossier/sessione, non dal testo AI.
 */

import { formatFocusHoursIt, formatFocusItNumber } from '../../normalize/focusDateUtils.js';
import { buildFocusFoodQualityBlock } from '../buildFocusFoodQualityBlock.js';
import {
  assessEnergyIrregularity,
  collectRecentEnergyIntakes,
  formatEnergyExcursionSubtitle,
} from '../focusEnergyVariability.js';

/**
 * @param {number|null|undefined} hour
 */
function formatClockFromDecimal(hour) {
  if (!Number.isFinite(Number(hour))) return null;
  const h = Number(hour);
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm >= 60) {
    hh += 1;
    mm = 0;
  }
  hh = ((hh % 24) + 24) % 24;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * @param {object|null|undefined} session
 * @param {string} periodId
 * @param {{ toImproveAreas?: Set<string>|string[] }} [opts]
 */
export function buildFocusNumberCards(session, periodId, opts = {}) {
  const nutrition = session?.nutrition || null;
  const sleepNight = session?.sleepNight || null;
  const byId = session?.wellness?.pillarsById || {};
  const targets = session?.userTargets || null;
  const targetKcal = Number(targets?.kcal);
  const hasTarget = Number.isFinite(targetKcal) && targetKcal > 0;
  const improveAreas = opts.toImproveAreas instanceof Set
    ? opts.toImproveAreas
    : new Set(opts.toImproveAreas || []);

  let fqDay = null;
  let energyVar = null;
  /** @type {{ date: string, kcal: number }[]} */
  let sparkPoints = [];
  try {
    if (session?.fullHistory && session?.analysisDate) {
      fqDay = buildFocusFoodQualityBlock({
        fullHistory: session.fullHistory,
        analysisDate: session.analysisDate,
        periodId,
      })?.day || null;
      energyVar = assessEnergyIrregularity({
        fullHistory: session.fullHistory,
        analysisDate: session.analysisDate,
        targetKcal: hasTarget ? targetKcal : null,
        periodId,
      });
      const collected = collectRecentEnergyIntakes({
        fullHistory: session.fullHistory,
        analysisDate: session.analysisDate,
        targetKcal: hasTarget ? targetKcal : null,
        periodId: 'ieri',
        calendarDays: 8,
        excludeAnalysisDay: false,
      });
      sparkPoints = (collected.rows || []).map((r) => ({
        date: r.date,
        kcal: Math.round(Number(r.intakeKcal)),
      }));
    }
  } catch {
    fqDay = null;
    energyVar = null;
    sparkPoints = [];
  }

  const flagged = (area) => improveAreas.has(area);

  // —— Energia ——
  let energy = {
    area: 'energia',
    label: 'Energia',
    value: 'non registrato',
    subtitle: null,
    hasData: false,
    flagged: flagged('energia'),
    energyIrregular: Boolean(energyVar?.irregular),
    excursionLine: null,
    targetKcal: hasTarget ? targetKcal : null,
    sparkPoints,
    detailKey: 'nutrition',
  };

  if (periodId === 'ieri') {
    const kcal = nutrition?.ieri?.totals?.kcal?.value;
    if (kcal != null && Number.isFinite(Number(kcal))) {
      const k = Math.round(Number(kcal));
      energy = {
        ...energy,
        value: `${formatFocusItNumber(k)} kcal`,
        subtitle: hasTarget ? `obiettivo ${formatFocusItNumber(targetKcal)}` : null,
        hasData: true,
        excursionLine: energyVar?.irregular
          ? `la settimana oscilla tra ${Math.round((energyVar.minIntakeKcal || 0) / 100) * 100} e ${Math.round((energyVar.maxIntakeKcal || 0) / 100) * 100}`
          : null,
      };
    }
  } else {
    const avg = nutrition?.trends?.averagesFromRecordedDaysOnly?.kcal
      ?? nutrition?.trends?.series?.filter((s) => s.status === 'recorded')
        ?.reduce((acc, s, _, arr) => acc + (Number(s.kcal) || 0) / arr.length, 0);
    if (avg != null && Number.isFinite(Number(avg))) {
      energy = {
        ...energy,
        value: `${formatFocusItNumber(Math.round(Number(avg)))} kcal`,
        subtitle: hasTarget
          ? `obiettivo ${formatFocusItNumber(targetKcal)}`
          : (nutrition?.trends?.daysWithFood != null
            ? `media su ${nutrition.trends.daysWithFood} giorni`
            : null),
        hasData: true,
        excursionLine: energyVar?.irregular
          ? (formatEnergyExcursionSubtitle(energyVar) || null)
          : null,
      };
    }
  }

  // —— Qualità ——
  const nova4 = Array.isArray(fqDay?.nova4Items) ? fqDay.nova4Items : [];
  const whole = Array.isArray(fqDay?.wholeGrainFoods) ? fqDay.wholeGrainFoods : [];
  const hasFood = Boolean(fqDay?.hasFood || nutrition?.ieri?.hasFood || (nutrition?.trends?.daysWithFood || 0) > 0);
  /** @type {object} */
  let quality = {
    area: 'qualita',
    label: 'Qualità',
    value: 'non registrato',
    subtitle: null,
    hasData: false,
    flagged: flagged('qualita'),
    detailKey: 'nutrition',
  };
  if (hasFood && periodId === 'ieri') {
    const upLabel = nova4.length === 0
      ? '0 ultra-processati'
      : (nova4.length === 1 ? '1 ultra-processato' : `${nova4.length} ultra-processati`);
    const wholeLabel = whole.length === 0
      ? null
      : (whole.length === 1 ? '1 integrale' : `${whole.length} integrali`);
    quality = {
      ...quality,
      value: nova4.length === 0 && wholeLabel ? wholeLabel : upLabel,
      subtitle: [upLabel, wholeLabel].filter(Boolean).join(' · '),
      hasData: true,
    };
  } else if (hasFood && periodId !== 'ieri') {
    quality = {
      ...quality,
      value: `${nutrition?.trends?.daysWithFood || 0} giorni`,
      subtitle: 'con pasti registrati',
      hasData: true,
    };
  }

  // —— Ritmo ——
  const mealsIeri = nutrition?.ieri?.meals || [];
  /** @type {object} */
  let ritmo = {
    area: 'ritmo',
    label: 'Ritmo',
    value: 'non registrato',
    subtitle: null,
    hasData: false,
    flagged: flagged('ritmo'),
    detailKey: null,
  };
  if (periodId === 'ieri' && mealsIeri.length > 0) {
    const clocks = mealsIeri.map((m) => Number(m.clockHour)).filter((h) => Number.isFinite(h));
    const latest = clocks.length ? Math.max(...clocks) : null;
    const bedtime = sleepNight?.bedtime != null ? Number(sleepNight.bedtime) : null;
    let beforeBed = null;
    if (latest != null && Number.isFinite(bedtime)) {
      let delta = bedtime - latest;
      if (delta < 0) delta += 24;
      beforeBed = formatFocusHoursIt(delta);
    }
    ritmo = {
      ...ritmo,
      value: formatClockFromDecimal(latest) || `${mealsIeri.length} pasti`,
      subtitle: beforeBed
        ? `${beforeBed} prima di dormire`
        : (latest != null && latest >= 21 ? 'sera avanzata' : 'orari in diario'),
      hasData: true,
    };
  }

  // —— Sonno ——
  const sleepHours = sleepNight?.hours ?? byId.sleep?.hours ?? null;
  const sleepAvailable = Boolean(sleepNight?.sleepAvailable || byId.sleep?.hasEvidence);
  /** @type {object} */
  let sonno = {
    area: 'sonno',
    label: 'Sonno',
    value: 'non registrato',
    subtitle: null,
    hasData: false,
    flagged: flagged('sonno'),
    detailKey: 'sleep',
  };
  if (sleepAvailable && sleepHours != null && Number.isFinite(Number(sleepHours))) {
    const bed = formatClockFromDecimal(sleepNight?.bedtime);
    const wake = formatClockFromDecimal(sleepNight?.wakeTime);
    sonno = {
      ...sonno,
      value: formatFocusHoursIt(Number(sleepHours)) || `${formatFocusItNumber(Number(sleepHours), { maxFrac: 1 })} h`,
      subtitle: bed && wake ? `${bed} → ${wake}` : (Number(sleepHours) < 7 ? 'sotto le 7 ore' : null),
      hasData: true,
    };
  }

  // —— Movimento ——
  const ex = byId.exercise;
  /** @type {object} */
  let movimento = {
    area: 'movimento',
    label: 'Movimento',
    value: 'non registrato',
    subtitle: null,
    hasData: false,
    flagged: flagged('movimento'),
    detailKey: 'exercise',
  };
  if (ex?.hasEvidence) {
    movimento = {
      ...movimento,
      value: ex.primaryValue || 'registrato',
      subtitle: ex.shortPhrase || null,
      hasData: true,
    };
  }

  return {
    energy,
    grid: [quality, ritmo, sonno, movimento],
    energyVar,
  };
}
