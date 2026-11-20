import { useEffect, useState } from 'react';
import { subscribeDaySaveFeedback } from '../utils/daySaveFeedback.js';

const HOLD_MS = 6000;

/**
 * Banner globale per fallimenti salvataggio giorno (rev / offline / app vecchia).
 */
export default function DaySaveAlertHost() {
  const [message, setMessage] = useState('');

  useEffect(() => subscribeDaySaveFeedback((event) => {
    const text = String(event?.message || '').trim();
    if (text) setMessage(text);
  }), []);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(''), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div
      className="pointer-events-auto fixed bottom-8 left-1/2 z-[100220] max-w-[92vw] -translate-x-1/2 rounded-2xl border border-amber-400/50 bg-slate-950/95 px-4 py-3 text-sm font-semibold text-amber-50 shadow-lg backdrop-blur-sm"
      role="alert"
      aria-live="assertive"
    >
      <p className="m-0">{message}</p>
      <button
        type="button"
        className="mt-2 text-xs font-medium text-amber-200/90 underline"
        onClick={() => setMessage('')}
      >
        Chiudi
      </button>
    </div>
  );
}
