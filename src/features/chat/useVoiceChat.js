import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  readTtsEnabled,
  speakText,
  stopSpeaking,
  writeTtsEnabled,
} from './voiceChat.js';

/**
 * Hook chat vocale: microfono (STT) + lettura risposte (TTS) + preferenza ON/OFF.
 *
 * @param {{
 *   chatInput: string,
 *   setChatInput: (value: string | ((prev: string) => string)) => void,
 *   chatHistory?: Array<{ sender?: string, text?: string, type?: string, local?: boolean }>,
 *   isProcessing?: boolean,
 *   defaultTtsEnabled?: boolean,
 * }} opts
 */
export function useVoiceChat({
  chatInput,
  setChatInput,
  chatHistory = [],
  isProcessing = false,
  defaultTtsEnabled = false,
} = {}) {
  const [ttsEnabled, setTtsEnabled] = useState(() => readTtsEnabled(defaultTtsEnabled));
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [sttSupported] = useState(() => isSpeechRecognitionSupported());
  const [ttsSupported] = useState(() => isSpeechSynthesisSupported());

  const recognitionRef = useRef(null);
  const baseInputRef = useRef('');
  const lastSpokenKeyRef = useRef('');
  const skipInitialHistoryRef = useRef(true);
  const ttsEnabledRef = useRef(ttsEnabled);

  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);

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
      try {
        recognitionRef.current?.abort?.();
      } catch {
        // ignore
      }
    };
  }, [ttsSupported]);

  const stopListening = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) {
      setIsListening(false);
      return;
    }
    try {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.stop();
    } catch {
      try {
        rec.abort();
      } catch {
        // ignore
      }
    }
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    setVoiceError('');
    if (!sttSupported) {
      setVoiceError('Riconoscimento vocale non supportato su questo dispositivo.');
      return;
    }
    if (isProcessing) return;

    stopSpeaking();
    stopListening();

    const recognition = createSpeechRecognition();
    if (!recognition) {
      setVoiceError('Microfono non disponibile.');
      return;
    }

    baseInputRef.current = String(chatInput || '').trim();
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
      const base = baseInputRef.current;
      const combined = [base, finalChunk || interim]
        .map((p) => String(p || '').trim())
        .filter(Boolean)
        .join(' ');
      setChatInput(combined);
      if (finalChunk.trim()) {
        baseInputRef.current = [base, finalChunk.trim()]
          .filter(Boolean)
          .join(' ')
          .trim();
      }
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
  }, [chatInput, isProcessing, setChatInput, sttSupported, stopListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
      return;
    }
    startListening();
  }, [isListening, startListening, stopListening]);

  const toggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      if (!next) stopSpeaking();
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

    void speakText(text);
  }, [chatHistory, isListening, ttsSupported]);

  // Non ascoltare durante processing AI.
  useEffect(() => {
    if (isProcessing && isListening) stopListening();
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
