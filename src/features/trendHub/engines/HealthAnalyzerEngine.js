import { addDays } from '../../../calendarDateUtils';
import { getLogFromStoricoTree } from '../../../coreEngine';
import { askAI } from '../../../services/aiService';
import { healthReportSchema } from '../../commandTerminal/contracts/commandSchemas';
import {
  hasCompleteHealthLabels,
  normalizeNewHealthLabel,
  readHealthLabels,
} from '../utils/foodHealthLabels';

const HEALTH_ANALYZER_MODEL = 'gemini-3.7-flash';

/**
 * @param {unknown} rawText
 * @returns {string}
 */
function unwrapJsonText(rawText) {
  let text = String(rawText || '').trim();
  if (!text) return '';
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) text = text.slice(first, last + 1);
  return text;
}

/**
 * Estrae voci cibo da un daily log (nodi meal + item flat).
 * @param {Array<Record<string, unknown>>} dayLog
 * @returns {Array<{
 *   foodName: string,
 *   foodDbKey: string | null,
 *   grams: number | null,
 *   mealType: string | null,
 *   time: string | number | null,
 * }>}
 */
export function extractConsumedFoodsFromDayLog(dayLog = []) {
  const list = Array.isArray(dayLog) ? dayLog : [];
  const out = [];

  const pushItem = (item, parent = null) => {
    if (!item || typeof item !== 'object') return;
    if (item.isGhost === true) return;
    const type = String(item.type || parent?.type || '').toLowerCase();
    if (type && type !== 'food' && type !== 'meal' && type !== '') {
      // skip non-food parent types unless nested under meal
    }
    const foodName = String(
      item.foodName || item.desc || item.name || item.label || '',
    ).trim();
    if (!foodName) return;
    const gramsRaw = Number(item.grams ?? item.qta ?? item.weight);
    const grams = Number.isFinite(gramsRaw) && gramsRaw > 0 ? Math.round(gramsRaw) : null;
    const keyRaw = item.foodDbKey ?? item.matchedKey ?? item.dbKey ?? null;
    out.push({
      foodName,
      foodDbKey: keyRaw != null && String(keyRaw).trim() ? String(keyRaw).trim() : null,
      grams,
      mealType: String(item.mealType || parent?.mealType || parent?.type || '').trim() || null,
      time: item.time ?? item.exactTime ?? parent?.time ?? parent?.exactTime ?? null,
    });
  };

  for (const node of list) {
    if (!node || typeof node !== 'object') continue;
    if (node.isGhost === true) continue;
    const nodeType = String(node.type || '').toLowerCase();
    if (nodeType === 'workout' || nodeType === 'sleep' || nodeType === 'water' || nodeType === 'stimulant') {
      continue;
    }
    const nested = Array.isArray(node.items) ? node.items : null;
    if (nested && nested.length > 0) {
      nested.forEach((item) => pushItem(item, node));
      continue;
    }
    if (nodeType === 'food' || nodeType === 'meal' || node.foodName || node.desc) {
      pushItem(node, null);
    }
  }

  return out;
}

/**
 * Delta check: known (tag completi) vs unknown (da classificare).
 * @param {Array<Record<string, unknown>>} consumedFoods
 * @param {Record<string, Record<string, unknown>>} foodDatabase
 */
export function partitionFoodsByHealthLabels(consumedFoods, foodDatabase = {}) {
  const db = foodDatabase && typeof foodDatabase === 'object' ? foodDatabase : {};
  const knownFoods = [];
  const unknownFoods = [];
  const seenUnknown = new Set();

  for (const food of consumedFoods || []) {
    const key = food?.foodDbKey ? String(food.foodDbKey) : null;
    const dbRow = key && db[key] ? db[key] : null;
    const labels = readHealthLabels(dbRow);
    if (labels) {
      knownFoods.push({
        ...food,
        ...labels,
        source: 'cache',
      });
      continue;
    }
    const dedupeKey = `${key || ''}|${String(food?.foodName || '').toLowerCase()}`;
    if (seenUnknown.has(dedupeKey)) continue;
    seenUnknown.add(dedupeKey);
    unknownFoods.push({
      ...food,
      source: 'unknown',
    });
  }

  return { knownFoods, unknownFoods };
}

/**
 * Prompt dual-action: classificazione unknown + referto salute + correlazione sonno.
 * @param {{
 *   analysisDate: string,
 *   todayDate?: string,
 *   knownFoods: Array<object>,
 *   unknownFoods: Array<object>,
 *   allFoods: Array<object>,
 *   morningSleepLog?: object | null,
 * }} ctx
 */
export function buildHealthAnalyzerPrompt(ctx = {}) {
  const analysisDate = String(ctx.analysisDate || '').trim();
  const todayDate = String(ctx.todayDate || '').trim();
  const knownFoods = Array.isArray(ctx.knownFoods) ? ctx.knownFoods : [];
  const unknownFoods = Array.isArray(ctx.unknownFoods) ? ctx.unknownFoods : [];
  const allFoods = Array.isArray(ctx.allFoods) ? ctx.allFoods : [...knownFoods, ...unknownFoods];
  const morningSleepLog = ctx.morningSleepLog ?? null;
  const hasSleep = Boolean(
    morningSleepLog
    && Number.isFinite(Number(morningSleepLog.hours))
    && Number(morningSleepLog.hours) > 0,
  );

  return [
    `Analizza la giornata alimentare del ${analysisDate || 'giorno precedente'} (Kentu Health Analyzer).`,
    todayDate ? `Il sonno mattutino si riferisce alla data ${todayDate} (notte appena trascorsa).` : '',
    '',
    `[KNOWN_FOODS_CACHED: ${JSON.stringify(knownFoods)}]`,
    `[UNKNOWN_FOODS_TO_LABEL: ${JSON.stringify(unknownFoods)}]`,
    `[ALL_CONSUMED_FOODS: ${JSON.stringify(allFoods)}]`,
    `[MORNING_SLEEP_LOG: ${JSON.stringify(morningSleepLog)}]`,
    hasSleep
      ? `[SLEEP_STATUS: AVAILABLE — hours=${morningSleepLog.hours}, quality=${morningSleepLog.quality || 'ok'}. NON dire che manca il sonno.]`
      : '[SLEEP_STATUS: MISSING — morningSleepLog assente o incompleto.]',
    '',
    'COMPITO DUAL-ACTION:',
    '1) Se UNKNOWN_FOODS_TO_LABEL non è vuoto, classifica OGNI alimento sconosciuto in newLabels[] con:',
    '   - foodDbKey (copia dal prompt se presente, altrimenti null)',
    '   - foodName',
    '   - novaScore (1-4 intero)',
    '   - inflammationFactor (-1 | 0 | +1)',
    '   - hasSaturatedFats (boolean)',
    '   Se UNKNOWN è vuoto, newLabels DEVE essere [].',
    '2) Genera SEMPRE dailyScore (0-100) sul totale ALL_CONSUMED_FOODS (noti + ignoti), considerando timing/mealType.',
    '3) Genera clinicalBulletinMarkdown: bollettino clinico mattutino in Markdown (vedi system instruction).',
    '   Nessuna immagine Markdown: niente Pollinations né URL esterni.',
    '4) Compila anche i campi plain-text brevi (1-2 frasi ciascuno) per i widget compatte:',
    '   - inflammationSummary',
    '   - timingFeedback',
    '5) Compila sleepCorrelationInsight (plain text):',
    '   Analizza i macro e l\'orario della cena di ieri e correlali con la qualità del sonno registrata stamattina.',
    '   Cerca pattern come eccesso di grassi, zuccheri semplici prima di dormire, o un perfetto bilanciamento che ha favorito il riposo.',
    hasSleep
      ? '   SLEEP_STATUS=AVAILABLE: usa obbligatoriamente hours+quality da MORNING_SLEEP_LOG. Vietato scrivere che il dato sonno manca, è assente o non disponibile.'
      : '   SLEEP_STATUS=MISSING: indica brevemente che manca il dato sonno mattutino.',
    '6) Compila longevityNutrition (OBBLIGATORIO) per la Pagella Longevità.',
    '   Calcola score (0–25) come SINTESI OLISTICA PONDERATA — NON usare solo le proteine totali:',
    '   A) Profilo Antinfiammatorio & Grassi Buoni (max 8 pt): olio EVO, noci/mandorle, pesce, vegetali freschi, assenza ultra-processati (NOVA 4).',
    '   B) Controllo Glicemico & Fibre (max 7 pt): cereali integrali, legumi, verdure, assenza zuccheri liberi / picchi glicemici.',
    '   C) Quota Proteica Funzionale (max 5 pt): sufficiente a proteggere la massa magra.',
    '      Assegna punteggio PIENO (5) se le fonti sono qualitativamente nobili (pesce, uova, latticini, legumi, carne magra)',
    '      anche se il totale grammi è leggermente sotto il target numerico. NON crollare lo score globale per −10/20g di proteine.',
    '   D) Timing & Digiuno Notturno (max 5 pt): ≥12–14h digiuno e cena digeribile prima del riposo.',
    '   score = A+B+C+D (arrotondato, clamp 0–25).',
    '   - proteinStatus: LOW | MODERATE | OPTIMAL (OPTIMAL anche se leggermente sotto target ma fonti nobili).',
    '   - fastingWindowEvaluation: POOR (<12h) | GOOD (12-14h) | OPTIMAL (>14h) — stima da timing pasti se ore digiuno non esplicite.',
    '   - clinicalNoteStrength: 1 frase sui PUNTI DI FORZA reali (antinfiammatorio, glicemia, qualità grassi).',
    '     Se A+B alti, DEVE celebrarli (es. "Profilo antinfiammatorio eccellente: olio EVO, pesce, antiossidanti; stabilità glicemica solida.").',
    '     VIETATO scrivere "Nutrizione debole" quando il profilo qualitativo è buono.',
    '   - clinicalNoteBottleneck: solo il gap SECONDARIO (es. "Margine: incrementa leggermente le proteine per la massa magra.").',
    '     Se lo score è ≥18, bottleneck = micro-miglioramento, non allarme.',
    '',
    'Tono: analitico, diretto, italiano. Niente motivazionale.',
    'Rispondi SOLO JSON conforme allo schema.',
  ].filter(Boolean).join('\n');
}

export function buildHealthAnalyzerSystemInstruction() {
  return [
    'Sei un analista clinico Kentu. Scrivi l\'Insight come un elegante bollettino mattutino in Markdown.',
    'Rispondi SOLO con JSON valido conforme allo schema healthReportSchema.',
    'Non inventare alimenti non presenti nei blocchi del prompt.',
    'novaScore: 1=minimamente processato … 4=ultra-processato.',
    'inflammationFactor: -1 anti, 0 neutro, +1 pro-infiammatorio.',
    'Usa i tag già presenti in KNOWN_FOODS_CACHED senza ricalcolarli.',
    'Per UNKNOWN classifica in modo coerente con la letteratura nutrizionale standard.',
    'Disallineamento temporale: cibo = analysisDate (ieri); sonno = MORNING_SLEEP_LOG di oggi (notte successiva alla cena).',
    'Se SLEEP_STATUS=AVAILABLE, sleepCorrelationInsight e la sezione sonno del bollettino DEVONO citare ore/qualità e NON possono dire che il sonno manca.',
    '',
    'REGOLE FORMATTAZIONE OBBLIGATORIE per clinicalBulletinMarkdown:',
    '1. TITOLO: La prima riga DEVE essere esattamente: # 📰 Analisi Metabolica del Mattino',
    '2. SEZIONI: Dividi in 3 brevi sezioni con titoli ### ed emoji, ad esempio:',
    '### 🔬 Stato Infiammatorio',
    '### ⚖️ Equilibrio Glicemico',
    '### 😴 Sonno e Recupero',
    '3. STILE: Usa elenchi puntati e **grassetto**. Tono autorevole ma leggibile a colazione. Niente muri di testo.',
    '4. NON includere immagini Markdown, URL Pollinations, né link a generatori di immagini: la copertina è gestita dall\'app.',
    'Il Markdown va dentro la stringa JSON clinicalBulletinMarkdown (escape corretto delle virgolette).',
    '',
    'longevityNutrition.score (0–25) = somma olistica: Antinfiammatorio/Grassi buoni ≤8 + Glicemia/Fibre ≤7 + Proteine funzionali ≤5 + Digiuno/timing ≤5.',
    'NON penalizzare in modo dominante una lieve flessione proteica se A+B sono alti (EVO, pesce, mandorle, fibre).',
    'proteinStatus ∈ {LOW,MODERATE,OPTIMAL}: OPTIMAL se fonti nobili anche sotto target numerico di poco.',
    'fastingWindowEvaluation ∈ {POOR,GOOD,OPTIMAL}.',
    'clinicalNoteStrength: celebra qualità reale; vietato "Nutrizione debole" su giornate anti-infiammatorie solide.',
    'clinicalNoteBottleneck: gap secondario (es. proteine) come suggerimento, non come giudizio globale.',
  ].join(' ');
}

/**
 * Giorno calendario locale YYYY-MM-DD da epoch ms.
 * @param {number} ms
 * @returns {string}
 */
export function localIsoDateFromMs(ms) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * True se il referto è già stato generato nel giorno calendario `todayDate`.
 * @param {object | null | undefined} report
 * @param {string} todayDate YYYY-MM-DD
 */
export function isHealthReportGeneratedToday(report, todayDate) {
  const today = String(todayDate || '').slice(0, 10);
  if (!report || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  const ts = Number(report.generatedAt);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return localIsoDateFromMs(ts) === today;
}

/**
 * Rimuove immagini Markdown (es. Pollinations) dal bollettino.
 * @param {string} markdown
 */
export function stripClinicalBulletinImages(markdown) {
  return String(markdown || '')
    .replace(/!\[[^\]]*\]\([^)]*\)\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalizza longevityNutrition dall'LLM (0–25 + enum).
 * @param {unknown} raw
 * @returns {{
 *   score: number,
 *   proteinStatus: 'LOW'|'MODERATE'|'OPTIMAL',
 *   fastingWindowEvaluation: 'POOR'|'GOOD'|'OPTIMAL',
 *   clinicalNoteStrength: string,
 *   clinicalNoteBottleneck: string,
 * } | null}
 */
export function normalizeLongevityNutrition(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const scoreRaw = Number(raw.score);
  if (!Number.isFinite(scoreRaw)) return null;
  const score = Math.max(0, Math.min(25, Math.round(scoreRaw)));

  const proteinRaw = String(raw.proteinStatus || '').trim().toUpperCase();
  const proteinStatus = proteinRaw === 'LOW' || proteinRaw === 'MODERATE' || proteinRaw === 'OPTIMAL'
    ? proteinRaw
    : (score >= 18 ? 'OPTIMAL' : score >= 10 ? 'MODERATE' : 'LOW');

  const fastingRaw = String(raw.fastingWindowEvaluation || '').trim().toUpperCase();
  const fastingWindowEvaluation = fastingRaw === 'POOR' || fastingRaw === 'GOOD' || fastingRaw === 'OPTIMAL'
    ? fastingRaw
    : (score >= 18 ? 'OPTIMAL' : score >= 10 ? 'GOOD' : 'POOR');

  const clinicalNoteStrength = String(raw.clinicalNoteStrength || '').trim()
    || (score >= 16
      ? 'Profilo alimentare qualitativamente solido: priorità a stabilità metabolica e densità nutrizionale.'
      : 'Ci sono elementi nutrizionali recuperabili nella giornata.');
  const clinicalNoteBottleneck = String(raw.clinicalNoteBottleneck || '').trim()
    || (proteinStatus === 'LOW' && score >= 16
      ? 'Margine di miglioramento: incrementa leggermente la quota proteica per sostenere la massa magra.'
      : score < 14
        ? 'Priorità: qualità antinfiammatoria, fibre/glicemia o finestra digiuno.'
        : 'Piccoli aggiustamenti su proteine o timing possono ancora migliorare.');

  return {
    score,
    proteinStatus,
    fastingWindowEvaluation,
    clinicalNoteStrength,
    clinicalNoteBottleneck,
  };
}

/**
 * @param {string} rawText
 */
export function parseHealthAnalyzerResponse(rawText) {
  const cleaned = unwrapJsonText(rawText);
  if (!cleaned) throw new Error('Health Analyzer: risposta LLM vuota');
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Health Analyzer: JSON malformato');
  }
  const newLabels = (Array.isArray(parsed?.newLabels) ? parsed.newLabels : [])
    .map(normalizeNewHealthLabel)
    .filter(Boolean);
  const dailyScoreRaw = Number(parsed?.dailyScore);
  const dailyScore = Number.isFinite(dailyScoreRaw)
    ? Math.max(0, Math.min(100, Math.round(dailyScoreRaw)))
    : 0;
  const inflammationSummary = String(parsed?.inflammationSummary || '').trim();
  const timingFeedback = String(parsed?.timingFeedback || '').trim();
  const sleepCorrelationInsight = String(parsed?.sleepCorrelationInsight || '').trim() || null;
  const clinicalBulletinMarkdown = stripClinicalBulletinImages(
    String(parsed?.clinicalBulletinMarkdown || '').trim(),
  );
  if (!clinicalBulletinMarkdown) {
    throw new Error('Health Analyzer: bollettino Markdown mancante');
  }
  if (!inflammationSummary || !timingFeedback) {
    throw new Error('Health Analyzer: referto incompleto');
  }
  const longevityNutrition = normalizeLongevityNutrition(parsed?.longevityNutrition);
  return {
    newLabels,
    dailyScore,
    clinicalBulletinMarkdown,
    inflammationSummary,
    timingFeedback,
    sleepCorrelationInsight,
    longevityNutrition,
  };
}

/**
 * Prepara il contesto di analisi per una data (default: ieri).
 * Preferisce `yesterdayLog` (contratto snello P1); `fullHistory` resta solo fallback legacy.
 * Il sonno mattutino è quello di `todayDate` (notte successiva alla cena di ieri).
 * @param {{
 *   yesterdayLog?: Array<Record<string, unknown>> | null,
 *   dayLog?: Array<Record<string, unknown>> | null,
 *   fullHistory?: object | null,
 *   foodDatabase?: object,
 *   todayDate: string,
 *   analysisDate?: string,
 *   morningSleepLog?: object | null,
 * }} args
 */
export function buildHealthAnalysisContext({
  yesterdayLog = null,
  dayLog: dayLogProp = null,
  fullHistory = null,
  foodDatabase = {},
  todayDate,
  analysisDate = null,
  morningSleepLog = null,
} = {}) {
  const safeToday = String(todayDate || '').slice(0, 10);
  const targetDate = analysisDate
    ? String(analysisDate).slice(0, 10)
    : addDays(safeToday, -1);

  let dayLog;
  if (Array.isArray(yesterdayLog)) {
    dayLog = yesterdayLog;
  } else if (Array.isArray(dayLogProp)) {
    dayLog = dayLogProp;
  } else if (fullHistory && typeof fullHistory === 'object') {
    dayLog = getLogFromStoricoTree(fullHistory, targetDate) || [];
  } else {
    dayLog = [];
  }

  const allFoods = extractConsumedFoodsFromDayLog(dayLog);
  const { knownFoods, unknownFoods } = partitionFoodsByHealthLabels(allFoods, foodDatabase);
  return {
    analysisDate: targetDate,
    todayDate: safeToday,
    dayLog,
    allFoods,
    knownFoods,
    unknownFoods,
    morningSleepLog: morningSleepLog && typeof morningSleepLog === 'object' ? morningSleepLog : null,
    needsLabeling: unknownFoods.length > 0,
    hasFoods: allFoods.length > 0,
  };
}

/**
 * Chiama l'LLM e restituisce referto + etichette.
 * @param {ReturnType<typeof buildHealthAnalysisContext>} analysisContext
 * @param {{ signal?: AbortSignal, temperature?: number }} [options]
 */
export async function requestHealthAnalyzerReport(analysisContext, options = {}) {
  const prompt = buildHealthAnalyzerPrompt(analysisContext);
  const systemInstruction = buildHealthAnalyzerSystemInstruction();
  const rawText = await askAI(prompt, systemInstruction, {
    model: HEALTH_ANALYZER_MODEL,
    temperature: options.temperature ?? 0.25,
    responseSchema: healthReportSchema,
    generationConfig: {
      temperature: options.temperature ?? 0.25,
      response_mime_type: 'application/json',
      responseMimeType: 'application/json',
      response_schema: healthReportSchema,
      responseSchema: healthReportSchema,
    },
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return parseHealthAnalyzerResponse(rawText);
}

/**
 * Costruisce il multi-path patch Firebase per lazy labeling.
 * Path relativi a `users/{uid}/tracker_data`.
 * @param {Array<ReturnType<typeof normalizeNewHealthLabel>>} newLabels
 * @param {Record<string, unknown>} foodDatabase
 */
export function buildFoodHealthLabelsFirebasePatch(newLabels, foodDatabase = {}) {
  const patch = {};
  const localUpdates = {};
  for (const label of newLabels || []) {
    if (!label?.foodDbKey) continue;
    const key = String(label.foodDbKey);
    if (!foodDatabase?.[key]) continue;
    patch[`trackerFoodDatabase/${key}/novaScore`] = label.novaScore;
    patch[`trackerFoodDatabase/${key}/inflammationFactor`] = label.inflammationFactor;
    patch[`trackerFoodDatabase/${key}/hasSaturatedFats`] = label.hasSaturatedFats;
    localUpdates[key] = {
      novaScore: label.novaScore,
      inflammationFactor: label.inflammationFactor,
      hasSaturatedFats: label.hasSaturatedFats,
    };
  }
  return { patch, localUpdates };
}

/**
 * Documento referto da persistere.
 */
export function buildHealthReportDocument({
  analysisDate,
  report,
  knownFoods = [],
  unknownFoods = [],
  morningSleepLog = null,
  generatedAt = Date.now(),
}) {
  return {
    date: analysisDate,
    dailyScore: report.dailyScore,
    clinicalBulletinMarkdown: stripClinicalBulletinImages(report.clinicalBulletinMarkdown || '') || null,
    inflammationSummary: report.inflammationSummary,
    timingFeedback: report.timingFeedback,
    sleepCorrelationInsight: report.sleepCorrelationInsight || null,
    longevityNutrition: report.longevityNutrition || null,
    morningSleepSnapshot: morningSleepLog || null,
    labeledCount: Array.isArray(report.newLabels) ? report.newLabels.length : 0,
    knownCount: knownFoods.length,
    unknownCount: unknownFoods.length,
    generatedAt,
    source: 'health_analyzer_v2_bulletin',
  };
}

export { hasCompleteHealthLabels };
