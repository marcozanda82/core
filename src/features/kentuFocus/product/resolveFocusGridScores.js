/**
 * Risoluzione punteggi griglia Focus: cache-first, ricalcolo selettivo, yield al browser.
 * Un solo job alla volta per uid (anti StrictMode / remount Home→Focus).
 */

import { computeDayScore } from '../score/computeDayScore.js';
import { SCORE_VERSION } from '../score/scoreConfig.kds-3.js';
import { createDayScoreStore } from '../score/dayScoreStore.js';
import {
  fingerprintFocusDayContent,
  focusDayNeedsFreshCompute,
  peekFocusDayScoreLocalCache,
  writeFocusDayScoreLocalCache,
} from './focusDayScoreLocalCache.js';
import { focusOpenPerfMark } from './focusOpenPerf.js';

const CHUNK = 2;

/** @type {Map<string, { gen: number, promise: Promise<object> }>} */
const INFLIGHT = new Map();

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * @param {object} hit
 * @param {string} contentHash
 */
function recordFromCacheHit(hit, contentHash) {
  return {
    version: hit.version || SCORE_VERSION,
    score: hit.score,
    reliability: hit.reliability ?? null,
    cylinders: hit.cylinders ?? null,
    dataVersion: hit.dataVersion ?? null,
    forceIntensity: hit.forceIntensity ?? 0,
    dayStatus: hit.dayStatus ?? null,
    contentHash,
    fromCache: true,
  };
}

/**
 * @param {{
 *   uid: string,
 *   db: object,
 *   today: string,
 *   dates: string[],
 *   scoreContext: object,
 *   signal?: { cancelled?: boolean },
 *   onPartial?: ( partial: { live: object, stored: object, hits: number, miss: number } ) => void,
 * }} input
 */
export async function resolveFocusGridScores(input) {
  const uid = String(input?.uid || '').trim();
  const today = input.today;
  const dates = (input.dates || []).filter(Boolean);
  const scoreContext = input.scoreContext || {};
  const signal = input.signal || {};
  const run = (async () => {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const live = {};
    const stored = {};
    const toCompute = [];
    let hits = 0;
    let forced = 0;
    const debug = (phase, extra = {}) => {
      try {
        if (typeof window !== 'undefined') {
          window.__KENTU_KDS_DEBUG__ = {
            phase,
            hits,
            toCompute: toCompute.length,
            cancelled: Boolean(signal.cancelled),
            ...extra,
            at: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
          };
        }
      } catch {
        /* ignore */
      }
    };
    debug('start', { dates: dates.length });

    // Pass 1: fingerprint + cache (niente computeDayScore). Yield ogni CHUNK date.
    // Solo signal.cancelled (effetto cleanup): niente gen-abort che uccideva il job vincente.
    let aborted = false;
    for (let i = 0; i < dates.length; i += 1) {
      if (signal.cancelled) {
        aborted = true;
        break;
      }
      const date = dates[i];
      if (date > today) {
        live[date] = {
          version: SCORE_VERSION,
          score: null,
          reliability: null,
          cylinders: null,
          dayStatus: 'future',
          contentHash: 'future',
          fromCache: true,
        };
        hits += 1;
        continue;
      }
      const contentHash = fingerprintFocusDayContent(date, scoreContext);
      const mustFresh = focusDayNeedsFreshCompute(date, today);
      if (!mustFresh) {
        const hit = peekFocusDayScoreLocalCache(uid, date, {
          version: SCORE_VERSION,
          contentHash,
        });
        if (hit && (hit.score != null || hit.dayStatus)) {
          const rec = recordFromCacheHit(hit, contentHash);
          live[date] = rec;
          if (date < today) stored[date] = rec;
          hits += 1;
          continue;
        }
      } else {
        forced += 1;
      }
      toCompute.push({ date, contentHash, mustFresh });
      if ((i + 1) % 8 === 0) await yieldToBrowser();
    }

    focusOpenPerfMark('kds3_local_cache', {
      hits,
      miss: toCompute.length,
      days: dates.length,
      forcedTodayYesterday: forced,
      computedSync: false,
      cacheFirst: true,
      aborted,
      msPass1: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
    });

    if (typeof input.onPartial === 'function') {
      input.onPartial({ live: { ...live }, stored: { ...stored }, hits, miss: toCompute.length });
    }

    if (aborted) {
      debug('aborted_pass1', { miss: toCompute.length });
      return { live, stored, hits, miss: toCompute.length, computed: 0, wrote: 0, aborted: true };
    }
    debug('pass2_start', { miss: toCompute.length });

    let wrote = 0;
    let computed = 0;
    const store = input.db && uid ? createDayScoreStore({ db: input.db, uid }) : null;
    /** @type {Promise<void>[]} */
    const remoteWrites = [];

    // Pass 2: ricalcolo a chunk con yield. localStorage subito; RTDB in background.
    for (let i = 0; i < toCompute.length; i += CHUNK) {
      if (signal.cancelled) {
        focusOpenPerfMark('kds3_persist_grid', {
          ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
          days: dates.length,
          persisted: wrote,
          recomputed: computed,
          hits,
          aborted: true,
          chunked: true,
        });
        return { live, stored, hits, miss: toCompute.length, computed, wrote, aborted: true };
      }
      const slice = toCompute.slice(i, i + CHUNK);
      for (const item of slice) {
        const fresh = computeDayScore(item.date, scoreContext);
        computed += 1;
        const rec = {
          ...fresh,
          contentHash: item.contentHash,
          fromCache: false,
        };
        live[item.date] = rec;
        if (item.date < today) {
          stored[item.date] = rec;
          writeFocusDayScoreLocalCache(uid, item.date, rec, item.contentHash);
          if (store) {
            remoteWrites.push((async () => {
              try {
                const existing = await store.read(item.date);
                if (
                  !existing
                  || existing.version !== fresh.version
                  || existing.dataVersion !== fresh.dataVersion
                ) {
                  await store.write(item.date, {
                    version: fresh.version,
                    score: fresh.score,
                    reliability: fresh.reliability,
                    cylinders: fresh.cylinders,
                    dataVersion: fresh.dataVersion,
                  });
                  wrote += 1;
                }
              } catch {
                /* locale resta fonte di verità per l'UI */
              }
            })());
          }
        }
      }
      if (typeof input.onPartial === 'function') {
        input.onPartial({ live: { ...live }, stored: { ...stored }, hits, miss: toCompute.length - computed });
      }
      if (i + CHUNK < toCompute.length) await yieldToBrowser();
    }

    // Non bloccare l'UI sulle scritture RTDB.
    void Promise.all(remoteWrites).then(() => {
      focusOpenPerfMark('kds3_rtdb_writes_done', { wrote, queued: remoteWrites.length });
    });

    focusOpenPerfMark('kds3_persist_grid', {
      ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
      days: dates.length,
      persisted: remoteWrites.length,
      wroteQueued: remoteWrites.length,
      recomputed: computed,
      hits,
      parallel: false,
      chunked: true,
      rtdbDeferred: true,
    });

    return {
      live,
      stored,
      hits,
      miss: toCompute.length,
      computed,
      wrote: remoteWrites.length,
      aborted: false,
    };
  })();

  INFLIGHT.set(uid, { promise: run });
  try {
    return await run;
  } finally {
    if (INFLIGHT.get(uid)?.promise === run) INFLIGHT.delete(uid);
  }
}
