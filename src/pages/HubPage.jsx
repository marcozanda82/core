import React from 'react';

const HUB_SEGMENTS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'strumenti', label: 'Strumenti' },
];

/**
 * Pagina Hub (`/hub` e slot bottom-nav): solo chrome a schede.
 * Timeline e Strumenti restano componenti esterni passati come slot.
 */
export default function HubPage({
  activeTab = 'timeline',
  onTabChange,
  timeline = null,
  strumenti = null,
}) {
  const current = activeTab === 'strumenti' ? 'strumenti' : 'timeline';

  return (
    <div
      className="hub-page-root"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <header className="hub-page-header relative z-30 shrink-0 bg-zinc-950/90 px-3 pb-2 pt-2 backdrop-blur-md">
        <div
          className="trend-hub-hemisphere-segmented hub-page-segmented"
          role="tablist"
          aria-label="Hub Timeline o Strumenti"
        >
          {HUB_SEGMENTS.map(({ id, label }) => {
            const selected = current === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`trend-hub-hemisphere-segment${selected ? ' trend-hub-hemisphere-segment--active' : ''}`}
                onClick={() => onTabChange?.(id)}
              >
                {label}
              </button>
            );
          })}
        </div>
      </header>

      <div
        className="hub-page-body"
        role="tabpanel"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {current === 'timeline' ? timeline : strumenti}
      </div>
    </div>
  );
}
