/**
 * Griglia «Aggiungi evento» con lucchetto (long-press per sbloccare), riordino a frecce e animazione wiggle.
 */
import React from 'react';
import { ADD_EVENT_MENU_ITEMS } from '../coreEngine';

const lockBtnStyle = {
  width: 44,
  height: 44,
  minWidth: 44,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.06)',
  fontSize: '1.25rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  touchAction: 'manipulation',
  userSelect: 'none',
};

const arrowStyle = {
  minWidth: 28,
  height: 28,
  padding: '0 6px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(0,0,0,0.35)',
  color: '#e2e8f0',
  fontSize: '0.85rem',
  fontWeight: 800,
  cursor: 'pointer',
  touchAction: 'manipulation',
};

export default function AddEventMenuGrid({
  menuOrder,
  onReorder,
  isUnlocked,
  onUnlockHoldStart,
  onUnlockHoldEnd,
  onLockClickWhenUnlocked,
  onItemActivate,
  title = 'AGGIUNGI EVENTO',
  headingStyle = {},
}) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 16,
          ...headingStyle,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '0.7rem',
            textAlign: 'left',
            color: '#777',
            letterSpacing: '3px',
            fontWeight: 'normal',
            flex: 1,
          }}
        >
          {title}
        </h2>
        <button
          type="button"
          style={{
            ...lockBtnStyle,
            cursor: isUnlocked ? 'pointer' : 'default',
          }}
          aria-label={
            isUnlocked
              ? 'Blocca menu e salva ordine icone'
              : 'Tieni premuto 0,8s per sbloccare e riordinare le icone'
          }
          title={isUnlocked ? 'Tocca per salvare e bloccare' : 'Tieni premuto per sbloccare'}
          onMouseDown={(e) => {
            e.preventDefault();
            if (!isUnlocked) onUnlockHoldStart();
          }}
          onMouseUp={() => {
            if (!isUnlocked) onUnlockHoldEnd();
          }}
          onMouseLeave={() => {
            if (!isUnlocked) onUnlockHoldEnd();
          }}
          onTouchStart={(e) => {
            if (!isUnlocked) {
              e.preventDefault();
              onUnlockHoldStart();
            }
          }}
          onTouchEnd={() => {
            if (!isUnlocked) onUnlockHoldEnd();
          }}
          onTouchMove={() => {
            if (!isUnlocked) onUnlockHoldEnd();
          }}
          onClick={(e) => {
            if (isUnlocked) {
              e.preventDefault();
              onLockClickWhenUnlocked();
            }
          }}
        >
          {isUnlocked ? '🔓' : '🔒'}
        </button>
      </div>

      <div
        className={isUnlocked ? 'add-event-menu-wiggle' : ''}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 8,
        }}
      >
        {menuOrder.map((itemId, idx) => {
          const def = ADD_EVENT_MENU_ITEMS[itemId];
          if (!def) return null;
          const border = def.borderColor || undefined;
          const labelColor = def.labelColor || '#fff';
          const iconStyle = def.iconFilter ? { fontSize: '1.8rem', filter: def.iconFilter } : { fontSize: '1.8rem' };
          const labelEl =
            def.labelLines && String(def.label).includes(' ') ? (
              <span
                className="action-label"
                style={{
                  fontSize: '0.5rem',
                  letterSpacing: '0.5px',
                  lineHeight: 1.15,
                  textAlign: 'center',
                  color: labelColor,
                  maxWidth: '100%',
                }}
              >
                {String(def.label).split(' ').map((w, i) => (
                  <React.Fragment key={i}>
                    {i > 0 ? <br /> : null}
                    {w.toUpperCase()}
                  </React.Fragment>
                ))}
              </span>
            ) : (
              <span className="action-label" style={{ fontSize: '0.6rem', letterSpacing: '1px', color: labelColor }}>
                {def.label}
              </span>
            );

          return (
            <div
              key={itemId}
              style={{
                position: 'relative',
                paddingTop: isUnlocked ? 16 : 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                minWidth: 0,
              }}
            >
              {isUnlocked ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: 6,
                    zIndex: 3,
                  }}
                >
                  <button
                    type="button"
                    disabled={idx === 0}
                    style={{
                      ...arrowStyle,
                      opacity: idx === 0 ? 0.35 : 1,
                      cursor: idx === 0 ? 'not-allowed' : 'pointer',
                    }}
                    aria-label="Sposta su"
                    onClick={() => onReorder(idx, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={idx >= menuOrder.length - 1}
                    style={{
                      ...arrowStyle,
                      opacity: idx >= menuOrder.length - 1 ? 0.35 : 1,
                      cursor: idx >= menuOrder.length - 1 ? 'not-allowed' : 'pointer',
                    }}
                    aria-label="Sposta giù"
                    onClick={() => onReorder(idx, 1)}
                  >
                    ↓
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="action-btn"
                disabled={isUnlocked}
                style={{
                  aspectRatio: '1',
                  borderRadius: '50%',
                  padding: '12px',
                  flexDirection: 'column',
                  gap: '6px',
                  borderColor: border,
                  opacity: isUnlocked ? 0.88 : 1,
                  cursor: isUnlocked ? 'default' : 'pointer',
                  width: '100%',
                }}
                onClick={() => {
                  if (!isUnlocked) onItemActivate(itemId);
                }}
              >
                <span className="action-icon" style={iconStyle}>
                  {def.icon}
                </span>
                {labelEl}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
