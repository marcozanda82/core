import React from 'react';

/**
 * Solo presentazione: attende l’output di {@link computeNutrientContributionBreakdown}.
 *
 * @typedef {import('./computeNutrientContributionBreakdown.js').NutrientContributionItem} NutrientContributionItem
 * @typedef {{
 *   nutrientKey: string,
 *   totalNutrientAmount: number,
 *   items: NutrientContributionItem[],
 * }} NutrientBreakdownData
 */

/** Mapping locale label/unità (solo copy UI, non motore). */
const NUTRIENT_PRESENTATION = {
  prot: { label: 'Proteine', unit: 'g' },
  protein: { label: 'Proteine', unit: 'g' },
  fibre: { label: 'Fibre', unit: 'g' },
  fiber: { label: 'Fibre', unit: 'g' },
  na: { label: 'Sodio', unit: 'mg' },
  sodium: { label: 'Sodio', unit: 'mg' },
  k: { label: 'Potassio', unit: 'mg' },
  potassium: { label: 'Potassio', unit: 'mg' },
  sugars: { label: 'Zuccheri', unit: 'g' },
  sugar: { label: 'Zuccheri', unit: 'g' },
  zuccheri: { label: 'Zuccheri', unit: 'g' },
  fatSat: { label: 'Grassi saturi', unit: 'g' },
  saturatedfat: { label: 'Grassi saturi', unit: 'g' },
  kcal: { label: 'Energia', unit: 'kcal' },
  cal: { label: 'Energia', unit: 'kcal' },
  carb: { label: 'Carboidrati', unit: 'g' },
  fatTotal: { label: 'Grassi', unit: 'g' },
  fat: { label: 'Grassi', unit: 'g' },
};

function normalizeKeyLookup(key) {
  return String(key ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '')
    .replace(/_/g, '');
}

function presentationForNutrient(nutrientKey) {
  const k = normalizeKeyLookup(nutrientKey);
  const row = NUTRIENT_PRESENTATION[k];
  if (row) return row;
  const raw = String(nutrientKey ?? '').trim();
  const label =
    raw.length > 0 ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Nutriente';
  return { label, unit: '' };
}

function fmtAmount(n) {
  if (!Number.isFinite(Number(n))) return '—';
  const x = Number(n);
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/\.0$/, '');
}

function fmtQty(q) {
  if (!Number.isFinite(Number(q))) return '?';
  const x = Number(q);
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/\.0$/, '');
}

const containerStyle = {
  width: '100%',
  maxWidth: 420,
  margin: '0 auto',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #2a2a2c',
  background: 'rgba(18, 20, 24, 0.92)',
  boxSizing: 'border-box',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
};

const headerStyle = {
  marginBottom: 12,
  paddingBottom: 8,
  borderBottom: '1px solid #2a2a2c',
  fontSize: '0.8125rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  color: 'rgba(245, 247, 250, 0.94)',
};

const rowStyle = {
  marginBottom: 10,
};

const rowTopStyle = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 5,
  fontSize: '0.78rem',
  color: 'rgba(210, 215, 222, 0.92)',
};

const foodColStyle = {
  flex: '1 1 auto',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const amountColStyle = {
  flex: '0 0 auto',
  fontWeight: 600,
  color: 'rgba(235, 238, 242, 0.95)',
  fontVariantNumeric: 'tabular-nums',
};

const trackStyle = {
  height: 4,
  borderRadius: 3,
  background: 'rgba(42, 42, 44, 0.95)',
  overflow: 'hidden',
  border: '1px solid #252528',
};

const fillStyle = {
  height: '100%',
  borderRadius: 2,
  background: 'linear-gradient(90deg, rgba(72, 132, 178, 0.35), rgba(110, 168, 205, 0.65))',
  transition: 'width 0.2s ease-out',
};

const emptyStyle = {
  padding: '12px 10px',
  fontSize: '0.75rem',
  color: 'rgba(180, 188, 198, 0.45)',
  textAlign: 'center',
  letterSpacing: '0.03em',
};

/**
 * @param {{ breakdownData?: NutrientBreakdownData | null }} props
 */
export default function NutrientDrilldownList({ breakdownData }) {
  if (
    breakdownData == null ||
    !Array.isArray(breakdownData.items) ||
    breakdownData.items.length === 0
  ) {
    return (
      <div style={emptyStyle} aria-live="polite">
        Nessun dato
      </div>
    );
  }

  const { label, unit } = presentationForNutrient(breakdownData.nutrientKey);
  const total = breakdownData.totalNutrientAmount;
  const unitSuffix = unit ? `${unit}` : '';
  const headerText =
    unitSuffix.length > 0
      ? `${label}: ${fmtAmount(total)}${unitSuffix}`
      : `${label}: ${fmtAmount(total)}`;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>{headerText}</div>
      {breakdownData.items.map((item) => {
        const pct = Math.min(100, Math.max(0, Number(item.contributionPct) || 0));
        const portionUnit = 'g';
        const foodLine = `${item.foodName} (${fmtQty(item.consumedQuantity)}${portionUnit})`;
        const valUnit = unitSuffix ? unitSuffix : '';
        const absLine = valUnit
          ? `${fmtAmount(item.nutrientAmount)}${valUnit}`
          : fmtAmount(item.nutrientAmount);

        return (
          <div key={`${item.foodId}-${item.foodName}-${absLine}`} style={rowStyle}>
            <div style={rowTopStyle}>
              <span style={foodColStyle} title={`${item.foodName}`}>
                {foodLine}
              </span>
              <span style={amountColStyle}>{absLine}</span>
            </div>
            <div style={trackStyle} aria-hidden>
              <div style={{ ...fillStyle, width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
