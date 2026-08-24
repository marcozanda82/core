import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import {
  createMealPieCustomizedLabel,
  MealPieActiveShape,
} from './mealPieChartRenderers';

/**
 * Anello pasti home — isolato per lazy-load recharts fuori da SalaComandi.
 */
export default function HomeMealPieDial({
  mealPieDisplayData = [],
  selectedMealCenterIndex = -1,
  selectedMealCenter = null,
  onSelectMealCenter,
  onPieSliceClick,
}) {
  const renderCustomizedLabel = useMemo(
    () => createMealPieCustomizedLabel(onSelectMealCenter),
    [onSelectMealCenter],
  );

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={250}>
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
          activeShape={MealPieActiveShape}
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
