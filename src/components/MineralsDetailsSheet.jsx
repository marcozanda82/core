import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EMPTY_MINERALS_DETAILS_DATA } from '../features/nutrition/buildMineralsDetailsData';
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
function MineralProgressBar({ label, current, target, unit = 'mg', color, onClick }) {
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
 * Bilancia idrica Na/K — barra bicolore + cursore K/(Na+K).
 *
 * @param {{
 *   na: number,
 *   k: number,
 *   naTarget: number,
 *   kTarget: number,
 *   kShare: number,
 *   ratio: number,
 *   isBalanced: boolean,
 *   onNaClick: () => void,
 *   onKClick: () => void,
 * }} props
 */
function WaterBalanceIndicator({ na, k, naTarget, kTarget, kShare, ratio, isBalanced, onNaClick, onKClick }) {
  const thumbPct = Math.min(100, Math.max(0, kShare * 100));
  const tone = isBalanced ? '#34d399' : ratio >= 0.8 ? '#fbbf24' : '#f87171';

  return (
    <div className="minerals-water-balance">
      <div className="minerals-water-balance__header">
        <h3 className="minerals-water-balance__title">Bilancia Idrica (Anti-Cortisolo)</h3>
        <span className="minerals-water-balance__ratio" style={{ color: tone }}>
          K/Na {ratio.toFixed(2)}
        </span>
      </div>

      <div className="minerals-water-balance__metrics">
        <button type="button" className="minerals-water-balance__metric minerals-water-balance__metric--na" onClick={onNaClick}>
          <span className="minerals-water-balance__metric-label">Sodio (Na)</span>
          <span className="minerals-water-balance__metric-value">
            {Math.round(na)} <span className="minerals-water-balance__metric-target">/ {Math.round(naTarget)} mg</span>
          </span>
        </button>
        <button type="button" className="minerals-water-balance__metric minerals-water-balance__metric--k" onClick={onKClick}>
          <span className="minerals-water-balance__metric-label">Potassio (K)</span>
          <span className="minerals-water-balance__metric-value">
            {Math.round(k)} <span className="minerals-water-balance__metric-target">/ {Math.round(kTarget)} mg</span>
          </span>
        </button>
      </div>

      <div className="minerals-water-balance__track" aria-hidden>
        <div className="minerals-water-balance__gradient" />
        <div className="minerals-water-balance__thumb" style={{ left: `${thumbPct}%`, borderColor: tone }} />
      </div>

      <div className="minerals-water-balance__scale">
        <span>Na</span>
        <span className="minerals-water-balance__ideal">Ideale: K &gt; Na · quota K {Math.round(thumbPct)}%</span>
        <span>K</span>
      </div>
    </div>
  );
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
        aria-labelledby="minerals-contributors-title"
        className="fat-contributors-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fat-contributors-modal__header">
          <h3 id="minerals-contributors-title" className="fat-contributors-modal__title">
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
 *   data?: import('../features/nutrition/buildMineralsDetailsData').buildMineralsDetailsData extends (...args: any[]) => infer R ? R : object,
 *   dailyLog?: Array<Record<string, unknown>>,
 * }} props
 */
export default function MineralsDetailsSheet({ isOpen, onClose, data, dailyLog = [] }) {
  const [activeBreakdown, setActiveBreakdown] = useState(
    /** @type {{ label: string, key: string, total: number, unit?: string } | null} */ (null),
  );

  useEffect(() => {
    if (!isOpen) setActiveBreakdown(null);
  }, [isOpen]);

  const payload = data ?? EMPTY_MINERALS_DETAILS_DATA;
  const { waterBalance, minerals } = payload;

  const contributors = useMemo(() => {
    if (!activeBreakdown) return [];
    return getContributorsForNutrient(dailyLog, activeBreakdown.key, activeBreakdown.total);
  }, [activeBreakdown, dailyLog]);

  const openBreakdown = (label, key, totalValue, unit = 'mg') => {
    setActiveBreakdown({ label, key, total: Number(totalValue) || 0, unit });
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
        aria-labelledby="minerals-details-title"
        className="fat-details-panel vetrina-sheet-enter"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fat-details-panel__chrome">
          <div className="fat-details-panel__handle" aria-hidden />
          <button type="button" className="fat-details-panel__close" onClick={onClose} aria-label="Chiudi dettaglio minerali">
            ✕
          </button>
        </div>

        <div className="fat-details-panel__body">
          <header className="fat-details-section">
            <h2 id="minerals-details-title" className="fat-details-title">
              Minerali &amp; Elettroliti
            </h2>
          </header>

          <section className="fat-details-section" aria-label="Bilancia idrica">
            <WaterBalanceIndicator
              na={waterBalance.na}
              k={waterBalance.k}
              naTarget={waterBalance.naTarget}
              kTarget={waterBalance.kTarget}
              kShare={waterBalance.kShare}
              ratio={waterBalance.ratio}
              isBalanced={waterBalance.isBalanced}
              onNaClick={() => openBreakdown('Sodio (Na)', 'na', waterBalance.na)}
              onKClick={() => openBreakdown('Potassio (K)', 'k', waterBalance.k)}
            />
          </section>

          <section className="fat-details-section fat-details-breakdown" aria-label="Minerali strutturali">
            <h3 className="fat-details-unsaturated__title">Minerali</h3>
            {minerals.map((item) => (
              <MineralProgressBar
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
