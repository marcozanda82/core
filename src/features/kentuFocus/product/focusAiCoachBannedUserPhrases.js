/**
 * Espressioni vietate nel testo visibile all'utente (summary, lead, sections, action, verify).
 * Meta-linguaggio interno / termini tecnici da laboratorio.
 */

export const FOCUS_AI_COACH_BANNED_USER_PHRASES = Object.freeze([
  // Solo gergo interno / tecnico + frasi difensive esplicite (non italiano comune).
  { id: 'sixty_sixty', re: /\b60\s*\/\s*60\b/i, label: '60/60' },
  { id: 'provenance', re: /\bprovenance\b/i, label: 'provenance' },
  { id: 'dossier', re: /\bdossier\b/i, label: 'dossier' },
  { id: 'traiettoria', re: /\btraiettoria\b/i, label: 'traiettoria' },
  { id: 'non_diagnosi', re: /\bnon\s+[eè]\s+una\s+diagnosi\b/i, label: 'non è una diagnosi' },
  { id: 'nesso_certo', re: /\bnesso\s+certo\b/i, label: 'nesso certo' },
  { id: 'fixture', re: /\bfixture\b/i, label: 'fixture' },
  { id: 'dead_band', re: /\bdead[-\s]?band\b/i, label: 'dead-band' },
  { id: 'name_pattern', re: /\bname[_\s-]?pattern\b/i, label: 'name_pattern' },
  { id: 'senza_forzare_cause', re: /\bsenza\s+forzare\s+cause\b/i, label: 'senza forzare cause' },
  { id: 'non_si_puo_affermare', re: /\bnon\s+si\s+pu[oò]\s+affermare\b/i, label: 'non si può affermare' },
  { id: 'senza_pretendere_causal', re: /\bsenza\s+pretendere\s+causal/i, label: 'senza pretendere causalità' },
  { id: 'cause_non_misurate', re: /\bcause\s+non\s+misurat/i, label: 'cause non misurate' },
  { id: 'senza_affermare_un_nesso', re: /\bsenza\s+affermare\s+(un\s+)?nesso\b/i, label: 'senza affermare un nesso' },
  { id: 'fascia_neutra', re: /\bfascia\s+neutra\b/i, label: 'fascia neutra' },
  { id: 'documentato', re: /\bdocumentat[oi]\b/i, label: 'documentato' },
  { id: 'calcolato', re: /\bcalcolat[oi]\b/i, label: 'calcolato' },
  { id: 'derivato', re: /\bderivat[oi]\b/i, label: 'derivato' },
  { id: 'polisonnografia', re: /\bpolisonnografi/i, label: 'polisonnografia' },
]);

/** Solo in summary (headline + wentWell + toImprove + todayAction). */
export const FOCUS_AI_COACH_BANNED_SUMMARY_PHRASES = Object.freeze([
  { id: 'nova_in_summary', re: /\bnova\s*4\b|\bnova\b/i, label: 'NOVA (in summary)' },
  { id: 'catalogo_crea_summary', re: /\bcatalogo\s+crea\b/i, label: 'catalogo CREA' },
  { id: 'ultra_proc_ok', re: null, label: null }, // placeholder — ultra-processato È consentito
]);

/**
 * @param {string} text
 * @param {ReadonlyArray<{ id: string, re: RegExp, label: string }>} rules
 * @returns {{ id: string, label: string }[]}
 */
export function findBannedPhrasesInText(text, rules) {
  const t = String(text || '');
  if (!t) return [];
  /** @type {{ id: string, label: string }[]} */
  const hits = [];
  for (const rule of rules) {
    if (!rule?.re) continue;
    if (rule.re.test(t)) hits.push({ id: rule.id, label: rule.label });
  }
  return hits;
}

/** Vietati sull’energia quando energy_irregular è attivo. */
export const FOCUS_AI_COACH_BANNED_ENERGY_STABILITY_PHRASES = Object.freeze([
  { id: 'energia_costante', re: /\bcostante\b/i, label: 'costante' },
  { id: 'energia_stabile', re: /\bstabile\b/i, label: 'stabile' },
  { id: 'energia_regolare', re: /\bregolare\b/i, label: 'regolare' },
]);

/**
 * @param {object|null|undefined} analysis
 * @param {{ energyIrregular?: boolean }} [opts]
 * @returns {{ ok: boolean, reason: string|null, hits: { id: string, label: string, where: string }[] }}
 */
export function findBannedPhrasesInAnalysis(analysis, opts = {}) {
  if (!analysis || typeof analysis !== 'object') {
    return { ok: true, reason: null, hits: [] };
  }

  const energyStabilityRules = opts.energyIrregular
    ? FOCUS_AI_COACH_BANNED_ENERGY_STABILITY_PHRASES
    : [];
  const userRules = [...FOCUS_AI_COACH_BANNED_USER_PHRASES, ...energyStabilityRules];
  const summaryRules = [
    ...userRules,
    ...FOCUS_AI_COACH_BANNED_SUMMARY_PHRASES.filter((r) => r.re),
  ];

  /** @type {{ id: string, label: string, where: string }[]} */
  const hits = [];

  const push = (where, text, rules) => {
    for (const h of findBannedPhrasesInText(text, rules)) {
      hits.push({ ...h, where });
    }
  };

  const summary = analysis.summary;
  if (summary && typeof summary === 'object') {
    push('summary.headline', summary.headline, summaryRules);
    const todayActionText = typeof summary.todayAction === 'string'
      ? summary.todayAction
      : summary.todayAction?.text;
    push('summary.todayAction', todayActionText, summaryRules);
    for (const [i, row] of (summary.wentWell || []).entries()) {
      push(`summary.wentWell[${i}]`, row?.text, summaryRules);
    }
    for (const [i, row] of (summary.toImprove || []).entries()) {
      push(`summary.toImprove[${i}]`, row?.text, summaryRules);
    }
  }

  push('headline', analysis.headline, userRules);
  push('lead', analysis.lead, userRules);
  push('keyInsight', analysis.keyInsight, userRules);
  push('recommendedAction', analysis.recommendedAction, userRules);
  push('expectedChange', analysis.expectedChange, userRules);
  push('verifyNext', analysis.verifyNext, userRules);
  for (const [i, s] of (analysis.sections || []).entries()) {
    push(`sections[${i}].title`, s?.title, userRules);
    push(`sections[${i}].body`, s?.body, userRules);
  }
  for (const [i, lim] of (analysis.limits || []).entries()) {
    push(`limits[${i}]`, lim, userRules);
  }
  const layers = analysis.claimLayers;
  if (layers && typeof layers === 'object') {
    for (const key of ['recordedFacts', 'generalKnowledge', 'foundedInferences', 'hypothesesToTest']) {
      for (const [i, row] of (layers[key] || []).entries()) {
        push(`claimLayers.${key}[${i}]`, row, userRules);
      }
    }
  }

  if (!hits.length) return { ok: true, reason: null, hits: [] };
  return {
    ok: false,
    reason: 'banned_user_facing_phrase',
    hits,
  };
}

/**
 * @param {{ id: string, label: string, where: string }[]} hits
 */
export function formatBannedPhraseRetryHint(hits) {
  // Non ripetere i termini vietati nel hint: il modello li ricopia.
  const where = [...new Set((hits || []).map((h) => h.where).filter(Boolean))];
  return [
    'RETRY: la risposta precedente usava termini da laboratorio / meta-frasi vietate nel testo utente.',
    where.length ? `Campi da riscrivere: ${where.join(', ')}.` : '',
    'Nel summary usa «ultra-processato»; il codice di classificazione industriale degli alimenti solo nelle sections se serve.',
    'Niente meta-commenti sui limiti del ragionamento. Preferisci «giorno analizzato» e «andamento».',
    'Applica le cautele NON affermando, senza dichiarare i limiti nel tono.',
  ].filter(Boolean).join(' ');
}
