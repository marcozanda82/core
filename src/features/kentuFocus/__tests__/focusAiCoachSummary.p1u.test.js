/**
 * FASE C — summary + banned phrases sul fixture reale 2026-10-27.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import {
  resolveFocusPageSession,
  buildFocusAiCoachDossier,
  validateFocusAiCoachResponse,
  buildFocusAiCoachSystemInstruction,
  buildFocusAiCoachUserPrompt,
  FOCUS_AI_COACH_RESPONSE_SCHEMA,
  __resetFocusDiaryHandoffForTests,
} from '../product/index.js';
import { validateFocusAiCoachSummary } from '../product/validateFocusAiCoachResponse.js';
import { findBannedPhrasesInAnalysis } from '../product/focusAiCoachBannedUserPhrases.js';
import {
  FOCUS_REAL_OCT27_CATALOGS as CATALOGS,
  loadFocusDiaryRealOct27,
  buildRealOct27ReportJson,
} from './fixtures/focusDiaryRealOct27.js';

function buildSession() {
  const fx = loadFocusDiaryRealOct27();
  return resolveFocusPageSession({
    uid: 'uid_p1u_real',
    periodId: 'ieri',
    handoff: {
      uid: 'uid_p1u_real',
      fullHistory: fx.fullHistory,
      analysisDate: fx.analysisDate,
      publicationDate: fx.publicationDate,
      userTargets: fx.userTargets,
    },
  });
}

describe('Focus AI Coach summary P1u (fixture reale)', () => {
  beforeEach(() => {
    __resetFocusDiaryHandoffForTests();
  });

  it('schema e prompt: wentWell energia/qualità, todayAction↔toImprove, no meta', () => {
    assert.ok(FOCUS_AI_COACH_RESPONSE_SCHEMA.required.includes('summary'));
    const sys = buildFocusAiCoachSystemInstruction();
    assert.match(sys, /wentWell/i);
    assert.match(sys, /energia/i);
    assert.match(sys, /qualit/i);
    assert.match(sys, /toImproveIndex|stessa leva|UNA sola leva/i);
    assert.match(sys, /ultra-processato/i);
    assert.match(sys, /meta-frasi|NON affermando/i);
  });

  it('fixture reale: summary valida, toImprove su Duchessa + sonno, bans ok', () => {
    const built = buildFocusAiCoachDossier(buildSession(), { foodCatalogs: CATALOGS });
    assert.equal(built.ok, true);
    const dossier = built.dossier;
    assert.ok((dossier.nutrition.foodQuality.day.nova4Items || []).some((x) => /duchessa/i.test(x.name)));
    assert.equal(dossier.sleep.day.hours, 6.5);
    assert.ok((dossier.deterministicSignals.activeIds || []).includes('sleep_under_7h'));

    const report = buildRealOct27ReportJson(dossier);
    const userPrompt = buildFocusAiCoachUserPrompt(dossier);
    assert.match(userPrompt, /eventIndex/i);

    const validated = validateFocusAiCoachResponse(JSON.stringify(report), {
      dossier,
      requireSummary: true,
    });
    assert.equal(validated.ok, true, validated.reason);
    assert.equal(validated.analysis.schema, 'kentu.focusAiCoachAnalysis.v4');
    const improveBlob = validated.analysis.summary.toImprove.map((x) => x.text).join(' ');
    assert.match(improveBlob, /ultra-processato|duchessa|dessert/i);
    assert.match(improveBlob, /6,5|cena/i);
    const mealBed = (dossier.deterministicSignals.signals || [])
      .find((s) => s.id === 'meal_within_3h_of_bedtime');
    assert.equal(mealBed?.active, true);
    assert.equal(mealBed?.bedtimeProvenance, 'derived');
    // Giorno: digiuno lungo osservabile ma non in summary / activeIds
    assert.equal(
      (dossier.deterministicSignals.activeIds || []).includes('fasting_over_14h'),
      false,
    );
    const fasting = (dossier.deterministicSignals.signals || [])
      .find((s) => s.id === 'fasting_over_14h');
    assert.equal(fasting?.summaryEligible, false);
    assert.equal(fasting?.inactiveReason, 'day_report_excludes_fasting');
    assert.ok(
      (dossier.deterministicSignals.activeIds || []).includes('heavy_late_meal'),
    );
    assert.ok(dossier.nutrition.substitutionCandidates?.available !== undefined);
    const sleepImprove = validated.analysis.summary.toImprove.find((x) => x.area === 'sonno');
    assert.ok(sleepImprove?.eventRefs?.some((id) => String(id).startsWith('sleep:')));
    assert.ok(sleepImprove?.eventRefs?.some((id) => String(id).startsWith('food:')));
    assert.equal(Object.prototype.hasOwnProperty.call(validated.analysis, 'exercise'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(validated.analysis, 'theEmergingPicture'), false);
    // Stesso-occasione dolce (mela) oppure fallback generico — non mandorle/snack
    assert.match(validated.analysis.summary.todayAction.text, /mela|frutta fresca|yogurt/i);
    assert.equal(
      /mandorl/i.test(validated.analysis.summary.todayAction.text),
      false,
    );
    assert.equal(typeof validated.analysis.summary.todayAction.toImproveIndex, 'number');
    if (validated.analysis.lead) {
      assert.match(validated.analysis.lead, /\d/);
      assert.match(validated.analysis.lead, /kcal|target|media/i);
    }
    assert.ok(validated.analysis.claimLayers);
    assert.ok(Object.prototype.hasOwnProperty.call(validated.analysis, 'quantitativeProposal'));
    assert.equal(/nova\s*4/i.test(validated.analysis.summary.headline
      + validated.analysis.summary.toImprove.map((x) => x.text).join(' ')), false);
    assert.ok(validated.analysis.summary.wentWell.some((w) => w.area === 'energia'));
    assert.ok(validated.analysis.summary.wentWell.some((w) => w.area === 'qualita'));
    assert.ok((validated.analysis.limits || []).some((l) => /nessuna attività/i.test(l)));

    const banned = findBannedPhrasesInAnalysis(validated.analysis);
    assert.equal(banned.ok, true, JSON.stringify(banned.hits));
  });

  it('rifiuta frasi vietate nel testo utente', () => {
    const built = buildFocusAiCoachDossier(buildSession(), { foodCatalogs: CATALOGS });
    const report = buildRealOct27ReportJson(built.dossier);
    report.lead = 'Con 2369 kcal vs target questo episodio non è una traiettoria e non è una diagnosi.';
    const bad = validateFocusAiCoachResponse(JSON.stringify(report), {
      dossier: built.dossier,
      requireSummary: true,
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, 'banned_user_facing_phrase');
  });

  it('rifiuta NOVA in summary', () => {
    const built = buildFocusAiCoachDossier(buildSession(), { foodCatalogs: CATALOGS });
    const report = buildRealOct27ReportJson(built.dossier);
    report.summary.toImprove[0].text = 'A pranzo c’è un alimento NOVA 4.';
    const bad = validateFocusAiCoachResponse(JSON.stringify(report), {
      dossier: built.dossier,
      requireSummary: true,
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, 'banned_user_facing_phrase');
  });

  it('rifiuta todayAction ripetuta nelle sezioni', () => {
    const built = buildFocusAiCoachDossier(buildSession(), { foodCatalogs: CATALOGS });
    const report = buildRealOct27ReportJson(built.dossier);
    report.sections[0].body += ` ${report.summary.todayAction.text}`;
    const bad = validateFocusAiCoachResponse(JSON.stringify(report), {
      dossier: built.dossier,
      requireSummary: true,
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, 'todayAction_repeated_in_sections');
  });

  it('rifiuta orari diversi tra todayAction e recommendedAction', () => {
    const built = buildFocusAiCoachDossier(buildSession(), { foodCatalogs: CATALOGS });
    const report = buildRealOct27ReportJson(built.dossier);
    report.summary.todayAction = {
      text: 'Anticipa la cena alle 20:00 e alleggerisci la portata.',
      toImproveIndex: 0,
      eventRefs: [],
      area: 'ritmo',
    };
    report.recommendedAction = 'Anticipa la cena alle 20:30 e alleggerisci la portata.';
    report.summary.toImprove[0] = {
      text: 'Cena tardiva da alleggerire',
      area: 'ritmo',
      eventRefs: [],
    };
    const bad = validateFocusAiCoachResponse(JSON.stringify(report), {
      dossier: built.dossier,
      requireSummary: true,
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, 'action_quantity_mismatch');
  });

  it('soft-accept allinea recommendedAction dopo retry fallito', () => {
    const built = buildFocusAiCoachDossier(buildSession(), { foodCatalogs: CATALOGS });
    const report = buildRealOct27ReportJson(built.dossier);
    report.summary.todayAction = {
      text: 'Anticipa la cena alle 20:00 e alleggerisci la portata.',
      toImproveIndex: 0,
      eventRefs: [],
      area: 'ritmo',
    };
    report.recommendedAction = 'Anticipa la cena alle 20:30 e alleggerisci la portata.';
    report.summary.toImprove[0] = {
      text: 'Cena tardiva da alleggerire',
      area: 'ritmo',
      eventRefs: [],
    };
    const soft = validateFocusAiCoachResponse(JSON.stringify(report), {
      dossier: built.dossier,
      requireSummary: true,
      salvage: true,
    });
    assert.equal(soft.ok, true, soft.reason);
    assert.equal(soft.analysis.recommendedAction, report.summary.todayAction.text);
    assert.ok((soft.autoFixes || []).includes('recommendedAction_aligned_to_todayAction'));
  });

  it('rifiuta todayAction con alternative « o »', () => {
    const built = buildFocusAiCoachDossier(buildSession(), { foodCatalogs: CATALOGS });
    const report = buildRealOct27ReportJson(built.dossier);
    report.summary.todayAction = {
      ...report.summary.todayAction,
      text: 'Sostituisci il dessert con mela o yogurt.',
    };
    report.recommendedAction = report.summary.todayAction.text;
    const bad = validateFocusAiCoachResponse(JSON.stringify(report), {
      dossier: built.dossier,
      requireSummary: true,
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, 'todayAction_has_or_alternative');
  });

  it('rifiuta frasi vietate in limits e claimLayers', () => {
    const built = buildFocusAiCoachDossier(buildSession(), { foodCatalogs: CATALOGS });
    const report = buildRealOct27ReportJson(built.dossier);
    report.limits = ['Questo episodio non è una traiettoria.'];
    const bad = validateFocusAiCoachResponse(JSON.stringify(report), {
      dossier: built.dossier,
      requireSummary: true,
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, 'banned_user_facing_phrase');
  });

  it('allinea headline top-level a summary.headline', () => {
    const built = buildFocusAiCoachDossier(buildSession(), { foodCatalogs: CATALOGS });
    const report = buildRealOct27ReportJson(built.dossier);
    report.headline = 'Titolo diverso dal summary';
    const ok = validateFocusAiCoachResponse(JSON.stringify(report), {
      dossier: built.dossier,
      requireSummary: true,
    });
    assert.equal(ok.ok, true, ok.reason);
    assert.equal(ok.analysis.headline, report.summary.headline);
  });

  it('scarta eventRefs assenti', () => {
    const built = buildFocusAiCoachDossier(buildSession(), { foodCatalogs: CATALOGS });
    const report = buildRealOct27ReportJson(built.dossier);
    report.summary.toImprove[0].eventRefs = ['food:inesistente', ...(report.summary.toImprove[0].eventRefs || [])];
    const filtered = validateFocusAiCoachSummary(report, built.dossier);
    assert.equal(filtered.ok, true);
    assert.equal(filtered.summary.toImprove[0].eventRefs.includes('food:inesistente'), false);
  });

  it('esporta JSON rapporto fixture reale', () => {
    const built = buildFocusAiCoachDossier(buildSession(), { foodCatalogs: CATALOGS });
    const report = buildRealOct27ReportJson(built.dossier);
    const validated = validateFocusAiCoachResponse(JSON.stringify(report), {
      dossier: built.dossier,
      requireSummary: true,
    });
    assert.equal(validated.ok, true, validated.reason);
    const json = JSON.stringify(validated.analysis, null, 2);
    // eslint-disable-next-line no-console
    console.log('\n=== FIXTURE_REPORT_REAL_2026-10-27 ===\n' + json + '\n=== END ===\n');
  });
});
