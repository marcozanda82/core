/**
 * Stato bozza pasto (McDrive → Diario / Firebase).
 * Solo `status` esplicito: le stime senza status restano nei totali calorici.
 *
 * Inbox / triage: `unassigned_drafts` è il nodo Firebase; nel dailyLog piatto
 * ogni blocco è un'entry `inbox_draft` (timestamp + voci raw, senza mealType).
 */

export const MEAL_DRAFT_UNRESOLVED_STATUSES = new Set([
  'raw',
  'pending_enrichment',
  'requires_disambiguation',
  'processing',
  'validating',
]);

export const UNASSIGNED_DRAFTS_TYPE = 'unassigned_drafts';
export const INBOX_DRAFT_TYPE = 'inbox_draft';

export function isUnresolvedMealDraftItem(item) {
  if (!item || typeof item !== 'object') return false;
  return MEAL_DRAFT_UNRESOLVED_STATUSES.has(String(item.status || '').toLowerCase());
}

export function countUnresolvedMealDraftItems(items = []) {
  return (Array.isArray(items) ? items : []).filter(isUnresolvedMealDraftItem).length;
}

export function isInboxDraftEntry(entry) {
  const t = String(entry?.type || '');
  return t === INBOX_DRAFT_TYPE || t === UNASSIGNED_DRAFTS_TYPE;
}

/** Firebase può serializzare gli array come oggetto `{0:…,1:…}`. */
export function asCollectionArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => value[key])
      .filter((item) => item != null);
  }
  return [];
}

export function resolveInboxDraftIdentity(block, fallbackIndex = 0) {
  const explicit = String(block?.id || '').trim();
  if (explicit) return explicit;
  const createdAt = Number(block?.createdAt);
  const stamp = Number.isFinite(createdAt) && createdAt > 0 ? Math.round(createdAt) : 'na';
  const foods = asCollectionArray(block?.items)
    .map((item) => String(item?.foodName || item?.name || item?.desc || '').trim())
    .filter(Boolean)
    .join('_')
    .slice(0, 28)
    .replace(/\s+/g, '-');
  return `inbox_${stamp}_${fallbackIndex}_${foods || 'draft'}`;
}

export function serializeInboxDraftItem(item) {
  if (!item || typeof item !== 'object') return null;
  const foodName = String(item.foodName || item.name || item.desc || item.label || '').trim();
  if (!foodName) return null;
  const gramsRaw = Number(item.grams ?? item.qta ?? item.weight ?? item.qty);
  const grams = Number.isFinite(gramsRaw) && gramsRaw > 0 ? Math.round(gramsRaw) : 1;
  const itemId = (item.id != null && String(item.id).trim())
    || (item.itemId != null && String(item.itemId).trim())
    || '';
  const status = String(item.status || 'raw').toLowerCase() || 'raw';
  return {
    foodName,
    name: foodName,
    desc: foodName,
    grams,
    qta: grams,
    weight: grams,
    qty: grams,
    status,
    kcal: 0,
    cal: 0,
    prot: 0,
    carb: 0,
    fat: 0,
    spokenFoodName: String(item.spokenFoodName || foodName),
    ...(itemId ? { id: itemId } : {}),
    ...(item.servingLabel ? { servingLabel: String(item.servingLabel) } : {}),
    ...(item.coffeeShopProductId
      ? { coffeeShopProductId: String(item.coffeeShopProductId).trim() }
      : {}),
    ...(item.icon ? { icon: item.icon } : {}),
  };
}

export function normalizeInboxDraftBlock(block, fallbackIndex = 0) {
  if (!block || typeof block !== 'object') return null;
  const items = asCollectionArray(block.items)
    .map(serializeInboxDraftItem)
    .filter(Boolean);
  if (items.length === 0) return null;
  const createdAtRaw = Number(block.createdAt);
  const createdAt = Number.isFinite(createdAtRaw) && createdAtRaw > 0
    ? Math.round(createdAtRaw)
    : Date.now();
  const timeHHmm = String(block.timeHHmm || block.timeString || '').trim();
  const id = resolveInboxDraftIdentity({ ...block, items, createdAt }, fallbackIndex);
  return {
    type: INBOX_DRAFT_TYPE,
    id,
    createdAt,
    timeHHmm,
    items,
    kcal: 0,
  };
}

export function extractUnassignedDraftBlocks(log) {
  const blocks = [];
  const seen = new Set();
  let index = 0;
  (Array.isArray(log) ? log : asCollectionArray(log)).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const pushBlock = (raw) => {
      const normalized = normalizeInboxDraftBlock(raw, index);
      if (!normalized) return;
      let { id } = normalized;
      if (seen.has(id)) id = `${id}__${index}`;
      seen.add(id);
      index += 1;
      blocks.push({ ...normalized, id });
    };
    if (entry.type === UNASSIGNED_DRAFTS_TYPE) {
      asCollectionArray(entry.blocks).forEach(pushBlock);
      return;
    }
    if (entry.type === INBOX_DRAFT_TYPE) {
      pushBlock(entry);
    }
  });
  return blocks.sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
}

export function appendUnassignedDraftBlock(log, { items, createdAt, timeHHmm } = {}) {
  const block = normalizeInboxDraftBlock({
    id: `inbox_${Number(createdAt) || Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Number(createdAt) || Date.now(),
    timeHHmm,
    items,
  });
  if (!block) return Array.isArray(log) ? [...log] : [];
  return [...(Array.isArray(log) ? log : []), block];
}

export function removeUnassignedDraftBlock(log, blockId) {
  const id = String(blockId || '').trim();
  if (!id) return Array.isArray(log) ? [...log] : [];
  const next = [];
  (Array.isArray(log) ? log : []).forEach((entry) => {
    if (!entry) return;
    if (entry.type === INBOX_DRAFT_TYPE && String(entry.id) === id) return;
    if (entry.type === UNASSIGNED_DRAFTS_TYPE && entry.blocks) {
      const blocks = asCollectionArray(entry.blocks).filter((block) => String(block?.id) !== id);
      if (blocks.length === 0) return;
      next.push({ ...entry, blocks });
      return;
    }
    next.push(entry);
  });
  return next;
}

export function restoreUnassignedDraftBlock(log, block) {
  const normalized = normalizeInboxDraftBlock(block);
  if (!normalized) return Array.isArray(log) ? [...log] : [];
  const without = removeUnassignedDraftBlock(log, normalized.id);
  return [...without, normalized];
}

function uniquifyInboxDraftItems(items) {
  const used = new Set();
  const stamp = Date.now();
  return (Array.isArray(items) ? items : [])
    .map((raw, index) => {
      const item = serializeInboxDraftItem(raw);
      if (!item) return null;
      let id = String(item.id || '').trim() || `item_${stamp}_${index}`;
      while (used.has(id)) id = `${id}_${used.size}`;
      used.add(id);
      return { ...item, id };
    })
    .filter(Boolean);
}

/**
 * Accorpa la bozza `sourceDraftId` dentro `targetDraftId`.
 * Concatena gli items, tiene l'id del target, orario/createdAt dal più recente, rimuove la source.
 */
export function replaceUnassignedDraftBlocks(log, blocks) {
  const rest = (Array.isArray(log) ? log : []).filter((entry) => !isInboxDraftEntry(entry));
  const nextBlocks = (Array.isArray(blocks) ? blocks : [])
    .map((block, index) => normalizeInboxDraftBlock(block, index))
    .filter(Boolean);
  return [...rest, ...nextBlocks];
}

export function mergeUnassignedDraftBlocks(log, sourceDraftId, targetDraftId) {
  const sourceId = String(sourceDraftId || '').trim();
  const targetId = String(targetDraftId || '').trim();
  const current = Array.isArray(log) ? log : [];
  if (!sourceId || !targetId || sourceId === targetId) return current;

  const blocks = extractUnassignedDraftBlocks(current);
  const source = blocks.find((block) => String(block.id) === sourceId);
  const target = blocks.find((block) => String(block.id) === targetId);
  if (!source || !target) return current;

  const sourceCreated = Number(source.createdAt) || 0;
  const targetCreated = Number(target.createdAt) || 0;
  const newer = sourceCreated >= targetCreated ? source : target;
  const older = newer === source ? target : source;
  const mergedItems = uniquifyInboxDraftItems([
    ...(Array.isArray(target.items) ? target.items : []),
    ...(Array.isArray(source.items) ? source.items : []),
  ]);
  const merged = normalizeInboxDraftBlock({
    id: target.id,
    createdAt: Math.max(sourceCreated, targetCreated) || Date.now(),
    timeHHmm: String(newer.timeHHmm || older.timeHHmm || '').trim(),
    items: mergedItems,
  }, 0);
  if (!merged) return current;

  const nextBlocks = blocks
    .filter((block) => String(block.id) !== sourceId)
    .map((block) => (String(block.id) === targetId ? merged : block));
  return replaceUnassignedDraftBlocks(current, nextBlocks);
}

export function removeLogItemsByIds(log, ids) {
  const idSet = new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)).filter(Boolean));
  if (idSet.size === 0) return Array.isArray(log) ? [...log] : [];
  return (Array.isArray(log) ? log : []).filter((entry) => {
    if (!entry || (entry.type !== 'food' && entry.type !== 'recipe')) return true;
    const id = entry.id != null ? String(entry.id) : '';
    return !idSet.has(id);
  });
}

export const INBOX_UNDO_TOAST_MS = 4500;

export function formatInboxDraftCardLabel(block) {
  const time = String(block?.timeHHmm || '').trim() || '—';
  const names = (Array.isArray(block?.items) ? block.items : [])
    .map((item) => String(item?.foodName || item?.name || item?.desc || '').trim())
    .filter(Boolean);
  const foods = names.length > 0 ? names.join(', ') : 'appunti';
  return `Bozza ${time} - ${foods}`;
}

/**
 * Bozze pasti in attesa: inbox non assegnata + voci raw sui pasti + extra (es. chat).
 */
export function countPendingMealDrafts({ dailyLog = [], extraDrafts = [] } = {}) {
  const log = Array.isArray(dailyLog) ? dailyLog : asCollectionArray(dailyLog);
  const inbox = extractUnassignedDraftBlocks(log).length;
  const pendingOnMeals = log.filter((entry) => (
    (entry?.type === 'food' || entry?.type === 'recipe')
    && String(entry?.mealType || '').trim().length > 0
    && isUnresolvedMealDraftItem(entry)
  )).length;
  const extra = (Array.isArray(extraDrafts) ? extraDrafts : []).filter(Boolean).length;
  return inbox + pendingOnMeals + extra;
}

export function serializeUnassignedDraftsForFirebase(log) {
  const blocks = extractUnassignedDraftBlocks(log).map((block) => ({
    id: block.id,
    createdAt: block.createdAt,
    timeHHmm: block.timeHHmm,
    items: block.items,
  }));
  if (blocks.length === 0) return null;
  return {
    type: UNASSIGNED_DRAFTS_TYPE,
    blocks,
  };
}
