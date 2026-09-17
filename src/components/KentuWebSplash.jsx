import { useEffect, useId, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  ENSO_DRAW_PATH,
  ENSO_FILL_PATH,
  ENSO_GRADIENT,
  K_PATH,
  KENTU_SPLASH_VIEWBOX,
  OS_O_HOLE_PATH,
  OS_O_OUTER_PATH,
  OS_S_PATH,
} from '../assets/kentu-splash/kentuLogoGeometry.js';
import './KentuWebSplash.css';

const TOTAL_MS = 2000;
const REDUCED_TOTAL_MS = 650;

function isCapacitorAndroid() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

function isDevHold() {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('kentuSplash') === 'hold';
  } catch {
    return false;
  }
}

/**
 * Overlay splash Web (Vite/Vercel). Su Capacitor Android non montare.
 * Solo animazione vettoriale ricostruita dal master. Debug: `/?kentuSplash=hold`
 * 🔥 FIX UX: Resta visibile fino a `ready` (o timeout max 6s per sicurezza)
 */
export default function KentuWebSplash({ ready = false }) {
  const reactId = useId();
  const maskId = `kentu-enso-mask-${reactId.replace(/:/g, '')}`;
  const gradientId = `kentu-enso-fill-${reactId.replace(/:/g, '')}`;
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (isDevHold()) return undefined;
    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    // 🔥 FIX: Aumentato timeout max + controllo ready
    const minBeforeExit = reduceMotion ? 500 : 1200; // Minimo 1.2s per animazione
    const maxTotal = reduceMotion ? 2000 : 6000; // Max 6s (fallback di sicurezza)
    const fadeOut = reduceMotion ? 200 : 400;
    
    const startedAt = Date.now();
    let checkInterval;
    let hardCapTimer;
    
    const beginExit = () => {
      if (gone) return;
      setGone(true);
    };
    
    // Controlla ogni 100ms se ready o se è passato il tempo massimo
    checkInterval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= maxTotal) {
        clearInterval(checkInterval);
        beginExit();
      } else if (elapsed >= minBeforeExit && ready) {
        clearInterval(checkInterval);
        // Piccolo delay per fade-out smooth
        setTimeout(beginExit, fadeOut);
      }
    }, 100);
    
    // Hard cap di sicurezza
    hardCapTimer = setTimeout(() => {
      clearInterval(checkInterval);
      beginExit();
    }, maxTotal);
    
    return () => {
      clearInterval(checkInterval);
      clearTimeout(hardCapTimer);
    };
  }, [ready, gone]);

  if (gone || isCapacitorAndroid()) return null;

  const hold = isDevHold();

  return (
    <div
      className={hold ? 'kentu-web-splash kentu-web-splash--hold' : 'kentu-web-splash'}
      role="presentation"
      aria-hidden="true"
    >
      <div className="kentu-web-splash__cluster">
        <svg
          className="kentu-web-splash__symbol"
          viewBox={KENTU_SPLASH_VIEWBOX}
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1={ENSO_GRADIENT.x1}
              y1={ENSO_GRADIENT.y1}
              x2={ENSO_GRADIENT.x2}
              y2={ENSO_GRADIENT.y2}
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0" stopColor={ENSO_GRADIENT.stops[0][1]} />
              <stop offset="1" stopColor={ENSO_GRADIENT.stops[1][1]} />
            </linearGradient>
            <mask id={maskId} maskUnits="userSpaceOnUse">
              <path
                className="kentu-web-splash__enso-stroke"
                d={ENSO_DRAW_PATH}
                pathLength="1"
              />
            </mask>
          </defs>
          <path
            d={ENSO_FILL_PATH}
            fill={`url(#${gradientId})`}
            mask={`url(#${maskId})`}
          />
          <g className="kentu-web-splash__k">
            <path d={K_PATH} fill="#FFFFFF" />
          </g>
          <g className="kentu-web-splash__os">
            <g fill={`url(#${gradientId})`} fillRule="evenodd">
              <path d={OS_O_OUTER_PATH} />
              <path d={OS_O_HOLE_PATH} />
            </g>
            <path d={OS_S_PATH} fill={`url(#${gradientId})`} />
          </g>
        </svg>
        <div className="kentu-web-splash__wordmark">
          <span className="kentu-web-splash__wordmark-kentu">Kentu</span>
          <span className="kentu-web-splash__wordmark-os">OS</span>
        </div>
      </div>
    </div>
  );
}
