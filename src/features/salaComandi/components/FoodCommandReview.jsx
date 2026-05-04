import React, { useEffect, useMemo, useState } from 'react';

import { lookupFoodCandidate } from '@/features/salaComandi/engines/foodLookupEngine';

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

const INPUT_ROW = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginTop: 8,
};

const INPUT_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: 'rgba(175, 185, 198, 0.95)',
};

const INPUT_FIELD = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: 13,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid rgba(255, 255, 255, 0.12)',
  background: 'rgba(0, 0, 0, 0.25)',
  color: 'rgba(245, 248, 252, 0.95)',
  fontFamily: 'inherit',
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
    case 'manual':
      return 'inserimento manuale';
    case 'lookup':
      return 'da ricerca database';
    case 'provisional_estimate':
      return 'stima provvisoria (non verificata)';
    default:
      return '';
  }
}

function normalizeManualKeyName(name) {
  const s = String(name || '').trim().toLowerCase().replace(/\s+/g, '_');
  const slug = s.replace(/[^a-z0-9_]/g, '').slice(0, 48);
  return slug || 'item';
}

function parseManualMacro(n) {
  const x = Number(String(n).replace(',', '.'));
  if (!Number.isFinite(x) || x < 0) return 0;
  return x;
}

function parseManualQuantity(n, fallback) {
  const x = Number(String(n).replace(',', '.'));
  if (!Number.isFinite(x) || x <= 0) return fallback;
  return Math.round(x);
}

function isConfirmableRow(item, idx, selectedCandidates) {
  const st = item?.status;
  if (st === 'ready') return !!item?.matchedFood;
  if (st === 'ambiguous') {
    const cand = Array.isArray(item?.candidates) ? item.candidates : [];
    return cand.length > 0 && !!selectedCandidates[idx];
  }
  return false;
}

function itemHasSelectableCandidates(item) {
  const c = item?.candidates;
  return Array.isArray(c) && c.length > 0;
}

/**
 * Come trattare la riga in UI e conferma (needs_review → ambiguous se ha candidates, altrimenti no_match).
 * @returns {'ready' | 'ambiguous' | 'no_match' | 'unknown'}
 */
function effectiveRowKind(item) {
  const st = item?.status;
  if (st === 'ready') return 'ready';
  if (st === 'ambiguous') return 'ambiguous';
  if (st === 'needs_review' && itemHasSelectableCandidates(item)) return 'ambiguous';
  if (st === 'no_match') return 'no_match';
  if (st === 'needs_review') return 'no_match';
  return 'unknown';
}

const STATUS_DEBUG = {
  fontSize: 10,
  fontFamily: 'ui-monospace, monospace',
  color: 'rgba(255, 190, 120, 0.95)',
  marginTop: 8,
  paddingTop: 6,
  borderTop: '1px dashed rgba(255,255,255,0.12)',
};

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
  /** @type {Record<number, object>} no_match confermati manualmente (item completi pronti per onConfirm) */
  const [manualConfirmedByIdx, setManualConfirmedByIdx] = useState({});
  /** @type {Record<number, true>} form manuale aperto per riga */
  const [manualFormOpen, setManualFormOpen] = useState({});
  /**
   * @type {Record<number, { nome: string, quantity: string|number, kcal: string|number, prot: string|number, carb: string|number, fat: string|number }>}
   */
  const [manualDraftByIdx, setManualDraftByIdx] = useState({});
  /** @type {Record<number, 'manual' | 'provisional'>} */
  const [manualFormModeByIdx, setManualFormModeByIdx] = useState({});
  const [lookupResults, setLookupResults] = useState({});
  /** @type {Record<number, object>} no_match risolti con lookup (item pronti per onConfirm) */
  const [lookupConfirmedByIdx, setLookupConfirmedByIdx] = useState({});

  const safeData = data != null && typeof data === 'object' ? data : null;
  const items = Array.isArray(safeData?.items) ? safeData.items : [];
  const safeFoodDb = foodDb != null && typeof foodDb === 'object' ? foodDb : {};

  useEffect(() => {
    setSelectedCandidates({});
    setIgnoredItems({});
    setManualConfirmedByIdx({});
    setManualFormOpen({});
    setManualDraftByIdx({});
    setManualFormModeByIdx({});
    setLookupResults({});
    setLookupConfirmedByIdx({});
  }, [data]);

  const noop = () => {};

  const handleCancel = typeof onCancel === 'function' ? onCancel : noop;

  const canConfirm = useMemo(() => {
    if (items.length === 0) return false;

    let addableCount = 0;

    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      const kind = effectiveRowKind(it);

      if (kind === 'ambiguous') {
        const cand = Array.isArray(it?.candidates) ? it.candidates : [];
        if (cand.length === 0) return false;
        if (!selectedCandidates[i]) return false;
        addableCount += 1;
        continue;
      }

      if (kind === 'no_match') {
        if (ignoredItems[i]) continue;
        if (manualConfirmedByIdx[i]) {
          addableCount += 1;
          continue;
        }
        if (lookupConfirmedByIdx[i]) {
          addableCount += 1;
          continue;
        }
        return false;
      }

      if (kind === 'ready' && isConfirmableRow(it, i, selectedCandidates)) {
        addableCount += 1;
        continue;
      }

      if (kind === 'unknown') return false;
    }

    return addableCount >= 1;
  }, [items, selectedCandidates, ignoredItems, manualConfirmedByIdx, lookupConfirmedByIdx]);

  const buildConfirmedItems = () => {
    const out = [];
    for (let idx = 0; idx < items.length; idx += 1) {
      const item = items[idx];
      const kind = effectiveRowKind(item);

      if (kind === 'no_match') {
        if (ignoredItems[idx]) continue;
        const manualItem = manualConfirmedByIdx[idx];
        const lookupItem = lookupConfirmedByIdx[idx];
        if (lookupItem) out.push(cloneItem(lookupItem));
        else if (manualItem) out.push(cloneItem(manualItem));
        continue;
      }

      if (kind === 'ambiguous') {
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

      if (kind === 'ready' && item?.matchedFood) {
        out.push(cloneItem(item));
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
          const rowKind = effectiveRowKind(item);
          const isLast = idx === lastIdx;

          let body = null;
          if (rowKind === 'ambiguous') {
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
          } else if (rowKind === 'no_match') {
            const raw =
              typeof item?.rawName === 'string'
                ? item.rawName.trim()
                : '';
            const notFoundLabel = 'Non trovato';
            const ignored = !!ignoredItems[idx];
            const manualItem = manualConfirmedByIdx[idx];
            const formOpen = !!manualFormOpen[idx];
            const defaultQty = item.quantity ?? item.suggestedQuantity ?? 100;
            const draft = manualDraftByIdx[idx];
            const formMode = manualFormModeByIdx[idx] ?? 'manual';

            const emptyDraft = () => ({
              nome: raw || '',
              quantity: defaultQty,
              kcal: '',
              prot: '',
              carb: '',
              fat: '',
            });

            const provisionalDraft = () => ({
              nome: raw || '',
              quantity: 100,
              kcal: 0,
              prot: 0,
              carb: 0,
              fat: 0,
            });

            const openManualForm = () => {
              setManualFormModeByIdx((prev) => ({ ...prev, [idx]: 'manual' }));
              setManualFormOpen((prev) => ({ ...prev, [idx]: true }));
              setManualDraftByIdx((prev) => ({
                ...prev,
                [idx]: emptyDraft(),
              }));
            };

            const openProvisionalForm = () => {
              setManualFormModeByIdx((prev) => ({ ...prev, [idx]: 'provisional' }));
              setManualFormOpen((prev) => ({ ...prev, [idx]: true }));
              setManualDraftByIdx((prev) => ({
                ...prev,
                [idx]: provisionalDraft(),
              }));
            };

            const updateDraft = (field, value) => {
              setManualDraftByIdx((prev) => {
                const cur = prev[idx];
                const fb = formMode === 'provisional' ? provisionalDraft() : emptyDraft();
                return {
                  ...prev,
                  [idx]: { ...(cur || fb), [field]: value },
                };
              });
            };

            const applyManualFood = () => {
              const mode = manualFormModeByIdx[idx] ?? 'manual';
              const baseDraft = mode === 'provisional' ? provisionalDraft() : emptyDraft();
              const d = manualDraftByIdx[idx] || baseDraft;
              const nomeTrim = String(d.nome ?? '').trim() || raw || 'Alimento';
              const qtyFallback = mode === 'provisional' ? 100 : defaultQty;
              const quantity = parseManualQuantity(d.quantity, qtyFallback);
              const kcal = parseManualMacro(d.kcal);
              const prot = parseManualMacro(d.prot);
              const carb = parseManualMacro(d.carb);
              const fat = parseManualMacro(d.fat);
              const isProv = mode === 'provisional';
              const built = {
                ...item,
                status: 'ready',
                matchedFood: isProv
                  ? {
                      key: `provisional_${normalizeManualKeyName(nomeTrim)}_${Date.now()}`,
                      desc: nomeTrim,
                      kcal,
                      prot,
                      carb,
                      fat,
                      defaultQty: quantity,
                      source: 'USER_ESTIMATE',
                      estimated: true,
                    }
                  : {
                      key: `manual_${normalizeManualKeyName(nomeTrim)}_${Date.now()}`,
                      desc: nomeTrim,
                      kcal,
                      prot,
                      carb,
                      fat,
                      defaultQty: quantity,
                    },
                quantity,
                suggestedQuantity: quantity,
                quantitySource: isProv ? 'provisional_estimate' : 'manual',
              };
              setManualConfirmedByIdx((prev) => ({ ...prev, [idx]: built }));
              setManualFormOpen((prev) => {
                const n = { ...prev };
                delete n[idx];
                return n;
              });
              setManualFormModeByIdx((prev) => {
                const n = { ...prev };
                delete n[idx];
                return n;
              });
              setLookupResults((prev) => {
                const n = { ...prev };
                delete n[idx];
                return n;
              });
              setLookupConfirmedByIdx((prev) => {
                const n = { ...prev };
                delete n[idx];
                return n;
              });
            };

            const lookupItem = lookupConfirmedByIdx[idx];
            const lookupRes = lookupResults[idx];

            const runLookup = () => {
              const q = typeof item?.rawName === 'string' ? item.rawName : '';
              console.log('[FoodLookup debug] query', item.rawName);
              console.log('[FoodLookup debug] foodDb exists', Boolean(foodDb));
              console.log('[FoodLookup debug] foodDb size', foodDb ? Object.keys(foodDb).length : 0);
              console.log('[FoodLookup debug] sample keys', foodDb ? Object.keys(foodDb).slice(0, 5) : []);
              console.log(
                '[FoodLookup debug] sample values',
                foodDb ? Object.values(foodDb).slice(0, 3).map((f) => f?.desc ?? f?.name) : [],
              );
              const result = lookupFoodCandidate({
                query: q,
                creaDb: safeFoodDb,
                usdaDb: null,
              });
              console.log('[FoodLookup debug] result', result);
              setLookupResults((prev) => ({ ...prev, [idx]: result }));
            };

            const applyLookupChoice = (result) => {
              if (!result || result.status !== 'matched' || !result.candidate) return;
              const cand = result.candidate;
              const quantity =
                item.quantity ?? item.suggestedQuantity ?? cand.defaultQty ?? 100;
              const suggestedQuantity = cand.defaultQty ?? 100;
              const built = {
                ...item,
                status: 'ready',
                matchedFood: cand,
                quantity,
                suggestedQuantity,
                quantitySource: 'lookup',
              };
              setLookupConfirmedByIdx((prev) => ({ ...prev, [idx]: built }));
              setLookupResults((prev) => {
                const n = { ...prev };
                delete n[idx];
                return n;
              });
              setManualConfirmedByIdx((prev) => {
                const n = { ...prev };
                delete n[idx];
                return n;
              });
              setManualFormOpen((prev) => {
                const n = { ...prev };
                delete n[idx];
                return n;
              });
              setManualFormModeByIdx((prev) => {
                const n = { ...prev };
                delete n[idx];
                return n;
              });
              setManualDraftByIdx((prev) => {
                const n = { ...prev };
                delete n[idx];
                return n;
              });
            };

            if (lookupItem) {
              const mf = lookupItem.matchedFood;
              const desc =
                mf && typeof mf === 'object' && typeof mf.desc === 'string'
                  ? mf.desc.trim()
                  : raw || 'Alimento';
              const src =
                mf && typeof mf === 'object' && typeof mf.source === 'string'
                  ? mf.source
                  : '';
              const qtyDisp =
                lookupItem.quantity != null && Number(lookupItem.quantity) > 0
                  ? Number(lookupItem.quantity)
                  : null;
              body = (
                <>
                  <div style={{ fontSize: 14, fontWeight: 620 }}>
                    {desc || raw || 'Alimento'}
                  </div>
                  {src ? (
                    <div style={{ ...MUTED, marginBottom: 4 }}>Fonte: {src}</div>
                  ) : null}
                  {qtyDisp != null && (
                    <div style={{ fontSize: 13, marginTop: 6, color: 'rgba(215, 222, 230, 0.92)' }}>
                      Quantità: {qtyDisp}
                      {' g'}
                    </div>
                  )}
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 13,
                      fontWeight: 650,
                      color: 'rgba(130, 210, 160, 0.95)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span aria-hidden>✅</span>
                    Trovato nel database
                  </div>
                </>
              );
            } else if (manualItem) {
              const mf = manualItem.matchedFood;
              const desc =
                mf && typeof mf === 'object' && typeof mf.desc === 'string'
                  ? mf.desc.trim()
                  : raw || 'Alimento';
              const isProvisional =
                manualItem.quantitySource === 'provisional_estimate'
                || (mf && typeof mf === 'object' && mf.estimated === true);
              const qtyDisp =
                manualItem.quantity != null && Number(manualItem.quantity) > 0
                  ? Number(manualItem.quantity)
                  : null;
              body = (
                <>
                  <div style={{ fontSize: 14, fontWeight: 620 }}>
                    {desc || raw || 'Alimento'}
                  </div>
                  {qtyDisp != null && (
                    <div style={{ fontSize: 13, marginTop: 6, color: 'rgba(215, 222, 230, 0.92)' }}>
                      Quantità: {qtyDisp}
                      {' g'}
                    </div>
                  )}
                  {isProvisional ? (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'rgba(255, 200, 120, 0.95)',
                        lineHeight: 1.4,
                      }}
                    >
                      ⚠️ Stima provvisoria · valori NON verificati
                    </div>
                  ) : null}
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 13,
                      fontWeight: 650,
                      color: 'rgba(130, 210, 160, 0.95)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span aria-hidden>✅</span>
                    {isProvisional ? 'Stima provvisoria registrata' : 'Aggiunto manualmente'}
                  </div>
                </>
              );
            } else if (ignored) {
              body = (
                <>
                  <div style={{ fontSize: 14, fontWeight: 620 }}>{raw || 'Voce sconosciuta'}</div>
                  <div style={{ ...MUTED, marginBottom: 8 }}>{notFoundLabel}</div>
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
                </>
              );
            } else {
              body = (
                <>
                  <div style={{ fontSize: 14, fontWeight: 620 }}>{raw || 'Voce sconosciuta'}</div>
                  <div style={{ ...MUTED, marginBottom: 8 }}>{notFoundLabel}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <button
                      type="button"
                      style={BTN_GHOST}
                      onClick={() => {
                        setIgnoredItems((prev) => ({ ...prev, [idx]: true }));
                        setManualFormOpen((prev) => {
                          const n = { ...prev };
                          delete n[idx];
                          return n;
                        });
                        setManualFormModeByIdx((prev) => {
                          const n = { ...prev };
                          delete n[idx];
                          return n;
                        });
                        setManualDraftByIdx((prev) => {
                          const n = { ...prev };
                          delete n[idx];
                          return n;
                        });
                        setLookupResults((prev) => {
                          const n = { ...prev };
                          delete n[idx];
                          return n;
                        });
                        setLookupConfirmedByIdx((prev) => {
                          const n = { ...prev };
                          delete n[idx];
                          return n;
                        });
                      }}
                    >
                      Ignora
                    </button>
                    <button type="button" style={BTN_SECONDARY} onClick={runLookup}>
                      Trova alimento simile
                    </button>
                    <button type="button" style={BTN_PRIMARY} onClick={openManualForm}>
                      Inserisci manualmente
                    </button>
                    {item?.status === 'no_match' ? (
                      <button type="button" style={BTN_SECONDARY} onClick={openProvisionalForm}>
                        Stima provvisoria
                      </button>
                    ) : null}
                  </div>
                  {lookupRes && !lookupItem ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(0,0,0,0.18)',
                      }}
                    >
                      {lookupRes.status === 'matched' && lookupRes.candidate ? (
                        <>
                          <div style={{ fontSize: 14, fontWeight: 620 }}>
                            {String(lookupRes.candidate.desc || '').trim() || 'Alimento'}
                          </div>
                          {lookupRes.source ? (
                            <div style={{ ...MUTED, marginTop: 4 }}>
                              Fonte: {lookupRes.source}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            style={{ ...BTN_PRIMARY, marginTop: 10 }}
                            onClick={() => applyLookupChoice(lookupRes)}
                          >
                            Usa questo
                          </button>
                        </>
                      ) : null}
                      {lookupRes.status === 'needs_ai_estimate' ? (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                            Nessun match preciso trovato
                          </div>
                          {Array.isArray(lookupRes.alternatives) && lookupRes.alternatives.length > 0 ? (
                            <ul
                              style={{
                                margin: 0,
                                paddingLeft: 18,
                                fontSize: 12,
                                color: 'rgba(205, 215, 225, 0.92)',
                              }}
                            >
                              {lookupRes.alternatives.map((alt, j) => (
                                <li key={`${String(alt?.key ?? j)}-${j}`} style={{ marginBottom: 6 }}>
                                  {typeof alt?.desc === 'string' && alt.desc.trim()
                                    ? alt.desc.trim()
                                    : String(alt?.key ?? 'Voce')}
                                  {alt?.source ? (
                                    <span style={{ color: 'rgba(160, 175, 190, 0.8)' }}>
                                      {' '}
                                      · {alt.source}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </>
                      ) : null}
                      {lookupRes.status === 'not_found' ? (
                        <div style={{ fontSize: 13 }}>
                          Nessuna corrispondenza trovata nei database
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {formOpen && draft ? (
                    <div
                      style={{
                        marginTop: 6,
                        padding: 12,
                        borderRadius: 10,
                        border:
                          formMode === 'provisional'
                            ? '1px solid rgba(255, 193, 7, 0.45)'
                            : '1px solid rgba(120, 175, 255, 0.35)',
                        background:
                          formMode === 'provisional'
                            ? 'rgba(255, 193, 7, 0.08)'
                            : 'rgba(94, 160, 255, 0.06)',
                      }}
                    >
                      {formMode === 'provisional' ? (
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 650,
                            color: 'rgba(255, 210, 120, 0.98)',
                            marginBottom: 10,
                            lineHeight: 1.45,
                          }}
                        >
                          ⚠️ Stima non verificata: modifica i valori prima di confermare.
                        </div>
                      ) : null}
                      <div style={INPUT_ROW}>
                        <label style={INPUT_LABEL} htmlFor={`manual-nome-${idx}`}>
                          Nome alimento
                        </label>
                        <input
                          id={`manual-nome-${idx}`}
                          type="text"
                          style={INPUT_FIELD}
                          value={draft.nome}
                          onChange={(e) => updateDraft('nome', e.target.value)}
                          autoComplete="off"
                        />
                      </div>
                      <div style={INPUT_ROW}>
                        <label style={INPUT_LABEL} htmlFor={`manual-qty-${idx}`}>
                          Quantità (g)
                        </label>
                        <input
                          id={`manual-qty-${idx}`}
                          type="number"
                          min={1}
                          step={1}
                          style={INPUT_FIELD}
                          value={draft.quantity}
                          onChange={(e) => updateDraft('quantity', e.target.value)}
                        />
                      </div>
                      <div style={INPUT_ROW}>
                        <label style={INPUT_LABEL} htmlFor={`manual-kcal-${idx}`}>
                          kcal
                        </label>
                        <input
                          id={`manual-kcal-${idx}`}
                          type="number"
                          min={0}
                          step={0.1}
                          style={INPUT_FIELD}
                          value={draft.kcal}
                          onChange={(e) => updateDraft('kcal', e.target.value)}
                        />
                      </div>
                      <div style={INPUT_ROW}>
                        <label style={INPUT_LABEL} htmlFor={`manual-prot-${idx}`}>
                          Proteine
                        </label>
                        <input
                          id={`manual-prot-${idx}`}
                          type="number"
                          min={0}
                          step={0.1}
                          style={INPUT_FIELD}
                          value={draft.prot}
                          onChange={(e) => updateDraft('prot', e.target.value)}
                        />
                      </div>
                      <div style={INPUT_ROW}>
                        <label style={INPUT_LABEL} htmlFor={`manual-carb-${idx}`}>
                          Carboidrati
                        </label>
                        <input
                          id={`manual-carb-${idx}`}
                          type="number"
                          min={0}
                          step={0.1}
                          style={INPUT_FIELD}
                          value={draft.carb}
                          onChange={(e) => updateDraft('carb', e.target.value)}
                        />
                      </div>
                      <div style={INPUT_ROW}>
                        <label style={INPUT_LABEL} htmlFor={`manual-fat-${idx}`}>
                          Grassi
                        </label>
                        <input
                          id={`manual-fat-${idx}`}
                          type="number"
                          min={0}
                          step={0.1}
                          style={INPUT_FIELD}
                          value={draft.fat}
                          onChange={(e) => updateDraft('fat', e.target.value)}
                        />
                      </div>
                      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        <button type="button" style={BTN_PRIMARY} onClick={applyManualFood}>
                          Usa questo alimento
                        </button>
                        <button
                          type="button"
                          style={BTN_SECONDARY}
                          onClick={() => {
                            setManualFormOpen((prev) => {
                              const n = { ...prev };
                              delete n[idx];
                              return n;
                            });
                            setManualFormModeByIdx((prev) => {
                              const n = { ...prev };
                              delete n[idx];
                              return n;
                            });
                          }}
                        >
                          Chiudi
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              );
            }
          } else if (rowKind === 'ready') {
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
          } else {
            const rawFallback =
              typeof item?.rawName === 'string' ? item.rawName.trim() : '';
            body = (
              <>
                <div style={{ fontSize: 14, fontWeight: 620 }}>{rawFallback || 'Voce'}</div>
                <div style={{ ...MUTED, marginBottom: 8 }}>
                  Stato non gestito (kind: {String(rowKind)}, status: {String(status)})
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
              <div style={STATUS_DEBUG}>
                status:
                {' '}
                {String(status)}
              </div>
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
