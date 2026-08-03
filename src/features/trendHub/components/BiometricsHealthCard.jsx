import React, { useMemo, useState } from 'react';
import { buildBiometricsHealthSnapshot } from '../utils/healthBiometrics';

function formatMetric(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

function MicroTrend({ deltaInfo, unit }) {
  const { delta, direction } = deltaInfo || { delta: null, direction: 'none' };
  if (direction === 'none' || delta == null) {
    return <span className="biometrics-health-card__trend biometrics-health-card__trend--none">n/d</span>;
  }
  const sign = delta > 0 ? '+' : '';
  const label = direction === 'flat' ? `0${unit}` : `${sign}${delta}${unit}`;
  return (
    <span
      className={`biometrics-health-card__trend biometrics-health-card__trend--${direction}`}
      title="Delta rispetto alla misurazione precedente"
    >
      {direction === 'up' ? '▲' : direction === 'down' ? '▼' : '●'} {label}
    </span>
  );
}

/**
 * Card biometrica Salute: peso + girovita con micro-trend e aggiornamento rapido.
 * Contratto snello P1: `recentBodyMetrics` (ultime entry), non l’intera history RTDB.
 *
 * @param {{
 *   recentBodyMetrics?: Array<Record<string, unknown>>,
 *   bodyMetricsHistory?: Array<Record<string, unknown>>,
 *   onSaveBiometrics?: (metrics: { weight?: string, waist?: string, date?: string }) => Promise<boolean>,
 *   todayDate?: string,
 * }} props
 */
export default function BiometricsHealthCard({
  recentBodyMetrics = null,
  bodyMetricsHistory = null,
  onSaveBiometrics = null,
  todayDate = '',
} = {}) {
  const metricsSource = Array.isArray(recentBodyMetrics)
    ? recentBodyMetrics
    : (Array.isArray(bodyMetricsHistory) ? bodyMetricsHistory : []);

  const snapshot = useMemo(
    () => buildBiometricsHealthSnapshot(metricsSource),
    [metricsSource],
  );

  const [editing, setEditing] = useState(false);
  const [weightDraft, setWeightDraft] = useState('');
  const [waistDraft, setWaistDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const openEditor = () => {
    setWeightDraft('');
    setWaistDraft('');
    setEditing(true);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditing(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (typeof onSaveBiometrics !== 'function') return;
    setSaving(true);
    try {
      const ok = await onSaveBiometrics({
        weight: weightDraft,
        waist: waistDraft,
        date: todayDate || undefined,
      });
      if (ok) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="biometrics-health-card" aria-label="Metriche biometriche">
      <div className="biometrics-health-card__header">
        <div>
          <h3 className="biometrics-health-card__title">Longevità fisica</h3>
          <p className="biometrics-health-card__subtitle">Peso e girovita · micro-trend vs ultima misura</p>
        </div>
        <button
          type="button"
          className="biometrics-health-card__update-btn"
          onClick={editing ? closeEditor : openEditor}
        >
          {editing ? 'Chiudi' : 'Aggiorna Metriche'}
        </button>
      </div>

      <div className="biometrics-health-card__grid">
        <div className="biometrics-health-card__metric">
          <span className="biometrics-health-card__label">Peso corporeo</span>
          <span className="biometrics-health-card__value">
            {formatMetric(snapshot.weightKg)}
            <span className="biometrics-health-card__unit">kg</span>
          </span>
          <MicroTrend deltaInfo={snapshot.weightDelta} unit=" kg" />
        </div>
        <div className="biometrics-health-card__metric">
          <span className="biometrics-health-card__label">Girovita</span>
          <span className="biometrics-health-card__value">
            {formatMetric(snapshot.waistCm)}
            <span className="biometrics-health-card__unit">cm</span>
          </span>
          <MicroTrend deltaInfo={snapshot.waistDelta} unit=" cm" />
        </div>
      </div>

      {editing && (
        <form className="biometrics-health-card__form" onSubmit={handleSubmit}>
          <label className="biometrics-health-card__field">
            <span>Peso (kg)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.1"
              value={weightDraft}
              onChange={(e) => setWeightDraft(e.target.value)}
              placeholder={snapshot.weightKg != null ? String(snapshot.weightKg) : 'es. 75.5'}
            />
          </label>
          <label className="biometrics-health-card__field">
            <span>Girovita (cm)</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.1"
              value={waistDraft}
              onChange={(e) => setWaistDraft(e.target.value)}
              placeholder={snapshot.waistCm != null ? String(snapshot.waistCm) : 'es. 84'}
            />
          </label>
          <p className="biometrics-health-card__hint">
            Compila solo ciò che vuoi aggiornare. I campi vuoti mantengono l&apos;ultimo valore noto.
          </p>
          <button
            type="submit"
            className="biometrics-health-card__save-btn"
            disabled={saving || typeof onSaveBiometrics !== 'function'}
          >
            {saving ? 'Salvataggio…' : 'Salva metriche'}
          </button>
        </form>
      )}
    </section>
  );
}
