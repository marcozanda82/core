/**
 * Griglia «Aggiungi evento»: contesto o long-press (500ms) → modalità iOS-like (jiggle);
 * riordino HTML5 Drag&Drop; salvataggio su localStorage tramite onOrderCommit a ogni drop.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ADD_EVENT_MENU_ITEMS } from '../coreEngine';

const HOLD_MS = 500;
const MOVE_CANCEL_PX = 14;
const DND_MIME = 'application/x-ghostapp-add-event-idx';

export default function AddEventMenuGrid({ menuOrder, onOrderCommit, onItemActivate, title = 'AGGIUNGI EVENTO', headingStyle = {} }) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [dragFromIdx, setDragFromIdx] = useState(null);
  const holdTimerRef = useRef(null);
  const pressStartRef = useRef({ x: 0, y: 0 });

  const clearHold = useCallback(() => {
    if (holdTimerRef.current != null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearHold(), [clearHold]);

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

  const onDragStart = useCallback(
    (e, idx) => {
      if (!isEditMode) {
        e.preventDefault();
        return;
      }
      try {
        e.dataTransfer.setData(DND_MIME, String(idx));
        e.dataTransfer.effectAllowed = 'move';
      } catch {
        /* ignore */
      }
      setDragFromIdx(idx);
    },
    [isEditMode]
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      /* ignore */
    }
  }, []);

  const onDrop = useCallback(
    (e, dropIdx) => {
      e.preventDefault();
      let from = dragFromIdx;
      try {
        const raw = e.dataTransfer.getData(DND_MIME);
        const parsed = parseInt(raw, 10);
        if (Number.isFinite(parsed)) from = parsed;
      } catch {
        /* use dragFromIdx */
      }
      setDragFromIdx(null);
      if (from == null || !Number.isFinite(from) || from === dropIdx) return;
      const next = [...menuOrder];
      if (from < 0 || from >= next.length || dropIdx < 0 || dropIdx >= next.length) return;
      [next[from], next[dropIdx]] = [next[dropIdx], next[from]];
      onOrderCommit(next);
    },
    [dragFromIdx, menuOrder, onOrderCommit]
  );

  const onDragEnd = useCallback(() => {
    setDragFromIdx(null);
  }, []);

  const handleCellClick = useCallback(
    (itemId) => {
      if (isEditMode) return;
      onItemActivate(itemId);
    },
    [isEditMode, onItemActivate]
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
        {isEditMode ? (
          <button type="button" onClick={() => setIsEditMode(false)} style={fineBtnStyle}>
            Fine
          </button>
        ) : null}
      </div>

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
          const isDropHint = isEditMode && dragFromIdx != null && dragFromIdx !== idx;

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
              onDragOver={isEditMode ? onDragOver : undefined}
              onDrop={isEditMode ? (e) => onDrop(e, idx) : undefined}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                minWidth: 0,
                overflow: 'visible',
                outline: isDropHint ? '2px dashed rgba(0, 229, 255, 0.75)' : 'none',
                outlineOffset: 2,
                borderRadius: 12,
              }}
            >
              <button
                type="button"
                draggable={isEditMode}
                className={`action-btn${isEditMode ? ' jiggle' : ''}`}
                style={{
                  aspectRatio: '1',
                  borderRadius: '50%',
                  padding: '12px',
                  flexDirection: 'column',
                  gap: '6px',
                  borderColor: border,
                  width: '100%',
                  cursor: isEditMode ? 'grab' : 'pointer',
                  zIndex: 1,
                }}
                onContextMenu={onIconContextMenu}
                onPointerDown={onCellPointerDown}
                onPointerMove={onCellPointerMove}
                onPointerUp={onCellPointerUp}
                onPointerCancel={onCellPointerUp}
                onDragStart={(e) => onDragStart(e, idx)}
                onDragEnd={onDragEnd}
                onClick={() => handleCellClick(itemId)}
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
