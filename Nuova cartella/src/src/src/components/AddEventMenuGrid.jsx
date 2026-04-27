/**
 * Griglia «Aggiungi evento»: long-press / contesto → modalità riordino (jiggle);
 * scambio a due tocchi; salvataggio su localStorage tramite onOrderCommit.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  const menuCells = useMemo(() => {
    const items = menuOrder.map((itemId, sourceIndex) => ({ itemId, sourceIndex }));
    const mealEntry = items.find((entry) => entry.itemId === 'meal') || null;
    if (!mealEntry) return items.map((entry, displayIndex) => ({ ...entry, displayIndex, isPrimary: false }));

    const totalCells = Math.max(items.length, 9);
    const rows = Math.max(1, Math.ceil(totalCells / 3));
    const centerRow = Math.min(rows - 1, Math.floor(rows / 2));
    const centerIndex = centerRow * 3 + 1;
    const cells = Array.from({ length: totalCells }, () => null);
    cells[centerIndex] = { ...mealEntry, isPrimary: true };

    let writeIndex = 0;
    for (const entry of items) {
      if (entry.itemId === 'meal') continue;
      while (writeIndex < cells.length && cells[writeIndex]) writeIndex += 1;
      if (writeIndex >= cells.length) break;
      cells[writeIndex] = { ...entry, isPrimary: false };
      writeIndex += 1;
    }

    return cells.map((cell, displayIndex) => (cell ? { ...cell, displayIndex } : { itemId: null, sourceIndex: null, displayIndex, isSpacer: true }));
  }, [menuOrder]);

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
        {menuCells.map((cell) => {
          if (cell.isSpacer) {
            return <div key={`spacer-${cell.displayIndex}`} aria-hidden="true" style={{ minHeight: 0 }} />;
          }

          const { itemId, sourceIndex, isPrimary } = cell;
          const def = ADD_EVENT_MENU_ITEMS[itemId];
          if (!def) return null;
          const border = def.borderColor || undefined;
          const labelColor = def.labelColor || '#fff';
          const iconStyle = def.iconFilter ? { fontSize: isPrimary ? '2rem' : '1.8rem', filter: def.iconFilter } : { fontSize: isPrimary ? '2rem' : '1.8rem' };
          const isSelected = isEditMode && selectedSwapIndex === sourceIndex;
          const primaryLabel = '🍝 Inserisci pasto';

          const labelEl =
            isPrimary ? (
              <span className="action-label action-label--primary" style={{ color: '#f8fbff' }}>
                {primaryLabel}
              </span>
            ) : def.labelLines && String(def.label).includes(' ') ? (
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
                padding: isPrimary ? '6px' : 0,
              }}
            >
              <button
                type="button"
                className={`action-btn${isEditMode ? ' jiggle' : ''}${isPrimary ? ' action-btn--primary' : ''}`}
                style={{
                  aspectRatio: '1',
                  borderRadius: '50%',
                  padding: isPrimary ? '16px' : '12px',
                  flexDirection: 'column',
                  gap: isPrimary ? '8px' : '6px',
                  borderColor: border,
                  width: isPrimary ? '115%' : '100%',
                  cursor: 'pointer',
                  zIndex: 1,
                  justifySelf: isPrimary ? 'center' : undefined,
                  alignSelf: isPrimary ? 'center' : undefined,
                  transform: isPrimary ? 'translateY(8px)' : undefined,
                  boxShadow: isSelected ? '0 0 0 2px rgba(0, 229, 255, 0.95), 0 0 18px rgba(0, 229, 255, 0.35)' : undefined,
                  background: isSelected ? 'rgba(0, 229, 255, 0.12)' : undefined,
                }}
                onContextMenu={onIconContextMenu}
                onPointerDown={onCellPointerDown}
                onPointerMove={onCellPointerMove}
                onPointerUp={onCellPointerUp}
                onPointerCancel={onCellPointerUp}
                onClick={() => handleCellActivate(itemId, sourceIndex)}
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
