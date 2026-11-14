/**
 * Telemetria apertura Focus — log [perf] focus leggibili (sola lettura, no PII).
 *
 * Formato riga: [perf] focus <fase> +<ms dall'inizio> ms (<ms della fase>)
 * A done / morning_ai_request_done: console.table(fase, ms dall'inizio, ms della fase)
 */

const PREFIX = '[perf] focus';

/** Fasi che chiudono un blocco e stampano la tabella riepilogo. */
const TABLE_PHASES = new Set(['done', 'morning_ai_request_done']);

/** @type {{ t0: number, marks: Record<string, number>, order: string[], meta: Record<string, object>, lastElapsed: number, longTasks?: object[] }|null} */
let session = null;

/** Snapshot fasi per attribuire longtask anche dopo `done` (observer resta attivo). */
let phaseTimeline = { t0: 0, marks: {}, order: [] };

/** @type {PerformanceObserver|null} */
let longTaskObserver = null;

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Fase focus attiva quando è iniziato il longtask (start relativo a t0 sessione).
 * @param {number} startRelMs
 */
function phaseAt(startRelMs) {
  const order = phaseTimeline.order || [];
  const marks = phaseTimeline.marks || {};
  let phase = order[0] || 'start';
  for (const name of order) {
    const at = marks[name];
    if (at == null) continue;
    if (at <= startRelMs) phase = name;
    else break;
  }
  return phase;
}

function pushLongTask(entry) {
  const t0 = phaseTimeline.t0 || (session?.t0 ?? 0);
  const startAbs = Math.round(entry.startTime);
  const startRel = Math.round(entry.startTime - t0);
  // Ignora longtask bufferizzati prima dell'inizio sessione Focus.
  if (startRel < -16) return;
  const duration = Math.round(entry.duration);
  const phase = phaseAt(Math.max(0, startRel));
  const row = {
    name: entry.name || 'longtask',
    start: startAbs,
    startRel: Math.max(0, startRel),
    duration,
    phase,
  };
  if (session) {
    if (!session.longTasks) session.longTasks = [];
    session.longTasks.push(row);
  }
  try {
    if (typeof window !== 'undefined') {
      const prev = Array.isArray(window.__KENTU_FOCUS_LONGTASKS__)
        ? window.__KENTU_FOCUS_LONGTASKS__
        : [];
      window.__KENTU_FOCUS_LONGTASKS__ = [...prev, row];
    }
  } catch {
    /* ignore */
  }
}

/**
 * Righe testo longtask (niente console.table illegibile).
 * @param {object[]} tasks
 * @param {string} [label]
 */
export function focusOpenPerfPrintLongTasks(tasks, label = 'longtasks') {
  const list = Array.isArray(tasks) ? tasks : [];
  if (!list.length) {
    // eslint-disable-next-line no-console
    console.log(`${PREFIX} ${label} (nessuno)`);
    return;
  }
  const max = list.reduce((m, row) => Math.max(m, Number(row.duration) || 0), 0);
  // eslint-disable-next-line no-console
  console.log(`${PREFIX} ${label} count=${list.length} max=${max} ms`);
  for (const row of list) {
    const start = Number(row.startRel ?? row.start) || 0;
    const dur = Number(row.duration) || 0;
    const phase = row.phase || phaseAt(start);
    // eslint-disable-next-line no-console
    console.log(
      `${PREFIX} longtask start=${start} ms durata=${dur} ms fase=${phase}`,
    );
  }
}

function startLongTaskObserver() {
  stopLongTaskObserver();
  try {
    if (typeof window !== 'undefined') window.__KENTU_FOCUS_LONGTASKS__ = [];
  } catch {
    /* ignore */
  }
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) pushLongTask(entry);
    });
    longTaskObserver.observe({ type: 'longtask', buffered: true });
  } catch {
    longTaskObserver = null;
  }
}

function stopLongTaskObserver() {
  if (!longTaskObserver) return;
  try {
    longTaskObserver.disconnect();
  } catch {
    /* ignore */
  }
  longTaskObserver = null;
}

/**
 * @param {string} name
 * @param {number} elapsedMs — ms dall'inizio sessione
 * @param {number} phaseMs — delta rispetto alla marca precedente
 */
function logLine(name, elapsedMs, phaseMs) {
  // eslint-disable-next-line no-console
  console.log(`${PREFIX} ${name} +${elapsedMs} ms (${phaseMs} ms)`);
}

/**
 * @param {Record<string, number>} marks
 * @param {string[]} order
 */
function buildTableRows(marks, order) {
  const rows = [];
  let prev = 0;
  for (const fase of order) {
    const elapsed = marks[fase];
    if (elapsed == null) continue;
    const phaseMs = Math.max(0, elapsed - prev);
    rows.push({
      fase,
      'ms dall\'inizio': elapsed,
      'ms della fase': phaseMs,
    });
    prev = elapsed;
  }
  return rows;
}

function printTable(label = 'riepilogo') {
  if (!session) return;
  const rows = buildTableRows(session.marks, session.order);
  // eslint-disable-next-line no-console
  console.log(`${PREFIX} ${label}`);
  // eslint-disable-next-line no-console
  console.table(rows);
  return rows;
}

export function focusOpenPerfStart(meta = {}) {
  const t0 = now();
  session = {
    t0,
    marks: { start: 0 },
    order: ['start'],
    meta: { ...meta },
    lastElapsed: 0,
    longTasks: [],
  };
  phaseTimeline = { t0, marks: { start: 0 }, order: ['start'] };
  startLongTaskObserver();
  logLine('start', 0, 0);
  return session;
}

export function focusOpenPerfMark(name, detail = {}) {
  if (!session) focusOpenPerfStart();
  const elapsed = Math.round(now() - session.t0);
  const phaseMs = Math.max(0, elapsed - (session.lastElapsed || 0));
  session.marks[name] = elapsed;
  session.meta[name] = detail;
  if (!session.order.includes(name)) session.order.push(name);
  session.lastElapsed = elapsed;
  phaseTimeline.marks[name] = elapsed;
  if (!phaseTimeline.order.includes(name)) phaseTimeline.order.push(name);

  try {
    if (typeof window !== 'undefined') {
      window.__KENTU_FOCUS_OPEN_PERF_LIVE__ = {
        totalMs: elapsed,
        marks: { ...session.marks },
        order: [...session.order],
        last: name,
        phaseMs,
        detail,
      };
    }
  } catch {
    /* ignore */
  }

  logLine(name, elapsed, phaseMs);

  if (TABLE_PHASES.has(name)) {
    printTable(name);
  }

  return elapsed;
}

export function focusOpenPerfDone(extra = {}) {
  if (!session) return null;
  const totalMs = Math.round(now() - session.t0);
  const phaseMs = Math.max(0, totalMs - (session.lastElapsed || 0));
  session.marks.done = totalMs;
  if (!session.order.includes('done')) session.order.push('done');
  session.lastElapsed = totalMs;
  session.meta.done = extra;

  logLine('done', totalMs, phaseMs);
  phaseTimeline.marks.done = totalMs;
  if (!phaseTimeline.order.includes('done')) phaseTimeline.order.push('done');
  const tableRows = printTable('done');
  const longTasks = [...(session.longTasks || [])];
  const longTaskMax = longTasks.reduce((max, row) => Math.max(max, row.duration || 0), 0);
  if (longTasks.length) {
    focusOpenPerfPrintLongTasks(longTasks, 'longtasks@done');
  }

  const summary = {
    totalMs,
    marks: { ...session.marks },
    order: [...session.order],
    table: tableRows,
    longTasks,
    longTaskMax,
    ...session.meta,
    ...extra,
  };
  try {
    if (typeof window !== 'undefined') {
      window.__KENTU_FOCUS_OPEN_PERF__ = summary;
      window.__KENTU_FOCUS_LONGTASKS__ = longTasks;
    }
  } catch {
    /* ignore */
  }
  // Longtask observer resta attivo: kds-3 gira dopo done sul FocusBoard.
  session = null;
  return summary;
}

export function focusOpenPerfPeek() {
  return session;
}

/** Chiude l'observer longtask (fine lavoro board). */
export function focusOpenPerfStopLongTasks() {
  stopLongTaskObserver();
}

/**
 * Snapshot longtask accumulati (anche dopo done).
 * @returns {{ count: number, max: number, tasks: object[] }}
 */
export function focusOpenPerfLongTasksSnapshot() {
  const tasks = session?.longTasks || (typeof window !== 'undefined' ? window.__KENTU_FOCUS_LONGTASKS__ : null) || [];
  const list = Array.isArray(tasks) ? tasks : [];
  const max = list.reduce((m, row) => Math.max(m, Number(row.duration) || 0), 0);
  return { count: list.length, max, tasks: list };
}
