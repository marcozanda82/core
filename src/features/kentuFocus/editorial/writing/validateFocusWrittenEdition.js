/**
 * Validazione deterministica FocusWrittenEdition vs selection/AiBrief.
 * Non garantisce correttezza semantica della prosa (vedi FOCUS_SEMANTIC_VALIDATION_LIMITS).
 */

import { isIsoDateString } from '../../normalize/focusDateUtils.js';
import {
  FOCUS_ARTICLE_ROLES,
  FOCUS_SEMANTIC_VALIDATION_LIMITS,
  FOCUS_WRITING_LIMITS,
  FOCUS_WRITTEN_SCHEMA_VERSION,
} from './focusWrittenEdition.v1.js';

const ROLE_SET = new Set(FOCUS_ARTICLE_ROLES);

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignora\s+(tutte\s+le\s+)?istruzioni/i,
  /system\s*prompt/i,
  /<<<\s*DATI_UTENTE/i,
  /you\s+are\s+now\s+/i,
];

const HYPOTHESIS_CAUSAL = /\b(perché|poiché|quindi|dovuto a|causat[oa]|provoca|conseguenza di)\b/i;
const MEASURED_CLAIM = /\b(misurat\w*|rilevat\w*\s+direttamente|valore\s+misurat\w*)\b/i;
/** Overclaim medico tipico — preferire fallback; non copertura semantica completa. */
const MEDICAL_OVERCLAIM = /\b(ti\s+diagnostico|questa\s+è\s+una\s+diagnosi|cura\s+la\s+malattia|prescriv\w*|terapia\s+farmacologic\w*|sei\s+malat\w*)\b/i;
const PLACEHOLDER_TOKEN_RE = /\{\{([a-zA-Z0-9_.]+)\}\}/g;
const PLACEHOLDER_ANY_RE = /\{\{[^}]*\}\}/g;

function buildNumberAllowlist(authItem, dates) {
  const set = new Set();
  const add = (v) => {
    if (v == null || v === '') return;
    const s = String(v);
    set.add(s);
    set.add(s.replace(',', '.'));
    set.add(s.replace('.', ','));
  };
  for (const m of authItem.metrics || []) add(m.value);
  for (const d of [dates.analysisDate, dates.publicationDate]) {
    for (const part of String(d).split(/[-T:.Z]/)) {
      if (part && /^\d+$/.test(part)) add(part);
    }
  }
  const seedText = `${authItem.headlineSeed || ''} ${authItem.summarySeed || ''}`;
  for (const m of seedText.matchAll(/\d+(?:[.,]\d+)?/g)) add(m[0]);
  return set;
}

function findUnauthorizedNumbers(text, allow) {
  const stripped = String(text || '').replace(/\{\{[^}]+\}\}/g, ' ');
  const bad = [];
  for (const m of stripped.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const token = m[0];
    const norm = token.replace(',', '.');
    if (!allow.has(token) && !allow.has(norm)) bad.push(token);
  }
  return bad;
}

/**
 * @param {object} selection
 */
export function buildAuthorizedCatalog(selection) {
  /** @type {Map<string, { role: string, item: object, selectionIndex: number }>} */
  const byId = new Map();
  let index = 0;
  const add = (item, role) => {
    if (!item?.id) return;
    byId.set(item.id, { role, item, selectionIndex: index });
    index += 1;
  };
  if (selection.lead) add(selection.lead, 'lead');
  for (const n of selection.goodNews || []) add(n, 'good');
  for (const n of selection.features || []) add(n, 'feature');
  for (const n of selection.concerns || []) add(n, 'concern');
  return byId;
}

function metricKey(m) {
  return `${m.path}|${String(m.value)}|${String(m.unit ?? '')}|${String(m.provenance ?? '')}`;
}

function authorizedMetricSet(item) {
  return new Set((item.metrics || []).map(metricKey));
}

function authorizedEvidenceSet(item) {
  const set = new Set();
  for (const ref of item.refs || []) {
    if (typeof ref === 'string') set.add(ref);
  }
  for (const m of item.metrics || []) {
    if (m?.path) set.add(m.path);
  }
  return set;
}

/**
 * @param {unknown} raw
 * @param {{ selection: object }} ctx
 */
export function validateFocusWrittenEdition(raw, ctx) {
  const errors = [];
  const selection = ctx?.selection;
  if (!selection) {
    return {
      ok: false,
      errors: ['selection_required'],
      semanticLimits: FOCUS_SEMANTIC_VALIDATION_LIMITS,
    };
  }

  if (raw == null || typeof raw !== 'object') {
    return {
      ok: false,
      errors: ['written_not_object'],
      semanticLimits: FOCUS_SEMANTIC_VALIDATION_LIMITS,
    };
  }

  const doc = raw;
  if (doc.schemaVersion !== FOCUS_WRITTEN_SCHEMA_VERSION) {
    errors.push('schemaVersion_mismatch');
  }
  if (doc.kind !== 'FocusWrittenEdition') errors.push('kind_expected_FocusWrittenEdition');
  if (!isIsoDateString(doc.analysisDate)) errors.push('analysisDate_invalid');
  if (!isIsoDateString(doc.publicationDate)) errors.push('publicationDate_invalid');
  if (doc.analysisDate !== selection.analysisDate) errors.push('analysisDate_mismatch');
  if (doc.publicationDate !== selection.publicationDate) errors.push('publicationDate_mismatch');

  if (!Array.isArray(doc.articles)) {
    errors.push('articles_not_array');
    return { ok: false, errors, semanticLimits: FOCUS_SEMANTIC_VALIDATION_LIMITS };
  }

  const catalog = buildAuthorizedCatalog(selection);
  const expectedIds = [...catalog.keys()];
  const seenIds = new Set();

  if (doc.articles.length !== expectedIds.length) {
    errors.push(`articles_count_mismatch_expected_${expectedIds.length}_got_${doc.articles.length}`);
  }

  for (const [i, article] of doc.articles.entries()) {
    const label = `articles[${i}]`;
    if (!article || typeof article !== 'object') {
      errors.push(`${label}_invalid`);
      continue;
    }
    if (!article.id || !catalog.has(article.id)) {
      errors.push(`${label}_id_not_authorized`);
      continue;
    }
    if (seenIds.has(article.id)) errors.push(`${label}_duplicate_id`);
    seenIds.add(article.id);

    const auth = catalog.get(article.id);
    if (article.role !== auth.role) {
      errors.push(`${label}_role_altered_expected_${auth.role}`);
    }
    if (!ROLE_SET.has(article.role)) errors.push(`${label}_role_invalid`);
    if (Number(article.selectionIndex) !== auth.selectionIndex) {
      errors.push(`${label}_selectionIndex_mismatch`);
    }

    const title = String(article.title || '');
    const body = String(article.body || '');
    if (!title || title.length > FOCUS_WRITING_LIMITS.titleMaxChars) {
      errors.push(`${label}_title_length`);
    }
    if (
      body.length < FOCUS_WRITING_LIMITS.bodyMinChars
      || body.length > FOCUS_WRITING_LIMITS.bodyMaxChars
    ) {
      errors.push(`${label}_body_length`);
    }

    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(title) || pattern.test(body)) {
        errors.push(`${label}_injection_pattern`);
        break;
      }
    }

    const evidAuth = authorizedEvidenceSet(auth.item);
    const evid = Array.isArray(article.evidenceIds) ? article.evidenceIds : [];
    if (evid.length > FOCUS_WRITING_LIMITS.evidenceIdsMax) {
      errors.push(`${label}_evidenceIds_too_many`);
    }
    for (const eid of evid) {
      if (!evidAuth.has(eid)) errors.push(`${label}_evidence_unknown_${eid}`);
    }

    const metAuth = authorizedMetricSet(auth.item);
    const cited = Array.isArray(article.metricsCited) ? article.metricsCited : [];
    for (const m of cited) {
      if (!m || typeof m !== 'object' || !m.path) {
        errors.push(`${label}_metric_cited_invalid`);
        continue;
      }
      if (!metAuth.has(metricKey(m))) {
        errors.push(`${label}_metric_not_authorized_${m.path}`);
      }
    }

    const cautions = Array.isArray(article.cautions) ? article.cautions : [];
    if (cautions.length > FOCUS_WRITING_LIMITS.cautionsMax) {
      errors.push(`${label}_cautions_too_many`);
    }

    const required = [
      ...(auth.item.doNotClaim || []),
      ...(auth.item.limitations || []),
    ];
    for (const req of required) {
      if (typeof req === 'string' && req && !cautions.includes(req)) {
        errors.push(`${label}_missing_required_caution`);
        break;
      }
    }

    if (auth.item.claimType === 'hypothesis' && HYPOTHESIS_CAUSAL.test(`${title} ${body}`)) {
      errors.push(`${label}_hypothesis_causal_language`);
    }

    if (MEDICAL_OVERCLAIM.test(`${title} ${body}`)) {
      errors.push(`${label}_medical_overclaim`);
    }

    const hasUnreliable = (auth.item.metrics || []).some(
      (m) => m && (m.provenance === 'missing' || m.provenance === 'estimated'),
    );
    if (hasUnreliable && MEASURED_CLAIM.test(`${title} ${body}`)) {
      errors.push(`${label}_unreliable_presented_as_measured`);
    }

    // Placeholder: solo path presenti in metricsCited; nessun lookalike
    const citedPaths = new Set((cited || []).map((m) => m?.path).filter(Boolean));
    for (const field of [title, body]) {
      const anyPh = field.match(PLACEHOLDER_ANY_RE) || [];
      const validPh = [...field.matchAll(PLACEHOLDER_TOKEN_RE)];
      if (anyPh.length > validPh.length) {
        errors.push(`${label}_lookalike_placeholder`);
      }
      for (const m of validPh) {
        if (!citedPaths.has(m[1])) {
          errors.push(`${label}_placeholder_not_in_metricsCited_${m[1]}`);
        }
      }
    }

    // Confronti storici vietati se brief/selection segnala indisponibilità
    const notes = selection.editorialNotes || [];
    if (
      notes.includes('d7_comparison_unavailable')
      && /\b(rispetto\s+alla\s+settimana|media\s+settimanale|vs\s+i\s+7\s+giorni)\b/i.test(`${title} ${body}`)
    ) {
      errors.push(`${label}_unavailable_history_comparison`);
    }

    const allowNums = buildNumberAllowlist(auth.item, {
      analysisDate: selection.analysisDate,
      publicationDate: selection.publicationDate,
    });
    const badNums = [
      ...findUnauthorizedNumbers(title, allowNums),
      ...findUnauthorizedNumbers(body, allowNums),
    ];
    if (badNums.length > 0) {
      errors.push(`${label}_unauthorized_number_in_prose`);
    }
  }

  // Articoli attesi mancanti
  for (const id of expectedIds) {
    if (!seenIds.has(id)) errors.push(`article_missing_${id}`);
  }

  // Coach
  if (selection.coach) {
    if (!doc.coach || typeof doc.coach !== 'object') {
      errors.push('coach_required_when_authorized');
    } else {
      if (doc.coach.id !== selection.coach.id) errors.push('coach_id_mismatch');
      if (
        selection.coach.templateId
        && doc.coach.templateId
        && doc.coach.templateId !== selection.coach.templateId
      ) {
        errors.push('coach_template_mismatch');
      }
      const cbody = String(doc.coach.body || '');
      if (!cbody || cbody.length > FOCUS_WRITING_LIMITS.coachBodyMaxChars) {
        errors.push('coach_body_length');
      }
      for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(cbody) || pattern.test(String(doc.coach.title || ''))) {
          errors.push('coach_injection_pattern');
          break;
        }
      }
    }
  } else if (doc.coach != null) {
    errors.push('coach_not_authorized');
  }

  // Lead null: nessun articolo con role lead
  if (!selection.lead) {
    for (const a of doc.articles) {
      if (a?.role === 'lead') errors.push('lead_present_but_selection_lead_null');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    semanticLimits: FOCUS_SEMANTIC_VALIDATION_LIMITS,
  };
}

/**
 * Parse JSON grezzo (simulato o futuro Gemini). Gestisce troncamenti.
 * @param {string|object|null|undefined} raw
 */
export function parseFocusWrittenEditionJson(raw) {
  if (raw == null) return { ok: false, error: 'empty_output', value: null };
  if (typeof raw === 'object') return { ok: true, value: raw, error: null };
  if (typeof raw !== 'string') return { ok: false, error: 'unsupported_type', value: null };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'empty_string', value: null };
  try {
    return { ok: true, value: JSON.parse(trimmed), error: null };
  } catch {
    return { ok: false, error: 'json_truncated_or_invalid', value: null };
  }
}
