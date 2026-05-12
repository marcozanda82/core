import {
  addDays,
  getLogFromStoricoTree,
  toCanonicalMealType,
  normalizeMealFoodsArray,
} from '../../../coreEngine';
import { mealFoodsRead } from './planningUtils';
import { ghostSurfaceDraftToProposalItems } from './foodUtils';

export function getMealTimeFromLogItem(item) {
  if (!item) return null;
  const mt = Number(item.mealTime);
  if (Number.isFinite(mt)) return mt;
  const t = Number(item.time);
  return Number.isFinite(t) ? t : null;
}

export function normalizeWorkoutSearchKey(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatDecimalHourIt(dec) {
  const d = Number(dec);
  if (!Number.isFinite(d)) return '';
  let h = Math.floor(d);
  let m = Math.round((d - h) * 60);
  if (m >= 60) {
    h += Math.floor(m / 60);
    m %= 60;
  }
  h %= 24;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Ora di timeline per workout/attività/ghost_workout: solo se definita esplicitamente
 * (`time`, `mealTime`, `hour` come numero o stringa parsabile). Nessun default a mezzogiorno.
 * @param {object | null | undefined} entry
 * @returns {number | null} ore decimali 0–23.99 o null se assente/invalida
 */
export function resolveActivityOrWorkoutTimelineHour(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const clamp = (x) => Math.max(0, Math.min(23.99, x));
  const tNum = Number(entry.time);
  if (Number.isFinite(tNum)) return clamp(tNum);
  const mtNum = Number(entry.mealTime);
  if (Number.isFinite(mtNum)) return clamp(mtNum);
  const hNum = Number(entry.hour);
  if (Number.isFinite(hNum)) return clamp(hNum);
  const raw = entry.time ?? entry.mealTime ?? entry.hour;
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const p = parseFlexibleTimeToDecimal(s);
  if (p == null || Number.isNaN(p)) return null;
  return clamp(p);
}

export function parseFlexibleTimeToDecimal(text) {
  const s = String(text || '').trim().toLowerCase();
  const m = s.match(/\b(\d{1,2})[:h.](\d{2})\b/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min < 60) return Math.round((h + min / 60) * 100) / 100;
  }
  const m2 = s.match(/\b(\d{1,2})\s*,\s*(\d{2})\b/);
  if (m2) {
    const h = parseInt(m2[1], 10);
    const min = parseInt(m2[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min < 60) return Math.round((h + min / 60) * 100) / 100;
  }
  const m3 = s.match(/\b(\d{1,2})\s*(?:e\s*mezza)\b/);
  if (m3) {
    const h = parseInt(m3[1], 10);
    if (h >= 0 && h < 24) return h + 0.5;
  }
  return null;
}

export function extractWorkoutSearchKeysFromMessage(normMsg) {
  const parts = normMsg.split(/\s+/).filter(Boolean);
  const skip = new Set([
    'oggi', 'stasera', 'ieri', 'allenamento', 'di', 'il', 'la', 'lo', 'per', 'un', 'una', 'ho', 'fare', 'faccio', 'faro', 'farò',
    'programmo', 'voglio', 'devo', 'andare', 'in', 'palestra', 'con', 'del', 'dei', 'della',
  ]);
  return [...new Set(parts.filter((p) => p.length > 2 && !skip.has(p)))];
}

/** Rileva intento allenamento in chat (solo giorno corrente, prima della chiamata API). */
export function detectWorkoutIntentFromChat(raw) {
  const m = String(raw || '').trim();
  if (m.length < 4) return null;
  const norm = normalizeWorkoutSearchKey(m);
  if (/\b(ho mangiato|logga\s+pasto|registra(?:\s+il)?\s*pasto)\b/i.test(m) && !/\ballenamento\b|\bpalestra\b|\bpesi\b/i.test(m)) {
    return null;
  }
  const hasStrong =
    /\ballenamento\b|\bpalestra\b|\bpesi\b|workout|crossfit|push\s*day|pull\s*day|leg\s*day|\bcardio\b|\bcorsa\b|\bhiit\b/i.test(m);
  const hasBody = /\b(petto|schiena|gambe|braccia|glutei|spalle|bicipiti|tricipiti|addome|dorso|quadricipiti|polpacci)\b/i.test(m);
  if (!hasStrong) {
    if (!hasBody) return null;
    if (!/\b(faccio|farò|faro|oggi|stasera|programmo|voglio|allen)\b/i.test(norm)) return null;
  }
  let activity = 'weights';
  if (/\bcorsa\b|\bcardio\b|\bcamminata\b|\bhiit\b|bike|spinning|ellittica|nuot/i.test(m)) activity = 'cardio';

  let displayLabel = m.replace(/\s+/g, ' ');
  const am = m.match(/\ballenamento\s+(?:di\s+|da\s+)?([^.!?\n]{2,40})/i);
  if (am) displayLabel = am[1].trim().replace(/\s+$/, '');
  else {
    const bm = m.match(/\b(petto|schiena|gambe|braccia|glutei|spalle|bicipiti|tricipiti|push|pull|legs|dorso)\b/i);
    if (bm) displayLabel = bm[0];
  }

  const keys = extractWorkoutSearchKeysFromMessage(normalizeWorkoutSearchKey(displayLabel));
  const fullKeys = [...new Set([...keys, normalizeWorkoutSearchKey(displayLabel)])].filter(Boolean);
  if (fullKeys.length === 0) fullKeys.push(normalizeWorkoutSearchKey(displayLabel));
  return { displayLabel, activity, searchKeys: fullKeys };
}

export function findLastMatchingWorkoutSlot(fullHistory, anchorDateStr, searchKeys) {
  if (!fullHistory || typeof fullHistory !== 'object' || !anchorDateStr || !searchKeys?.length) return null;
  for (let i = 1; i < 90; i++) {
    const dStr = addDays(anchorDateStr, -i);
    const log = getLogFromStoricoTree(fullHistory, dStr) || [];
    const workouts = log.filter(
      (e) => e && (e.type === 'workout' || e.type === 'work' || e.type === 'activity' || e.type === 'cognitive')
    );
    for (const w of workouts) {
      const desc = normalizeWorkoutSearchKey((w.desc || w.name || w.label || '').trim());
      if (!desc) continue;
      const hit = searchKeys.some(
        (k) =>
          k.length >= 3 &&
          (desc.includes(k) || k.includes(desc.slice(0, Math.min(14, desc.length))))
      );
      if (hit) {
        const t = getMealTimeFromLogItem(w) ?? (typeof w.time === 'number' ? w.time : null);
        if (t != null && Number.isFinite(t)) {
          return { decimalHour: t, sourceLabel: w.desc || w.name || '' };
        }
      }
    }
  }
  return null;
}

/** Tipi pasto già consumati (reali, non ghost) con orario ≤ ora: bloccano un nuovo ghost sullo stesso slot. */
export function buildPastOnlyRealMealTypeSet(srcLog, nowDec) {
  const set = new Set();
  (srcLog || []).forEach((n) => {
    if (!n || n.isGhost || (n.type !== 'food' && n.type !== 'recipe') || !n.mealType) return;
    const dec = Number(n.mealTime);
    if (Number.isNaN(dec) || dec > nowDec) return;
    const mt = toCanonicalMealType(String(n.mealType).split('_')[0]);
    if (mt) set.add(mt);
  });
  return set;
}

/** Rimuove ghost_meal e i pasti reali futuri che verranno sostituiti da ghost nel piano (stesso mealType). */
export function buildBaseLogForGhostPlanMerge(srcLog, ghostList, nowDec) {
  const ghostMt = new Set(
    (ghostList || [])
      .map((gm) => toCanonicalMealType(String(gm.mealType || 'pranzo').split('_')[0]))
      .filter(Boolean)
  );
  return (srcLog || []).filter((e) => {
    if (!e) return false;
    if (e.type === 'ghost_meal') return false;
    if ((e.type === 'food' || e.type === 'recipe') && !e.isGhost) {
      const dec = Number(e.mealTime);
      if (!Number.isNaN(dec) && dec > nowDec) {
        const mt = toCanonicalMealType(String(e.mealType || '').split('_')[0]);
        if (mt && ghostMt.has(mt)) return false;
      }
    }
    return true;
  });
}

/**
 * Deduplica payload ghost meal del wizard/piano:
 * - usa slot key `getSlotKey(gm)` (mealType canonico + mealTime)
 * - tiene l'ultima entry per slot.
 * @param {Array<object>} ghostList
 * @param {(gm: object) => string} getSlotKey
 */
export function dedupeGhostMealsPayloadForConfirm(ghostList, getSlotKey) {
  const seen = new Set();
  const out = [];
  for (let i = (ghostList || []).length - 1; i >= 0; i--) {
    const gm = ghostList[i];
    const key = getSlotKey(gm);
    if (seen.has(key)) continue;
    seen.add(key);
    out.unshift(gm);
  }
  return out;
}

/** Id log stabile da payload wizard/piano (`ghost_meal_<id>`) o batch timestamp se manca id. */
export function ghostMealLogEntryIdFromPayload(gm, index, batchTs) {
  const rawId = gm.id != null && String(gm.id).trim() !== '' ? String(gm.id).trim() : '';
  if (rawId) {
    const safe = rawId.replace(/[^\w\-]/g, '_');
    return `ghost_meal_${safe}`;
  }
  return `ghost_meal_${batchTs}_${index}`;
}

/** Nodo timeline ghost: `foods` in forma canonica (da log o da draftFoods). */
export function normalizeGhostFoodsForTimelineNode(e) {
  const fromLog = normalizeMealFoodsArray(mealFoodsRead(e));
  if (fromLog.length > 0) return fromLog;
  return normalizeMealFoodsArray(ghostSurfaceDraftToProposalItems(e?.draftFoods));
}
