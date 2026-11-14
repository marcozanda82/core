/**
 * Cache locale punteggi giorno chiusi (localStorage, try/catch).
 * Chiave logica: data + versione metodo (kds-3) + contentHash dei dati del giorno.
 * Un giorno chiuso e invariato non si ricalcola.
 */

import { addCalendarDays, isIsoDateString } from '../normalize/focusDateUtils.js';
import { getTrackerDayNode } from '../lab/buildFocusLabDossier.js';
import { hashDayFacts } from '../score/dayScoreRecord.js';
import { SCORE_VERSION } from '../score/scoreConfig.kds-3.js';
import { forzaEnabled } from '../score/scoreMovement.js';

const SCHEMA = 2;

function storageKey(uid) {
  return `kentu.focus.dayScores.v${SCHEMA}.${String(uid || '').trim()}`;
}

/**
 * @param {string} uid
 * @returns {Record<string, object>}
 */
export function readFocusDayScoreLocalCache(uid) {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function compactLogSignature(node) {
  if (!node || typeof node !== 'object') return '';
  const raw = node.log;
  const log = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
  let out = '';
  for (const entry of log) {
    if (!entry || typeof entry !== 'object') continue;
    out += `${entry.id || entry.name || entry.desc || ''}|${entry.kcal ?? entry.cal ?? ''}|${entry.qty ?? entry.grams ?? entry.g ?? ''}|${entry.type || ''};`;
  }
  const sleep = node.sleep && typeof node.sleep === 'object'
    ? `${node.sleep.hours ?? node.sleep.duration ?? ''}|${node.sleep.bedtime ?? ''}|${node.sleep.waketime ?? ''}`
    : String(node.sleep ?? '');
  return {
    log: out,
    steps: node.steps ?? node.passi ?? null,
    sleep,
    mealTimes: node.mealTimes ? JSON.stringify(node.mealTimes) : '',
  };
}

/**
 * Impronta economica dei dati del giorno (+ finestra movimento 7g), senza computeDayScore.
 * Evita stableStringify sull'intero log (era la causa dei long task da più secondi).
 * @param {string} date
 * @param {object} context
 */
export function fingerprintFocusDayContent(date, context = {}) {
  if (!isIsoDateString(date)) return 'invalid';
  const windowSlice = {};
  for (let i = 0; i < 7; i += 1) {
    const d = addCalendarDays(date, -i);
    const node = getTrackerDayNode(context.fullHistory, d);
    if (!node || typeof node !== 'object') continue;
    windowSlice[d] = compactLogSignature(node);
  }
  return hashDayFacts({
    scoreVersion: SCORE_VERSION,
    date,
    targetKcal: context.targetKcal ?? context.userTargets?.kcal ?? null,
    forzaEnabled: forzaEnabled(context),
    checkin: context.movementCheckins?.[date] ?? null,
    record: context.records?.[date] ?? context.record ?? null,
    windowSlice,
  });
}

/**
 * @param {string} uid
 * @param {string} date
 * @param {object} record
 * @param {string} contentHash
 */
export function writeFocusDayScoreLocalCache(uid, date, record, contentHash = null) {
  try {
    const all = readFocusDayScoreLocalCache(uid);
    all[date] = {
      version: record?.version ?? SCORE_VERSION,
      score: record?.score ?? null,
      reliability: record?.reliability ?? null,
      cylinders: record?.cylinders ?? null,
      dataVersion: record?.dataVersion ?? null,
      forceIntensity: record?.forceIntensity ?? null,
      dayStatus: record?.dayStatus ?? null,
      contentHash: contentHash || record?.contentHash || null,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey(uid), JSON.stringify(all));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Hit solo se versione metodo e contentHash coincidono (giorno invariato).
 * @param {string} uid
 * @param {string} date
 * @param {{ version?: string, contentHash?: string }} fresh
 */
export function peekFocusDayScoreLocalCache(uid, date, fresh = {}) {
  const all = readFocusDayScoreLocalCache(uid);
  const hit = all[date];
  if (!hit) return null;
  const wantVersion = fresh.version || SCORE_VERSION;
  if (hit.version && hit.version !== wantVersion) return null;
  if (fresh.contentHash) {
    if (!hit.contentHash || hit.contentHash !== fresh.contentHash) return null;
  } else if (fresh.dataVersion && hit.dataVersion && hit.dataVersion !== fresh.dataVersion) {
    // retrocompat v1
    return null;
  }
  return hit;
}

/**
 * Oggi e ieri si ricalcolano sempre; i chiusi solo se contentHash cambia.
 * @param {string} date
 * @param {string} today
 */
export function focusDayNeedsFreshCompute(date, today) {
  if (!isIsoDateString(date) || !isIsoDateString(today)) return true;
  // Futuri: niente compute (placeholder). Oggi e ieri: sempre freschi.
  if (date > today) return false;
  if (date === today) return true;
  if (date === addCalendarDays(today, -1)) return true;
  return false;
}
