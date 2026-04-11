import React, { useMemo } from 'react';

const EXCLUDED_KEYS = new Set([
  'id', 'type', 'mealType', 'mealTime', 'meal_time', 'desc', 'name', 'nome',
  'unitStep', 'ingredients', 'isRecipe', 'dbKey', 'foodDbKey', 'qta', 'weight',
  'timestamp', 'createdAt', 'index', 'cal', 'source', 'barcode', 'photoUrl',
]);

const LABEL_IT = {
  kcal: 'Energia (kcal)',
  prot: 'Proteine',
  carb: 'Carboidrati',
  fat: 'Grassi (totali)',
  fatTotal: 'Grassi (totali)',
  fibre: 'Fibre',
  zuccheri: 'Zuccheri',
  sugars: 'Zuccheri',
  sugar: 'Zuccheri',
  na: 'Sodio',
  k: 'Potassio',
  vitc: 'Vitamina C',
  vitD: 'Vitamina D',
  vitA: 'Vitamina A',
  vitE: 'Vitamina E',
  vitK: 'Vitamina K',
  vitB1: 'Vitamina B1',
  vitB2: 'Vitamina B2',
  vitB3: 'Vitamina B3',
  vitB5: 'Vitamina B5',
  vitB6: 'Vitamina B6',
  b9: 'Acido folico',
  vitB12: 'Vitamina B12',
  ca: 'Calcio',
  fe: 'Ferro',
  mg: 'Magnesio',
  p: 'Fosforo',
  zn: 'Zinco',
  cu: 'Rame',
  se: 'Selenio',
  omega3: 'Omega-3',
  omega6: 'Omega-6',
  fatSat: 'Grassi saturi',
  fatMono: 'Grassi monoinsaturi',
  fatPoly: 'Grassi polinsaturi',
  fatTrans: 'Grassi trans',
  colest: 'Colesterolo',
  leu: 'Leucina',
  iso: 'Isoleucina',
  val: 'Valina',
  lys: 'Lisina',
  met: 'Metionina',
  phe: 'Fenilalanina',
  thr: 'Treonina',
  trp: 'Triptofano',
  his: 'Istidina',
};

const PRIORITY_ORDER = [
  'kcal', 'prot', 'carb', 'fatTotal', 'fat', 'fibre', 'zuccheri', 'sugars', 'sugar',
  'na', 'k', 'vitc', 'vitD', 'vitA', 'ca', 'fe', 'mg', 'p', 'omega3', 'omega6',
];

function findFoodDbKey(foodItem, foodDb) {
  if (!foodDb || !foodItem || typeof foodDb !== 'object') return null;
  if (foodItem.foodDbKey && foodDb[foodItem.foodDbKey]) return foodItem.foodDbKey;
  const name = String(foodItem.desc || foodItem.name || foodItem.nome || '').trim().toLowerCase();
  if (!name) return null;
  for (const [k, v] of Object.entries(foodDb)) {
    if (!v || typeof v !== 'object') continue;
    const d = String(v.desc || v.name || '').trim().toLowerCase();
    if (d === name) return k;
  }
  return null;
}

function collectNumericKeys(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj).filter((k) => {
    if (EXCLUDED_KEYS.has(k)) return false;
    const v = obj[k];
    return typeof v === 'number' && Number.isFinite(v);
  });
}

function formatCell(key, v) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (key === 'kcal' || key === 'cal') return `${Math.round(v)}`;
  if (/^(vit|b9|vitB)/i.test(key) && v < 50 && v > 0) return `${Math.round(v * 100) / 100}`;
  if (Math.abs(v) >= 100) return `${Math.round(v)}`;
  return `${Math.round(v * 10) / 10}`;
}

const UNIT_G = new Set(['prot', 'carb', 'fat', 'fatTotal', 'fibre', 'zuccheri', 'sugars', 'sugar', 'fatSat', 'fatMono', 'fatPoly', 'fatTrans', 'omega3', 'omega6']);
const UNIT_MG = new Set(['na', 'k', 'ca', 'fe', 'mg', 'p', 'zn', 'cu', 'se', 'vitc', 'vitB1', 'vitB2', 'vitB3', 'vitB5', 'vitB6', 'b9', 'vitB12', 'vitE', 'colest']);
const UNIT_UG = new Set(['vitD', 'vitA', 'vitK']);
const AMINO_MG = ['leu', 'iso', 'val', 'lys', 'met', 'phe', 'thr', 'trp', 'his'];

function suffixForKey(key) {
  if (key === 'kcal' || key === 'cal') return ' kcal';
  if (UNIT_G.has(key)) return ' g';
  if (UNIT_MG.has(key) || AMINO_MG.includes(key)) return ' mg';
  if (UNIT_UG.has(key)) return ' µg';
  return '';
}

/**
 * Modale etichetta nutrizionale: colonne Per 100 g e Per porzione.
 */
export default function FoodLabelModal({ foodItem, foodDb, onClose }) {
  const { title, portionG, rows, isRecipe } = useMemo(() => {
    if (!foodItem || typeof foodItem !== 'object') {
      return { title: 'Alimento', portionG: 100, rows: [], isRecipe: false };
    }
    const portionG = Math.max(1, Math.round(Number(foodItem.qta ?? foodItem.weight ?? 100) || 100));
    const dbKey = findFoodDbKey(foodItem, foodDb);
    const dbEntry = dbKey && foodDb[dbKey] ? { ...foodDb[dbKey] } : {};
    const title = String(foodItem.desc || foodItem.name || foodItem.nome || dbEntry.desc || dbEntry.name || 'Alimento');
    const recipe = foodItem.type === 'recipe' || foodItem.isRecipe === true;

    const keySet = new Set([
      ...collectNumericKeys(foodItem),
      ...collectNumericKeys(dbEntry),
    ]);
    ['kcal', 'prot', 'carb', 'fat', 'fatTotal', 'fibre', 'zuccheri', 'na', 'k'].forEach((k) => {
      if (foodItem[k] != null && typeof foodItem[k] === 'number') keySet.add(k);
      if (dbEntry[k] != null && typeof dbEntry[k] === 'number') keySet.add(k);
    });

    const sortedKeys = [...keySet]
      .filter((k) => !(k === 'fat' && keySet.has('fatTotal')))
      .sort((a, b) => {
        const ia = PRIORITY_ORDER.indexOf(a);
        const ib = PRIORITY_ORDER.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b);
      });

    const rowsOut = sortedKeys.map((key) => {
      const fromItem = foodItem[key];
      const fromDb = dbEntry[key];
      let perPortion = null;
      if (typeof fromItem === 'number' && Number.isFinite(fromItem)) {
        perPortion = fromItem;
      } else if (typeof fromDb === 'number' && Number.isFinite(fromDb)) {
        perPortion = (fromDb * portionG) / 100;
      }
      let per100 = null;
      if (perPortion != null && portionG > 0) {
        per100 = (perPortion / portionG) * 100;
      } else if (typeof fromDb === 'number' && Number.isFinite(fromDb)) {
        per100 = fromDb;
      } else if (typeof fromItem === 'number' && Number.isFinite(fromItem) && portionG > 0) {
        per100 = (fromItem / portionG) * 100;
      }
      const label = LABEL_IT[key] || key;
      return { key, label, per100, perPortion };
    }).filter((r) => r.per100 != null || r.perPortion != null);

    return { title, portionG, rows: rowsOut, isRecipe: recipe };
  }, [foodItem, foodDb]);

  if (!foodItem) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100050,
        padding: 'max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))',
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        style={{
          background: '#141416',
          border: '1px solid #2a2a2e',
          borderRadius: '16px',
          maxWidth: '420px',
          width: '100%',
          maxHeight: 'min(88vh, 640px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="food-label-title"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '18px 18px 12px',
            borderBottom: '1px solid #2a2a2e',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h3 id="food-label-title" style={{ margin: 0, fontSize: '1rem', color: '#00e5ff', fontWeight: 700, lineHeight: 1.3 }}>
              {title}
            </h3>
            <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#6b7280', letterSpacing: '0.04em' }}>
              Porzione di riferimento: <span style={{ color: '#9ca3af' }}>{portionG} g</span>
              {isRecipe ? <span style={{ display: 'block', marginTop: '4px', color: '#a78bfa' }}>Ricetta — valori per l&apos;intera porzione registrata</span> : null}
            </p>
          </div>
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '1.25rem', cursor: 'pointer', lineHeight: 1, padding: '4px' }}
            onClick={onClose}
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 0 12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'rgba(0,229,255,0.06)' }}>
                <th style={{ textAlign: 'left', padding: '10px 14px', color: '#9ca3af', fontWeight: 600 }}>Valore</th>
                <th style={{ textAlign: 'right', padding: '10px 10px', color: '#9ca3af', fontWeight: 600 }}>Per 100 g</th>
                <th style={{ textAlign: 'right', padding: '10px 14px', color: '#00e5ff', fontWeight: 600 }}>{`Per ${portionG} g`}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: '24px 16px', color: '#6b7280', textAlign: 'center' }}>
                    Nessun dato nutrizionale numerico disponibile.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const suf = suffixForKey(r.key);
                  return (
                    <tr key={r.key} style={{ borderTop: '1px solid #1f1f23' }}>
                      <td style={{ padding: '8px 14px', color: '#d1d5db' }}>{r.label}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#e5e7eb', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCell(r.key, r.per100)}{suf}
                      </td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#fff', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCell(r.key, r.perPortion)}{suf}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
