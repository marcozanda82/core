import React from 'react';
import {
  formatSystemNoticeText,
  getSystemNoticeIcon,
  getSystemNoticeTone,
} from './chatMessageKind.js';

const TONE_CLASS = {
  success: 'kentu-system-notice--success',
  cancel: 'kentu-system-notice--cancel',
  error: 'kentu-system-notice--error',
  neutral: 'kentu-system-notice--neutral',
};

/**
 * Notifica transazionale snella (senza avatar AI) con icona 3D contestuale.
 */
export default function SystemNoticeMessage({ message }) {
  const tone = getSystemNoticeTone(message);
  const icon = getSystemNoticeIcon(message);
  const text = formatSystemNoticeText(message?.text);

  return (
    <div
      className={`kentu-system-notice ${TONE_CLASS[tone] || TONE_CLASS.neutral}`}
      role="status"
    >
      <img
        src={icon.src}
        alt={icon.alt}
        className="kentu-system-notice__img h-12 w-12 object-contain"
        width={48}
        height={48}
        draggable={false}
      />
      <p className="kentu-system-notice__text">{text}</p>
    </div>
  );
}
