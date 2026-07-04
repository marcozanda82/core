import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EMPTY_FAT_DETAILS_DATA } from '../features/nutrition/buildFatDetailsData';
import { getContributorsForNutrient } from '../features/nutrition/getContributorsForNutrient';
/**
 * @param {number} omega6
 * @param {number} omega3
 * @returns {number}
 */
function computeOmegaRatio(omega6, omega3) {
  const w3 = Number(omega3) || 0;
  const w6 = Number(omega6) || 0;
  if (w3 <= 0) return 0;
  return Math.round((w6 / w3) * 10) / 10;
}

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
 * @param {number} [max=8]
 * @returns {number}
 */
function omegaRatioToPercent(value, max = 8) {
  const v = Math.max(0, Number(value) || 0);
  return Math.min(100, (v / max) * 100);
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
function FatProgressBar({ label, current, target, unit = 'g', color, thick = false, onClick }) {
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
 * @param {number} value
 * @returns {string}
 */
function formatGrams(value) {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Quadrante circolare mock — distribuzione grassi per pasto.
 *
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
 * Modal nested — elenco alimenti contributori per nutriente.
 *
 * @param {{
 *   label: string,
 *   contributors: Array<{ name: string, amount: number, percentage: number }>,
 *   onClose: () => void,
 * }} props
 */
function FatContributorsModal({ label, contributors, onClose }) {
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
        aria-labelledby="fat-contributors-title"
        className="fat-contributors-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fat-contributors-modal__header">
          <h3 id="fat-contributors-title" className="fat-contributors-modal__title">
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
 * Indicatore gradiente Rapporto Omega-6 : Omega-3.
 *
 * @param {{ ratio: number }} props
 */
function OmegaRatioIndicator({ ratio }) {
  const thumbPct = omegaRatioToPercent(ratio);
  const ratioLabel = `${formatGrams(ratio)} : 1`;

  return (
    <div className="fat-details-omega">
      <div className="fat-details-omega__header">
        <h3 className="fat-details-omega__title">Rapporto Omega-6 : Omega-3</h3>
        <span className="fat-details-omega__value">{ratioLabel}</span>
      </div>

      <div className="fat-details-omega__track" aria-hidden>
        <div className="fat-details-omega__gradient" />
        <div className="fat-details-omega__ideal-zone" title="Zona ideale 1:1 – 4:1" />
        <div
          className="fat-details-omega__thumb"
          style={{ left: `${thumbPct}%` }}
        />
      </div>

      <div className="fat-details-omega__scale">
        <span>0:1</span>
        <span className="fat-details-omega__ideal-label">Ideale: 1:1 – 4:1</span>
        <span>8:1+</span>
      </div>
    </div>
  );
}

/**
 * Bottom sheet glassmorphism — dettaglio macro grassi.
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   data?: import('../features/nutrition/buildFatDetailsData').buildFatDetailsData extends (...args: any[]) => infer R ? R : object,
 *   dailyLog?: Array<Record<string, unknown>>,
 * }} props
 */
export default function FatDetailsSheet({ isOpen, onClose, data, dailyLog = [] }) {
  const [activeBreakdown, setActiveBreakdown] = useState(
    /** @type {{ label: string, key: string, total: number } | null} */ (null),
  );

  useEffect(() => {
    if (!isOpen) setActiveBreakdown(null);
  }, [isOpen]);

  const payload = data ?? EMPTY_FAT_DETAILS_DATA;
  const {
    total,
    saturated,
    trans,
    monounsaturated,
    polyunsaturated,
    omega3,
    omega6,
    meals,
  } = payload;

  const omegaRatio = computeOmegaRatio(omega6, omega3);

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
        aria-labelledby="fat-details-title"
        className="fat-details-panel vetrina-sheet-enter"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fat-details-panel__chrome">
          <div className="fat-details-panel__handle" aria-hidden />
          <button
            type="button"
            className="fat-details-panel__close"
            onClick={onClose}
            aria-label="Chiudi dettaglio grassi"
          >
            ✕
          </button>
        </div>

        <div className="fat-details-panel__body">
          {/* BLOCCO 1 — Distribuzione temporale */}
          <header className="fat-details-section">
            <h2 id="fat-details-title" className="fat-details-title">
              Dettaglio Grassi
            </h2>
            <MealDistributionQuadrant meals={meals} />
          </header>

          {/* BLOCCO 2 — Scomposizione gerarchica */}
          <section className="fat-details-section fat-details-breakdown" aria-label="Scomposizione grassi">
            <FatProgressBar
              label="Grassi Totali"
              current={total?.current ?? 0}
              target={total?.target ?? 0}
              color="#ffd700"
              thick
              onClick={() => openBreakdown('Grassi Totali', 'fatTotal', total?.current ?? 0)}
            />

            <div className="fat-details-breakdown__row">
              <FatProgressBar
                label="Saturi"
                current={saturated?.current ?? 0}
                target={saturated?.target ?? 0}
                color="#f59e0b"
                onClick={() => openBreakdown('Grassi Saturi', 'fatSat', saturated?.current ?? 0)}
              />
              <FatProgressBar
                label="Trans"
                current={trans?.current ?? 0}
                target={trans?.target ?? 0}
                color="#ef4444"
                onClick={() => openBreakdown('Grassi Trans', 'fatTrans', trans?.current ?? 0)}
              />
            </div>

            <div className="fat-details-unsaturated">
              <h3 className="fat-details-unsaturated__title">Grassi Insaturi</h3>
              <FatProgressBar
                label="Monoinsaturi"
                current={monounsaturated?.current ?? 0}
                target={monounsaturated?.target ?? 0}
                color="#22d3ee"
                onClick={() => openBreakdown('Monoinsaturi', 'fatMono', monounsaturated?.current ?? 0)}
              />
              <FatProgressBar
                label="Polinsaturi"
                current={polyunsaturated?.current ?? 0}
                target={polyunsaturated?.target ?? 0}
                color="#38bdf8"
                onClick={() => openBreakdown('Polinsaturi', 'fatPoly', polyunsaturated?.current ?? 0)}
              />
              <FatProgressBar
                label="Omega-3"
                current={omega3 ?? 0}
                target={0}
                color="#4ade80"
                onClick={() => openBreakdown('Omega-3', 'omega3', omega3 ?? 0)}
              />
              <FatProgressBar
                label="Omega-6"
                current={omega6 ?? 0}
                target={0}
                color="#fb923c"
                onClick={() => openBreakdown('Omega-6', 'omega6', omega6 ?? 0)}
              />
            </div>
          </section>

          {/* BLOCCO 3 — Telemetria clinica */}
          <section className="fat-details-section" aria-label="Rapporto omega">
            <OmegaRatioIndicator ratio={omegaRatio} />
          </section>
        </div>

        {activeBreakdown ? (
          <FatContributorsModal
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
