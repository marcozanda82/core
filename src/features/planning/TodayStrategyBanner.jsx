import React from 'react';

const ACTIVITY_TYPES = {
  WORKOUT: { label: 'Pesi / Ipertrofia', icon: '🏋️', color: '#ef4444' },
  CARDIO: { label: 'Cardio & Resistenza', icon: '🏃', color: '#f97316' },
  RECOVERY: { label: 'Recupero Attivo', icon: '🧘', color: '#3b82f6' },
  REST: { label: 'Riposo Strategico', icon: '🛌', color: '#10b981' }
};

const DAYS_MAP = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];

export default function TodayStrategyBanner({ strategicPlan, onOpenPlanner }) {
  if (!strategicPlan) return null;

  const todayStr = DAYS_MAP[new Date().getDay()];
  const todayPlan = strategicPlan.days?.[todayStr];

  // Se per oggi non c'è nulla pianificato, non mostriamo il banner per non ingombrare la UI
  if (!todayPlan) return null; 

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
      {todayPlan.hour && (
        <div style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 'bold', backgroundColor: '#0f172a', padding: '6px 10px', borderRadius: '8px' }}>
          {todayPlan.hour}
        </div>
      )}
    </div>
  );
}
