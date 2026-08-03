import React, { useEffect, useState } from 'react';
import {
  DEFAULT_SLEEP_HOURS,
  SLEEP_HOURS_MAX,
  SLEEP_HOURS_MIN,
  SLEEP_HOURS_STEP,
  SLEEP_QUALITY_OPTIONS,
  sleepQualityLabel,
} from '../utils/sleepLogs';

function clampHours(value) {
  const n = Math.round(Number(value) / SLEEP_HOURS_STEP) * SLEEP_HOURS_STEP;
  return Math.min(SLEEP_HOURS_MAX, Math.max(SLEEP_HOURS_MIN, Math.round(n * 10) / 10));
}

/**
 * Widget zero-friction: ore (±0.5) + qualità poor/ok/good.
 * Stato gestito dal parent via useSleepLog.
 */
export default function SleepTrackerWidget({
  entry = null,
  hydrated = false,
  saving = false,
  errorMessage = null,
  onSave = null,
  onSaved = null,
} = {}) {
  const hasEntry = Boolean(entry);
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(DEFAULT_SLEEP_HOURS);
  const [quality, setQuality] = useState('ok');

  useEffect(() => {
    if (!hydrated) return;
    if (entry) {
      setHours(entry.hours);
      setQuality(entry.quality);
      setEditing(false);
    } else {
      setHours(DEFAULT_SLEEP_HOURS);
      setQuality('ok');
      setEditing(true);
    }
  }, [hydrated, entry]);

  const showForm = !hasEntry || editing;

  const handleSave = async () => {
    if (typeof onSave !== 'function') return;
    const payload = await onSave({ hours, quality });
    if (payload) {
      setEditing(false);
      if (typeof onSaved === 'function') onSaved(payload);
    }
  };

  return (
    <section className="sleep-tracker-widget" aria-label="Tracker sonno">
      <div className="sleep-tracker-widget__header">
        <div>
          <h3 className="sleep-tracker-widget__title">Sonno / Recupero</h3>
          <p className="sleep-tracker-widget__subtitle">
            Notte appena trascorsa · correlata alla cena di ieri
          </p>
        </div>
        {hasEntry && !editing && (
          <button
            type="button"
            className="sleep-tracker-widget__edit"
            onClick={() => setEditing(true)}
          >
            Modifica
          </button>
        )}
      </div>

      {!hydrated && (
        <p className="sleep-tracker-widget__state">Caricamento…</p>
      )}

      {hydrated && !showForm && entry && (
        <div className="sleep-tracker-widget__summary">
          <div className="sleep-tracker-widget__summary-main">
            <span className="sleep-tracker-widget__summary-hours">{entry.hours}h</span>
            <span
              className={`sleep-tracker-widget__summary-quality sleep-tracker-widget__summary-quality--${entry.quality}`}
            >
              <span
                className={`sleep-quality-dot sleep-quality-dot--${entry.quality}`}
                aria-hidden
              />
              {sleepQualityLabel(entry.quality)}
            </span>
          </div>
        </div>
      )}

      {hydrated && showForm && (
        <div className="sleep-tracker-widget__form">
          <div className="sleep-tracker-widget__hours">
            <span className="sleep-tracker-widget__field-label">Ore di sonno</span>
            <div className="sleep-tracker-widget__hours-controls">
              <button
                type="button"
                className="sleep-tracker-widget__step"
                aria-label="Diminuisci ore"
                onClick={() => setHours((h) => clampHours(h - SLEEP_HOURS_STEP))}
              >
                −
              </button>
              <input
                type="number"
                inputMode="decimal"
                step={SLEEP_HOURS_STEP}
                min={SLEEP_HOURS_MIN}
                max={SLEEP_HOURS_MAX}
                value={hours}
                onChange={(e) => setHours(clampHours(e.target.value))}
                className="sleep-tracker-widget__hours-input"
                aria-label="Ore di sonno"
              />
              <button
                type="button"
                className="sleep-tracker-widget__step"
                aria-label="Aumenta ore"
                onClick={() => setHours((h) => clampHours(h + SLEEP_HOURS_STEP))}
              >
                +
              </button>
            </div>
          </div>

          <div className="sleep-tracker-widget__quality">
            <span className="sleep-tracker-widget__field-label">Qualità</span>
            <div className="sleep-tracker-widget__quality-row" role="group" aria-label="Qualità sonno">
              {SLEEP_QUALITY_OPTIONS.map((opt) => {
                const active = quality === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`sleep-tracker-widget__quality-btn sleep-tracker-widget__quality-btn--${opt.value}${active ? ' sleep-tracker-widget__quality-btn--active' : ''}`}
                    onClick={() => setQuality(opt.value)}
                    aria-pressed={active}
                    title={opt.label}
                  >
                    <span
                      className={`sleep-quality-dot sleep-quality-dot--${opt.value}`}
                      aria-hidden
                    />
                    <span className="sleep-tracker-widget__quality-text">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sleep-tracker-widget__actions">
            {hasEntry && (
              <button
                type="button"
                className="sleep-tracker-widget__cancel"
                onClick={() => {
                  setHours(entry.hours);
                  setQuality(entry.quality);
                  setEditing(false);
                }}
                disabled={saving}
              >
                Annulla
              </button>
            )}
            <button
              type="button"
              className="sleep-tracker-widget__save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Salvataggio…' : 'Salva sonno'}
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <p className="sleep-tracker-widget__error">{errorMessage}</p>
      )}
    </section>
  );
}
