import React from 'react';

const CARD = {
  maxWidth: 420,
  margin: '0 auto',
  padding: 18,
  borderRadius: 12,
  background: 'rgba(18, 22, 28, 0.96)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  color: 'rgba(245, 248, 252, 0.95)',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
};

const TITLE = {
  fontSize: 17,
  fontWeight: 650,
  margin: '0 0 16px',
  letterSpacing: '-0.02em',
};

const MUTED = {
  fontSize: 12,
  color: 'rgba(160, 175, 190, 0.75)',
  marginTop: 6,
};

const BTN_BASE = {
  fontSize: 13,
  fontWeight: 600,
  padding: '8px 14px',
  borderRadius: 8,
  cursor: 'pointer',
  border: '1px solid transparent',
  fontFamily: 'inherit',
};

const BTN_GHOST = {
  ...BTN_BASE,
  background: 'rgba(255, 255, 255, 0.06)',
  borderColor: 'rgba(255, 255, 255, 0.12)',
  color: 'rgba(235, 240, 245, 0.95)',
};

const BTN_PRIMARY = {
  ...BTN_BASE,
  background: 'rgba(94, 160, 255, 0.22)',
  borderColor: 'rgba(120, 175, 255, 0.45)',
  color: '#eaf2ff',
};

const BTN_SECONDARY = {
  ...BTN_BASE,
  background: 'transparent',
  borderColor: 'rgba(255, 255, 255, 0.14)',
  color: 'rgba(200, 210, 220, 0.9)',
};

function quantityOriginText(source) {
  if (!source) return '';
  switch (source) {
    case 'explicit':
    case 'count_hint':
      return 'dal testo';
    case 'habit':
      return 'da storico';
    case 'default_qty':
      return 'dal database';
    default:
      return '';
  }
}

/** @param {object} props */
export default function FoodCommandReview({ data, onConfirm, onCancel }) {
  if (!data || typeof data !== 'object') return null;
  const items = Array.isArray(data.items) ? data.items : [];

  const noop = () => {};

  const handleConfirm =
    typeof onConfirm === 'function' ? onConfirm : noop;
  const handleCancel =
    typeof onCancel === 'function' ? onCancel : noop;

  const lastIdx = items.length - 1;

  return (
    <div style={CARD} role="region" aria-labelledby="food-command-review-title">
      <h2 id="food-command-review-title" style={TITLE}>
        Ho trovato questi alimenti
      </h2>

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
        }}
      >
        {items.map((item, idx) => {
          const status = item?.status;
          const isLast = idx === lastIdx;

          let body = null;
          if (status === 'ambiguous') {
            const raw =
              typeof item?.rawName === 'string'
                ? item.rawName.trim()
                : '';
            const cand = Array.isArray(item?.candidates)
              ? item.candidates.slice(0, 3)
              : [];
            body = (
              <>
                <div style={{ fontSize: 14, fontWeight: 620 }}>{raw || 'Alimento'}</div>
                {cand.length > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {cand.map((c, i) => {
                      const label =
                        typeof c?.desc === 'string' && c.desc.trim()
                          ? c.desc.trim()
                          : String(c?.key ?? `Opzione ${i + 1}`);
                      return (
                        <div key={String(c?.key ?? i)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ fontSize: 13, color: 'rgba(215, 222, 230, 0.9)' }}>
                            {label}
                          </span>
                          <button type="button" style={BTN_GHOST}>
                            Seleziona
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          } else if (status === 'no_match') {
            const raw =
              typeof item?.rawName === 'string'
                ? item.rawName.trim()
                : '';
            body = (
              <>
                <div style={{ fontSize: 14, fontWeight: 620 }}>{raw || 'Voce sconosciuta'}</div>
                <div style={{ ...MUTED, marginBottom: 10 }}>Non trovato</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button type="button" style={BTN_GHOST}>
                    Stima con AI
                  </button>
                  <button type="button" style={BTN_GHOST}>
                    Inserisci manualmente
                  </button>
                </div>
              </>
            );
          } else {
            /** ready | needs_review o altri con matchedFood */
            const desc =
              item?.matchedFood != null &&
              typeof item.matchedFood === 'object' &&
              typeof item.matchedFood.desc === 'string'
                ? item.matchedFood.desc.trim()
                : '';
            const nameText =
              desc ||
              (typeof item?.rawName === 'string' ? item.rawName.trim() : 'Alimento');
            const qty =
              item?.quantity != null && Number(item.quantity) > 0
                ? Number(item.quantity)
                : item?.suggestedQuantity != null && Number(item.suggestedQuantity) > 0
                  ? Number(item.suggestedQuantity)
                  : null;
            const origin =
              qty != null ? quantityOriginText(item?.quantitySource) : '';

            body = (
              <>
                <div style={{ fontSize: 14, fontWeight: 620 }}>{nameText}</div>
                {qty != null && (
                  <div style={{ fontSize: 13, marginTop: 6, color: 'rgba(215, 222, 230, 0.92)' }}>
                    Quantità: {qty}
                  </div>
                )}
                {origin && (
                  <div style={{ ...MUTED, fontStyle: 'italic' }}>{origin}</div>
                )}
                <div style={{ marginTop: 10 }}>
                  <button type="button" style={BTN_GHOST}>
                    modifica
                  </button>
                </div>
              </>
            );
          }

          const itemStyle = {
            paddingTop: 14,
            paddingBottom: 14,
            borderBottom: isLast
              ? undefined
              : '1px solid rgba(255, 255, 255, 0.06)',
          };

          return (
            <li key={`food-review-${idx}`} style={itemStyle}>
              {body}
            </li>
          );
        })}
      </ul>

      <div
        style={{
          marginTop: 18,
          paddingTop: 16,
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          justifyContent: 'flex-end',
        }}
      >
        <button type="button" style={BTN_SECONDARY} onClick={handleCancel}>
          Annulla
        </button>
        <button type="button" style={BTN_PRIMARY} onClick={handleConfirm}>
          Conferma
        </button>
      </div>
    </div>
  );
}
