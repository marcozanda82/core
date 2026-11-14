/**
 * Unico lettore delle sessioni di diario per cruscotto, Home, Hub e Focus.
 * Legge il log del giorno, non i manualNodes. Deduplica per id.
 */

import { addDays } from '../../../calendarDateUtils.js';
import { expandTrackerLogEntries } from '../../kentuFocus/normalize/expandTrackerDayLog.js';

function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function dayRawLog(fullHistory, dateKey) {
  const node = fullHistory?.[`trackerStorico_${dateKey}`];
  if (!node || typeof node !== 'object') return [];
  if (node.log != null) return node.log;
  if (node.dati && typeof node.dati === 'object' && node.dati.log != null) return node.dati.log;
  return [];
}

/**
 * Sessioni degli ultimi 9 giorni di calendario (oggi e otto indietro),
 * abbastanza per la finestra di 168 ore e per i 7 giorni chiusi del Focus.
 *
 * @param {object} [fullHistory]
 * @param {Array<object>} [activeLog] se presente, sostituisce il log del giorno ancora aperto
 * @param {string} [activeDate]
 * @returns {{ cardioLogs: object[], workoutLogs: object[], all: object[] }}
 */
export function collectRecentWorkoutLogs(fullHistory = {}, activeLog = [], activeDate = '') {
  const anchor = String(activeDate || '').slice(0, 10) || localToday();
  const byId = new Map();
  let anonymous = 0;

  const ingestDay = (dateKey, rawLog) => {
    for (const entry of expandTrackerLogEntries(rawLog)) {
      if (!entry || typeof entry !== 'object') continue;
      if (entry.isGhost === true) continue;
      const kind = String(entry.type || '').trim().toLowerCase();
      if (kind && kind !== 'workout') continue;
      const id = String(entry.id || entry.nodeId || '').trim();
      const key = id || `${dateKey}:anon:${anonymous}`;
      anonymous += 1;
      if (byId.has(key)) continue;
      byId.set(key, { ...entry, type: 'workout', __dateKey: dateKey });
    }
  };

  for (let back = 0; back <= 8; back += 1) {
    const dateKey = addDays(anchor, -back);
    if (back === 0 && Array.isArray(activeLog) && activeLog.length > 0) {
      ingestDay(dateKey, activeLog);
    } else {
      ingestDay(dateKey, dayRawLog(fullHistory, dateKey));
    }
  }

  const all = [...byId.values()];
  const cardioLogs = [];
  const workoutLogs = [];
  for (const entry of all) {
    const typeId = String(entry.workoutType || entry.subType || entry.activityType || '').trim().toLowerCase();
    if (typeId === 'cardio' || typeId === 'hiit' || typeId === 'liss') cardioLogs.push(entry);
    else workoutLogs.push(entry);
  }
  return { cardioLogs, workoutLogs, all };
}
