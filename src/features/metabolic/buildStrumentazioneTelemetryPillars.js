import { computeTotali } from '../../useBiochimico';
import { resolveProgressionNutritionTargets } from '../trendHub/utils/saluteDashboardMetrics';
import { mapBundleToPillars } from './pillarsMapperLegacy';

function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function pillarScoreToPct(score, max = 25) {
  const n = Number(score);
  const cap = Number(max) > 0 ? Number(max) : 25;
  if (!Number.isFinite(n)) return null;
  return clampPct((n / cap) * 100);
}

function proteinQuotaPct(activeLog, userTargets) {
  const totals = computeTotali(Array.isArray(activeLog) ? activeLog : []);
  const targets = resolveProgressionNutritionTargets(userTargets || {});
  const consumed = Number(totals?.prot ?? totals?.pro);
  const target = Number(targets?.prot);
  if (!Number.isFinite(consumed) || !Number.isFinite(target) || target <= 0) return null;
  return clampPct((consumed / target) * 100);
}

/**
 * Telemetria pilastri Radar — agganciata a Longevità/Progressione SSOT + segnali mappa.
 *
 * @param {{
 *   longevityScore?: number|null,
 *   longevityBreakdown?: object|null,
 *   progressionScore?: number|null,
 *   progressionBreakdown?: object|null,
 *   activeLog?: object[],
 *   userTargets?: object|null,
 *   mapData?: object|null,
 * }} ctx
 * @returns {{ ipertrofia: number, definizione: number, longevita: number, energia: number }}
 */
export function buildStrumentazioneTelemetryPillars(ctx = {}) {
  const {
    longevityScore = null,
    longevityBreakdown = null,
    progressionBreakdown = null,
    activeLog = [],
    userTargets = null,
    mapData = null,
  } = ctx;

  const fallback = mapBundleToPillars(mapData);

  const longevita = Number.isFinite(Number(longevityScore))
    ? clampPct(longevityScore)
    : fallback.longevita;

  const proteinPct = proteinQuotaPct(activeLog, userTargets);
  const weightsPct = pillarScoreToPct(longevityBreakdown?.weightsScore)
    ?? progressionBreakdown?.trainingPct
    ?? null;
  const ipertrofiaParts = [proteinPct, weightsPct].filter((v) => v != null);
  const ipertrofia = ipertrofiaParts.length > 0
    ? clampPct(
      ipertrofiaParts.length === 2
        ? proteinPct * 0.55 + weightsPct * 0.45
        : ipertrofiaParts.reduce((a, b) => a + b, 0) / ipertrofiaParts.length,
    )
    : fallback.ipertrofia;

  const definizione = progressionBreakdown?.nutritionPct != null
    ? clampPct(progressionBreakdown.nutritionPct)
    : pillarScoreToPct(progressionBreakdown?.nutritionScore)
      ?? fallback.definizione;

  const sleepPct = progressionBreakdown?.sleepPct != null
    ? clampPct(progressionBreakdown.sleepPct)
    : pillarScoreToPct(longevityBreakdown?.sleepScore);

  const glycemicRaw = Number(
    mapData?.metabolicMapInputs?.glycemicInstability
    ?? mapData?.glycemicInstability,
  );
  const glycemicStability = Number.isFinite(glycemicRaw)
    ? clampPct(100 - Math.max(0, Math.min(100, glycemicRaw)))
    : null;

  const energiaParts = [sleepPct, glycemicStability].filter((v) => v != null);
  const energia = energiaParts.length > 0
    ? clampPct(
      energiaParts.length === 2
        ? sleepPct * 0.62 + glycemicStability * 0.38
        : energiaParts.reduce((a, b) => a + b, 0) / energiaParts.length,
    )
    : fallback.energia;

  return {
    ipertrofia,
    definizione,
    longevita,
    energia,
  };
}

export default buildStrumentazioneTelemetryPillars;
