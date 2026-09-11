import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatInboxDraftCardLabel } from '../utils/mealDraftStatus';

const NEW_MEAL_TYPES = [
  { id: 'colazione', label: 'Colazione' },
  { id: 'snack', label: 'Spuntino' },
  { id: 'pranzo', label: 'Pranzo' },
  { id: 'cena', label: 'Cena' },
];

const BACKDROP_ARM_MS = 450;

/**
 * Bottom sheet di smistamento: anteprima cibi, accorpa, crea pasto, elimina.
 * Portal su document.body per stare sopra overlay PASTI / Diario.
 */
export default function InboxTriageSheet({
  block = null,
  todayMeals = [],
  onCreateNewMeal = null,
  onMergeIntoMeal = null,
  onDeleteDraft = null,
  onClose = null,
}) {
  const [step, setStep] = useState('home');
  const [backdropArmed, setBackdropArmed] = useState(false);

  useEffect(() => {
    setStep('home');
    setBackdropArmed(false);
    if (!block) return undefined;
    const timer = window.setTimeout(() => setBackdropArmed(true), BACKDROP_ARM_MS);
    return () => window.clearTimeout(timer);
  }, [block?.id]);

  if (!block || typeof document === 'undefined') return null;

  const meals = Array.isArray(todayMeals) ? todayMeals : [];
  const items = Array.isArray(block.items) ? block.items : [];
  const hasMeals = meals.length > 0;

  const closeFromBackdrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!backdropArmed) return;
    if (event.target !== event.currentTarget) return;
    onClose?.();
  };

  return createPortal(
    <div
      className="inbox-triage-overlay"
      role="presentation"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={closeFromBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-triage-title"
        className="inbox-triage-sheet"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="inbox-triage-sheet__handle" aria-hidden />
        <h2 id="inbox-triage-title" className="inbox-triage-sheet__title">
          Smista bozza
        </h2>
        <p className="inbox-triage-sheet__summary">{formatInboxDraftCardLabel(block)}</p>

        <ul className="inbox-triage-sheet__preview">
          {items.map((item, index) => {
            const name = String(item?.foodName || item?.name || item?.desc || '').trim() || 'Alimento';
            const grams = Number(item?.grams ?? item?.qta ?? item?.weight);
            return (
              <li key={item?.id || `${name}-${index}`}>
                <span>{name}</span>
                {Number.isFinite(grams) && grams > 0 ? (
                  <span className="inbox-triage-sheet__grams">{Math.round(grams)}g</span>
                ) : null}
              </li>
            );
          })}
        </ul>

        {step === 'home' ? (
          <div className="inbox-triage-sheet__actions">
            <button
              type="button"
              className="inbox-triage-sheet__btn inbox-triage-sheet__btn--primary"
              onClick={() => setStep('create')}
            >
              Crea nuovo pasto
            </button>
            {hasMeals ? (
              <button
                type="button"
                className="inbox-triage-sheet__btn"
                onClick={() => setStep('merge')}
              >
                Accorpa a pasto esistente
              </button>
            ) : null}
          </div>
        ) : null}

        {step === 'merge' ? (
          <div className="inbox-triage-sheet__meals">
            <p className="inbox-triage-sheet__hint">Pasti aperti oggi</p>
            {meals.map((meal) => (
              <button
                key={meal.slotKey || meal.slotId}
                type="button"
                className="inbox-triage-sheet__meal"
                onClick={() => onMergeIntoMeal?.(block, meal)}
              >
                <span className="inbox-triage-sheet__meal-label">{meal.label || meal.title}</span>
                {meal.timeLabel ? (
                  <span className="inbox-triage-sheet__meal-time">{meal.timeLabel}</span>
                ) : null}
              </button>
            ))}
            <button
              type="button"
              className="inbox-triage-sheet__btn inbox-triage-sheet__btn--ghost"
              onClick={() => setStep('home')}
            >
              Indietro
            </button>
          </div>
        ) : null}

        {step === 'create' ? (
          <div className="inbox-triage-sheet__meals">
            <p className="inbox-triage-sheet__hint">Che pasto vuoi aprire?</p>
            <div className="inbox-triage-sheet__types">
              {NEW_MEAL_TYPES.map((mealType) => (
                <button
                  key={mealType.id}
                  type="button"
                  className="inbox-triage-sheet__btn"
                  onClick={() => onCreateNewMeal?.(block, mealType.id)}
                >
                  {mealType.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="inbox-triage-sheet__btn inbox-triage-sheet__btn--ghost"
              onClick={() => setStep('home')}
            >
              Indietro
            </button>
          </div>
        ) : null}

        <button
          type="button"
          className="inbox-triage-sheet__btn inbox-triage-sheet__btn--danger"
          onClick={() => onDeleteDraft?.(block)}
        >
          Elimina bozza
        </button>
        <button
          type="button"
          className="inbox-triage-sheet__btn inbox-triage-sheet__btn--ghost"
          onClick={() => onClose?.()}
        >
          Annulla
        </button>
      </div>
    </div>,
    document.body,
  );
}
