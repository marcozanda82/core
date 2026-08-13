import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

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
 * Pulsante ghost «Copia» con feedback check verde (2s).
 */
export default function CopyToClipboardButton({
  text,
  ariaLabel = 'Copia negli appunti',
  title = 'Copia',
  className = '',
  onCopied = null,
}) {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const handleCopy = useCallback(async (event) => {
    event?.stopPropagation?.();
    event?.preventDefault?.();
    try {
      await writeClipboard(text);
      setIsCopied(true);
      if (typeof onCopied === 'function') onCopied();
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('[CopyToClipboardButton] copy failed', err);
    }
  }, [text, onCopied]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={isCopied ? 'Copiato' : ariaLabel}
      title={isCopied ? 'Copiato!' : title}
      className={[
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
        'border-slate-600/70 bg-slate-800/70 text-slate-300 transition',
        'hover:border-slate-500 hover:bg-slate-700/80 hover:text-slate-100',
        'active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40',
        className,
      ].filter(Boolean).join(' ')}
    >
      {isCopied ? (
        <Check size={15} strokeWidth={2.4} className="text-emerald-400" aria-hidden />
      ) : (
        <Copy size={15} strokeWidth={2.2} aria-hidden />
      )}
    </button>
  );
}
