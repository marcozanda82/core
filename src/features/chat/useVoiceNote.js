import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @returns {boolean}
 */
export function isVoiceNoteRecordingSupported() {
  if (typeof window === 'undefined') return false;
  if (!navigator?.mediaDevices?.getUserMedia) return false;
  if (typeof MediaRecorder === 'undefined') return false;
  return true;
}

/**
 * @returns {string}
 */
function pickAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

/**
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatRecordingDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Nota vocale asincrona (MediaRecorder) — Record → Stop → Discard/Send.
 *
 * @param {{ isProcessing?: boolean }} [opts]
 */
export function useVoiceNote({ isProcessing = false } = {}) {
  const [status, setStatus] = useState('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [voiceError, setVoiceError] = useState('');
  const [isSupported] = useState(() => isVoiceNoteRecordingSupported());

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const durationIntervalRef = useRef(null);
  const recordingStartedAtRef = useRef(0);
  const mimeTypeRef = useRef('');

  const clearDurationInterval = useCallback(() => {
    if (durationIntervalRef.current != null) {
      window.clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
    }
    streamRef.current = null;
  }, []);

  const resetRecorderRefs = useCallback(() => {
    recorderRef.current = null;
    chunksRef.current = [];
    mimeTypeRef.current = '';
  }, []);

  const discardNote = useCallback(() => {
    clearDurationInterval();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    releaseStream();
    resetRecorderRefs();
    setAudioBlob(null);
    setRecordingDuration(0);
    setStatus('idle');
    setVoiceError('');
  }, [clearDurationInterval, releaseStream, resetRecorderRefs]);

  const startRecording = useCallback(async () => {
    if (!isSupported || isProcessing) return;
    if (status === 'recording') return;

    setVoiceError('');

    if (status !== 'idle') {
      discardNote();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickAudioMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setVoiceError('Errore durante la registrazione.');
        discardNote();
      };

      recorder.onstop = () => {
        clearDurationInterval();
        releaseStream();

        const type = mimeTypeRef.current || recorder.mimeType || 'audio/webm';
        const blob = chunksRef.current.length > 0
          ? new Blob(chunksRef.current, { type })
          : null;

        resetRecorderRefs();

        if (blob && blob.size > 0) {
          setAudioBlob(blob);
          setStatus('pendingBlob');
        } else {
          setVoiceError('Registrazione vuota. Riprova.');
          setRecordingDuration(0);
          setAudioBlob(null);
          setStatus('idle');
        }
      };

      recordingStartedAtRef.current = Date.now();
      setRecordingDuration(0);
      setAudioBlob(null);
      setStatus('recording');

      recorder.start(250);

      durationIntervalRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
        setRecordingDuration(elapsed);
      }, 250);
    } catch (error) {
      releaseStream();
      resetRecorderRefs();
      clearDurationInterval();

      const code = String(error?.name || '');
      if (code === 'NotAllowedError' || code === 'PermissionDeniedError') {
        setVoiceError('Permesso microfono negato. Abilitalo nelle impostazioni del browser.');
      } else if (code === 'NotFoundError' || code === 'DevicesNotFoundError') {
        setVoiceError('Nessun microfono rilevato.');
      } else {
        setVoiceError('Impossibile avviare la registrazione.');
      }
      setStatus('idle');
      setRecordingDuration(0);
      setAudioBlob(null);
    }
  }, [
    clearDurationInterval,
    discardNote,
    isProcessing,
    isSupported,
    releaseStream,
    resetRecorderRefs,
    status,
  ]);

  const stopRecording = useCallback(() => {
    if (status !== 'recording') return;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    clearDurationInterval();
    try {
      recorder.stop();
    } catch {
      discardNote();
    }
  }, [clearDurationInterval, discardNote, status]);

  useEffect(() => () => {
    clearDurationInterval();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    releaseStream();
  }, [clearDurationInterval, releaseStream]);

  useEffect(() => {
    if (isProcessing && status === 'recording') {
      stopRecording();
    }
  }, [isProcessing, status, stopRecording]);

  return {
    status,
    recordingDuration,
    formattedDuration: formatRecordingDuration(recordingDuration),
    audioBlob,
    startRecording,
    stopRecording,
    discardNote,
    isSupported,
    isVoiceNoteActive: status !== 'idle',
    voiceError,
    clearVoiceError: () => setVoiceError(''),
    setVoiceErrorMessage: (message) => setVoiceError(String(message || '').trim()),
  };
}
