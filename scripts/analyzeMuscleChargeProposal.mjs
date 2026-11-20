/**
 * Solo analisi: confronta force-ci-1 vs proposta charge+decay (force-ci-2 candidate).
 * Non modifica codice prodotto.
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { addCalendarDays, isIsoDateString } from '../src/features/kentuFocus/normalize/focusDateUtils.js';
import {
  computeCostanzaForza,
  strengthSessionsByDay,
  normalizeWeeklyGoalDays,
} from '../src/features/kentuFocus/costanza/costanzaForza.js';
import { forceLoadConsistency } from '../src/features/kentuFocus/costanza/forceConsistency.ci-1.js';
import { FORCE_CI_GROUP_IDS, MUSCLE_IDS, COSTANZA_UI_GROUPS } from '../src/features/kentuFocus/costanza/muscleIds.mm-1.js';
import { sessionMuscleWeights } from '../src/features/kentuFocus/costanza/muscleMap.mm-1.js';
import { computeDayScore } from '../src/features/kentuFocus/score/computeDayScore.js';
import { getDayStatus } from '../src/features/dayStatus/dayStatus.js';

const HALF_LIFE_DAYS = 3;
const DECAY = Math.pow(0.5, 1 / HALF_LIFE_DAYS);
const LOOKBACK = 21;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = join(ROOT, 'src/features/kentuFocus/__tests__/fixtures/focusDiary.2026-11-09.real.json');
const UID = 'hvPTB7P3DUZ5nlAW7PH08AG4Rqt1';
const PROJECT = 'mio-tracker';

function impulseForDay(byDay, day, muscleId) {
  let best = 0;
  for (const entry of byDay.get(day) || []) {
    const w = Number(sessionMuscleWeights(entry)[muscleId] || 0);
    if (w > best) best = w;
  }
  if (best >= 1) return 'train';
  if (best > 0) return 'involve';
  return null;
}

/** Carica muscolo a fine giornata asOf (lookback 21). */
function muscleCharge(byDay, muscleId, asOf) {
  if (!isIsoDateString(asOf)) return 0;
  let c = 0;
  const start = addCalendarDays(asOf, -(LOOKBACK - 1));
  let day = start;
  while (day <= asOf) {
    c *= DECAY;
    const impulse = impulseForDay(byDay, day, muscleId);
    if (impulse === 'train') c = 1;
    else if (impulse === 'involve') c = Math.min(1, c + 0.5);
    day = addCalendarDays(day, 1);
  }
  return Math.min(1, Math.round(c * 1000) / 1000);
}

function groupCharge(byDay, group, asOf) {
  const vals = group.muscleIds.map((id) => muscleCharge(byDay, id, asOf));
  return vals.length ? Math.max(...vals) : 0;
}

function forceLoadCi2(date, fullHistory, weeklyGoalDays = 2) {
  const asOf = String(date).slice(0, 10);
  const snap = computeCostanzaForza({ fullHistory, asOfDate: asOf, weeklyGoalDays });
  const byDay = strengthSessionsByDay(fullHistory, asOf, LOOKBACK + 5);
  const goal = normalizeWeeklyGoalDays(weeklyGoalDays);
  const dayPart = goal > 0 ? Math.min(1, snap.forceDaysThisWeek / goal) : 0;
  const groups = COSTANZA_UI_GROUPS.filter((g) => FORCE_CI_GROUP_IDS.includes(g.id));
  const charges = groups.map((g) => groupCharge(byDay, g, asOf));
  const coverPart = charges.length
    ? charges.reduce((s, v) => s + v, 0) / charges.length
    : 0;
  const value = 0.5 * dayPart + 0.5 * coverPart;
  return {
    raw: Math.min(1, Math.round(value * 1000) / 1000),
    dayPart: Math.round(dayPart * 1000) / 1000,
    coverPart: Math.round(coverPart * 1000) / 1000,
    groupCharges: Object.fromEntries(groups.map((g, i) => [g.id, charges[i]])),
  };
}

function calibrationRecords(fullHistory, today) {
  const records = {};
  for (const key of Object.keys(fullHistory || {})) {
    if (!key.startsWith('trackerStorico_')) continue;
    const date = key.slice('trackerStorico_'.length);
    if (date >= today) continue;
    if (getDayStatus(date, { today, fullHistory }) !== 'unconfirmed') continue;
    records[date] = { confirmed: true, approximate: false, paused: false };
  }
  return records;
}

function fbGet(path) {
  const firebaseJs = join(process.env.APPDATA || '', 'npm/node_modules/firebase-tools/lib/bin/firebase.js');
  const outFile = join(tmpdir(), `kentu-an-${randomBytes(4).toString('hex')}.json`);
  const r = spawnSync(process.execPath, [firebaseJs, 'database:get', path, '--project', PROJECT, '-o', outFile], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout || 'fb get fail').slice(0, 300));
  let buf = readFileSync(outFile);
  unlinkSync(outFile);
  if (buf[0] === 0xff && buf[1] === 0xfe) buf = Buffer.from(buf.toString('utf16le'), 'utf8');
  const text = buf.toString('utf8').replace(/^\uFEFF/, '').trim();
  return text ? JSON.parse(text) : null;
}

function analyzeHistory(label, fullHistory, dates, weeklyGoalDays, today) {
  const base = {
    today,
    fullHistory,
    profile_targets: { profile: {}, targets: {} },
    records: calibrationRecords(fullHistory, today),
    scoreVersion: 'kds-3',
    cylinders: { forza: { enabled: true, weeklyGoalDays } },
  };
  return dates.map((date) => {
    const scoreRes = computeDayScore(date, base);
    const ci1 = forceLoadConsistency(date, fullHistory, { weeklyGoalDays });
    const ci2 = forceLoadCi2(date, fullHistory, weeklyGoalDays);
    const gated1 = scoreRes.score != null && scoreRes.score >= 0.75 ? ci1 : 0;
    const gated2 = scoreRes.score != null && scoreRes.score >= 0.75 ? ci2.raw : 0;
    return {
      date,
      score: scoreRes.score,
      forceCi1Raw: ci1,
      forceCi1Gated: gated1,
      forceCi2Raw: ci2.raw,
      forceCi2Gated: gated2,
      dayPart: ci2.dayPart,
      coverPart: ci2.coverPart,
      groups: ci2.groupCharges,
    };
  });
}

// --- fixture ---
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const fixtureDates = ['2026-10-28', '2026-10-29', '2026-10-30', '2026-11-05', '2026-11-09'];
const fixtureRows = analyzeHistory('fixture', fixture.fullHistory, fixtureDates, 2, '2026-11-10');

// --- production last 30 days (asOf today) ---
const today = new Date();
const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const prodHistory = {};
const prodDates = [];
for (let i = 29; i >= 0; i -= 1) {
  const d = addCalendarDays(todayIso, -i);
  prodDates.push(d);
  try {
    const node = fbGet(`/users/${UID}/tracker_data/trackerStorico_${d}`);
    if (node) prodHistory[`trackerStorico_${d}`] = node;
  } catch {
    /* skip missing */
  }
}
const weeklyGoal = 2;
try {
  const cyl = fbGet(`/users/${UID}/cylinders/forza`);
  if (cyl?.weeklyGoalDays) {/* keep default if weird */}
} catch { /* ignore */ }

const prodRows = analyzeHistory('prod30', prodHistory, prodDates, weeklyGoal, addCalendarDays(todayIso, 1));

// group bar example: pick asOf yesterday with some strength
const asOf = addCalendarDays(todayIso, -1);
const snap = computeCostanzaForza({ fullHistory: prodHistory, asOfDate: asOf, weeklyGoalDays: weeklyGoal });
const byDay = strengthSessionsByDay(prodHistory, asOf, LOOKBACK + 5);
const uiCharges = COSTANZA_UI_GROUPS.map((g) => {
  const charge = groupCharge(byDay, g, asOf);
  const muscles = g.muscleIds.map((id) => ({
    id,
    charge: muscleCharge(byDay, id, asOf),
    legacy: snap.muscles[id]?.status,
    daysSince: snap.muscles[id]?.daysSinceTrained,
  }));
  return {
    id: g.id,
    label: g.label,
    charge,
    pct: Math.round(charge * 100),
    legacyStatus: snap.groups[g.id]?.status,
    muscles,
  };
});

console.log(JSON.stringify({
  params: { halfLifeDays: HALF_LIFE_DAYS, decayPerDay: Number(DECAY.toFixed(6)), lookback: LOOKBACK },
  fixture: fixtureRows,
  prod30Summary: {
    asOf: todayIso,
    daysLoaded: Object.keys(prodHistory).length,
    rowsWithScore: prodRows.filter((r) => r.score != null).length,
    meanCi1Gated: avg(prodRows.map((r) => r.forceCi1Gated)),
    meanCi2Gated: avg(prodRows.map((r) => r.forceCi2Gated)),
    meanCi1Raw: avg(prodRows.map((r) => r.forceCi1Raw)),
    meanCi2Raw: avg(prodRows.map((r) => r.forceCi2Raw)),
  },
  prod30: prodRows.filter((r) => r.forceCi1Raw > 0 || r.forceCi2Raw > 0 || (r.score != null && r.score >= 0.7)),
  uiChargesAsOf: { asOf, groups: uiCharges },
}, null, 2));

function avg(arr) {
  const nums = arr.filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 1000) / 1000;
}
