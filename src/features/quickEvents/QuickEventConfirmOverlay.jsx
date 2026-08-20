import React, { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './quickEventConfirm.css';

/**
 * Overlay Home: video di conferma evento (es. allenamento completato).
 * Player ad alto impatto + dismiss anticipato; chiusura automatica su `onEnded`.
 */
export default function QuickEventConfirmOverlay({
  payload = null,
  onDone,
  imageHoldMs = 1600,
}) {
  const videoRef = useRef(null);
  const holdTimerRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const hasVideo = Boolean(payload?.videoSrc);
  const hasImage = Boolean(payload?.imageSrc);
  const videoSrc = payload?.videoSrc || null;
  const imageSrc = payload?.imageSrc || null;

  const clearHold = useCallback(() => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearHold();
    const el = videoRef.current;
    if (el) {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    onDoneRef.current?.();
  }, [clearHold]);

  // Solo immagine (senza video): hold breve poi chiudi.
  useEffect(() => {
    if (!payload || hasVideo || !hasImage) return undefined;
    clearHold();
    if (imageHoldMs > 0) {
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        onDoneRef.current?.();
      }, imageHoldMs);
    }
    return () => clearHold();
  }, [payload, hasVideo, hasImage, imageHoldMs, clearHold]);

  // Autoplay video.
  useEffect(() => {
    if (!hasVideo || !videoSrc) return undefined;
    const el = videoRef.current;
    if (!el) return undefined;
    let cancelled = false;
    const play = async () => {
      try {
        el.muted = true;
        el.playsInline = true;
        el.currentTime = 0;
        await el.play();
      } catch (error) {
        console.warn('[QuickEventConfirmOverlay] autoplay failed', error);
        if (!cancelled) dismiss();
      }
    };
    void play();
    return () => {
      cancelled = true;
      try {
        el.pause();
      } catch {
        /* ignore */
      }
    };
  }, [hasVideo, videoSrc, dismiss]);

  // Esc + blocca scroll body.
  useEffect(() => {
    if (!payload) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [payload, dismiss]);

  if (!payload || (!hasImage && !hasVideo) || typeof document === 'undefined') return null;

  const title = payload.title || 'Conferma evento';

  return createPortal(
    <div
      className="kentu-quick-confirm kentu-quick-confirm--hero"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={dismiss}
    >
      <div
        className="kentu-quick-confirm__hero"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="kentu-quick-confirm__close"
          aria-label="Chiudi video"
          title="Chiudi"
          onClick={dismiss}
        >
          <X className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </button>

        <div className="kentu-quick-confirm__stage">
          {hasVideo ? (
            <video
              ref={videoRef}
              key={videoSrc}
              className="kentu-quick-confirm__video"
              src={videoSrc}
              poster={imageSrc || undefined}
              muted
              playsInline
              autoPlay
              controls={false}
              preload="auto"
              onEnded={dismiss}
              onError={dismiss}
            />
          ) : (
            <img
              className="kentu-quick-confirm__video kentu-quick-confirm__video--still"
              src={imageSrc}
              alt={title}
              draggable={false}
            />
          )}
        </div>

        {(payload.title || payload.subtitle) ? (
          <div className="kentu-quick-confirm__meta">
            {payload.title ? (
              <p className="kentu-quick-confirm__meta-title">{payload.title}</p>
            ) : null}
            {payload.subtitle ? (
              <p className="kentu-quick-confirm__meta-sub">{payload.subtitle}</p>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          className="kentu-quick-confirm__skip"
          onClick={dismiss}
        >
          {hasVideo ? 'Salta / Chiudi video' : 'Chiudi'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
