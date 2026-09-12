import { useEffect, useRef, useState } from 'react';
import './kentuBootSplash.css';

const SPLASH_SRC = '/512.png';
const APPEAR_MS = 450;
const HOLD_MS = 300;
const EXIT_MS = 250;
const MAX_TOTAL_MS = 1200;
const MIN_BEFORE_EXIT_MS = APPEAR_MS + HOLD_MS;
const FORCE_EXIT_AT_MS = MAX_TOTAL_MS - EXIT_MS;

/**
 * Splash di avvio: glow+scale dell'emblema, poi reverse-fade sulla Home.
 * Non blocca il boot: è un overlay. Timeout di sicurezza 1.2s.
 */
export default function KentuBootSplash({ ready = false }) {
  const [exiting, setExiting] = useState(false);
  const [settled, setSettled] = useState(false);
  const [gone, setGone] = useState(false);
  const exitingRef = useRef(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const appearMs = reduceMotion ? 0 : APPEAR_MS;
    const minBeforeExit = reduceMotion ? 180 : MIN_BEFORE_EXIT_MS;
    const forceExitAt = reduceMotion ? 400 : FORCE_EXIT_AT_MS;
    const exitMs = reduceMotion ? 150 : EXIT_MS;

    const startedAt = performance.now();
    let rafId = 0;
    let exitTimer = 0;
    let settledTimer = 0;
    let hardCapTimer = 0;
    let unmountCapTimer = 0;

    settledTimer = window.setTimeout(() => setSettled(true), appearMs);

    const beginExit = () => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      setExiting(true);
      exitTimer = window.setTimeout(() => setGone(true), exitMs);
    };

    const tick = () => {
      if (exitingRef.current) return;
      const elapsed = performance.now() - startedAt;
      if (elapsed >= forceExitAt || (elapsed >= minBeforeExit && readyRef.current)) {
        beginExit();
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    hardCapTimer = window.setTimeout(beginExit, forceExitAt);
    unmountCapTimer = window.setTimeout(() => setGone(true), MAX_TOTAL_MS);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(exitTimer);
      window.clearTimeout(settledTimer);
      window.clearTimeout(hardCapTimer);
      window.clearTimeout(unmountCapTimer);
    };
  }, []);

  if (gone) return null;

  return (
    <div
      className={[
        'kentu-boot-splash',
        settled ? 'kentu-boot-splash--settled' : '',
        exiting ? 'kentu-boot-splash--exit' : '',
      ].filter(Boolean).join(' ')}
      role="presentation"
      aria-hidden="true"
    >
      <div className="kentu-boot-splash__stage">
        <div className="kentu-boot-splash__glow" />
        <img
          className="kentu-boot-splash__mark"
          src={SPLASH_SRC}
          alt=""
          width={128}
          height={128}
          decoding="async"
          draggable={false}
        />
      </div>
    </div>
  );
}
