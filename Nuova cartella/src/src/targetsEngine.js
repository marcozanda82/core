import { normalizeBiometricEntry } from './biometricHistory';

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

/**
 * @param {Record<string, unknown> | import('./biometricHistory').BiometricHistoryEntry} latestBiometrics
 * @param {Record<string, unknown>} userProfile
 */
function weightKgFromBio(latestBiometrics, userProfile) {
  const bio = normalizeBiometricEntry(latestBiometrics);
  const w =
    bio?.weight && Number.isFinite(bio.weight)
      ? bio.weight
      : parseFloat(String(userProfile?.weight ?? '').replace(',', '.')) || 75;
  return w;
}

/**
 * Repartizione macro a partire da kcal fissi e peso (nessun BMR / formula teoretica di TDEE).
 * @param {number} weightKg
 * @param {number} kcal
 */
export function buildMacroSplitFromKcal(weightKg, kcal) {
  const k = Math.round(clamp(kcal, 800, 12000));
  const prot = Math.round(weightKg * 2.0);
  const fat = Math.round((k * 0.25) / 9);
  const carb = Math.round((k - prot * 4 - fat * 9) / 4);
  const water = Math.round(weightKg * 35);
  return {
    kcal: k,
    prot,
    carb: Math.max(50, carb),
    fat: Math.max(30, fat),
    water,
  };
}

/**
 * Aggiorna macro in base all’ultima pesata, mantenendo le kcal di riferimento (es. obiettivo salvato).
 * Nessun Mifflin / Katch: il fabbisogno reale deriva da `dataDrivenTdee` quando c’è abbastanza storico.
 * @param {Record<string, unknown> | import('./biometricHistory').BiometricHistoryEntry} latestBiometrics
 * @param {Record<string, unknown>} [userProfile]
 * @param {number} [currentKcal] — kcal attuali di profilo (o fallback 2000)
 * @returns {{
 *  kcal: number, prot: number, carb: number, fat: number, water: number,
 *  bmr: null, tdeeRaw: null, method: 'profile_kcal',
 * }}
 */
export function recalculateUserTargets(latestBiometrics, userProfile = {}, currentKcal = 2000) {
  const w = weightKgFromBio(latestBiometrics, userProfile);
  const k = Number(currentKcal);
  const kcl = Number.isFinite(k) && k > 0 ? k : 2000;
  const m = buildMacroSplitFromKcal(w, kcl);
  return {
    ...m,
    bmr: null,
    tdeeRaw: null,
    method: 'profile_kcal',
  };
}
