/**
 * Validazione risposta coach AI Kentu Focus.
 * Rifiuta score, diagnosi e overclaim clinici — non mostrare testo non valido.
 */

const BANNED_CLAIM_RE = new RegExp([
  'daily\\s*score',
  'longevity\\s*score',
  'score\\s*\\d{1,3}',
  'punteggio\\s*(di\\s*)?salute',
  '0\\s*[-–]\\s*100',
  'citochin',
  'cytokine',
  'glicemia\\s+misurat',
  'picco\\s+glicem',
  'insulina\\s+(garant|misurat|controll)',
  'cortisol',
  'nrf2',
  'stato\\s+infiammatorio',
  'infiammazione\\s+clinica',
  'carenza\\s+(di\\s+)?(ferro|b12|vitamina|diagnost)',
  'deficit\\s+(di\\s+)?(ferro|b12|vitamina)',
  'diagnosi',
  'referto\\s+medico',
  'garantisce\\s+la\\s+stabilit',
  'causa\\s+(diretta|certa|dimostrata)',
  'provoca\\s+il\\s+sonno',
  'antinfiammatorio\\s+eccellente',
].join('|'), 'i');

const PILLAR_IDS = new Set(['nutrition', 'exercise', 'sleep', 'balanced']);

/**
 * @param {unknown} rawText
 * @returns {string}
 */
export function unwrapFocusAiCoachJson(rawText) {
  let text = String(rawText || '').trim();
  if (!text) return '';
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text;
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function cleanText(value) {
  if (value == null) return null;
  const t = String(value).trim();
  return t || null;
}

/**
 * @param {unknown} rawText
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   analysis?: object|null,
 * }}
 */
export function validateFocusAiCoachResponse(rawText) {
  const unwrapped = unwrapFocusAiCoachJson(rawText);
  if (!unwrapped) {
    return { ok: false, reason: 'empty_response', analysis: null };
  }

  let parsed;
  try {
    parsed = JSON.parse(unwrapped);
  } catch {
    return { ok: false, reason: 'invalid_json', analysis: null };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'not_object', analysis: null };
  }

  // Rifiuta score / campi clinici extra
  const forbiddenKeys = [
    'dailyScore', 'score', 'healthScore', 'longevityScore', 'longevityNutrition',
    'inflammationSummary', 'clinicalBulletinMarkdown',
  ];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(parsed, key) && parsed[key] != null && parsed[key] !== '') {
      return { ok: false, reason: `forbidden_field_${key}`, analysis: null };
    }
  }

  const integratedComment = cleanText(parsed.integratedComment);
  const practicalAction = cleanText(parsed.practicalAction);
  const primaryPillarId = cleanText(parsed.primaryPillarId);
  const obs = parsed.pillarObservations && typeof parsed.pillarObservations === 'object'
    ? parsed.pillarObservations
    : null;

  if (!integratedComment || !practicalAction || !obs || !primaryPillarId) {
    return { ok: false, reason: 'missing_required_fields', analysis: null };
  }
  if (!PILLAR_IDS.has(primaryPillarId)) {
    return { ok: false, reason: 'invalid_primary_pillar', analysis: null };
  }

  const pillarObservations = {
    nutrition: cleanText(obs.nutrition),
    exercise: cleanText(obs.exercise),
    sleep: cleanText(obs.sleep),
  };
  if (!pillarObservations.nutrition || !pillarObservations.exercise || !pillarObservations.sleep) {
    return { ok: false, reason: 'incomplete_pillar_observations', analysis: null };
  }

  let focusAspects = Array.isArray(parsed.focusAspects) ? parsed.focusAspects : [];
  focusAspects = focusAspects
    .map((a) => cleanText(a))
    .filter(Boolean)
    .slice(0, 2);

  const blob = [
    integratedComment,
    pillarObservations.nutrition,
    pillarObservations.exercise,
    pillarObservations.sleep,
    ...focusAspects,
    practicalAction,
  ].join('\n');

  if (BANNED_CLAIM_RE.test(blob)) {
    return { ok: false, reason: 'banned_clinical_or_score_claim', analysis: null };
  }

  return {
    ok: true,
    reason: null,
    analysis: {
      schema: 'kentu.focusAiCoachAnalysis.v1',
      integratedComment,
      pillarObservations,
      focusAspects,
      practicalAction,
      primaryPillarId,
    },
  };
}
