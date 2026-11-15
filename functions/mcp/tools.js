import { resolveDayRef, resolvePeriodRef } from './dates.js';
import { redactSensitiveNumbers } from './redact.js';
import { loadUserFocusContext, readStoredDayScore } from './loadUserContext.js';

function trackerNode(fullHistory, date) {
  return fullHistory?.[`trackerStorico_${date}`] || null;
}

function flattenLog(node) {
  const raw = node?.log || node?.dati?.log || [];
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'meal' && Array.isArray(entry.items)) {
      for (const item of entry.items) out.push(item);
      continue;
    }
    out.push(entry);
  }
  return out;
}

function summarizeDayLog(fullHistory, date) {
  const entries = flattenLog(trackerNode(fullHistory, date));
  const meals = [];
  let sleep = null;
  const movement = [];

  for (const entry of entries) {
    const type = String(entry.type || '').toLowerCase();
    if (type === 'sleep') {
      sleep = {
        hours: entry.hours ?? null,
        wakeTime: entry.wakeTime ?? null,
        bedtime: entry.bedtime ?? null,
        quality: entry.quality ?? null,
      };
      continue;
    }
    if (type === 'workout' || type === 'cardio' || type === 'activity') {
      movement.push({
        type,
        name: entry.name || entry.workoutType || entry.activityType || type,
        durationMinutes: entry.durationMinutes ?? entry.duration ?? null,
      });
      continue;
    }
    if (type === 'food' || entry.foodName || entry.kcal != null || entry.condimentKind) {
      meals.push({
        name: entry.name || entry.foodName || entry.desc || 'Alimento',
        kcal: Number.isFinite(Number(entry.kcal)) ? Number(entry.kcal) : null,
        mealType: entry.mealType || null,
        grams: entry.grams ?? entry.qta ?? null,
        condimentKind: entry.condimentKind || null,
      });
    }
  }
  return { meals, sleep, movement };
}

function scoreContext(base) {
  return {
    today: base.today,
    fullHistory: base.fullHistory,
    userTargets: base.userTargets,
    targetKcal: Number(base.userTargets?.kcal || base.profile_targets?.targets?.kcal) || null,
    profile_targets: base.profile_targets,
    records: base.records,
    movementCheckins: base.movementCheckins,
    catalogs: base.catalogs,
    forzaEnabled: base.forzaEnabled,
  };
}

function pillarSummary(cylinders) {
  if (!cylinders || typeof cylinders !== 'object') return null;
  const out = {};
  for (const key of ['alimentazione', 'sonno', 'movimento', 'forza']) {
    const c = cylinders[key];
    if (!c) continue;
    out[key] = {
      status: c.status ?? null,
      value: c.value ?? null,
      keyFact: c.keyFact ?? null,
      signals: Array.isArray(c.signals) ? c.signals : [],
    };
  }
  return out;
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 * @param {string} dateRef
 */
export async function toolGetDay(db, uid, dateRef) {
  const { date } = resolveDayRef(dateRef);
  const base = await loadUserFocusContext(db, uid);
  const ctx = scoreContext(base);
  const { computeDayScore } = await import(
    '../../src/features/kentuFocus/score/computeDayScore.js'
  );
  const { computeSafety } = await import(
    '../../src/features/kentuFocus/safety/computeSafety.js'
  );

  const live = computeDayScore(date, ctx);
  const stored = await readStoredDayScore(db, uid, date);
  const useStored = stored
    && stored.version === live.version
    && stored.dataVersion === live.dataVersion;
  const score = useStored
    ? {
      ...live,
      score: stored.score,
      reliability: stored.reliability,
      cylinders: stored.cylinders,
      source: 'rtdb',
    }
    : { ...live, source: 'computed' };

  const safety = computeSafety(date, ctx);
  const log = summarizeDayLog(base.fullHistory, date);
  const missingDiary = !trackerNode(base.fullHistory, date);

  let payload = {
    date,
    missingDiary,
    dayStatus: score.dayStatus ?? null,
    score: score.score,
    reliability: score.reliability,
    version: score.version,
    scoreSource: score.source,
    pillars: pillarSummary(score.cylinders),
    meals: log.meals,
    sleep: log.sleep,
    movement: log.movement,
    safety: {
      level: safety.level,
      signals: (safety.signals || []).map((s) => ({
        id: s.id,
        level: s.level,
        area: s.area,
      })),
      suppressNumbers: Boolean(safety.suppressNumbers || score.suppressNumbers),
    },
    action: lowestPillarAction(score.cylinders, safety),
  };

  if (payload.safety.suppressNumbers) {
    payload = redactSensitiveNumbers(payload);
    payload.safety.suppressNumbers = true;
  }
  return payload;
}

function lowestPillarAction(cylinders, safety) {
  const act = (safety?.signals || []).find((s) => s.level === 'act');
  if (act) {
    return { kind: 'safety', id: act.id, area: act.area || null };
  }
  const order = ['alimentazione', 'sonno', 'movimento', 'forza'];
  let best = null;
  for (const id of order) {
    const value = Number(cylinders?.[id]?.value);
    if (!Number.isFinite(value)) continue;
    if (!best || value < best.value) best = { id, value, status: cylinders[id]?.status ?? null };
  }
  return best ? { kind: 'pillar', pillar: best.id, status: best.status, value: best.value } : null;
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 * @param {string} periodRef
 */
export async function toolGetPeriod(db, uid, periodRef) {
  const period = resolvePeriodRef(periodRef);
  const base = await loadUserFocusContext(db, uid);
  const ctx = scoreContext(base);
  const { computePeriodScore } = await import(
    '../../src/features/kentuFocus/score/computePeriodScore.js'
  );
  const { computeSafety } = await import(
    '../../src/features/kentuFocus/safety/computeSafety.js'
  );
  const { computeDayScore } = await import(
    '../../src/features/kentuFocus/score/computeDayScore.js'
  );

  const periodScore = computePeriodScore(period.from, period.to, ctx);
  const anchor = computeDayScore(period.analysisDate, ctx);
  const safety = computeSafety(period.analysisDate, ctx);

  // Buchi = giorni past senza dati eleggibili
  const holes = Math.max(0, (periodScore.pastDays || 0) - (periodScore.eligibleDays || 0));

  let payload = {
    kind: period.kind,
    periodId: period.periodId,
    from: periodScore.from,
    to: periodScore.to,
    analysisDate: period.analysisDate,
    score: periodScore.score,
    coverage: periodScore.coverage,
    pastDays: periodScore.pastDays,
    eligibleDays: periodScore.eligibleDays,
    holes,
    longestStreak: periodScore.longestStreak,
    streaks: periodScore.streaks,
    reliability: periodScore.coverage != null && periodScore.coverage < 0.6 ? 'low' : 'high',
    pillars: pillarSummary(anchor.cylinders),
    safety: {
      level: safety.level,
      signals: (safety.signals || []).map((s) => ({
        id: s.id,
        level: s.level,
        area: s.area,
      })),
      suppressNumbers: Boolean(safety.suppressNumbers),
    },
    action: lowestPillarAction(anchor.cylinders, safety),
  };

  if (payload.safety.suppressNumbers) {
    payload = redactSensitiveNumbers(payload);
    payload.safety.suppressNumbers = true;
  }
  return payload;
}

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {string} uid
 * @param {string} query
 */
export async function toolSearchFood(db, uid, query) {
  const q = String(query || '').trim();
  if (q.length < 2) {
    return { query: q, results: [], note: 'Digita almeno 2 caratteri.' };
  }
  const base = await loadUserFocusContext(db, uid);
  const { searchFoodsDetailed } = await import('../../src/foodSearch.js');
  const { annotateCandidatesMatchQuality } = await import(
    '../../src/features/mealBuilder/utils/foodMatchQuality.js'
  );

  const foodDb = {
    ...(base.catalogs?.globalDb || {}),
    ...(base.catalogs?.offDb || {}),
    ...(base.catalogs?.kentuItDb || {}),
    ...(base.personalDb || {}),
  };
  const hits = searchFoodsDetailed(foodDb, q, { limit: 12 });
  const annotated = annotateCandidatesMatchQuality(q, hits);

  return {
    query: q,
    results: (annotated || []).slice(0, 12).map((hit) => ({
      name: hit.name || hit.desc || hit.label || null,
      matchQuality: hit.matchQuality || null,
      kcal100: hit.kcal ?? hit.calories ?? null,
      source: hit.source || hit._source || null,
      id: hit.id || hit.key || hit.foodDbKey || null,
    })),
  };
}
