/**
 * Micro-badge digiuno flottante (angolo quadrante biologico).
 * @param {{
 *   fastingData?: {
 *     hoursFasted?: number,
 *     timeString?: string,
 *     phaseName?: string,
 *     phaseColor?: string,
 *   } | null,
 * }} props
 */
export default function FastingBannerWidget({ fastingData }) {
  const hoursFasted = Math.max(0, Number(fastingData?.hoursFasted) || 0);
  if (hoursFasted < 4) return null;

  const phaseColor = fastingData?.phaseColor || '#00e5ff';
  const phaseName = shortPhaseLabel(fastingData?.phaseName);
  const durationLabel = formatFastingDuration(hoursFasted, fastingData?.timeString);
  const progressPct = Math.min(100, (hoursFasted / 16) * 100);

  return (
    <div
      role="status"
      aria-label={`Digiuno attivo: ${durationLabel}, fase ${phaseName}`}
      style={{
        position: 'absolute',
        top: '0px',
        left: '0px',
        zIndex: 20,
        padding: '4px 10px',
        borderRadius: '12px',
        fontSize: '0.65rem',
        fontWeight: 'bold',
        letterSpacing: '0.5px',
        whiteSpace: 'nowrap',
        color: phaseColor,
        background: hexToRgba(phaseColor, 0.15),
        border: `1px solid ${hexToRgba(phaseColor, 0.35)}`,
        borderBottom: `1px solid ${hexToRgba(phaseColor, 0.2 + (progressPct / 100) * 0.6)}`,
        boxShadow: `0 2px 8px ${hexToRgba(phaseColor, 0.12)}`,
        fontVariantNumeric: 'tabular-nums',
        textTransform: 'uppercase',
        pointerEvents: 'none',
      }}
    >
      ⏳ {durationLabel} • {phaseName}
    </div>
  );
}

/**
 * @param {string} [phaseName]
 * @returns {string}
 */
function shortPhaseLabel(phaseName) {
  const name = String(phaseName || 'ASSORBIMENTO').toUpperCase();
  if (name.includes('CHETOSI')) return 'CHETOSI';
  if (name.includes('CATABOLISMO') || name.includes('DIGIUNO')) return 'DIGIUNO';
  if (name.includes('AUTOFAGIA')) return 'AUTOFAGIA';
  return name.split('/')[0].trim();
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
