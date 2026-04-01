import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { addDays } from './calendarDateUtils';
import { getLogFromStoricoTree } from './coreEngine';

const LS_DISMISS = 'kentu_smart_trigger_dismiss_v1';
const LS_MORNING_BRIEFING_SHOWN = 'kentu_morning_briefing_shown_v1';

function readDismiss(dateStr) {
  if (typeof window === 'undefined' || !dateStr) return {};
  try {
    const raw = window.localStorage.getItem(`${LS_DISMISS}_${dateStr}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeDismissPatch(dateStr, patch) {
  if (typeof window === 'undefined' || !dateStr) return;
  const cur = readDismiss(dateStr);
  window.localStorage.setItem(`${LS_DISMISS}_${dateStr}`, JSON.stringify({ ...cur, ...patch }));
}

function sleepDataComplete(log) {
  const s = (log || []).find((e) => e && e.type === 'sleep');
  if (!s) return false;
  const h = Number(s.hours ?? s.duration ?? 0);
  return Number.isFinite(h) && h > 0;
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

/** Finestra storica sonno + agenda (stessa logica precedente: prima delle 11:00). */
function isSleepAgendaMorningWindow() {
  if (typeof window === 'undefined') return false;
  const now = new Date();
  const decimal = now.getHours() + now.getMinutes() / 60;
  return decimal >= 6 && decimal < 11;
}

/**
 * Valuta se mostrare il Morning Briefing (solo orario + dati ieri vs TDEE).
 * Il chiamante deve limitare a una volta al giorno con localStorage (vedi hook).
 * @returns {{ type: 'morning_briefing', status: 'deficit'|'surplus', handled: false } | null}
 */
export function checkMorningBriefing(fullHistory, userTargets, anchorDate) {
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

/**
 * @param {'deficit'|'surplus'} yesterdayStatus
 * @param {'weights'|'cardio'|'rest'} activity
 */
export function getMorningBriefingVerdict(yesterdayStatus, activity) {
  if (yesterdayStatus === 'deficit' && activity === 'weights') {
    return '🔴 Allarme catabolismo. Arrivi da un deficit e i pesi richiedono energia. Il digiuno oggi rischia di smontare massa magra. Fai una colazione con 25-30g di proteine per proteggere i muscoli.';
  }
  if (yesterdayStatus === 'surplus' && activity === 'rest') {
    return '🟢 Via libera. Ieri hai ricaricato le scorte e oggi non hai grossi dispendi in programma. Ottima giornata per prolungare il digiuno, stimolare l\'autofagia e ossidare grassi. Punta al primo pasto verso le 13:00.';
  }
  return '🟡 Situazione intermedia. Puoi mantenere il digiuno per un po\', ma ascolta il corpo. Al primo segnale di stanchezza o calo di focus, rompi il digiuno con una fonte di proteine e grassi buoni.';
}

/**
 * Bilancio ieri vs TDEE (stessa logica di checkMorningBriefing).
 * @returns {'deficit'|'surplus'|null}
 */
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

/**
 * Verdetto Kentu dopo log allenamento: incrocia ieri + tipo sessione + etichetta.
 */
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

function morningBriefingShownForDate(trackerDateStr) {
  if (typeof window === 'undefined' || !trackerDateStr) return true;
  return window.localStorage.getItem(`${LS_MORNING_BRIEFING_SHOWN}_${trackerDateStr}`) === '1';
}

export function markMorningBriefingShown(trackerDateStr) {
  if (typeof window === 'undefined' || !trackerDateStr) return;
  window.localStorage.setItem(`${LS_MORNING_BRIEFING_SHOWN}_${trackerDateStr}`, '1');
}

/**
 * Notifiche proattive Kentu: sonno (mattina) → agenda → morning briefing (digiuno/colazione).
 * @returns {{ activeTrigger: 'sleep'|'agenda'|'morning_briefing'|null, chatNotificationBadge: boolean, dismissKentuSleepTrigger: function, dismissKentuAgendaTrigger: function, dismissKentuActiveTrigger: function }}
 */
export function useSmartKentuTriggers(activeLog, trackerDateStr, fullHistory, userTargets) {
  const [tick, setTick] = useState(0);
  const prevSleepCompleteRef = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  /** Ricalcolo immediato dei trigger quando il sonno diventa completo nel log (es. conferma da chat/screenshot). */
  useEffect(() => {
    const complete = sleepDataComplete(activeLog);
    if (complete && !prevSleepCompleteRef.current) {
      setTick((t) => t + 1);
    }
    prevSleepCompleteRef.current = complete;
  }, [activeLog]);

  const dismissed = useMemo(() => readDismiss(trackerDateStr), [trackerDateStr, tick]);

  const rawTrigger = useMemo(() => {
    void tick;
    const dateStr = trackerDateStr || '';
    const sleepHandled = sleepDataComplete(activeLog) || dismissed.sleep;

    if (isSleepAgendaMorningWindow()) {
      if (!sleepHandled) return 'sleep';
      if (!dismissed.agenda) return 'agenda';
    }

    const briefing = checkMorningBriefing(fullHistory, userTargets, dateStr);
    if (
      briefing &&
      !morningBriefingShownForDate(dateStr) &&
      sleepHandled &&
      dismissed.agenda
    ) {
      return 'morning_briefing';
    }

    return null;
  }, [activeLog, dismissed.sleep, dismissed.agenda, tick, fullHistory, userTargets, trackerDateStr]);

  const activeTrigger = useMemo(() => {
    if (!rawTrigger) return null;
    if (rawTrigger === 'sleep' && dismissed.sleep) return null;
    if (rawTrigger === 'agenda' && dismissed.agenda) return null;
    return rawTrigger;
  }, [rawTrigger, dismissed]);

  const dismissKentuSleepTrigger = useCallback(() => {
    writeDismissPatch(trackerDateStr, { sleep: true });
    setTick((t) => t + 1);
  }, [trackerDateStr]);

  const dismissKentuAgendaTrigger = useCallback(() => {
    writeDismissPatch(trackerDateStr, { agenda: true });
    setTick((t) => t + 1);
  }, [trackerDateStr]);

  const dismissKentuActiveTrigger = useCallback(() => {
    if (activeTrigger === 'sleep') dismissKentuSleepTrigger();
    else if (activeTrigger === 'agenda') dismissKentuAgendaTrigger();
  }, [activeTrigger, dismissKentuSleepTrigger, dismissKentuAgendaTrigger]);

  const chatNotificationBadge = activeTrigger != null;

  return {
    activeTrigger,
    chatNotificationBadge,
    dismissKentuSleepTrigger,
    dismissKentuAgendaTrigger,
    dismissKentuActiveTrigger,
  };
}
