import React, { useCallback, useEffect, useRef } from 'react';

const BOOT_VIDEO_SRC = '/Animazione.mp4';
/** Limite di sicurezza se l'evento `ended` non arriva (file corrotto / codec). */
const BOOT_MAX_MS = 60000;

/**
 * Schermata di avvio: video fullscreen; al termine (o errore / timeout) chiama onComplete.
 * `muted` + `playsInline` consentono l’autoplay su mobile.
 */
export default function KentuOSBootVideo({ onComplete }) {
  const doneRef = useRef(false);
  const fireComplete = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (typeof onComplete === 'function') onComplete();
  }, [onComplete]);

  useEffect(() => {
    const t = window.setTimeout(() => fireComplete(), BOOT_MAX_MS);
    return () => clearTimeout(t);
  }, [fireComplete]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      role="presentation"
      aria-hidden="true"
    >
      <video
        src={BOOT_VIDEO_SRC}
        style={{
          width: '100%',
          height: '100%',
          maxHeight: '100dvh',
          objectFit: 'contain',
          background: '#000',
        }}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={fireComplete}
        onError={fireComplete}
      />
    </div>
  );
}
