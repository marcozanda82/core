import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  readTtsEnabled,
  speakText,
  stopSpeaking,
  unlockSpeechSynthesis,
  writeTtsEnabled,
} from './voiceChat.js';

/**
 * Hook chat vocale: microfono (STT) a controllo manuale + TTS solo dopo turno vocale.
 *
 * @param {{
 *   chatHistory?: Array<{ sender?: string, text?: string, type?: string, local?: boolean }>,
 *   isProcessing?: boolean,
 *   defaultTtsEnabled?: boolean,
 *   onVoiceSubmit?: ((text: string) => void) | null,
 *   userDisplayName?: string,
 * }} opts
 */
export function useVoiceChat({
  chatHistory = [],
  isProcessing = false,
  defaultTtsEnabled = false,
  onVoiceSubmit = null,
  userDisplayName = '',
} = {}) {
  const [ttsEnabled, setTtsEnabled] = useState(() => readTtsEnabled(defaultTtsEnabled));
  const [isListening, setIsListening] = useState(false);
  const [voiceSessionActive, setVoiceSessionActive] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [sttSupported] = useState(() => isSpeechRecognitionSupported());
  const [ttsSupported] = useState(() => isSpeechSynthesisSupported());

  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const lastSpokenKeyRef = useRef('');
  const skipInitialHistoryRef = useRef(true);
  const ttsEnabledRef = useRef(ttsEnabled);
  const onVoiceSubmitRef = useRef(onVoiceSubmit);
  const userDisplayNameRef = useRef(userDisplayName);
  /** Solo dopo invio da microfono: la prossima risposta AI può essere letta. */
  const speakNextAiReplyRef = useRef(false);
  const voiceSessionActiveRef = useRef(false);
  const restartTimerRef = useRef(null);
  const intentionalStopRef = useRef(false);
  const startRecognitionEngineRef = useRef(() => false);

  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);

  useEffect(() => {
    onVoiceSubmitRef.current = onVoiceSubmit;
  }, [onVoiceSubmit]);

  useEffect(() => {
    userDisplayNameRef.current = userDisplayName;
  }, [userDisplayName]);

  useEffect(() => {
    voiceSessionActiveRef.current = voiceSessionActive;
  }, [voiceSessionActive]);

  useEffect(() => {
    writeTtsEnabled(ttsEnabled);
  }, [ttsEnabled]);

  const syncDisplayTranscript = useCallback(() => {
    const display = [finalTranscriptRef.current, interimTranscriptRef.current]
      .filter(Boolean)
      .join(' ')
      .trim();
    setVoiceTranscript(display);
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current != null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const detachRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.onstart = null;
    } catch {
      // ignore
    }
    recognitionRef.current = null;
  }, []);

  const abortRecognition = useCallback(() => {
    clearRestartTimer();
    intentionalStopRef.current = true;
    const rec = recognitionRef.current;
    detachRecognition();
    if (!rec) {
      setIsListening(false);
      return;
    }
    try {
      rec.abort();
    } catch {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  }, [clearRestartTimer, detachRecognition]);

  const startRecognitionEngine = useCallback(() => {
    if (!sttSupported) return false;
    if (recognitionRef.current) return true;

    const recognition = createSpeechRecognition({ continuous: false });
    if (!recognition) {
      setVoiceError('Microfono non disponibile.');
      return false;
    }

    recognitionRef.current = recognition;

    recognition.onstart = () => {
      intentionalStopRef.current = false;
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let interim = '';
      let finalChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const piece = String(result?.[0]?.transcript || '');
        if (result.isFinal) finalChunk += piece;
        else interim += piece;
      }
      if (finalChunk.trim()) {
        finalTranscriptRef.current = [finalTranscriptRef.current, finalChunk.trim()]
          .filter(Boolean)
          .join(' ')
          .trim();
      }
      interimTranscriptRef.current = interim.trim();
      syncDisplayTranscript();
    };

    recognition.onerror = (event) => {
      const code = String(event?.error || '');
      if (code === 'aborted' || code === 'no-speech') {
        setIsListening(false);
        return;
      }
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setVoiceError('Permesso microfono negato. Abilitalo nelle impostazioni del browser.');
        intentionalStopRef.current = true;
        voiceSessionActiveRef.current = false;
        setVoiceSessionActive(false);
        setIsListening(false);
        recognitionRef.current = null;
        return;
      }
      setVoiceError('Ascolto interrotto. Puoi riprovare o ricominciare.');
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      // Nota vocale: fine frase/pausa → stop. Niente auto-restart ciclico.
      // L'utente riattiva il microfono manualmente se vuole aggiungere altro.
    };

    try {
      recognition.start();
      return true;
    } catch (err) {
      console.warn('[useVoiceChat] start failed', err);
      setVoiceError('Impossibile avviare il microfono.');
      recognitionRef.current = null;
      setIsListening(false);
      return false;
    }
  }, [clearRestartTimer, sttSupported, syncDisplayTranscript]);

  startRecognitionEngineRef.current = startRecognitionEngine;

  // Precarica voci TTS (Chrome).
  useEffect(() => {
    if (!ttsSupported) return undefined;
    const warm = () => {
      try {
        window.speechSynthesis.getVoices();
      } catch {
        // ignore
      }
    };
    warm();
    window.speechSynthesis?.addEventListener?.('voiceschanged', warm);
    return () => {
      window.speechSynthesis?.removeEventListener?.('voiceschanged', warm);
      stopSpeaking();
      intentionalStopRef.current = true;
      clearRestartTimer();
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // ignore
      }
      detachRecognition();
    };
  }, [ttsSupported, clearRestartTimer, detachRecognition]);

  const beginVoiceSession = useCallback(() => {
    setVoiceError('');
    if (!sttSupported) {
      setVoiceError('Riconoscimento vocale non supportato su questo dispositivo.');
      return;
    }
    if (isProcessing) return;

    unlockSpeechSynthesis();
    stopSpeaking();
    speakNextAiReplyRef.current = false;

    clearRestartTimer();
    intentionalStopRef.current = true;
    abortRecognition();
    intentionalStopRef.current = false;

    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setVoiceTranscript('');
    voiceSessionActiveRef.current = true;
    setVoiceSessionActive(true);

    if (!startRecognitionEngine()) {
      voiceSessionActiveRef.current = false;
      setVoiceSessionActive(false);
    }
  }, [abortRecognition, clearRestartTimer, isProcessing, startRecognitionEngine, sttSupported]);

  const cancelVoiceSession = useCallback(() => {
    clearRestartTimer();
    intentionalStopRef.current = true;
    voiceSessionActiveRef.current = false;
    setVoiceSessionActive(false);
    abortRecognition();
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setVoiceTranscript('');
    setVoiceError('');
  }, [abortRecognition, clearRestartTimer]);

  const restartVoiceSession = useCallback(() => {
    setVoiceError('');
    if (!sttSupported || isProcessing) return;

    clearRestartTimer();
    intentionalStopRef.current = true;
    abortRecognition();

    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setVoiceTranscript('');

    intentionalStopRef.current = false;
    voiceSessionActiveRef.current = true;
    setVoiceSessionActive(true);

    if (!startRecognitionEngine()) {
      voiceSessionActiveRef.current = false;
      setVoiceSessionActive(false);
    }
  }, [abortRecognition, clearRestartTimer, isProcessing, startRecognitionEngine, sttSupported]);

  const confirmVoiceSubmit = useCallback(() => {
    const text = String(
      finalTranscriptRef.current || voiceTranscript || '',
    ).trim();
    if (!text) {
      setVoiceError('Nessun testo da inviare. Parla oppure annulla.');
      return;
    }

    clearRestartTimer();
    intentionalStopRef.current = true;
    voiceSessionActiveRef.current = false;
    setVoiceSessionActive(false);
    abortRecognition();

    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    setVoiceTranscript('');
    setVoiceError('');

    speakNextAiReplyRef.current = true;

    const submit = onVoiceSubmitRef.current;
    if (typeof submit === 'function') {
      submit(text);
    }
  }, [abortRecognition, clearRestartTimer, voiceTranscript]);

  /** Invio testuale: non leggere la prossima risposta AI. */
  const noteTextInteraction = useCallback(() => {
    speakNextAiReplyRef.current = false;
    stopSpeaking();
  }, []);

  const toggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      if (!next) stopSpeaking();
      else unlockSpeechSynthesis();
      return next;
    });
  }, []);

  // Lettura AI solo se l’ultimo invio era vocale (flag) e TTS è ON.
  useEffect(() => {
    if (skipInitialHistoryRef.current) {
      skipInitialHistoryRef.current = false;
      const last = Array.isArray(chatHistory) ? chatHistory[chatHistory.length - 1] : null;
      if (last?.sender === 'ai') {
        lastSpokenKeyRef.current = `${chatHistory.length}:${String(last.text || '').slice(0, 80)}`;
      }
      return;
    }

    if (!speakNextAiReplyRef.current) return;
    if (voiceSessionActive) return;

    const list = Array.isArray(chatHistory) ? chatHistory : [];
    const last = list[list.length - 1];
    if (!last || last.sender !== 'ai') return;
    if (last.local === true) return;
    if (last.isTyping === true) return;

    const text = String(last.spokenText || last.text || '').trim();
    if (!text) return;

    const key = `${list.length}:${text.slice(0, 80)}`;
    if (key === lastSpokenKeyRef.current) return;
    lastSpokenKeyRef.current = key;

    // Consuma il flag anche se TTS è OFF: niente coda latente su messaggi successivi.
    speakNextAiReplyRef.current = false;
    if (!ttsEnabledRef.current || !ttsSupported) return;

    void speakText(text, { userName: userDisplayNameRef.current || null });
  }, [chatHistory, voiceSessionActive, ttsSupported]);

  useEffect(() => {
    if (isProcessing && (isListening || voiceSessionActive)) {
      clearRestartTimer();
      intentionalStopRef.current = true;
      voiceSessionActiveRef.current = false;
      setVoiceSessionActive(false);
      abortRecognition();
    }
  }, [isProcessing, isListening, voiceSessionActive, abortRecognition, clearRestartTimer]);

  return {
    ttsEnabled,
    toggleTts,
    isListening,
    voiceSessionActive,
    voiceTranscript,
    beginVoiceSession,
    cancelVoiceSession,
    restartVoiceSession,
    confirmVoiceSubmit,
    noteTextInteraction,
    sttSupported,
    ttsSupported,
    voiceError,
    clearVoiceError: () => setVoiceError(''),
  };
}
