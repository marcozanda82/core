#!/usr/bin/env node
/**
 * Smoke Gemini live limitato (max 3 chiamate) — fixture sintetiche.
 * Non stampa chiavi API né prompt completi.
 *
 * Uso: GEMINI_API_KEY=... node scripts/focusGeminiLiveSmoke.mjs
 * Exit 0 se saltato (no key) o se le chiamate valide/fallback sono coerenti.
 */

import { buildFocusDossier } from '../src/features/kentuFocus/build/buildFocusDossier.js';
import { createEmptyEditorialMemory } from '../src/features/kentuFocus/editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../src/features/kentuFocus/editorial/selectFocusEditorial.js';
import { generateFocusWrittenEdition } from '../src/features/kentuFocus/editorial/writing/generateFocusWrittenEdition.js';
import { LiveGeminiProvider } from '../src/features/kentuFocus/server/gemini/focusGeminiAdapter.js';
import {
  buildFullDayFixture,
  buildMissingValuesFixture,
} from '../src/features/kentuFocus/__tests__/fixtures/focusDayFixtures.js';
import { buildHistoryBriefSeries } from '../src/features/kentuFocus/__tests__/fixtures/focusHistoryFixtures.js';

const keyPresent = Boolean(process.env.GEMINI_API_KEY && String(process.env.GEMINI_API_KEY).trim());
if (!keyPresent) {
  console.log('LIVE_SMOKE_SKIP reason=no_api_key');
  process.exit(0);
}

const provider = new LiveGeminiProvider({
  maxCalls: 3,
  maxRetries: 0,
  timeoutMs: 60_000,
  maxOutputTokens: 2048,
});

async function one(label, fixture, historyCount) {
  const dossier = buildFocusDossier({
    uid: 'live_synthetic',
    ...fixture,
    historyDayBriefs: historyCount > 0
      ? buildHistoryBriefSeries({ dayCount: historyCount })
      : [],
  });
  const selection = selectFocusEditorial({
    dossier,
    memory: createEmptyEditorialMemory(),
  });
  const out = await generateFocusWrittenEdition({
    selection,
    geminiProvider: provider,
  });
  console.log('LIVE_SMOKE_CASE', {
    label,
    diag: out.diag,
    usedFallback: out.usedFallback,
    proseSource: out.proseSource,
    articles: out.written.articles.length,
    calls: provider.calls,
  });
  return out;
}

const cases = [
  ['full_day', buildFullDayFixture(), 20],
  ['missing', buildMissingValuesFixture(), 0],
  ['full_day_2', buildFullDayFixture(), 14],
];

for (const [label, fixture, hist] of cases) {
  if (provider.calls >= 3) break;
  // eslint-disable-next-line no-await-in-loop
  await one(label, fixture, hist);
}

console.log('LIVE_SMOKE_DONE', { calls: provider.calls, keyConfigured: true });
process.exit(0);
