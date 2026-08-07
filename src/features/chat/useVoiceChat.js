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
 * Hook chat vocale: microfono (STT) + lettura risposte (TTS) + preferenza ON/OFF.
 * True voice-to-voice: a fine frase il testo viene inviato automaticamente.
 *
 * @param {{
 *   chatInput: string,
 *   setChatInput: (value: string | ((prev: string) => string)) => void,
 *   chatHistory?: Array<{ sender?: string, text?: string, type?: string, local?: boolean }>,
 *   isProcessing?: boolean,
 *   defaultTtsEnabled?: boolean,
 *   onVoiceSubmit?: ((text: string) => void) | null,
 *   autoSubmitOnSpeechEnd?: boolean,
 *   userDisplayName?: string,
 * }} opts
 */
export function useVoiceChat({
  chatInput,
  setChatInput,
  chatHistory = [],
  isProcessing = false,
  defaultTtsEnabled = false,
  onVoiceSubmit = null,
  autoSubmitOnSpeechEnd = true,
  userDisplayName = '',
} = {}) {
  const [ttsEnabled, setTtsEnabled] = useState(() => readTtsEnabled(defaultTtsEnabled));
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [sttSupported] = useState(() => isSpeechRecognitionSupported());
  const [ttsSupported] = useState(() => isSpeechSynthesisSupported());

  const recognitionRef = useRef(null);
  const baseInputRef = useRef('');
  const finalTranscriptRef = useRef('');
  const lastSpokenKeyRef = useRef('');
  const skipInitialHistoryRef = useRef(true);
  const ttsEnabledRef = useRef(ttsEnabled);
  const onVoiceSubmitRef = useRef(onVoiceSubmit);
  const autoSubmitRef = useRef(autoSubmitOnSpeechEnd);
  const suppressSubmitRef = useRef(false);
  const didSubmitTurnRef = useRef(false);
  const userDisplayNameRef = useRef(userDisplayName);

  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);

  useEffect(() => {
    onVoiceSubmitRef.current = onVoiceSubmit;
  }, [onVoiceSubmit]);

  useEffect(() => {
    autoSubmitRef.current = autoSubmitOnSpeechEnd;
  }, [autoSubmitOnSpeechEnd]);

  useEffect(() => {
    userDisplayNameRef.current = userDisplayName;
  }, [userDisplayName]);

  useEffect(() => {
    writeTtsEnabled(ttsEnabled);
  }, [ttsEnabled]);

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
      suppressSubmitRef.current = true;
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // ignore
      }
    };
  }, [ttsSupported]);

  const buildSubmitText = useCallback(() => {
    const finalPart = String(finalTranscriptRef.current || '').trim();
    const base = String(baseInputRef.current || '').trim();
    if (finalPart && base) {
      // finalPart già include l’accumulo su base durante onresult
      return finalPart;
    }
    return finalPart || base || String(chatInput || '').trim();
  }, [chatInput]);

  const maybeAutoSubmit = useCallback(() => {
    if (suppressSubmitRef.current) {
      suppressSubmitRef.current = false;
      return;
    }
    if (didSubmitTurnRef.current) return;
    if (!autoSubmitRef.current) return;
    const submit = onVoiceSubmitRef.current;
    if (typeof submit !== 'function') return;
    const text = buildSubmitText();
    if (!text) return;
    didSubmitTurnRef.current = true;
    setChatInput(text);
    submit(text);
  }, [buildSubmitText, setChatInput]);

  const stopListening = useCallback((opts = {}) => {
    const { submit = false } = opts;
    const rec = recognitionRef.current;

    if (!rec) {
      setIsListening(false);
      if (submit) maybeAutoSubmit();
      return;
    }

    try {
      if (submit) {
        // Lascia onend + backup timer (dedupe via didSubmitTurnRef).
        rec.stop();
      } else {
        // Stop silenzioso: nessun auto-invio.
        suppressSubmitRef.current = true;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try {
          rec.abort();
        } catch {
          rec.stop();
        }
        suppressSubmitRef.current = false;
      }
    } catch {
      try {
        rec.abort();
      } catch {
        // ignore
      }
      suppressSubmitRef.current = false;
    }
    recognitionRef.current = null;
    setIsListening(false);
    if (submit) {
      window.setTimeout(() => maybeAutoSubmit(), 30);
    }
  }, [maybeAutoSubmit]);

  const startListening = useCallback(() => {
    setVoiceError('');
    if (!sttSupported) {
      setVoiceError('Riconoscimento vocale non supportato su questo dispositivo.');
      return;
    }
    if (isProcessing) return;

    unlockSpeechSynthesis();
    stopSpeaking();
    stopListening({ submit: false });

    const recognition = createSpeechRecognition();
    if (!recognition) {
      setVoiceError('Microfono non disponibile.');
      return;
    }

    // Turno vocale pulito: il messaggio parlato sostituisce l’input.
    baseInputRef.current = '';
    finalTranscriptRef.current = '';
    didSubmitTurnRef.current = false;
    setChatInput('');
    recognitionRef.current = recognition;

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
      const display = [finalTranscriptRef.current, interim.trim()]
        .filter(Boolean)
        .join(' ')
        .trim();
      setChatInput(display);
    };

    recognition.onerror = (event) => {
      const code = String(event?.error || '');
      if (code === 'aborted' || code === 'no-speech') {
        setIsListening(false);
        return;
      }
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        setVoiceError('Permesso microfono negato. Abilitalo nelle impostazioni del browser.');
      } else {
        setVoiceError('Ascolto interrotto. Riprova.');
      }
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      maybeAutoSubmit();
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.warn('[useVoiceChat] start failed', err);
      setVoiceError('Impossibile avviare il microfono.');
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, [isProcessing, maybeAutoSubmit, setChatInput, sttSupported, stopListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      // Stop manuale → invia comunque quanto trascritto (voice-to-voice).
      stopListening({ submit: true });
      return;
    }
    startListening();
  }, [isListening, startListening, stopListening]);

  const toggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      if (!next) stopSpeaking();
      else unlockSpeechSynthesis();
      return next;
    });
  }, []);

  // Auto-lettura nuove risposte AI.
  useEffect(() => {
    if (skipInitialHistoryRef.current) {
      skipInitialHistoryRef.current = false;
      const last = Array.isArray(chatHistory) ? chatHistory[chatHistory.length - 1] : null;
      if (last?.sender === 'ai') {
        lastSpokenKeyRef.current = `${chatHistory.length}:${String(last.text || '').slice(0, 80)}`;
      }
      return;
    }

    if (!ttsEnabledRef.current || !ttsSupported || isListening) return;

    const list = Array.isArray(chatHistory) ? chatHistory : [];
    const last = list[list.length - 1];
    if (!last || last.sender !== 'ai') return;
    if (last.local === true) return;
    if (last.isTyping === true) return;

    const text = String(last.text || '').trim();
    if (!text) return;

    const key = `${list.length}:${text.slice(0, 80)}`;
    if (key === lastSpokenKeyRef.current) return;
    lastSpokenKeyRef.current = key;

    void speakText(text, { userName: userDisplayNameRef.current || null });
  }, [chatHistory, isListening, ttsSupported]);

  // Non ascoltare durante processing AI (senza auto-submit: l’invio è già partito).
  useEffect(() => {
    if (isProcessing && isListening) {
      stopListening({ submit: false });
    }
  }, [isProcessing, isListening, stopListening]);

  return {
    ttsEnabled,
    toggleTts,
    isListening,
    toggleListening,
    stopListening,
    sttSupported,
    ttsSupported,
    voiceError,
    clearVoiceError: () => setVoiceError(''),
  };
}
