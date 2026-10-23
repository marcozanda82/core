/**
 * One-shot: deriva bundle JSON dalla revisione reale geminiRawResponse.txt
 * (non eseguito in CI; utile per rigenerare la fixture).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateFocusWrittenEdition } from '../../editorial/writing/validateFocusWrittenEdition.js';
import { detectMetricUnitMismatches } from '../../editorial/writing/focusMetricUnitGuard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../../../');
const clip = JSON.parse(fs.readFileSync(path.join(root, 'geminiRawResponse.txt'), 'utf8'));
const raw = JSON.parse(clip.geminiRawResponse);
const auth = Object.fromEntries(clip.authorizedArticles.map((a) => [a.role, a]));

function itemFromAuth(a, domain, refs) {
  return {
    id: a.id,
    role: a.role,
    tone: 'neutral',
    claimType: 'calculated',
    domain,
    topicId: a.topicId,
    editorialScale: a.editorialScale,
    storyKind: a.storyKind,
    headlineSeed: a.headlineSeed,
    summarySeed: a.summarySeed,
    evidenceFingerprint: a.evidenceFingerprint,
    observedPeriod: a.observedPeriod,
    metrics: a.metrics,
    limitations: a.limitations,
    doNotClaim: a.doNotClaim,
    evidenceQuality: 'high',
    refs,
  };
}

const lead = itemFromAuth(auth.lead, 'sleep', [
  'sleepRoutine.ordinary',
  'sleepRoutine.aggregate.reliability',
  'sleepRoutine.signals',
  ...auth.lead.metrics.map((m) => m.path),
]);

const centerMetrics = [
  ...auth.centerpiece.metrics,
  {
    path: 'edition.week.comparison.deltas.avgProteinG',
    value: -12.1,
    unit: 'g',
    provenance: 'calculated',
  },
];
const centerpiece = {
  ...itemFromAuth(auth.centerpiece, 'nutrition', [
    'edition.week.aggregate.nutrition',
    'edition.week.aggregate.sleep',
    'edition.week.aggregate.activity',
    ...centerMetrics.map((m) => m.path),
  ]),
  metrics: centerMetrics,
  limitations: [
    ...auth.centerpiece.limitations,
    'Lo scostamento proteico non è un deficit dimostrato',
  ],
  storySpine: {
    mainFactId: 'week_protein_intake_shift',
    mainMetricPath: 'edition.week.comparison.deltas.avgProteinG',
    mainMetricValue: -12.1,
    mainUnit: 'g',
    periodFrom: '2026-10-11',
    periodTo: '2026-10-17',
    comparisonFrom: '2026-10-04',
    comparisonTo: '2026-10-10',
    levelMetricPath: 'edition.week.nutrition.avgProteinG',
    levelMetricValue: 145.06,
    levelUnit: 'g',
    coverageMetricPath: 'edition.week.nutrition.daysWithFood',
    coverageMetricValue: 7,
    coverageUnit: 'days',
    essentialContextIds: [
      'equal_length_window_not_calendar_month',
    ],
  },
};
centerpiece.doNotClaim = [
  ...(centerpiece.doNotClaim || []),
  'deficit proteico',
  'peggioramento fisiologico',
];

const good = itemFromAuth(auth.good, 'nutrition', auth.good.metrics.map((m) => m.path));
const feature = itemFromAuth(
  auth.feature,
  'activity',
  auth.feature.metrics.map((m) => m.path),
);

const selection = {
  schemaVersion: '1.0.0',
  analysisDate: clip.dates.analysisDate,
  publicationDate: clip.dates.publicationDate,
  editionKind: clip.editionKind,
  openingMode: 'progress',
  lead,
  centerpiece,
  goodNews: [good],
  features: [feature],
  concerns: [],
  coach: null,
  omitted: [],
  editorialNotes: [],
  caps: {},
};

const rejected = {
  schemaVersion: raw.schemaVersion,
  kind: raw.kind,
  analysisDate: raw.analysisDate,
  publicationDate: raw.publicationDate,
  openingMode: raw.openingMode,
  articles: raw.articles,
  coach: raw.coach,
  mastheadTeaser: raw.mastheadTeaser,
};

const accepted = structuredClone(rejected);
accepted.articles[0].title = 'Sveglia stabile nei giorni feriali, ritmo diverso nel weekend';
accepted.articles[0].body = 'Nel periodo osservato il risveglio feriale ha mediana circa 6.5 h (IQR 0.5 h). '
  + 'Nel weekend la sveglia si sposta di circa 1 h, con variazione di durata stimata di 0.5 h. '
  + 'Fotografia di abitudini ordinarie, non indicatore clinico del riposo.';
accepted.articles[0].cautions = ['Nessuna diagnosi medica o presunzione di insonnia'];
accepted.articles[1].title = 'Proteine medie in calo di 12.1 g nella settimana';
// Descrittivo corretto: cita Δ esplicito, NON obbliga «non è un deficit»
accepted.articles[1].body = 'Nel periodo 2026-10-11→2026-10-17 la media proteica è 145.06 g al giorno, '
  + 'in calo di 12.1 g rispetto alla finestra equivalente 2026-10-04→2026-10-10 '
  + '(non un mese solare precedente). Sette giorni con cibo registrato in ciascuna finestra. '
  + 'Nessuna causalità tra domini senza evidenza dedicata.';
accepted.articles[1].metricsCited = [
  ...accepted.articles[1].metricsCited,
  {
    path: 'edition.week.comparison.deltas.avgProteinG',
    value: -12.1,
    unit: 'g',
    provenance: 'calculated',
  },
];
accepted.articles[1].evidenceIds = [
  'edition.week.aggregate.nutrition',
  'edition.week.nutrition.avgProteinG',
  'edition.week.comparison.deltas.avgProteinG',
];
accepted.articles[1].cautions = [
  'Il confronto si riferisce a una finestra di eguale durata immediatamente precedente, non a un mese solare',
  'Nessuna correlazione causale stabilita tra i diversi domini registrati',
];
accepted.articles[2].body = "Nella giornata di analisi l'introito proteico registrato ha raggiunto 136.8 g, "
  + 'a fronte del riferimento 127 g, senza pretese di valutazione metabolica.';
accepted.articles[3].title = 'Quattordici giorni con sessioni di forza negli ultimi trenta';
accepted.articles[3].body = 'Negli ultimi 30 giorni sono presenti 14 giorni con sessioni di forza registrate. '
  + "L'assenza di sessioni aerobiche etichettate non documenta sedentarietà o inattività.";

const vRej = validateFocusWrittenEdition(rejected, { selection });
const vAcc = validateFocusWrittenEdition(accepted, { selection });
console.log('REJECT', vRej.errors);
console.log('ACCEPT', vAcc.ok, vAcc.errors);
console.log(
  'unit',
  detectMetricUnitMismatches(feature, rejected.articles[3].title, rejected.articles[3].body),
);

const meta = {
  schemaSource: clip.schema,
  sourceFile: 'geminiRawResponse.txt',
  publicationDate: clip.dates.publicationDate,
  analysisDate: clip.dates.analysisDate,
  model: clip.model,
  callCount: clip.callCount,
  historicalValidationErrors: clip.validationErrors,
  note: 'Derivata dal JSON reale di revisione Gemini; minimizzata.',
};

fs.writeFileSync(
  path.join(here, '_sunday1810.bundle.json'),
  JSON.stringify({ meta, selection, rejected, accepted }, null, 2),
);

const fixtureJs = `/**
 * Fixture P6.6.2 — derivata dal JSON reale \`geminiRawResponse.txt\`
 * (kentu.focusGeminiPreview.v1). Minimizzata: selection + raw + controllo accettato.
 *
 * Selection: refs/storySpine/Δ allineati al compose attuale. Il clipboard reale
 * non esponeva edition.week.comparison.deltas.avgProteinG in metrics[] pur citando
 * Δ -12.1 nel summarySeed.
 */

export const FOCUS_GEMINI_RAW_SUNDAY_1810_META = Object.freeze(${JSON.stringify(meta, null, 2)});

export function buildSunday1810AuthorizedSelection() {
  return ${JSON.stringify(selection, null, 2)};
}

export function buildSunday1810RejectedRawEdition() {
  return ${JSON.stringify(rejected, null, 2)};
}

export function buildSunday1810AcceptedEdition() {
  return ${JSON.stringify(accepted, null, 2)};
}
`;
fs.writeFileSync(path.join(here, 'focusGeminiRawSunday1810.minimized.js'), fixtureJs);
console.log('wrote focusGeminiRawSunday1810.minimized.js');
