/**
 * Scoring deterministico dei candidati editoriali.
 */

import {
  FOCUS_RANK_WEIGHTS,
  FOCUS_SCORE_THRESHOLDS,
} from './focusEditorialConfig.js';
import { isTopicInLeadCooldown } from './focusEditorialMemory.js';

const EVIDENCE_SCORE = { high: 1, medium: 0.6, low: 0.25 };
const NOVELTY_SCORE = { new: 1, recurring: 0.4, stale: 0.1 };
const PERSISTENCE_SCORE = {
  consolidated: 1,
  emerging: 0.75,
  repeated: 0.65,
  isolated: 0.45,
};

/**
 * @param {object} candidate
 * @param {{
 *   memory?: object|null,
 *   publicationDate?: string,
 *   selectedDomains?: Set<string>,
 *   weights?: typeof FOCUS_RANK_WEIGHTS,
 * }} [ctx]
 */
export function scoreFocusCandidate(candidate, ctx = {}) {
  const weights = ctx.weights || FOCUS_RANK_WEIGHTS;
  const omittedHard = hardGate(candidate, ctx);
  if (omittedHard) {
    return {
      score: 0,
      scoreBreakdown: { hardGate: omittedHard },
      omitReason: omittedHard,
    };
  }

  let evidence = EVIDENCE_SCORE[candidate.evidenceQuality] ?? 0.25;
  if (candidate.claimType === 'hypothesis') evidence = Math.min(evidence, 0.3);

  const novelty = NOVELTY_SCORE[candidate.novelty] ?? 0.4;
  const persistence = PERSISTENCE_SCORE[candidate.persistence] ?? 0.45;

  const relevance = candidate.tone === 'positive' ? 0.85
    : candidate.typology === 'window_comparison' ? 0.8
      : candidate.domain === 'habits' ? 0.7
        : 0.55;

  const actionability = clamp01(Number(candidate.actionability) || 0);

  const selectedDomains = ctx.selectedDomains || new Set();
  const narrative = selectedDomains.has(candidate.domain) ? 0.35 : 1;

  let antiRepeat = 1;
  if (candidate.novelty === 'stale') antiRepeat = 0.15;
  else if (candidate.novelty === 'recurring') antiRepeat = 0.55;
  if (
    ctx.publicationDate
    && isTopicInLeadCooldown(ctx.memory, candidate.topicId, ctx.publicationDate)
  ) {
    antiRepeat = Math.min(antiRepeat, 0.2);
  }

  const coherence = candidate.claimType === 'hypothesis' ? 0.5 : 0.85;

  const dims = {
    evidence,
    relevance,
    novelty,
    persistence,
    actionability,
    coherence,
    narrative,
    antiRepeat,
  };

  let score = 0;
  for (const [k, w] of Object.entries(weights)) {
    score += w * clamp01(dims[k] ?? 0);
  }
  score = Math.round(score * 1000) / 10;

  return {
    score,
    scoreBreakdown: dims,
    omitReason: null,
  };
}

/**
 * @param {object[]} candidates
 * @param {object} [ctx]
 */
export function rankFocusCandidates(candidates, ctx = {}) {
  return (Array.isArray(candidates) ? candidates : [])
    .map((c) => {
      const scored = scoreFocusCandidate(c, ctx);
      return {
        ...c,
        score: scored.score,
        scoreBreakdown: scored.scoreBreakdown,
        omitReason: scored.omitReason,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.id).localeCompare(String(b.id));
    });
}

function hardGate(candidate, ctx) {
  if (!candidate?.id) return 'invalid_candidate';
  if (candidate.claimType === 'hypothesis' && candidate.preferredRoles?.includes('lead')) {
    // still allow scoring but lead selection will block
  }
  if (candidate.evidenceQuality === 'low' && candidate.claimType === 'hypothesis') {
    // ok as feature only
  }
  if (
    ctx.publicationDate
    && candidate.roleIntent === 'lead'
    && isTopicInLeadCooldown(ctx.memory, candidate.topicId, ctx.publicationDate)
  ) {
    return 'repeat';
  }
  // deep/REM non devono comparire come evidenza
  const refs = candidate.refs || [];
  if (refs.some((r) => String(r).includes('deepMin') || String(r).includes('remMin'))) {
    return 'unreliable_sleep_stages';
  }
  if (candidate.score === 0 && candidate.omitReason) return candidate.omitReason;
  return null;
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export { FOCUS_SCORE_THRESHOLDS };
