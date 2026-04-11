/**
 * Carta menu interattiva (whiteboard) per proposte cena da [MEAL_PROPOSAL:...]
 */
import React, { useMemo, useState, useEffect } from 'react';

function round1(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 10) / 10;
}

export default function MenuProposalCard({ proposal, onConfirm, onSwap, onCancel }) {
  const items = Array.isArray(proposal?.items) ? proposal.items : [];
  const title =
    (proposal?.title && String(proposal.title).trim()) || 'Proposta Cena Anti-Cortisolo';

  const [checked, setChecked] = useState(() => items.map(() => true));

  useEffect(() => {
    setChecked(items.map(() => true));
  }, [proposal, items.length]);

  const totals = useMemo(() => {
    let kcal = 0;
    let prot = 0;
    let carb = 0;
    let fat = 0;
    items.forEach((it, i) => {
      if (!checked[i]) return;
      kcal += Number(it.estKcal) || 0;
      prot += Number(it.estPro) || 0;
      carb += Number(it.estCar) || 0;
      fat += Number(it.estFat) || 0;
    });
    return {
      kcal: Math.round(kcal),
      prot: round1(prot),
      carb: round1(carb),
      fat: round1(fat),
    };
  }, [items, checked]);

  const toggle = (idx) => {
    setChecked((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  };

  const selectedItems = items.filter((_, i) => checked[i]);
  const nSelected = selectedItems.length;

  return (
    <div
      className="menu-proposal-card"
      style={{
        width: '100%',
        maxWidth: '100%',
        marginTop: '6px',
        marginBottom: '8px',
        padding: '14px 14px 12px',
        borderRadius: '14px',
        border: '2px dashed rgba(255, 248, 220, 0.35)',
        background:
          'linear-gradient(165deg, rgba(28, 32, 38, 0.98) 0%, rgba(18, 20, 26, 0.99) 100%)',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.4), 0 8px 28px rgba(0,0,0,0.35)',
      }}
    >
      <div
        style={{
          fontSize: '0.68rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(255, 248, 220, 0.55)',
          marginBottom: '10px',
          fontWeight: 700,
        }}
      >
        📝 Lavagna menu
      </div>
      <h3
        style={{
          margin: '0 0 14px 0',
          fontSize: '1rem',
          fontWeight: 800,
          color: '#fff8e8',
          lineHeight: 1.25,
          textShadow: '0 1px 0 rgba(0,0,0,0.5)',
        }}
      >
        {title}
      </h3>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((it, idx) => {
          const id = it.id != null ? String(it.id) : `item_${idx}`;
          const name = String(it.name || 'Alimento').trim();
          const qty = Number(it.qty) > 0 ? Math.round(Number(it.qty)) : 100;
          const why = String(it.why || it.perche || '').trim() || '—';
          return (
            <li
              key={`${id}_${idx}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px 8px',
                marginBottom: '8px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,248,220,0.08)',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: 1, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!checked[idx]}
                  onChange={() => toggle(idx)}
                  style={{ marginTop: '4px', width: '18px', height: '18px', accentColor: '#b388ff' }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 800, color: '#fff', fontSize: '0.9rem' }}>
                    {name}{' '}
                    <span style={{ color: 'rgba(255,248,220,0.85)' }}>{qty}g</span>
                  </span>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(200, 210, 220, 0.9)', marginTop: '4px', lineHeight: 1.35 }}>
                    <span style={{ color: 'rgba(255,248,220,0.45)', fontWeight: 600 }}>Perché: </span>
                    {why}
                  </div>
                </span>
              </label>
              <button
                type="button"
                title="Chiedi sostituzione"
                onClick={() => onSwap?.(id)}
                style={{
                  flexShrink: 0,
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  border: '1px solid rgba(0, 229, 255, 0.35)',
                  background: 'rgba(0, 229, 255, 0.1)',
                  color: '#7dd3fc',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ⇄
              </button>
            </li>
          );
        })}
      </ul>

      <div
        style={{
          marginTop: '12px',
          padding: '10px 12px',
          borderRadius: '10px',
          background: 'rgba(179, 136, 255, 0.12)',
          border: '1px solid rgba(179, 136, 255, 0.25)',
          fontSize: '0.78rem',
          color: '#e8e0ff',
        }}
      >
        <strong style={{ color: '#fff' }}>Riepilogo selezione</strong>
        <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '8px 14px' }}>
          <span>
            <strong>{totals.kcal}</strong> kcal
          </span>
          <span>
            P <strong>{totals.prot}</strong>g
          </span>
          <span>
            C <strong>{totals.carb}</strong>g
          </span>
          <span>
            F <strong>{totals.fat}</strong>g
          </span>
          <span style={{ opacity: 0.75 }}>({nSelected}/{items.length} voci)</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={nSelected === 0}
          onClick={() => onConfirm?.(proposal, selectedItems)}
          style={{
            flex: 1,
            minWidth: '140px',
            padding: '12px 14px',
            borderRadius: '12px',
            border: 'none',
            background: nSelected === 0 ? '#444' : '#b388ff',
            color: nSelected === 0 ? '#888' : '#0a0a0a',
            fontWeight: 800,
            fontSize: '0.82rem',
            cursor: nSelected === 0 ? 'not-allowed' : 'pointer',
            letterSpacing: '0.04em',
          }}
        >
          Conferma Selezione
        </button>
        <button
          type="button"
          onClick={() => onCancel?.()}
          style={{
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent',
            color: 'rgba(255,248,220,0.75)',
            fontWeight: 700,
            fontSize: '0.82rem',
            cursor: 'pointer',
          }}
        >
          Annulla
        </button>
      </div>
    </div>
  );
}
