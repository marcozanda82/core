import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  compressImage,
  compressImageFromClipboardItems,
  extractImageBlobFromPasteEvent,
} from '../utils/imageCompressUtils';

export const FOOD_EMOJI_PICKER = [
  '🍎', '🍌', '🍓', '🥑', '🥦', '🥕',
  '🥩', '🍗', '🥓', '🍔', '🍕', '🌭',
  '🥚', '🧀', '🥖', '🥐', '🥞', '🍝',
  '🍜', '🍣', '🍤', '🥗', '🥪', '🥛',
  '☕', '🍩', '🍪', '🍫', '🍯', '🧊',
];

export default function ImageSelectionSheet({
  isOpen,
  onClose,
  onSelectEmoji,
  onSelectImage,
}) {
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const panelRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pasteError, setPasteError] = useState('');

  const applyCompressedImage = useCallback(
    async (fileOrBlob) => {
      setIsProcessing(true);
      setPasteError('');
      try {
        const dataUrl = await compressImage(fileOrBlob);
        onSelectImage?.(dataUrl);
        onClose?.();
      } catch {
        setPasteError('Impossibile elaborare l\'immagine. Riprova.');
      } finally {
        setIsProcessing(false);
      }
    },
    [onClose, onSelectImage],
  );

  useEffect(() => {
    if (!isOpen) {
      setPasteError('');
      setIsProcessing(false);
      return undefined;
    }

    const handlePaste = (event) => {
      const blob = extractImageBlobFromPasteEvent(event);
      if (!blob) return;
      event.preventDefault();
      applyCompressedImage(blob);
    };

    window.addEventListener('paste', handlePaste);
    panelRef.current?.focus();

    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, applyCompressedImage]);

  if (!isOpen) return null;

  const handleGalleryChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await applyCompressedImage(file);
  };

  const handleCameraChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await applyCompressedImage(file);
  };

  const handlePasteFromClipboard = async () => {
    setPasteError('');
    if (!navigator.clipboard?.read) {
      setPasteError('Usa Ctrl+V / tieni premuto e Incolla con un\'immagine negli appunti.');
      return;
    }

    setIsProcessing(true);
    try {
      const items = await navigator.clipboard.read();
      const dataUrl = await compressImageFromClipboardItems(items);
      if (!dataUrl) {
        setPasteError('Nessuna immagine negli appunti.');
        return;
      }
      onSelectImage?.(dataUrl);
      onClose?.();
    } catch {
      setPasteError('Incolla con Ctrl+V oppure consenti l\'accesso agli appunti.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100060] flex flex-col justify-end bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Scegli icona alimento"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Chiudi selezione icona"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative z-10 w-full rounded-t-2xl border border-slate-700 bg-[#050a12] px-4 pb-6 pt-4 shadow-2xl outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-100">Scegli icona</h4>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:text-white"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Emoji
        </p>
        <div className="grid max-h-48 grid-cols-6 gap-3 overflow-y-auto pb-1">
          {FOOD_EMOJI_PICKER.map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={isProcessing}
              onClick={() => {
                onSelectEmoji?.(emoji);
                onClose?.();
              }}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/80 text-2xl transition-transform hover:bg-slate-700 active:scale-95 disabled:opacity-50"
              aria-label={`Seleziona emoji ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        <hr className="my-4 border-slate-800" />

        <div className="space-y-2">
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleGalleryChange}
          />
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => galleryInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-cyan-500/40 hover:bg-slate-800 disabled:opacity-50"
          >
            <span aria-hidden>🖼️</span>
            Scegli da Galleria
          </button>

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleCameraChange}
          />
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => cameraInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-cyan-500/40 hover:bg-slate-800 disabled:opacity-50"
          >
            <span aria-hidden>📸</span>
            Scatta Foto
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={handlePasteFromClipboard}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:border-cyan-500/40 hover:bg-slate-800 disabled:opacity-50"
          >
            <span aria-hidden>📋</span>
            Incolla immagine copiata
          </button>

          <p className="text-center text-[10px] text-slate-500">
            Suggerimento: su iOS/Android puoi anche premere Ctrl+V / Incolla con soggetto scontornato.
          </p>

          {isProcessing ? (
            <p className="text-center text-xs text-cyan-300">Compressione in corso...</p>
          ) : null}

          {pasteError ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
              {pasteError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
