/**
 * FocusEditorialSelection — ranking e selezione deterministici.
 * Non aggiorna la memoria editoriale.
 */

import {
  FOCUS_EDITORIAL_CAPS,
  FOCUS_EDITORIAL_SCHEMA_VERSION,
  FOCUS_SCORE_THRESHOLDS,
} from './focusEditorialConfig.js';
import { extractFocusSignals } from './extractFocusSignals.js';
import { selectFocusCoach } from './focusCoachCatalog.js';
import {
  isTopicInLeadCooldown,
  normalizeEditorialMemory,
} from './focusEditorialMemory.js';
import { rankFocusCandidates } from './rankFocusCandidates.js';

/**
 * @param {{
 *   dossier: object,
 *   memory?: object|null,
 *   caps?: Partial<typeof FOCUS_EDITORIAL_CAPS>,
 *   dossierContentHash?: string,
 * }} input
 */
export function selectFocusEditorial(input) {
  const dossier = input?.dossier;
  if (!dossier?.meta?.analysisDate || !dossier?.meta?.publicationDate) {
    throw new Error('selectFocusEditorial: dossier.meta.analysisDate/publicationDate richiesti');
  }

  const memory = normalizeEditorialMemory(input.memory);
  const caps = { ...FOCUS_EDITORIAL_CAPS, ...(input.caps || {}) };
  const publicationDate = dossier.meta.publicationDate;
  const analysisDate = dossier.meta.analysisDate;

  const raw = extractFocusSignals(dossier, memory);
  const ranked = rankFocusCandidates(raw, { memory, publicationDate });

  /** @type {object[]} */
  const omitted = [];
  const usedIds = new Set();
  const usedTopics = new Set();
  const usedDomains = new Set();

  const take = (candidate, role) => {
    if (!candidate || usedIds.has(candidate.id) || usedTopics.has(candidate.topicId)) return null;
    if (candidate.forbidRoles?.includes(role)) return null;
    if (candidate.omitReason) return null;
    if (candidate.claimType === 'hypothesis' && (role === 'concern' || role === 'lead')) {
      omitted.push({ candidateId: candidate.id, reason: 'hypothesis_not_elevated' });
      return null;
    }
    if (role === 'lead' && isTopicInLeadCooldown(memory, candidate.topicId, publicationDate)) {
      omitted.push({ candidateId: candidate.id, reason: 'repeat' });
      return null;
    }
    usedIds.add(candidate.id);
    usedTopics.add(candidate.topicId);
    usedDomains.add(candidate.domain);
    return toNewsItem(candidate, role);
  };

  // Re-rank with narrative diversity after each pick would be complex; apply domain penalty in second pass.
  const reRank = () => rankFocusCandidates(
    ranked.filter((c) => !usedIds.has(c.id)),
    { memory, publicationDate, selectedDomains: usedDomains },
  );

  let pool = ranked;

  let lead = null;
  let openingMode = 'neutral';

  const leadPool = pool.filter(
    (c) => c.tone === 'positive'
      && c.evidenceQuality !== 'low'
      && c.score >= FOCUS_SCORE_THRESHOLDS.leadMin
      && !c.forbidRoles?.includes('lead')
      && c.claimType !== 'hypothesis'
      && c.id !== 'sig_documentation_complete'
      && !isTopicInLeadCooldown(memory, c.topicId, publicationDate),
  );
  for (const c of leadPool) {
    const item = take(c, 'lead');
    if (item) {
      lead = item;
      openingMode = c.openingModeHint
        || (c.typology === 'window_comparison' ? 'progress' : 'positive_fact');
      break;
    }
  }

  // Documentazione diario: solo feature/continuity, mai spacciata per progresso fisiologico come lead.
  if (!lead) {
    openingMode = 'neutral';
  }

  pool = reRank();

  /** @type {object[]} */
  const goodNews = [];
  for (const c of pool) {
    if (goodNews.length >= caps.goodNewsMax) break;
    if (c.tone !== 'positive') continue;
    if (c.score < FOCUS_SCORE_THRESHOLDS.goodNewsMin) continue;
    if (c.preferredRoles && !c.preferredRoles.includes('good') && !c.preferredRoles.includes('lead')) {
      continue;
    }
    const item = take(c, 'good');
    if (item) goodNews.push(item);
  }

  pool = reRank();

  /** @type {object[]} */
  const features = [];
  for (const c of pool) {
    if (features.length >= caps.featuresMax) break;
    if (c.score < FOCUS_SCORE_THRESHOLDS.featureMin) continue;
    // Ipotesi caute → feature; fatti cauti restano per concerns (non diluire la criticità).
    if (c.tone === 'caution' && c.claimType === 'hypothesis') {
      const item = take(c, 'feature');
      if (item) features.push(item);
      continue;
    }
    if (c.tone === 'caution') continue;
    if (c.preferredRoles && !c.preferredRoles.includes('feature')) continue;
    const item = take(c, 'feature');
    if (item) features.push(item);
  }

  pool = reRank();

  /** @type {object[]} */
  const concerns = [];
  for (const c of pool) {
    if (concerns.length >= caps.concernsMax) break;
    if (c.tone !== 'caution') continue;
    if (c.claimType === 'hypothesis') {
      omitted.push({ candidateId: c.id, reason: 'hypothesis_not_concern' });
      continue;
    }
    if (c.score < FOCUS_SCORE_THRESHOLDS.concernMin) continue;
    // Persistenza: isolated ok solo come osservazione prudente fattuale (es. sonno corto una notte)
    const item = take(c, 'concern');
    if (item) concerns.push(item);
  }

  for (const c of ranked) {
    if (!usedIds.has(c.id)) {
      omitted.push({
        candidateId: c.id,
        reason: c.omitReason || (c.score < FOCUS_SCORE_THRESHOLDS.featureMin ? 'low_evidence' : 'cap'),
      });
    }
  }

  const selectedNews = [lead, ...goodNews, ...features, ...concerns].filter(Boolean);
  const coach = selectFocusCoach(dossier, selectedNews, memory, publicationDate);

  return {
    schemaVersion: FOCUS_EDITORIAL_SCHEMA_VERSION,
    publicationDate,
    analysisDate,
    dossierRef: {
      schemaVersion: dossier.schemaVersion,
      contentHash: input.dossierContentHash || null,
    },
    openingMode,
    lead,
    goodNews,
    features,
    concerns,
    coach,
    omitted,
    caps,
    editorialNotes: buildEditorialNotes(dossier, lead, coach),
  };
}

function toNewsItem(candidate, role) {
  return {
    id: `news_${candidate.id.replace(/^sig_/, '')}`,
    topicId: candidate.topicId,
    role,
    tone: candidate.tone,
    claimType: candidate.claimType,
    domain: candidate.domain,
    headlineSeed: candidate.headlineSeed,
    summarySeed: candidate.summarySeed,
    refs: candidate.refs || [],
    metrics: candidate.metrics || [],
    evidenceQuality: candidate.evidenceQuality,
    persistence: candidate.persistence,
    novelty: candidate.novelty,
    actionability: candidate.actionability || 0,
    score: candidate.score,
    scoreBreakdown: candidate.scoreBreakdown,
    doNotClaim: candidate.doNotClaim || [],
    limitations: candidate.limitations || [],
    coverage: candidate.coverage,
    provenance: candidate.provenance,
  };
}

function buildEditorialNotes(dossier, lead, coach) {
  const notes = [];
  if (!lead) notes.push('no_lead_selected');
  if (!coach) notes.push('no_coach_selected');
  if (dossier.meta?.flags?.nutritionTotalsAffectedByDedupe) {
    notes.push('nutrition_totals_affected_by_focus_dedupe');
  }
  if (dossier.history?.comparisons?.d7_vs_prev7 && !dossier.history.comparisons.d7_vs_prev7.available) {
    notes.push('d7_comparison_unavailable');
  }
  return notes;
}
