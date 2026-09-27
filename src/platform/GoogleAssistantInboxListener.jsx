import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  buildVoiceInboxDraftPayload,
  parseAssistantAddDraftUrl,
} from './googleAssistantInbox';
import { enqueueInboxDraftAppend } from './inboxDraftAppendBus';
import { requestOpenInboxComposer } from './inboxComposerFocusBus';
import { toastMessageForDraftType } from '../utils/draftParser';

const TOAST_MS = 2800;

function VoiceInboxToast({ message }) {
  if (!message || typeof document === 'undefined') return null;
  return createPortal(
    <div className="inbox-undo-toast" role="status" aria-live="polite">
      <span className="inbox-undo-toast__msg">{message}</span>
    </div>,
    document.body,
  );
}

function openInboxComposer(navigate) {
  requestOpenInboxComposer();
  if (typeof navigate === 'function') {
    navigate('/', { replace: true, state: { openInboxComposer: true, ts: Date.now() } });
  }
}

/**
 * Intercetta kentu://app/add_draft?text=... (Ok Google / App Actions)
 * e accoda la bozza Inbox, oppure apre Inbox + tastiera se il testo manca.
 */
export default function GoogleAssistantInboxListener() {
  const navigate = useNavigate();
  const [toast, setToast] = useState('');
  const seenUrlsRef = useRef(new Set());
  const toastTimerRef = useRef(null);
  const launchHandledRef = useRef(false);

  useEffect(() => () => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
  }, []);

  useEffect(() => {
    let listenerHandle = null;
    let cancelled = false;

    const showToast = (message) => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
      setToast(message || toastMessageForDraftType('unknown'));
      toastTimerRef.current = window.setTimeout(() => {
        setToast('');
        toastTimerRef.current = null;
      }, TOAST_MS);
    };

    const handleUrl = (urlString) => {
      const url = String(urlString || '').trim();
      if (!url) return;
      const parsed = parseAssistantAddDraftUrl(url);
      if (!parsed.matched) return;
      const rawText = String(parsed.text || '').trim();
      if (!rawText || /^[.,;:!?\s]+$/.test(rawText)) {
        openInboxComposer(navigate);
        return;
      }
      if (seenUrlsRef.current.has(url)) return;
      seenUrlsRef.current.add(url);
      const payload = buildVoiceInboxDraftPayload(rawText);
      if (!payload) {
        openInboxComposer(navigate);
        return;
      }
      const result = enqueueInboxDraftAppend(payload);
      if (result?.skipped) return;
      showToast(toastMessageForDraftType(payload.inferredType));
    };

    (async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform() || cancelled) return;
        const { App: CapacitorApp } = await import('@capacitor/app');

        try {
          const launch = await CapacitorApp.getLaunchUrl();
          if (!cancelled && launch?.url && !launchHandledRef.current) {
            launchHandledRef.current = true;
            handleUrl(launch.url);
          }
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
  }, [navigate]);

  return <VoiceInboxToast message={toast} />;
}
