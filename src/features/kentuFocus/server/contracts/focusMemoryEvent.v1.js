/**
 * FocusMemoryEvent v1 — snapshot minimo per applicare la memoria editoriale.
 * Derivato dal consumo reale di applyEditorialMemoryAfterPublish / collectNewsItems.
 * Nessuna prosa Gemini, nessuno storySpine, nessun articolo destinato al lettore.
 *
 * Persistenza RTDB (P6.10c): null e array vuoti vengono omessi dal wire.
 * Fingerprint e body usano una forma canonica condivisa (assenza ≡ null ≡ []).
 */

import { isIsoDateString } from '../../normalize/focusDateUtils.js';
import { stableFingerprint, toRtdbJson } from '../sanitize/rtdbSanitize.js';

export const FOCUS_MEMORY_EVENT_SCHEMA_VERSION = '1.0.0';
export const FOCUS_MEMORY_EVENT_KIND = 'FocusMemoryEvent';

const NEWS_LIST_KEYS = Object.freeze([
  'goodNews',
  'features',
  'continuity',
  'concerns',
]);

/**
 * @param {string} publicationDate
 * @param {number|string} revision
 */
export function buildFocusMemoryEditionKey(publicationDate, revision) {
  return `${publicationDate}#${Number(revision)}`;
}

/**
 * @param {object|null|undefined} item
 * @returns {object|null}
 */
export function slimMemoryNewsItem(item) {
  if (!item || typeof item !== 'object') return null;
  const topicId = item.topicId != null ? String(item.topicId) : null;
  if (!topicId) return null;
  return {
    id: item.id != null ? String(item.id) : null,
    topicId,
    editorialFamily: item.editorialFamily != null ? String(item.editorialFamily) : null,
    editorialScale: item.editorialScale != null ? String(item.editorialScale) : null,
    evidenceFingerprint:
      item.evidenceFingerprint != null ? String(item.evidenceFingerprint) : null,
  };
}

/**
 * @param {object|null|undefined} coach
 * @returns {object|null}
 */
export function slimMemoryCoach(coach) {
  if (!coach || typeof coach !== 'object') return null;
  const templateId = coach.templateId != null ? String(coach.templateId) : null;
  if (!templateId || templateId === 'NONE') return null;
  const metricPaths = Array.isArray(coach.followUp?.metricPaths)
    ? coach.followUp.metricPaths.map((p) => String(p))
    : [];
  return {
    templateId,
    textSeed: coach.textSeed != null ? String(coach.textSeed) : null,
    horizonDays: coach.horizonDays == null ? null : Number(coach.horizonDays),
    followUp: { metricPaths },
  };
}

/**
 * Selection slim passabile a applyEditorialMemoryAfterPublish.
 * @param {object} selection
 * @param {string} publicationDate
 */
export function buildMemoryEventSelection(selection, publicationDate) {
  const src = selection && typeof selection === 'object' ? selection : {};
  return {
    publicationDate,
    lead: slimMemoryNewsItem(src.lead),
    centerpiece: slimMemoryNewsItem(src.centerpiece),
    goodNews: (Array.isArray(src.goodNews) ? src.goodNews : [])
      .map(slimMemoryNewsItem)
      .filter(Boolean),
    features: (Array.isArray(src.features) ? src.features : [])
      .map(slimMemoryNewsItem)
      .filter(Boolean),
    continuity: (Array.isArray(src.continuity) ? src.continuity : [])
      .map(slimMemoryNewsItem)
      .filter(Boolean),
    concerns: (Array.isArray(src.concerns) ? src.concerns : [])
      .map(slimMemoryNewsItem)
      .filter(Boolean),
    coach: slimMemoryCoach(src.coach),
  };
}

/**
 * Forma persistibile RTDB per uno slot news (omette null / stringhe vuote).
 * topicId assente → slot assente (non è un item).
 * @param {unknown} item
 * @returns {object|null}
 */
export function canonicalizeMemoryNewsItem(item) {
  if (item == null) return null;
  if (typeof item !== 'object' || Array.isArray(item)) return null;
  if (item.topicId == null || String(item.topicId) === '') return null;

  /** @type {Record<string, string>} */
  const out = { topicId: String(item.topicId) };
  if (item.id != null && String(item.id) !== '') out.id = String(item.id);
  if (item.editorialFamily != null && String(item.editorialFamily) !== '') {
    out.editorialFamily = String(item.editorialFamily);
  }
  if (item.editorialScale != null && String(item.editorialScale) !== '') {
    out.editorialScale = String(item.editorialScale);
  }
  if (item.evidenceFingerprint != null && String(item.evidenceFingerprint) !== '') {
    out.evidenceFingerprint = String(item.evidenceFingerprint);
  }
  return out;
}

/**
 * @param {unknown} coach
 * @returns {object|null}
 */
export function canonicalizeMemoryCoach(coach) {
  if (coach == null) return null;
  if (typeof coach !== 'object' || Array.isArray(coach)) return null;
  if (coach.templateId == null || String(coach.templateId) === ''
    || String(coach.templateId) === 'NONE') {
    return null;
  }

  /** @type {Record<string, unknown>} */
  const out = { templateId: String(coach.templateId) };
  if (coach.textSeed != null && String(coach.textSeed) !== '') {
    out.textSeed = String(coach.textSeed);
  }
  if (coach.horizonDays != null && Number.isFinite(Number(coach.horizonDays))) {
    out.horizonDays = Number(coach.horizonDays);
  }
  const paths = Array.isArray(coach.followUp?.metricPaths)
    ? coach.followUp.metricPaths.map((p) => String(p)).filter((p) => p !== '')
    : [];
  if (paths.length > 0) {
    out.followUp = { metricPaths: paths };
  }
  return out;
}

/**
 * Rappresentazione canonica per fingerprint + body MemoryEvent.
 *
 * Equivalenze di assenza (solo dove il contratto le definisce):
 * - proprietà null / undefined / mancante
 * - array di slot news vuoto
 * - coach assente / NONE
 * - campi opzionali null dentro un item
 *
 * Non inventa slot; non promuove oggetti vuoti o tipi inattesi a dati validi.
 * publicationDate resta obbligatoria (se assente → oggetto senza di essa → validazione fallisce).
 *
 * @param {unknown} selection
 * @returns {object|null}
 */
export function canonicalizeMemoryEventSelection(selection) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    return null;
  }

  /** @type {Record<string, unknown>} */
  const out = {};

  if (selection.publicationDate != null && String(selection.publicationDate) !== '') {
    out.publicationDate = String(selection.publicationDate);
  }

  const lead = canonicalizeMemoryNewsItem(selection.lead);
  if (lead) out.lead = lead;

  const centerpiece = canonicalizeMemoryNewsItem(selection.centerpiece);
  if (centerpiece) out.centerpiece = centerpiece;

  for (const key of NEWS_LIST_KEYS) {
    const raw = selection[key];
    if (raw == null) continue;
    if (!Array.isArray(raw)) {
      // Tipo inatteso: conserva un marker non-array per far fallire integrià/semantica
      // solo via fingerprint diverso o controlli strutturali — non silenziare.
      out[key] = raw;
      continue;
    }
    if (raw.length === 0) continue;
    const items = [];
    for (const el of raw) {
      const c = canonicalizeMemoryNewsItem(el);
      if (c) items.push(c);
      else if (el != null) {
        // Elemento presente ma non canonizzabile (corrotto): conserva grezzo
        // così il fingerprint non collassa su “lista più corta pulita”.
        items.push(el);
      }
    }
    if (items.length > 0) out[key] = items;
  }

  const coach = canonicalizeMemoryCoach(selection.coach);
  if (coach) out.coach = coach;

  return out;
}

/**
 * Forma “pre-P6.10c” usata solo per accettare fingerprint legacy in lettura
 * (eventi create-only già scritti con null/[] espliciti). Non riscrive lo store.
 * @param {object|null|undefined} canonical
 * @param {string} [publicationDate]
 */
export function materializeLegacyMemoryEventSelection(canonical, publicationDate) {
  const c = canonical && typeof canonical === 'object' ? canonical : {};
  const pub = c.publicationDate != null
    ? String(c.publicationDate)
    : (publicationDate != null ? String(publicationDate) : '');

  return {
    publicationDate: pub,
    lead: materializeLegacyNewsItem(c.lead),
    centerpiece: materializeLegacyNewsItem(c.centerpiece),
    goodNews: materializeLegacyNewsList(c.goodNews),
    features: materializeLegacyNewsList(c.features),
    continuity: materializeLegacyNewsList(c.continuity),
    concerns: materializeLegacyNewsList(c.concerns),
    coach: materializeLegacyCoach(c.coach),
  };
}

/**
 * @param {unknown} item
 */
function materializeLegacyNewsItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    id: item.id != null ? String(item.id) : null,
    topicId: item.topicId != null ? String(item.topicId) : null,
    editorialFamily: item.editorialFamily != null ? String(item.editorialFamily) : null,
    editorialScale: item.editorialScale != null ? String(item.editorialScale) : null,
    evidenceFingerprint:
      item.evidenceFingerprint != null ? String(item.evidenceFingerprint) : null,
  };
}

/**
 * @param {unknown} list
 */
function materializeLegacyNewsList(list) {
  if (!Array.isArray(list)) return [];
  return list.map((el) => materializeLegacyNewsItem(el)).filter(Boolean);
}

/**
 * @param {unknown} coach
 */
function materializeLegacyCoach(coach) {
  if (!coach || typeof coach !== 'object') return null;
  const paths = Array.isArray(coach.followUp?.metricPaths)
    ? coach.followUp.metricPaths.map((p) => String(p))
    : [];
  return {
    templateId: coach.templateId != null ? String(coach.templateId) : null,
    textSeed: coach.textSeed != null ? String(coach.textSeed) : null,
    horizonDays: coach.horizonDays == null ? null : Number(coach.horizonDays),
    followUp: { metricPaths: paths },
  };
}

/**
 * Fingerprint del contenuto MemoryEvent (sempre su selection canonica).
 * @param {{
 *   editionKey: string,
 *   publicationDate: string,
 *   revision: number,
 *   selection: unknown,
 * }} input
 */
export function computeMemoryEventContentFingerprint(input) {
  const canonical = canonicalizeMemoryEventSelection(input.selection);
  return stableFingerprint({
    editionKey: input.editionKey,
    publicationDate: input.publicationDate,
    revision: Number(input.revision),
    selection: canonical,
  });
}

/**
 * @param {{
 *   publicationDate: string,
 *   revision: number|string,
 *   selection: object,
 *   capturedAt?: string|null,
 * }} input
 */
export function buildFocusMemoryEvent(input) {
  const publicationDate = String(input?.publicationDate || '').trim();
  const revision = Number(input?.revision);
  if (!isIsoDateString(publicationDate)) {
    throw new Error('buildFocusMemoryEvent: publicationDate ISO richiesta');
  }
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error('buildFocusMemoryEvent: revision intera >= 1 richiesta');
  }
  if (!input?.selection || typeof input.selection !== 'object') {
    throw new Error('buildFocusMemoryEvent: selection richiesta');
  }

  const slim = buildMemoryEventSelection(input.selection, publicationDate);
  const selection = canonicalizeMemoryEventSelection(slim);
  if (!selection || selection.publicationDate !== publicationDate) {
    throw new Error('buildFocusMemoryEvent: selection canonica invalida');
  }

  const editionKey = buildFocusMemoryEditionKey(publicationDate, revision);
  const contentFingerprint = computeMemoryEventContentFingerprint({
    editionKey,
    publicationDate,
    revision,
    selection,
  });

  /** @type {Record<string, unknown>} */
  const doc = {
    schemaVersion: FOCUS_MEMORY_EVENT_SCHEMA_VERSION,
    kind: FOCUS_MEMORY_EVENT_KIND,
    editionKey,
    publicationDate,
    revision,
    contentFingerprint,
    selection,
  };
  if (input.capturedAt) doc.capturedAt = input.capturedAt;

  return toRtdbJson(doc);
}

/**
 * Input per applyEditorialMemoryAfterPublish (senza updatedAt: leave to caller).
 * @param {object} memoryEvent
 */
export function memoryEventToPublishEvent(memoryEvent) {
  if (!memoryEvent || typeof memoryEvent !== 'object') {
    throw new Error('memoryEventToPublishEvent: evento richiesto');
  }
  return {
    publicationDate: memoryEvent.publicationDate,
    revision: memoryEvent.revision,
    selection: memoryEvent.selection,
  };
}

/**
 * @param {unknown} event
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateFocusMemoryEvent(event) {
  const errors = [];
  if (!event || typeof event !== 'object') {
    return { ok: false, errors: ['event_required'] };
  }
  if (event.schemaVersion !== FOCUS_MEMORY_EVENT_SCHEMA_VERSION) {
    errors.push('schemaVersion_mismatch');
  }
  if (event.kind !== FOCUS_MEMORY_EVENT_KIND) {
    errors.push('kind_mismatch');
  }
  if (!isIsoDateString(event.publicationDate)) {
    errors.push('publicationDate_invalid');
  }
  const revision = Number(event.revision);
  if (!Number.isInteger(revision) || revision < 1) {
    errors.push('revision_invalid');
  }
  const expectedKey = buildFocusMemoryEditionKey(event.publicationDate, revision);
  if (event.editionKey !== expectedKey) {
    errors.push('editionKey_mismatch');
  }
  if (!event.selection || typeof event.selection !== 'object') {
    errors.push('selection_required');
  } else if (event.selection.publicationDate != null
    && event.selection.publicationDate !== event.publicationDate) {
    errors.push('selection_publicationDate_mismatch');
  }

  if (!event.contentFingerprint || typeof event.contentFingerprint !== 'string') {
    errors.push('contentFingerprint_required');
  } else if (
    event.selection
    && typeof event.selection === 'object'
    && isIsoDateString(event.publicationDate)
    && Number.isInteger(revision)
  ) {
    const canonical = canonicalizeMemoryEventSelection(event.selection);
    if (!canonical || canonical.publicationDate !== event.publicationDate) {
      errors.push('selection_canonical_invalid');
    } else {
      const expectedCanonical = computeMemoryEventContentFingerprint({
        editionKey: expectedKey,
        publicationDate: event.publicationDate,
        revision,
        selection: canonical,
      });
      if (event.contentFingerprint !== expectedCanonical) {
        // Compat lettura: fingerprint legacy (null/[] espliciti) senza riscrivere lo store
        const legacy = materializeLegacyMemoryEventSelection(
          canonical,
          event.publicationDate,
        );
        const expectedLegacy = stableFingerprint({
          editionKey: expectedKey,
          publicationDate: event.publicationDate,
          revision,
          selection: legacy,
        });
        if (event.contentFingerprint !== expectedLegacy) {
          errors.push('contentFingerprint_mismatch');
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Un'edizione è dichiarata recuperabile per la memoria solo con snapshot valido.
 * @param {object|null|undefined} memoryEvent
 * @param {{ publicationDate?: string, revision?: number|string }} [expected]
 */
export function assessMemoryEventRecoverability(memoryEvent, expected = {}) {
  if (!memoryEvent) {
    return {
      recoverable: false,
      reason: 'memory_event_missing',
    };
  }
  const validation = validateFocusMemoryEvent(memoryEvent);
  if (!validation.ok) {
    return {
      recoverable: false,
      reason: 'memory_event_invalid',
      errors: validation.errors,
    };
  }
  if (expected.publicationDate && memoryEvent.publicationDate !== expected.publicationDate) {
    return { recoverable: false, reason: 'memory_event_date_mismatch' };
  }
  if (expected.revision != null && Number(memoryEvent.revision) !== Number(expected.revision)) {
    return { recoverable: false, reason: 'memory_event_revision_mismatch' };
  }
  return { recoverable: true, reason: null, editionKey: memoryEvent.editionKey };
}
