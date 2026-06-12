import {
  MAIN_BOTTOM_TAB_ORDER,
  PERSISTED_BOTTOM_TAB_IDS,
  ACTIVE_BOTTOM_TAB_LS_KEY,
  EVENT_USAGE_LS_KEY,
  EVENT_USAGE_DEFAULT,
  AI_COACH_DISMISSED_INSIGHTS_LS_KEY,
  MEAL_CONFIRM_DEBOUNCE_MS,
} from '../constants/salaComandiConstants';

export function migrateIdealStrategy(raw) {
  const defaults = {
    colazione: 400,
    snack: 250,
    pranzo: 700,
    cena: 500,
    allenamento: 300,
  };
  if (!raw || typeof raw !== 'object') return { ...defaults };
  const legacySnack =
    Number(raw.snack ?? raw.merenda_pm ?? raw.merenda_am ?? raw.spuntino) || 250;
  const next = { ...defaults, ...raw };
  if (next.snack == null || Number.isNaN(Number(next.snack))) next.snack = legacySnack;
  delete next.merenda_am;
  delete next.merenda_pm;
  delete next.spuntino;
  return next;
}

export function readPersistedActiveBottomTab() {
  if (typeof localStorage === 'undefined') return 'oggi';
  try {
    const v = localStorage.getItem(ACTIVE_BOTTOM_TAB_LS_KEY);
    if (v && PERSISTED_BOTTOM_TAB_IDS.includes(v)) return v;
  } catch {
    /* ignore */
  }
  return 'oggi';
}

export function readPersistedEventUsage() {
  if (typeof localStorage === 'undefined') return { ...EVENT_USAGE_DEFAULT };
  try {
    const raw = localStorage.getItem(EVENT_USAGE_LS_KEY);
    if (!raw) return { ...EVENT_USAGE_DEFAULT };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EVENT_USAGE_DEFAULT };
    return {
      pasto: Math.max(0, Number(parsed.pasto) || 0),
      allenamento: Math.max(0, Number(parsed.allenamento) || 0),
      acqua: Math.max(0, Number(parsed.acqua) || 0),
      nap: Math.max(0, Number(parsed.nap) || 0),
      supplements: Math.max(0, Number(parsed.supplements) || 0),
    };
  } catch {
    return { ...EVENT_USAGE_DEFAULT };
  }
}

export function readDismissedAiCoachInsights() {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(AI_COACH_DISMISSED_INSIGHTS_LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Ore decimali di sonno da addormentamento a risveglio (attraversa mezzanotte). */
export function computeSleepDurationHours(bedDecimal, wakeDecimal) {
  const b = Number(bedDecimal);
  const w = Number(wakeDecimal);
  if (!Number.isFinite(b) || !Number.isFinite(w)) return 0;
  let dur = w - b;
  if (dur <= 0) dur += 24;
  return Math.round(Math.min(24, Math.max(0, dur)) * 100) / 100;
}

export function kentuChatStorageKey(dateStr) {
  return `kentu_chat_${dateStr}`;
}

export function readKentuChatHistoryFromLocalStorage(dateStr) {
  try {
    const raw = localStorage.getItem(kentuChatStorageKey(dateStr));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const cleaned = parsed.filter(
      (m) => m && (m.sender === 'user' || m.sender === 'ai') && !m.isTyping
    );
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

function isKentuChatPersistableMessage(m) {
  if (!m || m.isTyping) return false;
  const t = (m.text || '').trim();
  if (
    m.sender === 'ai' &&
    (t.startsWith('❌') || t.includes('Errore Server') || t.includes('Nessuna API Key'))
  ) {
    return false;
  }
  return true;
}

export function kentuChatHistoryForPersistence(messages) {
  return (messages || []).filter(isKentuChatPersistableMessage);
}

export function getNowDecimalHourForPlanMerge() {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

export function tryAcquireMealConfirmGuard(guardRef) {
  const g = guardRef.current;
  const now = Date.now();
  if (g.busy || now - g.lastAt < MEAL_CONFIRM_DEBOUNCE_MS) return false;
  g.busy = true;
  g.lastAt = now;
  return true;
}

export function releaseMealConfirmGuard(guardRef) {
  guardRef.current.busy = false;
}

export function coachEvalSemanticEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.period !== b.period) return false;
  const sa = a.suggestion;
  const sb = b.suggestion;
  if ((sa == null) !== (sb == null)) return false;
  if (sa && sb) {
    if (sa.ruleId !== sb.ruleId || sa.message !== sb.message || Number(sa.priority) !== Number(sb.priority)) {
      return false;
    }
    const am = sa.action?.mealType ?? null;
    const bm = sb.action?.mealType ?? null;
    if (am !== bm) return false;
  }
  const xa = a.state;
  const xb = b.state;
  if ((xa == null) !== (xb == null)) return false;
  if (xa && xb) {
    if (
      Number(xa.totalCalories) !== Number(xb.totalCalories)
      || Number(xa.mealCount) !== Number(xb.mealCount)
      || Number(xa.totalProt ?? 0) !== Number(xb.totalProt ?? 0)
      || Number(xa.foodCount ?? 0) !== Number(xb.foodCount ?? 0)
      || Number(xa.targetCalories ?? -1) !== Number(xb.targetCalories ?? -1)
      || Number(xa.breakfastShare ?? -1) !== Number(xb.breakfastShare ?? -1)
      || Number(xa.protPerKcal ?? -1) !== Number(xb.protPerKcal ?? -1)
    ) {
      return false;
    }
  }
  return true;
}
