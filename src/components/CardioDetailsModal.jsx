import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { STRENGTH_CARDIO_SPILLOVER_RATIO } from '../features/commandTerminal/context/cardioCylinderStatus.js';

function round1(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function formatMin(value) {
  const n = round1(value);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}

/**
 * Bottom sheet — estratto conto trasparente del cilindro Cardio (7g).
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   breakdown?: object | null,
 * }} props
 */
export default function CardioDetailsModal({
  isOpen,
  onClose,
  breakdown = null,
} = {}) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const receipt = useMemo(() => {
    const total = round1(breakdown?.totalMinutes ?? breakdown?.accumulatedMinutes);
    const target = Math.max(1, round1(breakdown?.targetMinutes ?? breakdown?.weeklyTargetMinutes));
    const walkingMin = round1(breakdown?.walking?.minutes);
    const walkingSteps = Math.round(Number(breakdown?.walking?.steps) || 0);
    const walkingKcal = Math.round(Number(breakdown?.walking?.kcal) || 0);
    const cardioMin = round1(breakdown?.structuredCardio?.minutes);
    const cardioKcal = Math.round(Number(breakdown?.structuredCardio?.kcal) || 0);
    const spillMin = round1(breakdown?.strengthSpillover?.spilloverMinutes ?? breakdown?.spilloverMinutes);
    const strengthMin = round1(breakdown?.strengthSpillover?.strengthMinutes ?? breakdown?.strengthMinutes);
    const spillRatio = Number(breakdown?.strengthSpillover?.spilloverRatio);
    const ratioPct = Math.round(
      (Number.isFinite(spillRatio) ? spillRatio : STRENGTH_CARDIO_SPILLOVER_RATIO) * 100,
    );
    const fillPercent = Math.round(Number(breakdown?.fillPercent) || (total / target) * 100);
    return {
      total,
      target,
      walkingMin,
      walkingSteps,
      walkingKcal,
      walkingNote: breakdown?.walking?.conversionNote || '',
      walkingSessions: Array.isArray(breakdown?.walking?.sessions) ? breakdown.walking.sessions : [],
      cardioMin,
      cardioKcal,
      cardioSessions: Array.isArray(breakdown?.structuredCardio?.sessions)
        ? breakdown.structuredCardio.sessions
        : [],
      spillMin,
      strengthMin,
      ratioPct,
      fillPercent: Math.max(0, Math.min(100, fillPercent)),
      remaining: round1(breakdown?.remainingMinutes),
    };
  }, [breakdown]);

  if (!isOpen || typeof document === 'undefined') return null;

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
        aria-labelledby="cardio-details-title"
        className="calorie-details-panel cardio-details-panel vetrina-sheet-enter"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="calorie-details-panel__chrome">
          <div className="calorie-details-panel__handle" aria-hidden />
          <button
            type="button"
            className="calorie-details-panel__close"
            onClick={onClose}
            aria-label="Chiudi estratto conto cardio"
          >
            ✕
          </button>
        </div>

        <div className="calorie-details-panel__body">
          <header className="calorie-details-header">
            <h2 id="cardio-details-title" className="calorie-details-title">
              Estratto conto Cardio
            </h2>
            <p className="calorie-details-subtitle">
              Finestra mobile 7 giorni (168h) — distinta trasparente, niente scatole nere.
            </p>
          </header>

          <section className="calorie-details-section" aria-label="Totale cardio">
            <h3 className="calorie-details-section__title">Il Totale</h3>
            <p className="calorie-details-section__hint">Accumulo cilindro cardio</p>

            <div className="calorie-receipt" role="list">
              <div className="calorie-receipt__row calorie-receipt__row--total" role="listitem">
                <span className="calorie-receipt__label">Cardio totale (7g)</span>
                <span className="calorie-receipt__value calorie-receipt__value--total">
                  {formatMin(receipt.total)}
                  <span className="calorie-receipt__unit">
                    / {formatMin(receipt.target)} min
                  </span>
                </span>
              </div>
              <p className="cardio-details-fill-hint">
                {receipt.fillPercent}% del target · mancano {formatMin(receipt.remaining)} min
              </p>
            </div>
          </section>

          <section className="calorie-details-section" aria-label="Distinta quote">
            <h3 className="calorie-details-section__title">La Distinta</h3>
            <p className="calorie-details-section__hint">Come si compone il totale</p>

            <div className="calorie-receipt" role="list">
              <div className="calorie-receipt__row" role="listitem">
                <span className="calorie-receipt__label">
                  <span className="calorie-receipt__op" aria-hidden>+</span>
                  Passi / camminate
                  {receipt.walkingSteps > 0 ? (
                    <span className="calorie-receipt__hint">
                      {receipt.walkingSteps.toLocaleString('it-IT')} passi
                    </span>
                  ) : null}
                </span>
                <span className="calorie-receipt__value">
                  {formatMin(receipt.walkingMin)}
                  <span className="calorie-receipt__unit">min</span>
                </span>
              </div>
              {receipt.walkingKcal > 0 || receipt.walkingNote ? (
                <p className="cardio-details-row-note">
                  {receipt.walkingKcal > 0
                    ? `≈ ${receipt.walkingKcal} kcal`
                    : receipt.walkingNote}
                </p>
              ) : null}

              <div className="calorie-receipt__row" role="listitem">
                <span className="calorie-receipt__label">
                  <span className="calorie-receipt__op" aria-hidden>+</span>
                  Allenamenti cardio
                </span>
                <span className="calorie-receipt__value">
                  {formatMin(receipt.cardioMin)}
                  <span className="calorie-receipt__unit">min</span>
                </span>
              </div>
              {receipt.cardioKcal > 0 ? (
                <p className="cardio-details-row-note">≈ {receipt.cardioKcal} kcal bruciate</p>
              ) : null}

              <div className="calorie-receipt__row" role="listitem">
                <span className="calorie-receipt__label">
                  <span className="calorie-receipt__op" aria-hidden>+</span>
                  Spillover pesi ({receipt.ratioPct}%)
                  <span className="calorie-receipt__hint">
                    da {formatMin(receipt.strengthMin)} min forza
                  </span>
                </span>
                <span className="calorie-receipt__value">
                  {formatMin(receipt.spillMin)}
                  <span className="calorie-receipt__unit">min</span>
                </span>
              </div>

              <div className="calorie-receipt__divider" aria-hidden />

              <div className="calorie-receipt__row calorie-receipt__row--total" role="listitem">
                <span className="calorie-receipt__label">Somma distinta</span>
                <span className="calorie-receipt__value calorie-receipt__value--total">
                  {formatMin(receipt.walkingMin + receipt.cardioMin + receipt.spillMin)}
                  <span className="calorie-receipt__unit">min</span>
                </span>
              </div>
            </div>
          </section>

          {receipt.cardioSessions.length > 0 ? (
            <section className="calorie-details-section" aria-label="Sessioni cardio">
              <h3 className="calorie-details-section__title">Sessioni cardio</h3>
              <ul className="cardio-details-session-list">
                {receipt.cardioSessions.map((s, i) => (
                  <li
                    key={s.id || `${s.label}-${s.dateKey}-${i}`}
                    className="cardio-details-session-row"
                  >
                    <div className="min-w-0">
                      <p className="cardio-details-session-row__title">{s.label}</p>
                      <p className="cardio-details-session-row__meta">
                        {[s.dateKey, s.typeId].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="cardio-details-session-row__values">
                      <span>{formatMin(s.minutes)} min</span>
                      {s.kcal > 0 ? <span>{s.kcal} kcal</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {receipt.walkingSessions.length > 0 ? (
            <section className="calorie-details-section" aria-label="Camminate">
              <h3 className="calorie-details-section__title">Camminate / passi</h3>
              <ul className="cardio-details-session-list">
                {receipt.walkingSessions.map((s, i) => (
                  <li
                    key={s.id || `walk-${s.label}-${s.dateKey}-${i}`}
                    className="cardio-details-session-row"
                  >
                    <div className="min-w-0">
                      <p className="cardio-details-session-row__title">{s.label}</p>
                      <p className="cardio-details-session-row__meta">
                        {[
                          s.dateKey,
                          s.steps > 0 ? `${s.steps.toLocaleString('it-IT')} passi` : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="cardio-details-session-row__values">
                      <span>{formatMin(s.minutes)} min</span>
                      {s.kcal > 0 ? <span>{s.kcal} kcal</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
