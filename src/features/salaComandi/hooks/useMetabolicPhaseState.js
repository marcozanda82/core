import { useEffect, useMemo, useState } from 'react';
import {
  buildMetabolicSnapshot,
  resolveMetabolicBiometrics,
} from '../utils/metabolicStateEngine';

const TICK_MS = 60_000;

/**
 * Stato metabolico post-pasto con refresh ogni minuto.
 * Interroga diario (SNC, sonno) se `biometrics` non è passato esplicitamente.
 *
 * @param {object|null} biometricsOverride — `{ stressLevel, sleepQuality, recoveryScore }` opzionale
 * @param {Array<object>|null} [manualNodes] — stimolanti (caffè) del giorno
 */
export function useMetabolicPhaseState(
  fullHistory,
  activeLog,
  anchorDate,
  biometricsOverride,
  manualNodes = null,
) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((prev) => prev + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const biometrics = useMemo(() => {
    if (biometricsOverride && typeof biometricsOverride === 'object') {
      return resolveMetabolicBiometrics(fullHistory, activeLog, {
        anchorDate,
        ...biometricsOverride,
      });
    }
    return resolveMetabolicBiometrics(fullHistory, activeLog, { anchorDate });
  }, [fullHistory, activeLog, anchorDate, biometricsOverride, tick]);

  return useMemo(
    () => buildMetabolicSnapshot(fullHistory, activeLog, {
      anchorDate,
      biometrics,
      manualNodes: Array.isArray(manualNodes) ? manualNodes : [],
    }),
    [fullHistory, activeLog, anchorDate, biometrics, tick, manualNodes],
  );
}

export default useMetabolicPhaseState;
