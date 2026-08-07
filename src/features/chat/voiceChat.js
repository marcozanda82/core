/**
 * Chat vocale Kentu — Web Speech API (STT + TTS).
 */

export const KENTU_TTS_STORAGE_KEY = 'kentu_chat_tts_enabled';

/** Rate di default: più scattante, meno robotica. */
export const KENTU_TTS_DEFAULT_RATE = 1.15;

/**
 * @returns {boolean}
 */
export function isSpeechRecognitionSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * @returns {boolean}
 */
export function isSpeechSynthesisSupported() {
  return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined';
}

/**
 * @param {boolean} [fallback=false]
 * @returns {boolean}
 */
export function readTtsEnabled(fallback = false) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(KENTU_TTS_STORAGE_KEY);
    if (raw == null) return fallback;
    return raw === '1' || raw === 'true';
  } catch {
    return fallback;
  }
}

/**
 * @param {boolean} enabled
 */
export function writeTtsEnabled(enabled) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KENTU_TTS_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
}

/**
 * @returns {SpeechRecognition | null}
 */
export function createSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = 'it-IT';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  return recognition;
}

/**
 * Rimuove ripetizioni anomale tipo "Marco, Marco" o "ok ok ok".
 * @param {string} text
 * @returns {string}
 */
export function collapseAnomalousRepetitions(text) {
  let s = String(text || '');
  if (!s) return '';

  for (let i = 0; i < 3; i += 1) {
    const next = s.replace(
      /\b([\p{L}\p{N}']{2,})(?:\s*[,;:.\-–—]?\s+\1\b)+/giu,
      '$1',
    );
    if (next === s) break;
    s = next;
  }

  for (let i = 0; i < 2; i += 1) {
    const next = s.replace(
      /\b([\p{L}\p{N}']{2,}(?:\s+[\p{L}\p{N}']{2,}){0,3})(?:\s*[,;:.]?\s+\1\b)+/giu,
      '$1',
    );
    if (next === s) break;
    s = next;
  }

  return s;
}

/**
 * Escape sicuro per uso in RegExp.
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rimuove del tutto il nome utente dalle frasi da leggere (vocativo / apertura).
 * Es. "Marco, ho registrato…" → "Ho registrato…"
 *
 * @param {string} text
 * @param {string | string[] | null | undefined} userNames
 * @returns {string}
 */
export function stripUserNameFromSpeech(text, userNames = null) {
  let s = String(text || '').trim();
  if (!s) return '';

  const names = (Array.isArray(userNames) ? userNames : [userNames])
    .map((n) => String(n || '').trim().split(/\s+/)[0])
    .filter((n) => n.length >= 2);

  // Se non abbiamo il nome profilo, rimuovi comunque vocativi tipici all’inizio:
  // "Marco, …" / "Ciao Marco, …" / "Perfetto Marco, …"
  const stripLeadingVocative = (input, name) => {
    let out = input;
    if (name) {
      const n = escapeRegExp(name);
      out = out
        .replace(new RegExp(`^(?:ciao|ehi|hey|salve|buongiorno|buonasera|perfetto|ok|va\\s+bene)\\s+${n}\\s*[,:;!.\\-–—]?\\s*`, 'iu'), '')
        .replace(new RegExp(`^${n}\\s*[,:;!.\\-–—]+\\s*`, 'iu'), '')
        .replace(new RegExp(`^${n}\\s+`, 'iu'), '');
      // Vocativo in mezzo: ", Marco," / " Marco,"
      out = out
        .replace(new RegExp(`\\s*,\\s*${n}\\s*,`, 'giu'), ',')
        .replace(new RegExp(`\\s*,\\s*${n}\\b`, 'giu'), '')
        .replace(new RegExp(`\\b${n}\\s*,\\s*`, 'giu'), '');
    } else {
      // Pattern generico solo in testa: NomeProprio + virgola (evita "Ok, ho…")
      out = out.replace(
        /^(?:ciao|ehi|hey|salve|buongiorno|buonasera|perfetto)\s+[\p{L}']{2,}\s*[,:;!.\-–—]?\s*/iu,
        '',
      );
      out = out.replace(/^[\p{Lu}][\p{Ll}']{1,20}\s*[,:;!.\-–—]+\s+/u, '');
    }
    return out.trim();
  };

  if (names.length === 0) {
    s = stripLeadingVocative(s, null);
  } else {
    for (const name of names) {
      s = stripLeadingVocative(s, name);
    }
  }

  // Capitalizza la prima lettera rimanente.
  if (s) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }
  return s;
}

/**
 * Pulisce testo AI per sintesi vocale naturale (no markdown, no nome, no ripeti).
 * @param {string} text
 * @param {{ userName?: string | string[] | null }} [opts]
 * @returns {string}
 */
export function sanitizeTextForSpeech(text, opts = {}) {
  let s = String(text || '');

  s = s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[_#~|>[\](){}]/g, ' ')
    .replace(/[*]/g, ' ')
    .replace(/[/\\]/g, ' ')
    .replace(/[•●▪︎◦▸►◆◇★☆✓✔✕✖※™®©]+/g, ' ')
    .replace(/\s*[-–—]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  s = stripUserNameFromSpeech(s, opts.userName ?? null);
  s = collapseAnomalousRepetitions(s);

  return s.replace(/\s+/g, ' ').replace(/\s+,/g, ',').replace(/,\s*,+/g, ',').trim();
}

/**
 * Seleziona la voce italiana più naturale: Neural / Online / Google / Microsoft Natural.
 * Penalizza sintetizzatori offline “compact” / metallici.
 *
 * @param {SpeechSynthesisVoice[]} [voices]
 * @returns {SpeechSynthesisVoice | null}
 */
export function pickPreferredItalianVoice(voices) {
  const list = Array.isArray(voices) ? voices : [];
  if (list.length === 0) return null;

  const italian = list.filter((v) => {
    const lang = String(v?.lang || '');
    const name = String(v?.name || '');
    return /^it([-_]|$)/i.test(lang) || /italian|italia/i.test(name);
  });
  const pool = italian.length > 0 ? italian : list;

  const scoreVoice = (v) => {
    const blob = `${v?.name || ''} ${v?.voiceURI || ''} ${v?.lang || ''}`.toLowerCase();
    let score = 0;

    if (/^it([-_]|$)/i.test(String(v?.lang || ''))) score += 25;

    // Online / cloud (Chrome: Google IT spesso localService === false)
    if (v?.localService === false) score += 55;
    if (/online|cloud|remote|network/.test(blob)) score += 45;

    // Neural / Natural di alta qualità
    if (/neural/.test(blob)) score += 70;
    if (/natural/.test(blob)) score += 65;
    if (/wavenet|studio|premium|enhanced|journey|generative/.test(blob)) score += 50;

    // Vendor preferiti
    if (/google/.test(blob) && /it/.test(blob)) score += 100;
    if (/google/.test(blob)) score += 40;
    if (/microsoft/.test(blob) && (/neural|natural|elsa|isabella|italian|it-it/.test(blob))) score += 95;
    if (/microsoft/.test(blob) && /it/.test(blob)) score += 70;
    if (/apple|siri|alice|luca/.test(blob)) score += 20;

    // Offline di basso livello: metallici
    if (v?.localService === true) score -= 25;
    if (/compact|eloquence|espeak|robot|microsoft.*desktop|sapi/.test(blob)) score -= 60;
    if (/microsoft david|microsoft zira|microsoft helena|microsoft cosimo/.test(blob)) score -= 40;

    return score;
  };

  return pool.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
}

/**
 * Interrompe qualsiasi utterance in corso.
 */
export function stopSpeaking() {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

/**
 * Sblocca speechSynthesis dopo gesto utente.
 */
export function unlockSpeechSynthesis() {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(' ');
    utter.volume = 0;
    utter.rate = 10;
    window.speechSynthesis.speak(utter);
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
}

/**
 * Legge ad alta voce (it-IT, voce Neural/Online se disponibile, rate scattante).
 * @param {string} text
 * @param {{ rate?: number, pitch?: number, lang?: string, userName?: string | string[] | null }} [opts]
 * @returns {Promise<void>}
 */
export function speakText(text, opts = {}) {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisSupported()) {
      resolve();
      return;
    }
    const clean = sanitizeTextForSpeech(text, { userName: opts.userName });
    if (!clean) {
      resolve();
      return;
    }

    stopSpeaking();

    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = opts.lang || 'it-IT';
    utter.rate = Number.isFinite(opts.rate) ? opts.rate : KENTU_TTS_DEFAULT_RATE;
    utter.pitch = Number.isFinite(opts.pitch) ? opts.pitch : 1;

    const assignVoiceAndSpeak = () => {
      try {
        const voices = window.speechSynthesis.getVoices?.() || [];
        const preferred = pickPreferredItalianVoice(voices);
        if (preferred) {
          utter.voice = preferred;
          if (preferred.lang) utter.lang = preferred.lang;
        }
      } catch {
        // ignore voice pick failures
      }

      try {
        window.speechSynthesis.speak(utter);
      } catch {
        resolve();
      }
    };

    utter.onend = () => resolve();
    utter.onerror = () => resolve();

    const voicesNow = window.speechSynthesis.getVoices?.() || [];
    if (voicesNow.length === 0) {
      window.setTimeout(assignVoiceAndSpeak, 120);
    } else {
      assignVoiceAndSpeak();
    }
  });
}
