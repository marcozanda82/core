import {
  dayNutritionProjectionTitle,
  formatSignedRemainingLabel,
  hasCountableProjectedMeal,
} from './formatDayNutritionRemaining.js';
import './DayNutritionProjectionCard.css';

const MACRO_ROWS = [
  { key: 'prot', label: 'Proteine', unit: 'g' },
  { key: 'carb', label: 'Carboidrati', unit: 'g' },
  { key: 'fat', label: 'Grassi', unit: 'g' },
];

function formatQty(value, unit) {
  const n = Number(value) || 0;
  if (unit === 'kcal') return String(Math.round(n));
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 10) / 10);
}

function statusClass(status) {
  if (status === 'over' || status === 'on-target' || status === 'under') return status;
  return 'neutral';
}

/**
 * Solo presentazione. `projection` deve arrivare da useDayNutritionProjection / projectDayNutrition.
 */
export default function DayNutritionProjectionCard({
  projection,
  mealType = null,
  compact = false,
}) {
  if (!hasCountableProjectedMeal(projection)) return null;

  const target = projection.target || {};
  const after = projection.after || {};
  const remaining = projection.remaining || {};
  const status = projection.status || {};
  const isDinner = String(mealType || '').toLowerCase().split('_')[0] === 'cena';
  const title = dayNutritionProjectionTitle(mealType);
  const kcalCopy = formatSignedRemainingLabel(remaining.kcal, { unit: 'kcal', capitalize: true });
  const kcalStatus = statusClass(status.kcal);

  return (
    <section
      className={`kentu-day-projection ${compact ? 'kentu-day-projection--compact' : ''} ${isDinner ? 'kentu-day-projection--dinner' : ''}`}
      aria-label={title}
    >
      <h4 className="kentu-day-projection__title">{title}</h4>

      <div className={`kentu-day-projection__kcal kentu-day-projection__kcal--${kcalStatus}`}>
        <div className="kentu-day-projection__kcal-row">
          <span className="kentu-day-projection__kcal-label">Giornata</span>
          <span className="kentu-day-projection__kcal-values">
            {formatQty(after.kcal, 'kcal')} / {formatQty(target.kcal, 'kcal')} kcal
          </span>
        </div>
        <p className="kentu-day-projection__kcal-delta">{kcalCopy.text}</p>
      </div>

      <ul className="kentu-day-projection__macros">
        {MACRO_ROWS.map((row) => {
          const st = statusClass(status[row.key]);
          const copy = formatSignedRemainingLabel(remaining[row.key], { unit: row.unit, capitalize: false });
          return (
            <li key={row.key} className={`kentu-day-projection__macro kentu-day-projection__macro--${st}`}>
              <div className="kentu-day-projection__macro-top">
                <span className="kentu-day-projection__macro-label">{row.label}</span>
                <span className="kentu-day-projection__macro-values">
                  {formatQty(after[row.key], 'g')} / {formatQty(target[row.key], 'g')} g
                </span>
              </div>
              <p className="kentu-day-projection__macro-delta">{copy.text}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
