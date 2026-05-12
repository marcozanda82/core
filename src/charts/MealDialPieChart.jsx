import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Sector } from 'recharts';
import { RADIAN } from '../coreEngine';

function ActiveMealSector(props) {
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

/** Anello pasti cruscotto — dataset e handler dal parent. */
export default function MealDialPieChart({
  mealPieDisplayData,
  selectedMealCenterIndex,
  selectedMealCenter,
  onPieSliceClick,
  onMealLabelClick,
}) {
  const renderCustomizedLabel = (props) => {
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
          onMealLabelClick(fullEntry);
        }}
        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
      >
        <circle cx="0" cy="0" r="16" fill="#111" stroke={fill} strokeWidth="1.5" style={{ filter: `drop-shadow(0 0 4px ${fill}80)` }} />
        <text x="0" y="0" dy="4.5" textAnchor="middle" fontSize="14">{icon}</text>
      </g>
    );
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={mealPieDisplayData}
          cx="50%"
          cy="50%"
          innerRadius="68%"
          outerRadius="85%"
          paddingAngle={3}
          startAngle={90}
          endAngle={-270}
          dataKey="value"
          stroke="none"
          labelLine={false}
          label={renderCustomizedLabel}
          activeShape={ActiveMealSector}
          activeIndex={selectedMealCenterIndex}
          onClick={onPieSliceClick}
          style={{ cursor: 'pointer', outline: 'none' }}
        >
          {mealPieDisplayData.map((entry) => {
            const isSelected = selectedMealCenter && entry.id === selectedMealCenter.id;
            const hasSelection = !!selectedMealCenter;
            return (
              <Cell
                key={entry.id}
                fill={entry.color}
                style={{
                  filter: isSelected ? `drop-shadow(0 0 15px ${entry.color})` : 'none',
                  opacity: hasSelection && !isSelected ? 0.3 : 1,
                  outline: 'none',
                }}
              />
            );
          })}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}
