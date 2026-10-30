import React from 'react';

/**
 * Card hero: slot immagine + headline Fraunces.
 * @param {{ headline?: string|null, imageSrc?: string|null, imageAlt?: string }} props
 */
export function FocusHero({ headline, imageSrc = null, imageAlt = '' }) {
  const title = String(headline || '').trim();
  if (!title) return null;

  return (
    <section className="kf-v-hero" aria-label="Titolo del rapporto">
      <div className="kf-v-hero-slot">
        {imageSrc ? (
          <img src={imageSrc} alt={imageAlt || ''} className="kf-v-hero-img" />
        ) : (
          <div className="kf-v-hero-placeholder" aria-hidden="true" />
        )}
      </div>
      <h2 className="kf-v-hero-title">{title}</h2>
    </section>
  );
}

export default FocusHero;
