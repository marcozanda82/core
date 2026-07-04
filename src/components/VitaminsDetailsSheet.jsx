import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildVitaminsDetailsData, EMPTY_VITAMINS_DETAILS_DATA } from '../features/nutrition/buildVitaminsDetailsData';
import { calculateWeeklyVitamins } from '../features/nutrition/calculateWeeklyVitamins';
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
function formatAmount(value) {
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
 *   onClick?: () => void,
 * }} props
 */
function VitaminProgressBar({ label, current, target, unit = 'mg', color, onClick }) {
  const pct = progressPct(current, target);
  const over = target > 0 && current > target;
  const interactive = typeof onClick === 'function';

  const content = (
    <>
      <div className="fat-details-bar__header">
        <span className="fat-details-bar__label">{label}</span>
        <span className="fat-details-bar__value">
          <strong>{formatAmount(current)}</strong>
          {' / '}
          {formatAmount(target)}
          {unit}
        </span>
      </div>
      <div className="fat-details-bar__track">
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
 * @param {{
 *   label: string,
 *   contributors: Array<{ name: string, amount: number, percentage: number }>,
 *   unit?: string,
 *   onClose: () => void,
 * }} props
 */
function ContributorsModal({ label, contributors, unit = 'mg', onClose }) {
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
        aria-labelledby="vitamins-contributors-title"
        className="fat-contributors-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fat-contributors-modal__header">
          <h3 id="vitamins-contributors-title" className="fat-contributors-modal__title">
            Fonti di {label}
          </h3>
          <button type="button" className="fat-contributors-modal__close" onClick={onClose} aria-label="Chiudi elenco fonti">
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
                  {formatAmount(item.amount)}
                  {unit} ({formatAmount(item.percentage)}%)
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
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   data?: import('../features/nutrition/buildVitaminsDetailsData').buildVitaminsDetailsData extends (...args: any[]) => infer R ? R : object,
 *   dailyLog?: Array<Record<string, unknown>>,
 *   userTargets?: Record<string, unknown>,
 *   anchorDate?: string,
 *   fullHistory?: Record<string, unknown> | null,
 * }} props
 */
export default function VitaminsDetailsSheet({
  isOpen,
  onClose,
  dailyLog = [],
  userTargets = {},
  anchorDate,
  fullHistory = null,
}) {
  const [activeBreakdown, setActiveBreakdown] = useState(
    /** @type {{ label: string, key: string, total: number, unit?: string } | null} */ (null),
  );

  useEffect(() => {
    if (!isOpen) setActiveBreakdown(null);
  }, [isOpen]);

  const weeklyTotals = useMemo(() => {
    if (!isOpen) return null;
    return calculateWeeklyVitamins({
      anchorDate,
      todayLog: dailyLog,
      fullHistory,
    });
  }, [isOpen, anchorDate, dailyLog, fullHistory]);

  const payload = useMemo(
    () => buildVitaminsDetailsData(dailyLog, userTargets, weeklyTotals),
    [dailyLog, userTargets, weeklyTotals],
  );

  const { hydrosoluble, weeklyVault } = payload ?? EMPTY_VITAMINS_DETAILS_DATA;

  const contributors = useMemo(() => {
    if (!activeBreakdown) return [];
    return getContributorsForNutrient(dailyLog, activeBreakdown.key, activeBreakdown.total);
  }, [activeBreakdown, dailyLog]);

  const openBreakdown = (label, key, totalValue, unit = 'mg') => {
    setActiveBreakdown({ label, key, total: Number(totalValue) || 0, unit });
  };

  const daysWithData = weeklyVault[0]?.daysInWindow ?? weeklyTotals?.daysWithData ?? 0;

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
        aria-labelledby="vitamins-details-title"
        className="fat-details-panel vetrina-sheet-enter"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fat-details-panel__chrome">
          <div className="fat-details-panel__handle" aria-hidden />
          <button type="button" className="fat-details-panel__close" onClick={onClose} aria-label="Chiudi dettaglio vitamine">
            ✕
          </button>
        </div>

        <div className="fat-details-panel__body">
          <header className="fat-details-section">
            <h2 id="vitamins-details-title" className="fat-details-title">
              Vitamine
            </h2>
          </header>

          <section className="fat-details-section fat-details-breakdown" aria-label="Vitamine idrosolubili oggi">
            <h3 className="fat-details-unsaturated__title">Idrosolubili — Oggi</h3>
            {hydrosoluble.map((item) => (
              <VitaminProgressBar
                key={item.key}
                label={item.label}
                current={item.current}
                target={item.target}
                unit={item.unit}
                color={item.color}
                onClick={() => openBreakdown(item.label, item.key, item.current, item.unit)}
              />
            ))}
          </section>

          <section className="fat-details-section vitamins-weekly-vault" aria-label="Caveau settimanale liposolubili">
            <div className="vitamins-weekly-vault__head">
              <h3 className="vitamins-weekly-vault__title">Caveau Settimanale (A, D, E, K, B12)</h3>
              <span className="vitamins-weekly-vault__badge">
                {daysWithData > 0 ? `Totale 7 gg · ${daysWithData} con dati` : 'In attesa dati'}
              </span>
            </div>
            {weeklyVault.map((item) => (
              <VitaminProgressBar
                key={item.key}
                label={item.label}
                current={item.current}
                target={item.target}
                unit={item.unit}
                color={item.color}
                onClick={() => openBreakdown(item.label, item.key, item.current, item.unit)}
              />
            ))}
          </section>
        </div>

        {activeBreakdown ? (
          <ContributorsModal
            label={activeBreakdown.label}
            contributors={contributors}
            unit={activeBreakdown.unit ?? 'mg'}
            onClose={() => setActiveBreakdown(null)}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
