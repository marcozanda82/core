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

export function normalizeInboxDraftBlock(block) {
  if (!block || typeof block !== 'object') return null;
  const items = (Array.isArray(block.items) ? block.items : [])
    .map(serializeInboxDraftItem)
    .filter(Boolean);
  if (items.length === 0) return null;
  const createdAtRaw = Number(block.createdAt);
  const createdAt = Number.isFinite(createdAtRaw) && createdAtRaw > 0
    ? Math.round(createdAtRaw)
    : Date.now();
  const timeHHmm = String(block.timeHHmm || block.timeString || '').trim();
  const id = String(block.id || '').trim() || `inbox_${createdAt}`;
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
  (Array.isArray(log) ? log : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    if (entry.type === UNASSIGNED_DRAFTS_TYPE) {
      const nested = Array.isArray(entry.blocks) ? entry.blocks : [];
      nested.forEach((block) => {
        const normalized = normalizeInboxDraftBlock(block);
        if (normalized) blocks.push(normalized);
      });
      return;
    }
    if (entry.type === INBOX_DRAFT_TYPE) {
      const normalized = normalizeInboxDraftBlock(entry);
      if (normalized) blocks.push(normalized);
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
    if (entry.type === UNASSIGNED_DRAFTS_TYPE && Array.isArray(entry.blocks)) {
      const blocks = entry.blocks.filter((block) => String(block?.id) !== id);
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
