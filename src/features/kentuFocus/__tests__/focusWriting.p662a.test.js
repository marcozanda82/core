/**
 * P6.6.2a — propagazione storySpine: candidato → selection → brief/prompt → validatore.
 * Offline; nessuna chiamata Gemini / Firebase.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import { attachEditionPerspective } from '../edition/attachEditionPerspective.js';
import { FOCUS_EDITION_KIND, FOCUS_EDITION_BENCH_PRESETS } from '../edition/editionCalendar.js';
import { WEEK_CENTERPIECE_TOPIC_ID } from '../editorial/composeWeekCenterpiece.js';
import { buildFocusAiBrief } from '../editorial/buildFocusAiBrief.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import {
  buildFocusEditorialPrompt,
  generateFocusWrittenEdition,
  validateFocusWrittenEdition,
} from '../editorial/writing/index.js';
import { FakeGeminiProvider } from '../server/gemini/focusGeminiAdapter.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';
import { buildFullDayFixture } from './fixtures/focusDayFixtures.js';

const PRESET = FOCUS_EDITION_BENCH_PRESETS.sunday_past;
const PUBLICATION = PRESET.publicationDate; // 2026-10-18
const ANALYSIS = '2026-10-17';

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

/**
 * Brief calibrati: settimana 11–17 media 145.06 g; 4–10 media 157.16 g → Δ −12.1.
 * Forza bassa (≤2 giorni/settimana) così vince protein_intake_shift, non densità forza.
 */
function briefForDate(date) {
  const sleepDate = addCalendarDays(date, 1);
  let prot = 140;
  if (date >= '2026-10-11' && date <= '2026-10-17') {
    // 6×145 + 145.42 = 1015.42 → media 145.06
    prot = date === '2026-10-17' ? 145.42 : 145;
  } else if (date >= '2026-10-04' && date <= '2026-10-10') {
    // 6×157 + 158.12 = 1100.12 → media 157.16
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

function buildSundayPastBriefs() {
  /** @type {object[]} */
  const out = [];
  let c = '2026-09-20';
  while (c <= ANALYSIS) {
    out.push(briefForDate(c));
    c = addCalendarDays(c, 1);
  }
  return out;
}

function buildSundayPastSelection() {
  const briefs = buildSundayPastBriefs();
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
  const selection = selectFocusEditorial({ dossier, memory: null });
  return { dossier, selection };
}

describe('P6.6.2a propagazione storySpine', () => {
  it('candidato → news → selectionForWriting → AiBrief → prompt (campi spine)', () => {
    const { selection } = buildSundayPastSelection();
    assert.ok(selection.centerpiece, 'centerpiece settimanale atteso');
    assert.equal(selection.centerpiece.topicId, WEEK_CENTERPIECE_TOPIC_ID);

    const spine = selection.centerpiece.storySpine;
    assert.ok(spine, 'storySpine deve sopravvivere a toNewsItem');
    assert.equal(spine.mainMetricPath, 'edition.week.comparison.deltas.avgProteinG');
    assert.equal(Number(spine.mainMetricValue), -12.1);
    assert.equal(spine.mainUnit, 'g');
    assert.equal(spine.levelMetricPath, 'edition.week.nutrition.avgProteinG');
    assert.equal(Number(spine.levelMetricValue), 145.06);
    assert.equal(spine.periodFrom, '2026-10-11');
    assert.equal(spine.periodTo, '2026-10-17');
    assert.equal(spine.comparisonFrom, '2026-10-04');
    assert.equal(spine.comparisonTo, '2026-10-10');
    assert.equal(Number(spine.coverageMetricValue), 7);

    const deltaMetric = (selection.centerpiece.metrics || []).find(
      (m) => m.path === 'edition.week.comparison.deltas.avgProteinG',
    );
    assert.ok(deltaMetric, 'Δ autorizzato nelle metrics del news item');
    assert.equal(Number(deltaMetric.value), -12.1);

    // selectionForWriting nel banco è la selection grezza
    const selectionForWriting = selection;
    assert.ok(selectionForWriting.centerpiece.storySpine);

    const aiBrief = buildFocusAiBrief({ selection: selectionForWriting, memory: null });
    const briefSpine = aiBrief.selection.centerpiece.storySpine;
    assert.ok(briefSpine);
    assert.equal(briefSpine.mainMetricValue, -12.1);
    assert.equal(briefSpine.levelMetricValue, 145.06);
    assert.equal(briefSpine.periodFrom, '2026-10-11');
    assert.equal(briefSpine.comparisonFrom, '2026-10-04');
    assert.equal(briefSpine.coverageMetricValue, 7);

    const prompt = buildFocusEditorialPrompt({ aiBrief });
    assert.match(prompt.userText, /storySpine/);
    assert.match(prompt.userText, /edition\.week\.comparison\.deltas\.avgProteinG/);
    assert.match(prompt.userText, /-12\.1/);
    assert.match(prompt.userText, /145\.06/);
    assert.match(prompt.userText, /2026-10-11/);
    assert.match(prompt.userText, /2026-10-04/);

    // Candidati senza spine restano senza campo (lead tipico)
    if (selection.lead) {
      assert.equal(selection.lead.storySpine, undefined);
    }
  });

  it('pipeline completa: testo senza Δ → main_story_fact_missing', async () => {
    const { selection: fullSel } = buildSundayPastSelection();
    assert.ok(fullSel.centerpiece?.storySpine);

    // Solo centerpiece: isola il controllo spine nella pipeline scrittura
    const selection = {
      ...fullSel,
      lead: null,
      goodNews: [],
      features: [],
      concerns: [],
      coach: null,
    };

    const rawEdition = {
      schemaVersion: '1.0.0',
      kind: 'FocusWrittenEdition',
      analysisDate: selection.analysisDate,
      publicationDate: selection.publicationDate,
      openingMode: selection.openingMode || 'progress',
      articles: [{
        id: selection.centerpiece.id,
        role: 'centerpiece',
        title: 'Abitudini settimanali: apporto proteico e quadro delle registrazioni',
        body: 'Nell\'arco della settimana conclusa il 17 ottobre, con 7 giorni di registrazioni '
          + 'alimentari, l\'apporto proteico medio si è posizionato a circa 145.06 grammi al giorno. '
          + 'Il confronto con la finestra precedente evidenzia uno scostamento verso il basso '
          + 'senza citare il valore numerico. Nessuna causalità tra domini senza evidenza dedicata. '
          + 'Il confronto non è un mese solare precedente.',
        evidenceIds: (selection.centerpiece.refs || []).slice(0, 4),
        metricsCited: (selection.centerpiece.metrics || []).filter(
          (m) => !/deltas/.test(m.path),
        ),
        cautions: [
          'Il confronto si riferisce a una finestra di eguale durata immediatamente precedente, non a un mese solare',
          'Nessuna correlazione causale stabilita tra i diversi domini registrati',
        ],
        selectionIndex: 0,
      }],
      coach: null,
      mastheadTeaser: 'Proteine in calo',
    };

    const provider = new FakeGeminiProvider({
      responses: [{ text: JSON.stringify(rawEdition) }],
    });

    const generated = await generateFocusWrittenEdition({
      selection,
      geminiProvider: provider,
    });
    assert.equal(generated.aiValidation?.ok, false);
    assert.ok(
      (generated.aiValidation?.errors || []).includes('main_story_fact_missing'),
      generated.aiValidation?.errors?.join(' | '),
    );

    const v = validateFocusWrittenEdition(rawEdition, { selection });
    assert.equal(v.ok, false);
    assert.ok(v.errors.includes('main_story_fact_missing'));
  });

  it('toNewsItem non inventa spine su candidati senza; non altera metrics/ruolo', () => {
    const { selection } = buildSundayPastSelection();
    assert.ok(selection.centerpiece.storySpine);
    const metricsBefore = JSON.stringify(selection.centerpiece.metrics);
    assert.equal(selection.centerpiece.role, 'centerpiece');
    assert.equal(selection.centerpiece.topicId, WEEK_CENTERPIECE_TOPIC_ID);
    // re-select same dossier path already stable; fingerprint presente
    assert.ok(selection.centerpiece.evidenceFingerprint);
    assert.equal(JSON.stringify(selection.centerpiece.metrics), metricsBefore);

    for (const item of [
      selection.lead,
      ...(selection.goodNews || []),
      ...(selection.features || []),
    ].filter(Boolean)) {
      if (item.topicId !== WEEK_CENTERPIECE_TOPIC_ID) {
        assert.equal(
          item.storySpine,
          undefined,
          `${item.id} non deve ricevere spine artificiale`,
        );
      }
    }
  });
});
