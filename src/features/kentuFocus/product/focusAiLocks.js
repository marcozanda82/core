/**
 * Lock generazione mattino + circuit breaker Rigenera su RTDB.
 * Path: users/{uid}/focus_ai_locks/{periodId}
 * Vale tra dispositivi, browser e ambienti (dev / preview / app).
 */

import { reportRtdbPermissionDenied } from '../../../services/rtdbPermissionDenied.js';

export const FOCUS_AI_LOCK_PERIODS = Object.freeze(['ieri', 'settimana', 'mese']);
export const FORCE_CIRCUIT_WINDOW_MS = 60 * 60 * 1000;

export const FORCE_CIRCUIT_USER_MESSAGE =
  'Hai già rigenerato questa analisi di recente. Riprova tra un’ora.';

/**
 * @param {string} uid
 * @param {string} periodId
 */
export function focusAiLockPath(uid, periodId) {
  return `users/${String(uid || '').trim()}/focus_ai_locks/${String(periodId || '').trim()}`;
}

/**
 * Decisione generazione automatica del mattino (pura).
 * @param {object|null|undefined} lock
 * @param {string} dataVersion
 * @param {string} today ISO date
 * @returns {'run'|'skip'}
 */
export function morningLockDecision(lock, dataVersion, today) {
  const dv = String(dataVersion || '');
  if (!lock || typeof lock !== 'object') return 'run';
  if (String(lock.dataVersion || '') !== dv) return 'run';
  if (lock.status === 'done') return 'skip';
  if (lock.status === 'running' && lock.on === today) return 'skip';
  if (lock.status === 'failed' && lock.on === today) return 'skip';
  return 'run';
}

/**
 * Circuit breaker: max 1 force per (uid, periodId, dataVersion) all’ora.
 * @param {object|null|undefined} lock
 * @param {string} dataVersion
 * @param {number} [nowMs]
 * @returns {'allow'|'block'}
 */
export function forceCircuitDecision(lock, dataVersion, nowMs = Date.now()) {
  const force = lock?.force;
  if (!force || typeof force !== 'object') return 'allow';
  if (String(force.dataVersion || '') !== String(dataVersion || '')) return 'allow';
  const at = Number(force.at || 0);
  if (!Number.isFinite(at) || at <= 0) return 'allow';
  if (nowMs - at < FORCE_CIRCUIT_WINDOW_MS) return 'block';
  return 'allow';
}

/**
 * Store in-memory (test / fallback).
 */
export function createMemoryFocusAiLockStore(seed = {}) {
  /** @type {Map<string, object>} */
  const map = new Map();
  for (const [k, v] of Object.entries(seed || {})) {
    map.set(k, v && typeof v === 'object' ? { ...v } : v);
  }

  return {
    kind: 'memory',
    async claimMorning({ uid, periodId, dataVersion, today, nowMs = Date.now() }) {
      const key = focusAiLockPath(uid, periodId);
      const current = map.get(key) || null;
      if (morningLockDecision(current, dataVersion, today) !== 'run') {
        return { ok: false, reason: 'locked', lock: current };
      }
      const next = {
        ...(current && typeof current === 'object' ? current : {}),
        dataVersion: String(dataVersion || ''),
        status: 'running',
        on: String(today),
        updatedAt: nowMs,
      };
      map.set(key, next);
      return { ok: true, reason: null, lock: next };
    },
    async finishMorning({ uid, periodId, dataVersion, today, status, nowMs = Date.now() }) {
      const key = focusAiLockPath(uid, periodId);
      const current = map.get(key) || {};
      const next = {
        ...current,
        dataVersion: String(dataVersion || current.dataVersion || ''),
        status: status === 'done' ? 'done' : 'failed',
        on: String(today || current.on || ''),
        updatedAt: nowMs,
      };
      map.set(key, next);
      return { ok: true, lock: next };
    },
    async claimForce({ uid, periodId, dataVersion, nowMs = Date.now() }) {
      const key = focusAiLockPath(uid, periodId);
      const current = map.get(key) || null;
      if (forceCircuitDecision(current, dataVersion, nowMs) === 'block') {
        return {
          ok: false,
          reason: 'circuit_open',
          userMessage: FORCE_CIRCUIT_USER_MESSAGE,
          lock: current,
        };
      }
      const next = {
        ...(current && typeof current === 'object' ? current : {}),
        force: {
          dataVersion: String(dataVersion || ''),
          at: nowMs,
        },
        updatedAt: nowMs,
      };
      map.set(key, next);
      return { ok: true, reason: null, lock: next };
    },
    async read({ uid, periodId }) {
      const key = focusAiLockPath(uid, periodId);
      return { ok: true, lock: map.get(key) || null };
    },
    __dumpForTests() {
      return Object.fromEntries(map.entries());
    },
  };
}

/**
 * Adapter RTDB client (ref + runTransaction + get).
 * @param {{
 *   db: object,
 *   ref: Function,
 *   runTransaction: Function,
 *   get?: Function,
 * }} firebaseApi
 */
export function createFirebaseFocusAiLockStore(firebaseApi) {
  if (!firebaseApi?.db || typeof firebaseApi.ref !== 'function'
    || typeof firebaseApi.runTransaction !== 'function') {
    throw new Error('createFirebaseFocusAiLockStore: firebaseApi incompleto');
  }
  const { db, ref, runTransaction, get } = firebaseApi;

  return {
    kind: 'firebase',
    async claimMorning({ uid, periodId, dataVersion, today, nowMs = Date.now() }) {
      if (!FOCUS_AI_LOCK_PERIODS.includes(String(periodId))) {
        return { ok: false, reason: 'invalid_period', lock: null };
      }
      const path = focusAiLockPath(uid, periodId);
      try {
        const result = await runTransaction(ref(db, path), (current) => {
          if (morningLockDecision(current, dataVersion, today) !== 'run') {
            return undefined;
          }
          return {
            ...(current && typeof current === 'object' ? current : {}),
            dataVersion: String(dataVersion || ''),
            status: 'running',
            on: String(today),
            updatedAt: nowMs,
          };
        });
        if (!result?.committed) {
          return {
            ok: false,
            reason: 'locked',
            lock: result?.snapshot?.val?.() ?? null,
          };
        }
        return { ok: true, reason: null, lock: result.snapshot.val() };
      } catch (err) {
        await reportRtdbPermissionDenied(err, { path, version: dataVersion, feature: 'focus_ai_locks' });
        return {
          ok: false,
          reason: 'network_error',
          lock: null,
          error: err?.message || String(err),
        };
      }
    },
    async finishMorning({ uid, periodId, dataVersion, today, status, nowMs = Date.now() }) {
      const path = focusAiLockPath(uid, periodId);
      try {
        const result = await runTransaction(ref(db, path), (current) => ({
          ...(current && typeof current === 'object' ? current : {}),
          dataVersion: String(dataVersion || (current && current.dataVersion) || ''),
          status: status === 'done' ? 'done' : 'failed',
          on: String(today || (current && current.on) || ''),
          updatedAt: nowMs,
        }));
        return {
          ok: Boolean(result?.committed),
          lock: result?.snapshot?.val?.() ?? null,
        };
      } catch (err) {
        await reportRtdbPermissionDenied(err, { path, version: dataVersion, feature: 'focus_ai_locks' });
        return {
          ok: false,
          lock: null,
          error: err?.message || String(err),
        };
      }
    },
    async claimForce({ uid, periodId, dataVersion, nowMs = Date.now() }) {
      if (!FOCUS_AI_LOCK_PERIODS.includes(String(periodId))) {
        return { ok: false, reason: 'invalid_period', userMessage: FORCE_CIRCUIT_USER_MESSAGE, lock: null };
      }
      const path = focusAiLockPath(uid, periodId);
      try {
        const result = await runTransaction(ref(db, path), (current) => {
          if (forceCircuitDecision(current, dataVersion, nowMs) === 'block') {
            return undefined;
          }
          return {
            ...(current && typeof current === 'object' ? current : {}),
            force: {
              dataVersion: String(dataVersion || ''),
              at: nowMs,
            },
            updatedAt: nowMs,
          };
        });
        if (!result?.committed) {
          return {
            ok: false,
            reason: 'circuit_open',
            userMessage: FORCE_CIRCUIT_USER_MESSAGE,
            lock: result?.snapshot?.val?.() ?? null,
          };
        }
        return { ok: true, reason: null, lock: result.snapshot.val() };
      } catch (err) {
        await reportRtdbPermissionDenied(err, { path, version: dataVersion, feature: 'focus_ai_locks' });
        // Fail-closed sul force: evita doppie rigenerazioni se RTDB non risponde.
        return {
          ok: false,
          reason: 'network_error',
          userMessage: FORCE_CIRCUIT_USER_MESSAGE,
          lock: null,
          error: err?.message || String(err),
        };
      }
    },
    async read({ uid, periodId }) {
      if (typeof get !== 'function') {
        return { ok: false, lock: null, reason: 'get_unavailable' };
      }
      try {
        const snap = await get(ref(db, focusAiLockPath(uid, periodId)));
        return { ok: true, lock: snap.exists() ? snap.val() : null };
      } catch (err) {
        return {
          ok: false,
          lock: null,
          reason: 'network_error',
          error: err?.message || String(err),
        };
      }
    },
  };
}
