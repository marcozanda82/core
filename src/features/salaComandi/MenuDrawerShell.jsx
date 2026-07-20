import React from 'react';

export default function MenuDrawerShell({ isDrawerOpen, onClose, children }) {
  return (
    <>
      {/* Backdrop sempre nel DOM: opacity + pointer-events (GPU-friendly) */}
      <div
        className={`drawer-overlay ${isDrawerOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden={!isDrawerOpen}
      />
      <div
        className={`drawer-content ${isDrawerOpen ? 'open' : ''}`}
        style={{ overflow: 'hidden' }}
      >
        <div
          style={{
            width: '40px',
            height: '4px',
            backgroundColor: '#444',
            borderRadius: '2px',
            margin: '0 auto 20px auto',
            flexShrink: 0,
          }}
        />
        <div
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
