/**
 * Griglia «Aggiungi evento»: long-press (800ms) su un’icona → modalità riordino;
 * trascina e rilascia su un’altra cella per scambiare; salvataggio immediato su localStorage (via onOrderCommit).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ADD_EVENT_MENU_ITEMS } from '../coreEngine';

const HOLD_MS = 800;
const MOVE_CANCEL_PX = 14;

export default function AddEventMenuGrid({ menuOrder, onOrderCommit, onItemActivate, title = 'AGGIUNGI EVENTO', headingStyle = {} }) {
  const cellRefs = useRef([]);
  const holdTimerRef = useRef(null);
  const dragActiveRef = useRef(false);
  const pressStartRef = useRef({ x: 0, y: 0, idx: null });
  const suppressClickRef = useRef(false);
  const menuOrderRef = useRef(menuOrder);
  menuOrderRef.current = menuOrder;
  const dragSourceIdxRef = useRef(null);

  const [dragFromIdx, setDragFromIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [dragDelta, setDragDelta] = useState({ dx: 0, dy: 0 });

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current != null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const endDragMode = useCallback(() => {
    clearHoldTimer();
    dragActiveRef.current = false;
    dragSourceIdxRef.current = null;
    setDragFromIdx(null);
    setDragOverIdx(null);
    setDragDelta({ dx: 0, dy: 0 });
    pressStartRef.current = { x: 0, y: 0, idx: null };
  }, [clearHoldTimer]);

  const pickIndexUnderPoint = useCallback((clientX, clientY) => {
    let found = null;
    cellRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        found = i;
      }
    });
    return found;
  }, []);

  const onDocPointerMove = useCallback(
    (e) => {
      if (!dragActiveRef.current || dragSourceIdxRef.current == null) return;
      const { x, y } = pressStartRef.current;
      setDragDelta({ dx: e.clientX - x, dy: e.clientY - y });
      const over = pickIndexUnderPoint(e.clientX, e.clientY);
      setDragOverIdx(over);
    },
    [pickIndexUnderPoint]
  );

  const onDocPointerUp = useCallback(
    (e) => {
      if (!dragActiveRef.current) {
        clearHoldTimer();
        return;
      }
      const from = dragSourceIdxRef.current;
      const over = pickIndexUnderPoint(e.clientX, e.clientY);
      if (from != null && over != null && from !== over) {
        const next = [...menuOrderRef.current];
        [next[from], next[over]] = [next[over], next[from]];
        onOrderCommit(next);
        suppressClickRef.current = true;
      }
      endDragMode();
      window.removeEventListener('pointermove', onDocPointerMove);
      window.removeEventListener('pointerup', onDocPointerUp);
      window.removeEventListener('pointercancel', onDocPointerUp);
    },
    [onOrderCommit, pickIndexUnderPoint, onDocPointerMove, endDragMode, clearHoldTimer]
  );

  useEffect(() => () => clearHoldTimer(), [clearHoldTimer]);

  const handleCellPointerDown = (e, idx) => {
    if (e.button !== undefined && e.button !== 0) return;
    pressStartRef.current = { x: e.clientX, y: e.clientY, idx };
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      dragActiveRef.current = true;
      dragSourceIdxRef.current = idx;
      setDragFromIdx(idx);
      setDragOverIdx(idx);
      setDragDelta({ dx: 0, dy: 0 });
      window.addEventListener('pointermove', onDocPointerMove);
      window.addEventListener('pointerup', onDocPointerUp);
      window.addEventListener('pointercancel', onDocPointerUp);
    }, HOLD_MS);
  };

  const handleCellPointerMove = (e) => {
    if (holdTimerRef.current == null) return;
    const dx = e.clientX - pressStartRef.current.x;
    const dy = e.clientY - pressStartRef.current.y;
    if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
      clearHoldTimer();
    }
  };

  const handleCellPointerUp = () => {
    if (dragActiveRef.current) return;
    clearHoldTimer();
  };

  const handleCellClick = (itemId) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (dragActiveRef.current) return;
    onItemActivate(itemId);
  };

  const reorderActive = dragFromIdx != null;

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
      </div>

      <div
        className={reorderActive ? 'add-event-menu-wiggle' : ''}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 8,
          touchAction: reorderActive ? 'none' : 'manipulation',
        }}
      >
        {menuOrder.map((itemId, idx) => {
          const def = ADD_EVENT_MENU_ITEMS[itemId];
          if (!def) return null;
          const border = def.borderColor || undefined;
          const labelColor = def.labelColor || '#fff';
          const iconStyle = def.iconFilter ? { fontSize: '1.8rem', filter: def.iconFilter } : { fontSize: '1.8rem' };
          const isDragging = reorderActive && dragFromIdx === idx;
          const isDrop = reorderActive && dragOverIdx === idx && dragFromIdx !== idx;

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
              ref={(el) => {
                cellRefs.current[idx] = el;
              }}
              style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                minWidth: 0,
                overflow: 'visible',
                outline: isDrop ? '2px dashed rgba(0, 229, 255, 0.75)' : 'none',
                outlineOffset: 2,
                borderRadius: 12,
              }}
            >
              <button
                type="button"
                className={`action-btn${isDragging ? ' add-event-menu-cell-dragging' : ''}`}
                style={{
                  aspectRatio: '1',
                  borderRadius: '50%',
                  padding: '12px',
                  flexDirection: 'column',
                  gap: '6px',
                  borderColor: border,
                  width: '100%',
                  cursor: reorderActive ? 'grabbing' : 'pointer',
                  transform: isDragging ? `translate(${dragDelta.dx}px, ${dragDelta.dy}px) scale(1.1)` : undefined,
                  opacity: isDragging ? 0.82 : 1,
                  zIndex: isDragging ? 20 : 1,
                  transition: isDragging ? 'none' : 'transform 0.15s ease, opacity 0.15s ease',
                }}
                onPointerDown={(e) => handleCellPointerDown(e, idx)}
                onPointerMove={handleCellPointerMove}
                onPointerUp={handleCellPointerUp}
                onPointerCancel={handleCellPointerUp}
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
