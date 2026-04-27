/**
 * Persisted food co-occurrence from saved meals: for each meal type, which foods
 * appear in the same meal and how often. Used for combination suggestions.
 */

export const FOOD_COOCCURRENCE_STORAGE_KEY = 'food_cooccurrence_v1';
export const FOOD_COOCCURRENCE_EVENT = 'food-cooccurrence-updated';

const MAX_NEIGHBORS_PER_NODE = 80;
const MAX_MEAL_BUCKETS = 6;

function normalizeMealTypeForCooc(value) {
  const meal = String(value || '').trim().toLowerCase();
  if (meal.includes('colazione')) return 'colazione';
  if (meal.includes('pranzo')) return 'pranzo';
  if (meal.includes('cena')) return 'cena';
  if (meal.includes('snack') || meal.includes('spuntino')) return 'snack';
  return '';
}

function normalizeFoodRefForCooc(food) {
  if (!food || typeof food !== 'object') return null;
  const name = String(food.name ?? food.desc ?? '').trim();
  const id = String(food.foodDbKey ?? food.id ?? name).trim();
  if (!id || !name) return null;
  return { id, name };
}

function loadRaw() {
  try {
    const parsed = JSON.parse(
      typeof localStorage !== 'undefined' ? localStorage.getItem(FOOD_COOCCURRENCE_STORAGE_KEY) || '{}' : '{}'
    );
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function persistRaw(raw) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(FOOD_COOCCURRENCE_STORAGE_KEY, JSON.stringify(raw));
    }
  } catch (_) {}
}

function pruneNeighborRow(row, neighborCap) {
  const entries = Object.entries(row || {});
  if (entries.length <= neighborCap) return row;
  entries.sort((a, b) => (Number(b[1]?.count) || 0) - (Number(a[1]?.count) || 0));
  const next = {};
  entries.slice(0, neighborCap).forEach(([k, v]) => {
    next[k] = v;
  });
  return next;
}

function pruneBucket(bucket, neighborCap) {
  if (!bucket || typeof bucket !== 'object') return bucket;
  const names = { ...(bucket.names || {}) };
  const adj = { ...(bucket.adj || {}) };
  Object.keys(adj).forEach((fromId) => {
    adj[fromId] = pruneNeighborRow(adj[fromId], neighborCap);
  });
  return { names, adj };
}

function pruneRawStore(raw) {
  const keys = Object.keys(raw || {}).filter((k) => normalizeMealTypeForCooc(k) === k);
  if (keys.length > MAX_MEAL_BUCKETS) {
    keys.sort();
    keys.slice(0, keys.length - MAX_MEAL_BUCKETS).forEach((k) => {
      delete raw[k];
    });
  }
  Object.keys(raw || {}).forEach((k) => {
    raw[k] = pruneBucket(raw[k], MAX_NEIGHBORS_PER_NODE);
  });
}

/**
 * Full map: { [mealType]: { names: { [id]: string }, adj: { [fromId]: { [toId]: { count, lastUsedAt?, name? } } } } } }
 */
export function loadFoodCooccurrenceMap() {
  return loadRaw();
}

export function dispatchFoodCooccurrenceUpdated() {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(FOOD_COOCCURRENCE_EVENT));
  } catch (_) {}
}

function bumpEdge(adj, fromId, toId, otherName, now) {
  if (!adj[fromId]) adj[fromId] = {};
  const cell = adj[fromId][toId] || { count: 0, lastUsedAt: 0 };
  cell.count = (Number(cell.count) || 0) + 1;
  cell.lastUsedAt = now;
  if (otherName) cell.name = String(otherName).trim();
  adj[fromId][toId] = cell;
}

/**
 * Record all unordered pairs from a saved meal (same diary save).
 * @param {Array<object>} foods - Meal line items (food / recipe rows)
 * @param {string} mealTypeSlot - e.g. ghost meal slot string from getGhostMealType
 */
export function recordMealFoodCooccurrence(foods, mealTypeSlot) {
  const mealType = normalizeMealTypeForCooc(mealTypeSlot);
  if (!mealType || !Array.isArray(foods) || foods.length < 2) return;

  const refs = [];
  const seen = new Set();
  foods.forEach((f) => {
    const r = normalizeFoodRefForCooc(f);
    if (!r || seen.has(r.id)) return;
    seen.add(r.id);
    refs.push(r);
  });
  if (refs.length < 2) return;

  const raw = loadRaw();
  const bucket = raw[mealType] && typeof raw[mealType] === 'object'
    ? { names: { ...(raw[mealType].names || {}) }, adj: { ...(raw[mealType].adj || {}) } }
    : { names: {}, adj: {} };

  const now = Date.now();
  refs.forEach((r) => {
    bucket.names[r.id] = r.name;
  });

  for (let i = 0; i < refs.length; i += 1) {
    for (let j = i + 1; j < refs.length; j += 1) {
      const a = refs[i].id;
      const b = refs[j].id;
      bumpEdge(bucket.adj, a, b, refs[j].name, now);
      bumpEdge(bucket.adj, b, a, refs[i].name, now);
    }
  }

  raw[mealType] = pruneBucket(bucket, MAX_NEIGHBORS_PER_NODE);
  pruneRawStore(raw);
  persistRaw(raw);
  dispatchFoodCooccurrenceUpdated();
}

export function getSavedPairCooccurrenceCount(mealType, idA, idB, map) {
  const mt = normalizeMealTypeForCooc(mealType);
  const a = String(idA || '').trim();
  const b = String(idB || '').trim();
  if (!mt || !a || !b || a === b) return 0;
  const cell = map?.[mt]?.adj?.[a]?.[b];
  return Number(cell?.count) || 0;
}

/**
 * Aggregates co-occurring foods for any anchor id (saved diary data).
 */
export function getCooccurrenceCompanions(anchorIdSet, mealType, map) {
  const mt = normalizeMealTypeForCooc(mealType);
  if (!mt || !map?.[mt]?.adj) return [];

  const bucket = map[mt];
  const agg = new Map();

  anchorIdSet.forEach((aid) => {
    const row = bucket.adj[aid];
    if (!row || typeof row !== 'object') return;
    Object.entries(row).forEach(([otherId, meta]) => {
      if (anchorIdSet.has(otherId)) return;
      const c = Number(meta?.count) || 0;
      const lu = Number(meta?.lastUsedAt) || 0;
      const name = String(meta?.name || bucket.names?.[otherId] || '').trim() || otherId;
      const prev = agg.get(otherId);
      if (!prev) {
        agg.set(otherId, { id: otherId, name, count: c, lastUsedAt: lu });
      } else {
        prev.count += c;
        prev.lastUsedAt = Math.max(prev.lastUsedAt, lu);
        if (name && name !== otherId) prev.name = name;
      }
    });
  });

  return [...agg.values()]
    .filter((item) => item.name)
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.lastUsedAt - a.lastUsedAt;
    });
}
