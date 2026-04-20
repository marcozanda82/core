import { useEffect, useState } from 'react';

const STORAGE_KEY = 'kentu_use_new_home_v1';

function readInitialHomeFlag() {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
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

