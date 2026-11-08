/**
 * Audit sola lettura — piatti composti sospetti vs alimento semplice catalogo.
 * Condiviso tra scripts/auditCompoundFoodMatches.mjs e UI Focus (DEV).
 */

import { normalizeSearchText } from '../../../foodSearch.js';
import {
  ENERGY_DENSITY_CONFIRM_RATIO,
  classifyFoodMatchQuality,
  findStrongFoodMatchesInCatalog,
} from '../../mealBuilder/utils/foodMatchQuality.js';
import { resolveFoodClockHourDetailed } from '../normalize/focusMealSlots.js';
import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';

export { ENERGY_DENSITY_CONFIRM_RATIO };

export const ASSISTED_ENTRY_SOURCES = Object.freeze(new Set([
  'chat',
  'chat_draft',
  'voice',
  'mcdrive',
  'wizard',
  'sequential',
  'fast_path',
  'fastpath',
]));

const COMPOUND_CONNECTOR = /\b(?:di|con|al|alla|allo|ai|agli|alle|e|ed)\b/i;
const STOP_WORDS = new Set([
  'di', 'con', 'al', 'alla', 'allo', 'ai', 'agli', 'alle', 'e', 'ed',
  'un', 'una', 'uno', 'il', 'la', 'lo', 'i', 'gli', 'le', 'del', 'della',
  'dei', 'delle', 'degli', 'in', 'da', 'su', 'per', 'a', 'the', 'and',
  'fresh', 'raw', 'cooked', 'crudi', 'crude', 'cotti', 'cotta', 'surgelati',
  'ristorante', 'homemade', 'casa',
]);

/**
 * Normalizza una riga catalogo grezza → campi usati dal matcher.
 * @param {Record<string, object>|null|undefined} raw
 * @returns {Record<string, object>}
 */
export function normalizeAuditCatalog(raw) {
  /** @type {Record<string, object>} */
  const out = {};
  for (const [id, row] of Object.entries(raw || {})) {
    if (!row || typeof row !== 'object') continue;
    const italianName = String(row.italianName || '').trim();
    const desc = String(row.desc || italianName || row.name || '').trim();
    out[id] = {
      ...row,
      id: row.id ?? id,
      fdcId: row.fdcId ?? id,
      italianName: italianName || undefined,
      desc,
      name: String(row.name || desc).trim(),
      kcal: Number(row.kcal ?? row.cal ?? row.energyKcal) || undefined,
    };
  }
  return out;
}

/**
 * @param {unknown} name
 */
export function isCompoundDishName(name) {
  const n = String(name || '').trim();
  if (!n) return false;
  const words = normalizeSearchText(n).split(/\s+/).filter(Boolean);
  if (words.length >= 3) return true;
  if (COMPOUND_CONNECTOR.test(n)) return true;
  return words.length >= 2 && /[,/+]/.test(n);
}

/**
 * @param {object} item
 */
export function isAssistedEntry(item) {
  const src = String(item?.entrySource || '').trim().toLowerCase();
  if (ASSISTED_ENTRY_SOURCES.has(src)) return true;
  if (item?.sourceText || item?.spokenFoodName) return true;
  const id = String(item?.id || '');
  if (/^mcdrive/i.test(id) || /wizard/i.test(id)) return true;
  return false;
}

/**
 * @param {object} item
 * @returns {number|null}
 */
export function itemKcalPer100g(item) {
  const grams = Number(item?.grams ?? item?.qta ?? item?.weight ?? item?.qty);
  const kcal = Number(item?.kcal ?? item?.cal);
  if (Number.isFinite(grams) && grams > 0 && Number.isFinite(kcal) && kcal > 0) {
    return (kcal / grams) * 100;
  }
  if (Number.isFinite(kcal) && kcal > 0 && kcal < 1200 && !(Number.isFinite(grams) && grams > 0)) {
    return kcal;
  }
  return null;
}

/**
 * @param {object} row
 * @returns {number|null}
 */
export function catalogKcalPer100g(row) {
  const direct = Number(row?.kcal ?? row?.cal ?? row?.energyKcal);
  if (Number.isFinite(direct) && direct > 0 && direct < 1200) return direct;
  return null;
}

/**
 * @param {string} name
 * @returns {string[]}
 */
export function candidateWordsFromDish(name) {
  return normalizeSearchText(name)
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
}

/**
 * @param {string} word
 * @param {Record<string, object>} catalog
 */
export function findSimpleAlternative(word, catalog) {
  const hits = findStrongFoodMatchesInCatalog(word, catalog, { limit: 6 });
  const simple = hits.find((h) => {
    const q = classifyFoodMatchQuality(h.name, word);
    if (q !== 'exact' && q !== 'prefix') return false;
    const words = normalizeSearchText(h.name).split(/\s+/).filter(Boolean);
    return words.length <= 3;
  });
  return simple || null;
}

/**
 * @param {number|null|undefined} hour
 * @returns {string|null}
 */
export function formatAuditClockHour(hour) {
  if (hour == null || !Number.isFinite(hour)) return null;
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * @param {object|null|undefined} fullHistory
 * @returns {Array<{ date: string, meal: string, mealTime: string|null, item: object }>}
 */
export function iterDiaryItemsForCompoundAudit(fullHistory) {
  /** @type {Array<{ date: string, meal: string, mealTime: string|null, item: object }>} */
  const out = [];
  for (const [key, node] of Object.entries(fullHistory || {})) {
    if (!node || typeof node !== 'object') continue;
    const date = String(key).replace(/^trackerStorico_/, '');
    if (!isIsoDateString(date)) continue;
    const mealTimes = node.mealTimes && typeof node.mealTimes === 'object' ? node.mealTimes : null;
    const log = Array.isArray(node.log) ? node.log : [];
    for (const meal of log) {
      const mealLabel = String(meal?.desc || meal?.mealType || meal?.name || 'pasto').trim();
      const items = Array.isArray(meal?.items) ? meal.items : [];
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const clock = resolveFoodClockHourDetailed(item, mealTimes);
        out.push({
          date,
          meal: mealLabel,
          mealTime: formatAuditClockHour(clock.hour),
          item,
        });
      }
    }
  }
  return out;
}

/**
 * Restringe lo storico agli ultimi `days` giorni fino a `endIso` (incluso).
 * @param {object|null|undefined} fullHistory
 * @param {string} endIso
 * @param {number} days
 */
export function sliceHistoryLastDays(fullHistory, endIso, days) {
  const end = isIsoDateString(endIso) ? endIso : null;
  const n = Math.max(1, Math.floor(Number(days) || 90));
  if (!end || !fullHistory || typeof fullHistory !== 'object') return {};
  /** @type {Record<string, object>} */
  const out = {};
  for (let i = 0; i < n; i += 1) {
    const date = addCalendarDays(end, -i);
    const keyed = fullHistory[`trackerStorico_${date}`];
    const bare = fullHistory[date];
    if (keyed && typeof keyed === 'object') out[`trackerStorico_${date}`] = keyed;
    else if (bare && typeof bare === 'object') out[`trackerStorico_${date}`] = bare;
  }
  return out;
}

/**
 * @param {object|null|undefined} fullHistory
 * @param {Array<Record<string, object>|null|undefined>|Record<string, object>} catalogs
 * @param {number} [ratio]
 * @returns {object[]}
 */
export function auditCompoundFoodMatches(fullHistory, catalogs, ratio = ENERGY_DENSITY_CONFIRM_RATIO) {
  const list = Array.isArray(catalogs) ? catalogs : [catalogs];
  const mergedCatalog = {};
  for (const cat of list) {
    if (cat && typeof cat === 'object') Object.assign(mergedCatalog, cat);
  }

  /** @type {object[]} */
  const suspects = [];
  const rows = iterDiaryItemsForCompoundAudit(fullHistory);

  for (const { date, meal, mealTime, item } of rows) {
    if (!isAssistedEntry(item)) continue;
    const recorded = String(item.foodName || item.desc || item.name || item.label || '').trim();
    if (!recorded || !isCompoundDishName(recorded)) continue;

    const recordedDensity = itemKcalPer100g(item);
    if (recordedDensity == null) continue;

    const gramsRaw = Number(item.grams ?? item.qta ?? item.weight ?? item.qty);
    const grams = Number.isFinite(gramsRaw) && gramsRaw > 0 ? Math.round(gramsRaw * 10) / 10 : null;
    const recordedPortionKcalRaw = Number(item.kcal ?? item.cal);
    const recordedPortionKcal = Number.isFinite(recordedPortionKcalRaw) && recordedPortionKcalRaw > 0
      ? Math.round(recordedPortionKcalRaw)
      : null;

    const words = candidateWordsFromDish(recorded);
    /** @type {object|null} */
    let best = null;
    for (const word of words) {
      const simple = findSimpleAlternative(word, mergedCatalog);
      if (!simple) continue;
      const simpleDensity = catalogKcalPer100g(simple.row || simple);
      if (simpleDensity == null || simpleDensity <= 0) continue;
      if (recordedDensity / simpleDensity <= ratio) continue;

      const estimatedAltKcal = grams != null
        ? Math.round((simpleDensity / 100) * grams)
        : null;
      const kcalDiff = recordedPortionKcal != null && estimatedAltKcal != null
        ? recordedPortionKcal - estimatedAltKcal
        : null;

      const candidate = {
        date,
        meal,
        mealTime: mealTime || null,
        recorded,
        entrySource: item.entrySource || null,
        sourceText: item.sourceText || item.spokenFoodName || null,
        recordedKcalPer100g: Math.round(recordedDensity * 10) / 10,
        simpleAlternative: simple.name,
        simpleKcalPer100g: Math.round(simpleDensity * 10) / 10,
        densityRatio: Math.round((recordedDensity / simpleDensity) * 100) / 100,
        kcalDeltaPer100g: Math.round(recordedDensity - simpleDensity),
        foodDbKey: item.foodDbKey || item.matchedKey || null,
        grams,
        recordedPortionKcal,
        estimatedAltKcal,
        kcalDiff,
      };
      if (!best || candidate.densityRatio > best.densityRatio) best = candidate;
    }
    if (best) suspects.push(best);
  }

  suspects.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const ta = String(a.mealTime || '');
    const tb = String(b.mealTime || '');
    if (ta !== tb) return ta < tb ? 1 : -1;
    return (b.densityRatio || 0) - (a.densityRatio || 0);
  });
  return suspects;
}

/**
 * @param {object[]} suspects
 */
export function summarizeCompoundFoodAudit(suspects) {
  const list = Array.isArray(suspects) ? suspects : [];
  let sumKcalDiff = 0;
  let diffCount = 0;
  for (const s of list) {
    if (Number.isFinite(Number(s?.kcalDiff))) {
      sumKcalDiff += Number(s.kcalDiff);
      diffCount += 1;
    }
  }
  return {
    suspectCount: list.length,
    sumKcalDiff: Math.round(sumKcalDiff),
    diffCount,
  };
}

/**
 * Testo semplice per clipboard.
 * @param {object[]} suspects
 * @param {{ suspectCount?: number, sumKcalDiff?: number }} [summary]
 */
export function formatCompoundFoodAuditPlainText(suspects, summary) {
  const list = Array.isArray(suspects) ? suspects : [];
  const sm = summary || summarizeCompoundFoodAudit(list);
  const lines = [
    `Alimenti sospetti: ${sm.suspectCount}`,
    `Somma differenze kcal: ${sm.sumKcalDiff}`,
    '',
  ];
  for (const s of list) {
    const timePart = s.mealTime ? ` ${s.mealTime}` : '';
    const grams = s.grams != null ? `${s.grams} g` : '—';
    const recKcal = s.recordedPortionKcal != null ? `${s.recordedPortionKcal}` : '—';
    const altKcal = s.estimatedAltKcal != null ? `${s.estimatedAltKcal}` : '—';
    const diff = s.kcalDiff != null ? `${s.kcalDiff > 0 ? '+' : ''}${s.kcalDiff}` : '—';
    lines.push(
      [
        s.date,
        `${s.meal}${timePart}`,
        s.recorded,
        `→ ${s.simpleAlternative}`,
        grams,
        `kcal ${recKcal}`,
        `alt ${altKcal}`,
        `Δ ${diff}`,
      ].join(' | '),
    );
  }
  return lines.join('\n');
}
