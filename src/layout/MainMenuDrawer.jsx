import React from 'react';
import AddEventMenuGrid from '../components/AddEventMenuGrid';

/**
 * Viste iniziali del cassetto: griglia eventi, menu secondario (link), protocollo calorico.
 */
export default function MainMenuDrawer({
  activeAction,
  setActiveAction,
  addEventMenuOrder,
  commitAddEventMenuOrder,
  handleAddEventMenuItem,
  processTestoAI,
  setShowReport,
  closeDrawer,
  setShowProfile,
  kentuChatNotificationBadge,
  calorieTuning,
  setCalorieTuning,
  onOpenStrategicPlanner,
  onOpenProgressi,
  onOpenTacticalCoach,
}) {
  return (
    <>
      {(!activeAction || activeAction === 'home') && (
        <div className="view-animate">
          <AddEventMenuGrid
            menuOrder={addEventMenuOrder}
            onOrderCommit={commitAddEventMenuOrder}
            onItemActivate={(id) => handleAddEventMenuItem(id, 'drawer')}
          />
          <div style={{ padding: '15px', background: '#1e1e1e', borderRadius: '12px', marginTop: '0' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#fff', fontSize: '0.8rem' }}>⚡ Inserimento Rapido / Output AI</h4>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                id="fast-ai-input"
                placeholder="Es: [Pollo | 150 | pranzo] oppure incolla qui la risposta AI"
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #444', background: '#000', color: '#fff', fontSize: '0.85rem' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    processTestoAI(e.target.value);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('fast-ai-input');
                  if (input) {
                    processTestoAI(input.value);
                    input.value = '';
                  }
                }}
                style={{ background: '#00e5ff', color: '#000', border: 'none', padding: '0 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Invia
              </button>
            </div>
          </div>
        </div>
      )}

      {activeAction === 'menu_secondary' && (
        <div className="view-animate">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <button type="button" onClick={() => setActiveAction(null)} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
            <h2 style={{ fontSize: '0.8rem', color: '#b0bec5', letterSpacing: '2px', margin: 0 }}>☰ MENU</h2>
            <div style={{ width: '70px' }}></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <button type="button" className="action-btn" onClick={() => setActiveAction('storico')}><span className="action-icon" style={{ filter: 'drop-shadow(0 0 8px rgba(176, 190, 197, 0.5))' }}>📚</span><span className="action-label" style={{ color: '#b0bec5' }}>Archivio Storico</span></button>
            <button type="button" className="action-btn" onClick={() => { setShowReport(true); setActiveAction(null); closeDrawer(); }}><span className="action-icon">📊</span><span className="action-label">Report</span></button>
            <button type="button" className="action-btn" onClick={() => { setShowProfile(true); setActiveAction(null); closeDrawer(); }}><span className="action-icon">⚙️</span><span className="action-label">Profilo & Target</span></button>
            <button type="button" className="action-btn" onClick={() => { onOpenStrategicPlanner?.(); setActiveAction(null); closeDrawer(); }}><span className="action-icon" style={{ filter: 'drop-shadow(0 0 8px rgba(0, 229, 255, 0.4))' }}>🎯</span><span className="action-label" style={{ color: '#00e5ff' }}>Protocollo</span></button>
            <button type="button" className="action-btn" onClick={() => { onOpenProgressi?.(); setActiveAction(null); closeDrawer(); }}><span className="action-icon" style={{ filter: 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.45))' }}>📈</span><span className="action-label" style={{ color: '#86efac' }}>Progressi</span></button>
            <button type="button" className="action-btn" onClick={() => { onOpenTacticalCoach?.(); setActiveAction(null); closeDrawer(); }}><span className="action-icon" style={{ filter: 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.5))' }}>🤖</span><span className="action-label" style={{ color: '#a5b4fc' }}>Navigatore Tattico</span></button>
            <button type="button" className="action-btn" onClick={() => setActiveAction('focus')}><img src="/icon-neural-128.png" alt="" className="action-icon-img action-icon-img-lg" style={{ filter: 'drop-shadow(0 0 8px rgba(251, 192, 45, 0.45))' }} width={29} height={29} decoding="async" /><span className="action-label" style={{ color: '#fbc02d' }}>Neural Reset</span></button>
            {import.meta.env.DEV ? (
              <button type="button" className="action-btn" onClick={() => setActiveAction('api_diary')}>
                <span className="action-icon" style={{ filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.45))' }}>📟</span>
                <span className="action-label" style={{ color: '#fbbf24' }}>Diario API</span>
              </button>
            ) : null}
            <button type="button" className="action-btn" onClick={() => setActiveAction('ai_chat')} style={{ position: 'relative', background: 'linear-gradient(145deg, rgba(26, 26, 36, 0.9), rgba(18, 16, 28, 0.9))', borderColor: '#3a2a4a' }}>
              {kentuChatNotificationBadge ? (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 8,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: '#f59e0b',
                    boxShadow: '0 0 8px rgba(245, 158, 11, 0.65)',
                    zIndex: 2,
                  }}
                />
              ) : null}
              <img src="/nuova-icona.png" alt="" className="action-icon-img action-icon-img-lg" style={{ filter: 'drop-shadow(0 0 10px rgba(179, 136, 255, 0.45))' }} width={29} height={29} decoding="async" /><span className="action-label" style={{ color: '#b388ff' }}>Kentu</span>
            </button>
          </div>
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: '1px solid rgba(148, 163, 184, 0.22)',
            }}
          >
            <button
              type="button"
              className="action-btn"
              onClick={() => setActiveAction('dev_console')}
              style={{
                width: '100%',
                background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.9))',
                borderColor: '#334155',
              }}
            >
              <span className="action-icon" style={{ filter: 'drop-shadow(0 0 8px rgba(148, 163, 184, 0.45))' }}>🛠️</span>
              <span className="action-label" style={{ color: '#cbd5e1' }}>Dev Console</span>
            </button>
          </div>
        </div>
      )}

    </>
  );
}
