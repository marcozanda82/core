/**
 * Diary 30d hits for personal keys we can fix (writable CREA) + na~500/100g pattern.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';
const plan = JSON.parse(readFileSync('./tmp-personal-na500-plan.json', 'utf8'));
const writable = new Map(plan.plan.filter((p) => p.writable).map((p) => [p.key, p]));

const end = new Date('2026-11-20T12:00:00Z');
const dates = [];
for (let i = 0; i < 30; i += 1) {
  const d = new Date(end);
  d.setUTCDate(end.getUTCDate() - i);
  dates.push(d.toISOString().slice(0, 10));
}

function getDay(date) {
  const out = `tmp-day-${date}.json`;
  if (!existsSync(out)) {
    spawnSync(
      'firebase',
      ['database:get', `/users/${UID}/tracker_data/trackerStorico_${date}`, '--project', PROJECT, '-o', out],
      { encoding: 'utf8', shell: true },
    );
  }
  try {
    const raw = readFileSync(out, 'utf8').trim();
    if (!raw || raw === 'null') return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const hits = [];

for (const date of dates) {
  const day = getDay(date);
  if (!day) continue;
  const log = Array.isArray(day.log) ? day.log : Object.values(day.log || {});
  for (const meal of log) {
    for (const it of meal.items || []) {
      const key = String(it.foodDbKey || it.matchedKey || '').trim();
      const grams = Number(it.grams ?? it.qta ?? it.weight);
      const na = Number(it.na);
      const per100 = grams > 0 && Number.isFinite(na) ? na / (grams / 100) : null;
      const wp = writable.get(key);
      const corrupt500 = per100 != null && Math.abs(per100 - 500) < 20;
      if (!wp && !corrupt500) continue;
      const afterPer100 = wp?.after ?? null;
      const naAfter = afterPer100 != null && grams > 0 ? round2(afterPer100 * (grams / 100)) : null;
      if (naAfter != null && Math.abs(na - naAfter) < 0.05) continue;
      hits.push({
        date,
        mealId: meal.mealId,
        itemId: it.id,
        name: it.name || it.desc,
        foodDbKey: key || null,
        grams,
        naBefore: Number.isFinite(na) ? na : null,
        naAfter,
        per100Before: per100 != null ? round2(per100) : null,
        per100After: afterPer100,
        method: wp?.method || 'pattern ~500/100g senza patch DB ancora',
      });
    }
  }
}

writeFileSync('./tmp-diary-fresh-na-plan.json', JSON.stringify({ hitCount: hits.length, hits }, null, 2));
console.log(JSON.stringify({ hitCount: hits.length, hits }, null, 2));
