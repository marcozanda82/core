import { resolveDayRef, resolvePeriodRef, isIsoDate } from './dates.js';
import { redactSensitiveNumbers } from './redact.js';
import { loadUserFocusContext, readStoredDayScore } from './loadUserContext.js';
import {
  buildDayMealsDetail,
  buildDaySleepDetail,
  buildEvenings,
  flattenDiaryEntries,
  trackerNode,
} from './dayDetail.js';
import {
  classifyWorkoutByType,
  resolveWorkoutDurationMinutes,
} from '../../src/features/commandTerminal/context/workoutMovement.js';

function summarizeMovement(fullHistory, date) {
  const entries = flattenDiaryEntries(trackerNode(fullHistory, date));
  const byId = new Map();
  for (const entry of entries) {
    const type = String(entry.type || '').toLowerCase();
    if (type !== 'workout' && type !== 'cardio' && type !== 'activity') continue;
    const id = String(entry.id || `${entry.name || ''}_${entry.time || ''}`);
    const prev = byId.get(id);
    // Preferisci la copia con durationMinutes esplicito (spesso in manualNodes).
    if (!prev || (entry.durationMinutes != null && prev.durationMinutes == null)) {
      byId.set(id, entry);
    }
  }
  const movement = [];
  for (const entry of byId.values()) {
    const minutes = resolveWorkoutDurationMinutes(entry);
    const kind = classifyWorkoutByType(entry).kind;
    movement.push({
      type: entry.workoutType || entry.subType || entry.type || kind,
      name: entry.name || entry.workoutType || entry.activityType || entry.type,
      durationMinutes: minutes > 0 ? minutes : null,
      kind,
    });
  }
  return movement;
}

function scoreContext(base) {
  const forzaOn = base.forzaEnabled === true;
  return {
    today: base.today,
    fullHistory: base.fullHistory,
    // Niente targetKcal/base correnti inventati: resolveDayTargetKcal usa
    // dayTargetSnapshot o targetHistory per la data (dtr-1, no fallback 2000).
    userTargets: base.userTargets,
    profile_targets: base.profile_targets,
    targets: base.profile_targets?.targets || base.userTargets || null,
    records: base.records,
    movementCheckins: base.movementCheckins,
    catalogs: base.catalogs,
    forzaEnabled: forzaOn,
    // computeDayScore.forzaEnabled legge context.cylinders.forza.enabled
    cylinders: {
      forza: { enabled: forzaOn },
    },
    scoreVersion: 'kds-5',
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
      ...(key === 'movimento' && c.battery
        ? {
          batteryLevel: c.battery.level ?? c.value ?? null,
          batteryCopy: c.battery.copy ?? null,
        }
        : {}),
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
  const { hydrateAlimentazioneKeyFact } = await import(
    '../../src/features/mealEngine/resolveDayTargetKcal.js'
  );
  // Score/value possono restare da RTDB; keyFact alimentazione sempre da snapshot dtr-1.
  const baseCylinders = useStored ? (stored.cylinders || live.cylinders) : live.cylinders;
  const cylinders = hydrateAlimentazioneKeyFact(baseCylinders, {
    date,
    fullHistory: base.fullHistory,
    intakeKcal: live.cylinders?.alimentazione?.intakeKcal,
    userTargets: base.userTargets,
    profile_targets: base.profile_targets,
    targets: base.profile_targets?.targets || base.userTargets || null,
  });
  const score = useStored
    ? {
      ...live,
      score: stored.score,
      reliability: stored.reliability,
      cylinders,
      source: 'rtdb',
    }
    : { ...live, cylinders, source: 'computed' };

  const safety = computeSafety(date, ctx);
  const mealsDetail = buildDayMealsDetail(base.fullHistory, date);
  const sleep = buildDaySleepDetail(base.fullHistory, date);
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
    meals: mealsDetail.meals,
    liquids: mealsDetail.liquids,
    caffeineMg: mealsDetail.caffeineMg,
    nutrientTotals: mealsDetail.totals,
    nutrientCoverage: mealsDetail.coverage,
    sleep,
    movement: summarizeMovement(base.fullHistory, date),
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
    warnings: [...(base.catalogWarnings || [])],
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
    const status = cylinders?.[id]?.status ?? null;
    if (status === 'inactive' || status === 'no_data') continue;
    const value = Number(cylinders?.[id]?.value);
    if (!Number.isFinite(value)) continue;
    if (!best || value < best.value) best = { id, value, status };
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
  const { hydrateAlimentazioneKeyFact } = await import(
    '../../src/features/mealEngine/resolveDayTargetKcal.js'
  );
  const anchorCylinders = hydrateAlimentazioneKeyFact(anchor.cylinders, {
    date: period.analysisDate,
    fullHistory: base.fullHistory,
    intakeKcal: anchor.cylinders?.alimentazione?.intakeKcal,
    userTargets: base.userTargets,
    profile_targets: base.profile_targets,
    targets: base.profile_targets?.targets || base.userTargets || null,
  });

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
    pillars: pillarSummary(anchorCylinders),
    safety: {
      level: safety.level,
      signals: (safety.signals || []).map((s) => ({
        id: s.id,
        level: s.level,
        area: s.area,
      })),
      suppressNumbers: Boolean(safety.suppressNumbers),
    },
    action: lowestPillarAction(anchorCylinders, safety),
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
 * @param {{ from: string, to: string }} range
 */
export async function toolGetEvenings(db, uid, range) {
  const from = String(range?.from || '').trim();
  const to = String(range?.to || '').trim();
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new Error('from e to devono essere YYYY-MM-DD');
  }
  const base = await loadUserFocusContext(db, uid);
  const payload = buildEvenings(base.fullHistory, from, to);

  // suppressNumbers: se un giorno della finestra lo richiede, reda tutto il blocco numeri.
  const { computeSafety } = await import(
    '../../src/features/kentuFocus/safety/computeSafety.js'
  );
  const ctx = scoreContext(base);
  let suppress = false;
  for (const row of payload.evenings) {
    const safety = computeSafety(row.date, ctx);
    if (safety?.suppressNumbers) {
      suppress = true;
      break;
    }
  }
  let out = {
    ...payload,
    suppressNumbers: suppress,
    warnings: [...(base.catalogWarnings || [])],
  };
  if (suppress) {
    out = redactSensitiveNumbers(out);
    out.suppressNumbers = true;
  }
  return out;
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
  const hits = searchFoodsDetailed(foodDb, q, { limit: 16 });
  const annotated = annotateCandidatesMatchQuality(q, hits);
  const { loadRecentFoodUsageScores, rankSearchResultsByRecentUsage } = await import('./habits.js');
  let ranked = annotated || [];
  try {
    const recent = await loadRecentFoodUsageScores(db, uid);
    ranked = rankSearchResultsByRecentUsage(ranked, recent);
  } catch (err) {
    console.warn('[kentuMcp] recent food rank skipped', String(err?.message || err).slice(0, 80));
  }

  return {
    query: q,
    warnings: [...(base.catalogWarnings || [])],
    results: ranked.slice(0, 12).map((hit) => ({
      name: hit.name || hit.desc || hit.label || null,
      matchQuality: hit.matchQuality || null,
      kcal100: hit.kcal ?? hit.calories ?? null,
      source: hit.source || hit._source || null,
      id: hit.id || hit.key || hit.foodDbKey || null,
    })),
  };
}
