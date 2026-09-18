import SaluteExperience from '../features/salute/components/SaluteExperience';

/**
 * Rotta isolata `/salute` — preview / debug.
 * La voce bottom nav «Stato» monta SaluteExperience dentro SalaComandi, non questa route.
 */
export default function SaluteExperiencePage() {
  return <SaluteExperience />;
}
