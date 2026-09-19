import React from 'react';
import { CERTAINTY_LEVELS, DRIVER_DIRECTIONS, PILLAR_STATES } from '../contracts/healthSystem.types.js';

const PILLAR_META = {
  metabolism: { label: 'Metabolismo', icon: '🔥' },
  nutrition: { label: 'Nutrizione', icon: '🥗' },
  activity: { label: 'Attività', icon: '🏋️' },
  recovery: { label: 'Recupero', icon: '🌙' },
};

const DRIVER_LABELS = {
  SLEEP_DATA_MISSING: 'Sonno mancante',
  SLEEP_DURATION: 'Durata sonno',
  SLEEP_QUALITY: 'Qualità sonno',
  WAKE_REGULARITY: 'Regolarità sveglia',
  DINNER_SLEEP_BUFFER: 'Finestra cena–sonno',
  SYSTEMIC_FATIGUE: 'Fatica sistemica',
  CALORIE_ADHERENCE: 'Copertura calorica',
  PROTEIN_ADHERENCE: 'Copertura proteica',
  FIBER_ADHERENCE: 'Copertura fibre',
  NUTRITION_CONSISTENCY: 'Costanza nutrizionale',
  CARDIO_LOAD_7D: 'Carico cardio 7g',
  MUSCLE_STIMULUS: 'Stimolo muscolare',
  TRAINING_TODAY: 'Allenamento oggi',
  GLYCEMIC_PENALTY: 'Penalità glicemica',
  METABOLIC_PHASE: 'Fase metabolica',
};

/**
 * Dizionario delle spiegazioni: trasforma i driver tecnici in guide azionabili.
 * Ogni entry contiene PERCHÉ (causa) e COME (azione pratica).
 */
const DRIVER_EXPLANATIONS = {
  GLYCEMIC_PENALTY: {
    cause: 'Hai fatto pasti troppo ravvicinati o consumato zuccheri isolati, tenendo l\'insulina alta.',
    action: 'Oggi lascia passare almeno 4 ore tra un pasto e l\'altro, e abbina i carbo alle fibre.',
  },
  DINNER_SLEEP_BUFFER: {
    cause: 'Hai cenato troppo tardi, impedendo al corpo di abbassare la temperatura per il sonno.',
    action: 'Cerca di chiudere la finestra alimentare almeno 3 ore prima di dormire.',
  },
  CARDIO_LOAD_7D: {
    cause: 'Il dispendio energetico di questa settimana è sotto la soglia minima.',
    action: 'Fai una camminata di 20-30 minuti per sbloccare il metabolismo.',
  },
  MUSCLE_STIMULUS: {
    cause: 'Non hai fatto allenamenti di forza recentemente, perdendo tono muscolare.',
    action: 'Inserisci 2-3 sessioni di pesi o corpo libero questa settimana.',
  },
  TRAINING_TODAY: {
    cause: 'Non hai ancora registrato attività fisica oggi.',
    action: 'Anche una camminata veloce o 15 minuti di esercizi aiutano il sistema.',
  },
  SLEEP_DURATION: {
    cause: 'Hai dormito meno delle ore necessarie per il recupero completo.',
    action: 'Punta ad almeno 7-8 ore consecutive. Vai a letto 30 minuti prima stasera.',
  },
  SLEEP_QUALITY: {
    cause: 'Il sonno è stato frammentato o superficiale, riducendo il recupero.',
    action: 'Evita schermi 1 ora prima di dormire e mantieni la stanza fresca.',
  },
  CALORIE_ADHERENCE: {
    cause: 'Le calorie totali sono troppo lontane dal target giornaliero.',
    action: 'Riequilibra i pasti rimanenti per avvicinarti al fabbisogno.',
  },
  PROTEIN_ADHERENCE: {
    cause: 'Le proteine assunte sono insufficienti per il mantenimento muscolare.',
    action: 'Aggiungi una fonte proteica (carne, pesce, legumi, uova) al prossimo pasto.',
  },
  FIBER_ADHERENCE: {
    cause: 'Le fibre sono scarse, rallentando il transito intestinale.',
    action: 'Integra verdure a foglia verde o legumi nei pasti di oggi.',
  },
  SYSTEMIC_FATIGUE: {
    cause: 'Il carico di stress accumulato (allenamenti + vita) è alto.',
    action: 'Considera un giorno di riposo attivo (stretching, camminata leggera).',
  },
  WAKE_REGULARITY: {
    cause: 'L\'orario di sveglia varia troppo, destabilizzando il ritmo circadiano.',
    action: 'Cerca di svegliarti alla stessa ora anche nei weekend (±30 min).',
  },
  SLEEP_DATA_MISSING: {
    cause: 'Non hai registrato i dati del sonno, limitando l\'analisi del recupero.',
    action: 'Indossa il tracker o registra manualmente orario sonno e sveglia.',
  },
};

const CERTAINTY_BADGE = {
  [CERTAINTY_LEVELS.MEASURED]: { label: 'Rilevato', className: 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200' },
  [CERTAINTY_LEVELS.CALCULATED]: { label: 'Calcolato', className: 'border-sky-400/35 bg-sky-500/12 text-sky-200' },
  [CERTAINTY_LEVELS.INFERRED]: { label: 'Inferito', className: 'border-amber-400/35 bg-amber-500/12 text-amber-200' },
  [CERTAINTY_LEVELS.ESTIMATED]: { label: 'Stimato', className: 'border-zinc-500/40 bg-zinc-800/80 text-zinc-300' },
};

function stateVisual(state) {
  if (state === PILLAR_STATES.OPTIMAL) {
    return { tone: 'text-cyan-300', label: 'Ottimale' };
  }
  if (state === PILLAR_STATES.OVERLOAD) {
    return { tone: 'text-rose-400', label: 'Da migliorare' };
  }
  if (state === PILLAR_STATES.NEUTRAL) {
    return { tone: 'text-amber-300', label: 'In attesa' };
  }
  return { tone: 'text-amber-300', label: 'In flessione' };
}

function driverMark(direction) {
  if (direction === DRIVER_DIRECTIONS.POSITIVE) return { icon: '✓', tone: 'bg-emerald-500/15 text-emerald-300' };
  if (direction === DRIVER_DIRECTIONS.NEGATIVE) return { icon: '⚠', tone: 'bg-amber-500/15 text-amber-300' };
  return { icon: '•', tone: 'bg-white/10 text-zinc-400' };
}

function driverLabel(driver) {
  const id = String(driver?.id || '').trim();
  return DRIVER_LABELS[id] || id.replaceAll('_', ' ').toLowerCase();
}

/**
 * Livello 2 — overlay insight di un singolo pilastro. Nessuna logica fisiologica.
 */
export default function PillarInsightOverlay({
  pillarId = null,
  healthState = null,
  onClose = null,
  onOpenEvidence = null,
} = {}) {
  const id = String(pillarId || '').trim();
  const meta = PILLAR_META[id];
  const pillar = healthState?.pillars?.[id] || null;

  if (!id || !meta) return null;

  const visual = stateVisual(pillar?.state);
  const insightText = String(pillar?.insight?.text || '').trim();
  const certainty = CERTAINTY_BADGE[pillar?.insight?.certainty] || CERTAINTY_BADGE[CERTAINTY_LEVELS.ESTIMATED];
  const drivers = Array.isArray(pillar?.drivers) ? pillar.drivers : [];

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col justify-end bg-black/60 backdrop-blur-md"
      role="presentation"
      onClick={() => onClose?.()}
    >
      <div
        className="mb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] flex max-h-[min(82%,36rem)] w-full flex-col rounded-t-3xl border border-white/10 bg-zinc-950/75 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-label={`Analisi ${meta.label}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-2.5" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <header className="flex shrink-0 items-start gap-3 px-4 pb-3 pt-2">
          <span className="text-2xl leading-none" aria-hidden>{meta.icon}</span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-base font-semibold text-zinc-50">{meta.label}</h2>
            <p className={`m-0 mt-0.5 text-sm font-semibold ${visual.tone}`}>{visual.label}</p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="flex h-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-cyan-200 transition hover:border-white/25 hover:bg-white/[0.08]"
            aria-label="Chiudi analisi"
          >
            Chiudi
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <p className="m-0 min-w-0 flex-1 text-lg font-medium leading-snug text-zinc-200">
              {insightText || 'Nessun insight disponibile per questo pilastro.'}
            </p>
            <span
              className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${certainty.className}`}
            >
              {certainty.label}
            </span>
          </div>

          <h3 className="m-0 mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Driver
          </h3>
          {drivers.length === 0 ? (
            <p className="m-0 text-sm text-zinc-500">Nessun driver per questo pilastro.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {drivers.map((driver) => {
                const mark = driverMark(driver.direction);
                const explanation = DRIVER_EXPLANATIONS[driver.id] || null;
                const showExplanation = explanation && driver.direction === DRIVER_DIRECTIONS.NEGATIVE;
                
                return (
                  <li 
                    key={driver.id} 
                    className={`flex flex-col rounded-xl border px-3 py-3 ${
                      showExplanation 
                        ? 'border-amber-400/20 bg-amber-500/5' 
                        : 'border-white/5 bg-white/[0.02]'
                    }`}
                  >
                    {/* Header del driver: icona + label */}
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${mark.tone}`}
                        aria-hidden
                      >
                        {mark.icon}
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-semibold text-zinc-200">
                        {driverLabel(driver)}
                      </span>
                    </div>
                    
                    {/* Spiegazione: PERCHÉ + COME */}
                    {showExplanation && (
                      <div className="mt-3 flex flex-col gap-2 border-t border-white/5 pt-3">
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-400/80">
                            Perché:
                          </span>
                          <p className="m-0 flex-1 text-xs leading-relaxed text-zinc-400">
                            {explanation.cause}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-cyan-400/80">
                            Come:
                          </span>
                          <p className="m-0 flex-1 text-xs leading-relaxed text-zinc-300">
                            {explanation.action}
                          </p>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          className="shrink-0 border-t border-white/10 px-4 pt-3"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <button
            type="button"
            onClick={() => onOpenEvidence?.(id)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/15 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:border-cyan-400/50 hover:bg-cyan-500/25 active:scale-[0.99]"
          >
            Esplora i dati completi →
          </button>
        </div>
      </div>
    </div>
  );
}
