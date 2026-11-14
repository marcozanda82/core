import { useEffect, useState } from 'react';
import { patchMorningState, readMorningState } from '../morningFocusStore.js';

/**
 * Dopo la prima apertura del Focus, su Android, una riga spiega la notifica
 * e solo allora si chiede POST_NOTIFICATIONS. Se è negato, non si richiede più.
 */
export default function FocusNotificationAsk() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import('../focusMorningNotifications.js')
      .then((mod) => {
        if (cancelled || !mod.isAndroidApp()) return;
        const state = readMorningState();
        if (state.permission === 'unknown') setVisible(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const answer = (activate) => {
    setVisible(false);
    if (!activate) {
      patchMorningState({ permission: 'later' });
      return;
    }
    import('../focusMorningNotifications.js')
      .then((mod) => mod.requestFocusNotificationPermission())
      .catch(() => patchMorningState({ permission: 'denied' }));
  };

  return (
    <div className="kf-banner" role="status">
      <p>La notifica del mattino ti avvisa quando il Focus di ieri è pronto.</p>
      <button type="button" onClick={() => answer(true)}>Attiva</button>
      <button type="button" onClick={() => answer(false)}>Non ora</button>
    </div>
  );
}
