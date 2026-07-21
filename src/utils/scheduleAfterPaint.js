/**
 * Schedules work after the next paint (and preferably when the browser is idle),
 * so startup/first-paint stays responsive.
 */
export function scheduleAfterPaint(fn, { timeout = 2500 } = {}) {
  if (typeof window === 'undefined') {
    fn();
    return () => {};
  }

  let idleId = null;
  let timeoutId = null;
  let cancelled = false;

  const run = () => {
    if (cancelled) return;
    try {
      fn();
    } catch (err) {
      console.warn('[scheduleAfterPaint]', err);
    }
  };

  const afterPaint = () => {
    if (cancelled) return;
    if (typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(run, { timeout });
      return;
    }
    timeoutId = window.setTimeout(run, 0);
  };

  const raf1 = window.requestAnimationFrame(() => {
    window.requestAnimationFrame(afterPaint);
  });

  return () => {
    cancelled = true;
    window.cancelAnimationFrame(raf1);
    if (idleId != null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(idleId);
    }
    if (timeoutId != null) window.clearTimeout(timeoutId);
  };
}
