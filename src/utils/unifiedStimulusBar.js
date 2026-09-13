/**
 * Stile unificato barre stimolo (gruppi muscolari + cardio) nel cruscotto Attività.
 * ≤15% priorità · 16–79% recupero · ≥80% ottimale.
 */

export const UNIFIED_STIMULUS_TRACK_CLASS =
  'h-2.5 overflow-hidden rounded-full bg-white/10';

export function unifiedStimulusBarClass(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  if (p <= 15) return 'bg-gradient-to-r from-rose-500 to-red-600';
  if (p < 80) return 'bg-gradient-to-r from-amber-400 to-orange-500';
  return 'bg-gradient-to-r from-cyan-400 to-blue-500';
}
