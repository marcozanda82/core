import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'kentu_use_new_home_v1';

function readInitialUseNewHome() {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let useNewHomeValue = readInitialUseNewHome();
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

function persist(next) {
  try {
    localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function getUseNewHome() {
  return useNewHomeValue;
}

export function setUseNewHome(next) {
  useNewHomeValue = !!next;
  persist(useNewHomeValue);
  emit();
}

export function toggleUseNewHome() {
  const next = !useNewHomeValue;
  setUseNewHome(next);
  return next;
}

export function subscribeUseNewHome(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUseNewHome() {
  return useSyncExternalStore(subscribeUseNewHome, getUseNewHome, getUseNewHome);
}

