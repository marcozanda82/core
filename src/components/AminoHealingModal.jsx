import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getFoodsNeedingAminoHealing } from '../features/nutrition/calculateProteinReliability';

/**
 * @param {{ food: { id: string, name: string, protein: number, isAminoEstimated: boolean, hasAminoProfile: boolean } }} props
 */
function AminoHealingRow({ food }) {
  const reason = food.isAminoEstimated
    ? 'Profilo stimato'
    : 'Profilo amminoacidico assente';

  return (
    <li className="amino-healing-modal__row">
      <div className="amino-healing-modal__food">
        <span className="amino-healing-modal__name" title={food.name}>
          {food.name}
        </span>
        <span className="amino-healing-modal__meta">
          {food.protein}g prot · {reason}
        </span>
      </div>
      <button
        type="button"
        className="amino-healing-modal__action"
        onClick={() => {
          console.log('[AminoHealing] Associa Master:', {
            foodId: food.id,
            name: food.name,
            protein: food.protein,
          });
        }}
      >
        Associa ad alimento Master
      </button>
    </li>
  );
}

/**
 * Modale bozza — sanatoria alimenti con amminoacidi stimati o mancanti.
 *
 * @param {{
 *   isOpen: boolean,
 *   onClose: () => void,
 *   dailyLog?: Array<Record<string, unknown>>,
 * }} props
 */
export default function AminoHealingModal({ isOpen, onClose, dailyLog = [] }) {
  const foodsToHeal = useMemo(
    () => getFoodsNeedingAminoHealing(dailyLog),
    [dailyLog],
  );

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="presentation"
      className="amino-healing-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="amino-healing-title"
        className="amino-healing-modal vetrina-sheet-enter"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="amino-healing-modal__header">
          <h2 id="amino-healing-title" className="amino-healing-modal__title">
            Sana Dati
          </h2>
          <button
            type="button"
            className="amino-healing-modal__close"
            onClick={onClose}
            aria-label="Chiudi sanatoria dati"
          >
            ✕
          </button>
        </div>

        <p className="amino-healing-modal__intro">
          Alimenti con profilo amminoacidico stimato o incompleto. Associa un alimento Master
          del database CREA/USDA per migliorare l&apos;affidabilità del dato.
        </p>

        <ul className="amino-healing-modal__list">
          {foodsToHeal.length === 0 ? (
            <li className="amino-healing-modal__empty">
              Nessun alimento da sanare oggi — profilo amminoacidico completo.
            </li>
          ) : (
            foodsToHeal.map((food) => <AminoHealingRow key={food.id} food={food} />)
          )}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
