/**
 * Banner digiuno metabolico (da buildMetabolicFastingSnapshot / fastingData).
 * @param {{
 *   fastingData?: {
 *     hoursFasted?: number,
 *     timeString?: string,
 *     phaseName?: string,
 *     phaseColor?: string,
 *     phaseDesc?: string,
 *   } | null,
 * }} props
 */
export default function FastingBannerWidget({ fastingData }) {
  const hoursFasted = Math.max(0, Number(fastingData?.hoursFasted) || 0);
  const phaseColor = fastingData?.phaseColor || '#00e5ff';
  const phaseName = String(fastingData?.phaseName || 'ASSORBIMENTO').toUpperCase();
  const durationLabel = formatFastingDuration(hoursFasted, fastingData?.timeString);

  if (hoursFasted < 4) {
    return (
      <div
        role="status"
        aria-label="Fase digestiva attiva"
        style={{
          width: '100%',
          marginBottom: '8px',
          padding: '8px 14px',
          borderRadius: '16px',
          border: '1px solid rgba(148, 163, 184, 0.18)',
          background: 'rgba(15, 23, 42, 0.35)',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            color: 'rgba(148, 163, 184, 0.85)',
          }}
        >
          Fase digestiva
        </div>
      </div>
    );
  }

  const progressPct = Math.min(100, (hoursFasted / 16) * 100);
  const bgTint = hexToRgba(phaseColor, 0.15);
  const borderTint = hexToRgba(phaseColor, 0.38);

  return (
    <div
      role="status"
      aria-label={`Digiuno attivo: ${durationLabel}, fase ${phaseName}`}
      style={{
        width: '100%',
        marginBottom: '10px',
        padding: '12px 16px',
        borderRadius: '16px',
        border: `1px solid ${borderTint}`,
        background: `linear-gradient(135deg, ${bgTint} 0%, rgba(10, 10, 12, 0.55) 100%)`,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: '0.82rem',
            fontWeight: 800,
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            color: phaseColor,
            textShadow: `0 0 12px ${hexToRgba(phaseColor, 0.35)}`,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          Digiuno: {durationLabel}
        </div>
        <div
          style={{
            fontSize: '0.68rem',
            fontWeight: 600,
            letterSpacing: '1.1px',
            textTransform: 'uppercase',
            color: 'rgba(226, 232, 240, 0.88)',
          }}
        >
          Fase: {phaseName}
        </div>
      </div>
      <div
        aria-hidden
        style={{
          marginTop: '10px',
          height: '2px',
          width: '100%',
          borderRadius: '999px',
          background: 'rgba(255, 255, 255, 0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progressPct}%`,
            borderRadius: '999px',
            background: phaseColor,
            boxShadow: `0 0 6px ${hexToRgba(phaseColor, 0.55)}`,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

/**
 * @param {number} hoursFasted
 * @param {string} [fallbackTimeString]
 * @returns {string}
 */
function formatFastingDuration(hoursFasted, fallbackTimeString) {
  const raw = Math.max(0, Number(hoursFasted) || 0);
  if (!Number.isFinite(raw)) {
    return String(fallbackTimeString || '0h 0m').trim();
  }
  const h = Math.floor(raw);
  const fractional = raw - h;
  let m = Math.round(fractional * 60);
  if (m >= 60) {
    return `${h + 1}h 0m`;
  }
  return `${h}h ${m}m`;
}

/**
 * @param {string} hex
 * @param {number} alpha
 * @returns {string}
 */
function hexToRgba(hex, alpha) {
  const normalized = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(0, 229, 255, ${alpha})`;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
