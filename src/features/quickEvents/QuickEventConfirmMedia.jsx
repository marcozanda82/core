import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './quickEventConfirm.css';

const FRESH_MS = 5000;

const THUMB_CLASS =
  'relative h-24 w-24 shrink-0 overflow-hidden rounded-xl shadow-md cursor-pointer border border-slate-500/25 bg-slate-900/85 p-0';

const MEDIA_FILL_CLASS = 'h-full w-full object-cover';

/** @param {unknown} timestamp */
function resolveIsRecent(timestamp) {
  if (timestamp == null || timestamp === '') return true;
  const raw = typeof timestamp === 'number' ? timestamp : Date.parse(String(timestamp));
  if (!Number.isFinite(raw)) return true;
  return Date.now() - raw < FRESH_MS;
}

/**
 * Conferma rapida in chat: icona 96px.
 * Se fresco + video → riproduce nella miniatura, poi passa a <img> senza layout shift.
 * Click → lightbox a tutto schermo (chiudi con tap / Esc).
 */
export default function QuickEventConfirmMedia({
  imageSrc,
  videoSrc = null,
  title = '',
  subtitle = '',
  compact = false,
  onFinished = null,
  imageHoldMs = 0,
  timestamp = null,
}) {
  const hasVideo = Boolean(videoSrc);
  const videoRef = useRef(null);
  const lightboxVideoRef = useRef(null);
  const holdTimerRef = useRef(null);

  const [playInlineVideo, setPlayInlineVideo] = useState(() => (
    Boolean(videoSrc) && resolveIsRecent(timestamp)
  ));
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  const finishInlineVideo = useCallback(() => {
    setPlayInlineVideo(false);
    scheduleFinished();
  }, [scheduleFinished]);

  const openFullscreen = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    clearHold();
    setIsFullscreen(true);
  }, [clearHold]);

  const closeFullscreen = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setIsFullscreen(false);
  }, []);

  // Nuovo asset: video inline solo se fresco (cronologia = icona statica).
  useEffect(() => {
    clearHold();
    const nextPlay = Boolean(videoSrc) && resolveIsRecent(timestamp);
    setPlayInlineVideo(nextPlay);
    setIsFullscreen(false);
    if (!nextPlay && imageHoldMs > 0 && typeof onFinished === 'function') {
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        onFinished();
      }, imageHoldMs);
    }
    return () => clearHold();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- asset + freschezza
  }, [imageSrc, videoSrc, timestamp]);

  // Autoplay nella miniatura (non blocca API; best-effort).
  useEffect(() => {
    if (!playInlineVideo || !hasVideo) return undefined;
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
        if (!cancelled) finishInlineVideo();
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
  }, [playInlineVideo, hasVideo, videoSrc, finishInlineVideo]);

  // Lightbox: autoplay video se presente.
  useEffect(() => {
    if (!isFullscreen || !hasVideo) return undefined;
    const el = lightboxVideoRef.current;
    if (!el) return undefined;
    let cancelled = false;
    const play = async () => {
      try {
        el.muted = true;
        el.playsInline = true;
        el.currentTime = 0;
        await el.play();
      } catch (error) {
        console.warn('[QuickEventConfirmMedia] lightbox play failed', error);
        if (!cancelled) {
          // resta sull'immagine in lightbox via fallback sotto
        }
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
  }, [isFullscreen, hasVideo, videoSrc]);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') closeFullscreen();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen, closeFullscreen]);

  if (!imageSrc) return null;

  const thumbLabel = title
    ? `${title}${hasVideo ? ' — tap per ingrandire' : ''}`
    : (hasVideo ? 'Conferma — tap per ingrandire' : 'Conferma');

  const lightbox = isFullscreen && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="kentu-quick-confirm-lightbox fixed inset-0 z-[100090] flex items-center justify-center bg-black/80 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Anteprima conferma'}
        onClick={closeFullscreen}
      >
        <button
          type="button"
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/50 text-lg text-white"
          style={{ top: 'max(1rem, env(safe-area-inset-top, 0px))' }}
          aria-label="Chiudi"
          onClick={closeFullscreen}
        >
          ✕
        </button>
        <div
          className="relative flex max-h-[min(90dvh,90vw)] max-w-[min(90dvh,90vw)] items-center justify-center"
          onClick={(event) => event.stopPropagation()}
        >
          {hasVideo ? (
            <video
              ref={lightboxVideoRef}
              key={`lb-${videoSrc}`}
              className="max-h-[min(90dvh,90vw)] max-w-[min(90dvh,90vw)] rounded-2xl object-contain shadow-2xl"
              src={videoSrc}
              muted
              playsInline
              autoPlay
              controls={false}
              loop
              preload="auto"
              onClick={closeFullscreen}
            />
          ) : (
            <img
              className="max-h-[min(90dvh,90vw)] max-w-[min(90dvh,90vw)] rounded-2xl object-contain shadow-2xl"
              src={imageSrc}
              alt={title || ''}
              draggable={false}
              onClick={closeFullscreen}
            />
          )}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <figure
        className={[
          'kentu-quick-confirm-media kentu-quick-confirm-media--thumb',
          compact ? 'kentu-quick-confirm-media--compact' : '',
        ].filter(Boolean).join(' ')}
      >
        <button
          type="button"
          className={THUMB_CLASS}
          onClick={openFullscreen}
          aria-label={thumbLabel}
        >
          {playInlineVideo && hasVideo ? (
            <video
              ref={videoRef}
              key={videoSrc}
              className={MEDIA_FILL_CLASS}
              src={videoSrc}
              poster={imageSrc}
              muted
              playsInline
              autoPlay
              preload="auto"
              onEnded={finishInlineVideo}
              onError={finishInlineVideo}
            />
          ) : (
            <img
              className={MEDIA_FILL_CLASS}
              src={imageSrc}
              alt=""
              draggable={false}
            />
          )}
        </button>
        {(title || subtitle) ? (
          <figcaption className="kentu-quick-confirm-media__caption mt-1.5 px-0.5">
            {title ? <p className="kentu-quick-confirm-media__title">{title}</p> : null}
            {subtitle ? <p className="kentu-quick-confirm-media__subtitle">{subtitle}</p> : null}
          </figcaption>
        ) : null}
      </figure>
      {lightbox}
    </>
  );
}
