import { useMemo, useState } from 'react';
import { KentuButton } from './kentuos/KentuOSUI';
import { TARGETS } from '../useBiochimico';

const BASE_KEYS = ['kcal', 'prot', 'carb', 'fatTotal', 'fibre'];

function toNumOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function round1(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 10) / 10;
}

function buildMicroKeys() {
  const keys = new Set();
  Object.values(TARGETS).forEach((group) => {
    Object.keys(group || {}).forEach((k) => keys.add(k));
  });
  // Escludi macro già editabili sopra
  BASE_KEYS.forEach((k) => keys.delete(k));
  keys.delete('cal');
  keys.delete('fat');
  return [...keys].sort();
}

export default function NewFoodPreviewCard({ draft, onSave }) {
  const donor = draft?.donor || null;
  const donorName = donor?.donorName ? String(donor.donorName).trim() : '';
  const hasInheritedMicros = Boolean(donorName);

  const microKeys = useMemo(() => buildMicroKeys(), []);

  const [form, setForm] = useState(() => {
    const entry = draft?.entryPer100 || {};
    const base = {
      desc: String(entry.desc || '').trim(),
      kcal: entry.kcal ?? null,
      prot: entry.prot ?? null,
      carb: entry.carb ?? null,
      fatTotal: entry.fatTotal ?? entry.fat ?? null,
      fibre: entry.fibre ?? null,
    };
    const micros = {};
    microKeys.forEach((k) => {
      micros[k] = entry[k] ?? null;
    });
    return { base, micros };
  });

  const [useInheritedMicros, setUseInheritedMicros] = useState(Boolean(donorName));
  const [isSaving, setIsSaving] = useState(false);

  const entryPer100 = useMemo(() => {
    const out = {
      desc: String(form.base.desc || '').trim() || 'Nuovo alimento',
      kcal: toNumOrNull(form.base.kcal),
      prot: toNumOrNull(form.base.prot),
      carb: toNumOrNull(form.base.carb),
      fatTotal: toNumOrNull(form.base.fatTotal),
      fibre: toNumOrNull(form.base.fibre),
    };
    if (out.fatTotal != null) out.fat = out.fatTotal;
    if (out.kcal != null) out.cal = out.kcal;

    if (useInheritedMicros) {
      microKeys.forEach((k) => {
        const v = toNumOrNull(form.micros[k]);
        if (v != null) out[k] = v;
      });
    }
    return out;
  }, [form, microKeys, useInheritedMicros]);

  const handleSave = async () => {
    if (!String(entryPer100.desc || '').trim()) return;
    setIsSaving(true);
    try {
      await onSave?.(entryPer100, donorName ? { donorName, donorKey: donor?.key || null } : null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="kentu-meal-proposal-card">
      <header className="kentu-meal-proposal-card__head">
        <div className="kentu-meal-proposal-card__titles">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span className="kentu-meal-proposal-card__badge kentu-badge--macro-read">Macro letti</span>
            <span className="kentu-meal-proposal-card__badge">Nuovo alimento • per 100g</span>
            {hasInheritedMicros ? (
              <span className="kentu-meal-proposal-card__badge kentu-badge--micro-inherited">
                Micro ereditati
              </span>
            ) : null}
          </div>
          <h4 className="kentu-meal-proposal-card__label">
            {donorName ? 'Etichetta + Similarity Match' : 'Etichetta'}
          </h4>
        </div>
        {donorName ? (
          <div className="kentu-meal-proposal-card__macros" aria-label="Donatore micronutrienti">
            <span className="kentu-meal-proposal-card__macro kentu-meal-proposal-card__macro--kcal">
              Micro stimati da: {donorName}
            </span>
          </div>
        ) : null}
      </header>

      <div className="kentu-meal-proposal-card__items" style={{ display: 'grid', gap: 8 }}>
        <input
          className="kentu-meal-proposal-card__edit-name"
          type="text"
          value={form.base.desc}
          onChange={(e) => setForm((p) => ({ ...p, base: { ...p.base, desc: e.target.value } }))}
          placeholder="Nome alimento"
        />

        <div className="kentu-meal-proposal-card__edit-fields">
          <input
            className="kentu-meal-proposal-card__edit-grams"
            type="number"
            value={form.base.kcal ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, base: { ...p.base, kcal: round1(e.target.value) } }))}
            placeholder="kcal"
            aria-label="kcal per 100g"
          />
          <span className="kentu-meal-proposal-card__edit-grams-suffix">kcal</span>
          <span />
        </div>

        <div className="kentu-meal-proposal-card__edit-fields">
          <input
            className="kentu-meal-proposal-card__edit-grams"
            type="number"
            value={form.base.prot ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, base: { ...p.base, prot: round1(e.target.value) } }))}
            placeholder="P"
            aria-label="proteine per 100g"
          />
          <span className="kentu-meal-proposal-card__edit-grams-suffix">g</span>
          <span />
        </div>

        <div className="kentu-meal-proposal-card__edit-fields">
          <input
            className="kentu-meal-proposal-card__edit-grams"
            type="number"
            value={form.base.carb ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, base: { ...p.base, carb: round1(e.target.value) } }))}
            placeholder="C"
            aria-label="carboidrati per 100g"
          />
          <span className="kentu-meal-proposal-card__edit-grams-suffix">g</span>
          <span />
        </div>

        <div className="kentu-meal-proposal-card__edit-fields">
          <input
            className="kentu-meal-proposal-card__edit-grams"
            type="number"
            value={form.base.fatTotal ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, base: { ...p.base, fatTotal: round1(e.target.value) } }))}
            placeholder="G"
            aria-label="grassi per 100g"
          />
          <span className="kentu-meal-proposal-card__edit-grams-suffix">g</span>
          <span />
        </div>

        <div className="kentu-meal-proposal-card__edit-fields">
          <input
            className="kentu-meal-proposal-card__edit-grams"
            type="number"
            value={form.base.fibre ?? ''}
            onChange={(e) => setForm((p) => ({ ...p, base: { ...p.base, fibre: round1(e.target.value) } }))}
            placeholder="Fibre"
            aria-label="fibre per 100g"
          />
          <span className="kentu-meal-proposal-card__edit-grams-suffix">g</span>
          <span />
        </div>

        {donorName ? (
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.78rem', color: '#cbd5e1' }}>
            <input
              type="checkbox"
              checked={useInheritedMicros}
              onChange={(e) => setUseInheritedMicros(e.target.checked)}
            />
            Usa micro-nutrienti ereditati dal donatore
          </label>
        ) : null}

        {useInheritedMicros ? (
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', color: '#7dd3fc', fontWeight: 700, fontSize: '0.78rem' }}>
              Modifica micro-nutrienti (opzionale)
            </summary>
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 90px', gap: 8 }}>
              {microKeys.slice(0, 24).map((k) => (
                <div key={k} style={{ display: 'contents' }}>
                  <span style={{ color: '#cbd5e1', fontSize: '0.74rem' }}>{k}</span>
                  <input
                    className="kentu-meal-proposal-card__edit-grams"
                    type="number"
                    value={form.micros[k] ?? ''}
                    onChange={(e) => setForm((p) => ({ ...p, micros: { ...p.micros, [k]: round1(e.target.value) } }))}
                    aria-label={`micro ${k}`}
                  />
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <footer className="kentu-meal-proposal-card__footer">
        <KentuButton
          variant="primary"
          className="kentu-meal-proposal-card__confirm"
          disabled={isSaving}
          onClick={handleSave}
        >
          {isSaving ? 'Salvataggio…' : 'Salva nel Database'}
        </KentuButton>
      </footer>
    </article>
  );
}

