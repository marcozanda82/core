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
        aria-hidden={!isDrawerOpen}
      >
        {isDrawerOpen ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi menu"
            className="fixed top-4 right-4 z-[100000] flex h-10 w-10 items-center justify-center rounded-full border border-slate-600/80 bg-slate-900/90 text-lg text-slate-300 shadow-lg backdrop-blur-sm transition-colors hover:border-slate-500 hover:text-white"
            style={{ top: 'max(1rem, env(safe-area-inset-top))', right: 'max(1rem, env(safe-area-inset-right))' }}
          >
            ✕
          </button>
        ) : null}
        <div className="min-h-full flex flex-col pt-14 pb-24 px-2">
          {children}
        </div>
      </div>
    </>
  );
}
