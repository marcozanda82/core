import React from 'react';
import {
  WORKOUT_ACTIVITY_SELECTOR_IDS,
  getWorkoutActivityTypeDef,
  WORKOUT_MUSCLE_GROUP_DEFS,
  normalizeMuscleGroupArray,
} from '../../activityCatalog';

/** Pesi: gruppi muscolari via chip. Altri strength: nota obbligatoria per il salvataggio. */
export function workoutActivityRequiresStrengthDetailNote(typeId) {
  const def = getWorkoutActivityTypeDef(typeId);
  if (typeId === 'pesi') return false;
  if (def?.category === 'strength') return true;
  const raw = String(typeId || '').toLowerCase();
  return raw.includes('strength') || raw.includes('bodybuilding');
}

export default function WorkoutView({
  onBack,
  workoutType,
  setWorkoutType,
  workoutStartTime,
  workoutEndTime,
  setWorkoutEndTime,
  workoutDurationMin,
  setWorkoutDurationMin,
  workoutDurationHours,
  miniTimelineActivityRef,
  handleMiniTimelineDrag,
  allNodes,
  getTimePositionPercent,
  decimalToTimeStr,
  parseTimeStrToDecimal,
  workoutMuscles,
  setWorkoutMuscles,
  editingWorkoutId,
  workoutStrengthDetail,
  setWorkoutStrengthDetail,
  workoutKcal,
  setWorkoutKcal,
  handleSaveWorkout,
  workoutsLog,
  removeLogItem,
}) {
  return (
    <div className="view-animate">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
        <h2 style={{ fontSize: '0.8rem', color: '#ff6d00', letterSpacing: '2px', margin: 0 }}>⚡ ATTIVITÀ</h2>
        <div style={{ width: '70px' }} />
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '30px', flexWrap: 'wrap' }}>
        {WORKOUT_ACTIVITY_SELECTOR_IDS.map((typeId) => {
          const ad = getWorkoutActivityTypeDef(typeId);
          return (
            <button
              key={typeId}
              type="button"
              className={`type-btn ${workoutType === typeId ? 'active orange' : ''}`}
              onClick={() => setWorkoutType(typeId)}
            >
              {ad?.selectorButtonLabel ?? typeId}
            </button>
          );
        })}
      </div>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '14px', marginBottom: '10px' }}>
          <div style={{ flex: '1 1 140px' }}>
            <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '1px', marginBottom: '6px', textTransform: 'uppercase' }}>
              Ora di inizio
            </div>
            <input
              type="time"
              value={decimalToTimeStr(workoutStartTime)}
              onChange={(e) => {
                const startTime = Math.min(24, Math.max(0, parseTimeStrToDecimal(e.target.value)));
                const durationHours = Math.max(0, Number(workoutDurationMin) || 0) / 60;
                let computedEndTime = startTime + durationHours;
                while (computedEndTime >= 24) computedEndTime -= 24;
                while (computedEndTime < 0) computedEndTime += 24;
                setWorkoutEndTime(computedEndTime);
              }}
              style={{
                width: '100%',
                maxWidth: '160px',
                padding: '8px 10px',
                background: '#1a1a1a',
                border: '1px solid #ff6d00',
                borderRadius: '8px',
                color: '#ff6d00',
                fontSize: '1.05rem',
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            />
          </div>
          <div style={{ flex: '0 0 120px' }}>
            <div style={{ fontSize: '0.65rem', color: '#888', letterSpacing: '1px', marginBottom: '6px', textTransform: 'uppercase' }}>
              Durata (min)
            </div>
            <input
              type="number"
              min={15}
              max={600}
              step={5}
              value={workoutDurationMin}
              onChange={(e) => {
                const n = Number(e.target.value);
                setWorkoutDurationMin(
                  Number.isFinite(n) ? Math.max(15, Math.min(600, Math.round(n))) : 30,
                );
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: '#1a1a1a',
                border: '1px solid #ff6d00',
                borderRadius: '8px',
                color: '#ff6d00',
                fontSize: '1.05rem',
                fontWeight: 'bold',
                textAlign: 'center',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#666', fontSize: '0.65rem', marginBottom: '8px' }}>
          <span>0:00</span>
          <span>Inizio calcolato: {decimalToTimeStr(workoutStartTime)}</span>
          <span>24:00</span>
        </div>
        <div ref={miniTimelineActivityRef} style={{ position: 'relative', height: '36px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid #333', touchAction: 'pan-x' }}>
          {allNodes.filter((n) => n.id !== editingWorkoutId).map((n) => {
            const isWork = n.type === 'work';
            const isCognitive = n.type === 'cognitive';
            const startP = getTimePositionPercent(n.time);
            const durP = (isWork || isCognitive) ? getTimePositionPercent(n.duration || 1) : 0;
            const isPesi = n.type === 'workout' && n.subType === 'pesi' && n.muscles?.length > 0;
            const iconContent = isPesi ? n.muscles.map((m) => m.substring(0, 2).toUpperCase()).join('+') : (n.icon || '•');
            if (isWork) {
              return (
                <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, width: `${durP}%`, top: '50%', transform: 'translateY(-50%)', height: '20px', background: 'rgba(255, 234, 0, 0.2)', borderLeft: '2px solid #ffea00', borderRight: '2px solid #ffea00', borderRadius: '4px', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }} />
              );
            }
            if (isCognitive) {
              return (
                <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, width: `${durP}%`, top: '50%', transform: 'translateY(-50%)', height: '20px', background: 'rgba(0, 229, 255, 0.2)', borderLeft: '2px solid #00e5ff', borderRight: '2px solid #00e5ff', borderRadius: '4px', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none' }} />
              );
            }
            return (
              <div key={n.id} style={{ position: 'absolute', left: `${startP}%`, top: '50%', transform: 'translate(-50%, -50%)', width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '2px solid #666', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', filter: 'grayscale(1)', opacity: 0.3, pointerEvents: 'none', fontSize: '0.5rem' }}>
                <span style={{ lineHeight: 1 }}>{iconContent}</span>
              </div>
            );
          })}
          <div
            className="mini-timeline-bar-wrap"
            onPointerDown={(e) =>
              handleMiniTimelineDrag(
                e,
                miniTimelineActivityRef,
                'bar-all',
                workoutStartTime,
                workoutEndTime,
                () => {},
                setWorkoutEndTime,
                { fixedDurationHours: workoutDurationHours },
              )
            }
            style={{
              position: 'absolute',
              left: `${getTimePositionPercent(workoutStartTime)}%`,
              width: `${getTimePositionPercent(workoutDurationHours)}%`,
              top: '50%',
              transform: 'translateY(-50%)',
              height: '24px',
              background: 'rgba(255, 109, 0, 0.4)',
              border: '1px solid #ff6d00',
              borderRadius: '4px',
              cursor: 'grab',
              zIndex: 10,
              touchAction: 'none',
            }}
          >
            <div
              className="mini-timeline-hitbox"
              role="slider"
              aria-label="Fine attività"
              onPointerDown={(e) => {
                e.stopPropagation();
                handleMiniTimelineDrag(
                  e,
                  miniTimelineActivityRef,
                  'bar-end',
                  workoutStartTime,
                  workoutEndTime,
                  () => {},
                  setWorkoutEndTime,
                  { fixedDurationHours: workoutDurationHours },
                );
              }}
              style={{
                position: 'absolute',
                right: '-22px',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '44px',
                height: '44px',
                minWidth: 44,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 11,
              }}
            >
              <div style={{ width: '12px', height: '24px', background: '#ff6d00', borderRadius: '4px', pointerEvents: 'none' }} />
            </div>
          </div>
        </div>
      </div>
      {workoutType === 'pesi' && (() => {
        const pesiMuscleSet = new Set(normalizeMuscleGroupArray(workoutMuscles));
        return (
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '8px' }}>
              Gruppi muscolari
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))',
                gap: '8px',
              }}
            >
              {WORKOUT_MUSCLE_GROUP_DEFS.map(({ id: mId, label: mLabel }) => {
                const isActive = pesiMuscleSet.has(mId);
                return (
                  <button
                    key={mId}
                    type="button"
                    onClick={() => {
                      setWorkoutMuscles((prev) => {
                        const p = normalizeMuscleGroupArray(prev);
                        if (p.includes(mId)) return p.filter((x) => x !== mId);
                        return [...p, mId];
                      });
                    }}
                    style={{
                      padding: '10px 12px',
                      fontSize: '0.75rem',
                      borderRadius: '20px',
                      border: `1px solid ${isActive ? '#ff6d00' : '#444'}`,
                      background: isActive ? '#ff6d00' : '#222',
                      color: isActive ? '#000' : '#aaa',
                      fontWeight: isActive ? 'bold' : 'normal',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    {mLabel}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
      {workoutActivityRequiresStrengthDetailNote(workoutType) && (
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '0.75rem', color: '#aaa', marginBottom: '8px' }}>
            Dettaglio workout <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <textarea
            value={workoutStrengthDetail}
            onChange={(e) => setWorkoutStrengthDetail(e.target.value)}
            rows={3}
            placeholder="Es. Push day — petto + tricipiti, esercizi e volumi…"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              background: '#1a1a1a',
              border: `1px solid ${String(workoutStrengthDetail).trim() ? '#444' : 'rgba(239,68,68,0.55)'}`,
              borderRadius: '10px',
              color: '#e8e8e8',
              fontSize: '0.85rem',
              resize: 'vertical',
              minHeight: '72px',
            }}
          />
        </div>
      )}
      <div className="burn-slider-container">
        <span className="burn-label" style={{ color: '#ff6d00' }}>OUTPUT ENERGETICO STIMATO</span>
        <div className="burn-value workout">{Math.min(750, workoutKcal)}</div>
        <input type="range" min="50" max="750" step="10" value={Math.min(750, workoutKcal)} onChange={(e) => setWorkoutKcal(Math.min(750, Number(e.target.value)))} className="custom-range orange" style={{ marginTop: '20px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#666', marginTop: '6px' }}>
          <span>0</span><span>375</span><span>750</span>
        </div>
      </div>
      <button type="button" onClick={handleSaveWorkout} style={{ width: '100%', padding: '18px', backgroundColor: '#ff6d00', color: '#000', border: 'none', borderRadius: '15px', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', cursor: 'pointer', transition: '0.2s', boxShadow: '0 0 20px rgba(255, 109, 0, 0.4)' }}>SALVA ATTIVITÀ</button>
      <div style={{ marginTop: '30px' }}>
        {workoutsLog.length > 0 && <h4 style={{ fontSize: '0.65rem', color: '#666', letterSpacing: '2px', marginBottom: '10px' }}>OUTPUT REGISTRATI OGGI</h4>}
        {workoutsLog.map((wk) => (
          <div key={wk.id} className="food-pill" style={{ borderLeft: '3px solid #ff6d00' }}>
            <div><span className="food-pill-name">{wk.desc || wk.name}</span><span className="food-pill-weight" style={{ color: '#ff6d00' }}>{Math.round(wk.kcal)} kcal</span></div>
            <div className="food-pill-actions"><button type="button" className="food-pill-btn btn-delete" onClick={() => removeLogItem(wk.id)}>✕</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}
