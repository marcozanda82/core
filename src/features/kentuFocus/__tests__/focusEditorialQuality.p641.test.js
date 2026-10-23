/**
 * P6.4.1 — rifinitura: proteine/target, frequenza cibo, ipotesi low.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFoodFrequency,
  classifyFoodFrequencyHabit,
} from '../aggregate/foodFrequency.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import {
  extractFocusSignals,
  proteinTargetLabel,
} from '../editorial/extractFocusSignals.js';
import { selectFocusCoach } from '../editorial/focusCoachCatalog.js';
import {
  applyEditorialMemoryAfterPublish,
  createEmptyEditorialMemory,
} from '../editorial/focusEditorialMemory.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import { resolveFocusTargetsFromProfile } from '../server/reader/resolveFocusProfileData.js';
import { addCalendarDays } from '../normalize/focusDateUtils.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
} from './fixtures/focusDayFixtures.js';
import { buildHistoryBriefSeries } from './fixtures/focusHistoryFixtures.js';

describe('P6.4.1 protein target labels', () => {
  it('150.8/127 non produce «in linea»', () => {
    const ratio = 150.8 / 127;
    assert.ok(ratio > 1.08 && ratio < 1.2);
    const label = proteinTargetLabel(ratio);
    assert.equal(label.typology, 'target_above');
    assert.equal(label.tone, 'neutral');
    assert.match(label.headline, /oltre il riferimento proteico/i);
    assert.equal(/in linea/i.test(label.headline), false);
  });

  it('usa target storico datato (127), non proteinTarget profilo non datato (150)', () => {
    const pack = resolveFocusTargetsFromProfile({
      profile: { proteinTarget: 150, targetCalories: 2300 },
      targets: {
        targetHistory: [
          { effectiveDate: '2026-01-01', targets: { prot: 127, kcal: 2100 } },
        ],
      },
    }, ANALYSIS_DATE);
    assert.equal(pack.targets.proteinG, 127);
    assert.equal(pack.provenance.proteinSource, 'targets.targetHistory');
    assert.equal(pack.provenance.referenceDate, '2026-01-01');
    assert.ok(
      (pack.provenance.conflict || []).includes('undated_profile.proteinTarget_vs_historical'),
    );

    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      targets: pack.targets,
      targetMeta: {
        referenceDate: pack.provenance.referenceDate,
        proteinSource: pack.provenance.proteinSource,
        kcalSource: pack.provenance.kcalSource,
      },
      analysisDayNode: {
        data: ANALYSIS_DATE,
        log: [{
          type: 'food',
          id: 'f1',
          mealType: 'pranzo',
          mealTime: 13,
          name: 'Pasto',
          kcal: 900,
          prot: 150.8,
          carb: 80,
          fat: 30,
          fibre: 10,
        }],
      },
    });
    assert.equal(dossier.day.nutrition.targets.proteinG.value, 127);
    assert.equal(dossier.day.nutrition.targets.proteinG.source, 'targets.targetHistory');
    assert.equal(dossier.day.nutrition.targets.proteinG.measuredOn, '2026-01-01');

    const sig = extractFocusSignals(dossier, null).find((s) => s.topicId === 'protein_near_target');
    assert.ok(sig);
    assert.match(sig.headlineSeed, /oltre il riferimento proteico/i);
    assert.match(sig.summarySeed, /127/);
    assert.match(sig.summarySeed, /targetHistory|valido al 2026-01-01/);
    assert.equal(sig.typology, 'target_above');
    assert.equal(sig.publishable, false);
    assert.equal(sig.omitReason, 'ordinary_above_target_not_newsworthy');
    const selection = selectFocusEditorial({ dossier, memory: null });
    assert.equal(
      (selection.goodNews || []).some((g) => g.topicId === 'protein_near_target'),
      false,
    );
  });
});

describe('P6.4.1 food frequency window + no false emerging', () => {
  it('conteggi e windowDays coerenti; non chiama emergente; non vira feature', () => {
    /** @type {object[]} */
    const items = [];
    for (let i = 0; i < 26; i += 1) {
      const date = addCalendarDays('2026-09-20', i);
      items.push({
        foodDbKey: 'pane integrale con semi e noci',
        name: 'Pane integrale con semi e noci',
        type: 'food',
        date,
      });
      if (i % 2 === 0) {
        items.push({
          foodDbKey: 'pane integrale con semi e noci',
          name: 'Pane integrale con semi e noci',
          type: 'food',
          date,
        });
      }
    }
    const freq = buildFoodFrequency(items);
    assert.equal(freq.windowDays, 26);
    assert.ok(freq.windowDays !== 7);
    const pane = freq.items.find((i) => i.key.includes('pane'));
    assert.ok(pane);
    assert.equal(pane.distinctDays, 26);
    assert.ok(pane.occasions >= 26);
    assert.equal(classifyFoodFrequencyHabit(pane, freq.windowDays), 'consolidated');

    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      historyDayBriefs: buildHistoryBriefSeries({ dayCount: 30 }).map((b, idx) => ({
        ...b,
        foodItems: [
          ...(b.foodItems || []),
          {
            foodDbKey: 'pane integrale con semi e noci',
            name: 'Pane integrale',
            type: 'food',
            date: b.date,
          },
          ...(idx % 2 === 0
            ? [{
              foodDbKey: 'pane integrale con semi e noci',
              name: 'Pane integrale',
              type: 'food',
              date: b.date,
            }]
            : []),
        ],
      })),
    });
    assert.ok(dossier.habits.foodFrequency.windowDays >= 21);
    const sig = extractFocusSignals(dossier, null).find(
      (s) => String(s.topicId).includes('pane'),
    );
    assert.ok(sig);
    assert.equal(sig.coverage.windowDays, dossier.habits.foodFrequency.windowDays);
    assert.equal(sig.coverage.habitClass, 'consolidated');
    assert.match(sig.headlineSeed, /consolidata/i);
    assert.equal(/emergente/i.test(sig.headlineSeed), false);
    assert.equal(sig.publishable, false);

    const selection = selectFocusEditorial({ dossier, memory: null });
    assert.equal(
      selection.features.some((f) => String(f.topicId).includes('habit_food')),
      false,
    );
    assert.ok(
      selection.omitted.some((o) => o.reason === 'descriptive_habit_no_novelty'
        && String(o.candidateId).includes('habit_food')),
    );
  });
});

describe('P6.4.1 weak hypothesis + coach + variable length', () => {
  it('dinner_sleep_buffer_short low non riempie feature; nessun EARLIER_DINNER', () => {
    const fixture = buildFullDayFixture();
    fixture.analysisDayNode.log = fixture.analysisDayNode.log.map((e) => (
      e.mealType === 'cena' ? { ...e, mealTime: 22.8 } : e
    ));
    const dossier = buildFocusDossier({
      ...fixture,
      historyDayBriefs: buildHistoryBriefSeries({ dayCount: 14 }),
    });
    assert.ok(
      (dossier.sleep.dinnerSleepBufferH?.value ?? 99) < 2.5,
    );
    const selection = selectFocusEditorial({ dossier, memory: null });
    assert.equal(
      selection.features.some((f) => f.topicId === 'dinner_sleep_buffer_short'),
      false,
    );
    assert.ok(
      selection.omitted.some((o) => o.candidateId === 'sig_dinner_sleep_buffer_short'
        && o.reason === 'insufficient_evidence'),
    );
    const dinnerOmits = selection.omitted.filter(
      (o) => o.candidateId === 'sig_dinner_sleep_buffer_short',
    );
    assert.equal(dinnerOmits.length, 1, 'omitted senza duplicati dello stesso candidato');

    const coach = selectFocusCoach(dossier, selection.features, null, PUBLICATION_DATE);
    assert.notEqual(coach?.templateId, 'EARLIER_DINNER');
  });

  it('edizione a lunghezza variabile + memoria seconda selezione', () => {
    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      historyDayBriefs: buildHistoryBriefSeries({ dayCount: 21 }),
    });
    const first = selectFocusEditorial({ dossier, memory: null });
    assert.ok(first.features.length <= 2);
    // Meno approfondimenti ammessi: features può essere 0..2
    assert.ok(Array.isArray(first.features));

    let memory = applyEditorialMemoryAfterPublish(createEmptyEditorialMemory(), {
      publicationDate: PUBLICATION_DATE,
      revision: 1,
      selection: first,
    });
    const second = selectFocusEditorial({ dossier, memory });
    if (first.lead?.topicId === 'sleep_weekly_rhythm') {
      assert.notEqual(second.lead?.topicId, 'sleep_weekly_rhythm');
    }
    assert.equal(
      second.features.some((f) => f.topicId === 'dinner_sleep_buffer_short'),
      false,
    );
    const ids = second.omitted.map((o) => o.candidateId);
    assert.equal(ids.length, new Set(ids).size, 'omitted senza duplicati');
  });
});
