import React, { useEffect, useState } from 'react';

const DISPLAY_MS = 2000;
const FADE_MS = 400;

/**
 * Splash iniziale minimale: messaggio in inglese, poi transizione verso l’app.
 */
export default function BootMessage({ onComplete }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    const fadeAt = window.setTimeout(() => setVisible(false), DISPLAY_MS - FADE_MS);
    const doneAt = window.setTimeout(() => {
      onComplete?.();
    }, DISPLAY_MS);
    return () => {
      window.clearTimeout(fadeAt);
      window.clearTimeout(doneAt);
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [onComplete]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'linear-gradient(165deg, #f8fafc 0%, #e2e8f0 45%, #f1f5f9 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding:
          'max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))',
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease-out`,
      }}
    >
      <p
        style={{
          margin: 0,
          maxWidth: 'min(20rem, 88vw)',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
          fontWeight: 300,
          fontSize: 'clamp(0.95rem, 3.6vw, 1.15rem)',
          letterSpacing: '0.04em',
          lineHeight: 1.65,
          color: '#334155',
        }}
      >
        Inspired by Sardinia&apos;s Blue Zones
      </p>
    </div>
  );
}
