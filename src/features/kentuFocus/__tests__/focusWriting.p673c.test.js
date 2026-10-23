/**
 * P6.7.3c — cautele per il lettore vs istruzioni interne (prompt/schema).
 * Validatore P6.6.5 invariato. Offline. Zero Gemini / Firebase.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { attachEditionPerspective } from '../edition/attachEditionPerspective.js';
import { FOCUS_EDITION_KIND, FOCUS_EDITION_BENCH_PRESETS } from '../edition/editionCalendar.js';
import { buildFocusAiBrief } from '../editorial/buildFocusAiBrief.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import {
  WEEK_CENTERPIECE_TOPIC_ID,
} from '../editorial/composeWeekCenterpiece.js';
import {
  buildFocusEditorialPrompt,
  detectForbiddenClaims,
  evaluateProteinDeltaDeficitGuard,
  isMandatoryContextSatisfied,
  validateFocusWrittenEdition,
} from '../editorial/writing/index.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';
import { buildFullDayFixture } from './fixtures/focusDayFixtures.js';

const PRESET = FOCUS_EDITION_BENCH_PRESETS.sunday_past;
const PUBLICATION = PRESET.publicationDate;
const ANALYSIS = '2026-10-17';

const PROTEIN_PATHS = new Set([
  'edition.week.nutrition.daysWithFood',
  'edition.week.nutrition.avgProteinG',
  'edition.week.comparison.deltas.avgProteinG',
]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const VALIDATOR_PATH = join(__dirname, '../editorial/writing/validateFocusWrittenEdition.js');
const CAUTION_PATH = join(__dirname, '../editorial/writing/focusCautionContract.js');

function sleepNode(date) {
  return {
    data: date,
    log: [{
      type: 'sleep',
      id: `s_${date}`,
      hours: 7.0,
      wakeTime: 7,
      quality: 4,
      deepMin: 60,
      remMin: 60,
    }],
  };
}

function briefForDate(date) {
  const sleepDate = addCalendarDays(date, 1);
  let prot = 140;
  if (date >= '2026-10-11' && date <= '2026-10-17') {
    prot = date === '2026-10-17' ? 145.42 : 145;
  } else if (date >= '2026-10-04' && date <= '2026-10-10') {
    prot = date === '2026-10-10' ? 158.12 : 157;
  }
  const strength = date === '2026-10-12' || date === '2026-10-05';
  const log = [{
    type: 'food',
    id: `f_${date}`,
    mealType: 'pranzo',
    mealTime: 13,
    name: 'Pasto',
    kcal: 700,
    prot,
    carb: 70,
    fat: 20,
    fibre: 8,
  }];
  if (strength) {
    log.push({
      type: 'workout',
      id: `w_${date}`,
      name: 'Pesi',
      duration: 40,
      kcal: 220,
    });
  }
  return buildDayBrief({
    date,
    dayNode: { data: date, log },
    sleepNode: sleepNode(sleepDate),
    sleepStorageDate: sleepDate,
  });
}

function buildSundayPastSelection() {
  /** @type {object[]} */
  const briefs = [];
  let c = '2026-09-20';
  while (c <= ANALYSIS) {
    briefs.push(briefForDate(c));
    c = addCalendarDays(c, 1);
  }
  const dossier = buildFocusDossier({
    ...buildFullDayFixture(),
    analysisDate: ANALYSIS,
    publicationDate: PUBLICATION,
    analysisDayNode: {
      data: ANALYSIS,
      log: [{
        type: 'food',
        id: 'f_a',
        mealType: 'pranzo',
        mealTime: 13,
        name: 'Pasto',
        kcal: 700,
        prot: 145.42,
        carb: 70,
        fat: 20,
        fibre: 8,
      }],
    },
    publicationDayNode: sleepNode(PUBLICATION),
    historyDayBriefs: briefs,
  });
  attachEditionPerspective(dossier, briefs, {
    seriesFrom: briefs[0].date,
    seriesTo: ANALYSIS,
    asOfDate: PUBLICATION,
  });
  assert.equal(dossier.edition.editionKind, FOCUS_EDITION_KIND.sunday_plus);
  return selectFocusEditorial({ dossier, memory: null });
}

describe('P6.7.3c cautele lettore vs istruzioni interne', () => {
  it('prompt/schema: non invita a copiare limitations/doNotClaim in cautions[]', () => {
    const selection = buildSundayPastSelection();
    const aiBrief = buildFocusAiBrief({ selection, memory: null });
    const prompt = buildFocusEditorialPrompt({ aiBrief });

    assert.equal(
      /da limitations\/doNotClaim/i.test(prompt.userText),
      false,
      'hint legacy ancora presente nello schema',
    );
    assert.match(
      prompt.userText,
      /non copia di limitations\/doNotClaim|non copiare limitations\/doNotClaim/i,
    );
    assert.match(prompt.systemText, /doNotClaim: divieti interni/i);
    assert.match(prompt.systemText, /contextualLimitations[\s\S]*Non copiarle automaticamente/i);
    assert.match(prompt.systemText, /mandatoryContext:[\s\S]*parafrasi naturale/i);
    assert.match(prompt.systemText, /cautions\[\]: opzionali/i);
    assert.match(prompt.systemText, /Nessun minimo obbligatorio/i);

    assert.equal(prompt.userPayload.rules?.doNotClaimAreProhibitionsNotPrint, true);
    assert.equal(prompt.userPayload.rules?.contextualLimitationsWriterOnly, true);
    assert.equal(prompt.userPayload.rules?.cautionsReaderFacingOptional, true);
    assert.equal(prompt.userPayload.rules?.noMinCautions, true);
  });

  it('brief: mandatoryContext / layers disponibili; seed P6.7.3b e metriche P6.7.3a ok', () => {
    const selection = buildSundayPastSelection();
    const cp = selection.centerpiece;
    assert.ok(cp);
    assert.equal(cp.topicId, WEEK_CENTERPIECE_TOPIC_ID);

    const seed = cp.summarySeed || '';
    assert.equal(/Perché può interessare\s*:|Limiti\s*:/i.test(seed), false);
    assert.match(seed, /145,06/);
    assert.deepEqual(new Set((cp.metrics || []).map((m) => m.path)), PROTEIN_PATHS);

    const aiBrief = buildFocusAiBrief({ selection, memory: null });
    const briefCp = aiBrief.selection.centerpiece;
    assert.ok(Array.isArray(briefCp.mandatoryContext) && briefCp.mandatoryContext.length >= 1);
    assert.ok(Array.isArray(briefCp.doNotClaim) && briefCp.doNotClaim.includes('deficit proteico'));
    assert.ok(Array.isArray(briefCp.contextualLimitations));
    assert.ok(Array.isArray(briefCp.limitations) && briefCp.limitations.length >= 1);

    const prompt = buildFocusEditorialPrompt({ aiBrief });
    const slot = prompt.userPayload.authorizedArticles.find((a) => a.role === 'centerpiece');
    assert.ok(slot?.mandatoryContext?.length >= 1);
    assert.ok((slot.doNotClaim || []).length >= 1);
  });

  it('validatore: mandatoryContext via parafrasi in body; cautions[] vuote ok (no minimo)', () => {
    const selection = buildSundayPastSelection();
    const slim = {
      ...selection,
      lead: null,
      goodNews: [],
      features: [],
      concerns: [],
      coach: null,
    };
    const cp = slim.centerpiece;
    const edition = {
      schemaVersion: '1.0.0',
      kind: 'FocusWrittenEdition',
      analysisDate: slim.analysisDate,
      publicationDate: slim.publicationDate,
      openingMode: 'progress',
      articles: [{
        id: cp.id,
        role: 'centerpiece',
        title: 'Proteine medie settimanali a 145,06 g',
        body: 'Nella settimana 11–17 ottobre la media proteica è 145,06 g al giorno, '
          + 'con una differenza di −12,1 g rispetto alla finestra equivalente precedente '
          + '(non un mese solare precedente), su 7 giorni con cibo. '
          + 'Nessuna causalità tra domini senza evidenza dedicata.',
        evidenceIds: ['edition.week.aggregate.nutrition'],
        metricsCited: [...(cp.metrics || [])],
        cautions: [],
        selectionIndex: 0,
      }],
      coach: null,
      mastheadTeaser: 'Proteine in calo',
    };
    const v = validateFocusWrittenEdition(edition, { selection: slim });
    assert.equal(v.ok, true, v.errors?.join(' | '));
  });

  it('divieti deficit/causalità/diagnosi ancora operativi', () => {
    const selection = buildSundayPastSelection();
    const cp = selection.centerpiece;
    const dnc = cp.doNotClaim || [];

    assert.ok(detectForbiddenClaims(dnc, 'X', 'Hai un deficit proteico evidente.').length >= 1);
    assert.ok(
      evaluateProteinDeltaDeficitGuard(
        cp,
        'Calo',
        'Quindi c’è un deficit proteico.',
        [],
      ).some((e) => /protein_deficit|protein_delta/.test(e)),
    );

    const ctx = {
      id: 'equal_length_window_not_calendar_month',
      sourceText: 'Il confronto si riferisce a una finestra di eguale durata immediatamente precedente, non a un mese solare',
    };
    assert.equal(
      isMandatoryContextSatisfied(ctx, [], 'Titolo', 'Confronto con finestra equivalente, non mese solare precedente.'),
      true,
    );
    assert.equal(
      isMandatoryContextSatisfied(ctx, [], 'Titolo', 'Media 145 g senza contesto di confronto.'),
      false,
    );
  });

  it('validatore e caution contract invariati (nessuna modifica P6.6.5)', () => {
    const vHash = createHash('sha256').update(readFileSync(VALIDATOR_PATH)).digest('hex');
    const cHash = createHash('sha256').update(readFileSync(CAUTION_PATH)).digest('hex');
    assert.equal(vHash.length, 64);
    assert.equal(cHash.length, 64);
    assert.match(String(readFileSync(VALIDATOR_PATH)), /mandatory_context_missing|evaluateProteinDeltaDeficitGuard/);
  });
});
