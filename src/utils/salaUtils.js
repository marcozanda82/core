import { MEAL_CONFIRM_DEBOUNCE_MS } from '../constants/salaComandiConstants';

/** Ore decimali di sonno da addormentamento a risveglio (attraversa mezzanotte). */
export function computeSleepDurationHours(bedDecimal, wakeDecimal) {
  const b = Number(bedDecimal);
  const w = Number(wakeDecimal);
  if (!Number.isFinite(b) || !Number.isFinite(w)) return 0;
  let dur = w - b;
  if (dur <= 0) dur += 24;
  return Math.round(Math.min(24, Math.max(0, dur)) * 100) / 100;
}

export function getNowDecimalHourForPlanMerge() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

export function tryAcquireMealConfirmGuard(guardRef) {
  const g = guardRef.current;
  const now = Date.now();
  if (g.busy || now - g.lastAt < MEAL_CONFIRM_DEBOUNCE_MS) return false;
  g.busy = true;
  g.lastAt = now;
  return true;
}

export function releaseMealConfirmGuard(guardRef) {
  guardRef.current.busy = false;
}
