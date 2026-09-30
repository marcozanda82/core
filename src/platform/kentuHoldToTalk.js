/**
 * STT uniforme: plugin Capacitor su nativo, Web Speech API su browser (Vite/Vercel).
 */

import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { createSpeechRecognition } from '../features/chat/voiceChat';

const CAPACITOR_START_OPTS = {
  language: 'it-IT',
  maxResults: 1,
  prompt: 'Parla ora',
  partialResults: true,
  popup: false,
};

function liveFromPartialEvent(event) {
  if (!event || typeof event !== 'object') return '';
  if (Array.isArray(event.matches) && event.matches[0] != null) {
    return String(event.matches[0]);
  }
  if (event.transcript != null) return String(event.transcript);
  return '';
}

/**
 * Concatena solo i result.isFinal; se non ce ne sono, usa l'ultimo transcript.
 * Non restituisce stringhe vuote (i parziali vuoti non devono azzerare il live).
 */
export function transcriptFromWebSpeechEvent(event) {
  const results = event?.results;
  if (!results || results.length === 0) return '';

  const finals = [];
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    if (result?.isFinal !== true) continue;
    const piece = String(result?.[0]?.transcript ?? '').trim();
    if (piece) finals.push(piece);
  }
  if (finals.length > 0) return finals.join(' ');

  const last = results[results.length - 1];
  return String(last?.[0]?.transcript ?? '');
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

export function createHoldToTalkSession({
  onTranscript,
  onEngineStopped,
  onListeningEnd,
} = {}) {
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
    if (state.stopRequested) return;
    const next = String(raw ?? '');
    if (!next.trim() && String(state.liveText || '').trim()) return;
    state.liveText = next;
    try {
      onTranscript?.(state.liveText);
    } catch {
      /* ignore */
    }
  };

  const notifyListeningEnd = () => {
    try {
      onListeningEnd?.();
    } catch {
      /* ignore */
    }
  };

  const notifyEngineStopped = () => {
    try {
      onEngineStopped?.();
    } catch {
      /* ignore */
    }
  };

  const startWebkit = () => {
    if (state.stopRequested) return false;
    const recognition = createSpeechRecognition({ continuous: false });
    if (!recognition) return false;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    state.mode = 'webkit';
    state.recognition = recognition;
    recognition.onresult = (event) => {
      const next = transcriptFromWebSpeechEvent(event);
      if (!String(next || '').trim()) return;
      emitLive(next);
    };
    recognition.onerror = () => {
      notifyListeningEnd();
      if (!state.stopRequested) notifyEngineStopped();
    };
    recognition.onend = () => {
      notifyListeningEnd();
      if (!state.stopRequested) notifyEngineStopped();
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

  const startNative = async () => {
    const { SpeechRecognition } = await import(
      /* @vite-ignore */ '@capacitor-community/speech-recognition'
    );
    state.SpeechRecognition = SpeechRecognition;
    const available = await SpeechRecognition.available?.();
    if (available?.available === false) {
      throw new Error('speech_unavailable');
    }
    await SpeechRecognition.requestPermissions?.();
    if (state.stopRequested) return false;
    state.capacitorListener = await SpeechRecognition.addListener?.(
      'partialResults',
      (event) => {
        if (state.stopRequested) return;
        const next = liveFromPartialEvent(event);
        if (!String(next || '').trim()) return;
        emitLive(next);
      },
    );
    state.listeningStateListener = await SpeechRecognition.addListener?.(
      'listeningState',
      (event) => {
        if (String(event?.status || '') === 'stopped') {
          notifyListeningEnd();
          if (!state.stopRequested) notifyEngineStopped();
        }
      },
    );
    state.mode = 'capacitor';
    await SpeechRecognition.start(CAPACITOR_START_OPTS);
    state.started = true;
    return true;
  };

  const start = async () => {
    if (state.startGate) return state.startGate;
    state.startGate = (async () => {
      state.liveText = '';
      emitLive('');
      if (state.stopRequested) return false;
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        try {
          return await startNative();
        } catch {
          if (state.stopRequested) return false;
          return startWebkit();
        }
      }
      return startWebkit();
    })();
    return state.startGate;
  };

  const stop = async () => {
    const snapshot = String(state.liveText || '');
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
      notifyListeningEnd();
    } else if (mode === 'webkit' && state.recognition) {
      const rec = state.recognition;
      await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          notifyListeningEnd();
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
    } else {
      notifyListeningEnd();
    }
    const text = snapshot.replace(/\s+/g, ' ').trim();
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
