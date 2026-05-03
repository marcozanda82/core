import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

function borderForSeverity(severity) {
  const s = String(severity || '').toLowerCase();
  if (s === 'warning') return 'rgba(250, 204, 121, 0.35)';
  if (s === 'good') return 'rgba(110, 170, 140, 0.35)';
  return 'rgba(255, 255, 255, 0.1)';
}

function sectionHeading(text) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 650,
        letterSpacing: '0.08em',
        color: 'rgba(160, 175, 190, 0.65)',
        marginBottom: 6,
        textTransform: 'uppercase',
      }}
    >
      {text}
    </div>
  );
}

/**
 * Card compatta; i dettagli sono in modal (solo presentazione).
 *
 * @param {{ data?: object | null }} props
 */
export default function DailyCoachCard({ data }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const closeBtnRef = useRef(null);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const openModal = useCallback(() => {
    setModalOpen(true);
  }, []);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [modalOpen, closeModal]);

  useEffect(() => {
    if (modalOpen && closeBtnRef.current) {
      closeBtnRef.current.focus();
    }
  }, [modalOpen]);

  if (!data || typeof data !== 'object') return null;

  const tint = borderForSeverity(data.severity);
  const details = Array.isArray(data.details) ? data.details.filter((d) => d && typeof d === 'object') : [];
  const reasonText = String(data.reason ?? '').trim();
  const actionText = String(data.action ?? '').trim();

  const onCompactKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openModal();
    }
  };

  const onBackdropMouseDown = (e) => {
    if (e.target === e.currentTarget) closeModal();
  };

  const modalPanel = modalOpen ? (
    <div
      role="presentation"
      onMouseDown={onBackdropMouseDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        boxSizing: 'border-box',
        background: 'rgba(0, 0, 0, 0.62)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-coach-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          maxHeight: 'min(82vh, 640px)',
          overflow: 'auto',
          padding: '16px 18px 52px',
          borderRadius: 14,
          border: `1px solid ${tint}`,
          background: 'rgba(14, 17, 21, 0.98)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
          boxSizing: 'border-box',
          fontFamily: FONT,
        }}
      >
        <button
          ref={closeBtnRef}
          type="button"
          aria-label="Chiudi"
          onClick={closeModal}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 36,
            height: 36,
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(220,226,235,0.95)',
            fontSize: 20,
            lineHeight: 1,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>

        <div id="daily-coach-modal-title" style={{ paddingRight: 40 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 650,
              letterSpacing: '0.1em',
              color: 'rgba(180, 195, 210, 0.55)',
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            Coach oggi
          </div>
          <h4
            style={{
              margin: '0 0 8px',
              fontSize: 15,
              fontWeight: 600,
              color: 'rgba(236, 240, 245, 0.96)',
              lineHeight: 1.35,
            }}
          >
            {String(data.title ?? '')}
          </h4>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.5,
              color: 'rgba(200, 210, 220, 0.9)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {String(data.summary ?? '')}
          </p>
          {data.overridesGoal === true ? (
            <div
              style={{
                marginTop: 12,
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(250, 204, 121, 0.95)',
                lineHeight: 1.35,
              }}
            >
              ⚠️ Priorità supera obiettivo
            </div>
          ) : null}
        </div>

        {reasonText ? (
          <div style={{ marginTop: 16 }}>
            {sectionHeading('Perché')}
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'rgba(215, 223, 232, 0.92)' }}>
              {reasonText}
            </p>
          </div>
        ) : null}

        {actionText ? (
          <div style={{ marginTop: 14 }}>
            {sectionHeading('Azione')}
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'rgba(215, 223, 232, 0.92)' }}>
              {actionText}
            </p>
          </div>
        ) : null}

        {details.length > 0 ? (
          <div style={{ marginTop: 14 }}>
            {sectionHeading('Dettagli')}
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {details.map((row, idx) => (
                <li
                  key={`${String(row.source ?? 's')}-${idx}`}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px 12px',
                    padding: '6px 0',
                    borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)',
                    fontSize: 11,
                    lineHeight: 1.45,
                    color: 'rgba(190, 205, 218, 0.9)',
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'rgba(220, 228, 238, 0.88)' }}>
                    {String(row.label ?? '')}
                  </span>
                  <span style={{ opacity: 0.92 }}>{String(row.value ?? '')}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <button
          type="button"
          onClick={closeModal}
          style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 20px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(230, 236, 244, 0.95)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: FONT,
          }}
        >
          Chiudi
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          marginLeft: 'auto',
          marginRight: 'auto',
          boxSizing: 'border-box',
          fontFamily: FONT,
        }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-haspopup="dialog"
          aria-label="Coach oggi, apri dettagli"
          onClick={openModal}
          onKeyDown={onCompactKeyDown}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            padding: '7px 10px',
            borderRadius: 10,
            border: `1px solid ${hover ? 'rgba(255,255,255,0.14)' : tint}`,
            background: hover ? 'rgba(24, 30, 38, 0.92)' : 'rgba(18, 22, 26, 0.88)',
            boxShadow: hover ? '0 2px 10px rgba(0, 0, 0, 0.3)' : 'none',
            cursor: 'pointer',
            boxSizing: 'border-box',
            outline: 'none',
            transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 650,
              letterSpacing: '0.1em',
              color: 'rgba(180, 195, 210, 0.55)',
              marginBottom: 4,
              textTransform: 'uppercase',
            }}
          >
            Coach oggi
          </div>
          <h4
            style={{
              margin: '0 0 4px',
              fontSize: 12.5,
              fontWeight: 600,
              color: 'rgba(236, 240, 245, 0.96)',
              lineHeight: 1.28,
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {String(data.title ?? '')}
          </h4>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              lineHeight: 1.35,
              color: 'rgba(200, 210, 220, 0.88)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {String(data.summary ?? '')}
          </p>
          {data.overridesGoal === true ? (
            <div
              style={{
                marginTop: 6,
                fontSize: 10,
                fontWeight: 600,
                color: 'rgba(250, 204, 121, 0.95)',
                lineHeight: 1.3,
              }}
            >
              ⚠️ Priorità supera obiettivo
            </div>
          ) : null}
        </div>
      </div>
      {typeof document !== 'undefined' && modalPanel ? createPortal(modalPanel, document.body) : null}
    </>
  );
}
