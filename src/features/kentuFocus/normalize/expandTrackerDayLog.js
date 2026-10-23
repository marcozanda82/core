/**
 * Espansione pura del log trackerStorico allineata a normalizeLogData (coreEngine)
 * per i percorsi rilevanti a Focus: meal/items, single, type assente.
 * Nessuna dipendenza React/coreEngine — sicuro per CF packaging.
 */

/**
 * @param {unknown} raw
 * @returns {object[]}
 */
export function asLogCollectionArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((e) => e && typeof e === 'object');
  if (typeof raw === 'object') {
    return Object.values(raw).filter((e) => e && typeof e === 'object');
  }
  return [];
}

/**
 * Inferenza minimale mealType cartella (parità pratica con inferMealType per totali).
 * @param {object} entry
 */
function inferFolderMealType(entry) {
  const candidate = entry?.mealType ?? entry?.mealId ?? entry?.id ?? '';
  const s = String(candidate).trim();
  return s || 'unknown';
}

/**
 * Espande cartelle `meal` e alias `single`/type vuoto → food/recipe piatti.
 * Workout, sleep, stimoli e altri tipi restano pass-through.
 *
 * @param {unknown} rawLog
 * @returns {object[]}
 */
export function expandTrackerLogEntries(rawLog) {
  /** @type {object[]} */
  const out = [];
  const list = asLogCollectionArray(rawLog);

  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;

    if (entry.type === 'meal') {
      const folderMealType = inferFolderMealType(entry);
      const items = asLogCollectionArray(entry.items);
      items.forEach((subItem, subIndex) => {
        if (!subItem || typeof subItem !== 'object') return;
        const itemType = subItem.type === 'recipe' ? 'recipe' : 'food';
        const itemMt = subItem.mealType != null && String(subItem.mealType).trim() !== ''
          ? String(subItem.mealType).trim()
          : folderMealType;
        out.push({
          ...subItem,
          type: itemType,
          mealType: itemMt,
          id: subItem.id != null && String(subItem.id) !== ''
            ? subItem.id
            : `food_${index}_${subIndex}_${itemMt}`,
          kcal: subItem.kcal ?? subItem.cal ?? 0,
        });
      });
      return;
    }

    if (entry.type === 'single' || entry.type == null || entry.type === '') {
      const mealType = inferFolderMealType(entry);
      out.push({
        ...entry,
        type: 'food',
        mealType,
        id: entry.id != null && String(entry.id) !== ''
          ? entry.id
          : `food_${index}_${mealType}`,
        kcal: entry.kcal ?? entry.cal ?? 0,
      });
      return;
    }

    out.push({
      ...entry,
      kcal: entry.kcal ?? entry.cal ?? 0,
    });
  });

  return out;
}

/**
 * Sorgente log giorno: preferisce `log`, fallback legacy `dati.log` (come getLogFromStoricoTree).
 * @param {object|null|undefined} node
 * @returns {unknown}
 */
export function pickDayLogRaw(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.log != null) return node.log;
  if (node.dati && typeof node.dati === 'object' && node.dati.log != null) {
    return node.dati.log;
  }
  return null;
}
