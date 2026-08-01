import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';

function roundKcal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function progressPct(current, target) {
  const t = Number(target);
  const c = Number(current) || 0;
  if (t <= 0) return c > 0 ? 100 : 0;
  return Math.min(100, (c / t) * 100);
}

function resolveTacticalCopy(remainingKcal) {
  const remaining = roundKcal(remainingKcal);
  if (remaining > 300) {
    return {
      tone: 'deficit',
      title: 'Forte deficit ancora aperto',
      text:
        'Se ti fermi ora, chiudi in forte deficit. Ottimo per tagliare peso, ma assicurati di aver coperto la quota proteica per preservare i cilindri muscolari.',
    };
  }
  if (remaining >= -150) {
    return {
      tone: 'ideal',
      title: 'Range ideale',
      text:
        'Sei nel range ideale. Hai margine per un piccolo spuntino o puoi chiudere la giornata così, sostenendo il recupero senza accumulare grasso.',
    };
  }
  return {
    tone: 'surplus',
    title: 'Surplus sforato',
    text:
      'Stai fornendo energia extra. Utile se i sismografi muscolari (es. Gambe/Core) sono molto alti e necessitano recupero, ma attenzione a non farlo cronicamente.',
  };
}

/**
 * Bottom sheet locale — spiega target kcal odierno, stato e proiezione tattica.
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   tdeeBaseKcal?: number,
 *   workoutBurnKcal?: number,
 *   deltaKcal?: number | null,
 *   targetKcal?: number,
 *   consumedKcal?: number,
 *   proteinConsumed?: number,
 *   proteinTarget?: number,
 * }} props
 */
export default function CalorieDetailsModal({
  isOpen,
  onClose,
  tdeeBaseKcal = 0,
  workoutBurnKcal = 0,
  deltaKcal = null,
  targetKcal = 0,
  consumedKcal = 0,
  proteinConsumed = 0,
  proteinTarget = 150,
}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const receipt = useMemo(() => {
    const tdee = roundKcal(tdeeBaseKcal);
    const burn = roundKcal(workoutBurnKcal);
    const target = roundKcal(targetKcal);
    const delta = Number.isFinite(Number(deltaKcal))
      ? roundKcal(deltaKcal)
      : target - tdee - burn;
    return { tdee, burn, delta, target };
  }, [tdeeBaseKcal, workoutBurnKcal, deltaKcal, targetKcal]);

  const consumed = roundKcal(consumedKcal);
  // Firmato: negativo = surplus rispetto al target (serve alle proiezioni tattiche).
  const remainingSigned = receipt.target - consumed;
  const remainingSpendable = Math.max(0, remainingSigned);
  const protNow = Math.round((Number(proteinConsumed) || 0) * 10) / 10;
  const protTarget = Math.round(Number(proteinTarget) || 150);
  const protPct = progressPct(protNow, protTarget);
  const protOver = protTarget > 0 && protNow > protTarget;
  const tactical = resolveTacticalCopy(remainingSigned);

  if (!isOpen || typeof document === 'undefined') return null;

  const deltaLabel = receipt.delta >= 0 ? 'Surplus obiettivo' : 'Deficit obiettivo';
  const deltaOperator = receipt.delta >= 0 ? '+' : '−';

  return createPortal(
    <div
      role="presentation"
      className="calorie-details-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="calorie-details-title"
        className="calorie-details-panel vetrina-sheet-enter"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="calorie-details-panel__chrome">
          <div className="calorie-details-panel__handle" aria-hidden />
          <button
            type="button"
            className="calorie-details-panel__close"
            onClick={onClose}
            aria-label="Chiudi dettaglio calorie"
          >
            ✕
          </button>
        </div>

        <div className="calorie-details-panel__body">
          <header className="calorie-details-header">
            <h2 id="calorie-details-title" className="calorie-details-title">
              Calorie di oggi
            </h2>
            <p className="calorie-details-subtitle">
              Equazione del target, stato attuale e proiezione tattica.
            </p>
          </header>

          {/* 1. Il Traguardo */}
          <section className="calorie-details-section" aria-label="Il Traguardo">
            <h3 className="calorie-details-section__title">Il Traguardo</h3>
            <p className="calorie-details-section__hint">L&apos;equazione odierna</p>

            <div className="calorie-receipt" role="list">
              <div className="calorie-receipt__row" role="listitem">
                <span className="calorie-receipt__label">Target Base (Impostazioni)</span>
                <span className="calorie-receipt__value">{receipt.tdee}</span>
              </div>
              <div className="calorie-receipt__row" role="listitem">
                <span className="calorie-receipt__label">
                  <span className="calorie-receipt__op" aria-hidden>+</span>
                  Allenamento / Cardio
                </span>
                <span className="calorie-receipt__value">{receipt.burn}</span>
              </div>
              <div className="calorie-receipt__row" role="listitem">
                <span className="calorie-receipt__label">
                  <span className="calorie-receipt__op" aria-hidden>{deltaOperator}</span>
                  {deltaLabel}
                </span>
                <span
                  className={`calorie-receipt__value${
                    receipt.delta < 0
                      ? ' calorie-receipt__value--deficit'
                      : receipt.delta > 0
                        ? ' calorie-receipt__value--surplus'
                        : ''
                  }`}
                >
                  {Math.abs(receipt.delta)}
                </span>
              </div>
              <div className="calorie-receipt__divider" aria-hidden />
              <div className="calorie-receipt__row calorie-receipt__row--total" role="listitem">
                <span className="calorie-receipt__label">Target totale odierno</span>
                <span className="calorie-receipt__value calorie-receipt__value--total">
                  {receipt.target}
                  <span className="calorie-receipt__unit">kcal</span>
                </span>
              </div>
            </div>
          </section>

          {/* 2. Stato Attuale */}
          <section className="calorie-details-section" aria-label="Stato Attuale">
            <h3 className="calorie-details-section__title">Stato Attuale</h3>

            <div className="calorie-status-grid">
              <div className="calorie-status-card">
                <span className="calorie-status-card__label">Consumate</span>
                <span className="calorie-status-card__value">
                  {consumed}
                  <span className="calorie-status-card__unit">kcal</span>
                </span>
              </div>
              <div className="calorie-status-card calorie-status-card--accent">
                <span className="calorie-status-card__label">
                  {remainingSigned < 0 ? 'In surplus' : 'Rimanenti'}
                </span>
                <span className="calorie-status-card__value calorie-status-card__value--hero">
                  {remainingSigned < 0
                    ? `+${Math.abs(remainingSigned)}`
                    : remainingSpendable}
                  <span className="calorie-status-card__unit">kcal</span>
                </span>
              </div>
            </div>

            <div className="calorie-protein-bar" aria-label="Progresso proteine">
              <div className="calorie-protein-bar__header">
                <span className="calorie-protein-bar__label">Proteine</span>
                <span className="calorie-protein-bar__value">
                  <strong>{protNow}</strong>
                  {' / '}
                  {protTarget}g
                </span>
              </div>
              <div className="calorie-protein-bar__track">
                <div
                  className={`calorie-protein-bar__fill${protOver ? ' calorie-protein-bar__fill--over' : ''}`}
                  style={{ width: `${protPct}%` }}
                />
              </div>
              <p className="calorie-protein-bar__hint">
                Margine macro: priorità alla quota proteica rispetto alle kcal rimanenti.
              </p>
            </div>
          </section>

          {/* 3. Proiezioni Tattiche */}
          <section
            className={`calorie-details-section calorie-tactical calorie-tactical--${tactical.tone}`}
            aria-label="Proiezioni Tattiche"
          >
            <h3 className="calorie-details-section__title">Proiezioni Tattiche</h3>
            <p className="calorie-tactical__eyebrow">{tactical.title}</p>
            <p className="calorie-tactical__text">{tactical.text}</p>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
