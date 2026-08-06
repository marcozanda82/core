import { foodEmojiForWipName } from '../wipMealBuilder/utils/wipMealItemUtils.js';

const MEAL_TYPE_LABELS = Object.freeze({
  colazione: 'Colazione',
  snack: 'Snack',
  pranzo: 'Pranzo',
  cena: 'Cena',
});

/**
 * Tiene solo la prima emoji / pittogramma (campo LLM `icon`).
 * @param {unknown} raw
 * @returns {string}
 */
export function sanitizeFoodIcon(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const match = s.match(/\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/u);
    if (match) return match[0];
  } catch {
    /* older engines without unicode property escapes */
  }
  // Fallback grezzo: primo cluster se sembra emoji
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)) {
    return Array.from(s)[0] || '';
  }
  return '';
}

function resolveMealReceiptTitle(mealType) {
  const key = String(mealType || '').trim().toLowerCase().split('_')[0];
  const label = MEAL_TYPE_LABELS[key] || 'Pasto';
  const feminine = label === 'Colazione' || label === 'Cena';
  return `✅ ${label} Registrat${feminine ? 'a' : 'o'}`;
}

function resolveMealPreviewTitle(mealType) {
  const key = String(mealType || '').trim().toLowerCase().split('_')[0];
  const label = MEAL_TYPE_LABELS[key] || 'Pasto';
  return `🍽️ ${label} · da confermare`;
}

function roundMacro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

/**
 * Payload strutturato per lo scontrino digitale in chat.
 *
 * @param {{
 *   items?: Array<object>,
 *   mealType?: string,
 *   timeString?: string,
 *   mealTotals?: { kcal?: number, pro?: number, carbo?: number, fat?: number } | null,
 *   projection?: { budgetRimanente?: object } | null,
 *   title?: string | null,
 *   preview?: boolean,
 * }} args
 * @returns {{
 *   title: string,
 *   mealType: string,
 *   timeString: string,
 *   items: Array<{ foodName: string, grams: number, icon: string, kcal: number }>,
 *   totals: { kcal: number, pro: number, carbo: number, fat: number },
 *   budgetRemaining: { kcal: number, pro: number, carbo: number, fat: number } | null,
 * }}
 */
export function buildMealReceiptPayload({
  items = [],
  mealType = '',
  timeString = '',
  mealTotals = null,
  projection = null,
  title = null,
  preview = false,
} = {}) {
  const list = (Array.isArray(items) ? items : [])
    .map((item) => {
      const foodName = String(item?.foodName || item?.name || item?.desc || '').trim();
      const grams = Math.round(Number(item?.grams ?? item?.qty ?? item?.qta ?? item?.weight) || 0);
      if (!foodName || grams <= 0) return null;
      const icon = sanitizeFoodIcon(item?.icon)
        || foodEmojiForWipName(foodName);
      const kcal = Math.round(Number(item?.kcal ?? item?.cal) || 0);
      const status = String(item?.status || '').trim() || null;
      return {
        foodName,
        grams,
        icon,
        kcal,
        pro: roundMacro(item?.pro ?? item?.prot),
        carbo: roundMacro(item?.carbo ?? item?.carb),
        fat: roundMacro(item?.fat ?? item?.fatTotal),
        foodDbKey: item?.foodDbKey != null ? String(item.foodDbKey) : null,
        alternatives: Array.isArray(item?.alternatives) ? item.alternatives : [],
        ...(status ? { status } : {}),
        ...(item?.resolutionSource ? { resolutionSource: item.resolutionSource } : {}),
      };
    })
    .filter(Boolean);

  const summed = list.reduce(
    (acc, item) => ({
      kcal: acc.kcal + (Number(item.kcal) || 0),
      pro: acc.pro + (Number(item.pro) || 0),
      carbo: acc.carbo + (Number(item.carbo) || 0),
      fat: acc.fat + (Number(item.fat) || 0),
    }),
    { kcal: 0, pro: 0, carbo: 0, fat: 0 },
  );

  const totals = {
    kcal: Math.round(
      Number(mealTotals?.kcal ?? mealTotals?.cal) > 0
        ? Number(mealTotals.kcal ?? mealTotals.cal)
        : summed.kcal,
    ),
    pro: roundMacro(
      Number(mealTotals?.pro ?? mealTotals?.prot) > 0
        ? (mealTotals.pro ?? mealTotals.prot)
        : summed.pro,
    ),
    carbo: roundMacro(
      Number(mealTotals?.carbo ?? mealTotals?.carb) > 0
        ? (mealTotals.carbo ?? mealTotals.carb)
        : summed.carbo,
    ),
    fat: roundMacro(
      Number(mealTotals?.fat ?? mealTotals?.fatTotal) > 0
        ? (mealTotals.fat ?? mealTotals.fatTotal)
        : summed.fat,
    ),
  };

  const rem = projection?.budgetRimanente;
  const budgetRemaining = rem && typeof rem === 'object'
    ? {
        kcal: Math.round(Number(rem.kcal) || 0),
        pro: roundMacro(rem.pro),
        carbo: roundMacro(rem.carbo),
        fat: roundMacro(rem.fat),
      }
    : null;

  const mealKey = String(mealType || '').trim().toLowerCase().split('_')[0];

  return {
    title: String(title || '').trim()
      || (preview ? resolveMealPreviewTitle(mealKey) : resolveMealReceiptTitle(mealKey)),
    mealType: mealKey,
    timeString: String(timeString || '').trim(),
    items: list.map(({ foodName, grams, icon, kcal, foodDbKey, alternatives, status, resolutionSource }) => ({
      foodName,
      grams,
      icon,
      kcal,
      ...(foodDbKey ? { foodDbKey } : {}),
      ...(Array.isArray(alternatives) && alternatives.length > 0 ? { alternatives } : {}),
      ...(status ? { status } : {}),
      ...(resolutionSource ? { resolutionSource } : {}),
    })),
    totals,
    budgetRemaining: preview ? null : budgetRemaining,
  };
}

/**
 * Testo accessibile / fallback se la UI non monta lo scontrino.
 * @param {ReturnType<typeof buildMealReceiptPayload>} receipt
 * @returns {string}
 */
export function mealReceiptFallbackText(receipt) {
  if (!receipt || typeof receipt !== 'object') return '✅ Pasto registrato';
  const t = receipt.totals || {};
  return `${receipt.title || '✅ Pasto registrato'} · ${Math.round(Number(t.kcal) || 0)} kcal`;
}
