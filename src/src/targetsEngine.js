import { normalizeBiometricEntry } from './biometricHistory';

function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

/**
 * BMR Mifflin–St Jeor (kcal/d).
 *
 * @param {{ weightKg: number, heightCm: number, age: number, gender: 'M' | 'F' }} p
 */
export function mifflinStJeorBmr(p) {
  const { weightKg, heightCm, age, gender } = p;
  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
  bmr += gender === 'M' ? 5 : -161;
  return bmr;
}

/**
 * BMR Katch–McArdle (kcal/d), richiede massa magra in kg.
 *
 * @param {number} leanBodyMassKg
 */
export function katchMcArdleBmr(leanBodyMassKg) {
  return 370 + 21.6 * leanBodyMassKg;
}

/**
 * Ricalcola TDEE e macro partendo dall’ultima pesata e dal profilo utente.
 * Usa Katch–McArdle se c’è % grasso plausibile per stimare la massa magra; altrimenti Mifflin–St Jeor.
 *
 * @param {Record<string, unknown> | import('./biometricHistory').BiometricHistoryEntry} latestBiometrics
 * @param {Record<string, unknown>} userProfile
 * @returns {{
 *   bmr: number,
 *   tdeeRaw: number,
 *   kcal: number,
 *   prot: number,
 *   carb: number,
 *   fat: number,
 *   water: number,
 *   method: 'katch' | 'mifflin',
 * }}
 */
export function recalculateUserTargets(latestBiometrics, userProfile = {}) {
  const bio = normalizeBiometricEntry(latestBiometrics);
  const w =
    bio?.weight && Number.isFinite(bio.weight)
      ? bio.weight
      : parseFloat(String(userProfile.weight ?? '').replace(',', '.')) || 75;
  const h = parseFloat(String(userProfile.height ?? '').replace(',', '.')) || 175;
  const a = parseFloat(String(userProfile.age ?? '').replace(',', '.')) || 30;
  const gender = userProfile.gender === 'F' ? 'F' : 'M';
  const activity = parseFloat(String(userProfile.activityLevel ?? '1.55').replace(',', '.')) || 1.55;

  const bfPct =
    bio?.bodyFat != null && Number.isFinite(bio.bodyFat) ? bio.bodyFat : NaN;

  let bmr;
  let method = 'mifflin';
  if (Number.isFinite(bfPct) && bfPct > 3 && bfPct < 65 && w > 30) {
    const lbm = w * (1 - bfPct / 100);
    if (lbm >= 25) {
      bmr = katchMcArdleBmr(lbm);
      method = 'katch';
    }
  }
  if (method === 'mifflin' || !Number.isFinite(bmr)) {
    bmr = mifflinStJeorBmr({ weightKg: w, heightCm: h, age: a, gender });
    method = 'mifflin';
  }

  let tdee = bmr * activity;
  const ng =
    userProfile.nutritionGoal ||
    (userProfile.goal === 'lose' ? 'cut' : userProfile.goal === 'gain' ? 'bulk' : 'maintain');
  if (ng === 'cut') tdee -= 500;
  if (ng === 'bulk') tdee += 300;
  const kcal = Math.round(clamp(tdee, 800, 12000));

  const prot = Math.round(w * 2.0);
  const fat = Math.round((kcal * 0.25) / 9);
  const carb = Math.round((kcal - prot * 4 - fat * 9) / 4);
  const water = Math.round(w * 35);

  return {
    bmr: Math.round(bmr * 10) / 10,
    tdeeRaw: tdee,
    kcal,
    prot,
    carb: Math.max(50, carb),
    fat: Math.max(30, fat),
    water,
    method,
  };
}
