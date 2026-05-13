import React, { useState } from 'react';

const ACTIVITY_TYPES = {
  WORKOUT: { label: 'Pesi / Ipertrofia', icon: '🏋️', color: '#ef4444' },
  CARDIO: { label: 'Cardio & Resistenza', icon: '🏃', color: '#f97316' },
  RECOVERY: { label: 'Recupero Attivo', icon: '🧘', color: '#3b82f6' },
  REST: { label: 'Riposo Strategico', icon: '🛌', color: '#10b981' }
};

const DAYS_MAP = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];

export default function TodayStrategyBanner({
  strategicPlan, currentProfile, onSyncProfile, onOpenPlanner,
  onShiftPlan, onUpdateTime, onExecute
}) {
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [tempTime, setTempTime] = useState('');

  const todayStr = DAYS_MAP[new Date().getDay()];
  const todayPlan = strategicPlan?.days?.[todayStr];

  const actType = todayPlan ? ACTIVITY_TYPES[todayPlan.type] : null;

  const handleEditTimeClick = (e) => {
    e.stopPropagation();
    setTempTime(todayPlan?.hour || '');
    setIsEditingTime(true);
  };

  const handleSaveTime = (e) => {
    e.stopPropagation();
    if (tempTime !== todayPlan.hour) {
      onUpdateTime?.(todayStr, { ...todayPlan, hour: tempTime });
    }
    setIsEditingTime(false);
  };

  if (!strategicPlan) return null;

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
        {/* ZONA ORARIO E RINVIO */}
        {isEditingTime ? (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
            <input
              type="time"
              value={tempTime}
              onChange={e => setTempTime(e.target.value)}
              style={{ backgroundColor: '#0f172a', color: '#fff', border: '1px solid #334155', borderRadius: '6px', padding: '4px' }}
            />
            <button type="button" onClick={handleSaveTime} style={{ background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px', cursor: 'pointer' }}>✓</button>
          </div>
        ) : (
          <div
            onClick={handleEditTimeClick}
            style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 'bold', backgroundColor: '#0f172a', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', display: 'flex', gap: '6px', alignItems: 'center' }}
          >
            <span>{todayPlan.hour || 'No Orario'}</span>
            <span style={{ fontSize: '10px' }}>🕒</span>
          </div>
        )}

        {/* ZONA AZIONI RAPIDE */}
        {todayPlan.type !== 'REST' && (
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onShiftPlan?.(todayStr); }}
              title="Trasla in avanti (Domino)"
              style={{ backgroundColor: '#334155', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ⏭️ Trasla
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onExecute?.(todayPlan); }}
              title="Esegui ora"
              style={{ backgroundColor: actType ? actType.color : '#deff9a', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✅ Esegui
            </button>
          </div>
        )}

        {/* ZONA SYNC MACRO */}
        {isOutOfSync && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSyncProfile?.(targetProfile); }}
            style={{
              backgroundColor: '#deff9a', color: '#000', border: 'none', borderRadius: '20px',
              padding: '6px 12px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(222, 255, 154, 0.2)', display: 'flex', alignItems: 'center', gap: '4px'
            }}
          >
            <span>⚡</span> Sync Macro
          </button>
        )}
      </div>
    </div>
  );
}
