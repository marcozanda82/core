import React, { useMemo, useState, useRef } from 'react';
import { mergeDuplicateBiometrics } from './biometricHistory';

const card = {
  background: 'rgba(17,17,17,0.92)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 14,
  padding: '14px 16px',
  marginBottom: 16,
};

const th = {
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'rgba(148, 163, 184, 0.95)',
  padding: '8px 6px',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
};

const td = {
  fontSize: 12,
  color: 'rgba(226, 232, 240, 0.9)',
  padding: '8px 6px',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
};

function fmt(v) {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : '—';
}

function pickNumericMetric(row, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = row?.[key];
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Storico pesate: tabella + import CSV (callback verso SalaComandi) + form rapido ultima pesata.
 *
 * @param {{
 *   bodyMetricsHistory?: Array<Record<string, unknown>>,
 *   onBalanceCsvImport?: (event: React.ChangeEvent<HTMLInputElement>) => void,
 *   onSubmitQuickWeighIn?: (payload: {
 *     weight: number,
 *     bodyFat: number | null,
 *     muscle: number | null,
 *     water: number | null,
 *     visceral: number | null,
 *   }) => void | Promise<void>,
 *   onDeleteBodyMetrics?: (entryId: string | number) => void | Promise<void>,
 * }} props
 */
export default function HistoryView({
  bodyMetricsHistory = [],
  onBalanceCsvImport,
  onSubmitQuickWeighIn,
  onDeleteBodyMetrics,
}) {
  const localCsvRef = useRef(null);

  const handleLocalFileChange = (event) => {
    if (onBalanceCsvImport) {
      onBalanceCsvImport(event);
    }
    event.target.value = '';
  };

  const [w, setW] = useState('');
  const [bf, setBf] = useState('');
  const [muscle, setMuscle] = useState('');
  const [water, setWater] = useState('');
  const [visceral, setVisceral] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState(null);

  /** Stessa logica dell’import CSV: una riga per data, campi BIA uniti se erano su righe duplicate. */
  const mergedForDisplay = useMemo(() => {
    const slim = bodyMetricsHistory
      .filter((r) => {
        if (!r || typeof r !== 'object') return false;
        const w = Number(r.weight);
        if (!Number.isFinite(w) || w <= 0) return false;
        return Number(r.timestamp) > 0 || typeof r.date === 'string';
      })
      .map((r) => {
        const muscle = pickNumericMetric(r, ['muscleMass', 'muscle', 'leanMass', 'muscle_pct']);
        const water = pickNumericMetric(r, ['bodyWater', 'water', 'waterPercentage', 'water_pct']);
        const visceral = pickNumericMetric(r, ['visceralFat', 'visceral', 'visceral_fat']);
        return {
          id: typeof r.id === 'string' ? r.id : null,
          entryId:
            typeof r.id === 'string' && r.id
              ? r.id
              : Number.isFinite(Number(r.timestamp))
                ? Number(r.timestamp)
                : null,
          date: r.date,
          timestamp: Number(r.timestamp) || 0,
          weight: Number(r.weight),
          bodyFat: pickNumericMetric(r, ['bodyFat', 'fat', 'fatPercentage']),
          muscle: muscle != null && Number.isFinite(muscle) ? muscle : null,
          water: water != null && Number.isFinite(water) ? water : null,
          visceral: visceral != null && Number.isFinite(visceral) ? visceral : null,
        };
      })
      .filter((r) => Number.isFinite(r.weight) && r.weight > 0);
    return mergeDuplicateBiometrics(slim);
  }, [bodyMetricsHistory]);

  const rowsDesc = useMemo(
    () => [...mergedForDisplay].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    [mergedForDisplay],
  );

  const latest = rowsDesc.length ? rowsDesc[0] : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!onSubmitQuickWeighIn) return;
    const weight = parseFloat(String(w).replace(',', '.'));
    if (!Number.isFinite(weight) || weight <= 0) return;
    setSaving(true);
    try {
      const parseOpt = (s) => {
        const t = String(s ?? '').trim();
        if (t === '') return null;
        const n = parseFloat(t.replace(',', '.'));
        return Number.isFinite(n) ? n : null;
      };
      await onSubmitQuickWeighIn({
        weight,
        bodyFat: parseOpt(bf),
        muscle: parseOpt(muscle),
        water: parseOpt(water),
        visceral: parseOpt(visceral),
      });
      setW('');
      setBf('');
      setMuscle('');
      setWater('');
      setVisceral('');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entryId) => {
    if (!onDeleteBodyMetrics || entryId == null) return;
    const confirmed = window.confirm('Eliminare questa pesata dallo storico?');
    if (!confirmed) return;
    setDeletingEntryId(entryId);
    try {
      await onDeleteBodyMetrics(entryId);
    } finally {
      setDeletingEntryId(null);
    }
  };

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', padding: '0 4px 24px' }}>
      <div style={{ ...card }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e5e5e5', marginBottom: 6 }}>
          Composizione corporea (bilancia)
        </div>
        <p style={{ margin: '0 0 14px', fontSize: '0.8rem', lineHeight: 1.45, color: '#94a3b8' }}>
          Storico delle pesate importate o inserite. Il peso aggiorna TDEE e baseline sulla mappa metabolica.
        </p>
        {onBalanceCsvImport && (
          <>
            <input
              type="file"
              accept=".csv"
              style={{ display: 'none' }}
              ref={localCsvRef}
              onChange={handleLocalFileChange}
            />
            <button
              type="button"
              onClick={() => localCsvRef.current?.click()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 10,
                border: '1px solid rgba(56, 189, 248, 0.45)',
                background: 'rgba(14, 165, 233, 0.12)',
                color: '#e0f2fe',
                fontWeight: 650,
                fontSize: '0.82rem',
                cursor: 'pointer',
                marginBottom: 14,
              }}
            >
              <span aria-hidden>📊</span> Carica CSV bilancia
            </button>
          </>
        )}
        {latest && (
          <div
            style={{
              fontSize: '0.78rem',
              color: 'rgba(167, 243, 208, 0.95)',
              marginBottom: 10,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(52, 211, 153, 0.25)',
            }}
          >
            Peso attuale (ultima pesata):{' '}
            <strong>{fmt(latest.weight)} kg</strong>
            {latest.date ? ` · ${latest.date}` : ''}
          </div>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 280 }}>
            <thead>
              <tr>
                <th style={th}>Data</th>
                <th style={th}>Peso</th>
                <th style={th}>Grasso %</th>
                <th style={th}>Muscolo</th>
                <th style={th}>Acqua</th>
                <th style={th}>Visc.</th>
                <th style={th}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {rowsDesc.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...td, textAlign: 'center', color: '#64748b' }}>
                    Nessuna pesata in elenco.
                  </td>
                </tr>
              ) : (
                rowsDesc.map((r) => (
                  <tr key={`${r.date}-${r.timestamp}`}>
                    <td style={td}>{r.date || '—'}</td>
                    <td style={td}>{fmt(r.weight)}</td>
                    <td style={td}>{fmt(r.bodyFat)}</td>
                    <td style={td}>{fmt(r.muscle)}</td>
                    <td style={td}>{fmt(r.water)}</td>
                    <td style={td}>{fmt(r.visceral)}</td>
                    <td style={td}>
                      {onDeleteBodyMetrics && r.entryId != null ? (
                        <button
                          type="button"
                          onClick={() => {
                            console.log('Deleting entry:', r.id);
                            handleDelete(r.entryId);
                          }}
                          disabled={deletingEntryId === r.entryId}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid rgba(248,113,113,0.45)',
                            background: 'rgba(239,68,68,0.12)',
                            color: '#fecaca',
                            cursor: deletingEntryId === r.entryId ? 'wait' : 'pointer',
                          }}
                        >
                          {deletingEntryId === r.entryId ? '…' : '🗑️'}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...card }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e5e5e5', marginBottom: 10 }}>
          Inserimento rapido
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            Peso (kg) *
            <input
              value={w}
              onChange={(e) => setW(e.target.value)}
              inputMode="decimal"
              placeholder="es. 72.4"
              required
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                padding: '8px 10px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(0,0,0,0.35)',
                color: '#f1f5f9',
                boxSizing: 'border-box',
              }}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Grasso %
              <input
                value={bf}
                onChange={(e) => setBf(e.target.value)}
                inputMode="decimal"
                placeholder="opz."
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 4,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(0,0,0,0.35)',
                  color: '#f1f5f9',
                  boxSizing: 'border-box',
                }}
              />
            </label>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Muscolo %
              <input
                value={muscle}
                onChange={(e) => setMuscle(e.target.value)}
                inputMode="decimal"
                placeholder="opz."
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 4,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(0,0,0,0.35)',
                  color: '#f1f5f9',
                  boxSizing: 'border-box',
                }}
              />
            </label>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Acqua %
              <input
                value={water}
                onChange={(e) => setWater(e.target.value)}
                inputMode="decimal"
                placeholder="opz."
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 4,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(0,0,0,0.35)',
                  color: '#f1f5f9',
                  boxSizing: 'border-box',
                }}
              />
            </label>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              Grasso viscerale
              <input
                value={visceral}
                onChange={(e) => setVisceral(e.target.value)}
                inputMode="decimal"
                placeholder="opz."
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 4,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(0,0,0,0.35)',
                  color: '#f1f5f9',
                  boxSizing: 'border-box',
                }}
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !onSubmitQuickWeighIn}
            style={{
              marginTop: 6,
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: saving ? 'wait' : 'pointer',
              background: 'linear-gradient(165deg, #0ea5e9 0%, #0369a1 100%)',
              color: '#fff',
              opacity: onSubmitQuickWeighIn ? 1 : 0.5,
            }}
          >
            {saving ? 'Salvataggio…' : 'Registra pesata'}
          </button>
        </form>
      </div>
    </div>
  );
}
