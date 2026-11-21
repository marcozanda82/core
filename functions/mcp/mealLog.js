/**
 * Scrittura pasti Claude direttamente nel diario (scope meals:write).
 * Nutrienti/condimenti: toCanonicalDiaryFoodItem + withCondiments (src condiviso).
 * Writer: mergeDayNodeWrite via Admin (mai replace dell’intero log).
 */

import { sha256Hex } from './hashToken.js';
import { addDaysIso, isIsoDate, resolveDayRef, todayInRome } from './dates.js';
import { MCP_SCOPE_MEALS_WRITE, hasMcpScope } from './scopes.js';
import {
  MEAL_DRAFT_LIMITS,
  MEAL_DRAFT_SLOTS,
  TIME_HHMM_RE,
  IDEMPOTENCY_KEY_RE,
  McpToolError,
  mcpAuditPath,
  consumeMcpWriteQuota,
} from './mealDrafts.js';
import { saveDayNodeWithRevAdmin } from './dayWriteAdmin.js';
import { loadUserFocusContext } from './loadUserContext.js';
import {
  toCanonicalDiaryFoodItem,
  withCondimentsOnResolved,
} from '../../src/features/mealEngine/canonicalMealCommit.js';

export const mcpMealIdemPath = (uid, hash) => `mcp_meal_idem/${uid}/${hash}`;
export const CLAUDE_MEAL_ORIGIN = 'claude';
export const CLAUDE_MEAL_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

const MEAL_LABELS = Object.freeze({
  colazione: 'Colazione',
  snack: 'Spuntino',
  pranzo: 'Pranzo',
  cena: 'Cena',
});

function invalid(message) {
  return new McpToolError('invalid_input', message);
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanMultilineText(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hhmmToDecimal(hhmm) {
  const m = String(hhmm || '').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}

async function writeAudit(db, uid, entry) {
  try {
    await db.ref(mcpAuditPath(uid)).push({ at: Date.now(), ...entry });
  } catch (error) {
    console.warn('[kentuMcp] audit write failed', String(error?.message || error).slice(0, 120));
  }
}

function requireMealsScope(ctx) {
  if (!hasMcpScope(ctx?.scopes, MCP_SCOPE_MEALS_WRITE)) {
    throw new McpToolError(
      'missing_scope',
      'Questo gettone non può scrivere pasti. Attiva il permesso "meals:write" sul gettone in Kentu.',
    );
  }
}

/**
 * @param {unknown} input
 * @param {number} [now]
 */
export function validateMealLogInput(input, now = Date.now()) {
  if (!input || typeof input !== 'object') throw invalid('Dati pasto mancanti.');
  const L = MEAL_DRAFT_LIMITS;

  let date;
  try {
    ({ date } = resolveDayRef(String(input.date || ''), new Date(now)));
  } catch {
    throw invalid('date: usa today, yesterday oppure YYYY-MM-DD.');
  }
  if (!isIsoDate(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) {
    throw invalid('date: data non valida.');
  }
  const today = todayInRome(new Date(now));
  const min = addDaysIso(today, -L.dateWindowDays);
  const max = addDaysIso(today, L.dateWindowDays);
  if (date < min || date > max) {
    throw invalid(`date: deve essere entro ${L.dateWindowDays} giorni da oggi (${min} … ${max}).`);
  }

  const slot = String(input.slot || '').trim().toLowerCase();
  if (!MEAL_DRAFT_SLOTS.includes(slot)) {
    throw invalid(`slot: uno tra ${MEAL_DRAFT_SLOTS.join(', ')}.`);
  }

  const time = String(input.time || '').trim();
  if (!TIME_HHMM_RE.test(time)) throw invalid('time: formato HH:MM (00:00–23:59).');

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw invalid('items: serve almeno un alimento.');
  }
  if (input.items.length > L.maxItems) throw invalid(`items: massimo ${L.maxItems} alimenti.`);

  const items = input.items.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw invalid(`items[${index}]: oggetto atteso.`);
    const allowed = new Set(['name', 'foodDbKey', 'grams']);
    const extra = Object.keys(raw).filter((key) => !allowed.has(key));
    if (extra.length > 0) throw invalid(`items[${index}]: campi non ammessi (${extra.join(', ')}).`);

    const name = cleanText(raw.name);
    if (name.length < L.nameMin || name.length > L.nameMax) {
      throw invalid(`items[${index}].name: da ${L.nameMin} a ${L.nameMax} caratteri.`);
    }
    const foodDbKey = cleanText(raw.foodDbKey);
    if (!foodDbKey || foodDbKey.length > L.foodDbKeyMax) {
      throw invalid(
        `items[${index}].foodDbKey obbligatorio e valido. `
        + 'Se manca, usa kentu_create_meal_draft invece di kentu_log_meal.',
      );
    }
    const g = Number(raw.grams);
    if (!Number.isInteger(g) || g < L.gramsMin || g > L.gramsMax) {
      throw invalid(
        `items[${index}].grams: intero > 0 obbligatorio. `
        + 'Se i grammi non sono certi, usa kentu_create_meal_draft.',
      );
    }
    return { name, foodDbKey, grams: g };
  });

  const rawText = cleanMultilineText(input.originalText);
  if (!rawText) throw invalid('originalText: serve il testo originale scritto dall’utente.');
  if (rawText.length > L.rawTextMax) {
    throw invalid(`originalText: massimo ${L.rawTextMax} caratteri.`);
  }

  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    throw invalid('idempotencyKey: 8–128 caratteri tra lettere, cifre, . _ : -');
  }

  return { date, slot, time, items, rawText, idempotencyKey };
}

function lookupFoodRow(catalogs, personalDb, key) {
  const layers = [
    personalDb,
    catalogs?.kentuItDb,
    catalogs?.globalDb,
    catalogs?.offDb,
  ];
  for (const layer of layers) {
    if (layer && typeof layer === 'object' && layer[key]) return layer[key];
  }
  return null;
}

/**
 * Costruisce voci diario canoniche + condimenti (stessa funzione dell’app).
 * @param {Array<{ name: string, foodDbKey: string, grams: number }>} items
 * @param {{ catalogs: object, personalDb: object }} foodCtx
 * @param {{ mealId: string, slot: string, mealTime: number, now: number }} mealCtx
 */
export async function buildClaudeMealEntries(items, foodCtx, mealCtx) {
  const resolved = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const row = lookupFoodRow(foodCtx.catalogs, foodCtx.personalDb, item.foodDbKey);
    if (!row) {
      throw invalid(
        `items[${index}].foodDbKey: "${item.foodDbKey}" non trovato. `
        + 'Usa kentu_search_food oppure kentu_create_meal_draft.',
      );
    }
    const id = `${mealCtx.mealId}_i${index}`;
    const canonical = toCanonicalDiaryFoodItem({
      food: {
        name: item.name,
        desc: item.name,
        foodName: item.name,
        foodDbKey: item.foodDbKey,
        matchedKey: item.foodDbKey,
        row,
        status: 'resolved',
      },
      grams: item.grams,
      mealContext: {
        mealType: mealCtx.mealId,
        mealTime: mealCtx.mealTime,
        id,
        batchId: mealCtx.mealId,
      },
      sourceMetadata: { entrySource: CLAUDE_MEAL_ORIGIN },
    });
    if (!canonical) {
      throw invalid(`items[${index}]: impossibile costruire la voce canonica.`);
    }
    canonical.origin = CLAUDE_MEAL_ORIGIN;
    canonical.entrySource = CLAUDE_MEAL_ORIGIN;
    canonical.grams = item.grams;
    canonical.qta = item.grams;
    canonical.weight = item.grams;
    canonical.qty = item.grams;
    resolved.push(canonical);
  }

  const withExtras = withCondimentsOnResolved(resolved).map((row) => ({
    ...row,
    origin: row.origin || CLAUDE_MEAL_ORIGIN,
    entrySource: row.entrySource || CLAUDE_MEAL_ORIGIN,
    mealType: mealCtx.mealId,
    mealTime: mealCtx.mealTime,
  }));

  return withExtras;
}

function buildNestedMeal(mealId, slot, items, { now, originalText } = {}) {
  const createdAt = Number(now) || Date.now();
  return {
    type: 'meal',
    mealId,
    desc: MEAL_LABELS[slot] || slot,
    slot,
    // Inbox “posta in arrivo”: definitivo nel diario, da aprire → reviewedAt.
    source: CLAUDE_MEAL_ORIGIN,
    origin: CLAUDE_MEAL_ORIGIN,
    entrySource: CLAUDE_MEAL_ORIGIN,
    createdAt,
    reviewedAt: null,
    ...(originalText ? { originalText: String(originalText).slice(0, 2000) } : {}),
    items: items.map((it) => ({
      ...it,
      source: it.source || CLAUDE_MEAL_ORIGIN,
      origin: it.origin || CLAUDE_MEAL_ORIGIN,
      entrySource: it.entrySource || CLAUDE_MEAL_ORIGIN,
    })),
  };
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {{ uid: string, tokenId: string, scopes: string[] }} ctx
 * @param {unknown} input
 * @param {number} [now]
 */
export async function toolLogMeal(db, ctx, input, now = Date.now()) {
  const uid = String(ctx?.uid || '').trim();
  const tokenId = String(ctx?.tokenId || '').trim();
  try {
    requireMealsScope(ctx);
  } catch (error) {
    await writeAudit(db, uid, {
      tool: 'kentu_log_meal', tokenId, result: 'rejected', reason: 'missing_scope',
    });
    throw error;
  }

  let normalized;
  try {
    normalized = validateMealLogInput(input, now);
  } catch (error) {
    await writeAudit(db, uid, {
      tool: 'kentu_log_meal', tokenId, result: 'rejected', reason: 'invalid_input',
    });
    throw error;
  }

  const idemHash = sha256Hex(`${uid}:meal:${normalized.idempotencyKey}`);
  const idemRef = db.ref(mcpMealIdemPath(uid, idemHash));

  const existing = await idemRef.get();
  if (existing.exists()) {
    const claim = existing.val() || {};
    await writeAudit(db, uid, {
      tool: 'kentu_log_meal', tokenId, result: 'duplicate', mealId: claim.mealId,
    });
    return {
      created: false,
      duplicate: true,
      mealId: claim.mealId || null,
      date: claim.date || normalized.date,
      note: 'Pasto già registrato con questa idempotencyKey: nessuna nuova scrittura.',
    };
  }

  try {
    await consumeMcpWriteQuota(db, uid, now);
  } catch (error) {
    if (error?.code === 'rate_limited') {
      await writeAudit(db, uid, {
        tool: 'kentu_log_meal', tokenId, result: 'rejected', reason: 'rate_limited',
      });
    }
    throw error;
  }

  const mealId = `claude_${normalized.slot}_${idemHash.slice(0, 10)}`;
  const mealTime = hhmmToDecimal(normalized.time) ?? 13;

  const foodCtx = await loadUserFocusContext(db, uid);
  let foodItems;
  try {
    foodItems = await buildClaudeMealEntries(normalized.items, foodCtx, {
      mealId, slot: normalized.slot, mealTime, now,
    });
  } catch (error) {
    await writeAudit(db, uid, {
      tool: 'kentu_log_meal', tokenId, result: 'rejected', reason: error?.code || 'invalid_food',
    });
    throw error;
  }

  const mealRow = buildNestedMeal(mealId, normalized.slot, foodItems, {
    now,
    originalText: normalized.rawText,
  });
  const claim = await idemRef.transaction((current) => {
    if (current) return undefined;
    return {
      mealId,
      date: normalized.date,
      createdAt: now,
      tokenId,
      slot: normalized.slot,
      time: normalized.time,
    };
  });
  if (!claim.committed) {
    const prev = claim.snapshot.val() || {};
    return {
      created: false,
      duplicate: true,
      mealId: prev.mealId || mealId,
      date: prev.date || normalized.date,
      note: 'Pasto già registrato con questa idempotencyKey: nessuna nuova scrittura.',
    };
  }

  try {
    const { rev } = await saveDayNodeWithRevAdmin(db, uid, normalized.date, {
      data: normalized.date,
      log: [mealRow],
      mealTimes: { [mealId]: mealTime },
      hasEditedNodes: true,
    }, { now });

    await writeAudit(db, uid, {
      tool: 'kentu_log_meal',
      tokenId,
      result: 'created',
      mealId,
      date: normalized.date,
      slot: normalized.slot,
      itemsCount: normalized.items.length,
      rev,
    });

    return {
      created: true,
      duplicate: false,
      mealId,
      date: normalized.date,
      slot: normalized.slot,
      time: normalized.time,
      rev,
      items: foodItems.map((it) => ({
        name: it.name || it.desc,
        grams: it.grams ?? it.qta,
        foodDbKey: it.foodDbKey || null,
        kcal: it.kcal ?? it.cal ?? null,
      })),
      note: `Pasto registrato nel diario. Per annullare entro 24h: kentu_undo_meal con mealId "${mealId}".`,
      undoHint: `kentu_undo_meal({ mealId: "${mealId}" })`,
    };
  } catch (error) {
    await idemRef.set(null).catch(() => {});
    await writeAudit(db, uid, {
      tool: 'kentu_log_meal', tokenId, result: 'rejected', reason: 'write_failed',
    });
    throw error;
  }
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {{ uid: string, tokenId: string, scopes: string[] }} ctx
 * @param {{ mealId: string }} input
 * @param {number} [now]
 */
export async function toolUndoMeal(db, ctx, input, now = Date.now()) {
  const uid = String(ctx?.uid || '').trim();
  const tokenId = String(ctx?.tokenId || '').trim();
  try {
    requireMealsScope(ctx);
  } catch (error) {
    await writeAudit(db, uid, {
      tool: 'kentu_undo_meal', tokenId, result: 'rejected', reason: 'missing_scope',
    });
    throw error;
  }

  const mealId = String(input?.mealId || '').trim();
  if (!mealId || !mealId.startsWith('claude_')) {
    throw invalid('mealId: deve essere un pasto creato da Claude (prefisso claude_).');
  }

  // Cerca il giorno nell’idem map o scansiona ultimi 2 giorni
  const today = todayInRome(new Date(now));
  const dates = [today, addDaysIso(today, -1)];
  let foundDate = null;
  let foundMeal = null;
  let createdAt = null;

  for (const date of dates) {
    const snap = await db.ref(`users/${uid}/tracker_data/trackerStorico_${date}`).get();
    if (!snap.exists()) continue;
    const log = Array.isArray(snap.val()?.log) ? snap.val().log : Object.values(snap.val()?.log || {});
    const meal = log.find((row) => String(row?.mealId || '') === mealId);
    if (meal) {
      foundDate = date;
      foundMeal = meal;
      createdAt = Number(meal.createdAt) || null;
      break;
    }
  }

  // Fallback: idem records
  if (!foundDate) {
    const idemSnap = await db.ref(`mcp_meal_idem/${uid}`).get();
    const rows = idemSnap.exists() ? Object.values(idemSnap.val() || {}) : [];
    const hit = rows.find((row) => String(row?.mealId || '') === mealId);
    if (hit?.date) {
      foundDate = String(hit.date);
      createdAt = Number(hit.createdAt) || null;
      const snap = await db.ref(`users/${uid}/tracker_data/trackerStorico_${foundDate}`).get();
      const log = Array.isArray(snap.val()?.log) ? snap.val().log : Object.values(snap.val()?.log || {});
      foundMeal = log.find((row) => String(row?.mealId || '') === mealId) || null;
    }
  }

  if (!foundDate || !foundMeal) {
    throw new McpToolError('not_found', 'Pasto Claude non trovato negli ultimi giorni.');
  }

  if (foundMeal.origin && foundMeal.origin !== CLAUDE_MEAL_ORIGIN) {
    throw new McpToolError('not_deletable', 'Si possono annullare solo pasti creati da Claude.');
  }
  const originOk = foundMeal.origin === CLAUDE_MEAL_ORIGIN
    || String(foundMeal.mealId || '').startsWith('claude_')
    || (Array.isArray(foundMeal.items) && foundMeal.items.some((i) => i?.origin === CLAUDE_MEAL_ORIGIN || i?.entrySource === CLAUDE_MEAL_ORIGIN));
  if (!originOk) {
    throw new McpToolError('not_deletable', 'Si possono annullare solo pasti creati da Claude.');
  }

  if (createdAt != null && now - createdAt > CLAUDE_MEAL_UNDO_WINDOW_MS) {
    throw new McpToolError('not_deletable', 'Annullamento consentito solo entro 24 ore dalla registrazione.');
  }

  // Serve anche `log: []` altrimenti merge non applica logDeleteIds.
  const { rev } = await saveDayNodeWithRevAdmin(db, uid, foundDate, {
    log: [],
    logDeleteIds: [mealId],
  }, { now });

  await writeAudit(db, uid, {
    tool: 'kentu_undo_meal',
    tokenId,
    result: 'deleted',
    mealId,
    date: foundDate,
    rev,
  });

  return {
    deleted: true,
    mealId,
    date: foundDate,
    rev,
    note: 'Pasto Claude rimosso dal diario (cancellazione esplicita, senza shrink dell’array).',
  };
}
