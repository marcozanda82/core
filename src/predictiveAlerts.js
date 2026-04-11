/**
 * Avvisi predittivi prima di scelte che possono impattare sonno, digestione o allenamento.
 * @param {{ current?: object, target?: object, time?: unknown, hasWorkout?: boolean|string }} params
 * @returns {{ type: 'warning', message: string }[]}
 */
export function getPredictiveAlerts({ current, target, time, hasWorkout }) {
  const hourOfDay = (t) => {
    if (t == null) return 12;
    if (typeof t === 'number' && Number.isFinite(t)) return Math.min(24, Math.max(0, t));
    if (t instanceof Date) return t.getHours() + t.getMinutes() / 60;
    if (typeof t === 'string') {
      const m = t.trim().match(/^(\d{1,2}):(\d{2})/);
      if (m) {
        const h = Number(m[1]);
        const min = Number(m[2]);
        if (Number.isFinite(h) && Number.isFinite(min)) return h + min / 60;
      }
    }
    return 12;
  };

  const c = current && typeof current === 'object' ? current : {};
  const t = target && typeof target === 'object' ? target : {};
  const curP = Number(c.protein ?? c.prot ?? 0) || 0;
  const curC = Number(c.carbs ?? c.carb ?? c.cho ?? 0) || 0;
  const curF = Number(c.fats ?? c.fat ?? c.fatTotal ?? 0) || 0;
  const tgtP = Number(t.protein ?? t.prot ?? 0) || 0;

  const h = hourOfDay(time);
  const evening = h >= 17;
  const beforeFourPM = h < 16;

  const workout =
    hasWorkout != null &&
    (typeof hasWorkout === 'boolean'
      ? hasWorkout
      : typeof hasWorkout === 'string'
        ? hasWorkout.trim().length > 0
        : Boolean(hasWorkout));

  const alerts = [];

  if (tgtP > 0 && curP >= tgtP && beforeFourPM) {
    alerts.push({ type: 'warning', message: 'Protein already saturated, avoid protein later' });
  }

  if (tgtP > 0 && curP >= tgtP && workout) {
    alerts.push({ type: 'warning', message: 'Post-workout protein not necessary' });
  }

  if ((evening && curF > 25) || curP > 160) {
    alerts.push({ type: 'warning', message: 'Possible sleep disturbance' });
  }

  if (curC < 200 && workout) {
    alerts.push({ type: 'warning', message: 'Low glycogen, consider carbs' });
  }

  return alerts;
}
