import { getTodayString } from '../../coreEngine';
import { createActivityDraft, PROTOCOL_ACTIVITY_DRAFT_SOURCE } from '../workout/activityDrafts';
import { isDailyProtocolId } from './dailyProtocols';

export { PROTOCOL_ACTIVITY_DRAFT_SOURCE };

const MEAL_TITLE_RE = /\b(colazione|pranzo|cena|spuntino|snack|pre[-\s]?workout|preworkout)\b/i;
const ACTIVITY_TITLE_RE = /\b(allenamento|workout|palestra|camminata|corsa|hiit|mobilit[aà]|pesi|gambe|cardio)\b/i;

function asTimeHHmm(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const mins = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function timeToken(hhmm) {
  return String(hhmm || '').replace(':', '');
}

function inferMealType(title = '') {
  const hay = String(title || '').toLowerCase();
  if (/\bcolazione\b/.test(hay) || /\bbreakfast\b/.test(hay)) return 'colazione';
  if (/\bpranzo\b/.test(hay) || /\blunch\b/.test(hay)) return 'pranzo';
  if (/\bcena\b/.test(hay) || /\bdinner\b/.test(hay)) return 'cena';
  return 'snack';
}

function inferWorkoutType(title = '') {
  const hay = String(title || '').toLowerCase();
  if (/\bgambe\b/.test(hay) || /\blegs?\b/.test(hay)) return 'gambe';
  if (/\bcammin/.test(hay) || /\bwalk/.test(hay)) return 'camminata';
  if (/\bcorsa\b/.test(hay) || /\brun/.test(hay)) return 'corsa';
  if (/\bhiit\b/.test(hay)) return 'hiit';
  if (/\bcardio\b/.test(hay)) return 'cardio';
  if (/\bmobilit/.test(hay) || /\bstretch/.test(hay)) return 'altro';
  return 'pesi';
}

function inferDurationMinutes(title = '', workoutType = 'pesi') {
  const match = String(title || '').match(/(\d{1,3})\s*min/i);
  if (match) return Math.max(1, Number(match[1]));
  if (workoutType === 'camminata' || workoutType === 'altro') return 20;
  if (workoutType === 'corsa' || workoutType === 'hiit' || workoutType === 'cardio') return 30;
  return 60;
}

/**
 * @param {object} event
 * @returns {'meal' | 'activity' | null}
 */
export function classifyTimelineEvent(event) {
  if (!event || typeof event !== 'object') return null;
  const kind = String(event.kind || '').trim().toLowerCase();
  const title = String(event.title || event.name || '').trim();
  if (kind === 'meal') return 'meal';
  if (kind === 'activity') return 'activity';
  if (MEAL_TITLE_RE.test(title)) return 'meal';
  if (ACTIVITY_TITLE_RE.test(title)) return 'activity';
  return null;
}

export function createProtocolMealDraft(event, protocolId, dateIso = '') {
  const time = asTimeHHmm(event?.time || event?.exactTime || event?.timeString);
  const title = String(event?.title || event?.name || 'Pasto').trim() || 'Pasto';
  const mealType = inferMealType(title);
  const date = String(dateIso || getTodayString()).slice(0, 10);
  const id = `protocol_meal_${protocolId || 'kentu'}_${timeToken(time) || 'na'}`;
  return {
    id,
    date,
    createdAt: Date.now(),
    source: 'protocol',
    protocolId: protocolId || null,
    kind: 'protocol-meal-draft',
    commandType: 'ADD_FOOD',
    payload: {
      mealType,
      timeString: time || null,
      exactTime: time || null,
      title,
      protocolId: protocolId || null,
      items: [
        {
          foodName: title,
          name: title,
          desc: title,
          grams: 1,
          status: 'raw',
        },
      ],
    },
  };
}

export function createProtocolActivityDraft(event, protocolId, dateIso = '') {
  const time = asTimeHHmm(event?.time || event?.exactTime || event?.timeString);
  const title = String(event?.title || event?.name || 'Allenamento').trim() || 'Allenamento';
  const workoutType = inferWorkoutType(title);
  const durationMinutes = inferDurationMinutes(title, workoutType);
  const date = String(dateIso || getTodayString()).slice(0, 10);
  const id = `protocol_activity_${protocolId || 'kentu'}_${timeToken(time) || 'na'}`;
  const draft = createActivityDraft({
    workoutName: title,
    name: title,
    workoutType,
    activityType: workoutType,
    durationMinutes,
    exactTime: time || null,
    timeString: time || null,
    protocolId: protocolId || null,
  }, {
    date,
    source: PROTOCOL_ACTIVITY_DRAFT_SOURCE,
    id,
  });
  return {
    ...draft,
    protocolId: protocolId || null,
    generatedBy: 'protocol',
  };
}

/**
 * Converte gli eventi della timeline in bozze pasto / attività.
 * @returns {{ mealDrafts: object[], activityDrafts: object[] }}
 */
export function buildDraftsFromTimeline(protocolId, timelineEvents) {
  const id = isDailyProtocolId(protocolId) ? String(protocolId) : '';
  const date = getTodayString();
  const events = Array.isArray(timelineEvents) ? timelineEvents : [];
  const mealDrafts = [];
  const activityDrafts = [];
  const seenMeal = new Set();
  const seenActivity = new Set();

  events.forEach((event) => {
    const bucket = classifyTimelineEvent(event);
    if (bucket === 'meal') {
      const draft = createProtocolMealDraft(event, id, date);
      if (!draft?.id || seenMeal.has(draft.id)) return;
      seenMeal.add(draft.id);
      mealDrafts.push(draft);
      return;
    }
    if (bucket === 'activity') {
      const draft = createProtocolActivityDraft(event, id, date);
      if (!draft?.id || seenActivity.has(draft.id)) return;
      seenActivity.add(draft.id);
      activityDrafts.push(draft);
    }
  });

  return { mealDrafts, activityDrafts };
}
