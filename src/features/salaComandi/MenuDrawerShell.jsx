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
            className="absolute right-4 z-[100000] flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-600/80 bg-slate-900/90 text-lg text-slate-300 shadow-lg backdrop-blur-sm transition-colors hover:border-slate-500 hover:text-white"
            style={{ top: 'max(1rem, env(safe-area-inset-top, 0px))' }}
          >
            ✕
          </button>
        ) : null}
        {/* Flex column vincolato all'altezza del drawer: le viste figlie scrollano internamente */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pt-14 pb-4">
          {children}
        </div>
      </div>
    </>
  );
}
