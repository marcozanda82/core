import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './quickEventConfirm.css';

/**
 * Conferma rapida: video a tutto schermo → thumbnail collassata (replay al tap).
 */
export default function QuickEventConfirmMedia({
  imageSrc,
  videoSrc = null,
  title = '',
  subtitle = '',
  compact = false,
  onFinished = null,
  imageHoldMs = 0,
}) {
  const hasVideo = Boolean(videoSrc);
  const videoRef = useRef(null);
  const holdTimerRef = useRef(null);
  const [isExpanded, setIsExpanded] = useState(() => hasVideo);

  const clearHold = useCallback(() => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const scheduleFinished = useCallback(() => {
    clearHold();
    if (imageHoldMs > 0 && typeof onFinished === 'function') {
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        onFinished();
      }, imageHoldMs);
    }
  }, [clearHold, imageHoldMs, onFinished]);

  const collapse = useCallback(() => {
    setIsExpanded(false);
    scheduleFinished();
  }, [scheduleFinished]);

  const expandForReplay = useCallback(() => {
    if (!hasVideo) return;
    clearHold();
    setIsExpanded(true);
  }, [hasVideo, clearHold]);

  // Nuovo asset: riparte espanso solo se c’è video.
  useEffect(() => {
    clearHold();
    const nextExpanded = Boolean(videoSrc);
    setIsExpanded(nextExpanded);
    if (!nextExpanded && imageHoldMs > 0 && typeof onFinished === 'function') {
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        onFinished();
      }, imageHoldMs);
    }
    return () => clearHold();
    // Solo al cambio asset — non riespandere su ogni render del parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: imageSrc/videoSrc only
  }, [imageSrc, videoSrc]);

  // Autoplay quando l’overlay è aperto.
  useEffect(() => {
    if (!isExpanded || !hasVideo) return undefined;
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
        console.warn('[QuickEventConfirmMedia] autoplay failed', error);
        if (!cancelled) collapse();
      }
    };
    void play();
    return () => {
      cancelled = true;
      try {
        el.pause();
      } catch {
        // ignore
      }
    };
  }, [isExpanded, hasVideo, videoSrc, collapse]);

  if (!imageSrc) return null;

  const expandedOverlay = isExpanded && hasVideo && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="kentu-quick-confirm-expand fixed inset-0 z-[100100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Animazione conferma'}
        onClick={collapse}
      >
        <button
          type="button"
          className="kentu-quick-confirm-expand__close absolute right-4 top-4 z-10 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-sm font-medium text-white/90 transition hover:bg-black/70"
          style={{ top: 'max(1rem, env(safe-area-inset-top, 0px))' }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            collapse();
          }}
        >
          Chiudi
        </button>
        <video
          ref={videoRef}
          key={videoSrc}
          className="kentu-quick-confirm-expand__video max-h-[85vh] w-[90vw] max-w-lg object-contain"
          src={videoSrc}
          muted
          playsInline
          autoPlay
          preload="auto"
          onClick={(event) => event.stopPropagation()}
          onEnded={collapse}
          onError={collapse}
        />
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      {expandedOverlay}
      <figure
        className={[
          'kentu-quick-confirm-media kentu-quick-confirm-media--thumb',
          compact ? 'kentu-quick-confirm-media--compact' : '',
        ].filter(Boolean).join(' ')}
      >
        <button
          type="button"
          className={[
            'kentu-quick-confirm-media__thumb',
            'group relative block w-24 h-24 shrink-0 overflow-hidden rounded-xl shadow-md',
            'transition-transform hover:scale-105',
            hasVideo ? 'cursor-pointer' : 'cursor-default',
          ].join(' ')}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            expandForReplay();
          }}
          aria-label={hasVideo ? `${title || 'Conferma'} — riproduci` : (title || 'Conferma')}
          disabled={!hasVideo}
        >
          <img
            className="h-full w-full object-cover"
            src={imageSrc}
            alt=""
            draggable={false}
          />
          {hasVideo ? (
            <span
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            >
              <span className="rounded-full bg-black/55 px-2 py-1 text-[0.65rem] font-semibold text-white">
                ▶ Replay
              </span>
            </span>
          ) : null}
        </button>
        {(title || subtitle) ? (
          <figcaption className="kentu-quick-confirm-media__caption mt-1.5 px-0.5">
            {title ? <p className="kentu-quick-confirm-media__title">{title}</p> : null}
            {subtitle ? <p className="kentu-quick-confirm-media__subtitle">{subtitle}</p> : null}
          </figcaption>
        ) : null}
      </figure>
    </>
  );
}
