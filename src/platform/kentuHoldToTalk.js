/**
 * STT nativo Capacitor (o Web Speech in fallback).
 * I partialResults sovrascrivono sempre matches[0]: niente concat.
 * Lo stop del motore (Ferma, timeout OS, silenzio Android) è notificato al caller,
 * che accoda il live transcript al testo finale.
 */

import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { createSpeechRecognition } from '../features/chat/voiceChat';

const CAPACITOR_START_OPTS = {
  language: 'it-IT',
  maxResults: 5,
  prompt: 'Parla ora',
  partialResults: true,
  popup: false,
};

function liveFromPartialEvent(event) {
  if (!event || typeof event !== 'object') return '';
  if (event.matches != null && event.matches[0] != null) {
    return String(event.matches[0]);
  }
  if (event.transcript != null) return String(event.transcript);
  return '';
}

/** Web Speech: l'API accumula i result; non è il bug Android dei partial overwrite. */
function fullUtteranceFromWebEvent(event) {
  if (!event || typeof event !== 'object') return '';
  const results = event.results;
  if (results && results.length > 0) {
    let acc = '';
    for (let i = 0; i < results.length; i += 1) {
      acc += String(results[i]?.[0]?.transcript ?? '');
    }
    return acc;
  }
  return liveFromPartialEvent(event);
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

export function createHoldToTalkSession({ onTranscript, onEngineStopped } = {}) {
  const state = {
    mode: null,
    recognition: null,
    liveText: '',
    capacitorListener: null,
    listeningStateListener: null,
    startGate: null,
    stopRequested: false,
    started: false,
    SpeechRecognition: null,
  };

  const emitLive = (raw) => {
    state.liveText = String(raw || '');
    try {
      onTranscript?.(state.liveText);
    } catch {
      /* ignore */
    }
  };

  const notifyEngineStopped = () => {
    if (state.stopRequested) return;
    try {
      onEngineStopped?.();
    } catch {
      /* ignore */
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
      emitLive(fullUtteranceFromWebEvent(event));
    };
    recognition.onerror = () => {
      if (state.stopRequested) return;
      notifyEngineStopped();
    };
    recognition.onend = () => {
      if (state.stopRequested) return;
      notifyEngineStopped();
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

  const start = async () => {
    if (state.startGate) return state.startGate;
    state.startGate = (async () => {
      state.liveText = '';
      emitLive('');
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
                emitLive(String(event?.matches?.[0] ?? ''));
              },
            );
            state.listeningStateListener = await SpeechRecognition.addListener?.(
              'listeningState',
              (event) => {
                if (state.stopRequested) return;
                if (String(event?.status || '') === 'stopped') {
                  notifyEngineStopped();
                }
              },
            );
            state.mode = 'capacitor';
            await SpeechRecognition.start(CAPACITOR_START_OPTS);
            state.started = true;
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
    const text = String(state.liveText || '').replace(/\s+/g, ' ').trim();
    state.mode = null;
    state.recognition = null;
    state.capacitorListener = null;
    state.listeningStateListener = null;
    state.liveText = '';
    state.started = false;
    state.SpeechRecognition = null;
    return text;
  };

  return { start, stop };
}
