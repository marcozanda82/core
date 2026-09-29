/**
 * Long-press sul FAB Kentu: STT (Capacitor SpeechRecognition o Web Speech).
 * L'ascolto resta attivo fino a SpeechRecognition.stop() (tasto Ferma o timeout):
 * se il sistema chiude per silenzio, si riavvia tenendo il testo già detto.
 */

import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  collapseAnomalousRepetitions,
  createSpeechRecognition,
} from '../features/chat/voiceChat';

const CAPACITOR_START_OPTS = {
  language: 'it-IT',
  maxResults: 5,
  prompt: 'Parla ora',
  partialResults: true,
  popup: false,
};

const RESTART_DELAY_MS = 220;

function joinUtterance(prefix, next) {
  const left = String(prefix || '').replace(/\s+/g, ' ').trim();
  const right = String(next || '').replace(/\s+/g, ' ').trim();
  if (!left) return right;
  if (!right) return left;
  if (right.startsWith(left)) return right;
  if (left.startsWith(right)) return left;
  return `${left} ${right}`.replace(/\s+/g, ' ').trim();
}

/** Tutti i result Web Speech, non solo l'ultimo (altrimenti una pausa perde la frase precedente). */
function fullUtteranceFromEvent(event) {
  if (!event || typeof event !== 'object') return '';
  const results = event.results;
  if (results && results.length > 0) {
    let acc = '';
    for (let i = 0; i < results.length; i += 1) {
      acc += String(results[i]?.[0]?.transcript ?? '');
    }
    return acc;
  }
  if (event.matches != null && event.matches[0] != null) {
    return String(event.matches[0]);
  }
  if (event.transcript != null) return String(event.transcript);
  return '';
}

export async function playHoldToTalkHaptic() {
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
    return;
  } catch {
    try {
      navigator.vibrate?.(24);
    } catch {
      /* ignore */
    }
  }
}

export function createHoldToTalkSession({ onTranscript } = {}) {
  const state = {
    mode: null,
    recognition: null,
    detectedText: '',
    committedText: '',
    sessionScratch: '',
    capacitorListener: null,
    listeningStateListener: null,
    startGate: null,
    stopRequested: false,
    started: false,
    restartTimer: null,
    SpeechRecognition: null,
  };

  const emitCombined = () => {
    const next = joinUtterance(state.committedText, state.sessionScratch);
    state.detectedText = next;
    try {
      onTranscript?.(next);
    } catch {
      /* ignore */
    }
  };

  const clearRestartTimer = () => {
    if (state.restartTimer != null) {
      window.clearTimeout(state.restartTimer);
      state.restartTimer = null;
    }
  };

  const startWebkit = () => {
    if (state.stopRequested) return false;
    const recognition = createSpeechRecognition({ continuous: true });
    if (!recognition) return false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    state.mode = 'webkit';
    state.recognition = recognition;
    recognition.onresult = (event) => {
      state.sessionScratch = fullUtteranceFromEvent(event);
      emitCombined();
    };
    recognition.onerror = () => {
      if (state.stopRequested) return;
      scheduleRestart();
    };
    recognition.onend = () => {
      if (state.stopRequested) return;
      scheduleRestart();
    };
    try {
      recognition.start();
      state.started = true;
      return true;
    } catch {
      state.recognition = null;
      state.mode = null;
      return false;
    }
  };

  const startCapacitorEngine = async () => {
    const SpeechRecognition = state.SpeechRecognition;
    if (!SpeechRecognition || state.stopRequested) return false;
    await SpeechRecognition.start(CAPACITOR_START_OPTS);
    state.started = true;
    return true;
  };

  const scheduleRestart = () => {
    if (state.stopRequested) return;
    clearRestartTimer();
    state.committedText = joinUtterance(state.committedText, state.sessionScratch);
    state.sessionScratch = '';
    emitCombined();
    state.restartTimer = window.setTimeout(() => {
      state.restartTimer = null;
      if (state.stopRequested) return;
      if (state.mode === 'capacitor') {
        void startCapacitorEngine().catch(() => {});
        return;
      }
      if (state.mode === 'webkit' && state.recognition) {
        try {
          state.recognition.start();
        } catch {
          startWebkit();
        }
      }
    }, RESTART_DELAY_MS);
  };

  const start = async () => {
    if (state.startGate) return state.startGate;
    state.startGate = (async () => {
      state.detectedText = '';
      state.committedText = '';
      state.sessionScratch = '';
      if (state.stopRequested) return false;
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { SpeechRecognition } = await import(
            /* @vite-ignore */ '@capacitor-community/speech-recognition'
          );
          state.SpeechRecognition = SpeechRecognition;
          const available = await SpeechRecognition.available?.();
          if (available?.available !== false) {
            await SpeechRecognition.requestPermissions?.();
            if (state.stopRequested) return false;
            state.capacitorListener = await SpeechRecognition.addListener?.(
              'partialResults',
              (event) => {
                state.sessionScratch = String(event?.matches?.[0] ?? '');
                emitCombined();
              },
            );
            state.listeningStateListener = await SpeechRecognition.addListener?.(
              'listeningState',
              (event) => {
                if (state.stopRequested) return;
                if (String(event?.status || '') === 'stopped') {
                  scheduleRestart();
                }
              },
            );
            state.mode = 'capacitor';
            await startCapacitorEngine();
            if (state.stopRequested) return true;
            return true;
          }
        }
      } catch {
        /* plugin assente → Web Speech */
      }
      if (state.stopRequested) return false;
      return startWebkit();
    })();
    return state.startGate;
  };

  const stop = async () => {
    state.stopRequested = true;
    clearRestartTimer();
    if (state.startGate) {
      try {
        await state.startGate;
      } catch {
        /* ignore */
      }
    }
    const mode = state.mode;
    if (mode === 'capacitor' || (state.started && state.SpeechRecognition)) {
      try {
        const SpeechRecognition = state.SpeechRecognition
          || (await import(
            /* @vite-ignore */ '@capacitor-community/speech-recognition'
          ).then((mod) => mod.SpeechRecognition));
        try {
          await SpeechRecognition.stop();
        } catch {
          /* already stopped */
        }
        await new Promise((resolve) => {
          window.setTimeout(resolve, 180);
        });
        try {
          await state.capacitorListener?.remove?.();
        } catch {
          /* ignore */
        }
        try {
          await state.listeningStateListener?.remove?.();
        } catch {
          /* ignore */
        }
        try {
          await SpeechRecognition.removeAllListeners?.();
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    } else if (mode === 'webkit' && state.recognition) {
      const rec = state.recognition;
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          try {
            rec.onresult = null;
            rec.onerror = null;
            rec.onend = null;
          } catch {
            /* ignore */
          }
          resolve();
        };
        rec.onend = finish;
        rec.onerror = finish;
        try {
          rec.stop();
        } catch {
          try {
            rec.abort();
          } catch {
            /* ignore */
          }
          finish();
          return;
        }
        window.setTimeout(finish, 450);
      });
    }
    const text = collapseAnomalousRepetitions(
      joinUtterance(state.committedText, state.sessionScratch) || String(state.detectedText || ''),
    )
      .replace(/\s+/g, ' ')
      .trim();
    state.mode = null;
    state.recognition = null;
    state.capacitorListener = null;
    state.listeningStateListener = null;
    state.detectedText = '';
    state.committedText = '';
    state.sessionScratch = '';
    state.started = false;
    state.SpeechRecognition = null;
    return text;
  };

  return { start, stop };
}
