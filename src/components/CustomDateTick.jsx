import React from 'react';

export default function CustomDateTick({ x, y, payload }) {
  if (!payload || !payload.value) return null;
  const parts = String(payload.value).split('-');
  if (parts.length !== 3) return null;
  const [yyyy, mm, dd] = parts;

  const mesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const nomeMese = mesi[parseInt(mm, 10) - 1] || mm;

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={14} textAnchor="middle" fill="#fff" fontSize="0.9rem" fontWeight="bold">
        {dd}
      </text>
      <text
        x={0}
        y={0}
        dy={28}
        textAnchor="middle"
        fill="#00e5ff"
        fontSize="0.75rem"
        fontWeight="600"
        style={{ textTransform: 'uppercase' }}
      >
        {nomeMese}
      </text>
      <text x={0} y={0} dy={40} textAnchor="middle" fill="#555" fontSize="0.65rem">
        {yyyy}
      </text>
    </g>
  );
}
