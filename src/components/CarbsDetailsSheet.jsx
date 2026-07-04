import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EMPTY_CARBS_DETAILS_DATA } from '../features/nutrition/buildCarbsDetailsData';
import { getContributorsForNutrient } from '../features/nutrition/getContributorsForNutrient';

/**
 * @param {number} current
 * @param {number} target
 * @returns {number}
 */
function progressPct(current, target) {
  const t = Number(target);
  const c = Number(current) || 0;
  if (t <= 0) return c > 0 ? 100 : 0;
  return Math.min(100, (c / t) * 100);
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatGrams(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * @param {{
 *   label: string,
 *   current: number,
 *   target: number,
 *   unit?: string,
 *   color: string,
 *   thick?: boolean,
 *   onClick?: () => void,
 * }} props
 */
function CarbsProgressBar({ label, current, target, unit = 'g', color, thick = false, onClick }) {
  const pct = progressPct(current, target);
  const over = target > 0 && current > target;
  const interactive = typeof onClick === 'function';

  const content = (
    <>
      <div className="fat-details-bar__header">
        <span className="fat-details-bar__label">{label}</span>
        <span className="fat-details-bar__value">
          {target > 0 ? (
            <>
              <strong>{formatGrams(current)}</strong>
              {' / '}
              {formatGrams(target)}
              {unit}
            </>
          ) : (
            <strong>{formatGrams(current)}{unit ? ` ${unit}` : ' g'}</strong>
          )}
        </span>
      </div>
      <div className={`fat-details-bar__track${thick ? ' fat-details-bar__track--thick' : ''}`}>
        <div
          className={`fat-details-bar__fill${over ? ' fat-details-bar__fill--over' : ''}`}
          style={{
            width: `${pct}%`,
            background: over ? '#f87171' : color,
            boxShadow: over ? '0 0 10px rgba(248,113,113,0.4)' : `0 0 10px ${color}55`,
          }}
        />
      </div>
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        className="fat-details-bar fat-details-bar--interactive"
        onClick={onClick}
        aria-label={`Apri fonti di ${label}`}
      >
        {content}
      </button>
    );
  }

  return <div className="fat-details-bar">{content}</div>;
}

/**
 * @param {{ meals: Array<{ label: string, pct: number, color: string }> }} props
 */
function MealDistributionQuadrant({ meals }) {
  const activeMeals = (meals || []).filter((meal) => (Number(meal.pct) || 0) > 0);
  const displayMeals = activeMeals.length > 0 ? activeMeals : (meals || []);

  const gradient = displayMeals.reduce((acc, meal, index) => {
    const slicePct = activeMeals.length > 0 ? meal.pct : 100 / Math.max(displayMeals.length, 1);
    const start = displayMeals.slice(0, index).reduce((sum, m) => {
      return sum + (activeMeals.length > 0 ? m.pct : 100 / Math.max(displayMeals.length, 1));
    }, 0);
    const end = start + slicePct;
    const color = activeMeals.length > 0 ? meal.color : 'rgba(100,116,139,0.35)';
    const slice = `${color} ${start * 3.6}deg ${end * 3.6}deg`;
    return acc ? `${acc}, ${slice}` : slice;
  }, '');

  return (
    <div className="fat-details-quadrant">
      <div
        className="fat-details-quadrant__disc"
        style={{ background: `conic-gradient(${gradient})` }}
        aria-hidden
      >
        <div className="fat-details-quadrant__core">
          <span className="fat-details-quadrant__core-label">Distribuzione</span>
          <span className="fat-details-quadrant__core-sub">Pasti</span>
        </div>
      </div>
      <ul className="fat-details-quadrant__legend">
        {displayMeals.map((meal) => (
          <li key={meal.label} className="fat-details-quadrant__legend-item">
            <span className="fat-details-quadrant__dot" style={{ background: meal.color }} />
            <span className="fat-details-quadrant__legend-label">{meal.label}</span>
            <span className="fat-details-quadrant__legend-pct">
              {activeMeals.length > 0 ? `${meal.pct}%` : '—'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * @param {{
 *   netCarbs: number,
 *   fiberCarbRatio: number,
 *   fibreCurrent: number,
 *   carbTotal: number,
 * }} props
 */
function CarbsMetabolicKpi({ netCarbs, fiberCarbRatio, fibreCurrent, carbTotal }) {
  const ratioPct = Math.min(100, Math.max(0, fiberCarbRatio * 100));
  const ratioLabel = carbTotal > 0 ? `${Math.round(ratioPct)}%` : '—';

  return (
    <div className="carbs-details-kpi">
      <div className="carbs-details-kpi__net">
        <span className="carbs-details-kpi__net-label">Carboidrati Netti</span>
        <span className="carbs-details-kpi__net-value">{formatGrams(netCarbs)} g</span>
        <span className="carbs-details-kpi__net-hint">Carb totali − Fibre</span>
      </div>

      <div className="carbs-details-kpi__ratio">
        <div className="carbs-details-kpi__ratio-header">
          <span className="carbs-details-kpi__ratio-title">Indice Fibra/Carbo</span>
          <span className="carbs-details-kpi__ratio-value">{ratioLabel}</span>
        </div>
        <div className="carbs-details-kpi__ratio-track" aria-hidden>
          <div className="carbs-details-kpi__ratio-gradient" />
          <div
            className="carbs-details-kpi__ratio-thumb"
            style={{ left: `${ratioPct}%` }}
          />
        </div>
        <div className="carbs-details-kpi__ratio-scale">
          <span>Basso</span>
          <span>{formatGrams(fibreCurrent)}g fibra / {formatGrams(carbTotal)}g carbo</span>
          <span>Alto</span>
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   label: string,
 *   contributors: Array<{ name: string, amount: number, percentage: number }>,
 *   onClose: () => void,
 * }} props
 */
function CarbsContributorsModal({ label, contributors, onClose }) {
  return (
    <div
      className="fat-contributors-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="carbs-contributors-title"
        className="fat-contributors-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fat-contributors-modal__header">
          <h3 id="carbs-contributors-title" className="fat-contributors-modal__title">
            Fonti di {label}
          </h3>
          <button
            type="button"
            className="fat-contributors-modal__close"
            onClick={onClose}
            aria-label="Chiudi elenco fonti"
          >
            ✕
          </button>
        </div>

        <ul className="fat-contributors-modal__list">
          {contributors.length === 0 ? (
            <li className="fat-contributors-modal__empty">
              Nessun alimento con apporto registrato per questo nutriente oggi.
            </li>
          ) : (
            contributors.map((item) => (
              <li key={`${item.name}-${item.amount}`} className="fat-contributors-modal__row">
                <span className="fat-contributors-modal__name" title={item.name}>
                  {item.name}
                </span>
                <span className="fat-contributors-modal__stats">
                  {formatGrams(item.amount)}g ({formatGrams(item.percentage)}%)
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

/**
 * Bottom sheet — dettaglio carboidrati e fibre (impatto glicemico).
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   data?: import('../features/nutrition/buildCarbsDetailsData').buildCarbsDetailsData extends (...args: any[]) => infer R ? R : object,
 *   dailyLog?: Array<Record<string, unknown>>,
 * }} props
 */
export default function CarbsDetailsSheet({ isOpen, onClose, data, dailyLog = [] }) {
  const [activeBreakdown, setActiveBreakdown] = useState(
    /** @type {{ label: string, key: string, total: number } | null} */ (null),
  );

  useEffect(() => {
    if (!isOpen) setActiveBreakdown(null);
  }, [isOpen]);

  const payload = data ?? EMPTY_CARBS_DETAILS_DATA;
  const { total, sugars, starches, fibre, netCarbs, fiberCarbRatio, meals } = payload;

  const contributors = useMemo(() => {
    if (!activeBreakdown) return [];
    return getContributorsForNutrient(dailyLog, activeBreakdown.key, activeBreakdown.total);
  }, [activeBreakdown, dailyLog]);

  const openBreakdown = (label, key, totalValue) => {
    setActiveBreakdown({ label, key, total: Number(totalValue) || 0 });
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="presentation"
      className="fat-details-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="carbs-details-title"
        className="fat-details-panel vetrina-sheet-enter"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fat-details-panel__chrome">
          <div className="fat-details-panel__handle" aria-hidden />
          <button
            type="button"
            className="fat-details-panel__close"
            onClick={onClose}
            aria-label="Chiudi dettaglio carboidrati"
          >
            ✕
          </button>
        </div>

        <div className="fat-details-panel__body">
          <header className="fat-details-section">
            <h2 id="carbs-details-title" className="fat-details-title">
              Dettaglio Carboidrati
            </h2>
            <MealDistributionQuadrant meals={meals} />
          </header>

          <section className="fat-details-section fat-details-breakdown" aria-label="Scomposizione carboidrati">
            <CarbsProgressBar
              label="Carboidrati Totali"
              current={total?.current ?? 0}
              target={total?.target ?? 0}
              color="#00ff88"
              thick
              onClick={() => openBreakdown('Carboidrati Totali', 'carb', total?.current ?? 0)}
            />

            <div className="carbs-details-fractions">
              <CarbsProgressBar
                label="Zuccheri"
                current={sugars?.current ?? 0}
                target={sugars?.target ?? 0}
                color="#f97316"
                onClick={() => openBreakdown('Zuccheri', 'sugars', sugars?.current ?? 0)}
              />
              <CarbsProgressBar
                label="Amidi"
                current={starches?.current ?? 0}
                target={starches?.target ?? 0}
                color="#a78bfa"
                onClick={() => openBreakdown('Amidi', 'starches', starches?.current ?? 0)}
              />
              <CarbsProgressBar
                label="Fibre"
                current={fibre?.current ?? 0}
                target={fibre?.target ?? 0}
                color="#22c55e"
                onClick={() => openBreakdown('Fibre', 'fibre', fibre?.current ?? 0)}
              />
            </div>
          </section>

          <section className="fat-details-section" aria-label="KPI metabolico">
            <CarbsMetabolicKpi
              netCarbs={netCarbs ?? 0}
              fiberCarbRatio={fiberCarbRatio ?? 0}
              fibreCurrent={fibre?.current ?? 0}
              carbTotal={total?.current ?? 0}
            />
          </section>
        </div>

        {activeBreakdown ? (
          <CarbsContributorsModal
            label={activeBreakdown.label}
            contributors={contributors}
            onClose={() => setActiveBreakdown(null)}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
