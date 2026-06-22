import { useEffect, useState } from 'react';
import { getCurrentTimeSlot } from '../utils/timeSlotUtils';

/**
 * Fascia oraria fissa fino al mount successivo o al ritorno in primo piano.
 * Evita riordini della griglia mentre l'utente tiene l'app aperta oltre mezzanotte/ cambio fascia.
 */
export function useStableTimeSlot() {
  const [timeSlot, setTimeSlot] = useState(() => getCurrentTimeSlot());

  useEffect(() => {
    const refresh = () => setTimeSlot(getCurrentTimeSlot());

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return timeSlot;
}

export default useStableTimeSlot;
