import { useMemo, useState, useEffect, useCallback } from 'react';

const LS_DISMISS = 'kentu_smart_trigger_dismiss_v1';

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

/**
 * Notifiche proattive Kentu: sonno (mattina) → agenda giornaliera.
 * @returns {{ activeTrigger: 'sleep'|'agenda'|null, chatNotificationBadge: boolean, dismissKentuSleepTrigger: function, dismissKentuAgendaTrigger: function, dismissKentuActiveTrigger: function }}
 */
export function useSmartKentuTriggers(activeLog, trackerDateStr) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60000);
    return () => window.clearInterval(id);
  }, []);

  const dismissed = useMemo(() => readDismiss(trackerDateStr), [trackerDateStr, tick]);

  const rawTrigger = useMemo(() => {
    void tick;
    const h = new Date().getHours();
    if (h >= 6 && h < 11) {
      const sleepHandled = sleepDataComplete(activeLog) || dismissed.sleep;
      if (!sleepHandled) return 'sleep';
      if (!dismissed.agenda) return 'agenda';
    }
    return null;
  }, [activeLog, dismissed.sleep, dismissed.agenda, tick]);

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
