import { useCallback } from 'react';
import { addDays } from './calendarDateUtils';
import { getLogFromStoricoTree, getTodayString } from './coreEngine';
import { computeTotali } from './useBiochimico';

const LS_DISMISS = 'kentu_smart_trigger_dismiss_v1';
const LS_MORNING_BRIEFING_SHOWN = 'kentu_morning_briefing_shown_v1';
const LS_EVENING_BRIEFING_SHOWN = 'kentu_evening_briefing_shown_v1';

/** Flag: messaggi proattivi in chat disabilitati (nessun push senza input utente). */
export const KENTU_PROACTIVE_CHAT_TRIGGERS_ENABLED = false;

function writeDismissPatch(dateStr, patch) {
  if (typeof window === 'undefined' || !dateStr) return;
  let cur = {};
  try {
    const raw = window.localStorage.getItem(`${LS_DISMISS}_${dateStr}`);
    cur = raw ? JSON.parse(raw) : {};
  } catch {
    cur = {};
  }
  window.localStorage.setItem(`${LS_DISMISS}_${dateStr}`, JSON.stringify({ ...cur, ...patch }));
}

function sumFoodKcalFromLog(log) {
  let total = 0;
  for (const e of log || []) {
    if (!e) continue;
    if (e.type === 'food' || e.type === 'recipe' || e.type === 'meal') {
      total += Number(e.kcal ?? e.cal ?? 0) || 0;
    }
  }
  return total;
}

function isMorningBriefingTimeWindow() {
  if (typeof window === 'undefined') return false;
  const now = new Date();
  const decimal = now.getHours() + now.getMinutes() / 60;
  return decimal >= 6 && decimal <= 11.5;
}

function isEveningBriefingTimeWindow() {
  if (typeof window === 'undefined') return false;
  const now = new Date();
  const decimal = now.getHours() + now.getMinutes() / 60;
  return decimal >= 17.5 && decimal <= 22;
}

function logAlreadyHasDinner(log) {
  for (const e of log || []) {
    if (!e) continue;
    if (e.type !== 'food' && e.type !== 'recipe' && e.type !== 'meal') continue;
    const mt = String(e.mealType || '').toLowerCase();
    if (mt === 'cena' || mt === 'dinner') return true;
  }
  return false;
}

/**
 * Briefing serale (legacy) — disabilitato da KENTU_PROACTIVE_CHAT_TRIGGERS_ENABLED.
 */
export function checkEveningBriefing(activeLog, userTargets, anchorDate, maxCapacity = 100) {
  if (!KENTU_PROACTIVE_CHAT_TRIGGERS_ENABLED) return null;
  if (!isEveningBriefingTimeWindow()) return null;

  const dateStr = anchorDate && String(anchorDate).trim() ? String(anchorDate).trim().slice(0, 10) : null;
  if (!dateStr || dateStr !== getTodayString()) return null;

  const log = Array.isArray(activeLog) ? activeLog : [];
  if (logAlreadyHasDinner(log)) return null;

  const targetKcal = Number(userTargets?.kcal);
  const targetPro = Number(userTargets?.prot ?? userTargets?.pro);
  if (!Number.isFinite(targetKcal) || targetKcal <= 0) return null;
  if (!Number.isFinite(targetPro) || targetPro < 0) return null;

  const totali = computeTotali(log);
  const currentKcal = Number(totali?.kcal) || 0;
  const currentPro = Number(totali?.prot) || 0;

  const missingKcal = Math.round(targetKcal - currentKcal);
  const missingPro = Math.round(targetPro - currentPro);

  if (missingKcal <= 200) return null;

  const cap = Number(maxCapacity);
  const isHighDebt = Number.isFinite(cap) && cap < 85;

  return {
    type: 'evening_briefing',
    missingKcal,
    missingPro,
    handled: false,
    ...(isHighDebt ? { isHighDebt: true } : {}),
  };
}

/**
 * Morning briefing (legacy) — disabilitato da KENTU_PROACTIVE_CHAT_TRIGGERS_ENABLED.
 */
export function checkMorningBriefing(fullHistory, userTargets, anchorDate) {
  if (!KENTU_PROACTIVE_CHAT_TRIGGERS_ENABLED) return null;
  if (!isMorningBriefingTimeWindow()) return null;

  const dateStr = anchorDate && String(anchorDate).trim() ? String(anchorDate).trim() : null;
  if (!dateStr) return null;

  const tdee = Number(userTargets?.kcal);
  if (!Number.isFinite(tdee) || tdee <= 0) return null;
  if (!fullHistory || typeof fullHistory !== 'object') return null;

  const yesterday = addDays(dateStr, -1);
  const log = getLogFromStoricoTree(fullHistory, yesterday) || [];
  const kcal = sumFoodKcalFromLog(log);

  const threshold = tdee * 0.9;
  const status = kcal < threshold ? 'deficit' : 'surplus';

  return { type: 'morning_briefing', status, handled: false };
}

export function getMorningBriefingVerdict(yesterdayStatus, activity) {
  if (yesterdayStatus === 'deficit' && activity === 'weights') {
    return '🔴 Allarme catabolismo. Arrivi da un deficit e i pesi richiedono energia. Il digiuno oggi rischia di smontare massa magra. Fai una colazione con 25-30g di proteine per proteggere i muscoli.';
  }
  if (yesterdayStatus === 'surplus' && activity === 'rest') {
    return '🟢 Via libera. Ieri hai ricaricato le scorte e oggi non hai grossi dispendi in programma. Ottima giornata per prolungare il digiuno, stimolare l\'autofagia e ossidare grassi. Punta al primo pasto verso le 13:00.';
  }
  return '🟡 Situazione intermedia. Puoi mantenere il digiuno per un po\', ma ascolta il corpo. Al primo segnale di stanchezza o calo di focus, rompi il digiuno con una fonte di proteine e grassi buoni.';
}

export function getYesterdayCalorieStatus(fullHistory, userTargets, anchorDateStr) {
  const dateStr = anchorDateStr && String(anchorDateStr).trim() ? String(anchorDateStr).trim() : null;
  if (!dateStr) return null;
  const tdee = Number(userTargets?.kcal);
  if (!Number.isFinite(tdee) || tdee <= 0) return null;
  if (!fullHistory || typeof fullHistory !== 'object') return null;
  const yesterday = addDays(dateStr, -1);
  const log = getLogFromStoricoTree(fullHistory, yesterday) || [];
  const kcal = sumFoodKcalFromLog(log);
  const threshold = tdee * 0.9;
  return kcal < threshold ? 'deficit' : 'surplus';
}

export function buildPostWorkoutCoachMessage(yesterdayStatus, activity, workoutLabel) {
  const safe = String(workoutLabel || 'allenamento').trim() || 'allenamento';
  const base =
    yesterdayStatus === 'deficit' || yesterdayStatus === 'surplus'
      ? getMorningBriefingVerdict(yesterdayStatus, activity)
      : '📊 Dati sulle calorie di ieri incompleti: resta prudente con digiuno prolungato prima di sforzi intensi.';

  if (yesterdayStatus === 'deficit' && activity === 'weights') {
    return `${base} Visto il deficit di ieri, «${safe}» è impegnativo: tieni pronta una quota proteica (25–40g) entro 1–2 ore dal workout; se sei a digiuno, almeno 20g proteine 60–90 min prima o uno shake subito dopo.`;
  }
  if (activity === 'weights') {
    return `${base} Per «${safe}»: idratazione durante la sessione; post-workout bilancia proteine con un po' di carboidrato se la prossima cena è lontana.`;
  }
  if (activity === 'cardio') {
    return `${base} Per il cardio («${safe}»): se l'orario è distante dai pasti, uno spuntino leggero 1–2h prima va bene; recupera liquidi e sodio se la sessione è lunga.`;
  }
  return `${base} (Allenamento «${safe}» registrato.)`;
}

export function markMorningBriefingShown(trackerDateStr) {
  if (typeof window === 'undefined' || !trackerDateStr) return;
  window.localStorage.setItem(`${LS_MORNING_BRIEFING_SHOWN}_${trackerDateStr}`, '1');
}

export function markEveningBriefingShown(trackerDateStr) {
  if (typeof window === 'undefined' || !trackerDateStr) return;
  window.localStorage.setItem(`${LS_EVENING_BRIEFING_SHOWN}_${trackerDateStr}`, '1');
}

/**
 * Notifiche proattive Kentu — DISABILITATE.
 * Nessun messaggio in chat, nessun badge, nessun setInterval orario.
 */
export function useSmartKentuTriggers(activeLog, trackerDateStr, fullHistory, userTargets, bodyBatteryMaxCapacity = 100) {
  void activeLog;
  void trackerDateStr;
  void fullHistory;
  void userTargets;
  void bodyBatteryMaxCapacity;

  const dismissKentuSleepTrigger = useCallback(() => {
    writeDismissPatch(trackerDateStr, { sleep: true });
  }, [trackerDateStr]);

  const dismissKentuAgendaTrigger = useCallback(() => {
    writeDismissPatch(trackerDateStr, { agenda: true });
  }, [trackerDateStr]);

  const dismissKentuActiveTrigger = useCallback(() => {
    dismissKentuSleepTrigger();
    dismissKentuAgendaTrigger();
  }, [dismissKentuSleepTrigger, dismissKentuAgendaTrigger]);

  return {
    activeTrigger: null,
    chatNotificationBadge: false,
    dismissKentuSleepTrigger,
    dismissKentuAgendaTrigger,
    dismissKentuActiveTrigger,
  };
}
