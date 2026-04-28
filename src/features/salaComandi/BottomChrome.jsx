import React from 'react';

export default function BottomChrome({
  kentuChatNotificationBadge,
  setActiveAction,
  setIsDrawerOpen,
  isFabOpen,
  trackEventUsage,
  handleAddEventMenuItem,
  setIsFabOpen,
  mostUsedEventButtons,
  setShowChoiceModal,
  BOTTOM_NAV_ITEMS,
  handleBottomNavTabSelect,
  activeBottomTab,
}) {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: 'calc(75px + env(safe-area-inset-bottom, 0px))',
          left: 0,
          right: 0,
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          paddingTop: '16px',
          paddingBottom: '16px',
          paddingLeft: '15px',
          paddingRight: '15px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.95) 0%, #0a0a0a 100%)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 9998,
          boxSizing: 'border-box',
        }}
      >
        <div
          onClick={() => {
            setActiveAction('ai_chat');
            setIsDrawerOpen(true);
          }}
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: '#1a1a1a',
            borderRadius: '30px',
            padding: '12px 20px',
            border: '1px solid #333',
            cursor: 'pointer',
          }}
        >
          {kentuChatNotificationBadge ? (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: 8,
                right: 14,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#f59e0b',
                boxShadow: '0 0 10px rgba(245, 158, 11, 0.7)',
                pointerEvents: 'none',
              }}
            />
          ) : null}
          <img
            src="/nuova-icona.png"
            alt=""
            className="action-icon-img action-icon-img-fab"
            width={22}
            height={22}
            decoding="async"
          />
          <span style={{ color: '#888', fontSize: '0.95rem' }}>Chiedi a Kentu...</span>
        </div>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          {isFabOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '120%',
                right: 0,
                background: 'rgba(25, 25, 28, 0.75)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                zIndex: 1000,
                alignItems: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  trackEventUsage('pasto');
                  handleAddEventMenuItem('meal', 'floating_stack');
                  setIsFabOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '180px',
                  padding: '12px 16px',
                  borderRadius: '14px',
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  background: 'rgba(0, 229, 255, 0.15)',
                  color: '#00e5ff',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                aria-label="Inserisci pasto"
              >
                <span aria-hidden>🍽️</span>
                <span>Inserisci Pasto</span>
              </button>

              {mostUsedEventButtons.map((cfg) => (
                <button
                  key={cfg.id}
                  type="button"
                  onClick={() => {
                    trackEventUsage(cfg.id);
                    handleAddEventMenuItem(cfg.drawerActionId, 'floating_stack');
                    setIsFabOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '180px',
                    padding: '12px 16px',
                    borderRadius: '14px',
                    border: 'none',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: '#e5e5e5',
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  aria-label={`Aggiungi ${cfg.label}`}
                >
                  <span aria-hidden>{cfg.icon}</span>
                  <span>{cfg.label}</span>
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  setShowChoiceModal(false);
                  setIsDrawerOpen(true);
                  setActiveAction(null);
                  setIsFabOpen(false);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  width: '180px',
                  padding: '12px 16px',
                  borderRadius: '14px',
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#e5e5e5',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                aria-label="Apri menu completo inserimenti"
              >
                <span aria-hidden>⋯</span>
                <span>Altro...</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsFabOpen((prev) => !prev)}
            style={{
              width: 50,
              height: 50,
              minWidth: 50,
              background: '#222',
              color: '#00e5ff',
              border: '1px solid #333',
              borderRadius: '50%',
              fontSize: '1.8rem',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer',
              transition: '0.3s',
            }}
            aria-label={isFabOpen ? 'Chiudi menu rapido' : 'Apri menu rapido'}
          >
            {isFabOpen ? '×' : '+'}
          </button>
        </div>
      </div>

      <nav
        aria-label="Navigazione principale"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '75px',
          background: 'rgba(20, 20, 22, 0.90)',
          backdropFilter: 'blur(15px)',
          WebkitBackdropFilter: 'blur(15px)',
          borderTop: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          zIndex: 9999,
          paddingBottom: 'env(safe-area-inset-bottom)',
          boxSizing: 'border-box',
        }}
      >
        {BOTTOM_NAV_ITEMS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleBottomNavTabSelect(t.id)}
            style={{
              background: 'transparent',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              flex: '1 1 0',
              minWidth: 0,
              color: activeBottomTab === t.id ? '#00e5ff' : '#888',
              fontSize: '0.7rem',
              padding: '4px 0',
            }}
          >
            <span
              style={{
                fontSize: t.id === 'menu' ? '1.45rem' : '1.25rem',
                lineHeight: 1,
                fontWeight: t.id === 'menu' ? 700 : undefined,
              }}
              aria-hidden
            >
              {t.icon}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
