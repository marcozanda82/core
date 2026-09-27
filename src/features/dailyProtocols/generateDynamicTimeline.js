import { askAI } from '../../services/aiService';
import { getDailyProtocolDef, isDailyProtocolId } from './dailyProtocols';

export const PROTOCOL_TIMELINE_MODEL = 'gemini-3.8-flash';

export const PROTOCOL_TIMELINE_GENERATING_TEXT =
  'Analisi del metabolismo e generazione del piano in corso...';

export const PROTOCOL_TIMELINE_REVISE_TEXT =
  'Aggiorno il piano della giornata...';

export const PROTOCOL_TIMELINE_UPDATED_TEXT =
  'Ho aggiornato il piano come richiesto.';

export const PROTOCOL_TIMELINE_ERROR_TEXT =
  'Si è verificato un errore nella connessione neurale. Riprova.';

const PROTOCOL_TIMELINE_SYSTEM_PROMPT_BASE = [
  'Sei l\'Architetto dello Stile di Vita Metabolico di Kentu.',
  'Genera una timeline giornaliera personalizzata in base al protocollo richiesto e alle carenze evidenziate dal dashboardState (Forza, Cardio, Sonno, Nutrizione).',
  'Se un pilastro è in priorità (punteggio più basso), inserisci almeno un evento mirato: ad esempio se Forza è in priorità, inserire un evento Allenamento; se Cardio è in priorità, una camminata o sessione aerobica; se Sonno è in priorità, un wind-down serale; se Nutrizione è in priorità, pasti più strutturati.',
  'REGOLA RIGIDA: Devi restituire ESCLUSIVAMENTE un oggetto JSON contenente un array "timeline" di oggetti evento (orario, titolo, tipo, focus). Se un valore o un parametro specifico non è disponibile o calcolabile dai dati forniti, fai una stima logica e utilizza un valore medio.',
  'Niente markdown, niente testo fuori dal JSON, niente spiegazioni.',
  'Schema esatto:',
  '{"timeline":[{"orario":"HH:MM","titolo":"stringa breve in italiano","tipo":"meal|activity|ritual|recovery|focus","focus":"perché questo evento rispetto al protocollo e alle carenze"}]}',
  'tipo: meal = pasti; activity = allenamento/camminata/mobilità; ritual = caffè/idratazione; recovery = sonno/wind-down; focus = deep work.',
  'Genera 3-8 eventi con orari realistici e strettamente crescenti, solo nel futuro rispetto a currentTime.',
].join(' ');

/**
 * System prompt Gemini con vincolo temporale (ore rimanenti + diario già loggato).
 * @param {string} currentTime
 * @param {object[]|string} todayLoggedEvents
 */
export function buildProtocolTimelineSystemPrompt(currentTime, todayLoggedEvents) {
  const clock = asTimeHHmm(currentTime) || String(currentTime || '').trim() || '--:--';
  const logged = formatLoggedEventsForPrompt(todayLoggedEvents);
  return [
    PROTOCOL_TIMELINE_SYSTEM_PROMPT_BASE,
    `CONTESTO TEMPORALE CRITICO: L'orario attuale è ${clock}. L'utente ha già registrato queste attività/pasti oggi: ${logged}.`,
    `REGOLA RIGIDA: Devi generare la timeline ESCLUSIVAMENTE per le ore rimanenti della giornata (da ${clock} fino al momento di dormire), adattando gli obiettivi del protocollo a ciò che è già stato fatto. NON inserire o proporre MAI eventi in orari passati.`,
  ].join(' ');
}

export function buildProtocolTimelineNegotiationPrompt(userMessage, currentTime, todayLoggedEvents) {
  const clock = asTimeHHmm(currentTime) || String(currentTime || '').trim() || '--:--';
  const logged = formatLoggedEventsForPrompt(todayLoggedEvents);
  const request = String(userMessage || '').trim() || 'modifica il piano';
  return [
    'Sei l\'Architetto dello Stile di Vita Metabolico di Kentu.',
    `Sei in fase di negoziazione. L'utente ha chiesto una modifica al piano attuale. Applica la modifica richiesta ('${request}') alla timeline fornita, aggiustando coerentemente gli orari se necessario. Restituisci ESCLUSIVAMENTE il nuovo oggetto JSON con l'array 'timeline' aggiornato.`,
    `CONTESTO TEMPORALE CRITICO: L'orario attuale è ${clock}. L'utente ha già registrato queste attività/pasti oggi: ${logged}.`,
    `NON inserire o proporre MAI eventi in orari passati (prima di ${clock}). Conserva gli eventi non toccati dalla richiesta.`,
    'Niente markdown, niente testo fuori dal JSON, niente spiegazioni.',
    'Schema esatto:',
    '{"timeline":[{"orario":"HH:MM","titolo":"stringa breve in italiano","tipo":"meal|activity|ritual|recovery|focus","focus":"perché questo evento rispetto al protocollo e alle carenze"}]}',
  ].join(' ');
}

/** Compat: prompt statico senza orario (evitare per generate/revise). */
export const PROTOCOL_TIMELINE_SYSTEM_PROMPT = PROTOCOL_TIMELINE_SYSTEM_PROMPT_BASE;

const KIND_ICONS = Object.freeze({
  meal: '🍽',
  activity: '🏋️',
  ritual: '☕',
  recovery: '🌙',
  focus: '🧠',
});

function scoreOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function asTimeHHmm(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return '';
  const hours = Math.min(23, Math.max(0, Number(match[1])));
  const mins = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function clockFromDecimal(value) {
  const dec = Number(value);
  if (!Number.isFinite(dec) || dec < 0 || dec >= 24) return '';
  const hours = Math.min(23, Math.max(0, Math.floor(dec)));
  const mins = Math.min(59, Math.max(0, Math.round((dec - hours) * 60)));
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function clockFromEntry(entry = {}) {
  return asTimeHHmm(
    entry.exactTime
    || entry.timeString
    || entry.clock
    || entry.orario,
  ) || clockFromDecimal(
    entry.time
    ?? entry.decimalHour
    ?? entry.mealTime
    ?? entry.startTime
    ?? entry.wakeTime,
  );
}

function firstFoodNames(entry = {}) {
  const items = Array.isArray(entry.items)
    ? entry.items
    : Array.isArray(entry.foods)
      ? entry.foods
      : [];
  const names = items
    .map((row) => String(row?.desc || row?.name || row?.foodName || row?.label || '').trim())
    .filter(Boolean)
    .slice(0, 4);
  if (names.length) return names.join(', ');
  return String(entry.desc || entry.name || entry.foodName || entry.label || '').trim();
}

const MEAL_TITLE = {
  colazione: 'Colazione',
  snack: 'Spuntino',
  pranzo: 'Pranzo',
  cena: 'Cena',
};

function summarizeLogEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const type = String(entry.type || '').trim().toLowerCase();
  const time = clockFromEntry(entry);
  if (type === 'meal' || type === 'food' || type === 'recipe' || type === 'single') {
    const mealKey = String(entry.mealType || '').split('_')[0].toLowerCase();
    const title = MEAL_TITLE[mealKey] || 'Pasto';
    const detail = firstFoodNames(entry);
    return {
      time,
      type: 'meal',
      title: detail ? `${title}: ${detail}` : title,
    };
  }
  if (type === 'workout' || type === 'work') {
    const title = String(
      entry.workoutName
      || entry.workoutType
      || entry.activityType
      || entry.name
      || entry.label
      || 'Allenamento',
    ).trim();
    return { time, type: 'activity', title };
  }
  if (type === 'stimulant' || type === 'energizer' || type === 'coffee' || type === 'tea') {
    const title = String(
      entry.label
      || entry.name
      || entry.subtype
      || 'Caffè',
    ).trim();
    return { time, type: 'ritual', title };
  }
  if (type === 'nap' || type === 'pisolino') {
    return { time, type: 'recovery', title: 'Pisolino' };
  }
  if (type === 'water' || type === 'acqua') {
    return { time, type: 'ritual', title: 'Acqua' };
  }
  return null;
}

/**
 * Riepilogo sintetico di pasti/attività già registrati oggi (diario).
 * @param {object} currentState
 * @returns {object[]}
 */
export function buildTodayLoggedEvents(currentState = {}) {
  const log = Array.isArray(currentState.activeLog) && currentState.activeLog.length
    ? currentState.activeLog
    : (Array.isArray(currentState.dailyLog) ? currentState.dailyLog : []);
  const extraNodes = Array.isArray(currentState.timelineNodes) ? currentState.timelineNodes : [];
  const source = log.length > 0 ? log : extraNodes;
  const seen = new Set();
  const events = [];
  source.forEach((entry) => {
    const row = summarizeLogEntry(entry);
    if (!row) return;
    const key = `${row.time}|${row.type}|${row.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push(row);
  });
  return events
    .sort((a, b) => String(a.time).localeCompare(String(b.time)))
    .slice(0, 24);
}

function formatLoggedEventsForPrompt(todayLoggedEvents) {
  if (typeof todayLoggedEvents === 'string' && todayLoggedEvents.trim()) {
    return todayLoggedEvents.trim();
  }
  const list = Array.isArray(todayLoggedEvents) ? todayLoggedEvents : [];
  if (list.length === 0) return 'nessuna attività o pasto registrato finora';
  return JSON.stringify(list);
}

function dropPastTimelineEvents(events, currentTime) {
  const now = asTimeHHmm(currentTime);
  if (!now) return events;
  return (Array.isArray(events) ? events : []).filter((row) => {
    const stamp = asTimeHHmm(row?.time);
    return !stamp || stamp >= now;
  });
}

function unwrapJsonText(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return '';
  if (text.startsWith('```')) {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return text;
}

function parseJsonObject(rawText) {
  const cleaned = unwrapJsonText(rawText);
  if (!cleaned) return null;
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const candidates = [cleaned];
  if (start >= 0 && end > start) {
    candidates.push(cleaned.slice(start, end + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* next */
    }
  }
  return null;
}

export function normalizeEventKind(tipo) {
  const t = String(tipo || '').trim().toLowerCase();
  if (['meal', 'pasto', 'colazione', 'pranzo', 'cena', 'spuntino', 'snack', 'pre-workout', 'preworkout'].includes(t)) {
    return 'meal';
  }
  if (['activity', 'allenamento', 'workout', 'camminata', 'corsa', 'hiit', 'mobilità', 'mobilita', 'pesi', 'cardio'].includes(t)) {
    return 'activity';
  }
  if (['ritual', 'rituale', 'caffè', 'caffe', 'coffee'].includes(t)) return 'ritual';
  if (['recovery', 'recupero', 'sonno', 'sleep', 'wind-down', 'winddown'].includes(t)) return 'recovery';
  if (['focus', 'deep_work', 'deepwork', 'lavoro', 'cognitivo'].includes(t)) return 'focus';
  return t || 'meal';
}

export function normalizeProtocolTimelineEvents(rawTimeline) {
  const list = Array.isArray(rawTimeline) ? rawTimeline : [];
  const seen = new Set();
  return list.map((row) => {
    if (!row || typeof row !== 'object') return null;
    const time = asTimeHHmm(row.orario || row.time || row.exactTime);
    const title = String(row.titolo || row.title || row.name || '').trim();
    if (!time || !title) return null;
    const kind = normalizeEventKind(row.tipo || row.kind || row.type);
    const key = `${time}|${title}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      time,
      title,
      kind,
      focus: String(row.focus || row.reason || '').trim(),
      icon: String(row.icon || '').trim() || KIND_ICONS[kind] || '•',
    };
  }).filter(Boolean)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

export function parseProtocolTimelineJson(text) {
  const parsed = parseJsonObject(text);
  if (!parsed) {
    throw new Error('malformed_timeline_json');
  }
  const events = normalizeProtocolTimelineEvents(parsed.timeline);
  if (events.length === 0) {
    throw new Error('empty_timeline');
  }
  return events;
}

/**
 * Snapshot compatto dei 4 pilastri Home (Forza, Cardio, Sonno, Nutrizione).
 */
export function buildProtocolDashboardState(currentState = {}) {
  const breakdown = currentState?.longevityResult?.breakdown
    || currentState?.longevityBreakdown
    || {};
  const forza = scoreOrNull(breakdown.weightsScore);
  const cardio = scoreOrNull(breakdown.cardioScore);
  const sonno = scoreOrNull(breakdown.sleepScore);
  const nutrizione = scoreOrNull(breakdown.nutritionScore);
  const pillars = [
    { id: 'forza', label: 'Forza', score: forza },
    { id: 'cardio', label: 'Cardio', score: cardio },
    { id: 'sonno', label: 'Sonno', score: sonno },
    { id: 'nutrizione', label: 'Nutrizione', score: nutrizione },
  ].filter((item) => item.score != null);
  const priority = pillars.slice().sort((a, b) => a.score - b.score)[0] || null;
  const four = currentState?.fourCylinder && typeof currentState.fourCylinder === 'object'
    ? currentState.fourCylinder
    : null;
  const decay = four?.decay && typeof four.decay === 'object' ? four.decay : null;

  return {
    forza,
    cardio,
    sonno,
    nutrizione,
    priority: priority?.id || null,
    priorityLabel: priority?.label || null,
    longevityScore: scoreOrNull(
      currentState.longevityScore ?? currentState.longevityResult?.finalScore,
    ),
    metabolicPhase: currentState.metabolicSnapshot?.phase
      || currentState.metabolicSnapshot?.currentPhase
      || currentState.metabolicSnapshot?.label
      || null,
    muscleStimulus: decay
      ? {
        legs: scoreOrNull((Number(decay.legs) || 0) * 100),
        chest: scoreOrNull((Number(decay.chest) || 0) * 100),
        backShoulders: scoreOrNull((Number(decay.back_shoulders) || 0) * 100),
      }
      : null,
    hasSleepData: currentState.hasSleepData !== false,
    isTrainingDay: currentState.isTrainingDay === true,
    todayLoggedEvents: buildTodayLoggedEvents(currentState),
  };
}

/**
 * Chiama Gemini e restituisce gli eventi timeline normalizzati.
 * @param {string} protocolId
 * @param {object} dashboardState
 * @returns {Promise<object[]>}
 */
export async function generateDynamicTimeline(protocolId, dashboardState) {
  const id = isDailyProtocolId(protocolId) ? String(protocolId) : '';
  if (!id) throw new Error('invalid_protocol');
  const def = getDailyProtocolDef(id);
  const currentTime = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const clock = asTimeHHmm(currentTime) || currentTime;
  const dash = dashboardState && typeof dashboardState === 'object' ? dashboardState : {};
  const todayLoggedEvents = Array.isArray(dash.todayLoggedEvents)
    ? dash.todayLoggedEvents
    : buildTodayLoggedEvents(dash);
  const payload = {
    protocolId: id,
    protocolName: def?.nome || id,
    protocolFocus: def?.focus || '',
    currentTime: clock,
    todayLoggedEvents,
    dashboardState: dash,
  };
  const userPrompt = [
    `Protocollo selezionato: ${payload.protocolName} (${payload.protocolId}).`,
    `Focus del protocollo: ${payload.protocolFocus}`,
    `currentTime: ${payload.currentTime}`,
    'todayLoggedEvents (eventi/pasti già completati oggi):',
    JSON.stringify(payload.todayLoggedEvents),
    'dashboardState (punteggi attuali Forza, Cardio, Sonno, Nutrizione):',
    JSON.stringify(payload.dashboardState),
    'Genera ora la timeline JSON solo per le ore rimanenti.',
  ].join('\n');

  const text = await askAI(userPrompt, buildProtocolTimelineSystemPrompt(clock, todayLoggedEvents), {
    model: PROTOCOL_TIMELINE_MODEL,
    temperature: 0.4,
    timeoutMs: 45_000,
  });
  const events = parseProtocolTimelineJson(text);
  const remaining = dropPastTimelineEvents(events, clock);
  if (remaining.length === 0) {
    throw new Error('empty_timeline');
  }
  return remaining;
}

/**
 * Rinegozia la timeline applicando una modifica in linguaggio naturale.
 * @param {string} userMessage
 * @param {object[]} currentTimeline
 * @param {{ protocolId?: string, dashboardState?: object }} [options]
 * @returns {Promise<object[]>}
 */
export async function renegotiateTimeline(userMessage, currentTimeline, options = {}) {
  const instruction = String(userMessage || '').trim();
  if (!instruction) throw new Error('empty_revision');
  const protocolId = options.protocolId;
  const id = isDailyProtocolId(protocolId) ? String(protocolId) : '';
  if (!id) throw new Error('invalid_protocol');
  const def = getDailyProtocolDef(id);
  const currentTime = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const clock = asTimeHHmm(currentTime) || currentTime;
  const dash = options.dashboardState && typeof options.dashboardState === 'object'
    ? options.dashboardState
    : {};
  const todayLoggedEvents = Array.isArray(dash.todayLoggedEvents)
    ? dash.todayLoggedEvents
    : buildTodayLoggedEvents(dash);
  const compactTimeline = (Array.isArray(currentTimeline) ? currentTimeline : []).map((row) => ({
    orario: row?.time || row?.orario || '',
    titolo: row?.title || row?.titolo || '',
    tipo: row?.kind || row?.tipo || 'meal',
    focus: row?.focus || '',
  }));
  const payload = {
    protocolId: id,
    protocolName: def?.nome || id,
    currentTime: clock,
    todayLoggedEvents,
    userMessage: instruction,
    timeline: compactTimeline,
  };
  const userPrompt = [
    `Protocollo: ${payload.protocolName} (${payload.protocolId}).`,
    `currentTime: ${payload.currentTime}`,
    'todayLoggedEvents:',
    JSON.stringify(payload.todayLoggedEvents),
    'Timeline attuale (JSON):',
    JSON.stringify({ timeline: payload.timeline }),
    `Richiesta dell'utente: ${payload.userMessage}`,
    'Applica la modifica e restituisci SOLO il JSON aggiornato con l\'array timeline.',
  ].join('\n');

  const text = await askAI(
    userPrompt,
    buildProtocolTimelineNegotiationPrompt(instruction, clock, todayLoggedEvents),
    {
      model: PROTOCOL_TIMELINE_MODEL,
      temperature: 0.3,
      timeoutMs: 45_000,
    },
  );
  const events = parseProtocolTimelineJson(text);
  const remaining = dropPastTimelineEvents(events, clock);
  if (remaining.length === 0) {
    throw new Error('empty_timeline');
  }
  return remaining;
}

/**
 * Rigenera la timeline applicando una modifica in linguaggio naturale.
 * @param {string} protocolId
 * @param {object[]} currentTimeline
 * @param {string} userInstruction
 * @param {object} dashboardState
 * @returns {Promise<object[]>}
 */
export async function reviseDynamicTimeline(
  protocolId,
  currentTimeline,
  userInstruction,
  dashboardState,
) {
  return renegotiateTimeline(userInstruction, currentTimeline, {
    protocolId,
    dashboardState,
  });
}
