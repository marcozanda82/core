/**
 * Long-press sul FAB Kentu: STT (Capacitor SpeechRecognition o Web Speech)
 * e aptica nativa con fallback vibrate.
 *
 * L'API restituisce già la frase intera in matches[0] / ultimo transcript:
 * si SOSTITUISCE lo stato, non si concatena mai al testo precedente.
 */

import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  collapseAnomalousRepetitions,
  createSpeechRecognition,
} from '../features/chat/voiceChat';

/** Frase completa fornita dall'evento — un solo snapshot, mai un pezzo da accodare. */
function fullUtteranceFromEvent(event) {
  if (!event || typeof event !== 'object') return '';
  if (event.matches != null && event.matches[0] != null) {
    return String(event.matches[0]);
  }
  const results = event.results;
  if (results && results.length > 0) {
    const last = results[results.length - 1];
    return String(last?.[0]?.transcript ?? '');
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
    capacitorListener: null,
    startGate: null,
    stopRequested: false,
    started: false,
  };

  const emitTranscript = (raw) => {
    const next = String(raw ?? '');
    state.detectedText = next;
    try {
      onTranscript?.(next);
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
    state.detectedText = '';
    recognition.onresult = (event) => {
      emitTranscript(fullUtteranceFromEvent(event));
    };
    recognition.onerror = () => {};
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
      state.detectedText = '';
      if (state.stopRequested) return false;
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (Capacitor.isNativePlatform()) {
          const { SpeechRecognition } = await import(
            /* @vite-ignore */ '@capacitor-community/speech-recognition'
          );
          const available = await SpeechRecognition.available?.();
          if (available?.available !== false) {
            await SpeechRecognition.requestPermissions?.();
            if (state.stopRequested) return false;
            state.capacitorListener = await SpeechRecognition.addListener?.(
              'partialResults',
              (event) => {
                emitTranscript(event?.matches?.[0] ?? '');
              },
            );
            state.mode = 'capacitor';
            await SpeechRecognition.start({
              language: 'it-IT',
              maxResults: 1,
              prompt: 'Parla ora',
              partialResults: true,
              popup: false,
            });
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
    if (mode === 'capacitor' || state.started) {
      try {
        const { SpeechRecognition } = await import(
          /* @vite-ignore */ '@capacitor-community/speech-recognition'
        );
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
    const text = collapseAnomalousRepetitions(String(state.detectedText || ''))
      .replace(/\s+/g, ' ')
      .trim();
    state.mode = null;
    state.recognition = null;
    state.capacitorListener = null;
    state.detectedText = '';
    state.started = false;
    return text;
  };

  return { start, stop };
}
