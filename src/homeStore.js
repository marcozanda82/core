import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'kentu_use_new_home_v1';
const ACTION_VIEW_STORAGE_KEY = 'kentu_home_action_view_v1';

function readBooleanFlag(key, fallback = false) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === '1' || raw === 'true';
  } catch {
    return fallback;
  }
}

function persistBooleanFlag(key, value) {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function readInitialHomeFlag() {
  return readBooleanFlag(STORAGE_KEY, false);
}

let useNewHome = readInitialHomeFlag();
const listeners = [];

function notifyListeners() {
  listeners.forEach((listener) => listener(useNewHome));
}

function persistHomeFlag() {
  try {
    localStorage.setItem(STORAGE_KEY, useNewHome ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function getHomeFlag() {
  return useNewHome;
}

export function toggleHome() {
  useNewHome = !useNewHome;
  persistHomeFlag();
  console.log(`[homeStore] toggleHome -> useNewHome=${useNewHome}`);
  notifyListeners();
  return useNewHome;
}

export function useHomeFlag() {
  const [flag, setFlag] = useState(useNewHome);

  useEffect(() => {
    const listener = (next) => setFlag(next);
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    };
  }, []);

  return flag;
}

let isActionView = readBooleanFlag(ACTION_VIEW_STORAGE_KEY, false);
const actionViewListeners = [];

function notifyActionViewListeners() {
  actionViewListeners.forEach((listener) => listener(isActionView));
}

export function getActionView() {
  return isActionView;
}

export function setActionView(next) {
  const value = Boolean(next);
  if (value === isActionView) return isActionView;
  isActionView = value;
  persistBooleanFlag(ACTION_VIEW_STORAGE_KEY, isActionView);
  notifyActionViewListeners();
  return isActionView;
}

export function toggleActionView() {
  return setActionView(!isActionView);
}

export function useActionView() {
  const [flag, setFlag] = useState(isActionView);

  useEffect(() => {
    const listener = (next) => setFlag(next);
    actionViewListeners.push(listener);
    return () => {
      const index = actionViewListeners.indexOf(listener);
      if (index >= 0) actionViewListeners.splice(index, 1);
    };
  }, []);

  const toggle = useCallback(() => toggleActionView(), []);

  return [flag, toggle];
}

