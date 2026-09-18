import { useCallback, useState } from 'react';
import { useSimulationMode } from '../../../contexts/SimulationModeContext';
import LongevityCockpitView from './LongevityCockpitView.jsx';

const PREVIEW_LS_KEY = 'kentu_longevity_cockpit_preview';

function readPreviewFlag() {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(PREVIEW_LS_KEY) === '1';
  } catch {
    return false;
  }
}

function writePreviewFlag(on) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(PREVIEW_LS_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * Gate reversibile: Cockpit originale (children) vs preview Longevità.
 * Il toggle è visibile solo in DEV o Modalità Simulazione.
 * Default OFF — nessun impatto sulla UI di produzione.
 */
export default function HealthCockpitLongevityPreviewGate({
  children = null,
  longevityResult = null,
  onOpenStimulusCockpit = null,
  onOpenMetabolicFocus = null,
} = {}) {
  const isSimulationMode = useSimulationMode();
  const showToggle = Boolean(import.meta.env.DEV) || isSimulationMode;
  const [previewOn, setPreviewOn] = useState(readPreviewFlag);

  const togglePreview = useCallback(() => {
    setPreviewOn((prev) => {
      const next = !prev;
      writePreviewFlag(next);
      return next;
    });
  }, []);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {showToggle ? (
        <button
          type="button"
          onClick={togglePreview}
          aria-pressed={previewOn}
          className="absolute left-3 top-2 z-[60] rounded-full border border-white/15 bg-zinc-900/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
        >
          Modalità Longevità {previewOn ? 'ON' : 'OFF'}
        </button>
      ) : null}
      {previewOn && showToggle ? (
        <LongevityCockpitView
          longevityResult={longevityResult}
          onOpenStimulusCockpit={onOpenStimulusCockpit}
          onOpenMetabolicFocus={onOpenMetabolicFocus}
        />
      ) : (
        children
      )}
    </div>
  );
}
