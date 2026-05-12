import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { takeNextKentuIntroPhrase } from '../kentuIntroPhrases';
import { FIREBASE_LOAD_OVERLAY_FADE_MS } from '../constants/salaComandiConstants';

/** Overlay fullscreen: unico piano visibile finché auth/data non sono pronti per la dashboard/login. */
export default function FirebaseDataLoadingLayer({ blocking }) {
  const [introPhrase] = useState(() => takeNextKentuIntroPhrase());
  const [mounted, setMounted] = useState(false);
  const [opaque, setOpaque] = useState(true);

  useEffect(() => {
    if (blocking) {
      setMounted(true);
      setOpaque(true);
      return;
    }
    if (mounted) {
      setOpaque(false);
      const t = window.setTimeout(() => setMounted(false), FIREBASE_LOAD_OVERLAY_FADE_MS);
      return () => window.clearTimeout(t);
    }
  }, [blocking, mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        minHeight: '100dvh',
        zIndex: 200000,
        boxSizing: 'border-box',
        background: 'linear-gradient(165deg, #0f2847 0%, #0a1a2e 42%, #050e1a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding:
          'max(20px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left))',
        opacity: opaque ? 1 : 0,
        transition: `opacity ${FIREBASE_LOAD_OVERLAY_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        pointerEvents: blocking ? 'auto' : 'none',
      }}
      aria-live="polite"
      aria-busy={blocking}
    >
      <p
        className="kentu-intro-phrase-text kentu-intro-phrase-text--glow"
        style={{
          margin: 0,
          maxWidth: 'min(24rem, 90vw)',
          textAlign: 'center',
          fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
          fontWeight: 300,
          fontSize: 'clamp(0.95rem, 3.5vw, 1.18rem)',
          letterSpacing: '0.06em',
          lineHeight: 1.75,
          color: 'rgba(248, 250, 252, 0.95)',
        }}
      >
        {introPhrase}
      </p>
    </div>,
    document.body
  );
}
