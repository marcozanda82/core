import { stripUndefined } from '../../utils/firebasePayloadUtils';
import { getTodayString } from '../../coreEngine';

export const AI_WORKOUT_PROPOSAL_SOURCE = 'ai-proposal';
export const AI_WORKOUT_PROPOSAL_SEED_SOURCE = 'ai-proposal-seed';

export function activityDraftsRootPath(uid) {
  const user = String(uid || '').trim();
  return `users/${user}/activityDrafts`;
}

export function activityDraftsDbPath(uid, dateIso) {
  const user = String(uid || '').trim();
  const day = String(dateIso || '').slice(0, 10);
  return `users/${user}/activityDrafts/${day}`;
}

function asIsoDay(value) {
  const day = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

export function localIsoFromTimestamp(ms, fallback = '') {
  const ts = Number(ms);
  if (!Number.isFinite(ts) || ts <= 0) return asIsoDay(fallback);
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return asIsoDay(fallback);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function activityDraftCalendarDate(draft, todayIso = '') {
  const today = asIsoDay(todayIso) || getTodayString();
  return asIsoDay(draft?.date)
    || asIsoDay(draft?.createdDate)
    || localIsoFromTimestamp(draft?.createdAt, today);
}

export function isStaleActivityDraft(draft, todayIso = '') {
  const today = asIsoDay(todayIso) || getTodayString();
  const day = activityDraftCalendarDate(draft, today);
  return Boolean(day && day < today);
}

export function isAiProposalSeed(draft) {
  if (!draft || typeof draft !== 'object') return false;
  if (draft.source === AI_WORKOUT_PROPOSAL_SEED_SOURCE) return true;
  if (draft.kind === 'activity-draft-seed') return true;
  return String(draft.id || '').startsWith('ai_proposal_seed_');
}

export function isVisibleActivityDraft(draft) {
  if (!draft || typeof draft !== 'object' || !draft.id) return false;
  if (isAiProposalSeed(draft)) return false;
  return true;
}

export function createAiProposalSeed(dateIso) {
  const date = asIsoDay(dateIso) || getTodayString();
  return {
    id: `ai_proposal_seed_${date}`,
    date,
    createdAt: Date.now(),
    createdDate: date,
    source: AI_WORKOUT_PROPOSAL_SEED_SOURCE,
    kind: 'activity-draft-seed',
    ephemeral: true,
  };
}

export function createActivityDraftId() {
  return `activity_draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function asTrimmedString(value) {
  return String(value ?? '').trim();
}

/**
 * Normalizza il payload ADD_WORKOUT in una bozza persistente, non ancora nel diario.
 */
export function createActivityDraft(workoutPayload = {}, {
  date = '',
  source = 'ai-chat',
  id = null,
} = {}) {
  const payload = workoutPayload && typeof workoutPayload === 'object' ? { ...workoutPayload } : {};
  const workoutName = asTrimmedString(payload.workoutName)
    || asTrimmedString(payload.name)
    || asTrimmedString(payload.title)
    || 'Allenamento';
  const workoutType = asTrimmedString(payload.workoutType || payload.activityType || payload.subType)
    || 'pesi';
  const durationMinutes = Math.max(1, Math.round(Number(payload.durationMinutes) || 45));
  const kcal = Math.max(0, Math.round(Number(payload.estimatedKcal ?? payload.kcal) || 0));
  const exactTime = asTrimmedString(payload.exactTime || payload.timeString);
  const draftId = asTrimmedString(id) || createActivityDraftId();
  const day = String(date || '').slice(0, 10);
  const createdAt = Date.now();

  return stripUndefined({
    id: draftId,
    date: day,
    createdAt,
    createdDate: day || localIsoFromTimestamp(createdAt),
    source,
    kind: 'activity-draft',
    type: 'ghost_workout',
    isGhost: true,
    title: workoutName,
    name: workoutName,
    desc: workoutName,
    workoutName,
    workoutType,
    subType: workoutType,
    activityType: workoutType,
    exactTime: exactTime || null,
    timeString: exactTime || null,
    time: exactTime || null,
    durationMin: durationMinutes,
    durationMinutes,
    kcal,
    estimatedKcal: kcal || null,
    payload: {
      ...payload,
      workoutName,
      workoutType,
      activityType: payload.activityType || workoutType,
      durationMinutes,
      exactTime: exactTime || payload.exactTime || null,
      timeString: exactTime || payload.timeString || null,
      estimatedKcal: kcal || payload.estimatedKcal || null,
    },
  });
}

export function listActivityDraftsFromSnapshot(raw, { todayIso = '', includeStale = false } = {}) {
  if (!raw) return [];
  const today = String(todayIso || getTodayString()).slice(0, 10);
  const values = Array.isArray(raw)
    ? raw
    : (typeof raw === 'object' ? Object.values(raw) : []);
  return values
    .filter((item) => item && typeof item === 'object' && item.id)
    .filter((item) => includeStale || !isStaleActivityDraft(item, today))
    .map((item) => (
      isAiProposalSeed(item)
        ? { ...item, date: item.date || today, createdDate: item.createdDate || item.date || today }
        : {
          ...item,
          kind: item.kind || 'activity-draft',
          source: item.source || 'ai-chat',
          type: item.type || 'ghost_workout',
          isGhost: true,
          createdAt: Number(item.createdAt) || Date.now(),
          createdDate: item.createdDate || item.date || today,
        }
    ))
    .sort((a, b) => (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0));
}

export function draftsToFirebaseMap(list) {
  const out = {};
  (Array.isArray(list) ? list : []).forEach((draft) => {
    if (!draft?.id) return;
    out[String(draft.id)] = stripUndefined(draft);
  });
  return out;
}

function activityLabelFromPayload(payload = {}) {
  const type = asTrimmedString(payload.workoutType || payload.activityType).toLowerCase();
  const name = asTrimmedString(payload.workoutName || payload.name).toLowerCase();
  const hay = `${type} ${name}`;
  if (type === 'corsa' || /\bcors/.test(hay) || /\brun/.test(hay)) return 'la tua corsa';
  if (type === 'camminata' || /\bcammin/.test(hay) || /\bwalk/.test(hay)) return 'la tua camminata';
  if (type === 'hiit' || /\bhiit/.test(hay)) return 'il tuo HIIT';
  if (type === 'cardio' || /\bcardio/.test(hay)) return 'il tuo cardio';
  if (type === 'pesi' || type === 'spinta' || type === 'trazione' || type === 'gambe') {
    return 'la tua sessione di forza';
  }
  if (name) return `la tua ${asTrimmedString(payload.workoutName || payload.name)}`;
  return 'la tua attività';
}

export function buildActivityDraftReadyMessage(payload = {}) {
  return `Ho preparato la bozza per ${activityLabelFromPayload(payload)}. Puoi confermarla nella sezione Sessioni.`;
}

export const OPEN_SESSIONI_QUICK_REPLY = Object.freeze({
  label: 'Apri Sessioni',
  action: 'openSessions',
  intent: 'openSessions',
  variant: 'primary',
});
