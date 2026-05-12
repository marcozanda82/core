import React from 'react';

const ACTIVITY_TYPES = {
  WORKOUT: { label: 'Pesi / Ipertrofia', icon: '🏋️', color: '#ef4444' },
  CARDIO: { label: 'Cardio & Resistenza', icon: '🏃', color: '#f97316' },
  RECOVERY: { label: 'Recupero Attivo', icon: '🧘', color: '#3b82f6' },
  REST: { label: 'Riposo Strategico', icon: '🛌', color: '#10b981' }
};

const DAYS_MAP = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];

export default function TodayStrategyBanner({ strategicPlan, currentProfile, onSyncProfile, onOpenPlanner }) {
  if (!strategicPlan) return null;

  const todayStr = DAYS_MAP[new Date().getDay()];
  const todayPlan = strategicPlan.days?.[todayStr];

  // Se per oggi non c'è nulla pianificato, non mostriamo il banner per non ingombrare la UI
  if (!todayPlan) return null;

  // Traduce la pianificazione strategica nei vecchi profili del motore calorico
  const deriveProfileFromPlan = (plan) => {
    if (!plan) return null;
    if (plan.type === 'REST' || plan.type === 'RECOVERY' || plan.type === 'CARDIO') return 'riposo';
    if (plan.type === 'WORKOUT') {
      if (plan.focus && plan.focus.includes('Gambe')) return 'gambe';
      return 'upper'; // Default per gli altri workout pesi (Petto, Schiena, ecc.)
    }
    return null;
  };

  const targetProfile = deriveProfileFromPlan(todayPlan);
  const isOutOfSync = targetProfile && currentProfile && targetProfile !== currentProfile;

  const actType = ACTIVITY_TYPES[todayPlan.type];

  return (
    <div 
      onClick={onOpenPlanner}
      style={{
        margin: '12px 16px', // Margini per allinearsi con il resto della UI mobile
        padding: '14px 16px',
        backgroundColor: '#1e293b', 
        borderRadius: '16px',
        borderLeft: `4px solid ${actType ? actType.color : '#334155'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontSize: '26px' }}>{actType?.icon}</div>
        <div>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 'bold' }}>
            Strategia di Oggi
          </div>
          <div style={{ color: '#fff', fontSize: '15px', fontWeight: '600', marginTop: '2px' }}>
            {actType?.label} 
            {todayPlan.focus && todayPlan.focus.length > 0 && (
              <span style={{ color: '#cbd5e1', fontWeight: '400' }}> • {todayPlan.focus.join(', ')}</span>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {isOutOfSync && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSyncProfile?.(targetProfile);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#00e5ff',
              color: '#000',
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 0 12px rgba(0, 229, 255, 0.35)',
            }}
          >
            Allinea profilo
          </button>
        )}
        {todayPlan.hour && (
          <div style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 'bold', backgroundColor: '#0f172a', padding: '6px 10px', borderRadius: '8px' }}>
            {todayPlan.hour}
          </div>
        )}
      </div>
    </div>
  );
}
