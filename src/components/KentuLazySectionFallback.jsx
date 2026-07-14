export default function KentuLazySectionFallback({ label = 'Caricamento…' }) {
  return (
    <div className="kentu-lazy-section-fallback" role="status" aria-live="polite" aria-label={label}>
      <div className="kentu-lazy-section-fallback__spinner" />
      <span>{label}</span>
    </div>
  );
}
