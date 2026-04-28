/**
 * Match migliore sul database alimenti: esatto > bidirezionale (includes) con score da differenza di lunghezza.
 * @param {string} searchQuery
 * @param {Record<string, { desc?: string, name?: string }>} db
 * @returns {string|null} chiave dell'entry nel db o null
 */
export function findBestFoodMatch(searchQuery, db) {
  if (!searchQuery || !db) return null;
  const query = searchQuery.toLowerCase().trim();
  if (!query) return null;
  let bestMatchKey = null;
  let bestScore = -1;

  for (const key in db) {
    if (!Object.prototype.hasOwnProperty.call(db, key)) continue;
    const item = db[key];
    const dbName = (item.desc || item.name || '').toLowerCase().trim();
    if (!dbName) continue;

    if (dbName === query) return key;

    if (dbName.includes(query) || query.includes(dbName)) {
      const lengthDiff = Math.abs(dbName.length - query.length);
      const score = 1000 - lengthDiff;

      if (score > bestScore) {
        bestScore = score;
        bestMatchKey = key;
      }
    }
  }
  return bestMatchKey;
}

/**
 * Abitudine / recency: match su foodDb + ultima grammatura usata nello storico (log più recenti per primi).
 * @param {string} query
 * @param {Record<string, object>} foodDb
 * @param {Array} flatLog — es. dailyLog (+ simulated) già normalizzato; ordine [più recente, …]
 */
export function findRecentFoodHabit(query, foodDb, flatLog) {
  if (!query || !foodDb) return null;
  const bestKey = findBestFoodMatch(query, foodDb);
  if (!bestKey) return null;
  const item = foodDb[bestKey];
  if (!item) return null;
  const logArr = Array.isArray(flatLog) ? flatLog : [];
  let lastQty = null;
  for (let i = 0; i < logArr.length; i++) {
    const e = logArr[i];
    if (e.type !== 'food' && e.type !== 'recipe') continue;
    const nm = e.desc || e.name;
    if (!nm || typeof nm !== 'string') continue;
    const k = findBestFoodMatch(nm.trim(), foodDb);
    if (k === bestKey) {
      const q = Number(e.qta ?? e.weight);
      if (Number.isFinite(q) && q > 0) {
        lastQty = Math.round(q);
        break;
      }
    }
  }
  const dq = Number(item.defaultQty);
  const defaultQty =
    lastQty != null ? lastQty : Number.isFinite(dq) && dq > 0 ? Math.round(dq) : 150;
  return {
    dbKey: bestKey,
    name: item.desc || item.name || query,
    qty: defaultQty,
  };
}
