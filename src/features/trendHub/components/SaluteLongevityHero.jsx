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
  neutral: '#22d3ee',
};

const PILLAR_MAX = 100 / 3;

function pillarPct(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || PILLAR_MAX <= 0) return 0;
  return Math.round(Math.max(0, Math.min(100, (n / PILLAR_MAX) * 100)));
}

/**
 * Feedback complessivo longevità (score 0–100 + breakdown KentuOS).
 */
export function getLongevityFeedback(score, metrics = {}) {
  const s = Number(score);
  const cardioMins = Math.round(Number(metrics.cardioMins) || 0);
  const uniqueGroups = Math.max(0, Math.min(5, Math.round(Number(metrics.uniqueGroups) || 0)));
  const sleepAvg = Number.isFinite(Number(metrics.sleepAvg)) && Number(metrics.sleepAvg) > 0
    ? Number(metrics.sleepAvg)
    : null;
  const whtrMultiplier = Number.isFinite(Number(metrics.whtrMultiplier))
    ? Number(metrics.whtrMultiplier)
    : 1;
  const criticalThreshold = Number.isFinite(Number(metrics.criticalThreshold))
    ? Number(metrics.criticalThreshold)
    : null;
  const userHeight = Number.isFinite(Number(metrics.userHeight))
    ? Number(metrics.userHeight)
    : null;

  const rawData = [
    `Cardio 14gg: ${cardioMins} min / target 150`,
    `Pesi: ${uniqueGroups}/5 pilastri ≥50%`,
    `Sonno medio: ${sleepAvg != null ? `${sleepAvg.toFixed(1)}h` : 'n/d'} / target 7h`,
    `Filtro WHtR: ×${whtrMultiplier}${
      criticalThreshold != null
        ? ` (soglia ${criticalThreshold.toFixed(0)} cm${userHeight != null ? ` · h ${userHeight.toFixed(0)}` : ''})`
        : ''
    }`,
  ].join(' | ');

  let analysis;
  if (!Number.isFinite(s)) {
    analysis = 'Punteggio non disponibile. Continua a registrare cardio, pesi e sonno per calibrare la longevità.';
  } else if (s >= 80) {
    analysis = 'Eccellente! I tuoi parametri di movimento, forza e recupero indicano un\'ottima efficienza metabolica e un profilo di longevità solido.';
  } else if (s >= 50) {
    analysis = 'Buono. Sei sulla strada giusta: aumentare il volume cardio o stimolare più gruppi muscolari, e proteggere il sonno, ti farà guadagnare ulteriori punti vitalità.';
  } else {
    analysis = 'C\'è margine di miglioramento. Priorità: movimento aerobico settimanale, stimolo sui pesi e qualità del sonno. Controlla anche il filtro strutturale (girovita/altezza).';
  }

  return { rawData, analysis };
}

function getCardioFeedback(cardioMins, cardioScore) {
  const pct = pillarPct(cardioScore);
  const raw = `Minuti cardio (14gg): ${Math.round(cardioMins || 0)} / Target: 150 min`;
  let analysis;
  if (pct >= 100) {
    analysis = 'Volume aerobico in target. Ottima base cardiovascolare: mantieni la costanza senza forzare intensità ogni giorno.';
  } else if (pct >= 50) {
    analysis = 'Sei a metà strada sul cardio. Aggiungi camminate o sessioni aerobiche per avvicinarti ai 150 minuti in 14 giorni.';
  } else {
    analysis = 'Poco volume cardio nella finestra. Inizia con 20–30 minuti di camminata veloce 3–4 volte a settimana.';
  }
  return { raw, analysis };
}

function getWeightsFeedback(uniqueGroups, weightsScore) {
  const pct = pillarPct(weightsScore);
  const groups = Math.max(0, Math.min(5, Math.round(Number(uniqueGroups) || 0)));
  const raw = `Pilastri stimolati (≥50% spillover): ${groups} / 5`;
  let analysis;
  if (pct >= 100) {
    analysis = 'Hai coperto tutti i pilastri muscolari. Ottimo lavoro: ora cura recupero e progressione dei carichi.';
  } else if (pct >= 60) {
    analysis = 'Buona copertura muscolare. Completa i gruppi mancanti per bilanciare lo stimolo e la longevità strutturale.';
  } else {
    analysis = 'Pochi gruppi muscolari stimolati. Programma sessioni che tocchino gambe, spinta, tiro e core nella settimana.';
  }
  return { raw, analysis };
}

function getSleepFeedback(sleepAvg, sleepScore) {
  const pct = pillarPct(sleepScore);
  const avg = Number.isFinite(Number(sleepAvg)) && Number(sleepAvg) > 0 ? Number(sleepAvg) : null;
  const raw = avg != null
    ? `Sonno medio: ${avg.toFixed(1)}h / Target: 7.0h`
    : 'Sonno medio: n/d / Target: 7.0h';
  let analysis;
  if (avg == null) {
    analysis = 'Pochi dati sul sonno. Registra le notti per far contare il pilastro recupero nel punteggio longevità.';
  } else if (pct >= 100) {
    analysis = 'Recupero notturno in target. Continua a proteggere l\'orario di sonno: è un moltiplicatore di longevità.';
  } else {
    analysis = 'Sei sotto il target di sonno. Anticipa la buonanotte di 30 minuti: il recupero influenza direttamente il punteggio finale.';
  }
  return { raw, analysis };
}

function getWhtrFeedback(whtrMultiplier, criticalThreshold, userHeight) {
  const mult = Number.isFinite(Number(whtrMultiplier)) ? Number(whtrMultiplier) : 1;
  const thr = Number.isFinite(Number(criticalThreshold)) ? Number(criticalThreshold) : null;
  const h = Number.isFinite(Number(userHeight)) ? Number(userHeight) : null;
  const raw = [
    `Moltiplicatore strutturale: ×${mult}`,
    thr != null ? `Soglia girovita: ${thr.toFixed(0)} cm` : null,
    h != null ? `Altezza: ${h.toFixed(0)} cm` : null,
  ].filter(Boolean).join(' | ');

  let analysis;
  if (mult >= 0.98) {
    analysis = 'Filtro strutturale neutro/positivo: il rapporto girovita–altezza non sta frenando il punteggio.';
  } else if (mult >= 0.7) {
    analysis = 'Il filtro WHtR riduce leggermente il score. Ridurre il girovita (deficit controllato + cammino) recupera punti longevità.';
  } else {
    analysis = 'Il filtro strutturale sta tagliando molto il punteggio. Priorità: composizione corporea e consistenza su movimento quotidiano.';
  }
  return { raw, analysis };
}

function LongevityExpandPanel({ raw, analysis }) {
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
          <span className="font-semibold text-cyan-300/90">Analisi:</span>
          {' '}
          {analysis}
        </p>
      </div>
    </motion.div>
  );
}

const EMPTY_BREAKDOWN = Object.freeze({
  cardioScore: 0,
  weightsScore: 0,
  sleepScore: 0,
  whtrMultiplier: 1,
  cardioMins: 0,
  uniqueGroups: 0,
  sleepAvg: null,
  criticalThreshold: null,
  userHeight: null,
});

/**
 * Livello 1 — Hero: Punteggio Longevità (radial / donut) + pagella metabolica accordion.
 * `compact`: anello ridotto per slide gemella Home (niente pagella).
 */
export default function SaluteLongevityHero({
  score = null,
  breakdown = null,
  size = 200,
  compact = false,
  onClick = null,
} = {}) {
  const [showDetails, setShowDetails] = useState(false);
  const [expandedItem, setExpandedItem] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const uid = useId().replace(/:/g, '');
  const gradId = `longevity-grad-${uid}`;
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
  const cardioScore = Number(b.cardioScore) || 0;
  const weightsScore = Number(b.weightsScore) || 0;
  const sleepScore = Number(b.sleepScore) || 0;
  const whtrMultiplier = Number.isFinite(Number(b.whtrMultiplier)) ? Number(b.whtrMultiplier) : 1;
  const cardioMins = Math.round(Number(b.cardioMins) || 0);
  const uniqueGroups = Math.max(0, Math.min(5, Math.round(Number(b.uniqueGroups) || 0)));
  const sleepAvg = Number.isFinite(Number(b.sleepAvg)) && Number(b.sleepAvg) > 0
    ? Number(b.sleepAvg)
    : null;
  const criticalThreshold = Number.isFinite(Number(b.criticalThreshold))
    ? Number(b.criticalThreshold)
    : null;
  const userHeight = Number.isFinite(Number(b.userHeight)) ? Number(b.userHeight) : null;

  const overallFeedback = useMemo(
    () => getLongevityFeedback(value, {
      cardioMins,
      uniqueGroups,
      sleepAvg,
      whtrMultiplier,
      criticalThreshold,
      userHeight,
    }),
    [value, cardioMins, uniqueGroups, sleepAvg, whtrMultiplier, criticalThreshold, userHeight],
  );

  const cardioDetail = useMemo(
    () => getCardioFeedback(cardioMins, cardioScore),
    [cardioMins, cardioScore],
  );
  const weightsDetail = useMemo(
    () => getWeightsFeedback(uniqueGroups, weightsScore),
    [uniqueGroups, weightsScore],
  );
  const sleepDetail = useMemo(
    () => getSleepFeedback(sleepAvg, sleepScore),
    [sleepAvg, sleepScore],
  );
  const whtrDetail = useMemo(
    () => getWhtrFeedback(whtrMultiplier, criticalThreshold, userHeight),
    [whtrMultiplier, criticalThreshold, userHeight],
  );

  const toggleExpanded = (key) => {
    setExpandedItem((prev) => (prev === key ? null : key));
  };

  const aria = useMemo(
    () => (value == null
      ? 'Punteggio Longevità non disponibile'
      : compact
        ? `Punteggio Longevità ${value} su 100`
        : `Punteggio Longevità ${value} su 100. Tocca per ${showDetails ? 'nascondere' : 'mostrare'} il dettaglio.`),
    [value, showDetails, compact],
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
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.85" />
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
          Longevità
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
          setIsExpanded((v) => !v);
          setExpandedItem(null);
        }}
        className="relative cursor-pointer rounded-full border-0 bg-transparent p-0 transition-transform duration-200 ease-out hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/60 active:scale-[1.02]"
        style={{ width: ringSize, height: ringSize }}
        aria-expanded={showDetails || isExpanded}
        aria-controls={`longevity-pagella-${uid}`}
      >
        {ring}
      </button>

      <p className="mt-2 max-w-[18rem] text-center text-[10px] uppercase tracking-wider text-slate-500">
        {showDetails ? 'Tocca una voce per i dettagli' : 'Tocca per la pagella · Media 14gg'}
      </p>

      <div
        id={`longevity-pagella-${uid}`}
        className={`w-full max-w-sm overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
          showDetails
            ? 'mt-3 max-h-[36rem] opacity-100'
            : 'mt-0 max-h-0 opacity-0'
        }`}
        aria-hidden={!showDetails}
      >
        <div className="rounded-2xl border border-white/10 bg-slate-900/70 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md">
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="mb-2 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-800/40"
            aria-expanded={isExpanded}
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Pagella metabolica
            </p>
            <span className="text-[10px] text-cyan-400/80">
              {isExpanded ? 'Nascondi sintesi' : 'Sintesi score'}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {isExpanded ? (
              <LongevityExpandPanel
                key="longevity-overall"
                raw={overallFeedback.rawData}
                analysis={overallFeedback.analysis}
              />
            ) : null}
          </AnimatePresence>

          <ul className="mt-2 space-y-1 text-[12px] leading-snug text-slate-200">
            <li>
              <button
                type="button"
                onClick={() => toggleExpanded('cardio')}
                aria-expanded={expandedItem === 'cardio'}
                className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-800/40"
              >
                <span className="min-w-0 shrink text-slate-300">🏃‍♂️ Cardio</span>
                <span className="min-w-0 text-right tabular-nums text-slate-100">
                  <span className="font-semibold text-slate-50">{pillarPct(cardioScore)}%</span>
                  <span className="ml-1.5 text-slate-500">({cardioMins} min)</span>
                </span>
              </button>
              <AnimatePresence initial={false}>
                {expandedItem === 'cardio' ? (
                  <LongevityExpandPanel
                    key="cardio-panel"
                    raw={cardioDetail.raw}
                    analysis={cardioDetail.analysis}
                  />
                ) : null}
              </AnimatePresence>
            </li>

            <li>
              <button
                type="button"
                onClick={() => toggleExpanded('weights')}
                aria-expanded={expandedItem === 'weights'}
                className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-800/40"
              >
                <span className="min-w-0 shrink text-slate-300">🏋️ Pesi</span>
                <span className="min-w-0 text-right tabular-nums text-slate-100">
                  <span className="font-semibold text-slate-50">{pillarPct(weightsScore)}%</span>
                  <span className="ml-1.5 text-slate-500">({uniqueGroups}/5 ≥50%)</span>
                </span>
              </button>
              <AnimatePresence initial={false}>
                {expandedItem === 'weights' ? (
                  <LongevityExpandPanel
                    key="weights-panel"
                    raw={weightsDetail.raw}
                    analysis={weightsDetail.analysis}
                  />
                ) : null}
              </AnimatePresence>
            </li>

            <li>
              <button
                type="button"
                onClick={() => toggleExpanded('sleep')}
                aria-expanded={expandedItem === 'sleep'}
                className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-800/40"
              >
                <span className="min-w-0 shrink text-slate-300">🛌 Sonno</span>
                <span className="min-w-0 text-right tabular-nums text-slate-100">
                  <span className="font-semibold text-slate-50">{pillarPct(sleepScore)}%</span>
                  <span className="ml-1.5 text-slate-500">
                    ({sleepAvg != null ? `${sleepAvg.toFixed(1)} h` : 'n/d'})
                  </span>
                </span>
              </button>
              <AnimatePresence initial={false}>
                {expandedItem === 'sleep' ? (
                  <LongevityExpandPanel
                    key="sleep-panel"
                    raw={sleepDetail.raw}
                    analysis={sleepDetail.analysis}
                  />
                ) : null}
              </AnimatePresence>
            </li>

            <li className="border-t border-white/5 pt-1">
              <button
                type="button"
                onClick={() => toggleExpanded('whtr')}
                aria-expanded={expandedItem === 'whtr'}
                className="flex w-full cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-800/40"
              >
                <span className="min-w-0 shrink text-slate-300">⚖️ Filtro Strutturale</span>
                <span className="min-w-0 text-right tabular-nums font-semibold text-cyan-300/90">
                  {whtrMultiplier}x
                  {criticalThreshold != null && (
                    <span className="ml-1 font-normal text-slate-500">
                      (soglia {criticalThreshold.toFixed(0)} cm
                      {userHeight != null ? ` · h ${userHeight.toFixed(0)}` : ''})
                    </span>
                  )}
                </span>
              </button>
              <AnimatePresence initial={false}>
                {expandedItem === 'whtr' ? (
                  <LongevityExpandPanel
                    key="whtr-panel"
                    raw={whtrDetail.raw}
                    analysis={whtrDetail.analysis}
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
