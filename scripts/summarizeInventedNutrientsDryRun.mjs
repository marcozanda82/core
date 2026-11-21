/**
 * Riepilogo dry-run F: cluster inventati (target/4) ad alta confidenza.
 *   node scripts/summarizeInventedNutrientsDryRun.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('./tmp-invented-nutrients-dryrun.json', 'utf8'));

/** Firma tipica del fill TARGETS/4 (stesso pacchetto visto su uovo/merluzzo/passata). */
const CLASSIC = new Set([
  'fibre', 'fibreTotali',
  'vitB1', 'vitB2', 'vitB3', 'vitB5', 'vitB6', 'b2', 'b6',
  'se', 'colest',
]);

function classicCount(invented) {
  return invented.filter((x) => CLASSIC.has(x.key)).length;
}

const dbHigh = data.personalDbHits.filter((h) => classicCount(h.invented) >= 3);
const diaryHigh = data.diaryHits.filter((h) => classicCount(h.invented) >= 3);

const nutrientUnion = {};
for (const h of dbHigh) {
  for (const x of h.invented) {
    nutrientUnion[x.key] = nutrientUnion[x.key] || { quarter: x.quarter, dbRows: 0, diaryItems: 0 };
    nutrientUnion[x.key].dbRows += 1;
  }
}
for (const h of diaryHigh) {
  for (const x of h.invented) {
    nutrientUnion[x.key] = nutrientUnion[x.key] || { quarter: x.quarter, dbRows: 0, diaryItems: 0 };
    nutrientUnion[x.key].diaryItems += 1;
  }
}

const summary = {
  note: 'Dry-run: valori = TARGETS/4 (o DEFAULT/4). Alta confidenza = ≥3 del pacchetto classico fibre+B-vit+se+colest.',
  quarters: data.quarters,
  nutrientsAffected: Object.keys(nutrientUnion).sort(),
  nutrientCounts: nutrientUnion,
  personalDb: {
    highConfidenceRows: dbHigh.length,
    keys: dbHigh.map((h) => h.foodKey),
    sample: dbHigh.slice(0, 20).map((h) => ({
      key: h.foodKey,
      name: h.name,
      nullKeys: h.invented.map((x) => x.key),
    })),
  },
  diary30d: {
    highConfidenceItems: diaryHigh.length,
    sample: diaryHigh.slice(0, 20).map((h) => ({
      date: h.date,
      name: h.name,
      grams: h.grams,
      foodDbKey: h.foodDbKey,
      nullKeys: h.invented.map((x) => `${x.key}:${x.value}`),
    })),
  },
  proposal: 'Per ogni campo inventato → null (dato mancante). Attendere OK prima di scrivere.',
};

writeFileSync('./tmp-invented-nutrients-summary.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  nutrientsAffected: summary.nutrientsAffected,
  dbHigh: dbHigh.length,
  diaryHigh: diaryHigh.length,
  topNutrients: Object.entries(nutrientUnion)
    .sort((a, b) => (b[1].dbRows + b[1].diaryItems) - (a[1].dbRows + a[1].diaryItems))
    .slice(0, 20)
    .map(([k, v]) => `${k} (q=${v.quarter}, db=${v.dbRows}, diary=${v.diaryItems})`),
  dbSampleKeys: dbHigh.slice(0, 15).map((h) => h.foodKey),
}, null, 2));
