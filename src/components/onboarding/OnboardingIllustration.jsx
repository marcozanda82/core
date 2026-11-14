import React from 'react';

const PUBLIC_BASE = String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');

/** Paesaggio Focus: webp reale, svg solo se manca. */
export const ONBOARDING_LANDSCAPE_SRC = `${PUBLIC_BASE}focus/settimana_buona.webp`;
export const ONBOARDING_LANDSCAPE_FALLBACK = `${PUBLIC_BASE}focus/settimana_buona.svg`;

/**
 * Illustrazione unica per l'onboarding.
 * variant="mark" → simbolo Kentu (enso + K, senza OS)
 * variant="landscape" → paesaggio Blue Zone / Focus
 */
export default function OnboardingIllustration({
  className = '',
  label = 'Kentu',
  variant = 'mark',
}) {
  if (variant === 'landscape') {
    return (
      <div
        className={[
          'aspect-video w-full overflow-hidden rounded-2xl border border-cyan-500/20 bg-[#05070b] shadow-lg',
          className,
        ].join(' ')}
        role="img"
        aria-label={label}
      >
        <img
          src={ONBOARDING_LANDSCAPE_SRC}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={(event) => {
            if (event.currentTarget.dataset.fallback === '1') return;
            event.currentTarget.dataset.fallback = '1';
            event.currentTarget.src = ONBOARDING_LANDSCAPE_FALLBACK;
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={[
        'aspect-video w-full overflow-hidden rounded-2xl border border-cyan-500/20 bg-[#05070b] shadow-lg',
        className,
      ].join(' ')}
      role="img"
      aria-label={label}
    >
      <div className="relative flex h-full w-full items-center justify-center bg-[radial-gradient(ellipse_at_center,_rgba(23,105,255,0.22)_0%,_transparent_62%)]">
        <img
          src={`${PUBLIC_BASE}KentuOS_enso.svg`}
          alt=""
          className="absolute h-[72%] w-auto max-w-[78%] object-contain opacity-95"
          draggable={false}
        />
        <img
          src={`${PUBLIC_BASE}KentuOS_K.svg`}
          alt=""
          className="relative h-[42%] w-auto max-w-[40%] object-contain"
          draggable={false}
        />
      </div>
    </div>
  );
}
