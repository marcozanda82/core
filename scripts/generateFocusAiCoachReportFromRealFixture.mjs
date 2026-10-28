#!/usr/bin/env node
/**
 * Genera (senza rete) il rapporto AI Coach v4 sul fixture reale 2026-10-27
 * e lo stampa su stdout. Utile in dev per ispezionare il JSON validato.
 *
 *   node scripts/generateFocusAiCoachReportFromRealFixture.mjs
 */

import {
  resolveFocusPageSession,
  buildFocusAiCoachDossier,
  validateFocusAiCoachResponse,
  __resetFocusDiaryHandoffForTests,
} from '../src/features/kentuFocus/product/index.js';
import {
  FOCUS_REAL_OCT27_CATALOGS,
  loadFocusDiaryRealOct27,
  buildRealOct27ReportJson,
} from '../src/features/kentuFocus/__tests__/fixtures/focusDiaryRealOct27.js';

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
const built = buildFocusAiCoachDossier(session, { foodCatalogs: FOCUS_REAL_OCT27_CATALOGS });
if (!built.ok) {
  console.error(JSON.stringify({ ok: false, reason: built.reason }, null, 2));
  process.exit(1);
}
const draft = buildRealOct27ReportJson(built.dossier);
const validated = validateFocusAiCoachResponse(JSON.stringify(draft), {
  dossier: built.dossier,
  requireSummary: true,
});
if (!validated.ok) {
  console.error(JSON.stringify({
    ok: false,
    reason: validated.reason,
    bannedHits: validated.bannedHits || null,
  }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(validated.analysis, null, 2));
