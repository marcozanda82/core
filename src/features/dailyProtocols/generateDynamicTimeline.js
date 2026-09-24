import { askAI } from '../../services/aiService';
import { getDailyProtocolDef, isDailyProtocolId } from './dailyProtocols';

export const PROTOCOL_TIMELINE_MODEL = 'gemini-3.8-flash';

export const PROTOCOL_TIMELINE_GENERATING_TEXT =
  'Analisi del metabolismo e generazione del piano in corso...';

export const PROTOCOL_TIMELINE_REVISE_TEXT =
  'Aggiorno il piano della giornata...';

export const PROTOCOL_TIMELINE_ERROR_TEXT =
  'Si è verificato un errore nella connessione neurale. Riprova.';

export const PROTOCOL_TIMELINE_SYSTEM_PROMPT = [
  'Sei l\'Architetto dello Stile di Vita Metabolico di Kentu.',
  'Genera una timeline giornaliera personalizzata in base al protocollo richiesto e alle carenze evidenziate dal dashboardState (Forza, Cardio, Sonno, Nutrizione).',
  'Se un pilastro è in priorità (punteggio più basso), inserisci almeno un evento mirato: ad esempio se Forza è in priorità, inserire un evento Allenamento; se Cardio è in priorità, una camminata o sessione aerobica; se Sonno è in priorità, un wind-down serale; se Nutrizione è in priorità, pasti più strutturati.',
  'REGOLA RIGIDA: Devi restituire ESCLUSIVAMENTE un oggetto JSON contenente un array "timeline" di oggetti evento (orario, titolo, tipo, focus). Se un valore o un parametro specifico non è disponibile o calcolabile dai dati forniti, fai una stima logica e utilizza un valore medio.',
  'Niente markdown, niente testo fuori dal JSON, niente spiegazioni.',
  'Schema esatto:',
  '{"timeline":[{"orario":"HH:MM","titolo":"stringa breve in italiano","tipo":"meal|activity|ritual|recovery|focus","focus":"perché questo evento rispetto al protocollo e alle carenze"}]}',
  'tipo: meal = pasti; activity = allenamento/camminata/mobilità; ritual = caffè/idratazione; recovery = sonno/wind-down; focus = deep work.',
  'Genera 5-8 eventi che coprono l\'intera giornata, con orari realistici e crescenti.',
].join(' ');

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
  const payload = {
    protocolId: id,
    protocolName: def?.nome || id,
    protocolFocus: def?.focus || '',
    dashboardState: dashboardState && typeof dashboardState === 'object' ? dashboardState : {},
  };
  const userPrompt = [
    `Protocollo selezionato: ${payload.protocolName} (${payload.protocolId}).`,
    `Focus del protocollo: ${payload.protocolFocus}`,
    'dashboardState (punteggi attuali Forza, Cardio, Sonno, Nutrizione):',
    JSON.stringify(payload.dashboardState),
    'Genera ora la timeline JSON.',
  ].join('\n');

  const text = await askAI(userPrompt, PROTOCOL_TIMELINE_SYSTEM_PROMPT, {
    model: PROTOCOL_TIMELINE_MODEL,
    temperature: 0.4,
    timeoutMs: 45_000,
  });
  return parseProtocolTimelineJson(text);
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
  const id = isDailyProtocolId(protocolId) ? String(protocolId) : '';
  if (!id) throw new Error('invalid_protocol');
  const instruction = String(userInstruction || '').trim();
  if (!instruction) throw new Error('empty_revision');
  const def = getDailyProtocolDef(id);
  const compactTimeline = (Array.isArray(currentTimeline) ? currentTimeline : []).map((row) => ({
    orario: row?.time || row?.orario || '',
    titolo: row?.title || row?.titolo || '',
    tipo: row?.kind || row?.tipo || 'meal',
    focus: row?.focus || '',
  }));
  const userPrompt = [
    `Protocollo selezionato: ${def?.nome || id} (${id}).`,
    `Focus del protocollo: ${def?.focus || ''}`,
    'dashboardState:',
    JSON.stringify(dashboardState && typeof dashboardState === 'object' ? dashboardState : {}),
    'Timeline attuale (JSON):',
    JSON.stringify({ timeline: compactTimeline }),
    `Modifica richiesta dall'utente: ${instruction}`,
    'Applica SOLO la modifica richiesta, conserva il resto del piano, restituisci la timeline JSON completa aggiornata.',
  ].join('\n');

  const text = await askAI(userPrompt, PROTOCOL_TIMELINE_SYSTEM_PROMPT, {
    model: PROTOCOL_TIMELINE_MODEL,
    temperature: 0.3,
    timeoutMs: 45_000,
  });
  return parseProtocolTimelineJson(text);
}
