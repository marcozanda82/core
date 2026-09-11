import { useEffect, useState } from 'react';
import { formatMealTrashRemaining } from '../utils/mealTrash';

/**
 * Lista cestino pasti: ripristino o eliminazione definitiva.
 */
export default function MealTrashSection({
  items = [],
  compact = false,
  hideHeader = false,
  onRestore = null,
  onPurge = null,
}) {
  const [now, setNow] = useState(() => Date.now());
  const list = Array.isArray(items) ? items : [];

  useEffect(() => {
    if (list.length === 0) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, [list.length]);

  if (list.length === 0) return null;

  return (
    <section
      className={compact ? 'meal-trash meal-trash--compact' : 'meal-trash'}
      aria-label="Cestino pasti"
    >
      {hideHeader ? null : (
        <>
          <h3 className="inbox-drafts__title meal-trash__title">🗑️ Cestino</h3>
          <p className="meal-trash__hint">Ogni pasto scade 24 ore dopo l’eliminazione.</p>
        </>
      )}
      <ul className="meal-trash__list">
        {list.map((entry) => {
          const names = (Array.isArray(entry.foods) ? entry.foods : [])
            .map((food) => String(food?.foodName || food?.name || food?.desc || '').trim())
            .filter(Boolean)
            .slice(0, 3)
            .join(', ');
          return (
            <li key={entry.id} className="meal-trash__card">
              <div className="meal-trash__body">
                <p className="meal-trash__label">{entry.label || 'Pasto'}</p>
                {names ? <p className="meal-trash__foods">{names}</p> : null}
                <p className="meal-trash__ttl">{formatMealTrashRemaining(entry.deletedAt, now)}</p>
              </div>
              <div className="meal-trash__actions">
                <button
                  type="button"
                  className="meal-trash__btn meal-trash__btn--restore"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRestore?.(entry);
                  }}
                >
                  Ripristina
                </button>
                <button
                  type="button"
                  className="meal-trash__btn meal-trash__btn--purge"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onPurge?.(entry);
                  }}
                >
                  Elimina per sempre
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
