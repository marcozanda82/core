/**
 * Long-press sul FAB Kentu: STT (Capacitor SpeechRecognition o Web Speech)
 * e aptica nativa con fallback vibrate.
 */

import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { createSpeechRecognition } from '../features/chat/voiceChat';

function collectWebTranscript(event) {
  if (!event?.results) return '';
  let text = '';
  for (let i = 0; i < event.results.length; i += 1) {
    const result = event.results[i];
    const piece = String(result?.[0]?.transcript || '').trim();
    if (piece) text = text ? `${text} ${piece}` : piece;
  }
  return text.trim();
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
    transcript: '',
    capacitorListener: null,
  };

  const startWebkit = () => {
    const recognition = createSpeechRecognition({ continuous: true });
    if (!recognition) return false;
    state.mode = 'webkit';
    state.recognition = recognition;
    state.transcript = '';
    recognition.onresult = (event) => {
      const next = collectWebTranscript(event);
      if (next) state.transcript = next;
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
    state.transcript = '';
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
              if (match) state.transcript = match;
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
      try {
        state.recognition.onresult = null;
        state.recognition.onerror = null;
        state.recognition.stop();
      } catch {
        try {
          state.recognition.abort();
        } catch {
          /* ignore */
        }
      }
    }
    const text = String(state.transcript || '').trim();
    state.mode = null;
    state.recognition = null;
    state.capacitorListener = null;
    state.transcript = '';
    return text;
  };

  return { start, stop };
}
