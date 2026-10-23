/**
 * P6.4 — qualità selezione: peso fresco, proteine, banali, lead pattern, forza.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDayBrief } from '../aggregate/buildDayBrief.js';
import { buildFocusDossier } from '../build/buildFocusDossier.js';
import {
  classifyBodyWeightFreshness,
  extractFocusSignals,
  proteinTargetLabel,
} from '../editorial/extractFocusSignals.js';
import { selectFocusEditorial } from '../editorial/selectFocusEditorial.js';
import { FOCUS_STORY_CLASS } from '../editorial/focusEditorialConfig.js';
import { addCalendarDays, wakeSegmentFromDate } from '../normalize/focusDateUtils.js';
import {
  ANALYSIS_DATE,
  PUBLICATION_DATE,
  buildFullDayFixture,
} from './fixtures/focusDayFixtures.js';

function sleepNode(date, overrides = {}) {
  const seg = wakeSegmentFromDate(date);
  return {
    data: date,
    log: [{
      type: 'sleep',
      id: `s_${date}`,
      hours: seg === 'weekend' ? 8.5 : 7.2,
      wakeTime: seg === 'weekend' ? 9 : 7,
      quality: 4,
      deepMin: 60,
      remMin: 60,
      ...overrides,
    }],
  };
}

function buildRhythmBriefs(dayCount = 21) {
  /** @type {object[]} */
  const briefs = [];
  for (let i = dayCount - 1; i >= 0; i -= 1) {
    const date = addCalendarDays(ANALYSIS_DATE, -i);
    const sleepDate = addCalendarDays(date, 1);
    briefs.push(buildDayBrief({
      date,
      dayNode: {
        data: date,
        log: [
          {
            type: 'food',
            id: `f_${date}`,
            mealType: 'pranzo',
            mealTime: 13,
            name: 'Pasto',
            kcal: 700,
            prot: 55,
            carb: 60,
            fat: 20,
            fibre: 8,
          },
          {
            type: 'workout',
            id: `w_${date}`,
            name: 'Pesi full body',
            duration: 45,
            kcal: 250,
          },
        ],
      },
      sleepNode: sleepNode(sleepDate),
      sleepStorageDate: sleepDate,
      bodyWeightKg: date === ANALYSIS_DATE ? 78 : null,
    }));
  }
  return briefs;
}

describe('P6.4 body weight freshness', () => {
  it('classifica new / last_available / stale', () => {
    assert.equal(classifyBodyWeightFreshness('2026-10-16', '2026-10-16'), 'new_measurement');
    assert.equal(classifyBodyWeightFreshness('2026-10-15', '2026-10-16'), 'last_available');
    assert.equal(classifyBodyWeightFreshness('2026-08-03', '2026-10-16'), 'stale');
  });

  it('non genera body_weight_logged per misura stale o last_available', () => {
    const stale = buildFocusDossier({
      ...buildFullDayFixture(),
      bodyWeightKg: 80,
      bodyMeasuredOn: '2026-08-03',
      historyDayBriefs: buildRhythmBriefs(14),
    });
    assert.equal(
      extractFocusSignals(stale, null).some((s) => s.topicId === 'body_weight_logged'),
      false,
    );

    const last = buildFocusDossier({
      ...buildFullDayFixture(),
      bodyWeightKg: 78.4,
      bodyMeasuredOn: '2026-10-15',
      historyDayBriefs: buildRhythmBriefs(14),
    });
    assert.equal(
      extractFocusSignals(last, null).some((s) => s.topicId === 'body_weight_logged'),
      false,
    );

    const fresh = buildFocusDossier({
      ...buildFullDayFixture(),
      bodyWeightKg: 78.1,
      bodyMeasuredOn: ANALYSIS_DATE,
      historyDayBriefs: buildRhythmBriefs(14),
    });
    const sig = extractFocusSignals(fresh, null).find((s) => s.topicId === 'body_weight_logged');
    assert.ok(sig);
    assert.match(sig.headlineSeed, /Nuova misurazione/i);
  });
});

describe('P6.4 protein labels', () => {
  it('distingue vicino / in linea / oltre senza trattare il surplus come problema', () => {
    assert.equal(proteinTargetLabel(0.92).headline.includes('vicine'), true);
    assert.equal(proteinTargetLabel(1.005).headline.includes('in linea'), true);
    assert.equal(proteinTargetLabel(1.25).typology, 'target_above');
    assert.equal(proteinTargetLabel(1.25).tone, 'neutral');
    // 150.8/127 ≈ 1.187 non è «in linea»
    assert.equal(proteinTargetLabel(150.8 / 127).typology, 'target_above');
    assert.match(proteinTargetLabel(150.8 / 127).headline, /oltre/i);
  });
});

describe('P6.4 banali vs storie significative', () => {
  it('routine_log non finiscono in good/lead; sleep_weekly può aprire', () => {
    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      bodyWeightKg: 78,
      bodyMeasuredOn: '2026-08-03',
      historyDayBriefs: buildRhythmBriefs(21),
    });
    const signals = extractFocusSignals(dossier, null);
    const sleepAdeq = signals.find((s) => s.topicId === 'sleep_hours_adequate');
    const workout = signals.find((s) => s.topicId === 'workout_logged');
    const rhythm = signals.find((s) => s.topicId === 'sleep_weekly_rhythm');
    assert.equal(sleepAdeq?.storyClass, FOCUS_STORY_CLASS.routine_log);
    assert.equal(workout?.storyClass, FOCUS_STORY_CLASS.routine_log);
    assert.ok(rhythm);
    assert.equal(rhythm.storyClass, FOCUS_STORY_CLASS.significant_pattern);

    const selection = selectFocusEditorial({ dossier, memory: null });
    assert.ok(selection.continuity);
    assert.equal(
      selection.goodNews.some((n) => n.topicId === 'sleep_hours_adequate'),
      false,
    );
    assert.equal(
      selection.goodNews.some((n) => n.topicId === 'workout_logged'),
      false,
    );
    // P6.7.2a: con memory null e senza significantChange, lead sonno non è automatico.
    // Proteine conferma non devono rubare l’apertura.
    assert.equal(selection.lead?.topicId === 'protein_near_target', false);
    assert.equal(selection.lead?.topicId === 'documentation_complete', false);
    if (selection.lead?.topicId === 'sleep_weekly_rhythm') {
      assert.equal(Boolean(rhythm.significantChange), true);
    }
  });

  it('emette strength_continuity_d30 senza inferire inattività aerobica', () => {
    const dossier = buildFocusDossier({
      ...buildFullDayFixture(),
      historyDayBriefs: buildRhythmBriefs(30),
    });
    assert.ok((dossier.history.d30.activity.strengthDaysLogged || 0) >= 6);
    const sig = extractFocusSignals(dossier, null).find(
      (s) => s.topicId === 'strength_continuity_d30',
    );
    assert.ok(sig);
    assert.ok(sig.doNotClaim.some((d) => /inattività|sedentar/i.test(d)));
    assert.match(sig.summarySeed, /non implica inattività/i);
  });
});
