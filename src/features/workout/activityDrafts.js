import { stripUndefined } from '../../utils/firebasePayloadUtils';

export function activityDraftsDbPath(uid, dateIso) {
  const user = String(uid || '').trim();
  const day = String(dateIso || '').slice(0, 10);
  return `users/${user}/activityDrafts/${day}`;
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

  return stripUndefined({
    id: draftId,
    date: String(date || '').slice(0, 10),
    createdAt: Date.now(),
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

export function listActivityDraftsFromSnapshot(raw) {
  if (!raw) return [];
  const values = Array.isArray(raw)
    ? raw
    : (typeof raw === 'object' ? Object.values(raw) : []);
  return values
    .filter((item) => item && typeof item === 'object' && item.id)
    .map((item) => ({
      ...item,
      kind: item.kind || 'activity-draft',
      source: item.source || 'ai-chat',
      type: item.type || 'ghost_workout',
      isGhost: true,
    }))
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
