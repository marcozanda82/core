#!/usr/bin/env node
/**
 * Diagnosi statica Focus AI Coach (senza rete Gemini):
 * timeout attuali, dimensione dossier fixture, parole vietate nel prompt/dossier.
 *
 *   node scripts/diagnoseFocusAiCoachTimeouts.mjs
 */

import {
  resolveFocusPageSession,
  buildFocusAiCoachDossier,
  buildFocusAiCoachUserPrompt,
  buildFocusAiCoachSystemInstruction,
  __resetFocusDiaryHandoffForTests,
} from '../src/features/kentuFocus/product/index.js';
import {
  FOCUS_REAL_OCT27_CATALOGS,
  loadFocusDiaryRealOct27,
} from '../src/features/kentuFocus/__tests__/fixtures/focusDiaryRealOct27.js';
import {
  FOCUS_AI_COACH_TIMEOUT_MS,
  FOCUS_AI_COACH_TIMEOUT_MS_CAP,
  resolveFocusAiCoachTimeoutMs,
} from '../src/features/kentuFocus/product/focusAiCoachTimeouts.js';
import { FOCUS_OFF_WAIT_TIMEOUT_MS } from '../src/features/kentuFocus/product/waitFocusOffCatalogForAnalysis.js';
import { FOCUS_AI_COACH_BANNED_USER_PHRASES } from '../src/features/kentuFocus/product/focusAiCoachBannedUserPhrases.js';

/** Allineato a src/services/aiService.js (evita import Firebase in Node). */
const ASK_AI_TIMEOUT_MS = 30_000;

__resetFocusDiaryHandoffForTests();
const fx = loadFocusDiaryRealOct27();
const session = resolveFocusPageSession({
  uid: 'fixture_user',
  periodId: 'ieri',
  handoff: {
    uid: 'fixture_user',
    fullHistory: fx.fullHistory,
    analysisDate: fx.analysisDate,
    publicationDate: fx.publicationDate,
    userTargets: fx.userTargets,
  },
});

const t0 = Date.now();
const built = buildFocusAiCoachDossier(session, { foodCatalogs: FOCUS_REAL_OCT27_CATALOGS });
const dossierMs = Date.now() - t0;
if (!built.ok) {
  console.error(JSON.stringify({ ok: false, reason: built.reason }, null, 2));
  process.exit(1);
}

const dossierJson = JSON.stringify(built.dossier);
const userText = buildFocusAiCoachUserPrompt(built.dossier);
const systemText = buildFocusAiCoachSystemInstruction();
const ids = built.dossier?.eventIndex?.ids || [];

const keySizes = Object.fromEntries(
  Object.entries(built.dossier)
    .map(([k, v]) => [k, JSON.stringify(v)?.length || 0])
    .sort((a, b) => b[1] - a[1]),
);

const bannedInPrompt = FOCUS_AI_COACH_BANNED_USER_PHRASES
  .filter((r) => r.re && (r.re.test(userText) || r.re.test(systemText) || r.re.test(dossierJson)))
  .map((r) => ({
    id: r.id,
    label: r.label,
    inDossier: r.re.test(dossierJson),
    inUserPrompt: r.re.test(userText),
    inSystem: r.re.test(systemText),
  }));

const clientIeri = resolveFocusAiCoachTimeoutMs('ieri');
const budget = {
  offWaitMs: FOCUS_OFF_WAIT_TIMEOUT_MS,
  geminiAttemptMs: clientIeri,
  retryAttemptMs: clientIeri,
  totalIfSerialRetry: FOCUS_OFF_WAIT_TIMEOUT_MS + clientIeri + clientIeri,
  cfTimeoutMs: 120_000,
  fitsInCf: FOCUS_OFF_WAIT_TIMEOUT_MS + clientIeri + clientIeri <= 120_000,
  fitsInClientCap: FOCUS_OFF_WAIT_TIMEOUT_MS + clientIeri <= FOCUS_AI_COACH_TIMEOUT_MS_CAP,
};

console.log(JSON.stringify({
  ok: true,
  analysisDate: fx.analysisDate,
  periodId: 'ieri',
  timings: {
    dossierBuildMs: dossierMs,
  },
  sizes: {
    dossierChars: dossierJson.length,
    dossierEstTokens: Math.round(dossierJson.length / 4),
    userPromptChars: userText.length,
    userEstTokens: Math.round(userText.length / 4),
    systemChars: systemText.length,
    eventIdsCount: ids.length,
    eventIdMaxLen: Math.max(0, ...ids.map((x) => String(x).length)),
    eventIdSamples: ids.slice(0, 6),
    topDossierKeys: keySizes,
  },
  timeouts: {
    askAIDefaultMs: ASK_AI_TIMEOUT_MS,
    focusClient: { ...FOCUS_AI_COACH_TIMEOUT_MS, cap: FOCUS_AI_COACH_TIMEOUT_MS_CAP },
    resolvedIeriMs: clientIeri,
    resolvedSettimanaMs: resolveFocusAiCoachTimeoutMs('settimana'),
    resolvedMeseMs: resolveFocusAiCoachTimeoutMs('mese'),
    offWaitMs: FOCUS_OFF_WAIT_TIMEOUT_MS,
    callGeminiTimeoutSeconds: 120,
    httpsCallableNote: 'httpsCallable non abortabile; race client-side con timeoutMs passato ad askAI',
  },
  budgetRetryVsTimeouts: budget,
  bannedVocabularyLeakIntoPrompt: bannedInPrompt,
  notes: [
    'Lo script fixture non chiama Gemini: valida un draft locale — non misura timeout rete.',
    'meals (~49k) e micronutrients annidati dominano la dimensione del dossier inviato a Gemini.',
    'Parole vietate (episodio/traiettoria) sono dentro horizonBrief/editorialReadingContext del dossier JSON.',
  ],
}, null, 2));
