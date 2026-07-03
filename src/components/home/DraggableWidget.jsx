import React, { useCallback, useRef } from 'react';

export default function DraggableWidget({
  id,
  isEditMode,
  visible = true,
  x = 0,
  y = 0,
  onMove,
  onHide,
  children,
  style,
  className,
}) {
  const dragStateRef = useRef(null);

  const handlePointerDown = useCallback(
    (e) => {
      if (!isEditMode || typeof onMove !== 'function') return;
      if (e.target.closest('[data-draggable-delete]')) return;

      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);

      dragStateRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: x,
        origY: y,
      };
    },
    [isEditMode, onMove, x, y]
  );

  const handlePointerMove = useCallback(
    (e) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== e.pointerId) return;

      e.preventDefault();
      onMove(id, state.origX + e.clientX - state.startX, state.origY + e.clientY - state.startY);
    },
    [id, onMove]
  );

  const handlePointerUp = useCallback((e) => {
    const state = dragStateRef.current;
    if (!state || state.pointerId !== e.pointerId) return;

    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStateRef.current = null;
  }, []);

  const handleDeleteClick = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      onHide?.(id);
    },
    [id, onHide]
  );

  if (visible === false) {
    return null;
  }

  if (!isEditMode) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={className}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        border: '2px dashed rgba(251, 191, 36, 0.85)',
        borderRadius: 8,
        boxSizing: 'border-box',
        cursor: 'grab',
        zIndex: 30,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...style,
      }}
    >
      <button
        type="button"
        data-draggable-delete
        aria-label={`Nascondi widget ${id}`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={handleDeleteClick}
        style={{
          position: 'absolute',
          top: -10,
          right: -10,
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: '1px solid rgba(248, 113, 113, 0.8)',
          background: 'rgba(127, 29, 29, 0.95)',
          color: '#fecaca',
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1,
          cursor: 'pointer',
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          touchAction: 'manipulation',
        }}
      >
        ×
      </button>
      <span
        style={{
          position: 'absolute',
          top: -18,
          left: 0,
          fontSize: 10,
          color: '#fbbf24',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {id}
      </span>
      <div style={{ pointerEvents: 'none' }}>{children}</div>
    </div>
  );
}
