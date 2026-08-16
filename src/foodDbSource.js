/** Pilastri del database alimentare KentuOS. */
export const FOOD_DB_SOURCE = {
  KENTU_IT: 'KENTU_IT',
  GLOBAL: 'GLOBAL',
  OFF: 'OFF',
};

/** Provenienza visibile in Vetrina, Ricerca e Carrello. */
export const FOOD_PROVENANCE = {
  PERSONAL: 'PERSONAL',
  ITALY: 'ITALY',
  GLOBAL: 'GLOBAL',
  OFF: 'OFF',
};

export const FOOD_PROVENANCE_META = {
  [FOOD_PROVENANCE.PERSONAL]: {
    glyph: 'C',
    tooltip: 'Fonte: Database personale CREA',
    sortRank: 0,
    borderClass: 'ring-1 ring-amber-400/35',
    badgeClass: 'text-amber-300/80',
  },
  [FOOD_PROVENANCE.ITALY]: {
    glyph: '🇮🇹',
    tooltip: 'Fonte: Database Italia',
    sortRank: 1,
    borderClass: '',
    badgeClass: 'text-emerald-300/70',
  },
  [FOOD_PROVENANCE.GLOBAL]: {
    glyph: '🌐',
    tooltip: 'Fonte: Database USDA',
    sortRank: 2,
    borderClass: '',
    badgeClass: 'text-violet-300/70',
  },
  [FOOD_PROVENANCE.OFF]: {
    glyph: 'OFF',
    tooltip: 'Fonte: Open Food Facts',
    sortRank: 3,
    borderClass: '',
    badgeClass: 'text-orange-400/80',
  },
};

export const FOOD_DB_SOURCE_BADGE = {
  [FOOD_DB_SOURCE.KENTU_IT]: {
    emoji: '🇮🇹',
    label: 'Kentu DB IT',
    title: 'Kentu DB IT — database certificato CREA',
    className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  },
  [FOOD_DB_SOURCE.GLOBAL]: {
    emoji: '🌐',
    label: 'Kentu DB',
    title: 'Kentu DB globale — esplorazione',
    className: 'border-violet-500/40 bg-violet-500/15 text-violet-300',
  },
  [FOOD_DB_SOURCE.OFF]: {
    emoji: '🛒',
    label: 'Open Food Facts',
    title: 'Open Food Facts — prodotti confezionati',
    className: 'border-orange-500/40 bg-orange-500/20 text-orange-400',
  },
};

export function isKentuItSource(value) {
  return value === FOOD_DB_SOURCE.KENTU_IT;
}

export function isGlobalSource(value) {
  return value === FOOD_DB_SOURCE.GLOBAL;
}

export function isOffSource(value) {
  return value === FOOD_DB_SOURCE.OFF || value === 'off';
}

export function resolveProvenanceFromLegacySource(legacySource) {
  if (legacySource === 'master' || legacySource === 'usda') return FOOD_PROVENANCE.GLOBAL;
  if (legacySource === 'kentu_it' || legacySource === 'crea') return FOOD_PROVENANCE.ITALY;
  if (legacySource === 'off') return FOOD_PROVENANCE.OFF;
  if (legacySource === 'personal' || legacySource === 'recipe') return FOOD_PROVENANCE.PERSONAL;
  return FOOD_PROVENANCE.PERSONAL;
}

export function resolveProvenanceFromTile(tile, personalDb = null) {
  if (tile?.provenance) return tile.provenance;
  if (tile?.source === FOOD_DB_SOURCE.OFF || tile?.row?.source === FOOD_DB_SOURCE.OFF || tile?._source === 'off') {
    return FOOD_PROVENANCE.OFF;
  }
  if (tile?.source === FOOD_DB_SOURCE.GLOBAL || tile?.row?.source === FOOD_DB_SOURCE.GLOBAL) {
    return FOOD_PROVENANCE.GLOBAL;
  }
  if (tile?._source) return resolveProvenanceFromLegacySource(tile._source);

  const dbKey = String(tile?.foodDbKey || '').trim();
  if (dbKey && personalDb && typeof personalDb === 'object' && personalDb[dbKey]) {
    return FOOD_PROVENANCE.PERSONAL;
  }

  if (tile?.row?.source === FOOD_DB_SOURCE.KENTU_IT && !dbKey) {
    return FOOD_PROVENANCE.ITALY;
  }

  if (dbKey || String(tile?.key || '').startsWith('db:')) {
    return FOOD_PROVENANCE.PERSONAL;
  }

  return FOOD_PROVENANCE.PERSONAL;
}

export function resolveProvenanceFromSearchResult(result) {
  if (result?.provenance) return result.provenance;
  if (result?._source) return resolveProvenanceFromLegacySource(result._source);
  if (result?.source === FOOD_DB_SOURCE.OFF) return FOOD_PROVENANCE.OFF;
  if (result?.source === FOOD_DB_SOURCE.GLOBAL) return FOOD_PROVENANCE.GLOBAL;
  if (result?.source === FOOD_DB_SOURCE.KENTU_IT) return FOOD_PROVENANCE.ITALY;
  return FOOD_PROVENANCE.PERSONAL;
}

export function resolveProvenanceFromDraftItem(item) {
  if (item?.provenance) return item.provenance;
  if (item?._searchSource) return resolveProvenanceFromLegacySource(item._searchSource);
  if (item?.foodDbKey) return FOOD_PROVENANCE.PERSONAL;
  if (item?.row?.source === FOOD_DB_SOURCE.OFF) return FOOD_PROVENANCE.OFF;
  if (item?.row?.source === FOOD_DB_SOURCE.GLOBAL) return FOOD_PROVENANCE.GLOBAL;
  if (item?.row?.source === FOOD_DB_SOURCE.KENTU_IT) return FOOD_PROVENANCE.ITALY;
  return FOOD_PROVENANCE.PERSONAL;
}

export function compareProvenancePriority(a, b) {
  const rankA = FOOD_PROVENANCE_META[a?.provenance]?.sortRank
    ?? FOOD_PROVENANCE_META[resolveProvenanceFromLegacySource(a?._source)]?.sortRank
    ?? 1;
  const rankB = FOOD_PROVENANCE_META[b?.provenance]?.sortRank
    ?? FOOD_PROVENANCE_META[resolveProvenanceFromLegacySource(b?._source)]?.sortRank
    ?? 1;

  if (rankA !== rankB) return rankA - rankB;
  return (b.matchScore ?? b.textScore ?? 0) - (a.matchScore ?? a.textScore ?? 0);
}

/** @deprecated Usare compareProvenancePriority */
export function compareFoodDbSourcePriority(a, b) {
  const provenanceA = a?.provenance
    ?? (isOffSource(a?.source ?? a?.row?.source)
      ? FOOD_PROVENANCE.OFF
      : isGlobalSource(a?.source ?? a?.row?.source)
        ? FOOD_PROVENANCE.GLOBAL
        : FOOD_PROVENANCE.ITALY);
  const provenanceB = b?.provenance
    ?? (isOffSource(b?.source ?? b?.row?.source)
      ? FOOD_PROVENANCE.OFF
      : isGlobalSource(b?.source ?? b?.row?.source)
        ? FOOD_PROVENANCE.GLOBAL
        : FOOD_PROVENANCE.ITALY);
  return compareProvenancePriority({ provenance: provenanceA }, { provenance: provenanceB });
}

export function resolveResultDbSource(result) {
  const provenance = resolveProvenanceFromSearchResult(result);
  if (provenance === FOOD_PROVENANCE.OFF) return FOOD_DB_SOURCE.OFF;
  if (provenance === FOOD_PROVENANCE.GLOBAL) return FOOD_DB_SOURCE.GLOBAL;
  return FOOD_DB_SOURCE.KENTU_IT;
}

export function attachProvenance(payload, provenance) {
  if (!payload || typeof payload !== 'object') return payload;
  return { ...payload, provenance };
}

export function attachProvenanceFromLegacySource(payload, legacySource) {
  return attachProvenance(payload, resolveProvenanceFromLegacySource(legacySource));
}
