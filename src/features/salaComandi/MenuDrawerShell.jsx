import React from 'react';

export default function MenuDrawerShell({ isDrawerOpen, onClose, children }) {
  return (
    <>
      <div className={`drawer-overlay ${isDrawerOpen ? 'open' : ''}`} onClick={onClose} />
      <div className={`drawer-content ${isDrawerOpen ? 'open' : ''}`}>
        <div
          style={{
            width: '40px',
            height: '4px',
            backgroundColor: '#444',
            borderRadius: '2px',
            margin: '0 auto 20px auto',
          }}
        />
        {children}
      </div>
    </>
  );
}
