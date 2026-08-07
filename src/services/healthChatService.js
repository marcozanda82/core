/**
 * Motore AI chat diabete tipo 2 — estrazione clinica + persistenza Firestore.
 *
 * Separazione rigida:
 * - diario_salute → SOLO glicemia + contesto misurazione (mai pasti/alimenti)
 * - eccezioni_terapia → variazioni farmaci vs terapia_base
 * - pasti/macro → motore nutrizione Kentu (RTDB), fuori da questo service
 */

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, firestore } from '../firebaseConfig.js';
import { askAI } from './aiService.js';
import {
  fetchTherapyPlan,
  formatTherapyPlanForPrompt,
  inferTherapyExceptionFromText,
} from '../features/health/utils/therapyPlanStore.js';

// ─── Tipi ────────────────────────────────────────────────────────────────────

/**
 * @typedef {'colazione' | 'pranzo' | 'cena' | null} MomentoGiornata
 */

/**
 * @typedef {'pre-prandiale' | 'post-prandiale' | null} ContestoGlicemia
 */

/**
 * @typedef {object} DiarioSalutePayload
 * @property {MomentoGiornata} momento_giornata — contesto temporale della misurazione
 * @property {number | null} valore_glicemia  — intero mg/dL
 * @property {ContestoGlicemia} contesto_glicemia
 */

/**
 * @typedef {object} EccezioneTerapiaPayload
 * @property {string} tipo_eccezione
 * @property {string} nota_originale
 * @property {string | null} [farmaco_nome]
 * @property {string | null} [momento_previsto]
 */

/**
 * @typedef {object} HealthChatAiResponse
 * @property {DiarioSalutePayload} diario_salute
 * @property {EccezioneTerapiaPayload | null} eccezione_terapia
 * @property {string} risposta_utente
 */

/**
 * @typedef {object} HealthChatPersistResult
 * @property {string | null} diarioSaluteId
 * @property {string | null} eccezioneTerapiaId
 */

/**
 * @typedef {object} HealthChatResult
 * @property {string} risposta_utente
 * @property {HealthChatAiResponse} data
 * @property {HealthChatPersistResult} saved
 */

// ─── Costanti ────────────────────────────────────────────────────────────────

export const HEALTH_CHAT_SYSTEM_PROMPT_BASE = [
  'Sei un assistente virtuale per il diabete di tipo 2.',
  "Analizza il messaggio dell'utente ed estrai SOLO dati clinici.",
  'IMPORTANTE — SEPARAZIONE DATABASE:',
  "- I PASTI e gli alimenti NON vanno in diario_salute. Non compilare mai campi cibo/alimenti.",
  "- diario_salute raccoglie solo: valore_glicemia (mg/dL intero o null),",
  "  contesto_glicemia (pre-prandiale/post-prandiale o null),",
  '  momento_giornata (colazione/pranzo/cena o null) come contesto della misurazione.',
  'Se l’utente parla solo di cibo/pasti senza glicemia né farmaci, lascia diario_salute tutto null',
  'e in risposta_utente invita a usare il flusso pasti (i macro li gestisce un altro motore).',
  "Se l'utente segnala omissione, ritardo, dose doppia/ridotta o qualsiasi variazione rispetto al piano terapeutico,",
  "compila 'eccezione_terapia' con: tipo_eccezione (omissione|ritardo|dose_doppia|dose_ridotta|variazione),",
  'farmaco_nome (se citato o riconoscibile dal piano), momento_previsto (se noto), nota_originale (testo utente).',
  'Esempi tipici: "ho saltato la metformina", "preso il farmaco in ritardo", "dose doppia per sbaglio".',
  'Se non c’è alcuna anomalia farmaci, eccezione_terapia = null.',
  "Fornisci sempre una 'risposta_utente' empatica e rassicurante dando del tu.",
  'NON usare mai il nome proprio dell’utente (né all’inizio né nel testo). Parti direttamente dal contenuto (es. «Ho registrato la glicemia…»).',
  'Rispondi SOLO con JSON valido conforme allo schema; nessun markdown né testo fuori dal JSON.',
].join(' ');

/** @deprecated usare buildHealthChatSystemPrompt */
export const HEALTH_CHAT_SYSTEM_PROMPT = HEALTH_CHAT_SYSTEM_PROMPT_BASE;

const MOMENTI = new Set(['colazione', 'pranzo', 'cena']);
const CONTESTI = new Set(['pre-prandiale', 'post-prandiale']);
const TIPI_ECCEZIONE = new Set([
  'omissione',
  'ritardo',
  'dose_doppia',
  'dose_ridotta',
  'variazione',
  'non_specificata',
]);

/** Schema Gemini — solo campi clinici (niente alimenti). */
export const HEALTH_CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    diario_salute: {
      type: 'object',
      description:
        'Solo glicemia e contesto misurazione. MAI alimenti/pasti (gestiti altrove).',
      properties: {
        momento_giornata: {
          type: 'string',
          nullable: true,
          enum: ['colazione', 'pranzo', 'cena', null],
          description: 'Momento della misurazione, oppure null.',
        },
        valore_glicemia: {
          type: 'integer',
          nullable: true,
          description: 'Valore glicemia in mg/dL (intero), oppure null.',
        },
        contesto_glicemia: {
          type: 'string',
          nullable: true,
          enum: ['pre-prandiale', 'post-prandiale', null],
          description: 'Contesto della misurazione, oppure null.',
        },
      },
      required: [
        'momento_giornata',
        'valore_glicemia',
        'contesto_glicemia',
      ],
    },
    eccezione_terapia: {
      type: 'object',
      nullable: true,
      description: 'Variazione rispetto al piano terapeutico; altrimenti null.',
      properties: {
        tipo_eccezione: {
          type: 'string',
          description: 'omissione | ritardo | dose_doppia | dose_ridotta | variazione',
        },
        farmaco_nome: {
          type: 'string',
          nullable: true,
          description: 'Nome farmaco dal piano o citato dall’utente.',
        },
        momento_previsto: {
          type: 'string',
          nullable: true,
          description: 'Momento previsto nel piano (colazione/pranzo/cena/snack/sera), se noto.',
        },
        nota_originale: {
          type: 'string',
          description: 'Nota testuale originale dell’utente.',
        },
      },
      required: ['tipo_eccezione', 'nota_originale'],
    },
    risposta_utente: {
      type: 'string',
      description: 'Messaggio empatico e rassicurante da mostrare in chat (dare del tu).',
    },
  },
  required: ['diario_salute', 'eccezione_terapia', 'risposta_utente'],
};

const COLLECTION_DIARIO_SALUTE = 'diario_salute';
const COLLECTION_ECCEZIONI_TERAPIA = 'eccezioni_terapia';

const FALLBACK_RISPOSTA =
  'Grazie per il messaggio. Al momento non sono riuscito a interpretare i dettagli, '
  + 'ma sono qui con te: riprova tra un attimo o dimmi pure glicemia o variazioni sui farmaci.';

/**
 * @param {string} [therapyPlanBlock]
 * @returns {string}
 */
export function buildHealthChatSystemPrompt(therapyPlanBlock = '') {
  const block = String(therapyPlanBlock || '').trim();
  if (!block) return HEALTH_CHAT_SYSTEM_PROMPT_BASE;
  return `${HEALTH_CHAT_SYSTEM_PROMPT_BASE}\n\n${block}`;
}

// ─── Parsing / normalizzazione ───────────────────────────────────────────────

/**
 * @param {unknown} raw
 * @returns {string}
 */
function unwrapJsonText(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (text.startsWith('```')) {
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}

/**
 * @param {unknown} value
 * @returns {MomentoGiornata}
 */
function normalizeMomento(value) {
  if (value == null) return null;
  const v = String(value).trim().toLowerCase();
  return MOMENTI.has(v) ? /** @type {MomentoGiornata} */ (v) : null;
}

/**
 * @param {unknown} value
 * @returns {ContestoGlicemia}
 */
function normalizeContesto(value) {
  if (value == null) return null;
  const v = String(value).trim().toLowerCase().replace(/\s+/g, '-');
  if (CONTESTI.has(v)) return /** @type {ContestoGlicemia} */ (v);
  if (v === 'preprandiale' || v === 'pre') return 'pre-prandiale';
  if (v === 'postprandiale' || v === 'post') return 'post-prandiale';
  return null;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
function normalizeGlicemia(value) {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 20 || rounded > 600) return null;
  return rounded;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeNullableText(value) {
  if (value == null) return null;
  const t = String(value).trim();
  return t ? t : null;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeTipoEccezione(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (TIPI_ECCEZIONE.has(raw)) return raw;
  if (/salt|omit|dimentic/.test(raw)) return 'omissione';
  if (/ritard/.test(raw)) return 'ritardo';
  if (/dopp/.test(raw)) return 'dose_doppia';
  if (/ridott|mezza/.test(raw)) return 'dose_ridotta';
  return raw || 'variazione';
}

/**
 * @param {unknown} raw
 * @returns {HealthChatAiResponse}
 */
export function normalizeHealthChatAiResponse(raw) {
  const root = raw && typeof raw === 'object' ? raw : {};
  const diarioRaw = root.diario_salute && typeof root.diario_salute === 'object'
    ? root.diario_salute
    : {};

  /** @type {DiarioSalutePayload} */
  const diario_salute = {
    momento_giornata: normalizeMomento(diarioRaw.momento_giornata),
    valore_glicemia: normalizeGlicemia(diarioRaw.valore_glicemia),
    contesto_glicemia: normalizeContesto(diarioRaw.contesto_glicemia),
  };

  let eccezione_terapia = null;
  const eccRaw = root.eccezione_terapia;
  if (eccRaw && typeof eccRaw === 'object') {
    const tipo = normalizeTipoEccezione(eccRaw.tipo_eccezione);
    const nota = normalizeNullableText(eccRaw.nota_originale);
    const farmaco = normalizeNullableText(eccRaw.farmaco_nome);
    const momento = normalizeNullableText(eccRaw.momento_previsto);
    if (tipo || nota || farmaco) {
      eccezione_terapia = {
        tipo_eccezione: tipo || 'non_specificata',
        nota_originale: nota || '',
        farmaco_nome: farmaco,
        momento_previsto: momento,
      };
    }
  }

  const risposta = normalizeNullableText(root.risposta_utente) || FALLBACK_RISPOSTA;

  return {
    diario_salute,
    eccezione_terapia,
    risposta_utente: risposta,
  };
}

/**
 * @param {string} rawText
 * @returns {HealthChatAiResponse}
 */
export function parseHealthChatAiJson(rawText) {
  const cleaned = unwrapJsonText(rawText);
  if (!cleaned) {
    return normalizeHealthChatAiResponse({
      diario_salute: {},
      eccezione_terapia: null,
      risposta_utente: FALLBACK_RISPOSTA,
    });
  }

  try {
    const parsed = JSON.parse(cleaned);
    return normalizeHealthChatAiResponse(parsed);
  } catch (error) {
    console.warn('[healthChatService] JSON parse failed', error?.message || error);
    return normalizeHealthChatAiResponse({
      diario_salute: {},
      eccezione_terapia: null,
      risposta_utente: FALLBACK_RISPOSTA,
    });
  }
}

/**
 * Persistiamo diario_salute solo se c’è una glicemia numerica.
 * momento/contesto da soli non bastano (evita “pasti spuri”).
 * @param {DiarioSalutePayload | null | undefined} diario
 */
export function hasDiarioSaluteValues(diario) {
  if (!diario || typeof diario !== 'object') return false;
  return diario.valore_glicemia != null && Number.isFinite(Number(diario.valore_glicemia));
}

// ─── Persistenza Firestore ───────────────────────────────────────────────────

/**
 * @param {string} uid
 * @param {DiarioSalutePayload} diario
 * @returns {Promise<string>}
 */
export async function saveDiarioSaluteDoc(uid, diario) {
  const docRef = await addDoc(collection(firestore, COLLECTION_DIARIO_SALUTE), {
    uid,
    momento_giornata: diario.momento_giornata ?? null,
    // Legacy field: sempre null — i pasti non appartengono a diario_salute.
    alimenti_consumati: null,
    valore_glicemia: diario.valore_glicemia,
    contesto_glicemia: diario.contesto_glicemia ?? null,
    timestamp: serverTimestamp(),
    createdAt: Date.now(),
  });
  return docRef.id;
}

/**
 * @param {string} uid
 * @param {EccezioneTerapiaPayload} eccezione
 * @returns {Promise<string>}
 */
export async function saveEccezioneTerapiaDoc(uid, eccezione) {
  const docRef = await addDoc(collection(firestore, COLLECTION_ECCEZIONI_TERAPIA), {
    uid,
    tipo_eccezione: eccezione.tipo_eccezione,
    nota_originale: eccezione.nota_originale,
    farmaco_nome: eccezione.farmaco_nome ?? null,
    momento_previsto: eccezione.momento_previsto ?? null,
    timestamp: serverTimestamp(),
    createdAt: Date.now(),
  });
  return docRef.id;
}

/**
 * Persistenza condizionale dopo parsing AI.
 * @param {string} uid
 * @param {HealthChatAiResponse} data
 * @returns {Promise<HealthChatPersistResult>}
 */
export async function persistHealthChatExtractions(uid, data) {
  /** @type {HealthChatPersistResult} */
  const saved = { diarioSaluteId: null, eccezioneTerapiaId: null };

  if (hasDiarioSaluteValues(data?.diario_salute)) {
    saved.diarioSaluteId = await saveDiarioSaluteDoc(uid, data.diario_salute);
  }

  if (data?.eccezione_terapia != null) {
    saved.eccezioneTerapiaId = await saveEccezioneTerapiaDoc(uid, data.eccezione_terapia);
  }

  return saved;
}

/**
 * Arricchisce l'estrazione con euristica sul piano terapeutico se l'AI non ha segnalato l'eccezione.
 * @param {HealthChatAiResponse} data
 * @param {string} userMessage
 * @param {import('../features/health/utils/therapyPlanStore.js').TherapyPlanDoc | null} plan
 * @returns {HealthChatAiResponse}
 */
export function enrichHealthChatWithTherapyPlan(data, userMessage, plan) {
  const next = data && typeof data === 'object'
    ? { ...data, diario_salute: { ...data.diario_salute } }
    : normalizeHealthChatAiResponse({});

  if (next.eccezione_terapia) {
    if (!next.eccezione_terapia.farmaco_nome) {
      const inferred = inferTherapyExceptionFromText(userMessage, plan);
      if (inferred?.farmaco_nome) {
        next.eccezione_terapia = {
          ...next.eccezione_terapia,
          farmaco_nome: inferred.farmaco_nome,
          momento_previsto: next.eccezione_terapia.momento_previsto || inferred.momento_previsto,
        };
      }
    }
    return next;
  }

  const inferred = inferTherapyExceptionFromText(userMessage, plan);
  if (!inferred) return next;

  next.eccezione_terapia = inferred;
  if (!next.risposta_utente || next.risposta_utente === FALLBACK_RISPOSTA) {
    const drug = inferred.farmaco_nome ? ` (${inferred.farmaco_nome})` : '';
    next.risposta_utente =
      `Ok, ho registrato la variazione sulla terapia${drug}. `
      + 'Se vuoi, dimmi anche la glicemia.';
  }
  return next;
}

/**
 * Formatta conferma breve dopo salvataggio clinico (es. flusso SPLIT con pasti).
 * @param {HealthChatPersistResult | null | undefined} saved
 * @param {HealthChatAiResponse | null | undefined} data
 * @returns {string}
 */
export function formatClinicalSaveAck(saved, data) {
  const parts = [];
  const g = data?.diario_salute?.valore_glicemia;
  if (saved?.diarioSaluteId && g != null) {
    const ctx = data?.diario_salute?.contesto_glicemia
      ? ` (${data.diario_salute.contesto_glicemia})`
      : '';
    parts.push(`Glicemia ${g} mg/dL${ctx} salvata nel diario salute.`);
  }
  if (saved?.eccezioneTerapiaId) {
    const drug = data?.eccezione_terapia?.farmaco_nome
      ? ` (${data.eccezione_terapia.farmaco_nome})`
      : '';
    parts.push(`Variazione terapia${drug} registrata.`);
  }
  return parts.join(' ');
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Analizza un messaggio utente sul diabete (solo clinico), salva su Firestore se necessario,
 * e restituisce la risposta empatica da mostrare in chat.
 *
 * @param {string} userMessage
 * @param {{
 *   uid?: string | null,
 *   signal?: AbortSignal | null,
 *   temperature?: number,
 *   terapiaBase?: import('../features/health/utils/therapyPlanStore.js').TherapyPlanDoc | null,
 *   replyMode?: 'full' | 'silent_ack',
 * } } [options]
 * @returns {Promise<HealthChatResult>}
 */
export async function processHealthChatMessage(userMessage, options = {}) {
  const message = String(userMessage ?? '').trim();
  if (!message) {
    throw new Error('Messaggio vuoto: inserisci un testo da analizzare.');
  }

  const uid = String(options.uid || auth.currentUser?.uid || '').trim();
  if (!uid) {
    throw new Error('Utente non autenticato: UID mancante.');
  }

  let plan = options.terapiaBase && typeof options.terapiaBase === 'object'
    ? options.terapiaBase
    : null;
  if (!plan) {
    try {
      plan = await fetchTherapyPlan(uid);
    } catch (err) {
      console.warn('[healthChatService] terapia_base fetch failed', err?.message || err);
      plan = { uid, farmaci: [], updatedAtMs: 0 };
    }
  }

  const systemPrompt = buildHealthChatSystemPrompt(formatTherapyPlanForPrompt(plan));

  const rawText = await askAI(message, systemPrompt, {
    temperature: options.temperature ?? 0.2,
    responseSchema: HEALTH_CHAT_RESPONSE_SCHEMA,
    signal: options.signal ?? null,
  });

  let data = parseHealthChatAiJson(rawText);
  data = enrichHealthChatWithTherapyPlan(data, message, plan);
  const saved = await persistHealthChatExtractions(uid, data);

  let risposta = data.risposta_utente;
  if (options.replyMode === 'silent_ack') {
    const ack = formatClinicalSaveAck(saved, data);
    risposta = ack || '';
  }

  return {
    risposta_utente: risposta,
    data,
    saved,
  };
}

export {
  COLLECTION_DIARIO_SALUTE,
  COLLECTION_ECCEZIONI_TERAPIA,
};
