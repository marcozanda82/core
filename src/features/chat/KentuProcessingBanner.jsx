import React, { useEffect, useRef } from 'react';

/**
 * Fascia cinematografica sotto l'header chat (non sovrappone i controlli).
 * Altezza generosa 250–350px, larghezza piena, object-fit: cover.
 * Supporta video loop (AI) o one-shot (caffè / pisolino / stati).
 */
export default function KentuProcessingBanner({
  posterSrc = '/Hacker4.png',
  videoSrc = null,
  label = 'Kentu sta elaborando...',
  loop = true,
  onVideoEnded = null,
}) {
  const ariaLabel = String(label || 'Kentu sta elaborando...').trim();
  const poster = String(posterSrc || '').trim() || '/Hacker4.png';
  const video = String(videoSrc || '').trim() || null;
  const videoRef = useRef(null);

  useEffect(() => {
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
  }, [video, poster, loop, onVideoEnded]);

  if (!video && !poster) return null;

  return (
    <div
      className="kentu-cinema-banner"
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
            loop={loop}
            playsInline
            preload="auto"
            draggable={false}
            onEnded={() => {
              if (!loop && typeof onVideoEnded === 'function') onVideoEnded();
            }}
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
        <div className="kentu-cinema-banner__caption" aria-hidden>
          <span className="kentu-cinema-banner__caption-dot" />
          <span className="kentu-cinema-banner__caption-text">{ariaLabel}</span>
        </div>
      </div>
    </div>
  );
}
