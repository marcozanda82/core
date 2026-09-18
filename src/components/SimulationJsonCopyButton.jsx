import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSimulationMode } from '../contexts/SimulationModeContext';

async function writeClipboard(text) {
  const value = String(text ?? '');
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

/**
 * Bottone debug «Copia JSON» — visibile solo in Modalità Simulazione.
 * Legge il context globale (stesso flag della barra viola), non un prop locale.
 */
export default function SimulationJsonCopyButton({
  payload = null,
  ariaLabel = 'Copia JSON',
} = {}) {
  const isSimulationMode = useSimulationMode();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(async (event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    try {
      await writeClipboard(JSON.stringify(payload ?? null, null, 2));
      setCopied(true);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      console.warn('[SimulationJsonCopyButton] copy failed', err);
    }
  }, [payload]);

  if (!isSimulationMode || typeof document === 'undefined') return null;

  return createPortal(
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copiato' : ariaLabel}
      title={copied ? 'Copiato' : ariaLabel}
      className="fixed right-3 z-[100060] rounded bg-gray-800 p-2 text-xs text-gray-400 active:scale-95"
      style={{ top: 'max(6.75rem, calc(env(safe-area-inset-top, 0px) + 6.25rem))' }}
    >
      {copied ? 'Copiato' : '{}'}
    </button>,
    document.body,
  );
}
