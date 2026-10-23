/**
 * P6.6.3a — istruzioni di scrittura nel prompt (offline).
 * Validatore / selezione invariati; verifica propagazione via pipeline P6.6.2a.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildFocusAiBrief } from '../editorial/buildFocusAiBrief.js';
import { buildFocusEditorialPrompt } from '../editorial/writing/buildFocusEditorialPrompt.js';
import { validateFocusWrittenEdition } from '../editorial/writing/index.js';
import {
  buildSunday1810AuthorizedSelection,
  buildSunday1810RejectedRawEdition,
} from './fixtures/focusGeminiRawSunday1810.minimized.js';
import {
  buildSunday1810V2AuthorizedSelection,
  buildSunday1810V2RejectedRawEdition,
} from './fixtures/focusGeminiRawSunday1810.v2.minimized.js';

describe('P6.6.3a prompt — chiarimenti di scrittura', () => {
  it('systemText e userText includono fedeltà unità, centerpiece/spine, anti-sovrainferenza', () => {
    const selection = buildSunday1810V2AuthorizedSelection();
    assert.ok(selection.centerpiece?.storySpine);

    const aiBrief = buildFocusAiBrief({ selection, memory: null });
    const prompt = buildFocusEditorialPrompt({ aiBrief });

    assert.match(prompt.systemText, /giorni in sessioni|giorni≠sessioni|N giorni con sessioni/i);
    assert.match(prompt.systemText, /titolo e corpo separatamente/i);
    assert.match(prompt.systemText, /storySpine/i);
    assert.match(prompt.systemText, /non vanno inserite «per completezza»|non necessarie|per completezza/i);
    assert.match(prompt.systemText, /frequenza costante/i);
    assert.match(prompt.systemText, /distribuzione temporale uniforme/i);
    assert.match(prompt.systemText, /nessun.*nesso causale|Mai inventare nessi causali/i);
    assert.match(prompt.systemText, /Non suggerire titoli obbligatori/i);

    assert.match(prompt.userText, /storySpine/);
    assert.match(prompt.userText, /Titoli: unità fedeli/);
    assert.match(prompt.userText, /centerpieceFollowsStorySpine/);
    assert.match(prompt.userText, /noOverInferenceFromCounts/);
    assert.equal(prompt.userPayload.rules.centerpieceFollowsStorySpine, true);
    assert.equal(prompt.userPayload.rules.titleAndBodyUnitFidelity, true);
  });

  it('pipeline P6.6.2a: spine domenicale ancora nel prompt dopo i chiarimenti', () => {
    const selection = buildSunday1810V2AuthorizedSelection();
    const aiBrief = buildFocusAiBrief({ selection, memory: null });
    const prompt = buildFocusEditorialPrompt({ aiBrief });
    assert.match(prompt.userText, /edition\.week\.comparison\.deltas\.avgProteinG/);
    assert.match(prompt.userText, /-12\.1/);
    assert.match(prompt.userText, /145\.06/);
  });
});

describe('P6.6.3a audit raw reali — validatore invariato', () => {
  it('raw 19/10: ancora main_story_fact_missing + metric_unit_mismatch (no deficit false positive)', () => {
    const selection = buildSunday1810AuthorizedSelection();
    const raw = buildSunday1810RejectedRawEdition();
    const v = validateFocusWrittenEdition(raw, { selection });
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('main_story_fact_missing'));
    assert.ok(v.errors.includes('metric_unit_mismatch'));
  });

  it('raw 20/10: resta solo metric_unit_mismatch (titolo sessioni)', () => {
    const selection = buildSunday1810V2AuthorizedSelection();
    const raw = buildSunday1810V2RejectedRawEdition();
    const v = validateFocusWrittenEdition(raw, { selection });
    assert.equal(v.ok, false);
    assert.deepEqual(
      v.errors.filter((e) => e === 'metric_unit_mismatch'
        || e.includes('protein_delta')
        || e.includes('unauthorized_number')),
      ['metric_unit_mismatch'],
    );
  });
});
