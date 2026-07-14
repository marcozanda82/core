import { Sector } from 'recharts';
import { RADIAN } from '../../coreEngine';

/**
 * Factory per label custom del pie chart pasti (Recharts `label` prop).
 * @param {(entry: object) => void} onSelectMeal
 */
export function createMealPieCustomizedLabel(onSelectMeal) {
  return function MealPieCustomizedLabel(props) {
    const { cx, cy, midAngle, outerRadius, value, name, fill, payload } = props;
    if (name === 'Rimanenti' || value === 0) return null;
    const radius = outerRadius + 14;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    let icon = '🍎';
    const n = (name || '').toLowerCase();
    if (n.includes('pranzo')) icon = '🍝';
    else if (n.includes('cena')) icon = '🍽️';
    else if (n.includes('colazion')) icon = '🍳';
    else if (n.includes('snack') || n.includes('merenda')) icon = '🫐';
    const fullEntry = payload && typeof payload === 'object' ? payload : null;
    return (
      <g
        transform={`translate(${x},${y})`}
        onClick={(e) => {
          e.stopPropagation();
          if (!fullEntry || fullEntry.id === 'rimanenti') return;
          onSelectMeal?.(fullEntry);
        }}
        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
      >
        <circle cx="0" cy="0" r="16" fill="#111" stroke={fill} strokeWidth="1.5" style={{ filter: `drop-shadow(0 0 4px ${fill}80)` }} />
        <text x="0" y="0" dy="4.5" textAnchor="middle" fontSize="14">{icon}</text>
      </g>
    );
  };
}

/** Shape attivo per fetta selezionata nel pie chart pasti (Recharts `activeShape` prop). */
export function MealPieActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 6}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      stroke="#00e5ff"
      strokeWidth={2}
    />
  );
}
