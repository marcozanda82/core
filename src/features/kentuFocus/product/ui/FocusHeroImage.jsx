import React, { useEffect, useState } from 'react';
import {
  focusHeroImageFallbackSrc,
  focusHeroImageSrc,
  resolveFocusHeroImageKey,
} from '../focusHeroImages.js';

/**
 * Predisposizione FASE 4: sceglie path hero da segnali; preferisce webp,
 * altrimenti svg. Se manca tutto → null (slot neutro).
 * @param {{
 *   periodId?: string,
 *   toImprove?: object[],
 *   energyIrregular?: boolean,
 *   activeSignalIds?: string[],
 * }} props
 */
export function useFocusHeroImageSrc(props = {}) {
  const key = resolveFocusHeroImageKey(props);
  const candidate = focusHeroImageSrc(key);
  const fallback = focusHeroImageFallbackSrc(key);
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!candidate) {
      setSrc(null);
      return undefined;
    }

    const tryLoad = (url, next) => {
      const img = new Image();
      img.onload = () => {
        if (!cancelled) setSrc(url);
      };
      img.onerror = () => {
        if (cancelled) return;
        if (next) tryLoad(next, null);
        else setSrc(null);
      };
      img.src = url;
    };

    tryLoad(candidate, fallback && fallback !== candidate ? fallback : null);
    return () => {
      cancelled = true;
    };
  }, [candidate, fallback]);

  return { key, src };
}

export default useFocusHeroImageSrc;
