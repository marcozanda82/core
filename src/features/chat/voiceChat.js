/**
 * Chat vocale Kentu — Web Speech API (STT + TTS).
 */

export const KENTU_TTS_STORAGE_KEY = 'kentu_chat_tts_enabled';

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

  // Stessa parola ripetuta (con virgole/punteggiatura opzionale): "Marco, Marco" → "Marco"
  for (let i = 0; i < 3; i += 1) {
    const next = s.replace(
      /\b([\p{L}\p{N}']{2,})(?:\s*[,;:.\-–—]?\s+\1\b)+/giu,
      '$1',
    );
    if (next === s) break;
    s = next;
  }

  // Bigrammi ripetuti: "tutto bene tutto bene" → "tutto bene"
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
 * Pulisce testo AI per sintesi vocale naturale (no markdown, no ripeti).
 * @param {string} text
 * @returns {string}
 */
export function sanitizeTextForSpeech(text) {
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
    // Emoji / simboli che rovinano l’ascolto
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[_#~|>[\](){}]/g, ' ')
    .replace(/[*]/g, ' ')
    .replace(/[/\\]/g, ' ')
    .replace(/[•●▪︎◦▸►◆◇★☆✓✔✕✖※™®©]+/g, ' ')
    .replace(/\s*[-–—]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  s = collapseAnomalousRepetitions(s);

  return s.replace(/\s+/g, ' ').replace(/\s+,/g, ',').replace(/,\s*,+/g, ',').trim();
}

/**
 * Seleziona la voce italiana più naturale disponibile (Google / Microsoft Neural prioritarie).
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
    if (/^it([-_]|$)/i.test(String(v?.lang || ''))) score += 20;
    if (/google/.test(blob) && /it/.test(blob)) score += 100;
    if (/microsoft/.test(blob) && (/neural|natural|elsa|isabella|italian|it-it/.test(blob))) score += 95;
    if (/microsoft/.test(blob) && /it/.test(blob)) score += 85;
    if (/neural|natural|premium|enhanced|wavenet|studio/.test(blob)) score += 40;
    if (/google/.test(blob)) score += 30;
    if (/apple|samantha|siri|alice|luca/.test(blob)) score += 25;
    if (/compact|robot|eloquence/.test(blob)) score -= 30;
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
 * Sblocca speechSynthesis dopo gesto utente (necessario su alcuni browser
 * per far parlare le risposte AI asincrone).
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
 * Legge ad alta voce (it-IT, voce naturale se disponibile).
 * @param {string} text
 * @param {{ rate?: number, pitch?: number, lang?: string }} [opts]
 * @returns {Promise<void>}
 */
export function speakText(text, opts = {}) {
  return new Promise((resolve) => {
    if (!isSpeechSynthesisSupported()) {
      resolve();
      return;
    }
    const clean = sanitizeTextForSpeech(text);
    if (!clean) {
      resolve();
      return;
    }

    stopSpeaking();

    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = opts.lang || 'it-IT';
    utter.rate = Number.isFinite(opts.rate) ? opts.rate : 1.0;
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
