/**
 * Memoria locale del rapporto del mattino. Niente Firebase: la notifica è del dispositivo.
 */

const KEY = 'kentu.focus.morning.v1';

export function emptyMorningState() {
  return {
    lastOpenDate: null,
    focusOpenedOn: null,
    auto: {},
    notification: { enabled: true, time: null },
    permission: 'unknown',
  };
}

export function readMorningState(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem?.(KEY);
    if (!raw) return emptyMorningState();
    const parsed = JSON.parse(raw);
    return {
      ...emptyMorningState(),
      ...parsed,
      auto: parsed?.auto && typeof parsed.auto === 'object' ? parsed.auto : {},
      notification: {
        enabled: parsed?.notification?.enabled !== false,
        time: typeof parsed?.notification?.time === 'string' ? parsed.notification.time : null,
      },
    };
  } catch {
    return emptyMorningState();
  }
}

export function writeMorningState(state, storage = defaultStorage()) {
  try {
    storage?.setItem?.(KEY, JSON.stringify(state));
  } catch {
    /* quota o storage assente */
  }
  return state;
}

export function patchMorningState(patch, storage = defaultStorage()) {
  const current = readMorningState(storage);
  const next = {
    ...current,
    ...patch,
    auto: { ...current.auto, ...(patch.auto || {}) },
    notification: {
      ...current.notification,
      ...(patch.notification || {}),
    },
  };
  return writeMorningState(next, storage);
}

function defaultStorage() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}
