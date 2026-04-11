/**
 * Griglia «Aggiungi evento»: long-press / contesto → modalità riordino (jiggle);
 * scambio a due tocchi; salvataggio su localStorage tramite onOrderCommit.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ADD_EVENT_MENU_ITEMS } from '../coreEngine';

const HOLD_MS = 500;
const MOVE_CANCEL_PX = 14;

export default function AddEventMenuGrid({ menuOrder, onOrderCommit, onItemActivate, title = 'AGGIUNGI EVENTO', headingStyle = {} }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedSwapIndex, setSelectedSwapIndex] = useState(null);
  const holdTimerRef = useRef(null);
  const pressStartRef = useRef({ x: 0, y: 0 });

  const clearHold = useCallback(() => {
    if (holdTimerRef.current != null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearHold(), [clearHold]);

  useEffect(() => {
    if (!isEditMode) setSelectedSwapIndex(null);
  }, [isEditMode]);

  const enterEditMode = useCallback(
    (e) => {
      e?.preventDefault?.();
      clearHold();
      setIsEditMode(true);
    },
    [clearHold]
  );

  const onIconContextMenu = useCallback(
    (e) => {
      e.preventDefault();
      enterEditMode(e);
    },
    [enterEditMode]
  );

  const onCellPointerDown = useCallback(
    (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      pressStartRef.current = { x: e.clientX, y: e.clientY };
      clearHold();
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        setIsEditMode(true);
      }, HOLD_MS);
    },
    [clearHold]
  );

  const onCellPointerMove = useCallback(
    (e) => {
      if (holdTimerRef.current == null) return;
      const dx = e.clientX - pressStartRef.current.x;
      const dy = e.clientY - pressStartRef.current.y;
      if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) clearHold();
    },
    [clearHold]
  );

  const onCellPointerUp = useCallback(() => {
    clearHold();
  }, [clearHold]);

  const handleCellActivate = useCallback(
    (itemId, idx) => {
      if (isEditMode) {
        if (selectedSwapIndex == null) {
          setSelectedSwapIndex(idx);
          return;
        }
        if (selectedSwapIndex === idx) {
          setSelectedSwapIndex(null);
          return;
        }
        const next = [...menuOrder];
        [next[selectedSwapIndex], next[idx]] = [next[idx], next[selectedSwapIndex]];
        onOrderCommit(next);
        setSelectedSwapIndex(null);
        return;
      }
      onItemActivate(itemId);
    },
    [isEditMode, selectedSwapIndex, menuOrder, onOrderCommit, onItemActivate]
  );

  const fineBtnStyle = {
    flexShrink: 0,
    padding: '8px 16px',
    borderRadius: 10,
    border: 'none',
    background: 'linear-gradient(135deg, #00e5ff 0%, #7c3aed 100%)',
    color: '#0a0a0a',
    fontWeight: 800,
    fontSize: '0.72rem',
    letterSpacing: '0.04em',
    cursor: 'pointer',
    boxShadow: '0 0 18px rgba(0, 229, 255, 0.35), 0 4px 12px rgba(124, 58, 237, 0.2)',
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 10,
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
        {isEditMode ? (
          <button
            type="button"
            onClick={() => {
              setIsEditMode(false);
              setSelectedSwapIndex(null);
            }}
            style={fineBtnStyle}
          >
            Fine
          </button>
        ) : null}
      </div>
      {isEditMode ? (
        <p
          style={{
            margin: '0 0 14px 0',
            fontSize: '0.72rem',
            color: 'rgba(0, 229, 255, 0.85)',
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
        >
          Tocca due icone per scambiarle
        </p>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 8,
          touchAction: 'manipulation',
        }}
      >
        {menuOrder.map((itemId, idx) => {
          const def = ADD_EVENT_MENU_ITEMS[itemId];
          if (!def) return null;
          const border = def.borderColor || undefined;
          const labelColor = def.labelColor || '#fff';
          const iconStyle = def.iconFilter ? { fontSize: '1.8rem', filter: def.iconFilter } : { fontSize: '1.8rem' };
          const isSelected = isEditMode && selectedSwapIndex === idx;

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
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                minWidth: 0,
                overflow: 'visible',
                borderRadius: 12,
              }}
            >
              <button
                type="button"
                className={`action-btn${isEditMode ? ' jiggle' : ''}`}
                style={{
                  aspectRatio: '1',
                  borderRadius: '50%',
                  padding: '12px',
                  flexDirection: 'column',
                  gap: '6px',
                  borderColor: border,
                  width: '100%',
                  cursor: 'pointer',
                  zIndex: 1,
                  boxShadow: isSelected ? '0 0 0 2px rgba(0, 229, 255, 0.95), 0 0 18px rgba(0, 229, 255, 0.35)' : undefined,
                  background: isSelected ? 'rgba(0, 229, 255, 0.12)' : undefined,
                }}
                onContextMenu={onIconContextMenu}
                onPointerDown={onCellPointerDown}
                onPointerMove={onCellPointerMove}
                onPointerUp={onCellPointerUp}
                onPointerCancel={onCellPointerUp}
                onClick={() => handleCellActivate(itemId, idx)}
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
