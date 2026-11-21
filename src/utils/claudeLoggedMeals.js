/**
 * Pasti definitivi registrati da Claude (kentu_log_meal): inbox “posta in arrivo”.
 * Le bozze (external_drafts) restano fuori da questo modulo.
 */

export const CLAUDE_MEAL_SOURCE = 'claude';

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isClaudeToken(value) {
  return String(value || '').trim().toLowerCase() === CLAUDE_MEAL_SOURCE;
}

/**
 * @param {unknown} mealTypeOrId
 * @returns {boolean}
 */
export function looksLikeClaudeMealId(mealTypeOrId) {
  return /^claude_[a-z]+_/i.test(String(mealTypeOrId || '').trim());
}

/**
 * Slot canonico da mealId MCP (`claude_pranzo_abc` → `pranzo`).
 * @param {unknown} mealTypeOrId
 * @returns {string|null}
 */
export function claudeMealSlotFromId(mealTypeOrId) {
  const m = String(mealTypeOrId || '').trim().match(/^claude_([a-z]+)_/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Voce piatto (dopo normalizeLogData) o cartella meal.
 * @param {object|null|undefined} entry
 */
export function isClaudeLoggedMealEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (isClaudeToken(entry.source) || isClaudeToken(entry.origin) || isClaudeToken(entry.entrySource)) {
    return true;
  }
  if (looksLikeClaudeMealId(entry.mealId) || looksLikeClaudeMealId(entry.mealType)) {
    return true;
  }
  if (entry.type === 'meal' && Array.isArray(entry.items)) {
    return entry.items.some((item) => isClaudeLoggedMealEntry(item));
  }
  return false;
}

/**
 * @param {object|null|undefined} entry
 */
export function isUnreadClaudeLoggedMeal(entry) {
  if (!isClaudeLoggedMealEntry(entry)) return false;
  const reviewed = entry.reviewedAt ?? entry.mealReviewedAt;
  return reviewed == null || reviewed === '';
}

/**
 * Chiave stabile del pasto Claude (mealId cartella).
 * @param {object|null|undefined} entry
 * @returns {string|null}
 */
export function resolveClaudeMealId(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.mealId != null && String(entry.mealId).trim()) {
    const id = String(entry.mealId).trim();
    if (looksLikeClaudeMealId(id) || isClaudeLoggedMealEntry(entry)) return id;
  }
  const mt = String(entry.mealType || '').trim();
  if (looksLikeClaudeMealId(mt)) return mt;
  return null;
}

/**
 * Conta pasti Claude non ancora aperti (unique mealId / slot).
 * @param {unknown[]} dailyLog — log piatto o nested
 * @returns {number}
 */
export function countUnreadClaudeLoggedMeals(dailyLog) {
  const list = Array.isArray(dailyLog) ? dailyLog : [];
  const seen = new Set();
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'meal') {
      if (!isUnreadClaudeLoggedMeal(entry)) continue;
      const id = resolveClaudeMealId(entry) || `folder:${entry.mealId || entry.desc}`;
      seen.add(id);
      continue;
    }
    if (entry.type !== 'food' && entry.type !== 'recipe' && entry.type) continue;
    if (!isUnreadClaudeLoggedMeal(entry)) continue;
    const id = resolveClaudeMealId(entry)
      || `${String(entry.mealType || '')}_${String(entry.mealTime ?? entry.time ?? '')}`;
    seen.add(id);
  }
  return seen.size;
}

/**
 * Elenco mealId Claude non revisionati (per mark-all).
 * @param {unknown[]} dailyLog
 * @returns {string[]}
 */
export function listUnreadClaudeMealIds(dailyLog) {
  const list = Array.isArray(dailyLog) ? dailyLog : [];
  const seen = new Set();
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'meal') {
      if (!isUnreadClaudeLoggedMeal(entry)) continue;
      const id = resolveClaudeMealId(entry);
      if (id) seen.add(id);
      continue;
    }
    if (entry.type !== 'food' && entry.type !== 'recipe' && entry.type) continue;
    if (!isUnreadClaudeLoggedMeal(entry)) continue;
    const id = resolveClaudeMealId(entry);
    if (id) seen.add(id);
  }
  return [...seen];
}

/**
 * Patch merge-by-id: solo reviewedAt sulle cartelle meal.
 * @param {string[]} mealIds
 * @param {number} [now]
 */
export function buildClaudeReviewedAtPatches(mealIds, now = Date.now()) {
  const at = Number(now) || Date.now();
  return (Array.isArray(mealIds) ? mealIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean)
    .map((mealId) => ({
      type: 'meal',
      mealId,
      reviewedAt: at,
    }));
}
