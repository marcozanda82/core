import { useEffect, useMemo, useState } from 'react';
import { getWorkoutActivityLogDescription } from '../activityCatalog';
import { KENTU_PILLARS, PILLAR_IDS, pillarColorToRgba } from '../features/metabolic/pillarsMapper';
import { TRAINING_GOALS, WorkoutQuestionnaireForm } from '../features/metabolic/WorkoutQuestionnaireForm';
import { buildMetabolicFastingSnapshot } from '../features/salaComandi/utils/metabolicPhaseColors';
import {
  computeBedtimeFromWakeAndDuration,
  formatSleepDurationParts,
} from '../utils/salaComandiUtils';

function formatTimeLabel(decimalHour, decimalToTimeStr) {
  if (typeof decimalToTimeStr === 'function') {
    const label = decimalToTimeStr(Number(decimalHour));
    if (label) return label;
  }
  const h = Number(decimalHour);
  if (!Number.isFinite(h)) return '—';
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function decimalToTimeInputValue(decimalHour, fallback = '07:00') {
  const h = Number(decimalHour);
  if (!Number.isFinite(h)) return fallback;
  const hh = Math.floor(h);
  const mm = Math.round((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function parseTimeInputToDecimal(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return NaN;
  return Number(match[1]) + Number(match[2]) / 60;
}

function formatSleepDuration(entry) {
  const dm = Number(entry?.durationMinutes);
  if (Number.isFinite(dm) && dm > 0) return `${Math.floor(dm / 60)}h ${dm % 60}m`;
  const hours = Number(entry?.hours ?? entry?.duration ?? entry?.sleepHours);
  if (!Number.isFinite(hours) || hours <= 0) return '—';
  return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
}

function resolveWorkoutName(workout) {
  const desc = String(workout.desc || workout.name || '').trim();
  if (desc) return desc;
  const muscles = Array.isArray(workout.muscles)
    ? workout.muscles
    : Array.isArray(workout.workoutMuscles)
      ? workout.workoutMuscles
      : [];
  return getWorkoutActivityLogDescription(workout.subType || 'pesi', muscles);
}

function formatWorkoutMeta(workout) {
  const parts = [];
  const durH = Number(workout.duration);
  if (Number.isFinite(durH) && durH > 0) parts.push(`${Math.round(durH * 60)} min`);
  const goal = String(workout.trainingGoal || workout.workoutGoal || '').trim();
  if (goal) {
    const found = TRAINING_GOALS.find((g) => g.id === goal);
    parts.push(found?.label || goal);
  }
  const rpe = Number(workout.rpe);
  if (Number.isFinite(rpe) && rpe >= 1) parts.push(`RPE ${Math.round(rpe)}`);
  return parts.join(' · ') || '—';
}

function StoricoSleepPanel({ sleepEntry, onSaveSleep }) {
  const hasSleep = Boolean(sleepEntry);
  const [wakeStr, setWakeStr] = useState('07:00');
  const [durationHours, setDurationHours] = useState(7);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [quality, setQuality] = useState(3);
  const [editing, setEditing] = useState(!hasSleep);

  useEffect(() => {
    if (!sleepEntry) {
      setWakeStr('07:00');
      setDurationHours(7);
      setDurationMinutes(30);
      setQuality(3);
      setEditing(true);
      return;
    }
    setWakeStr(decimalToTimeInputValue(sleepEntry.wakeTime ?? sleepEntry.sleepEnd, '07:00'));
    const dm = Number(sleepEntry.durationMinutes);
    const hoursDec = Number(sleepEntry.hours ?? sleepEntry.duration ?? sleepEntry.sleepHours);
    if (Number.isFinite(dm) && dm > 0) {
      setDurationHours(Math.floor(dm / 60));
      setDurationMinutes(dm % 60);
    } else if (Number.isFinite(hoursDec) && hoursDec > 0) {
      setDurationHours(Math.floor(hoursDec));
      setDurationMinutes(Math.round((hoursDec % 1) * 60));
    }
    const q = Number(sleepEntry.quality);
    setQuality(Number.isFinite(q) && q >= 1 && q <= 5 ? Math.round(q) : 3);
    setEditing(false);
  }, [sleepEntry]);

  const durationLabel = formatSleepDurationParts(durationHours, durationMinutes);

  const handleSave = () => {
    const wakeDec = parseTimeInputToDecimal(wakeStr);
    const duration = (Number(durationHours) || 0) + (Number(durationMinutes) || 0) / 60;
    if (!(duration > 0) || !Number.isFinite(wakeDec)) {
      window.alert('Controlla risveglio e durata.');
      return;
    }
    const bedDec = computeBedtimeFromWakeAndDuration(wakeDec, duration);
    onSaveSleep?.({
      editingId: sleepEntry?.id != null ? String(sleepEntry.id) : null,
      wakeTime: wakeDec,
      bedtime: bedDec,
      hours: Math.round(duration * 100) / 100,
      durationMinutes: Math.round(duration * 60),
      quality: Math.max(1, Math.min(5, Math.round(Number(quality) || 3))),
    });
    setEditing(false);
  };

  if (hasSleep && !editing) {
    const wake = decimalToTimeInputValue(sleepEntry.wakeTime ?? sleepEntry.sleepEnd);
    const q = Number(sleepEntry.quality);
    const stars = Number.isFinite(q) && q >= 1 && q <= 5
      ? `${'★'.repeat(Math.round(q))}${'☆'.repeat(5 - Math.round(q))}`
      : '—';
    return (
      <div className="diary-pillar-card" style={{ borderColor: pillarColorToRgba(KENTU_PILLARS.SLEEP.color, 0.4) }}>
        <h3 style={{ color: KENTU_PILLARS.SLEEP.color }}>Sonno del giorno</h3>
        <p>Sveglia <strong>{wake}</strong></p>
        <p>Durata <strong>{formatSleepDuration(sleepEntry)}</strong></p>
        <p>Qualità <strong>{stars}</strong></p>
        <button type="button" className="diary-pillar-card__btn" onClick={() => setEditing(true)}>Modifica</button>
      </div>
    );
  }

  return (
    <div className="diary-pillar-card" style={{ borderColor: pillarColorToRgba(KENTU_PILLARS.SLEEP.color, 0.4) }}>
      <h3 style={{ color: KENTU_PILLARS.SLEEP.color }}>{hasSleep ? 'Modifica sonno' : 'Registra sonno'}</h3>
      <label className="diary-pillar-field">
        <span>Ora risveglio</span>
        <input type="time" value={wakeStr} onChange={(e) => setWakeStr(e.target.value)} />
      </label>
      <div className="diary-pillar-field-row">
        <label className="diary-pillar-field">
          <span>Ore</span>
          <input type="number" min={0} max={24} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />
        </label>
        <label className="diary-pillar-field">
          <span>Minuti</span>
          <input type="number" min={0} max={59} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
        </label>
      </div>
      <p className="diary-pillar-hint">Durata: {durationLabel}</p>
      <span className="diary-pillar-field__label">Qualità</span>
      <div className="diary-pillar-stars">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={Number(quality) >= star ? 'is-active' : ''}
            onClick={() => setQuality(star)}
          >
            ★
          </button>
        ))}
      </div>
      <div className="diary-pillar-actions">
        {hasSleep ? (
          <button type="button" className="diary-pillar-card__btn diary-pillar-card__btn--ghost" onClick={() => setEditing(false)}>Annulla</button>
        ) : null}
        <button type="button" className="diary-pillar-card__btn" onClick={handleSave}>Salva sonno</button>
      </div>
    </div>
  );
}

/**
 * Archivio Storico — consultazione giorni passati con 4 tab pilastri.
 */
export default function ArchivioStoricoView({
  onBack,
  selectedHistoryDate,
  setSelectedHistoryDate,
  selectedDayData,
  pastDaysStorico,
  expandedStoricoDate,
  setExpandedStoricoDate,
  fullHistory,
  decimalToTimeStr,
  onUpdateWorkoutQuestionnaire,
  onSaveSleep,
}) {
  const [activeStoricoTab, setActiveStoricoTab] = useState('NUTRITION');

  useEffect(() => {
    setActiveStoricoTab('NUTRITION');
  }, [selectedHistoryDate]);

  const dayLog = selectedDayData?.log || [];

  const nutritionEntries = useMemo(
    () => dayLog.filter((e) => {
      const t = String(e?.type || '').toLowerCase();
      return t === 'meal' || t === 'single' || t === 'food' || t === 'recipe' || !t;
    }),
    [dayLog],
  );

  const workoutEntries = useMemo(
    () => dayLog.filter((e) => String(e?.type || '').toLowerCase() === 'workout'),
    [dayLog],
  );

  const sleepEntry = useMemo(
    () => dayLog.find((e) => String(e?.type || '').toLowerCase() === 'sleep') || null,
    [dayLog],
  );

  const fastingData = useMemo(() => {
    if (!selectedHistoryDate || !dayLog.length) return null;
    return buildMetabolicFastingSnapshot(dayLog, 24, {
      fullHistory,
      anchorDate: selectedHistoryDate,
      referenceDateObj: new Date(`${selectedHistoryDate}T12:00:00`),
    });
  }, [dayLog, fullHistory, selectedHistoryDate]);

  const renderNutrition = () => {
    if (!nutritionEntries.length) {
      return <p style={{ margin: 0, fontSize: '0.85rem', color: '#888', fontStyle: 'italic' }}>Nessun pasto registrato.</p>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {nutritionEntries.map((entry, idx) => {
          if (entry.type === 'meal' && entry.items) {
            const tot = (entry.items || []).reduce(
              (a, it) => ({ prot: a.prot + (it.prot || 0), cal: a.cal + ((it.cal || it.kcal) || 0) }),
              { prot: 0, cal: 0 },
            );
            return (
              <div key={entry.id || idx}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#e4e6eb' }}>
                  {entry.desc || 'Pasto'} — {tot.prot.toFixed(1)} g prot, {Math.round(tot.cal)} kcal
                </div>
                {(entry.items || []).map((item, i) => (
                  <div key={i} style={{ paddingLeft: '12px', fontSize: '0.75rem', color: '#b0b3b8' }}>
                    {item.desc} · {(item.qta || item.weight) || ''}g · {Math.round((item.cal || item.kcal) || 0)} kcal
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div key={entry.id || idx} style={{ fontSize: '0.8rem', color: '#b0b3b8' }}>
              {entry.desc} · {Math.round((entry.cal || entry.kcal) || 0)} kcal
            </div>
          );
        })}
      </div>
    );
  };

  const renderTraining = () => {
    if (!workoutEntries.length) {
      return <p style={{ margin: 0, fontSize: '0.85rem', color: '#888', fontStyle: 'italic' }}>Nessun allenamento registrato.</p>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {workoutEntries.map((workout, idx) => {
          const name = resolveWorkoutName(workout);
          const timeLabel = formatTimeLabel(workout.time, decimalToTimeStr);
          const burned = Math.round(Number(workout.kcal ?? workout.cal) || 0);
          return (
            <div
              key={workout.id || idx}
              className="diary-pillar-card"
              style={{ borderColor: pillarColorToRgba(KENTU_PILLARS.TRAINING.color, 0.4) }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <strong style={{ color: KENTU_PILLARS.TRAINING.color }}>{name}{timeLabel ? ` · ${timeLabel}` : ''}</strong>
                <span style={{ color: '#ff6d00', fontSize: '0.8rem' }}>{burned > 0 ? `−${burned} kcal` : '0 kcal'}</span>
              </div>
              <p className="diary-pillar-hint" style={{ marginBottom: 8 }}>{formatWorkoutMeta(workout)}</p>
              <WorkoutQuestionnaireForm
                workout={workout}
                onSave={(workoutId, patch) => onUpdateWorkoutQuestionnaire?.(selectedHistoryDate, workoutId, patch)}
              />
            </div>
          );
        })}
      </div>
    );
  };

  const renderFasting = () => {
    const hoursFasted = Math.max(0, Number(fastingData?.hoursFasted) || 0);
    const durationLabel = fastingData?.timeString
      || `${Math.floor(hoursFasted)}h ${Math.round((hoursFasted % 1) * 60)}m`;
    const lastMealHour = 24 - hoursFasted;
    const startedLabel = hoursFasted > 0.25 && Number.isFinite(lastMealHour)
      ? formatTimeLabel(((lastMealHour % 24) + 24) % 24, decimalToTimeStr)
      : null;

    return (
      <div className="diary-pillar-card" style={{ borderColor: pillarColorToRgba(KENTU_PILLARS.FASTING.color, 0.4) }}>
        <h3 style={{ color: KENTU_PILLARS.FASTING.color }}>Digiuno del giorno</h3>
        {hoursFasted < 0.25 ? (
          <p className="diary-pillar-hint">Nessuna finestra di digiuno rilevante (o dati pasti mancanti).</p>
        ) : (
          <>
            {startedLabel ? <p>Iniziato alle <strong>{startedLabel}</strong></p> : null}
            <p>Durata (a fine giornata) <strong>{durationLabel}</strong></p>
            {fastingData?.phaseName ? <p>Fase <strong>{fastingData.phaseName}</strong></p> : null}
            {fastingData?.phaseDesc ? <p className="diary-pillar-hint">{fastingData.phaseDesc}</p> : null}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="view-animate">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', color: '#666', fontSize: '0.8rem', cursor: 'pointer', letterSpacing: '1px' }}>&lt; INDIETRO</button>
        <h2 style={{ fontSize: '0.8rem', color: '#b0bec5', letterSpacing: '2px', margin: 0 }}>📚 ARCHIVIO STORICO</h2>
        <div style={{ width: '70px' }} />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '0.7rem', color: '#888', letterSpacing: '1px', marginBottom: '8px' }}>Cerca per data</label>
        <input
          type="date"
          value={selectedHistoryDate}
          onChange={(e) => setSelectedHistoryDate(e.target.value)}
          style={{ width: '100%', padding: '12px 14px', background: '#111', border: '1px solid #2a2a2a', borderRadius: '10px', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
        />
      </div>

      <div className="diary-pillar-tabs" role="tablist" aria-label="Pilastri archivio" style={{ marginBottom: 14 }}>
        {PILLAR_IDS.map((pillarId) => {
          const meta = KENTU_PILLARS[pillarId];
          const active = activeStoricoTab === pillarId;
          return (
            <button
              key={pillarId}
              type="button"
              role="tab"
              aria-selected={active}
              className={`diary-pillar-tab${active ? ' is-active' : ''}`}
              style={{
                color: meta.color,
                borderBottomColor: active ? meta.color : 'transparent',
                background: active ? pillarColorToRgba(meta.color, 0.14) : 'transparent',
                opacity: active ? 1 : 0.5,
              }}
              onClick={() => setActiveStoricoTab(pillarId)}
              title={meta.label}
            >
              <span className="diary-pillar-tab__icon" aria-hidden>{meta.icon}</span>
              <span className="diary-pillar-tab__label">{meta.label}</span>
            </button>
          );
        })}
      </div>

      {selectedHistoryDate ? (
        <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(176, 190, 197, 0.06)', border: '1px solid rgba(176, 190, 197, 0.2)', borderRadius: '12px' }}>
          {selectedDayData ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '12px', fontSize: '0.8rem' }}>
                <span style={{ color: '#b0bec5' }}>{new Date(`${selectedHistoryDate}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                <span style={{ color: '#00e5ff' }}>{Math.round(selectedDayData.calorie)} kcal</span>
                <span style={{ color: '#b388ff' }}>{selectedDayData.proteine.toFixed(1)} g prot</span>
                <span style={{ color: selectedDayData.deficit < 0 ? '#00e676' : selectedDayData.deficit > 0 ? '#ff6d00' : '#888' }}>
                  {selectedDayData.deficit < 0
                    ? `${selectedDayData.deficit} kcal (Deficit)`
                    : selectedDayData.deficit > 0
                      ? `+${selectedDayData.deficit} kcal (Surplus)`
                      : '0 kcal (Pari)'}
                </span>
              </div>
              <h4 style={{ fontSize: '0.7rem', color: '#b0bec5', letterSpacing: '1px', marginBottom: '10px' }}>
                {KENTU_PILLARS[activeStoricoTab]?.label || 'Dettaglio'}
              </h4>
              {activeStoricoTab === 'NUTRITION' ? renderNutrition() : null}
              {activeStoricoTab === 'TRAINING' ? renderTraining() : null}
              {activeStoricoTab === 'SLEEP' ? (
                <StoricoSleepPanel
                  sleepEntry={sleepEntry}
                  onSaveSleep={(payload) => onSaveSleep?.(selectedHistoryDate, payload)}
                />
              ) : null}
              {activeStoricoTab === 'FASTING' ? renderFasting() : null}
            </>
          ) : (
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#888', fontStyle: 'italic' }}>Nessun dato registrato per questa data.</p>
          )}
        </div>
      ) : (
        <p style={{ margin: '0 0 20px', fontSize: '0.8rem', color: '#666', fontStyle: 'italic' }}>Seleziona una data per consultare i 4 pilastri.</p>
      )}

      <h3 className="diary-group-title" style={{ borderLeftColor: '#b0bec5', marginBottom: '12px' }}>Tutti i giorni</h3>
      {pastDaysStorico.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#444', fontSize: '0.8rem', fontStyle: 'italic' }}>Nessun giorno passato in archivio.</p>
      ) : (
        <div className="storico-accordion">
          {pastDaysStorico.map(({ dataStr, calorie, proteine, deficit }) => {
            const isExpanded = expandedStoricoDate === dataStr;
            const dataFormatted = new Date(`${dataStr}T12:00:00`).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const deficitText = deficit < 0 ? `${deficit} kcal (Deficit)` : deficit > 0 ? `+${deficit} kcal (Surplus)` : '0 kcal (Pari)';
            return (
              <div key={dataStr} style={{ marginBottom: '8px', border: '1px solid #2a2a2a', borderRadius: '12px', overflow: 'hidden', background: isExpanded ? 'rgba(176, 190, 197, 0.06)' : 'rgba(255,255,255,0.02)' }}>
                <button
                  type="button"
                  onClick={() => {
                    setExpandedStoricoDate(isExpanded ? null : dataStr);
                    setSelectedHistoryDate(dataStr);
                  }}
                  style={{ width: '100%', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', textAlign: 'left', flexWrap: 'wrap' }}
                >
                  <span style={{ fontSize: '0.9rem', fontWeight: '600' }}>{dataFormatted}</span>
                  <span style={{ fontSize: '0.75rem', color: '#00e5ff' }}>{Math.round(calorie)} kcal</span>
                  <span style={{ fontSize: '0.75rem', color: '#b388ff' }}>{proteine.toFixed(1)} g prot</span>
                  <span style={{ fontSize: '0.75rem', color: deficit < 0 ? '#00e676' : deficit > 0 ? '#ff6d00' : '#888' }}>{deficitText}</span>
                  <span style={{ fontSize: '1rem', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
