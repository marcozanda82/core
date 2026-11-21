import { readFileSync } from 'node:fs';
const p = JSON.parse(readFileSync('./tmp-diary-na-plan.json', 'utf8'));
const corrupt = p.hits.filter((h) => h.per100Before != null && Math.abs(h.per100Before - 500) < 20);
const mild = p.hits.filter((h) => !(h.per100Before != null && Math.abs(h.per100Before - 500) < 20));
const line = (h) =>
  `${h.date} · ${h.mealDesc || '?'} · ${h.name} ${h.grams}g · Na ${h.naBefore ?? '∅'} → ${h.naAfter} mg (${h.per100Before || 0} → ${h.per100After}/100g) · id ${h.itemId}`;
console.log(`DB personale: scritto (na + sale).`);
console.log(`Diario 30g: ${p.hits.length} voci (corrotti~500: ${corrupt.length}, allineamento leggero/null: ${mild.length}).\n`);
console.log(`=== CORROTTI ~500 mg/100g (${corrupt.length}) — da ricalcolare ===`);
for (const h of corrupt) console.log(line(h));
console.log(`\n=== ALLINEAMENTO LEGGERO / na null (${mild.length}) — stesso writer se ok ===`);
for (const h of mild) console.log(line(h));
console.log(`\nWriter: mergeDayNodeWrite per mealId (items completi del pasto, solo na/sale aggiornati sulle voci colpite). Aspetto ok diario.`);
