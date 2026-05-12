import React, { useState } from 'react';
import StrategicDayEditor from './StrategicDayEditor';

// --- COSTANTI E TASSONOMIA ---
const ACTIVITY_TYPES = {
  WORKOUT: { label: 'Pesi / Ipertrofia', icon: '🏋️', color: '#ef4444' }, // Red
  CARDIO: { label: 'Cardio & Resistenza', icon: '🏃', color: '#f97316' }, // Orange
  RECOVERY: { label: 'Recupero Attivo', icon: '🧘', color: '#3b82f6' }, // Blue
  REST: { label: 'Riposo Strategico', icon: '🛌', color: '#10b981' } // Green
};

const MUSCLE_GROUPS = ['Petto', 'Schiena', 'Gambe', 'Spalle', 'Bicipiti', 'Tricipiti', 'ABS'];

const DAYS_ORDER = ['lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato', 'domenica'];

export default function StrategicPlannerOverlay({
  isOpen,
  onClose,
  strategicPlan,
  isPlannerLoading,
  updateDayPlan,
  updateSettings,
  saveCalorieMemory,
}) {
  const [selectedDay, setSelectedDay] = useState(null); // Servirà per aprire l'editor del singolo giorno

  if (!isOpen) return null;

  const handleDeloadChange = (e) => {
    const newVal = parseInt(e.target.value, 10);
    if (!isNaN(newVal)) {
      updateSettings({ deloadFrequencyWeeks: newVal });
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.header}>
        <div>
          <h2 style={{ margin: 0, color: '#f5f5f5' }}>Settimana Strategica</h2>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: '14px' }}>
            Pianifica il carico. Organizza il riposo.
          </p>
        </div>
        <button onClick={onClose} style={styles.closeBtn}>✕</button>
      </div>

      {isPlannerLoading ? (
        <div style={{ padding: '20px', color: '#fff', textAlign: 'center' }}>Caricamento piano...</div>
      ) : (
        <div style={styles.content}>
          {/* SEZIONE IMPOSTAZIONI SCARICO */}
          <div style={styles.settingsCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>🔋</span>
              <div>
                <h4 style={{ margin: 0, color: '#fff' }}>Ciclo di Scarico (Deload)</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1' }}>Prevenzione infortuni e supercompensazione</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: '#fff', fontSize: '14px' }}>Ogni</span>
              <select 
                value={strategicPlan.settings?.deloadFrequencyWeeks || 4} 
                onChange={handleDeloadChange}
                style={styles.selectInput}
              >
                {[3, 4, 5, 6, 8].map(w => <option key={w} value={w}>{w} settimane</option>)}
              </select>
            </div>
          </div>

          {/* GRIGLIA DEI GIORNI */}
          <div style={styles.grid}>
            {DAYS_ORDER.map((dayKey) => {
              const dayData = strategicPlan.days?.[dayKey];
              const actType = dayData ? ACTIVITY_TYPES[dayData.type] : null;

              return (
                <div 
                  key={dayKey} 
                  style={{...styles.dayCard, borderColor: actType ? actType.color : '#334155'}}
                  onClick={() => setSelectedDay(dayKey)} // Preparazione per l'editor
                >
                  <div style={styles.dayHeader}>
                    <span style={{ textTransform: 'capitalize', fontWeight: 'bold', color: '#fff' }}>{dayKey}</span>
                    {actType && <span>{actType.icon}</span>}
                  </div>
                  <div style={styles.dayBody}>
                    {dayData ? (
                      <>
                        <div style={{ color: actType?.color, fontSize: '14px', fontWeight: '500' }}>
                          {actType?.label}
                        </div>
                        {dayData.focus && (
                          <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>
                            Focus: {dayData.focus.join(', ')}
                          </div>
                        )}
                        {dayData.hour && (
                          <div style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '4px' }}>
                            🕒 {dayData.hour}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ color: '#64748b', fontSize: '14px', fontStyle: 'italic' }}>
                        Non pianificato
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* RENDER EDITOR SINGOLO GIORNO */}
      {selectedDay && (
        <StrategicDayEditor
          dayKey={selectedDay}
          initialData={strategicPlan.days?.[selectedDay]}
          calorieMemory={strategicPlan.calorieMemory || {}}
          saveCalorieMemory={saveCalorieMemory}
          onClose={() => setSelectedDay(null)}
          onSave={(newData) => {
            if (newData) {
              // 1. Salva la pianificazione del giorno
              updateDayPlan(selectedDay, { 
                type: newData.type, 
                focus: newData.focus, 
                hour: newData.hour, 
                kcal: newData.kcal 
              });
              // 2. Salva il valore nel dizionario della memoria per il futuro
              if (newData.memoryKey && newData.kcal) {
                saveCalorieMemory(newData.memoryKey, newData.kcal);
              }
            } else {
              updateDayPlan(selectedDay, null);
            }
            setSelectedDay(null);
          }}
        />
      )}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#0f172a', zIndex: 9999,
    display: 'flex', flexDirection: 'column',
    fontFamily: 'system-ui, sans-serif'
  },
  header: {
    padding: '20px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer'
  },
  content: {
    padding: '20px', paddingBottom: '120px', overflowY: 'auto', flex: 1
  },
  settingsCard: {
    backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '24px', border: '1px solid #334155'
  },
  selectInput: {
    backgroundColor: '#0f172a', color: '#fff', border: '1px solid #475569',
    borderRadius: '6px', padding: '6px', outline: 'none'
  },
  grid: {
    display: 'flex', flexDirection: 'column', gap: '12px'
  },
  dayCard: {
    backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px',
    borderLeft: '4px solid', cursor: 'pointer',
    transition: 'transform 0.1s',
  },
  dayHeader: {
    display: 'flex', justifyContent: 'space-between', marginBottom: '8px'
  },
  dayBody: {
    display: 'flex', flexDirection: 'column'
  }
};
