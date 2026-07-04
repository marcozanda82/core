import { TARGETS } from '../../useBiochimico';

/** @typedef {'GREEN' | 'YELLOW' | 'RED'} ProteinReliabilityStatus */

/** @type {readonly string[]} */
export const AMINO_ACID_KEYS = Object.keys(TARGETS.amino);

/**
 * @param {unknown} value
 * @returns {number}
 */
function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Record<string, unknown>} item
 * @returns {number}
 */
export function readItemProteinGrams(item) {
  return safeNum(item.prot ?? item.proteine ?? item.protein);
}

/**
 * @param {Record<string, unknown>} item
 * @returns {boolean}
 */
export function hasAminoAcidProfile(item) {
  return AMINO_ACID_KEYS.some((key) => safeNum(item[key]) > 0);
}

/**
 * @param {Record<string, unknown>} item
 * @returns {boolean}
 */
export function itemNeedsAminoHealing(item) {
  if (item.isAminoEstimated === true) return true;
  if (readItemProteinGrams(item) <= 0) return false;
  return !hasAminoAcidProfile(item);
}

/**
 * @param {number} scorePercent
 * @returns {ProteinReliabilityStatus}
 */
export function resolveProteinReliabilityStatus(scorePercent) {
  const score = safeNum(scorePercent);
  if (score > 90) return 'GREEN';
  if (score >= 50) return 'YELLOW';
  return 'RED';
}

/**
 * Affidabilità proteica giornaliera:
 * verifiedProtein = somma prot dove isAminoEstimated !== true
 * score = (verifiedProtein / totalProtein) * 100
 *
 * @param {Array<Record<string, unknown>> | null | undefined} dailyLog
 * @returns {{
 *   totalProtein: number,
 *   verifiedProtein: number,
 *   estimatedProtein: number,
 *   score: number,
 *   status: ProteinReliabilityStatus,
 * }}
 */
export function calculateProteinReliability(dailyLog) {
  let totalProtein = 0;
  let verifiedProtein = 0;

  (dailyLog || []).forEach((raw) => {
    if (raw == null || typeof raw !== 'object') return;
    const item = /** @type {Record<string, unknown>} */ (raw);
    if (item.type !== 'food' && item.type !== 'recipe') return;

    const protein = readItemProteinGrams(item);
    if (protein <= 0) return;

    totalProtein += protein;
    if (item.isAminoEstimated !== true) {
      verifiedProtein += protein;
    }
  });

  const estimatedProtein = Math.max(0, totalProtein - verifiedProtein);
  const score =
    totalProtein > 0
      ? Math.round((verifiedProtein / totalProtein) * 1000) / 10
      : 100;

  return {
    totalProtein: Math.round(totalProtein * 10) / 10,
    verifiedProtein: Math.round(verifiedProtein * 10) / 10,
    estimatedProtein: Math.round(estimatedProtein * 10) / 10,
    score,
    status: resolveProteinReliabilityStatus(score),
  };
}

/**
 * Alimenti da sanare: stimati o senza profilo amminoacidico.
 *
 * @param {Array<Record<string, unknown>> | null | undefined} dailyLog
 * @returns {Array<{ id: string, name: string, protein: number, isAminoEstimated: boolean, hasAminoProfile: boolean }>}
 */
export function getFoodsNeedingAminoHealing(dailyLog) {
  /** @type {Map<string, { id: string, name: string, protein: number, isAminoEstimated: boolean, hasAminoProfile: boolean }>} */
  const byKey = new Map();

  (dailyLog || []).forEach((raw, index) => {
    if (raw == null || typeof raw !== 'object') return;
    const item = /** @type {Record<string, unknown>} */ (raw);
    if (item.type !== 'food' && item.type !== 'recipe') return;
    if (!itemNeedsAminoHealing(item)) return;

    const protein = readItemProteinGrams(item);
    const name = String(item.name ?? item.desc ?? item.label ?? 'Alimento').trim() || 'Alimento';
    const id = String(item.id ?? item.foodId ?? item.dbKey ?? `row:${index}`);
    const dedupeKey = item.dbKey ?? item.foodId ?? item.id ?? name.toLowerCase();
    const hasProfile = hasAminoAcidProfile(item);
    const isEstimated = item.isAminoEstimated === true;

    const existing = byKey.get(String(dedupeKey));
    if (existing) {
      existing.protein += protein;
      existing.isAminoEstimated = existing.isAminoEstimated || isEstimated;
      existing.hasAminoProfile = existing.hasAminoProfile || hasProfile;
      return;
    }

    byKey.set(String(dedupeKey), {
      id,
      name,
      protein: Math.round(protein * 10) / 10,
      isAminoEstimated: isEstimated,
      hasAminoProfile: hasProfile,
    });
  });

  return Array.from(byKey.values()).sort((a, b) => b.protein - a.protein);
}
