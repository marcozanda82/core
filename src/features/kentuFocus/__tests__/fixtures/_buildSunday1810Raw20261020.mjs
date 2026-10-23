/**
 * Deriva fixture minimizzata da geminiRawResponse_20261020.txt (P6.6.3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateFocusWrittenEdition } from '../../editorial/writing/validateFocusWrittenEdition.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../../');
const clip = JSON.parse(
  fs.readFileSync(path.join(root, 'geminiRawResponse_20261020.txt'), 'utf8'),
);
const raw = JSON.parse(clip.geminiRawResponse);
const authByRole = Object.fromEntries(clip.authorizedArticles.map((a) => [a.role, a]));

function mapItem(a, domain, extraRefs = []) {
  const metrics = a.metrics || [];
  return {
    id: a.id,
    role: a.role,
    tone: 'neutral',
    claimType: 'calculated',
    domain,
    topicId: a.topicId,
    editorialScale: a.editorialScale,
    storyKind: a.storyKind,
    headlineSeed: a.headlineSeed,
    summarySeed: a.summarySeed,
    evidenceFingerprint: a.evidenceFingerprint,
    observedPeriod: a.observedPeriod,
    metrics,
    limitations: a.limitations || [],
    doNotClaim: a.doNotClaim || [],
    refs: [...extraRefs, ...metrics.map((m) => m.path)],
    storySpine: a.storySpine || undefined,
    evidenceQuality: 'high',
  };
}

const selection = {
  schemaVersion: '1.0.0',
  analysisDate: clip.dates.analysisDate,
  publicationDate: clip.dates.publicationDate,
  editionKind: clip.editionKind,
  openingMode: 'progress',
  lead: mapItem(authByRole.lead, 'sleep', [
    'sleepRoutine.ordinary',
    'sleepRoutine.aggregate.reliability',
    'sleepRoutine.signals',
  ]),
  centerpiece: mapItem(authByRole.centerpiece, 'nutrition', [
    'edition.week.aggregate.nutrition',
    'edition.week.aggregate.sleep',
    'edition.week.aggregate.activity',
  ]),
  goodNews: [mapItem(authByRole.good, 'nutrition')],
  features: [mapItem(authByRole.feature, 'activity')],
  concerns: [],
  coach: null,
  omitted: [],
  editorialNotes: [],
  caps: {},
};
if (authByRole.centerpiece.storySpine) {
  selection.centerpiece.storySpine = authByRole.centerpiece.storySpine;
}

const rejected = {
  schemaVersion: raw.schemaVersion,
  kind: raw.kind,
  analysisDate: raw.analysisDate,
  publicationDate: raw.publicationDate,
  openingMode: raw.openingMode,
  articles: raw.articles,
  coach: raw.coach,
  mastheadTeaser: raw.mastheadTeaser,
};

const before = validateFocusWrittenEdition(rejected, { selection });
console.log('AFTER_FIX_ERRORS', before.errors);

const meta = {
  schemaSource: clip.schema,
  sourceFile: 'geminiRawResponse_20261020.txt',
  exportedAt: clip.exportedAt,
  publicationDate: clip.dates.publicationDate,
  analysisDate: clip.dates.analysisDate,
  model: clip.model,
  callCount: clip.callCount,
  historicalValidationErrors: clip.validationErrors,
  note: 'Raw reale 20/10/2026 05:03Z — minimizzato (no essentialEvidence duplicato).',
};

const fixtureJs = `/**
 * Fixture P6.6.3 — raw reale \`geminiRawResponse_20261020.txt\`
 * (kentu.focusGeminiPreview.v1, exportedAt ${clip.exportedAt}).
 */

export const FOCUS_GEMINI_RAW_SUNDAY_1810_V2_META = Object.freeze(${JSON.stringify(meta, null, 2)});

export function buildSunday1810V2AuthorizedSelection() {
  return ${JSON.stringify(selection, null, 2)};
}

export function buildSunday1810V2RejectedRawEdition() {
  return ${JSON.stringify(rejected, null, 2)};
}
`;

fs.writeFileSync(path.join(here, 'focusGeminiRawSunday1810.v2.minimized.js'), fixtureJs);
console.log('wrote focusGeminiRawSunday1810.v2.minimized.js');
