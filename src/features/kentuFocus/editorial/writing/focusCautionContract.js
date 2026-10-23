/**
 * Contratto cautele P6.6.2
 *
 * - doNotClaim: affermazioni vietate (rilevamento negativo), NON da ripetere.
 * - mandatoryContext: limiti interpretativi essenziali da far comprendere.
 * - contextualLimitations: prudenza per lo scrittore, non obbligatorie in stampa.
 */

import { FOCUS_WRITING_LIMITS } from './focusWrittenEdition.v1.js';

export const FOCUS_AGGREGATE_BOILERPLATE_LIMITATIONS = Object.freeze([
  'Giorno senza log ≠ comportamento assente',
  'Nodo presente ≠ osservazione registrata',
  'Data futura ≠ giornata osservata',
  'Assenza aerobica etichettata ≠ inattività fisica',
  'Niente conclusioni corporee da misure fuori finestra',
  'Fibre: non giudicare se fonte inattendibile',
]);

const BOILERPLATE_SET = new Set(FOCUS_AGGREGATE_BOILERPLATE_LIMITATIONS);

/**
 * Negazione esplicita di deficit/carenza (P6.6.5 + P6.7.3d parafrasi).
 * Verbi di negazione del claim — non basta un «non» qualunque nel paragrafo.
 * Ammette inserti brevi («di per sé») tra verbo e «deficit».
 */
const EXPLICIT_PROTEIN_DEFICIT_NEGATION_RE = /\b(?:non\s+(?:è|e)\s+(?:un\s+)?deficit|non\s+definisce\s+(?:di\s+per\s+s[eé]\s+)?(?:un\s+)?deficit|non\s+costituisce\s+(?:di\s+per\s+s[eé]\s+)?(?:un\s+)?deficit|non\s+implica\s+(?:di\s+per\s+s[eé]\s+)?(?:un\s+)?deficit|non\s+dimostra\s+(?:di\s+per\s+s[eé]\s+)?(?:un[ao]?\s+)?(?:deficit|carenza(?:\s+proteic|\s+nutrizional)?)|deficit\s+non\s+dimostrat|non\s+autorizza[\s\S]{0,40}deficit)\b/i;

/** Pattern: se il corpus afferma X senza negazione → forbidden_claim. */
const FORBIDDEN_CLAIM_PATTERNS = Object.freeze({
  diagnosi: {
    id: 'diagnosi',
    // affermazione positiva di diagnosi; ignora «non è una diagnosi»
    assert: /\b(ti\s+diagnostico|questa\s+è\s+una\s+diagnosi|diagnosi\s+di|sei\s+malat)/i,
    negate: /\bnon\s+(è|e)\s+(una\s+)?diagnosi\b/i,
  },
  'correlazione causale inventata': {
    id: 'correlazione_causale',
    assert: /\b(causa\s+dimostrata|prova\s+che\s+caus|correlazione\s+causale\s+certa|provoca\s+direttamente)\b/i,
    negate: /\b(senza\s+causalit|non\s+implica\s+causal|nessuna\s+correlazione\s+causale)\b/i,
  },
  'causalità non dimostrata': {
    id: 'causalita_non_dimostrata',
    assert: /\b(è\s+causat[oa]\s+da|la\s+causa\s+è|provoca\s+il)\b/i,
    negate: /\b(senza\s+causalit|non\s+dimostra\s+causal|causalit[aà]\s+non\s+dimostrat)/i,
  },
  'inattività da assenza di log': {
    id: 'inattivita_da_assenza_log',
    assert: /\b(quindi\s+sei\s+(stato\s+)?inattiv|assenza\s+di\s+log\s+dimostra\s+inattivit|non\s+ti\s+sei\s+allenato\s+perch[eé]\s+non\s+c.?è\s+log)\b/i,
    negate: /\b(non\s+dimostra\s+(inattivit|sedentariet)|assenza\s+di\s+log\s+≠|assenza\s+di\s+log\s+non)\b/i,
  },
  'trasformazione fisiologica': {
    id: 'trasformazione_fisiologica',
    assert: /\b(trasformazione\s+fisiologic|hai\s+perso\s+forza\s+muscolare|regressione\s+fisiologic)\b/i,
    negate: /\b(non\s+(è|e)\s+una\s+trasformazione\s+fisiologic|senza\s+inferire\s+fisiolog)/i,
  },
  'conclusione corporea da misure vecchie': {
    id: 'conclusione_corporea_misure_vecchie',
    assert: /\b(il\s+tuo\s+peso\s+attuale\s+è|oggi\s+pesi|massa\s+attuale\s+confermata)\b/i,
    negate: /\b(misure?\s+non\s+attual|non\s+conclude(re)?\s+sul\s+corpo\s+attuale)\b/i,
  },
  'conclusione corporea attuale da misure vecchie': {
    id: 'conclusione_corporea_attuale',
    assert: /\b(il\s+tuo\s+peso\s+attuale\s+è|oggi\s+pesi)\b/i,
    negate: /\b(misure?\s+non\s+attual|non\s+conclude)/i,
  },
  'consiglio proteico automatico': {
    id: 'consiglio_proteico',
    assert: /\b(mangia\s+pi[uù]\s+protein|aumenta\s+le\s+protein|devi\s+assumere\s+pi[uù]\s+protein)\b/i,
    negate: /\b(senza\s+consiglio\s+proteico|non\s+(è|e)\s+un\s+invito\s+a\s+mangiare\s+pi[uù])\b/i,
  },
  'cura del sonno': {
    id: 'cura_sonno',
    assert: /\b(cura\s+(del\s+)?sonno|ti\s+prescrivo\s+.*sonno)\b/i,
    negate: /\bnon\s+(è|e)\s+una\s+cura\b/i,
  },
  /** Δ proteico ≠ deficit: affermazione indebita. */
  'deficit proteico': {
    id: 'protein_deficit',
    assert: /\b(deficit\s+proteic|carenza\s+proteic|carenza\s+nutrizional|insufficienza\s+proteic|sei\s+in\s+deficit\b|hai\s+un\s+deficit\b)/i,
    // P6.6.5: negazioni esplicite (costituisce/implica/definisce/dimostra), non un generico «non» nel paragrafo
    negate: EXPLICIT_PROTEIN_DEFICIT_NEGATION_RE,
  },
  'peggioramento fisiologico': {
    id: 'peggioramento_fisiologico',
    assert: /\b(peggioramento\s+fisiologic|regressione\s+muscolare|hai\s+perso\s+massa|conseguenze\s+corpore)/i,
    negate: /\b(non\s+(è|e)\s+un\s+peggioramento|non\s+(costituisce|implica|definisce|dimostra)\s+(un\s+)?peggioramento|senza\s+inferire\s+fisiolog|non\s+conclude.*corpo)\b/i,
  },
});

/**
 * Contesti obbligatori tipici (id stabile → match naturale).
 * Solo limiti essenziali per il lettore.
 *
 * NOTA: «scostamento ≠ deficit» NON è qui — è proibizione/condizionale
 * (evaluateProteinDeltaDeficitGuard), non frase da stampare sempre.
 */
/**
 * Domini evidenti da path/ref autorizzati (nutrition / sleep / activity).
 * @param {object|null|undefined} item
 * @returns {Set<string>}
 */
function authorizedDomainSet(item) {
  const domains = new Set();
  const blobs = [];
  for (const m of item?.metrics || []) {
    if (m?.path) blobs.push(String(m.path));
  }
  for (const r of item?.refs || []) {
    if (typeof r === 'string') blobs.push(r);
  }
  for (const d of item?.coverage?.solidDomains || []) {
    if (typeof d === 'string') domains.add(d);
  }
  const joined = blobs.join(' ');
  if (/nutrition|protein|kcal|food|avgProtein|avgKcal/i.test(joined)) domains.add('nutrition');
  if (/\.sleep\b|sleepRoutine|avgHours|nightsLogged/i.test(joined)) domains.add('sleep');
  if (/activity|strength|workout/i.test(joined)) domains.add('activity');
  return domains;
}

/**
 * Causalità cross-domain obbligatoria solo se la notizia autorizza >1 dominio
 * (P6.7.3d: non costringere a dichiararla su storie monodominio, es. solo proteine).
 * @param {object|null|undefined} item
 */
function requiresCrossDomainCausalityContext(item) {
  return authorizedDomainSet(item).size > 1;
}

const MANDATORY_CONTEXT_RULES = Object.freeze([
  {
    id: 'equal_length_window_not_calendar_month',
    testLimitation: (s) => /mese solare precedente/i.test(s) && /finestra/i.test(s),
    satisfied: (corpus) => (
      corpus.includes('mese solare precedente')
      || corpus.includes('mese di calendario')
      || (
        corpus.includes('finestra')
        && (
          corpus.includes('equivalente')
          || corpus.includes('equivalenti')
          || corpus.includes('eguale')
          || corpus.includes('pari durata')
        )
      )
      || (
        corpus.includes('sette giorni')
        && corpus.includes('precedent')
        && (corpus.includes('calendario') || corpus.includes('mese solare'))
      )
    ),
  },
  {
    id: 'no_domain_causality_without_evidence',
    testLimitation: (s) => /causalit/i.test(s) && /domini/i.test(s),
    /** @param {object|null|undefined} item */
    applicable: (item) => requiresCrossDomainCausalityContext(item),
    satisfied: (corpus) => (
      (corpus.includes('causalit') && corpus.includes('domini'))
      || (corpus.includes('senza') && corpus.includes('causal'))
    ),
  },
  {
    id: 'sleep_pattern_not_diagnosis',
    // Solo se limitation parla di diagnosi del sonno / qualità recupero
    testLimitation: (s) => /diagnosi/i.test(s) && /sonno|recupero/i.test(s),
    satisfied: (corpus) => (
      corpus.includes('non e una diagnosi')
      || corpus.includes('non e diagnosi')
      || (corpus.includes('abitudin') && !/\bdiagnosi\s+di\b/.test(corpus))
      || corpus.includes('osservazione') && corpus.includes('non')
    ),
  },
]);

/** Limitation testo → resta contesto scrittore, mai mandatory di stampa. */
const WRITER_ONLY_LIMITATION_RE = /scostamento proteico non [eè] un deficit|non [eè] un deficit dimostrato/i;

/** Menzione di deficit / rischio che richiede contestualizzazione. */
const PROTEIN_DEFICIT_TOPIC_RE = /\b(deficit|carenza\s+prote|insufficienz|peggioramento\s+fisiologic|conseguenze\s+corpore)/i;

/** Affermazione indebita di deficit da Δ proteico (senza negazione). */
const PROTEIN_DEFICIT_ASSERT_RE = /\b(quindi\s+(c.?[eè]\s+)?(un\s+)?deficit|deficit\s+proteic|sei\s+in\s+deficit|hai\s+un\s+deficit|carenza\s+proteic\s+dimostrat|insufficienza\s+proteic|peggioramento\s+fisiologic|questo\s+calo\s+[eè]\s+un\s+deficit)\b/i;

/** Negazione / contestualizzazione esplicita (anche «non definisce/costituisce un deficit»). */
const PROTEIN_DEFICIT_CONTEXT_SOFT_RE = /\b(senza\s+inferire\s+(un\s+)?deficit|non\s+necessariamente\s+(un\s+)?deficit|rischio\s+ipotetic|solo\s+una\s+media\s+registrata)\b/i;
const PROTEIN_DEFICIT_CONTEXT_RE = {
  test: (s) => EXPLICIT_PROTEIN_DEFICIT_NEGATION_RE.test(s) || PROTEIN_DEFICIT_CONTEXT_SOFT_RE.test(s),
};

export function normalizeCautionText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[≠]/g, ' non ')
    .replace(/[^a-z0-9àèéìòù\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {object|null|undefined} item
 * @returns {{
 *   doNotClaim: string[],
 *   mandatoryContext: { id: string, sourceText: string }[],
 *   contextualLimitations: string[],
 * }}
 */
export function classifyArticleCautionLayers(item) {
  const doNotClaim = [];
  const seenDnc = new Set();
  for (const s of item?.doNotClaim || []) {
    if (typeof s !== 'string' || !s.trim() || seenDnc.has(s)) continue;
    seenDnc.add(s);
    doNotClaim.push(s.trim());
  }

  const contextualLimitations = [];
  const mandatoryContext = [];
  const seenMand = new Set();

  for (const s of item?.limitations || []) {
    if (typeof s !== 'string' || !s.trim()) continue;
    const text = s.trim();
    if (BOILERPLATE_SET.has(text) || WRITER_ONLY_LIMITATION_RE.test(text)) {
      contextualLimitations.push(text);
      continue;
    }
    let matched = false;
    for (const rule of MANDATORY_CONTEXT_RULES) {
      if (!rule.testLimitation(text) || seenMand.has(rule.id)) continue;
      // Regola presente ma non pertinente a questa notizia → writer-only
      if (typeof rule.applicable === 'function' && !rule.applicable(item)) {
        contextualLimitations.push(text);
        matched = true;
        break;
      }
      seenMand.add(rule.id);
      mandatoryContext.push({ id: rule.id, sourceText: text });
      matched = true;
      break;
    }
    if (!matched) {
      // Limiti specifici non classificati: restano contesto scrittore (non obbligatori in stampa)
      contextualLimitations.push(text);
    }
  }

  // Proibizioni tipiche sul Δ proteico (rilevamento, non stampa obbligatoria)
  if (
    /protein|nutrition/i.test(String(item?.domain || ''))
    || (item?.metrics || []).some((m) => /avgProteinG|deltas\.avgProteinG/i.test(m?.path || ''))
  ) {
    for (const claim of ['deficit proteico', 'peggioramento fisiologico']) {
      if (!seenDnc.has(claim)) {
        seenDnc.add(claim);
        doNotClaim.push(claim);
      }
    }
  }

  // Cap mandatory
  const cappedMand = mandatoryContext.slice(0, FOCUS_WRITING_LIMITS.cautionsMax);

  return {
    doNotClaim,
    mandatoryContext: cappedMand,
    contextualLimitations,
  };
}

/**
 * @deprecated — usare classifyArticleCautionLayers + mandatoryContext
 * Compat: restituisce solo testi mandatory (per brief legacy).
 */
export function selectRequiredCautionsForArticle(item, max = FOCUS_WRITING_LIMITS.cautionsMax) {
  const { mandatoryContext } = classifyArticleCautionLayers(item);
  return mandatoryContext.map((m) => m.sourceText).slice(0, max);
}

export function selectContextualLimitations(item) {
  return classifyArticleCautionLayers(item).contextualLimitations;
}

/**
 * @param {string} requiredText — legacy
 * @param {string[]} cautions
 * @param {string} [title]
 * @param {string} [body]
 */
export function isRequiredCautionSatisfied(requiredText, cautions, title = '', body = '') {
  const layers = {
    mandatoryContext: [{ id: 'legacy', sourceText: requiredText }],
  };
  return isMandatoryContextSatisfied(layers.mandatoryContext[0], cautions, title, body);
}

/**
 * @param {{ id: string, sourceText: string }} ctx
 * @param {string[]} cautions
 * @param {string} title
 * @param {string} body
 */
export function isMandatoryContextSatisfied(ctx, cautions, title, body) {
  if (!ctx?.sourceText) return true;
  const list = Array.isArray(cautions) ? cautions : [];
  if (list.includes(ctx.sourceText)) return true;

  const corpus = normalizeCautionText(`${title}\n${body}\n${list.join('\n')}`);
  const rule = MANDATORY_CONTEXT_RULES.find((r) => r.id === ctx.id);
  if (rule) return rule.satisfied(corpus);

  // Fallback: presenza naturale del testo / parafrasi ampia
  const nReq = normalizeCautionText(ctx.sourceText);
  if (nReq.length >= 12 && corpus.includes(nReq)) return true;
  for (const c of list) {
    const nc = normalizeCautionText(c);
    if (nc && nReq.length >= 8 && (nc.includes(nReq) || nReq.includes(nc))) return true;
  }
  if (nReq.length > 80) {
    if (nReq.includes('mese solare') && corpus.includes('mese solare')) return true;
    if (nReq.includes('finestra') && corpus.includes('finestra')) return true;
  }
  return false;
}

/**
 * Guard Δ proteico / deficit (P6.6.2 finalizzazione).
 *
 * - Articolo descrittivo che non parla di deficit → ok (nessuna frase negativa obbligatoria).
 * - Affermazione indebita di deficit/insufficienza/peggioramento → forbidden_claim.
 * - Menzione di deficit/rischio senza contestualizzazione → mandatory_context_missing.
 *
 * @param {object|null|undefined} item
 * @param {string} title
 * @param {string} body
 * @param {string[]} cautions
 * @returns {string[]}
 */
export function evaluateProteinDeltaDeficitGuard(item, title, body, cautions = []) {
  const hasProteinDelta = (item?.metrics || []).some(
    (m) => /comparison\.deltas\.avgProteinG/i.test(m?.path || ''),
  )
    || /deltas\.avgProteinG/i.test(item?.storySpine?.mainMetricPath || '')
    || /protein_intake_shift/i.test(item?.storySpine?.mainFactId || '');
  if (!hasProteinDelta) return [];

  const corpusRaw = `${title}\n${body}\n${(cautions || []).join('\n')}`;
  const errors = [];

  if (PROTEIN_DEFICIT_ASSERT_RE.test(corpusRaw) && !PROTEIN_DEFICIT_CONTEXT_RE.test(corpusRaw)) {
    errors.push('forbidden_claim_detected:protein_deficit');
  }

  // Parla di deficit/rischio → serve contestualizzazione specifica
  if (PROTEIN_DEFICIT_TOPIC_RE.test(corpusRaw) && !PROTEIN_DEFICIT_CONTEXT_RE.test(corpusRaw)) {
    if (!errors.includes('forbidden_claim_detected:protein_deficit')) {
      errors.push('mandatory_context_missing:protein_delta_not_proven_deficit');
    }
  }

  return errors;
}

/**
 * Rileva doNotClaim affermati (non mera citazione del divieto).
 * @param {string[]} doNotClaim
 * @param {string} title
 * @param {string} body
 * @returns {string[]} error tokens forbidden_claim_detected:<id>
 */
export function detectForbiddenClaims(doNotClaim, title, body) {
  const corpusRaw = `${title}\n${body}`;
  const corpus = normalizeCautionText(corpusRaw);
  /** @type {string[]} */
  const hits = [];
  for (const claim of doNotClaim || []) {
    const key = String(claim || '').trim().toLowerCase();
    const pat = FORBIDDEN_CLAIM_PATTERNS[key]
      || FORBIDDEN_CLAIM_PATTERNS[claim]
      || null;
    if (!pat) {
      // Divieto generico corto: solo se affermato senza negazione tipica
      if (key.length >= 4 && key.length <= 40) {
        const re = new RegExp(`\\b${escapeReg(normalizeCautionText(claim))}\\b`, 'i');
        if (re.test(corpus) && !new RegExp(`\\bnon\\b[^.\\n]{0,24}${escapeReg(normalizeCautionText(claim))}`, 'i').test(corpus)) {
          // Evita falsi positivi su «non dimostra X» / «nessuna X»
          if (/\b(non\s+dimostra|nessun[ao]?|senza)\b/i.test(corpusRaw)
            && corpus.includes(normalizeCautionText(claim))) {
            continue;
          }
          // Non richiedere menzione del divieto: solo se affermazione forte
          continue;
        }
      }
      continue;
    }
    if (pat.negate.test(corpusRaw)) continue;
    if (pat.assert.test(corpusRaw)) {
      hits.push(`forbidden_claim_detected:${pat.id}`);
    }
  }
  return hits;
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
