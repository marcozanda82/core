#!/usr/bin/env node
/**
 * Verifica parity comportamentale tra:
 * - functions/lib/geminiHttp.js (CJS, canonico per callGemini)
 * - src/.../geminiHttpCore.js (ESM twin Focus)
 * Non unifica i moduli (CJS/ESM); fallisce se diverge.
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_GEMINI_MODEL as esmDefault,
  GEMINI_API_BASE as esmBase,
  extractGeminiText as esmExtract,
  normalizeGenerationConfig as esmNorm,
  sanitizeGeminiModel as esmSanitize,
} from '../src/features/kentuFocus/server/gemini/geminiHttpCore.js';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cjs = require(path.join(root, 'functions/lib/geminiHttp.js'));

assert.equal(esmBase, cjs.GEMINI_API_BASE);
assert.equal(esmDefault, cjs.DEFAULT_GEMINI_MODEL);

const samples = [
  undefined,
  '',
  'gemini-3.8-flash',
  'bad model!',
  'ok_model-1.2',
];
for (const s of samples) {
  assert.equal(esmSanitize(s), cjs.sanitizeGeminiModel(s));
}

const configs = [
  {},
  { temperature: 0.7, maxOutputTokens: 100, topP: 0.9, topK: 40 },
  { max_output_tokens: 50, top_p: 0.5, top_k: 10, stop_sequences: ['END', ''] },
  { temperature: 'x', stopSequences: ['A'] },
];
for (const cfg of configs) {
  assert.deepEqual(esmNorm(cfg), cjs.normalizeGenerationConfig(cfg));
}

const payload = {
  candidates: [{ content: { parts: [{ text: 'hello' }, { inlineData: {} }] } }],
};
assert.equal(esmExtract(payload), cjs.extractGeminiText(payload));
assert.equal(esmExtract({}), cjs.extractGeminiText({}));

console.log('GEMINI_HTTP_PARITY_OK', {
  base: esmBase,
  defaultModel: esmDefault,
  note: 'twin aligned; callGemini uses CJS only',
});
