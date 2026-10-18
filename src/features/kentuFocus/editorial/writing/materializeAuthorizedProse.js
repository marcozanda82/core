/**
 * Inserimento deterministico delle cifre autorizzate.
 * Gemini può usare placeholder {{path}} nel title/body; il backend li materializza.
 * L’edizione finale non deve contenere placeholder irrisolti.
 */

const PLACEHOLDER_RE = /\{\{([a-zA-Z0-9_.]+)\}\}/g;
/** Sintassi simile a placeholder ma non conforme (es. {{sleep hours}}, {{a-b}}). */
const LOOKALIKE_RE = /\{\{(?![a-zA-Z0-9_.]+\}\})[^}]*\}\}/g;

function isValidMetricValue(value) {
  if (value == null || value === '') return false;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') {
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n);
  }
  return false;
}

function formatMetricValue(m) {
  const unit = m.unit != null && m.unit !== '' ? ` ${m.unit}` : '';
  return `${m.value}${unit}`.trim();
}

/**
 * @param {string} template
 * @param {object[]} metricsCited
 * @returns {{
 *   text: string,
 *   ok: boolean,
 *   unresolved: string[],
 *   errors: string[],
 *   resolvedCount: number,
 * }}
 */
export function materializeAuthorizedProse(template, metricsCited) {
  const errors = [];
  const unresolved = [];
  let resolvedCount = 0;
  let out = String(template || '');

  const byPath = new Map();
  for (const m of metricsCited || []) {
    if (!m?.path) continue;
    byPath.set(m.path, m);
  }

  // Lookalike non autorizzati (sintassi {{...}} non path-like)
  for (const m of out.matchAll(LOOKALIKE_RE)) {
    errors.push(`lookalike_placeholder:${m[0]}`);
    unresolved.push(m[0]);
  }

  out = out.replace(PLACEHOLDER_RE, (full, path) => {
    const m = byPath.get(path);
    if (!m) {
      unresolved.push(full);
      errors.push(`unknown_placeholder:${path}`);
      return full;
    }
    if (m.provenance === 'missing' || m.value == null || m.value === '') {
      unresolved.push(full);
      errors.push(`missing_value_placeholder:${path}`);
      return full;
    }
    if (!isValidMetricValue(m.value)) {
      unresolved.push(full);
      errors.push(`invalid_numeric_placeholder:${path}`);
      return full;
    }
    // Unità: se unit è esplicitamente stringa vuota vs null è ok; object/array → incompatibile
    if (m.unit != null && typeof m.unit !== 'string' && typeof m.unit !== 'number') {
      unresolved.push(full);
      errors.push(`incompatible_unit:${path}`);
      return full;
    }
    resolvedCount += 1;
    return formatMetricValue(m);
  });

  // Qualsiasi {{...}} residuo (duplicati irrisolti, lookalike non rimossi)
  if (/\{\{[^}]*\}\}/.test(out)) {
    for (const m of out.matchAll(/\{\{[^}]*\}\}/g)) {
      if (!unresolved.includes(m[0])) unresolved.push(m[0]);
    }
    if (!errors.some((e) => e.startsWith('unresolved_remaining'))) {
      errors.push('unresolved_placeholders_remaining');
    }
  }

  return {
    text: out,
    ok: errors.length === 0 && unresolved.length === 0,
    unresolved,
    errors,
    resolvedCount,
  };
}

/**
 * Compat: restituisce solo il testo (come I4-D2). Preferire il risultato strutturato.
 * @param {string} template
 * @param {object[]} metricsCited
 */
export function materializeAuthorizedProseText(template, metricsCited) {
  return materializeAuthorizedProse(template, metricsCited).text;
}

/**
 * Applica materialize a title/body/coach. Fallisce se restano placeholder.
 * @param {object} written
 * @returns {{ written: object, ok: boolean, errors: string[] }}
 */
export function materializeWrittenEdition(written) {
  if (!written || typeof written !== 'object') {
    return { written, ok: false, errors: ['written_invalid'] };
  }

  const errors = [];
  const articles = (written.articles || []).map((a, i) => {
    const titleRes = materializeAuthorizedProse(a.title, a.metricsCited);
    const bodyRes = materializeAuthorizedProse(a.body, a.metricsCited);
    for (const e of titleRes.errors) errors.push(`articles[${i}].title:${e}`);
    for (const e of bodyRes.errors) errors.push(`articles[${i}].body:${e}`);
    return {
      ...a,
      title: titleRes.text,
      body: bodyRes.text,
    };
  });

  let coach = written.coach;
  if (coach) {
    // Coach non ha metricsCited autorizzati: qualsiasi placeholder è errore
    const t = materializeAuthorizedProse(coach.title || '', []);
    const b = materializeAuthorizedProse(coach.body || '', []);
    for (const e of t.errors) errors.push(`coach.title:${e}`);
    for (const e of b.errors) errors.push(`coach.body:${e}`);
    coach = { ...coach, title: t.text, body: b.text };
  }

  const next = { ...written, articles, coach };
  // Garanzia finale: nessun {{ in testo pubblicabile
  const blob = JSON.stringify({
    articles: next.articles.map((a) => ({ title: a.title, body: a.body })),
    coach: next.coach,
  });
  if (/\{\{[^}]*\}\}/.test(blob)) {
    errors.push('final_edition_contains_placeholders');
  }

  return {
    written: next,
    ok: errors.length === 0,
    errors,
  };
}
