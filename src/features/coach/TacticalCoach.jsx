import React, { useState } from 'react';
import { GOALS } from './tacticalEngine';
import { calculateCorrection } from './NavigationEngine';
import { evaluateMissions } from './MissionEvaluator';

const TacticalCoach = ({ totals, targets, currentCoordinates, onClose }) => {
  const [goal, setGoal] = useState(GOALS.LONGEVITY);

  // Il motore calcola in tempo reale la checklist ogni volta che cambi obiettivo o cambiano i dati
  console.log("🤖 Dati arrivati al Coach:", totals);
  const navigationInstructions = calculateCorrection(currentCoordinates, String(goal || '').toUpperCase());

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      {/* Contenitore principale con max-h-full per non sbordare mai */}
      <div className="bg-white border border-slate-300 rounded-xl w-full max-w-lg shadow-2xl relative flex flex-col max-h-[85dvh]" onClick={e => e.stopPropagation()}>
        
        {/* Tasto Chiudi Fluttuante Assoluto */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 z-30 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm shadow-sm transition-colors"
        >
          ✕
        </button>

        {/* Header fisso (non scorre) */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 rounded-t-xl pr-14 shrink-0">
          <h2 className="font-bold text-[#0b4ea2] text-xl flex items-center gap-2 mb-4">
            <span>🤖</span> Navigatore Tattico
          </h2>
          
          <div className="flex gap-2 bg-slate-200 p-1 rounded-lg">
            {['longevity', 'hypertrophy', 'definition'].map((g) => (
              <button 
                key={g}
                onClick={() => setGoal(g)}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all duration-300 capitalize ${goal === g ? 'bg-white shadow-sm text-[#0b4ea2]' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {g === 'longevity' && '🧬 Longevità'}
                {g === 'hypertrophy' && '💪 Massa'}
                {g === 'definition' && '⚡ Definizione'}
              </button>
            ))}
          </div>
        </div>

        {/* Checklist Operativa */}
        <div className="p-5 overflow-y-auto flex-1 min-h-0 bg-slate-50/50 rounded-b-xl">
          <ul className="space-y-4">
            {evaluateMissions(String(goal || '').toUpperCase(), totals || {}).map((mission) => (
              <li key={mission.id} className="p-4 rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {mission.status === 'completed' ? '✅' : mission.status === 'progress' ? '🟡' : '⏳'}
                    </span>
                    <h4 className="font-bold text-slate-800 text-sm">{mission.title}</h4>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">
                    {mission.current.toFixed(0)} / {mission.targetValue} {mission.unit}
                  </span>
                </div>

                {/* Barra di progresso */}
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${mission.status === 'completed' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                    style={{ width: `${mission.progress}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 p-4 rounded-lg border border-indigo-100 bg-indigo-50/60">
            <h4 className="font-bold text-indigo-900 text-sm mb-2">🚀 Navigazione Attiva</h4>
            <ul className="space-y-2">
              {navigationInstructions.map((line, idx) => (
                <li key={`${idx}-${line}`} className="text-xs leading-relaxed text-indigo-900">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
};

export default TacticalCoach;
