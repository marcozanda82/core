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
 * Pulisce testo AI da markdown grezzo prima della lettura.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeTextForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/[_#~>|[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
 * Legge ad alta voce (it-IT se disponibile).
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
    utter.rate = Number.isFinite(opts.rate) ? opts.rate : 1.02;
    utter.pitch = Number.isFinite(opts.pitch) ? opts.pitch : 1;

    try {
      const voices = window.speechSynthesis.getVoices?.() || [];
      const italian = voices.find((v) => /^it(-|_)/i.test(v.lang))
        || voices.find((v) => /italian|italia/i.test(v.name || ''));
      if (italian) utter.voice = italian;
    } catch {
      // ignore voice pick failures
    }

    utter.onend = () => resolve();
    utter.onerror = () => resolve();

    // Chrome a volte richiede getVoices() async: piccolo delay sicuro.
    const speakNow = () => {
      try {
        window.speechSynthesis.speak(utter);
      } catch {
        resolve();
      }
    };

    if ((window.speechSynthesis.getVoices?.() || []).length === 0) {
      window.setTimeout(speakNow, 80);
    } else {
      speakNow();
    }
  });
}
