import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { initialUIConfig } from '../config/initialUIConfig';

const UIConfigContext = createContext(null);

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return base;
  }
  const out = { ...base };
  Object.keys(patch).forEach((key) => {
    const baseVal = base[key];
    const patchVal = patch[key];
    if (
      patchVal
      && typeof patchVal === 'object'
      && !Array.isArray(patchVal)
      && baseVal
      && typeof baseVal === 'object'
      && !Array.isArray(baseVal)
    ) {
      out[key] = deepMerge(baseVal, patchVal);
    } else {
      out[key] = patchVal;
    }
  });
  return out;
}

/**
 * Fornisce la configurazione UI dell'app (Home, header, tema, dev mode).
 * In developer.enabled=true è possibile applicare override runtime via setDevConfigPatch.
 */
export function UIConfigProvider({ children, configOverride = null }) {
  const [devConfigPatch, setDevConfigPatchState] = useState(null);

  const config = useMemo(() => {
    let merged = deepMerge(initialUIConfig, configOverride);
    if (merged.developer?.enabled && devConfigPatch) {
      merged = deepMerge(merged, devConfigPatch);
    }
    return merged;
  }, [configOverride, devConfigPatch]);

  const setDevConfigPatch = useCallback((patch) => {
    if (!config.developer?.enabled) {
      console.warn('[UIConfig] setDevConfigPatch ignorato: developer.enabled è false');
      return;
    }
    setDevConfigPatchState((prev) => (patch == null ? null : deepMerge(prev ?? {}, patch)));
  }, [config.developer?.enabled]);

  const resetDevConfigPatch = useCallback(() => {
    setDevConfigPatchState(null);
  }, []);

  const value = useMemo(
    () => ({
      config,
      isDeveloperMode: Boolean(config.developer?.enabled),
      setDevConfigPatch,
      resetDevConfigPatch,
    }),
    [config, setDevConfigPatch, resetDevConfigPatch],
  );

  return (
    <UIConfigContext.Provider value={value}>
      {children}
    </UIConfigContext.Provider>
  );
}

export function useUIConfig() {
  const ctx = useContext(UIConfigContext);
  if (!ctx) {
    throw new Error('useUIConfig must be used within UIConfigProvider');
  }
  return ctx;
}

export default UIConfigProvider;
