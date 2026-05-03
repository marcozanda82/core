import React, { useEffect, useMemo, useState } from 'react';

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

function safeFiniteNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? Math.round(x) : null;
}

/**
 * Snapshot compatibile con meal / foodCommandItem (stesso spirito di foodCommandEngine).
 * @param {string} key
 * @param {Record<string, object> | null | undefined} foodDb
 * @param {string} [fallbackDesc]
 */
function matchedFoodFromCandidateKey(key, foodDb, fallbackDesc = '') {
  const row = foodDb != null && typeof foodDb === 'object' ? foodDb[key] : null;
  if (!row || typeof row !== 'object') {
    return {
      key,
      desc: String(fallbackDesc || key).trim() || key,
      defaultQty: null,
    };
  }
  const desc = String(row.desc ?? row.name ?? '').trim();
  return {
    key,
    desc: desc || key,
    defaultQty: safeFiniteNumber(row.defaultQty),
    kcal: row.kcal,
    prot: row.prot,
    carb: row.carb,
    fat: row.fat,
    fatTotal: row.fatTotal ?? row.fat,
    fibre: row.fibre,
  };
}

function cloneItem(item) {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(item);
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(JSON.stringify(item));
}

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
    case 'selected_candidate':
      return 'da selezione';
    default:
      return '';
  }
}

function isConfirmableRow(item, idx, selectedCandidates) {
  const st = item?.status;
  if (st === 'ready') return !!item?.matchedFood;
  if (st === 'needs_review') return !!item?.matchedFood;
  if (st === 'ambiguous') {
    const cand = Array.isArray(item?.candidates) ? item.candidates : [];
    return cand.length > 0 && !!selectedCandidates[idx];
  }
  return false;
}

/**
 * @param {object} props
 * @param {object} [props.data]
 * @param {Record<string, object>} [props.foodDb]
 * @param {(items: object[]) => void} [props.onConfirm]
 * @param {() => void} [props.onCancel]
 */
export default function FoodCommandReview({ data, foodDb, onConfirm, onCancel }) {
  /** @type {Record<number, { key: string, desc: string, score?: number }>} */
  const [selectedCandidates, setSelectedCandidates] = useState({});
  /** @type {Record<number, true>} indici degli item no_match marcati come ignorati */
  const [ignoredItems, setIgnoredItems] = useState({});

  const safeData = data != null && typeof data === 'object' ? data : null;
  const items = Array.isArray(safeData?.items) ? safeData.items : [];

  useEffect(() => {
    setSelectedCandidates({});
    setIgnoredItems({});
  }, [data]);

  const noop = () => {};

  const handleCancel = typeof onCancel === 'function' ? onCancel : noop;

  const canConfirm = useMemo(() => {
    if (items.length === 0) return false;

    let addableCount = 0;

    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      const st = it?.status;

      if (st === 'ambiguous') {
        const cand = Array.isArray(it?.candidates) ? it.candidates : [];
        if (cand.length === 0) return false;
        if (!selectedCandidates[i]) return false;
        addableCount += 1;
        continue;
      }

      if (st === 'no_match') {
        if (!ignoredItems[i]) return false;
        continue;
      }

      if (isConfirmableRow(it, i, selectedCandidates)) addableCount += 1;
    }

    return addableCount >= 1;
  }, [items, selectedCandidates, ignoredItems]);

  const buildConfirmedItems = () => {
    const out = [];
    for (let idx = 0; idx < items.length; idx += 1) {
      const item = items[idx];
      const status = item?.status;

      if (status === 'no_match') continue;

      if (status === 'ambiguous') {
        const sel = selectedCandidates[idx];
        const candSlice = Array.isArray(item?.candidates) ? item.candidates.slice(0, 3) : [];
        if (!sel && candSlice.length === 0) continue;
        if (!sel) continue;
        const fallbackDesc =
          typeof sel.desc === 'string' && sel.desc.trim() ? sel.desc.trim() : '';
        const matchedFood = matchedFoodFromCandidateKey(String(sel.key), foodDb, fallbackDesc);
        const dq = matchedFood.defaultQty;
        out.push({
          ...item,
          status: 'ready',
          matchedFood,
          quantity: item.quantity ?? item.suggestedQuantity ?? dq ?? null,
          suggestedQuantity: item.suggestedQuantity ?? dq ?? null,
          quantitySource: item.quantitySource ?? 'selected_candidate',
        });
        continue;
      }

      if (
        status === 'ready'
        || status === 'needs_review'
      ) {
        if (item?.matchedFood) out.push(cloneItem(item));
      }
    }
    return out;
  };

  const handleConfirm = () => {
    if (!canConfirm) return;
    const list = buildConfirmedItems();
    if (typeof onConfirm === 'function') onConfirm(list);
  };

  if (!safeData) return null;

  const lastIdx = items.length - 1;

  const primaryBtnStyle = {
    ...BTN_PRIMARY,
    ...(!canConfirm
      ? { opacity: 0.45, cursor: 'not-allowed' }
      : {}),
  };

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
            const selected = selectedCandidates[idx];
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
                      const isSel =
                        selected != null && String(selected.key) === String(c?.key);
                      return (
                        <div
                          key={String(c?.key ?? i)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: isSel
                              ? '1px solid rgba(120, 175, 255, 0.65)'
                              : '1px solid rgba(255, 255, 255, 0.08)',
                            background: isSel ? 'rgba(94, 160, 255, 0.12)' : 'transparent',
                          }}
                        >
                          <span style={{ fontSize: 13, color: 'rgba(215, 222, 230, 0.9)' }}>
                            {label}
                            {isSel ? (
                              <span style={{ marginLeft: 8, color: '#a5c8ff', fontWeight: 650 }}>
                                {' '}
                                ✓ Selezionato
                              </span>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            style={BTN_GHOST}
                            onClick={() => {
                              setSelectedCandidates((prev) => ({
                                ...prev,
                                [idx]: {
                                  key: String(c.key),
                                  desc: typeof c.desc === 'string' ? c.desc : label,
                                  score: c.score,
                                },
                              }));
                            }}
                          >
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
            const ignored = !!ignoredItems[idx];
            body = (
              <>
                <div style={{ fontSize: 14, fontWeight: 620 }}>{raw || 'Voce sconosciuta'}</div>
                <div style={{ ...MUTED, marginBottom: 8 }}>Non trovato</div>
                {ignored ? (
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 650,
                      color: 'rgba(180, 190, 200, 0.9)',
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: '1px dashed rgba(255,255,255,0.12)',
                      display: 'inline-block',
                      marginBottom: 6,
                    }}
                  >
                    Ignorato · non verrà aggiunto
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                      <button
                        type="button"
                        style={BTN_GHOST}
                        onClick={() => {
                          setIgnoredItems((prev) => ({ ...prev, [idx]: true }));
                        }}
                      >
                        Ignora
                      </button>
                    </div>
                    <div style={{ ...MUTED, marginBottom: 6, fontSize: 11, lineHeight: 1.4 }}>
                      Stima con AI e inserimento manuale:{' '}
                      <span style={{ color: 'rgba(200,210,225,0.55)' }}>in arrivo (presto)</span>
                    </div>
                  </>
                )}
              </>
            );
          } else {
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
        <button
          type="button"
          style={primaryBtnStyle}
          onClick={handleConfirm}
          disabled={!canConfirm}
          aria-disabled={!canConfirm}
        >
          Conferma
        </button>
      </div>
    </div>
  );
}
