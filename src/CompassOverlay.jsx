import React from 'react';

function CompassOverlayComponent({
  position,
  direction = 0,
  zoneColor = '#7ec4ff',
}) {
  return (
    <div
      aria-hidden
      data-compass-x={position?.x}
      data-compass-y={position?.y}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 8,
      }}
    >
      <div
        style={{
          width: '76%',
          aspectRatio: '1 / 1',
          borderRadius: '50%',
          border: `1px solid ${zoneColor}66`,
          boxShadow: `0 0 18px ${zoneColor}44`,
          opacity: 0.42,
          position: 'relative',
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <circle cx="50" cy="50" r="49" fill="none" stroke={`${zoneColor}66`} strokeWidth="0.8" />
          <circle cx="50" cy="50" r="34" fill="none" stroke={`${zoneColor}40`} strokeWidth="0.6" />
          <line x1="50" y1="2" x2="50" y2="98" stroke={`${zoneColor}55`} strokeWidth="0.65" />
          <line x1="2" y1="50" x2="98" y2="50" stroke={`${zoneColor}55`} strokeWidth="0.65" />
          <g transform={`translate(50 50) rotate(${Number.isFinite(direction) ? direction : 0})`}>
            <polygon points="0,-22 2.2,2 -2.2,2" fill={`${zoneColor}cc`} />
            <polygon points="0,22 1.6,-2 -1.6,-2" fill="rgba(255,255,255,0.35)" />
          </g>
          <circle cx="50" cy="50" r="2.2" fill={`${zoneColor}cc`} />
        </svg>
      </div>
    </div>
  );
}

const CompassOverlay = React.memo(CompassOverlayComponent);
export default CompassOverlay;
