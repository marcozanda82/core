import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KentuButton, KentuIcon } from '../../components/kentuos/KentuOSUI';

/**
 * Composer chat isolato: testo locale + riga actions (tools slot + invia/stop).
 * Il genitore riceve il testo solo su submit → niente re-render albero a ogni tasto.
 */
export default function ChatInputBar({
  seedText = '',
  onSeedConsumed = null,
  placeholder = 'Scrivi un messaggio…',
  disabled = false,
  isProcessing = false,
  isNotesMode = false,
  canSendWithImages = false,
  onSubmit,
  onCancelGeneration = null,
  tools = null,
  textareaClassName = 'chat-input resize-none overflow-hidden min-h-[44px] max-h-[150px] w-full',
}) {
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);
  const lastSeedRef = useRef('');

  useEffect(() => {
    const seed = String(seedText || '');
    if (!seed || seed === lastSeedRef.current) return;
    lastSeedRef.current = seed;
    setValue(seed);
    onSeedConsumed?.();
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
      el.focus();
    });
  }, [seedText, onSeedConsumed]);

  const resize = useCallback((el) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const clear = useCallback(() => {
    setValue('');
    lastSeedRef.current = '';
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) el.style.height = 'auto';
    });
  }, []);

  const submit = useCallback(() => {
    if (disabled) return;
    const trimmed = String(value || '').trim();
    if (!trimmed && !canSendWithImages) return;
    onSubmit?.(trimmed);
    clear();
  }, [disabled, value, canSendWithImages, onSubmit, clear]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }, [submit]);

  const canSubmit = Boolean(String(value || '').trim() || canSendWithImages)
    && !(isProcessing && !isNotesMode);

  return (
    <>
      <div className="kentu-input-strip__composer">
        <textarea
          ref={textareaRef}
          rows={1}
          className={textareaClassName}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            setValue(e.target.value);
            resize(e.target);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div className="kentu-input-strip__actions">
        <div className="kentu-input-strip__tools overflow-visible">
          {tools}
        </div>
        {isProcessing && !isNotesMode && typeof onCancelGeneration === 'function' ? (
          <KentuButton
            variant="secondary"
            className="kentu-send-btn"
            aria-label="Interrompi generazione"
            onClick={() => onCancelGeneration()}
          >
            <KentuIcon name="stop" size={16} />
          </KentuButton>
        ) : (
          <KentuButton
            variant="primary"
            className={`kentu-send-btn ${!canSubmit ? 'kentu-send-btn--idle' : ''}`}
            aria-label={isNotesMode ? 'Salva nota' : 'Invia'}
            disabled={isProcessing && !isNotesMode}
            onClick={submit}
          >
            <KentuIcon name="send" size={18} />
          </KentuButton>
        )}
      </div>
    </>
  );
}
