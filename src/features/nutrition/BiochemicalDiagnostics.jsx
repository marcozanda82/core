import { useMemo } from 'react';
import { TARGETS } from '../../useBiochimico';

const WHO_REFERENCE_MG_PER_G_PROTEIN = Object.freeze({
  leu: 59,
  iso: 30,
  val: 39,
  lys: 45,
  met: 22,
  phe: 38,
  thr: 23,
  trp: 6,
  his: 15,
});

const AMINO_LABELS = Object.freeze({
  leu: 'Leucina',
  iso: 'Isoleucina',
  val: 'Valina',
  lys: 'Lisina',
  met: 'Metionina',
  phe: 'Fenilalanina',
  thr: 'Treonina',
  trp: 'Triptofano',
  his: 'Istidina',
});

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function fmt(value, digits = 1) {
  return Number(value).toFixed(digits);
}

function readVit(entry, letter) {
  if (!entry || typeof entry !== 'object') return 0;
  if (letter === 'A') return num(entry.vitA ?? entry.A);
  if (letter === 'D') return num(entry.vitD ?? entry.D);
  if (letter === 'E') return num(entry.vitE ?? entry.E);
  if (letter === 'K') return num(entry.vitK ?? entry.K);
  return 0;
}

export default function BiochemicalDiagnostics({
  todayMicros = null,
  aminoAcidProfile = null,
  weeklyLiposolubleHistory = [],
  onClose = () => {},
}) {
  const sodiumMg = num(todayMicros?.sodium ?? todayMicros?.na);
  const potassiumMg = num(todayMicros?.potassium ?? todayMicros?.k);
  const omega3 = num(todayMicros?.omega3);
  const omega6 = num(todayMicros?.omega6);

  const omegaRatio = omega3 > 0 ? omega6 / omega3 : Number.POSITIVE_INFINITY;
  const omegaIsGood = Number.isFinite(omegaRatio) && omegaRatio < 5;

  const proteinGrams = Math.max(1, num(aminoAcidProfile?.proteinGrams ?? 100));
  const aminoStats = useMemo(() => {
    const rows = Object.keys(WHO_REFERENCE_MG_PER_G_PROTEIN).map((key) => {
      const intake = num(aminoAcidProfile?.[key]);
      const targetMg = WHO_REFERENCE_MG_PER_G_PROTEIN[key] * proteinGrams;
      const ratio = targetMg > 0 ? (intake / targetMg) * 100 : 0;
      return {
        key,
        label: AMINO_LABELS[key] || key,
        ratio,
      };
    });
    const limiting = rows.reduce((minRow, row) => (row.ratio < minRow.ratio ? row : minRow), rows[0] || { label: '-', ratio: 0 });
    return {
      score: clamp(limiting.ratio, 0, 120),
      limitingLabel: limiting.label || '-',
    };
  }, [aminoAcidProfile, proteinGrams]);

  const liposoluble = useMemo(() => {
    const rows = Array.isArray(weeklyLiposolubleHistory) ? weeklyLiposolubleHistory : [];
    const safeRows = rows.slice(0, 7);
    const avg = (letter) => {
      if (!safeRows.length) return 0;
      const total = safeRows.reduce((acc, entry) => acc + readVit(entry, letter), 0);
      return total / safeRows.length;
    };
    const toPct = (value, target) => (target > 0 ? clamp((value / target) * 100, 0, 140) : 0);
    return {
      A: toPct(avg('A'), num(TARGETS?.vit?.vitA) || 900),
      D: toPct(avg('D'), num(TARGETS?.vit?.vitD) || 15),
      E: toPct(avg('E'), num(TARGETS?.vit?.vitE) || 15),
      K: toPct(avg('K'), num(TARGETS?.vit?.vitK) || 120),
    };
  }, [weeklyLiposolubleHistory]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white border border-slate-300 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl relative p-6">
        
        {/* Pulsante Chiusura */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-1 px-3 rounded"
        >
          Esci
        </button>
        
        <h2 className="text-3xl font-bold text-[#0b4ea2] mb-1 border-b border-slate-300 pb-2">Tracker Nutrizionale - Diagnostica</h2>
        <p className="text-sm text-slate-500 mb-6 mt-2">Dati aggiornati in tempo reale</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* QUADRANTE 1: Bilancia Idrica */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 className="text-lg font-bold text-[#0b4ea2] mb-4">Bilancia Idrica (Anti-Cortisolo)</h3>
            <div className="mb-2">
              <div className="flex justify-between text-sm font-medium mb-1 text-slate-700">
                <span>SODIO (Na)</span>
                <span>{Math.round(sodiumMg)} mg</span>
              </div>
              <div className="w-full bg-slate-300 h-6">
                <div className="bg-rose-500 h-6" style={{ width: `${Math.min((sodiumMg / 2000) * 100, 100)}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm font-medium mb-1 text-slate-700">
                <span>POTASSIO (K)</span>
                <span>{Math.round(potassiumMg)} mg</span>
              </div>
              <div className="w-full bg-slate-300 h-6">
                <div className="bg-green-600 h-6" style={{ width: `${Math.min((potassiumMg / 3400) * 100, 100)}%` }}></div>
              </div>
            </div>
          </div>

          {/* QUADRANTE 2: Proteine */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 className="text-lg font-bold text-[#0b4ea2] mb-4">Qualità Proteica</h3>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-4xl font-bold text-slate-800">{Math.round(aminoStats.score)}%</span>
            </div>
            <div className="w-full bg-slate-300 h-6 mb-2">
              <div className="bg-green-600 h-6" style={{ width: `${clamp(aminoStats.score)}%` }}></div>
            </div>
            <p className="text-sm text-slate-600 font-medium">Limitante: {aminoStats.limitingLabel}</p>
          </div>

          {/* QUADRANTE 3: Infiammazione */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 className="text-lg font-bold text-[#0b4ea2] mb-4">Indice Infiammatorio</h3>
            <div className="text-center mb-4">
              <span className="text-slate-700 font-bold">Rapporto O6:O3: </span>
              <span className={`text-2xl font-bold ${omegaIsGood ? 'text-emerald-500' : 'text-rose-600'}`}>
                {Number.isFinite(omegaRatio) ? omegaRatio.toFixed(1) : '∞'} : 1
              </span>
            </div>
            <div className="flex justify-between text-sm text-slate-700 mb-1">
              <span>Omega 3: {fmt(omega3, 2)} g</span>
              <span>Omega 6: {fmt(omega6, 2)} g</span>
            </div>
            <div className="flex w-full bg-slate-300 h-4 gap-1">
               <div className="bg-green-600 h-4 w-1/4"></div>
               <div className="bg-rose-500 h-4 w-3/4"></div>
            </div>
          </div>

          {/* QUADRANTE 4: Vitamine */}
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 className="text-lg font-bold text-[#0b4ea2] mb-4">Accumulabili (Fegato)</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm text-slate-700 mb-1">
                  <span>Vitamina A</span>
                  <span>{Math.round(liposoluble.A)}%</span>
                </div>
                <div className="w-full bg-slate-300 h-4">
                  <div className="bg-green-600 h-4" style={{ width: `${clamp(liposoluble.A)}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm text-slate-700 mb-1">
                  <span>Vitamina D</span>
                  <span>{Math.round(liposoluble.D)}%</span>
                </div>
                <div className="w-full bg-slate-300 h-4">
                  <div className="bg-green-600 h-4" style={{ width: `${clamp(liposoluble.D)}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm text-slate-700 mb-1">
                  <span>Vitamina E</span>
                  <span>{Math.round(liposoluble.E)}%</span>
                </div>
                <div className="w-full bg-slate-300 h-4">
                  <div className="bg-green-600 h-4" style={{ width: `${clamp(liposoluble.E)}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm text-slate-700 mb-1">
                  <span>Vitamina K</span>
                  <span>{Math.round(liposoluble.K)}%</span>
                </div>
                <div className="w-full bg-slate-300 h-4">
                  <div className="bg-green-600 h-4" style={{ width: `${clamp(liposoluble.K)}%` }}></div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
