import React from 'react';
import { createPortal } from 'react-dom';
import QuickEventConfirmMedia from './QuickEventConfirmMedia.jsx';
import './quickEventConfirm.css';

/**
 * Overlay fullscreen (fallback quando la chat non è aperta).
 */
export default function QuickEventConfirmOverlay({
  payload = null,
  onDone,
  imageHoldMs = 1600,
}) {
  if (!payload?.imageSrc || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="kentu-quick-confirm"
      role="status"
      aria-live="polite"
      aria-label={payload.title || 'Conferma evento'}
      onClick={() => onDone?.()}
    >
      <div
        className="kentu-quick-confirm__card"
        onClick={(event) => event.stopPropagation()}
      >
        <QuickEventConfirmMedia
          imageSrc={payload.imageSrc}
          videoSrc={payload.videoSrc}
          title={payload.title}
          subtitle={payload.subtitle}
          imageHoldMs={imageHoldMs}
          onFinished={onDone}
        />
      </div>
    </div>,
    document.body,
  );
}
