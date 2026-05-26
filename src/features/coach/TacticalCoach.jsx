import React, { useState } from 'react';
import { GOALS, evaluateTacticalMissions } from './tacticalEngine';

const TacticalCoach = ({ totals, targets, onClose }) => {
  const [goal, setGoal] = useState(GOALS.LONGEVITY);

  // Il motore calcola in tempo reale la checklist ogni volta che cambi obiettivo o cambiano i dati
  const missions = evaluateTacticalMissions(totals, targets, goal);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white border border-slate-300 rounded-xl w-full max-w-lg shadow-2xl relative flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Header con Selettore Obiettivo */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 rounded-t-xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-[#0b4ea2] text-xl flex items-center gap-2">
              <span>🤖</span> Navigatore Tattico
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-rose-500 font-bold text-xl transition-colors">✕</button>
          </div>
          
          {/* Selettore a 3 bottoni */}
          <div className="flex gap-2 bg-slate-200 p-1 rounded-lg">
            <button 
              onClick={() => setGoal(GOALS.LONGEVITY)}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition-all duration-300 ${goal === GOALS.LONGEVITY ? 'bg-white shadow-sm text-[#0b4ea2]' : 'text-slate-500 hover:text-slate-700'}`}
            >
              🧬 Longevità
            </button>
            <button 
              onClick={() => setGoal(GOALS.HYPERTROPHY)}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition-all duration-300 ${goal === GOALS.HYPERTROPHY ? 'bg-white shadow-sm text-[#0b4ea2]' : 'text-slate-500 hover:text-slate-700'}`}
            >
              💪 Massa
            </button>
            <button 
              onClick={() => setGoal(GOALS.DEFINITION)}
              className={`flex-1 py-2 text-sm font-bold rounded-md transition-all duration-300 ${goal === GOALS.DEFINITION ? 'bg-white shadow-sm text-[#0b4ea2]' : 'text-slate-500 hover:text-slate-700'}`}
            >
              ⚡ Definizione
            </button>
          </div>
        </div>

        {/* Checklist delle Missioni */}
        <div className="p-5 overflow-y-auto max-h-[60vh]">
          <ul className="space-y-4">
            {missions.map((mission) => (
              <li key={mission.id} className="flex gap-4 p-4 rounded-lg border border-slate-100 bg-slate-50 shadow-sm">
                <div className="text-2xl shrink-0 mt-1">
                  {mission.status === 'success' && '✅'}
                  {mission.status === 'error' && '❌'}
                  {mission.status === 'pending' && '⏳'}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm mb-1">{mission.title}</h4>
                  <p className={`text-sm ${mission.status === 'error' ? 'text-rose-600 font-medium' : 'text-slate-600'}`}>
                    {mission.message}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TacticalCoach;
