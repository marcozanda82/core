/**
 * Long-press sul FAB Kentu: STT (Capacitor SpeechRecognition o Web Speech)
 * e aptica nativa con fallback vibrate.
 *
 * Trascrizione: solo il testo finale (isFinal / ultima ipotesi completa).
 * I partial non si concatenano — si sovrascrivono.
 */

import { Haptics, ImpactStyle } from '@capacitor/haptics';
import {
  collapseAnomalousRepetitions,
  createSpeechRecognition,
} from '../features/chat/voiceChat';

function applySpeechResult(event, state) {
  if (!event?.results) return;
  const finals = [];
  let interim = '';
  for (let i = 0; i < event.results.length; i += 1) {
    const result = event.results[i];
    const piece = String(result?.[0]?.transcript || '').trim();
    if (!piece) continue;
    if (result.isFinal) finals.push(piece);
    else interim = piece;
  }
  const finalText = finals.join(' ').replace(/\s+/g, ' ').trim();
  if (finalText) state.finalTranscript = finalText;
  state.interimTranscript = interim;
}

function pickCleanTranscript(state) {
  const raw = String(state.finalTranscript || state.interimTranscript || '').trim();
  return collapseAnomalousRepetitions(raw).replace(/\s+/g, ' ').trim();
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

export function createHoldToTalkSession() {
  const state = {
    mode: null,
    recognition: null,
    finalTranscript: '',
    interimTranscript: '',
    capacitorListener: null,
  };

  const startWebkit = () => {
    const recognition = createSpeechRecognition({ continuous: true });
    if (!recognition) return false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    state.mode = 'webkit';
    state.recognition = recognition;
    state.finalTranscript = '';
    state.interimTranscript = '';
    recognition.onresult = (event) => {
      applySpeechResult(event, state);
    };
    recognition.onerror = () => {};
    try {
      recognition.start();
      return true;
    } catch {
      state.recognition = null;
      state.mode = null;
      return false;
    }
  };

  const start = async () => {
    state.finalTranscript = '';
    state.interimTranscript = '';
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        const { SpeechRecognition } = await import(
          /* @vite-ignore */ '@capacitor-community/speech-recognition'
        );
        const available = await SpeechRecognition.available?.();
        if (available?.available !== false) {
          await SpeechRecognition.requestPermissions?.();
          state.capacitorListener = await SpeechRecognition.addListener?.(
            'partialResults',
            (data) => {
              const match = String(data?.matches?.[0] || '').trim();
              if (!match) return;
              // L'API Android manda l'ipotesi COMPLETA: sovrascrivi, non concatenare.
              state.interimTranscript = match;
            },
          );
          await SpeechRecognition.start({
            language: 'it-IT',
            maxResults: 1,
            prompt: 'Parla ora',
            partialResults: true,
            popup: false,
          });
          state.mode = 'capacitor';
          return true;
        }
      }
    } catch {
      /* plugin assente → Web Speech */
    }
    return startWebkit();
  };

  const stop = async () => {
    const mode = state.mode;
    if (mode === 'capacitor') {
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
          window.setTimeout(resolve, 120);
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
    const text = pickCleanTranscript(state);
    state.mode = null;
    state.recognition = null;
    state.capacitorListener = null;
    state.finalTranscript = '';
    state.interimTranscript = '';
    return text;
  };

  return { start, stop };
}
