import { useEffect, useRef, useState } from 'react';

/**
 * Like useMemo but defers the first computation after mount so the initial
 * render is never blocked by expensive work.  After the first paint the value
 * is computed asynchronously (requestIdleCallback → setTimeout fallback) and
 * then kept in sync like a normal useMemo on subsequent renders.
 *
 * @template T
 * @param {() => T} factory   — same contract as useMemo's factory
 * @param {unknown[]} deps    — dependency array
 * @param {T} fallback        — value returned until the first real computation
 * @param {{ delayMs?: number }} [opts]
 * @returns {T}
 */
export function useDeferredMemo(factory, deps, fallback, { delayMs = 0 } = {}) {
  const [value, setValue] = useState(fallback);
  const mountedRef = useRef(false);
  const genRef = useRef(0);

  useEffect(() => {
    const gen = ++genRef.current;

    const run = () => {
      if (gen !== genRef.current) return;
      try {
        const next = factory();
        setValue(next);
      } catch (err) {
        console.warn('[useDeferredMemo]', err);
      }
    };

    if (!mountedRef.current) {
      mountedRef.current = true;
      // First mount: defer so initial render paints immediately
      let idleId = null;
      let timerId = null;

      const schedule = () => {
        if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
          idleId = window.requestIdleCallback(run, { timeout: 3000 });
        } else {
          timerId = setTimeout(run, delayMs);
        }
      };

      if (delayMs > 0) {
        timerId = setTimeout(schedule, delayMs);
      } else {
        schedule();
      }

      return () => {
        genRef.current++;
        if (idleId != null && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
          window.cancelIdleCallback(idleId);
        }
        if (timerId != null) clearTimeout(timerId);
      };
    }

    // Subsequent dep changes: compute synchronously (already interactive)
    run();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}

export default useDeferredMemo;
