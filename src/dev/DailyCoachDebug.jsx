import DailyCoachCard from '@/features/salaComandi/components/DailyCoachCard';

const mockDailyCoach = {
  status: 'active',
  priority: 'recovery',
  title: 'Priorità recupero',
  summary:
    'Sonno disturbato e segnali serali indicano che oggi conviene non forzare il target.',
  action: 'Mantieni un deficit leggero o nullo e riduci stimoli serali.',
  reason:
    'Il coach dà priorità al recupero quando perseguire il target rischia di peggiorare sonno, stress o performance.',
  severity: 'warning',
  overridesGoal: true,
  source: 'sleepCoach',
  details: [
    {
      label: 'Sonno',
      value: '2 possibili cause rilevate',
    },
    {
      label: 'Obiettivo',
      value: 'Target ridimensionato per oggi',
    },
  ],
};

export default function DailyCoachDebug() {
  return (
    <div style={{ padding: 24 }}>
      <DailyCoachCard data={mockDailyCoach} />
      <pre style={{ marginTop: 24 }}>{JSON.stringify(mockDailyCoach, null, 2)}</pre>
    </div>
  );
}
