const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

const COLOR_STYLE = {
  red: {
    border: '1px solid rgba(255, 85, 85, 0.65)',
    color: '#ff6b6b',
    background: 'rgba(255, 85, 85, 0.06)',
    boxShadow: '0 0 8px rgba(255,85,85,0.15)',
  },
  orange: {
    border: '1px solid rgba(255, 152, 0, 0.55)',
    color: '#ff9800',
    background: 'rgba(255, 152, 0, 0.06)',
    boxShadow: '0 0 8px rgba(255,152,0,0.12)',
  },
  neutral: {
    border: '1px solid rgba(0, 229, 255, 0.35)',
    color: '#7dd3fc',
    background: 'rgba(0, 229, 255, 0.08)',
    boxShadow: '0 0 8px rgba(0,229,255,0.08)',
  },
};

/**
 * Barra indicatori giornalieri: target calorico quando disponibile.
 *
 * @param {{
 *   calorieStrategyLabel?: string,
 *   onClick?: () => void,
 * }} props
 */
export default function DailyIndicatorsBar({
  calorieStrategyLabel,
  onClick,
} = {}) {
  /** @type {{ type: string, label: string, color: 'red' | 'orange' | 'neutral' }[]} */
  const indicators = [];

  const label = calorieStrategyLabel != null ? String(calorieStrategyLabel).trim() : '';
  if (label) {
    indicators.push({
      type: 'target',
      label: `Target: ${label}`,
      color: 'neutral',
    });
  }

  if (indicators.length === 0) {
    return null;
  }

  const visible = indicators.slice(0, 2);
  const overflow = indicators.length - visible.length;

  const handleKeyDown = (e) => {
    if (typeof onClick !== 'function') return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const interactive = typeof onClick === 'function';

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onClick() : undefined}
      onKeyDown={interactive ? handleKeyDown : undefined}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        width: '100%',
        marginBottom: 'max(8px, 1vh)',
        fontSize: '0.62rem',
        fontWeight: 'bold',
        fontFamily: FONT,
        cursor: interactive ? 'pointer' : 'default',
        boxSizing: 'border-box',
        outline: 'none',
      }}
    >
      {visible.map((ind) => {
        const palette = COLOR_STYLE[ind.color];
        return (
          <span
            key={`${ind.type}-${ind.label}`}
            style={{
              padding: '5px 9px',
              borderRadius: 16,
              whiteSpace: 'nowrap',
              lineHeight: 1.25,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              ...palette,
            }}
          >
            {ind.label}
          </span>
        );
      })}
      {overflow > 0 ? (
        <span
          style={{
            padding: '5px 8px',
            borderRadius: 16,
            whiteSpace: 'nowrap',
            lineHeight: 1.25,
            border: '1px solid rgba(255,255,255,0.14)',
            color: 'rgba(200, 210, 220, 0.85)',
            background: 'rgba(255,255,255,0.04)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {`+${overflow}`}
        </span>
      ) : null}
    </div>
  );
}
