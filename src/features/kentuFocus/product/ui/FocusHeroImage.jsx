import React, { useEffect, useState } from 'react';
import {
  focusHeroImageSrc,
  resolveFocusHeroImageKey,
} from '../focusHeroImages.js';

/**
 * Predisposizione FASE 4: sceglie path hero da segnali; se il file manca → null (slot neutro).
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
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!candidate) {
      setSrc(null);
      return undefined;
    }
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setSrc(candidate);
    };
    img.onerror = () => {
      if (!cancelled) setSrc(null);
    };
    img.src = candidate;
    return () => {
      cancelled = true;
    };
  }, [candidate]);

  return { key, src };
}

export default useFocusHeroImageSrc;
