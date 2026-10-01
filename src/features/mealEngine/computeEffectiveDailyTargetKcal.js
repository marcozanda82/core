/**
 * Equazione dogmatica del target kcal giornaliero effettivo.
 * Unica somma aritmetica: Home e Meal Engine devono usare questo risultato, non ricalcolarlo a pezzi.
 *
 * Target effettivo = base impostazioni + burn + delta strategia + compensazione esplicita + Autopilota/Ghost.
 */

function roundKcal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

/**
 * @param {{
 *   settingsBaseKcal?: number,
 *   burnKcal?: number,
 *   strategyDeltaKcal?: number,
 *   compensationKcal?: number,
 *   autopilotKcal?: number,
 * }} [parts]
 * @returns {number}
 */
export function computeEffectiveDailyTargetKcal(parts = {}) {
  return Math.max(
    0,
    roundKcal(parts.settingsBaseKcal)
      + roundKcal(parts.burnKcal)
      + roundKcal(parts.strategyDeltaKcal)
      + roundKcal(parts.compensationKcal)
      + roundKcal(parts.autopilotKcal),
  );
}
