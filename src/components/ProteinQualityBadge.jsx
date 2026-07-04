/**
 * Semaforo affidabilità dati proteici — pillola glassmorphism cliccabile.
 *
 * @param {{
 *   score: number,
 *   status: 'GREEN' | 'YELLOW' | 'RED',
 *   onClick?: () => void,
 *   className?: string,
 * }} props
 */
export default function ProteinQualityBadge({ score, status, onClick, className = '' }) {
  const safeScore = Number.isFinite(Number(score)) ? Math.round(Number(score) * 10) / 10 : 0;
  const normalizedStatus =
    status === 'GREEN' || status === 'YELLOW' || status === 'RED' ? status : 'RED';

  const statusClass = {
    GREEN: 'protein-quality-badge--green',
    YELLOW: 'protein-quality-badge--yellow',
    RED: 'protein-quality-badge--red',
  }[normalizedStatus];

  const label = `Affidabilità: ${Number.isInteger(safeScore) ? safeScore : safeScore.toFixed(1)}%`;

  if (onClick) {
    return (
      <button
        type="button"
        className={`protein-quality-badge protein-quality-badge--interactive ${statusClass} ${className}`.trim()}
        onClick={onClick}
        aria-label={`${label}. Apri sanatoria dati amminoacidi.`}
      >
        <span className="protein-quality-badge__dot" aria-hidden />
        <span className="protein-quality-badge__text">{label}</span>
      </button>
    );
  }

  return (
    <div
      className={`protein-quality-badge ${statusClass} ${className}`.trim()}
      aria-label={label}
    >
      <span className="protein-quality-badge__dot" aria-hidden />
      <span className="protein-quality-badge__text">{label}</span>
    </div>
  );
}
