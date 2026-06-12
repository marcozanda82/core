import { differenceInCalendarDays } from '../calendarDateUtils';

/**
 * @param {{
 *   mesocycleStartDate?: string | null,
 *   mesocycleLoadWeeks?: number,
 *   mesocycleDeloadWeeks?: number,
 *   viewDateIso?: string | null,
 *   isDeload?: boolean,
 *   phase?: string | null,
 * }} params
 * @returns {{
 *   show: boolean,
 *   inDeload: boolean,
 *   currentWeek: number,
 *   totalWeeks: number,
 * } | null}
 */
export function computeMesocycleRadar({
  mesocycleStartDate,
  mesocycleLoadWeeks,
  mesocycleDeloadWeeks,
  viewDateIso,
  isDeload,
  phase,
}) {
  const loadWeeks = Math.max(0, Math.round(Number(mesocycleLoadWeeks) || 0));
  const deloadWeeks = Math.max(0, Math.round(Number(mesocycleDeloadWeeks) || 0));
  const totalWeeks = loadWeeks + deloadWeeks;
  const phaseNorm = phase != null ? String(phase).trim().toLowerCase() : '';
  const hasPhaseMeta = phaseNorm === 'spinta' || phaseNorm === 'scarico' || isDeload === true;

  if (totalWeeks <= 0 && !hasPhaseMeta) return null;

  const startDate = String(mesocycleStartDate || '').trim();
  const viewDate = String(viewDateIso || '').trim();
  let daysElapsed = 0;
  let currentWeek = 1;

  if (startDate && viewDate) {
    daysElapsed = Math.max(0, differenceInCalendarDays(startDate, viewDate));
    currentWeek = Math.floor(daysElapsed / 7) + 1;
    if (totalWeeks > 0) {
      currentWeek = Math.min(Math.max(1, currentWeek), totalWeeks);
    }
  }

  const inferredDeload = loadWeeks > 0 && Math.floor(daysElapsed / 7) >= loadWeeks;
  const inDeload =
    isDeload === true ||
    phaseNorm === 'scarico' ||
    (phaseNorm !== 'spinta' && inferredDeload && totalWeeks > 0);

  return {
    show: true,
    inDeload,
    currentWeek,
    totalWeeks: totalWeeks > 0 ? totalWeeks : Math.max(1, currentWeek),
  };
}
