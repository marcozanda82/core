/**
 * Calcola i 4 pilastri 0–100 da metriche aggregate (single source of truth).
 *
 * @param {{
 *   energyBalance?: number,
 *   trainingLoadAxis?: number,
 *   meanTraining01?: number,
 *   sleepPenalty?: number,
 *   longevityScore?: number,
 *   distance?: number,
 * }} metrics
 * @returns {{ ipertrofia: number, definizione: number, longevita: number, energia: number }}
 */
export function mapMetricsToPillars(metrics = {}) {
  const energyBalance = num(metrics.energyBalance, 0);
  const trainingLoadAxis = num(metrics.trainingLoadAxis, 0);
  const meanTraining01 = num(metrics.meanTraining01, NaN);
  const sleepPenalty = num(metrics.sleepPenalty, 0);
  const longevityScore = num(metrics.longevityScore, NaN);
  const distance = num(metrics.distance, NaN);

  const trainingPct = Number.isFinite(meanTraining01)
    ? clamp(meanTraining01, 0, 100)
    : clamp(((trainingLoadAxis + 100) / 2), 0, 100);

  let ipertrofia = trainingPct;
  if (energyBalance > 0) {
    ipertrofia += clamp((energyBalance / 100) * 18, 0, 18);
  }
  ipertrofia = clamp(Math.round(ipertrofia), 0, 100);

  const definizione = clamp(Math.round(50 - energyBalance * 0.5), 0, 100);

  let longevita;
  if (Number.isFinite(longevityScore)) {
    longevita = clamp(Math.round(longevityScore), 0, 100);
  } else if (Number.isFinite(distance)) {
    longevita = clamp(Math.round(100 - distance), 0, 100);
  } else {
    longevita = 50;
  }

  let energia = 100;
  if (sleepPenalty > 0) {
    energia -= clamp(sleepPenalty * 9, 0, 45);
  }
  const trainingExcess = Number.isFinite(meanTraining01)
    ? Math.max(0, meanTraining01 - 82)
    : Math.max(0, trainingLoadAxis - 55);
  if (trainingExcess > 0) {
    energia -= clamp(trainingExcess * 0.55, 0, 35);
  }
  energia = clamp(Math.round(energia), 0, 100);

  return { ipertrofia, definizione, longevita, energia };
}

/**
 * Coordinate bolla dal quadruplo pilastri (stessa formula della testa principale).
 *
 * @param {{ ipertrofia: number, definizione: number, longevita: number, energia: number }} pillars
 * @returns {{ x: number, y: number }}
 */
export function pillarsToBubbleCoords(pillars) {
  const ipertrofia = num(pillars?.ipertrofia, 0);
  const definizione = num(pillars?.definizione, 0);
  const longevita = num(pillars?.longevita, 0);
  const energia = num(pillars?.energia, 0);
  return {
    x: clamp(energia - longevita, -100, 100),
    y: clamp(ipertrofia - definizione, -100, 100),
  };
}

/**
 * Mappa l'output di useMetabolicMapEngine / computeMetabolicMapCompassBundle
 * in 4 score telemetrici 0–100 (nessun nuovo motore metabolico).
 *
 * @param {Record<string, unknown> | null | undefined} compassBundle
 * @returns {{ ipertrofia: number, definizione: number, longevita: number, energia: number }}
 */
export function mapBundleToPillars(compassBundle) {
  const b = compassBundle != null && typeof compassBundle === 'object' ? compassBundle : {};
  const inputs =
    b.metabolicMapInputs != null && typeof b.metabolicMapInputs === 'object'
      ? b.metabolicMapInputs
      : {};
  const rawDetails =
    b.metabolicMapRawDetails != null && typeof b.metabolicMapRawDetails === 'object'
      ? b.metabolicMapRawDetails
      : {};

  return mapMetricsToPillars({
    energyBalance: num(b.energyBalance ?? inputs.energyBalance, 0),
    trainingLoadAxis: num(b.trainingLoad ?? inputs.trainingLoad, 0),
    meanTraining01: num(rawDetails.meanTraining01, NaN),
    sleepPenalty: num(b.sleepPenalty, 0),
    longevityScore: num(b.longevityScore, NaN),
    distance: num(b.mapPositionInertial?.distance ?? b.distance, NaN),
  });
}

/**
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
