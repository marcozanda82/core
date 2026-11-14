/**
 * Osserva connessione RTDB e trasporto (websocket vs long-polling).
 * Solo log: non forza il trasporto.
 */

import { onValue, ref } from 'firebase/database';

const PREFIX = '[perf] rtdb';

function detectTransport() {
  try {
    const entries = typeof performance !== 'undefined'
      ? [
        ...performance.getEntriesByType('resource'),
        ...(typeof performance.getEntriesByType === 'function'
          ? performance.getEntriesByType('navigation')
          : []),
      ]
      : [];
    const related = entries.filter((e) => {
      const n = String(e.name || '');
      return /firebasedatabase|firebaseio|\.lp\?|\/\.ws|wss:\/\/.+(firebase|googleapis)|googleapis\.com\/\.lp/i.test(n);
    });
    const hasLp = related.some((e) => /\.lp\?/i.test(e.name));
    const hasWs = related.some((e) => /wss:\/\//i.test(e.name) || /\/\.ws/i.test(e.name));

    // Fallback: WebSocket aperti verso Firebase (resource timing a volte manca i wss).
    let wsOpen = false;
    try {
      const res = performance.getEntriesByType('resource') || [];
      wsOpen = res.some((e) => String(e.initiatorType || '') === 'websocket'
        && /firebase|googleapis/i.test(String(e.name || '')));
    } catch {
      wsOpen = false;
    }
    if (wsOpen) related.push({ name: 'websocket:detected' });

    const ws = hasWs || wsOpen;
    if (ws && !hasLp) return { transport: 'websocket', samples: related.length || (wsOpen ? 1 : 0) };
    if (hasLp && !ws) return { transport: 'long-polling', samples: related.length };
    if (ws && hasLp) return { transport: 'mixed (ws+long-polling)', samples: related.length };
    // Ultimo fallback: presence di frame .lp nei documenti (iframe long-poll).
    try {
      const frames = [...document.querySelectorAll('iframe')].map((f) => f.src || '');
      if (frames.some((s) => /\.lp\?/i.test(s))) {
        return { transport: 'long-polling', samples: frames.length };
      }
    } catch {
      /* ignore */
    }
    return { transport: 'unknown', samples: related.length };
  } catch {
    return { transport: 'unknown', samples: 0 };
  }
}

/**
 * @param {object} db
 * @returns {() => void} unsubscribe
 */
export function startRtdbConnectionProbe(db) {
  if (!db || typeof window === 'undefined') return () => {};
  if (window.__KENTU_RTDB_PROBE_STARTED__) return () => {};
  window.__KENTU_RTDB_PROBE_STARTED__ = true;

  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  // eslint-disable-next-line no-console
  console.log(`${PREFIX} probe_start`);

  /** Accumula URL resource Firebase visti dopo probe_start (timing buffer a volte vuoto). */
  const seenUrls = [];
  let resourceObserver = null;
  try {
    if (typeof PerformanceObserver !== 'undefined') {
      resourceObserver = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const n = String(e.name || '');
          if (/firebasedatabase|firebaseio|\.lp\?|\/\.ws|googleapis/i.test(n)
            || String(e.initiatorType || '') === 'websocket') {
            seenUrls.push(n || `initiator:${e.initiatorType}`);
          }
        }
      });
      resourceObserver.observe({ type: 'resource', buffered: true });
    }
  } catch {
    resourceObserver = null;
  }

  let done = false;
  const finish = (connected) => {
    if (done) return;
    done = true;
    try {
      resourceObserver?.disconnect();
    } catch {
      /* ignore */
    }
    const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    let { transport, samples } = detectTransport();
    if (transport === 'unknown' && seenUrls.length) {
      const hasLp = seenUrls.some((u) => /\.lp\?/i.test(u));
      const hasWs = seenUrls.some((u) => /wss:\/\//i.test(u) || /\/\.ws/i.test(u) || /^initiator:websocket$/i.test(u));
      if (hasWs && !hasLp) transport = 'websocket';
      else if (hasLp && !hasWs) transport = 'long-polling';
      else if (hasWs && hasLp) transport = 'mixed (ws+long-polling)';
      samples = seenUrls.length;
    }
    const summary = {
      connected: Boolean(connected),
      ms,
      transport,
      samples,
      seen: seenUrls.slice(0, 8),
    };
    try {
      window.__KENTU_RTDB_CONNECTION__ = summary;
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line no-console
    console.log(
      `${PREFIX} connected=${summary.connected} +${ms} ms transport=${transport} (samples=${samples})`,
    );
  };

  let unsub = () => {};
  try {
    const infoRef = ref(db, '.info/connected');
    unsub = onValue(
      infoRef,
      (snap) => {
        if (snap.val() === true) {
          // Delay più lungo: .lp iframe / wss compaiono dopo .info/connected
          setTimeout(() => finish(true), 400);
        }
      },
      () => finish(false),
    );
  } catch {
    finish(false);
  }

  // Timeout diagnostico: se non connette, logga comunque il trasporto osservato.
  const timer = setTimeout(() => {
    if (!done) finish(false);
  }, 20000);

  return () => {
    clearTimeout(timer);
    try {
      unsub();
    } catch {
      /* ignore */
    }
  };
}
