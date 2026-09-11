import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildVoiceInboxDraftPayload,
  extractAssistantDraftTextFromUrl,
} from './googleAssistantInbox';
import { enqueueInboxDraftAppend } from './inboxDraftAppendBus';

const TOAST_MS = 2800;
const TOAST_MESSAGE = 'Bozza vocale aggiunta all\'Inbox';

function VoiceInboxToast({ message }) {
  if (!message || typeof document === 'undefined') return null;
  return createPortal(
    <div className="inbox-undo-toast" role="status" aria-live="polite">
      <span className="inbox-undo-toast__msg">{message}</span>
    </div>,
    document.body,
  );
}

/**
 * Intercetta kentu://app/add_draft?text=... (Ok Google / App Actions)
 * e accoda la bozza Inbox senza bloccare la UI.
 */
export default function GoogleAssistantInboxListener() {
  const [toast, setToast] = useState('');
  const seenUrlsRef = useRef(new Set());
  const toastTimerRef = useRef(null);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    let listenerHandle = null;
    let cancelled = false;

    const showToast = () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      setToast(TOAST_MESSAGE);
      toastTimerRef.current = window.setTimeout(() => {
        setToast('');
        toastTimerRef.current = null;
      }, TOAST_MS);
    };

    const handleUrl = (urlString) => {
      const url = String(urlString || '').trim();
      if (!url || seenUrlsRef.current.has(url)) return;
      const text = extractAssistantDraftTextFromUrl(url);
      if (!text) return;
      seenUrlsRef.current.add(url);
      const payload = buildVoiceInboxDraftPayload(text);
      if (!payload) return;
      const result = enqueueInboxDraftAppend(payload);
      if (result?.skipped) return;
      showToast();
    };

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform() || cancelled) return;
        const { App: CapacitorApp } = await import('@capacitor/app');

        try {
          const launch = await CapacitorApp.getLaunchUrl();
          if (!cancelled && launch?.url) handleUrl(launch.url);
        } catch (error) {
          console.warn('[GoogleAssistantInbox] getLaunchUrl failed', error);
        }

        listenerHandle = await CapacitorApp.addListener('appUrlOpen', (event) => {
          handleUrl(event?.url);
        });
      } catch (error) {
        console.warn('[GoogleAssistantInbox] setup failed', error);
      }
    })();

    return () => {
      cancelled = true;
      listenerHandle?.remove?.();
    };
  }, []);

  return <VoiceInboxToast message={toast} />;
}
