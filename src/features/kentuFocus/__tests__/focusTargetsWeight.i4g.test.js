import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FOCUS_TARGET_WEIGHT_POLICY,
  resolveFocusBodyWeight,
  resolveFocusTargetsFromProfile,
} from '../server/reader/resolveFocusProfileData.js';

const ANALYSIS = '2026-10-16';

test('I4-G target: storia datata; override senza data non applicato; missing senza storia', () => {
  assert.ok(FOCUS_TARGET_WEIGHT_POLICY.targets.length >= 3);

  const hist = resolveFocusTargetsFromProfile({
    profile: { targetCalories: 3000, proteinTarget: 200 },
    targets: {
      kcal: 2500,
      prot: 180,
      targetHistory: [
        { effectiveDate: '2026-09-01', targets: { kcal: 2000, prot: 140 } },
        { effectiveDate: '2026-10-10', targets: { kcal: 2200, prot: 150 } },
        { effectiveDate: '2026-10-20', targets: { kcal: 2400, prot: 160 } }, // future
      ],
    },
  }, ANALYSIS);
  assert.equal(hist.targets.kcal, 2200);
  assert.equal(hist.targets.proteinG, 150);
  assert.equal(hist.provenance.referenceDate, '2026-10-10');
  assert.equal(hist.provenance.kcalSource, 'targets.targetHistory');
  assert.ok(hist.provenance.conflict?.includes('undated_profile.targetCalories_vs_historical'));

  const noHist = resolveFocusTargetsFromProfile({
    profile: { targetCalories: 2300, proteinTarget: 150 },
    targets: { kcal: 2300, prot: 150, targetHistory: [] },
  }, ANALYSIS);
  assert.equal(noHist.targets, null);
  assert.ok(noHist.diagnostics.reason.includes('no_dated'));

  const undatedHist = resolveFocusTargetsFromProfile({
    targets: {
      targetHistory: [{ targets: { kcal: 2000, prot: 140 } }], // no date
    },
  }, ANALYSIS);
  assert.equal(undatedHist.targets, null);
  assert.ok(undatedHist.provenance.conflict?.includes('targetHistory_undated_entries_skipped'));

  const zero = resolveFocusTargetsFromProfile({
    targets: {
      targetHistory: [{ effectiveDate: '2026-10-01', targets: { kcal: 0, prot: -1 } }],
    },
  }, ANALYSIS);
  assert.equal(zero.targets, null);

  const bad = resolveFocusTargetsFromProfile({
    targets: {
      targetHistory: [{ effectiveDate: '2026-10-01', targets: { kcal: 'x', prot: null } }],
    },
  }, ANALYSIS);
  assert.equal(bad.targets, null);
});

test('I4-G peso: sameDay vs lastAvailable; futuro ignorato; profile non attribuito', () => {
  const same = resolveFocusBodyWeight({
    a: { date: ANALYSIS, weight: 78.1, timestamp: 2 },
    b: { date: '2026-10-10', weight: 79, timestamp: 1 },
    fut: { date: '2026-10-20', weight: 77, timestamp: 3 },
  }, { weight: 90 }, ANALYSIS);
  assert.equal(same.bodyWeightKg, 78.1);
  assert.equal(same.attribution, 'recorded_on_analysis_date');
  assert.equal(same.bodyMeasuredOn, ANALYSIS);
  assert.equal(same.conflict, 'body_metrics_vs_profile.weight');

  const last = resolveFocusBodyWeight({
    b: { date: '2026-10-10', weight: 79.2 },
  }, null, ANALYSIS);
  assert.equal(last.attribution, 'last_available_on_or_before');
  assert.equal(last.bodyMeasuredOn, '2026-10-10');

  const onlyProfile = resolveFocusBodyWeight(null, { weight: 75 }, ANALYSIS);
  assert.equal(onlyProfile.bodyWeightKg, null);
  assert.equal(onlyProfile.attribution, 'profile_weight_not_attributed_to_day');
  assert.equal(onlyProfile.profileWeightKg, 75);

  const zero = resolveFocusBodyWeight({ x: { date: ANALYSIS, weight: 0 } }, null, ANALYSIS);
  assert.equal(zero.bodyWeightKg, null);
});
