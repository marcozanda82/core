/**
 * Bozze pasto create da Claude (MCP).
 *
 * Il server scrive SOLO in:
 * - users/{uid}/external_drafts/meals/{draftId}
 * - users/{uid}/mcp_audit/{pushId}
 * - mcp_write_quota/{uid}
 * - mcp_draft_idem/{uid}/{hash}
 * Mai in tracker_data (diario) né in focus_day_scores (punteggi): la convalida resta in Kentu.
 */

import { randomBytes } from 'node:crypto';
import { sha256Hex } from './hashToken.js';
import { addDaysIso, isIsoDate, resolveDayRef, todayInRome } from './dates.js';
import { MCP_SCOPE_DRAFTS_WRITE, hasMcpScope } from './scopes.js';

export const MEAL_DRAFT_SLOTS = Object.freeze(['colazione', 'snack', 'pranzo', 'cena']);
export const MEAL_DRAFT_STATUSES = Object.freeze(['pending', 'consumed', 'deleted']);
export const MEAL_DRAFT_LIMITS = Object.freeze({
  dateWindowDays: 7,
  maxItems: 20,
  nameMin: 2,
  nameMax: 80,
  gramsMin: 1,
  gramsMax: 3000,
  noteMax: 200,
  rawTextMax: 2000,
  writesPerHour: 10,
  writesPerDay: 30,
  listMax: 50,
});

export const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
export const DRAFT_ID_RE = /^cd_[a-z0-9]+_[a-f0-9]{8}$/;

export const externalMealDraftsPath = (uid) => `users/${uid}/external_drafts/meals`;
export const mcpAuditPath = (uid) => `users/${uid}/mcp_audit`;
export const mcpWriteQuotaPath = (uid) => `mcp_write_quota/${uid}`;
export const mcpDraftIdemPath = (uid, hash) => `mcp_draft_idem/${uid}/${hash}`;

export class McpToolError extends Error {
  /**
   * @param {'invalid_input'|'missing_scope'|'rate_limited'|'not_found'|'not_deletable'} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
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

function invalid(message) {
  return new McpToolError('invalid_input', message);
}

/**
 * Controllo e normalizzazione dei dati ricevuti da Claude prima di ogni scrittura.
 * Doppia difesa rispetto agli schemi zod registrati sul server MCP.
 * @param {unknown} input
 * @param {number} [now]
 */
export function validateMealDraftInput(input, now = Date.now()) {
  if (!input || typeof input !== 'object') throw invalid('Dati bozza mancanti.');
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
    const allowed = new Set(['name', 'grams', 'note']);
    const extra = Object.keys(raw).filter((key) => !allowed.has(key));
    if (extra.length > 0) throw invalid(`items[${index}]: campi non ammessi (${extra.join(', ')}).`);
    const name = cleanText(raw.name);
    if (name.length < L.nameMin || name.length > L.nameMax) {
      throw invalid(`items[${index}].name: da ${L.nameMin} a ${L.nameMax} caratteri.`);
    }
    let grams = null;
    if (raw.grams != null) {
      const g = Number(raw.grams);
      if (!Number.isInteger(g) || g < L.gramsMin || g > L.gramsMax) {
        throw invalid(`items[${index}].grams: intero tra ${L.gramsMin} e ${L.gramsMax}, oppure null.`);
      }
      grams = g;
    }
    const note = raw.note == null ? '' : cleanText(raw.note);
    if (note.length > L.noteMax) {
      throw invalid(`items[${index}].note: massimo ${L.noteMax} caratteri.`);
    }
    return { name, grams, note };
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

export function newMealDraftId(now = Date.now()) {
  return `cd_${now.toString(36)}_${randomBytes(4).toString('hex')}`;
}

/**
 * Forma salvata in external_drafts/meals/{draftId}.
 * Le voci restano `pending`: il riconoscimento alimenti avviene in Kentu alla convalida.
 */
export function buildExternalMealDraftRecord({ id, normalized, tokenId, now, idemHash }) {
  return {
    id,
    schemaVersion: 1,
    origin: 'claude',
    source: 'claude',
    date: normalized.date,
    slotHint: normalized.slot,
    timeHHmm: normalized.time,
    items: normalized.items.map((item, index) => ({
      id: `${id}_i${index}`,
      foodName: item.name,
      ...(item.grams != null ? { grams: item.grams } : {}),
      ...(item.note ? { note: item.note } : {}),
      status: 'pending',
    })),
    rawText: normalized.rawText,
    tokenId: String(tokenId || ''),
    idempotencyKeyHash: idemHash,
    createdAt: now,
    status: 'pending',
  };
}

function compactDraft(id, row) {
  const items = Array.isArray(row?.items) ? row.items : Object.values(row?.items || {});
  return {
    draftId: id,
    date: row?.date ?? null,
    slot: row?.slotHint ?? null,
    time: row?.timeHHmm ?? null,
    status: row?.status ?? null,
    createdAt: row?.createdAt ?? null,
    ...(row?.consumedAt ? { consumedAt: row.consumedAt } : {}),
    ...(row?.deletedAt ? { deletedAt: row.deletedAt } : {}),
    items: items.map((item) => ({
      name: item?.foodName ?? null,
      grams: item?.grams ?? null,
      ...(item?.note ? { note: item.note } : {}),
    })),
    originalText: row?.rawText ?? '',
  };
}

async function writeAudit(db, uid, entry) {
  try {
    await db.ref(mcpAuditPath(uid)).push({ at: Date.now(), ...entry });
  } catch (error) {
    console.warn('[kentuMcp] audit write failed', String(error?.message || error).slice(0, 120));
  }
}

function requireDraftsScope(ctx) {
  if (!hasMcpScope(ctx?.scopes, MCP_SCOPE_DRAFTS_WRITE)) {
    throw new McpToolError(
      'missing_scope',
      'Questo gettone è in sola lettura. Per creare o eliminare bozze attiva il permesso '
      + '"Bozze pasti" sul gettone in Kentu (menu MCP Claude).',
    );
  }
}

function hourBucket(now) {
  return Math.floor(now / 3600000);
}

/**
 * Limite scritture per utente (tutti i gettoni): 10/ora e 30/giorno (Europe/Rome).
 * @returns {Promise<{ hourCount: number, dayCount: number }>}
 */
export async function consumeMcpWriteQuota(db, uid, now = Date.now()) {
  const L = MEAL_DRAFT_LIMITS;
  const hour = hourBucket(now);
  const day = todayInRome(new Date(now));
  let denied = null;
  const result = await db.ref(mcpWriteQuotaPath(uid)).transaction((current) => {
    const cur = current && typeof current === 'object' ? current : {};
    const hourCount = cur.hourBucket === hour ? Number(cur.hourCount) || 0 : 0;
    const dayCount = cur.dayKey === day ? Number(cur.dayCount) || 0 : 0;
    denied = null;
    if (hourCount >= L.writesPerHour) {
      denied = 'hour';
      return undefined;
    }
    if (dayCount >= L.writesPerDay) {
      denied = 'day';
      return undefined;
    }
    return {
      hourBucket: hour,
      hourCount: hourCount + 1,
      dayKey: day,
      dayCount: dayCount + 1,
      updatedAt: now,
    };
  });
  if (!result.committed) {
    throw new McpToolError(
      'rate_limited',
      denied === 'day'
        ? `Limite di ${L.writesPerDay} scritture bozze al giorno raggiunto. Riprova domani.`
        : `Limite di ${L.writesPerHour} scritture bozze all'ora raggiunto. Riprova più tardi.`,
    );
  }
  const val = result.snapshot.val() || {};
  return { hourCount: Number(val.hourCount) || 0, dayCount: Number(val.dayCount) || 0 };
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {{ uid: string, tokenId: string, scopes: string[] }} ctx
 * @param {unknown} input
 * @param {number} [now]
 */
export async function toolCreateMealDraft(db, ctx, input, now = Date.now()) {
  const uid = String(ctx?.uid || '').trim();
  const tokenId = String(ctx?.tokenId || '').trim();
  try {
    requireDraftsScope(ctx);
  } catch (error) {
    await writeAudit(db, uid, {
      tool: 'kentu_create_meal_draft', tokenId, result: 'rejected', reason: 'missing_scope',
    });
    throw error;
  }
  const normalized = validateMealDraftInput(input, now);
  const idemHash = sha256Hex(`${uid}:${normalized.idempotencyKey}`);
  const idemRef = db.ref(mcpDraftIdemPath(uid, idemHash));

  const duplicateResponse = async (claim) => {
    const draftId = String(claim?.draftId || '');
    const snap = draftId ? await db.ref(`${externalMealDraftsPath(uid)}/${draftId}`).get() : null;
    await writeAudit(db, uid, {
      tool: 'kentu_create_meal_draft', tokenId, result: 'duplicate', draftId,
    });
    return {
      created: false,
      duplicate: true,
      draft: snap?.exists() ? compactDraft(draftId, snap.val()) : { draftId },
      note: 'Bozza già creata con questa idempotencyKey: nessuna nuova bozza.',
    };
  };

  const existing = await idemRef.get();
  if (existing.exists()) return duplicateResponse(existing.val());

  try {
    await consumeMcpWriteQuota(db, uid, now);
  } catch (error) {
    if (error?.code === 'rate_limited') {
      await writeAudit(db, uid, {
        tool: 'kentu_create_meal_draft', tokenId, result: 'rejected', reason: 'rate_limited',
      });
    }
    throw error;
  }

  const draftId = newMealDraftId(now);
  const claim = await idemRef.transaction((current) => {
    if (current) return undefined;
    return { draftId, createdAt: now, tokenId };
  });
  if (!claim.committed) return duplicateResponse(claim.snapshot.val());

  const record = buildExternalMealDraftRecord({
    id: draftId, normalized, tokenId, now, idemHash,
  });
  try {
    await db.ref(`${externalMealDraftsPath(uid)}/${draftId}`).set(record);
  } catch (error) {
    await idemRef.set(null).catch(() => {});
    throw error;
  }
  await writeAudit(db, uid, {
    tool: 'kentu_create_meal_draft',
    tokenId,
    result: 'created',
    draftId,
    date: normalized.date,
    slot: normalized.slot,
    itemsCount: normalized.items.length,
  });
  return {
    created: true,
    duplicate: false,
    draft: compactDraft(draftId, record),
    note: 'Bozza salvata in Kentu: l’utente la convalida nell’app. Non è nel diario.',
  };
}

/**
 * Solo bozze con origine "claude".
 * @param {import('firebase-admin/database').Database} db
 * @param {{ uid: string }} ctx
 * @param {{ status?: string, date?: string }} [filters]
 */
export async function toolListDrafts(db, ctx, filters = {}) {
  const uid = String(ctx?.uid || '').trim();
  const status = filters?.status ? String(filters.status).trim() : '';
  if (status && !MEAL_DRAFT_STATUSES.includes(status)) {
    throw invalid(`status: uno tra ${MEAL_DRAFT_STATUSES.join(', ')}.`);
  }
  let date = '';
  if (filters?.date) {
    try {
      ({ date } = resolveDayRef(String(filters.date)));
    } catch {
      throw invalid('date: usa today, yesterday oppure YYYY-MM-DD.');
    }
  }
  const snap = await db.ref(externalMealDraftsPath(uid))
    .orderByChild('createdAt')
    .limitToLast(200)
    .get();
  const rows = [];
  snap.forEach((child) => {
    const row = child.val();
    if (row?.origin !== 'claude') return;
    if (status && row.status !== status) return;
    if (date && row.date !== date) return;
    rows.push(compactDraft(child.key, row));
  });
  rows.sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  return {
    drafts: rows.slice(0, MEAL_DRAFT_LIMITS.listMax),
    total: rows.length,
    note: 'pending = da convalidare in Kentu; consumed = convalidata dall’utente; deleted = eliminata.',
  };
}

/**
 * Elimina (stato "deleted") solo bozze Claude ancora in attesa.
 * @param {import('firebase-admin/database').Database} db
 * @param {{ uid: string, tokenId: string, scopes: string[] }} ctx
 * @param {{ draftId: string }} input
 * @param {number} [now]
 */
export async function toolDeleteDraft(db, ctx, input, now = Date.now()) {
  const uid = String(ctx?.uid || '').trim();
  const tokenId = String(ctx?.tokenId || '').trim();
  try {
    requireDraftsScope(ctx);
  } catch (error) {
    await writeAudit(db, uid, {
      tool: 'kentu_delete_draft', tokenId, result: 'rejected', reason: 'missing_scope',
    });
    throw error;
  }
  const draftId = String(input?.draftId || '').trim();
  if (!DRAFT_ID_RE.test(draftId)) throw invalid('draftId non valido.');

  const draftRef = db.ref(`${externalMealDraftsPath(uid)}/${draftId}`);
  const snap = await draftRef.get();
  const row = snap.val();
  if (!snap.exists() || row?.origin !== 'claude') {
    throw new McpToolError('not_found', 'Bozza non trovata tra quelle create da Claude.');
  }
  if (row.status !== 'pending') {
    throw new McpToolError(
      'not_deletable',
      `La bozza è "${row.status}": solo le bozze in attesa si possono eliminare.`,
    );
  }

  try {
    await consumeMcpWriteQuota(db, uid, now);
  } catch (error) {
    if (error?.code === 'rate_limited') {
      await writeAudit(db, uid, {
        tool: 'kentu_delete_draft', tokenId, result: 'rejected', reason: 'rate_limited', draftId,
      });
    }
    throw error;
  }

  // Null alla prima esecuzione = cache Admin vuota: il server ripete col valore reale.
  const tx = await draftRef.child('status').transaction((current) => {
    if (current === null) return null;
    return current === 'pending' ? 'deleted' : undefined;
  });
  const finalStatus = tx.snapshot.val();
  if (!tx.committed || finalStatus !== 'deleted') {
    throw new McpToolError(
      'not_deletable',
      `La bozza è "${finalStatus || 'assente'}": solo le bozze in attesa si possono eliminare.`,
    );
  }
  await draftRef.update({ deletedAt: now, deletedBy: 'claude' });
  await writeAudit(db, uid, {
    tool: 'kentu_delete_draft', tokenId, result: 'deleted', draftId,
  });
  return { deleted: true, draftId };
}
