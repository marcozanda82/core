import React, { useCallback, useEffect, useRef, useState } from 'react';

/** Durata nominale del segmento loop (allineata al prop clampToFirstSeconds, es. 3). */
const PROCESSING_LOOP_NOMINAL_SEC = 3;
/** Anticipo sul reset rispetto al nominale — evita flash sul fotogramma di taglio (3 → 2.78). */
const PROCESSING_LOOP_RESET_LEAD_SEC = 0.22;
/** Opacità minima del micro-respiro visivo attorno al seek. */
const PROCESSING_LOOP_FADE_OPACITY = 0.82;
/** Durata della dissolvenza uscente/entrante (ms). */
const PROCESSING_LOOP_FADE_MS = 48;
/** Inizio loop di coda (fase finale McDrive): ripete dal secondo 8 fino alla fine. */
const PROCESSING_LOOP_TAIL_START_SEC = 8;
/** Anticipo rilevamento fine video per seek anticipato (evita flash su ended). */
const PROCESSING_LOOP_TAIL_END_LEAD_SEC = 0.12;

/**
 * Soglia effettiva di reset: leggermente prima del secondo nominale.
 * @param {number} clampSeconds
 */
function resolveProcessingLoopResetSec(clampSeconds) {
  const nominal = Number.isFinite(clampSeconds) && clampSeconds > 0
    ? clampSeconds
    : PROCESSING_LOOP_NOMINAL_SEC;
  return Math.max(0.05, nominal - PROCESSING_LOOP_RESET_LEAD_SEC);
}

/**
 * Punto di ripartenza coda — non oltre la durata effettiva del media.
 * @param {HTMLVideoElement} el
 * @param {number} configuredSec
 */
function resolveTailLoopStartSec(el, configuredSec) {
  const start = Number(configuredSec);
  if (!Number.isFinite(start) || start <= 0) return PROCESSING_LOOP_TAIL_START_SEC;
  const duration = el.duration;
  if (!Number.isFinite(duration) || duration <= 0) return start;
  if (start >= duration - 0.15) return Math.max(0, duration * 0.55);
  return start;
}

/**
 * @param {HTMLVideoElement} el
 */
function isVideoNearEnd(el) {
  const duration = el.duration;
  if (!Number.isFinite(duration) || duration <= 0) return false;
  return el.currentTime >= duration - PROCESSING_LOOP_TAIL_END_LEAD_SEC;
}

/**
 * Pillola di stato AI — usata nella status bar tra header video e chat.
 */
export function KentuProcessingStatusBadge({
  label = 'Kentu sta elaborando...',
  busy = false,
}) {
  const ariaLabel = String(label || 'Kentu sta elaborando...').trim();

  return (
    <div
      className="kentu-processing-status-badge inline-flex max-w-[min(100%,24rem)] items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.25)] backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-busy={busy}
      aria-label={ariaLabel}
    >
      <span className="kentu-cinema-banner__caption-dot shrink-0" aria-hidden />
      <span className="kentu-processing-status-badge__text truncate text-[0.65rem] font-semibold uppercase tracking-[0.06em] text-zinc-200">
        {ariaLabel}
      </span>
    </div>
  );
}

/**
 * Video sollevato nell'header chat o fascia cinematografica legacy.
 * variant `header` = embed compatto al posto di mascotte + titolo (badge esterno).
 * Supporta video loop (AI) o one-shot (caffè / pisolino / stati).
 */
export default function KentuProcessingBanner({
  posterSrc = '/Hacker4.png',
  videoSrc = null,
  label = 'Kentu sta elaborando...',
  loop = true,
  onVideoEnded = null,
  /** `header` = embed compatto nell'header chat al posto della mascotte. */
  variant = 'banner',
  /** Nasconde la pillola sovrapposta (header: badge renderizzato dal parent). */
  hideCaption = false,
  /** Se valorizzato, loop manuale 0→N secondi finché isPenultimateOrLater è false. */
  clampToFirstSeconds = null,
  /** Sblocca la riproduzione oltre clampToFirstSeconds (es. penultimo alimento McDrive). */
  isPenultimateOrLater = true,
  /** Secondo di ripartenza loop di coda (es. 8) quando tailLoopWhileActive. */
  tailLoopFromSeconds = null,
  /** Lavagna / AI ancora attiva: loop 8→fine finché true. */
  tailLoopWhileActive = false,
  /** Limite superiore di riproduzione (es. 6.3): pausa e stop senza arrivare a fine file. */
  maxClampSeconds = null,
}) {
  const ariaLabel = String(label || 'Kentu sta elaborando...').trim();
  const poster = String(posterSrc || '').trim() || '/Hacker4.png';
  const video = String(videoSrc || '').trim() || null;
  const videoRef = useRef(null);
  const loopFadeTimerRef = useRef(null);
  const isLoopFadingRef = useRef(false);
  const isTailLoopingRef = useRef(false);
  const isMaxClampReachedRef = useRef(false);
  const [mediaOpacity, setMediaOpacity] = useState(1);
  const showCaption = !hideCaption && variant !== 'header';
  const clampSeconds = Number(clampToFirstSeconds);
  const tailLoopSec = Number(tailLoopFromSeconds);
  const maxClampSec = Number(maxClampSeconds);
  const hasMaxClamp = Number.isFinite(maxClampSec) && maxClampSec > 0;
  const shouldClampProcessingLoop = Number.isFinite(clampSeconds)
    && clampSeconds > 0
    && !isPenultimateOrLater;
  const shouldTailLoop = isPenultimateOrLater
    && Number.isFinite(tailLoopSec)
    && tailLoopSec > 0
    && tailLoopWhileActive;
  const loopResetSec = resolveProcessingLoopResetSec(
    shouldClampProcessingLoop ? clampSeconds : null,
  );
  const performTailLoopSeek = useCallback((el) => {
    if (!el || isTailLoopingRef.current) return false;
    isTailLoopingRef.current = true;
    const tailStart = resolveTailLoopStartSec(el, tailLoopSec);
    el.currentTime = tailStart;
    void el.play().catch(() => {});
    window.requestAnimationFrame(() => {
      isTailLoopingRef.current = false;
    });
    return true;
  }, [tailLoopSec]);

  const effectiveLoop = (shouldClampProcessingLoop || shouldTailLoop || hasMaxClamp) ? false : loop;

  const stopAtMaxClamp = useCallback((el) => {
    if (!el || isMaxClampReachedRef.current) return false;
    isMaxClampReachedRef.current = true;
    el.currentTime = maxClampSec;
    el.pause();
    if (typeof onVideoEnded === 'function') {
      onVideoEnded();
    }
    return true;
  }, [maxClampSec, onVideoEnded]);

  const handleTimeUpdate = useCallback((event) => {
    const el = event.currentTarget;

    if (hasMaxClamp && !isMaxClampReachedRef.current && el.currentTime >= maxClampSec) {
      stopAtMaxClamp(el);
      return;
    }

    if (shouldClampProcessingLoop) {
      if (isLoopFadingRef.current) return;
      if (el.currentTime < loopResetSec) return;

      isLoopFadingRef.current = true;
      setMediaOpacity(PROCESSING_LOOP_FADE_OPACITY);

      const completeSoftReset = () => {
        el.currentTime = 0;
        void el.play().catch(() => {});

        if (loopFadeTimerRef.current) {
          window.clearTimeout(loopFadeTimerRef.current);
        }
        loopFadeTimerRef.current = window.setTimeout(() => {
          setMediaOpacity(1);
          loopFadeTimerRef.current = window.setTimeout(() => {
            isLoopFadingRef.current = false;
          }, PROCESSING_LOOP_FADE_MS);
        }, Math.round(PROCESSING_LOOP_FADE_MS * 0.45));
      };

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(completeSoftReset);
      });
      return;
    }

    if (!shouldTailLoop || isTailLoopingRef.current) return;
    if (!isVideoNearEnd(el)) return;
    performTailLoopSeek(el);
  }, [
    hasMaxClamp,
    maxClampSec,
    stopAtMaxClamp,
    shouldClampProcessingLoop,
    loopResetSec,
    shouldTailLoop,
    performTailLoopSeek,
  ]);

  const handleVideoEnded = useCallback(() => {
    if (isMaxClampReachedRef.current) return;
    const el = videoRef.current;
    if (hasMaxClamp && el && el.currentTime >= maxClampSec - 0.05) {
      stopAtMaxClamp(el);
      return;
    }
    if (shouldTailLoop && el && performTailLoopSeek(el)) {
      return;
    }
    if (!effectiveLoop && typeof onVideoEnded === 'function') {
      onVideoEnded();
    }
  }, [hasMaxClamp, maxClampSec, stopAtMaxClamp, shouldTailLoop, performTailLoopSeek, effectiveLoop, onVideoEnded]);

  useEffect(() => () => {
    if (loopFadeTimerRef.current) {
      window.clearTimeout(loopFadeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (shouldClampProcessingLoop || shouldTailLoop) return;
    isLoopFadingRef.current = false;
    isTailLoopingRef.current = false;
    setMediaOpacity(1);
  }, [shouldClampProcessingLoop, shouldTailLoop]);

  useEffect(() => {
    isMaxClampReachedRef.current = false;
    if (!video) return undefined;
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
        console.warn('[KentuProcessingBanner] autoplay failed', error);
        if (!cancelled && typeof onVideoEnded === 'function') onVideoEnded();
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
  }, [video, poster, onVideoEnded]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video || el.ended || isMaxClampReachedRef.current) return;
    if (el.paused) {
      void el.play().catch(() => {});
    }
  }, [video, shouldClampProcessingLoop, shouldTailLoop, isPenultimateOrLater, hasMaxClamp]);

  if (!video && !poster) return null;

  return (
    <div
      className={[
        'kentu-cinema-banner',
        variant === 'header' ? 'kentu-cinema-banner--header' : '',
      ].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-busy={Boolean(video)}
      aria-label={ariaLabel}
    >
      <div className="kentu-cinema-banner__frame">
        {video ? (
          <video
            ref={videoRef}
            key={video}
            className="kentu-cinema-banner__media"
            src={video}
            poster={poster}
            autoPlay
            muted
            loop={effectiveLoop}
            playsInline
            preload="auto"
            draggable={false}
            style={{
              opacity: mediaOpacity,
              transition: shouldClampProcessingLoop
                ? `opacity ${PROCESSING_LOOP_FADE_MS}ms ease-in-out`
                : undefined,
            }}
            onTimeUpdate={handleTimeUpdate}
            onEnded={handleVideoEnded}
          />
        ) : (
          <img
            className="kentu-cinema-banner__media"
            src={poster}
            alt=""
            draggable={false}
            decoding="async"
          />
        )}
        <div className="kentu-cinema-banner__vignette" aria-hidden />
        {showCaption ? (
          <div className="kentu-cinema-banner__caption" aria-hidden>
            <span className="kentu-cinema-banner__caption-dot" />
            <span className="kentu-cinema-banner__caption-text">{ariaLabel}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
