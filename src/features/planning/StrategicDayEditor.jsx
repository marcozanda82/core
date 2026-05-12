import React, { useState, useEffect } from 'react';

const ACTIVITY_TYPES = [
  { id: 'WORKOUT', label: 'Pesi / Ipertrofia', icon: '🏋️' },
  { id: 'CARDIO', label: 'Cardio & Resistenza', icon: '🏃' },
  { id: 'RECOVERY', label: 'Recupero Attivo', icon: '🧘' },
  { id: 'REST', label: 'Riposo Strategico', icon: '🛌' }
];

const MUSCLE_GROUPS = ['Petto', 'Schiena', 'Gambe', 'Spalle', 'Bicipiti', 'Tricipiti', 'ABS'];

export default function StrategicDayEditor({ dayKey, initialData, onSave, onClose }) {
  const [type, setType] = useState('WORKOUT');
  const [focus, setFocus] = useState([]);
  const [hour, setHour] = useState('18:00');

  useEffect(() => {
    if (initialData) {
      setType(initialData.type || 'WORKOUT');
      setFocus(initialData.focus || []);
      setHour(initialData.hour || '18:00');
    } else {
      setType('WORKOUT');
      setFocus([]);
      setHour('18:00');
    }
  }, [initialData]);

  const toggleMuscleGroup = (group) => {
    setFocus(prev => prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]);
  };

  const handleSave = () => {
    onSave({ type, focus: type === 'WORKOUT' ? focus : [], hour });
  };

  const handleClear = () => {
    onSave(null); // Rimuove la pianificazione per questo giorno
  };

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h3 style={{ margin: 0, textTransform: 'capitalize', color: '#fff' }}>Pianifica {dayKey}</h3>
          <button onClick={onClose} style={styles.iconBtn}>✕</button>
        </div>

        <div style={styles.content}>
          {/* TIPO ATTIVITA */}
          <label style={styles.label}>Tipo di Attività</label>
          <div style={styles.typeGrid}>
            {ACTIVITY_TYPES.map(act => (
              <div 
                key={act.id} 
                onClick={() => setType(act.id)}
                style={{
                  ...styles.typeCard,
                  borderColor: type === act.id ? '#deff9a' : '#334155',
                  backgroundColor: type === act.id ? 'rgba(222, 255, 154, 0.1)' : '#1e293b'
                }}
              >
                <span style={{ fontSize: '24px' }}>{act.icon}</span>
                <span style={{ fontSize: '12px', color: '#f5f5f5', textAlign: 'center', marginTop: '4px' }}>{act.label}</span>
              </div>
            ))}
          </div>

          {/* FOCUS MUSCOLARE (Solo se WORKOUT) */}
          {type === 'WORKOUT' && (
            <div style={{ marginTop: '20px' }}>
              <label style={styles.label}>Focus Muscolare</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {MUSCLE_GROUPS.map(group => {
                  const isSelected = focus.includes(group);
                  return (
                    <button
                      key={group}
                      onClick={() => toggleMuscleGroup(group)}
                      style={{
                        ...styles.pillBtn,
                        backgroundColor: isSelected ? '#deff9a' : '#1e293b',
                        color: isSelected ? '#000' : '#cbd5e1',
                      }}
                    >
                      {group}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ORARIO */}
          <div style={{ marginTop: '20px' }}>
            <label style={styles.label}>Orario Previsto</label>
            <input 
              type="time" 
              value={hour} 
              onChange={(e) => setHour(e.target.value)} 
              style={styles.timeInput} 
            />
          </div>
        </div>

        {/* AZIONI */}
        <div style={styles.footer}>
          <button onClick={handleClear} style={{ ...styles.actionBtn, backgroundColor: '#ef4444' }}>Azzera</button>
          <button onClick={handleSave} style={{ ...styles.actionBtn, backgroundColor: '#deff9a', color: '#000', flex: 1 }}>Salva Giornata</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 10, display: 'flex', alignItems: 'flex-end' },
  modal: { backgroundColor: '#0f172a', width: '100%', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '20px', borderTop: '1px solid #334155' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' },
  iconBtn: { background: 'none', border: 'none', color: '#fff', fontSize: '20px', cursor: 'pointer' },
  content: { marginBottom: '24px' },
  label: { display: 'block', color: '#94a3b8', fontSize: '14px', marginBottom: '8px', fontWeight: '500' },
  typeGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' },
  typeCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px', borderRadius: '12px', border: '1px solid', cursor: 'pointer', transition: 'all 0.2s' },
  pillBtn: { border: '1px solid #334155', borderRadius: '20px', padding: '6px 12px', fontSize: '14px', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s' },
  timeInput: { width: '100%', backgroundColor: '#1e293b', color: '#fff', border: '1px solid #334155', borderRadius: '8px', padding: '12px', fontSize: '16px', outline: 'none' },
  footer: { display: 'flex', gap: '12px' },
  actionBtn: { padding: '14px', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }
};
