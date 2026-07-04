import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EMPTY_PROTEIN_DETAILS_DATA } from '../features/nutrition/buildProteinDetailsData';
import { calculateProteinReliability } from '../features/nutrition/calculateProteinReliability';
import { calculateProteinQuality } from '../features/nutrition/calculateProteinQuality';
import { getContributorsForNutrient } from '../features/nutrition/getContributorsForNutrient';
import ProteinQualityBadge from './ProteinQualityBadge';
import AminoHealingModal from './AminoHealingModal';

function progressPct(current, target) {
  const t = Number(target);
  const c = Number(current) || 0;
  if (t <= 0) return c > 0 ? 100 : 0;
  return Math.min(100, (c / t) * 100);
}

function formatMg(valueMg) {
  const n = Number(valueMg) || 0;
  if (n >= 1000) {
    const g = n / 1000;
    return Number.isInteger(g) ? `${g}` : g.toFixed(1);
  }
  return Number.isInteger(n) ? `${n}` : n.toFixed(0);
}

function unitForMg(valueMg) {
  return Number(valueMg) >= 1000 ? 'g' : 'mg';
}

function formatGrams(valueG) {
  const n = Number(valueG) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function ProteinProgressBar({ label, current, target, unit = 'g', color, thick = false, onClick }) {
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

function AminoProgressBar({ label, currentMg, targetMg, color, onClick }) {
  const unit = unitForMg(Math.max(currentMg, targetMg));
  const displayCurrent = unit === 'g' ? currentMg / 1000 : currentMg;
  const displayTarget = unit === 'g' ? targetMg / 1000 : targetMg;

  return (
    <ProteinProgressBar
      label={label}
      current={displayCurrent}
      target={displayTarget}
      unit={unit}
      color={color}
      onClick={onClick}
    />
  );
}

/**
 * @param {{
 *   noble: { grams: number, percentage: number },
 *   incomplete: { grams: number, percentage: number },
 *   onNobleClick?: () => void,
 *   onIncompleteClick?: () => void,
 * }} props
 */
function ProteinQualitySplitBar({ noble, incomplete, onNobleClick, onIncompleteClick }) {
  const noblePct = Math.max(0, Math.min(100, noble.percentage || 0));
  const incompletePct = Math.max(0, Math.min(100, incomplete.percentage || 0));
  const totalPct = noblePct + incompletePct;
  const nobleWidth = totalPct > 0 ? (noblePct / totalPct) * 100 : 50;
  const incompleteWidth = totalPct > 0 ? (incompletePct / totalPct) * 100 : 50;

  return (
    <div className="protein-quality-split">
      <div className="protein-quality-split__labels">
        <button
          type="button"
          className="protein-quality-split__label-btn protein-quality-split__label-btn--noble"
          onClick={onNobleClick}
        >
          <span>Nobili (Complete)</span>
          <span>{formatGrams(noble.grams)}g · {formatGrams(noblePct)}%</span>
        </button>
        <button
          type="button"
          className="protein-quality-split__label-btn protein-quality-split__label-btn--incomplete"
          onClick={onIncompleteClick}
        >
          <span>Incomplete</span>
          <span>{formatGrams(incomplete.grams)}g · {formatGrams(incompletePct)}%</span>
        </button>
      </div>
      <div className="protein-quality-split__track" aria-hidden>
        <button
          type="button"
          className="protein-quality-split__segment protein-quality-split__segment--noble"
          style={{ width: `${nobleWidth}%` }}
          onClick={onNobleClick}
          aria-label={`Proteine nobili ${formatGrams(noble.grams)} grammi`}
        />
        <button
          type="button"
          className="protein-quality-split__segment protein-quality-split__segment--incomplete"
          style={{ width: `${incompleteWidth}%` }}
          onClick={onIncompleteClick}
          aria-label={`Proteine incomplete ${formatGrams(incomplete.grams)} grammi`}
        />
      </div>
    </div>
  );
}

function ProteinContributorsModal({ label, contributors, unit = 'g', onClose }) {
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
        aria-labelledby="protein-contributors-title"
        className="fat-contributors-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="fat-contributors-modal__header">
          <h3 id="protein-contributors-title" className="fat-contributors-modal__title">
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
                  {formatGrams(item.amount)}{unit} ({formatGrams(item.percentage)}%)
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

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

export default function ProteinDetailsSheet({ isOpen, onClose, data, dailyLog = [] }) {
  const [healingOpen, setHealingOpen] = useState(false);
  const [activeBreakdown, setActiveBreakdown] = useState(
    /** @type {{ label: string, key: string, total: number, unit?: string } | null} */ (null),
  );

  useEffect(() => {
    if (!isOpen) {
      setHealingOpen(false);
      setActiveBreakdown(null);
    }
  }, [isOpen]);

  const payload = data ?? EMPTY_PROTEIN_DETAILS_DATA;
  const { total, leucine, bcaa, eaa, meals } = payload;

  const reliability = useMemo(
    () => calculateProteinReliability(dailyLog),
    [dailyLog],
  );

  const proteinQuality = useMemo(
    () => calculateProteinQuality(dailyLog),
    [dailyLog],
  );

  const contributors = useMemo(() => {
    if (!activeBreakdown) return [];
    return getContributorsForNutrient(dailyLog, activeBreakdown.key, activeBreakdown.total);
  }, [activeBreakdown, dailyLog]);

  const openBreakdown = (label, key, totalValue, unit = 'g') => {
    setActiveBreakdown({ label, key, total: Number(totalValue) || 0, unit });
  };

  if (!isOpen || typeof document === 'undefined') return null;

  const contributorUnit =
    activeBreakdown?.unit ??
    (['leu', 'leucine', 'bcaa', 'eaa'].includes(activeBreakdown?.key ?? '') ? 'mg' : 'g');

  return createPortal(
    <>
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
          aria-labelledby="protein-details-title"
          className="fat-details-panel vetrina-sheet-enter"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="fat-details-panel__chrome">
            <div className="fat-details-panel__handle" aria-hidden />
            <button
              type="button"
              className="fat-details-panel__close"
              onClick={onClose}
              aria-label="Chiudi dettaglio proteine"
            >
              ✕
            </button>
          </div>

          <div className="fat-details-panel__body">
            <header className="fat-details-section">
              <h2 id="protein-details-title" className="fat-details-title">
                Dettaglio Proteine
              </h2>
              <MealDistributionQuadrant meals={meals} />
            </header>

            <section className="fat-details-section fat-details-breakdown" aria-label="Proteine totali">
              <ProteinProgressBar
                label="Proteine Totali"
                current={total?.current ?? 0}
                target={total?.target ?? 0}
                color="#b666d2"
                thick
                onClick={() => openBreakdown('Proteine Totali', 'prot', total?.current ?? 0)}
              />

              <div className="protein-details-reliability">
                <ProteinQualityBadge
                  score={reliability.score}
                  status={reliability.status}
                  onClick={() => setHealingOpen(true)}
                />
                <span className="protein-details-reliability__hint">
                  {reliability.verifiedProtein}g verificate · {reliability.estimatedProtein}g stimate
                </span>
              </div>

              <ProteinQualitySplitBar
                noble={proteinQuality.noble}
                incomplete={proteinQuality.incomplete}
                onNobleClick={() =>
                  openBreakdown('Proteine Nobili', 'proteinNoble', proteinQuality.noble.grams)
                }
                onIncompleteClick={() =>
                  openBreakdown('Proteine Incomplete', 'proteinIncomplete', proteinQuality.incomplete.grams)
                }
              />
            </section>

            <section
              className="fat-details-section protein-details-amino"
              aria-label="Spettro amminoacidico"
            >
              <h3 className="protein-details-amino__title">Spettro Amminoacidico</h3>
              <AminoProgressBar
                label="Leucina"
                currentMg={leucine?.current ?? 0}
                targetMg={leucine?.target ?? 0}
                color="#c084fc"
                onClick={() => openBreakdown('Leucina', 'leu', leucine?.current ?? 0, 'mg')}
              />
              <AminoProgressBar
                label="BCAA (Ramificati)"
                currentMg={bcaa?.current ?? 0}
                targetMg={bcaa?.target ?? 0}
                color="#a855f7"
                onClick={() => openBreakdown('BCAA', 'bcaa', bcaa?.current ?? 0, 'mg')}
              />
              <AminoProgressBar
                label="EAA (Essenziali)"
                currentMg={eaa?.current ?? 0}
                targetMg={eaa?.target ?? 0}
                color="#9333ea"
                onClick={() => openBreakdown('EAA', 'eaa', eaa?.current ?? 0, 'mg')}
              />
              <p className="protein-details-amino__footnote">
                Leucina {formatMg(leucine?.current ?? 0)}{unitForMg(leucine?.current ?? 0)} · BCAA{' '}
                {formatMg(bcaa?.current ?? 0)}{unitForMg(bcaa?.current ?? 0)} · EAA{' '}
                {formatMg(eaa?.current ?? 0)}{unitForMg(eaa?.current ?? 0)}
              </p>
            </section>
          </div>

          {activeBreakdown ? (
            <ProteinContributorsModal
              label={activeBreakdown.label}
              contributors={contributors}
              unit={contributorUnit}
              onClose={() => setActiveBreakdown(null)}
            />
          ) : null}
        </div>
      </div>

      <AminoHealingModal
        isOpen={healingOpen}
        onClose={() => setHealingOpen(false)}
        dailyLog={dailyLog}
      />
    </>,
    document.body,
  );
}
