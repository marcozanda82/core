import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import WeeklyBuilder from '../features/weeklyBlocks/components/WeeklyBuilder';
import { useFirebase } from '../useFirebase';
import { getWeekStartMondayKeyLocal } from '../weeklyPlanning';

export default function WeeklyPlannerPage() {
  const navigate = useNavigate();
  const { db, user, authReady } = useFirebase();
  const weekStart = useMemo(() => getWeekStartMondayKeyLocal(), []);

  return (
    <div className="min-h-screen bg-slate-900 pb-20 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-700/80 bg-slate-900/95 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700"
            aria-label="Torna indietro"
          >
            ← Indietro
          </button>
          <h1 className="text-base font-bold text-slate-50 sm:text-lg">
            Pianificazione Settimanale
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg">
        <WeeklyBuilder
          db={db}
          userUid={user?.uid ?? null}
          weekStart={weekStart}
          authReady={authReady}
          onSaveSuccess={() => navigate('/')}
        />
      </main>
    </div>
  );
}
