import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTodayString } from '../../coreEngine';
import {
  DAILY_PROTOCOL_STATUS,
  getDailyProtocolDef,
  isDailyProtocolId,
} from './dailyProtocols';
import { buildDraftsFromTimeline } from './generateDraftsFromTimeline';
import { enqueueProtocolActivityDrafts } from './protocolDraftCommitBus';

const STORAGE_KEY = 'kentu_daily_protocol_v1';

function asDraftList(value) {
  return (Array.isArray(value) ? value : []).filter((item) => item && typeof item === 'object' && item.id);
}

function asTimelineList(value) {
  return (Array.isArray(value) ? value : []).filter((item) => item && typeof item === 'object');
}

function persistableSnapshot(current = {}, patch = {}) {
  const base = current && typeof current === 'object' ? current : {};
  return {
    date: String(base.date || getTodayString()).slice(0, 10),
    activeDailyProtocol: base.activeDailyProtocol ?? null,
    protocolStatus: base.protocolStatus || DAILY_PROTOCOL_STATUS.PLANNING,
    protocolMealDrafts: asDraftList(base.protocolMealDrafts),
    protocolActivityDrafts: asDraftList(base.protocolActivityDrafts),
    protocolTimeline: asTimelineList(base.protocolTimeline),
    isGenerating: base.isGenerating === true,
    isProtocolBannerDismissed: base.isProtocolBannerDismissed === true,
    ...patch,
  };
}

function emptySnapshot(dateIso = '') {
  return {
    date: String(dateIso || getTodayString()).slice(0, 10),
    activeDailyProtocol: null,
    protocolStatus: DAILY_PROTOCOL_STATUS.PLANNING,
    protocolMealDrafts: [],
    protocolActivityDrafts: [],
    protocolTimeline: [],
    isGenerating: false,
    isProtocolBannerDismissed: false,
  };
}

function normalizeSnapshot(raw, todayIso) {
  const today = String(todayIso || getTodayString()).slice(0, 10);
  const date = String(raw?.date || '').slice(0, 10);
  if (date !== today) return emptySnapshot(today);
  const protocolId = isDailyProtocolId(raw?.activeDailyProtocol)
    ? String(raw.activeDailyProtocol)
    : null;
  const statusRaw = String(raw?.protocolStatus || '').trim();
  const protocolStatus = protocolId
    ? (
      statusRaw === DAILY_PROTOCOL_STATUS.COMPLETED
        ? DAILY_PROTOCOL_STATUS.COMPLETED
        : statusRaw === DAILY_PROTOCOL_STATUS.PLANNING
          ? DAILY_PROTOCOL_STATUS.PLANNING
          : DAILY_PROTOCOL_STATUS.ACTIVE
    )
    : DAILY_PROTOCOL_STATUS.PLANNING;
  return {
    date: today,
    activeDailyProtocol: protocolId,
    protocolStatus,
    protocolMealDrafts: protocolId ? asDraftList(raw?.protocolMealDrafts) : [],
    protocolActivityDrafts: protocolId ? asDraftList(raw?.protocolActivityDrafts) : [],
    protocolTimeline: protocolId ? asTimelineList(raw?.protocolTimeline) : [],
    isGenerating: false,
    isProtocolBannerDismissed: Boolean(raw?.isProtocolBannerDismissed),
  };
}

function readSnapshot() {
  const today = getTodayString();
  if (typeof localStorage === 'undefined') return emptySnapshot(today);
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return normalizeSnapshot(raw && typeof raw === 'object' ? raw : null, today);
  } catch {
    return emptySnapshot(today);
  }
}

function persistSnapshot(next) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

let snapshot = readSnapshot();
const listeners = [];

function emit(next) {
  snapshot = next;
  persistSnapshot(next);
  listeners.forEach((listener) => listener(snapshot));
}

function refreshIfNewDay() {
  const today = getTodayString();
  if (snapshot.date === today) return snapshot;
  const next = emptySnapshot(today);
  emit(next);
  return next;
}

export function getActiveDailyProtocol() {
  return refreshIfNewDay().activeDailyProtocol;
}

export function getProtocolStatus() {
  return refreshIfNewDay().protocolStatus;
}

export function getDailyProtocolSnapshot() {
  return refreshIfNewDay();
}

export function setActiveDailyProtocol(protocolId, status = DAILY_PROTOCOL_STATUS.PLANNING) {
  const today = getTodayString();
  const current = refreshIfNewDay();
  const id = isDailyProtocolId(protocolId) ? String(protocolId) : null;
  const allowed = new Set(Object.values(DAILY_PROTOCOL_STATUS));
  const nextStatus = id
    ? (allowed.has(status) ? status : DAILY_PROTOCOL_STATUS.PLANNING)
    : DAILY_PROTOCOL_STATUS.PLANNING;
  const sameProtocol = id && id === current.activeDailyProtocol;
  emit(persistableSnapshot(current, {
    date: today,
    activeDailyProtocol: id,
    protocolStatus: nextStatus,
    protocolMealDrafts: sameProtocol ? asDraftList(current.protocolMealDrafts) : [],
    protocolActivityDrafts: sameProtocol ? asDraftList(current.protocolActivityDrafts) : [],
    protocolTimeline: sameProtocol ? asTimelineList(current.protocolTimeline) : [],
    isGenerating: false,
  }));
  return getDailyProtocolSnapshot();
}

export function setProtocolStatus(status) {
  const today = getTodayString();
  const current = refreshIfNewDay();
  const allowed = new Set(Object.values(DAILY_PROTOCOL_STATUS));
  const nextStatus = allowed.has(status) ? status : current.protocolStatus;
  emit(persistableSnapshot(current, {
    date: today,
    activeDailyProtocol: current.activeDailyProtocol,
    protocolStatus: current.activeDailyProtocol
      ? nextStatus
      : DAILY_PROTOCOL_STATUS.PLANNING,
    protocolMealDrafts: current.activeDailyProtocol ? asDraftList(current.protocolMealDrafts) : [],
    protocolActivityDrafts: current.activeDailyProtocol ? asDraftList(current.protocolActivityDrafts) : [],
    protocolTimeline: current.activeDailyProtocol ? asTimelineList(current.protocolTimeline) : [],
    isGenerating: false,
  }));
  return getDailyProtocolSnapshot();
}

export function setProtocolGenerating(flag) {
  const current = refreshIfNewDay();
  emit(persistableSnapshot(current, {
    isGenerating: Boolean(flag),
  }));
  return getDailyProtocolSnapshot();
}

export function setProtocolTimeline(events) {
  const current = refreshIfNewDay();
  emit(persistableSnapshot(current, {
    protocolTimeline: asTimelineList(events),
    isGenerating: false,
  }));
  return getDailyProtocolSnapshot();
}

/**
 * Converte la timeline approvata in bozze e le scrive nello store (pasti + attività).
 * Le bozze attività vengono anche inoltrate a `useActivityDrafts` via bus.
 */
export function generateDraftsFromTimeline(protocolId, timelineEvents) {
  const current = refreshIfNewDay();
  const id = isDailyProtocolId(protocolId)
    ? String(protocolId)
    : current.activeDailyProtocol;
  if (!id) {
    return { mealDrafts: [], activityDrafts: [] };
  }
  const events = Array.isArray(timelineEvents) && timelineEvents.length > 0
    ? timelineEvents
    : asTimelineList(current.protocolTimeline);
  const { mealDrafts, activityDrafts } = buildDraftsFromTimeline(id, events);
  emit(persistableSnapshot(current, {
    date: current.date,
    activeDailyProtocol: id,
    protocolStatus: current.protocolStatus,
    protocolMealDrafts: mealDrafts,
    protocolActivityDrafts: activityDrafts,
    protocolTimeline: events,
    isGenerating: false,
  }));
  enqueueProtocolActivityDrafts({
    drafts: activityDrafts,
    replaceAutoAiProposals: true,
  });
  return { mealDrafts, activityDrafts };
}

export function clearDailyProtocol() {
  return setActiveDailyProtocol(null);
}

export function setProtocolBannerDismissed(dismissed = true) {
  const current = refreshIfNewDay();
  emit(persistableSnapshot(current, {
    isProtocolBannerDismissed: Boolean(dismissed),
  }));
  return getDailyProtocolSnapshot();
}

/**
 * Store globale dei Protocolli Giornalieri (oggi). Si azzera a mezzanotte.
 * @returns {{
 *   activeDailyProtocol: string | null,
 *   protocolStatus: 'planning' | 'active' | 'completed',
 *   protocolMealDrafts: object[],
 *   protocolActivityDrafts: object[],
 *   protocolDef: object | null,
 *   activateProtocol: (id: string) => void,
 *   setProtocolStatus: (status: string) => void,
 *   generateDraftsFromTimeline: (id: string, events?: object[]) => object,
 *   clearProtocol: () => void,
 * }}
 */
export function useDailyProtocol() {
  const [state, setState] = useState(() => getDailyProtocolSnapshot());

  useEffect(() => {
    const listener = (next) => setState(next);
    listeners.push(listener);
    setState(getDailyProtocolSnapshot());
    const tick = window.setInterval(() => {
      setState(getDailyProtocolSnapshot());
    }, 60_000);
    return () => {
      window.clearInterval(tick);
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  }, []);

  const activateProtocol = useCallback((id) => {
    setActiveDailyProtocol(id);
  }, []);

  const updateStatus = useCallback((status) => {
    setProtocolStatus(status);
  }, []);

  const clearProtocol = useCallback(() => {
    clearDailyProtocol();
  }, []);

  const protocolDef = useMemo(
    () => getDailyProtocolDef(state.activeDailyProtocol),
    [state.activeDailyProtocol],
  );

  return {
    activeDailyProtocol: state.activeDailyProtocol,
    protocolStatus: state.protocolStatus,
    protocolMealDrafts: asDraftList(state.protocolMealDrafts),
    protocolActivityDrafts: asDraftList(state.protocolActivityDrafts),
    protocolTimeline: asTimelineList(state.protocolTimeline),
    isGenerating: state.isGenerating === true,
    isProtocolBannerDismissed: state.isProtocolBannerDismissed === true,
    protocolDef,
    activateProtocol,
    setProtocolStatus: updateStatus,
    generateDraftsFromTimeline,
    dismissProtocolBanner: () => setProtocolBannerDismissed(true),
    clearProtocol,
  };
}
