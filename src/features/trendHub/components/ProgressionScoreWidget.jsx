import React, { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

function toneFromScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'neutral';
  if (n >= 75) return 'good';
  if (n >= 50) return 'mid';
  return 'low';
}

const TONE_STROKE = {
  good: '#34d399',
  mid: '#fbbf24',
  low: '#f87171',
  neutral: '#a78bfa',
};

const PILLAR_MAX = 100 / 3;

function pillarPctFromScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || PILLAR_MAX <= 0) return 0;
  return Math.round(Math.max(0, Math.min(100, (n / PILLAR_MAX) * 100)));
}

function buildNutritionDetail(b, nutritionPct) {
  if (b.nutritionAwaitingData) {
    return {
      raw: 'Nessun giorno nutrizionale completato nella finestra (media kcal ≥ 300).',
      analysis: 'In attesa di pasti registrati. Quando chiuderai qualche giornata con un introito reale, qui vedrai l\'aderenza ai target.',
    };
  }
  const avgKcal = Number.isFinite(Number(b.nutritionAvgKcal)) ? Math.round(Number(b.nutritionAvgKcal)) : null;
  const targetKcal = Number.isFinite(Number(b.nutritionTargetKcal)) ? Math.round(Number(b.nutritionTargetKcal)) : null;
  const avgProt = Number.isFinite(Number(b.nutritionAvgProt)) ? Math.round(Number(b.nutritionAvgProt)) : null;
  const targetProt = Number.isFinite(Number(b.nutritionTargetProt)) ? Math.round(Number(b.nutritionTargetProt)) : null;

  const raw = [
    avgKcal != null && targetKcal != null ? `Media Kcal: ${avgKcal} / Target: ${targetKcal}` : null,
    avgProt != null && targetProt != null ? `Media Prot: ${avgProt}g / Target: ${targetProt}g` : null,
  ].filter(Boolean).join(' | ') || 'Dati nutrizionali non disponibili.';

  const analysis = nutritionPct >= 80
    ? 'Ottima costanza! Stai centrando i macro, il corpo ha tutto il carburante necessario.'
    : 'Le calorie o le proteine fluttuano un po\' troppo rispetto al target. Cerca di stabilizzare l\'introito.';

  return { raw, analysis };
}

function buildTrainingDetail(b, trainingPct) {
  const stimulus = Number.isFinite(Number(b.averageStimulus))
    ? Math.round(Number(b.averageStimulus))
    : trainingPct;
  const raw = `Stimolo muscolare medio (7g): ${stimulus}% sui 5 distretti`;

  let analysis;
  if (trainingPct >= 70) {
    analysis = 'Volume ottimale: lo stimolo muscolare è costante e ben distribuito.';
  } else if (trainingPct >= 40) {
    analysis = 'Stimolo parziale: alcuni gruppi muscolari stanno entrando in fase di recupero totale, valuta un richiamo.';
  } else {
    analysis = 'Detraining in corso: lo stimolo meccanico è insufficiente per mantenere la sintesi proteica, a prescindere dall\'alimentazione.';
  }

  return { raw, analysis };
}

function buildRecoveryDetail(b, sleepPct) {
  const sleepAvg = Number.isFinite(Number(b.sleepAvg)) && Number(b.sleepAvg) > 0
    ? Number(b.sleepAvg)
    : null;
  const sleepTarget = Number.isFinite(Number(b.sleepTarget)) && Number(b.sleepTarget) > 0
    ? Number(b.sleepTarget)
    : 7.5;

  const raw = sleepAvg != null
    ? `Sonno medio: ${sleepAvg.toFixed(1)}h / Target: ${sleepTarget.toFixed(1)}h`
    : `Sonno medio: n/d / Target: ${sleepTarget.toFixed(1)}h`;

  let analysis;
  if (sleepAvg == null) {
    analysis = 'Ancora pochi dati sul sonno. Registra le notti per ottenere un\'analisi sul recupero.';
  } else if (sleepPct >= 100) {
    analysis = 'Recupero solido: stai rispettando (o superando) il target di sonno. Ottima base per sintesi e adattamento.';
  } else {
    analysis = 'Sei in leggero deficit di sonno. Cerca di anticipare la buonanotte di 30 minuti per massimizzare la sintesi proteica notturna.';
  }

  return { raw, analysis };
}

function PagellaExpandPanel({ raw, analysis }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="overflow-hidden"
    >
      <div className="mt-2 rounded-lg border border-slate-700/50 bg-slate-900/50 p-3">
        <p className="text-[11px] leading-relaxed text-slate-400">
          <span className="mr-1" aria-hidden>📊</span>
          <span className="font-semibold text-slate-300">Dati grezzi:</span>
          {' '}
          {raw}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-100">
          <span className="mr-1" aria-hidden>💡</span>
          <span className="font-semibold text-emerald-300/90">Analisi:</span>
          {' '}
          {analysis}
        </p>
      </div>
    </motion.div>
  );
}

const EMPTY_BREAKDOWN = Object.freeze({
  nutritionScore: 0,
  trainingScore: 0,
  sleepScore: 0,
  nutritionPct: null,
  trainingPct: null,
  sleepPct: null,
  nutritionDaysScored: 0,
  nutritionAwaitingData: false,
  nutritionAvgKcal: null,
  nutritionAvgProt: null,
  nutritionTargetKcal: null,
  nutritionTargetProt: null,
  workoutSessions: 0,
  workoutTarget: 8,
  averageStimulus: null,
  sleepAvg: null,
  sleepTarget: 7.5,
});

/**
 * Hero Punteggio Progressione — simmetrico a SaluteLongevityHero + pagella a scomparsa.
 * `compact`: anello ridotto per slide gemella Home (niente pagella).
 */
export default function ProgressionScoreWidget({
  score = null,
  breakdown = null,
  size = 200,
  compact = false,
  onClick = null,
  /** Etichetta centrale anello (Home swap: Progressione | Cardio). */
  label = 'Progressione',
} = {}) {
  const [showDetails, setShowDetails] = useState(false);
  const [expandedItem, setExpandedItem] = useState(null);
  const uid = useId().replace(/:/g, '');
  const ringLabel = String(label || 'Progressione').trim() || 'Progressione';
  const gradId = `progression-grad-${uid}`;
  const ringSize = compact ? Math.min(Number(size) || 96, 110) : (Number(size) || 200);
  const value = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Math.round(Number(score)))) : null;
  const pct = value ?? 0;
  const tone = toneFromScore(value);
  const stroke = compact ? 8 : 14;
  const r = (ringSize - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const center = ringSize / 2;
  const strokeColor = TONE_STROKE[tone] || TONE_STROKE.neutral;

  const b = breakdown && typeof breakdown === 'object' ? breakdown : EMPTY_BREAKDOWN;
  const nutritionAwaitingData = b.nutritionAwaitingData === true;
  const nutritionPct = Number.isFinite(Number(b.nutritionPct))
    ? Math.round(Number(b.nutritionPct))
    : pillarPctFromScore(b.nutritionScore);
  const trainingPct = Number.isFinite(Number(b.trainingPct))
    ? Math.round(Number(b.trainingPct))
    : pillarPctFromScore(b.trainingScore);
  const sleepPct = Number.isFinite(Number(b.sleepPct))
    ? Math.round(Number(b.sleepPct))
    : pillarPctFromScore(b.sleepScore);
  const averageStimulus = Number.isFinite(Number(b.averageStimulus))
    ? Math.round(Number(b.averageStimulus))
    : trainingPct;
  const sleepAvg = Number.isFinite(Number(b.sleepAvg)) && Number(b.sleepAvg) > 0
    ? Number(b.sleepAvg)
    : null;
  const sleepTarget = Number.isFinite(Number(b.sleepTarget)) && Number(b.sleepTarget) > 0
    ? Number(b.sleepTarget)
    : 7.5;

  const nutritionInTarget = !nutritionAwaitingData && nutritionPct >= 80;

  const nutritionDetail = useMemo(
    () => buildNutritionDetail(b, nutritionPct),
    [b, nutritionPct],
  );
  const trainingDetail = useMemo(
    () => buildTrainingDetail(b, trainingPct),
    [b, trainingPct],
  );
  const recoveryDetail = useMemo(
    () => buildRecoveryDetail(b, sleepPct),
    [b, sleepPct],
  );

  const toggleExpanded = (key) => {
    setExpandedItem((prev) => (prev === key ? null : key));
  };

  const aria = useMemo(
    () => (value == null
      ? `Punteggio ${ringLabel} non disponibile`
      : compact
        ? `Punteggio ${ringLabel} ${value} su 100`
        : `Punteggio ${ringLabel} ${value} su 100. Tocca per ${showDetails ? 'nascondere' : 'mostrare'} il dettaglio.`),
    [value, showDetails, compact, ringLabel],
  );

  const ring = (
    <div
      className="relative"
      style={{ width: ringSize, height: ringSize }}
    >
      <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} className="block" aria-hidden>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="1" />
            <stop offset="100%" stopColor="#c084fc" stopOpacity="0.85" />
          </linearGradient>
        </defs>
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${Math.max(0, c - dash)}`}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={`font-bold uppercase tracking-[0.14em] text-slate-400 ${compact ? 'text-[0.5rem]' : 'text-[0.65rem]'}`}>
          {ringLabel}
        </span>
        <span className={`mt-0.5 font-black tabular-nums leading-none text-slate-50 ${compact ? 'text-2xl' : 'mt-1 text-5xl'}`}>
          {value != null ? value : '—'}
        </span>
        {!compact ? (
          <span className="mt-1 text-xs font-semibold text-slate-500">/ 100</span>
        ) : null}
      </div>
    </div>
  );

  if (compact) {
    const clickable = typeof onClick === 'function';
    const Wrapper = clickable ? 'button' : 'section';
    const wrapperProps = clickable
      ? {
          type: 'button',
          onClick,
          className: 'flex w-full max-w-full cursor-pointer flex-col items-center justify-center border-0 bg-transparent px-1 py-1 transition-transform active:scale-[0.98]',
        }
      : {
          className: 'flex w-full max-w-full flex-col items-center justify-center px-1 py-1',
        };
    return (
      <Wrapper {...wrapperProps} aria-label={aria}>
        {ring}
      </Wrapper>
    );
  }

  return (
    <section
      className="flex w-full flex-col items-center justify-center px-2 py-3"
      aria-label={aria}
    >
      <button
        type="button"
        onClick={() => {
          setShowDetails((v) => !v);
          setExpandedItem(null);
        }}
        className="relative cursor-pointer rounded-full border-0 bg-transparent p-0 transition-transform duration-200 ease-out hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400/60 active:scale-[1.02]"
        style={{ width: ringSize, height: ringSize }}
        aria-expanded={showDetails}
        aria-controls={`progression-pagella-${uid}`}
      >
        {ring}
      </button>

      <p className="mt-2 max-w-[18rem] text-center text-[10px] uppercase tracking-wider text-slate-500">
        {showDetails ? 'Tocca una voce per i dettagli' : 'Tocca per il breakdown · Aderenza 14gg'}
      </p>

      <div
        id={`progression-pagella-${uid}`}
        className={`w-full max-w-sm overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
          showDetails
            ? 'mt-3 max-h-[28rem] opacity-100'
            : 'mt-0 max-h-0 opacity-0'
        }`}
        aria-hidden={!showDetails}
      >
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
            Pagella aderenza
          </p>
          <ul className="space-y-1 text-[12px] leading-snug text-slate-200">
            <li>
              <button
                type="button"
                onClick={() => toggleExpanded('nutrition')}
                aria-expanded={expandedItem === 'nutrition'}
                className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-800/40"
              >
                <span className="min-w-0 shrink text-slate-300">🍏 Nutrizione</span>
                <span className="min-w-0 text-right tabular-nums text-slate-100">
                  {nutritionAwaitingData ? (
                    <span className="text-slate-400">In attesa pasti</span>
                  ) : (
                    <>
                      <span className="font-semibold text-slate-50">{nutritionPct}%</span>
                      <span className="ml-1.5 text-slate-500">
                        {nutritionInTarget ? '— In target' : ''}
                      </span>
                    </>
                  )}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {expandedItem === 'nutrition' ? (
                  <PagellaExpandPanel
                    key="nutrition-panel"
                    raw={nutritionDetail.raw}
                    analysis={nutritionDetail.analysis}
                  />
                ) : null}
              </AnimatePresence>
            </li>

            <li>
              <button
                type="button"
                onClick={() => toggleExpanded('training')}
                aria-expanded={expandedItem === 'training'}
                className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-800/40"
              >
                <span className="min-w-0 shrink text-slate-300">🏋️ Allenamento</span>
                <span className="min-w-0 text-right tabular-nums text-slate-100">
                  <span className="font-semibold text-slate-50">{trainingPct}%</span>
                  <span className="ml-1.5 text-slate-500">
                    (stimolo {averageStimulus}%)
                  </span>
                </span>
              </button>
              <AnimatePresence initial={false}>
                {expandedItem === 'training' ? (
                  <PagellaExpandPanel
                    key="training-panel"
                    raw={trainingDetail.raw}
                    analysis={trainingDetail.analysis}
                  />
                ) : null}
              </AnimatePresence>
            </li>

            <li>
              <button
                type="button"
                onClick={() => toggleExpanded('recovery')}
                aria-expanded={expandedItem === 'recovery'}
                className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-800/40"
              >
                <span className="min-w-0 shrink text-slate-300">🛌 Recupero</span>
                <span className="min-w-0 text-right tabular-nums text-slate-100">
                  <span className="font-semibold text-slate-50">{sleepPct}%</span>
                  <span className="ml-1.5 text-slate-500">
                    (Media {sleepAvg != null ? `${sleepAvg.toFixed(1)}h` : 'n/d'} / Target {sleepTarget.toFixed(1)}h)
                  </span>
                </span>
              </button>
              <AnimatePresence initial={false}>
                {expandedItem === 'recovery' ? (
                  <PagellaExpandPanel
                    key="recovery-panel"
                    raw={recoveryDetail.raw}
                    analysis={recoveryDetail.analysis}
                  />
                ) : null}
              </AnimatePresence>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
