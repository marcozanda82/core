import React from 'react';
import { ChevronRight } from 'lucide-react';
import { PILLAR_STATES } from '../contracts/healthSystem.types.js';
import { buildLongevityCockpitCards } from '../../trendHub/utils/longevityInsightGenerator';

const PILLAR_ORDER = ['metabolism', 'nutrition', 'activity', 'recovery'];

const PILLAR_META = {
  metabolism: { label: 'Metabolismo', icon: '🔥' },
  nutrition: { label: 'Nutrizione', icon: '🥗' },
  activity: { label: 'Attività', icon: '🏋️' },
  recovery: { label: 'Recupero', icon: '🌙' },
};

const LAB_TOOLS = [
  { id: 'STRUMENTI_LEGACY', icon: '🧰', label: 'Strumenti' },
  { id: 'TIMELINE', icon: '📈', label: 'Timeline 24h' },
  { id: 'AUTOPILOTA', icon: '⚙️', label: 'Calibrazione' },
];

function stateVisual(state) {
  if (state === PILLAR_STATES.OPTIMAL) {
    return { lamp: '🟢', tone: 'optimal', label: 'Ottimale' };
  }
  if (state === PILLAR_STATES.OVERLOAD) {
    return { lamp: '🔴', tone: 'overload', label: 'Da migliorare' };
  }
  if (state === PILLAR_STATES.NEUTRAL) {
    return { lamp: '🟡', tone: 'flexion', label: 'In attesa' };
  }
  return { lamp: '🟡', tone: 'flexion', label: 'In flessione' };
}

function scoreTone(score) {
  const n = Number(score);
  if (n >= 75) return 'optimal';
  if (n >= 50) return 'flexion';
  return 'overload';
}

const TONE_TEXT = {
  optimal: 'text-cyan-300',
  flexion: 'text-amber-300',
  overload: 'text-rose-400',
};

const TONE_GLOW = {
  optimal: 'drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]',
  flexion: 'drop-shadow-[0_0_18px_rgba(251,191,36,0.4)]',
  overload: 'drop-shadow-[0_0_18px_rgba(251,113,133,0.4)]',
};

const CHIP_CLASS = {
  good: 'bg-emerald-500/15 text-emerald-300',
  mid: 'bg-amber-500/15 text-amber-300',
  low: 'bg-rose-500/15 text-rose-300',
  neutral: 'bg-white/10 text-zinc-300',
};

function DrillDownCard({
  icon = '',
  title = '',
  valueLabel = '',
  subtitle = '',
  chip = null,
  note = '',
  onClick = null,
} = {}) {
  const clickable = typeof onClick === 'function';
  const ariaParts = [title, valueLabel, subtitle, chip?.label, note].filter(Boolean);

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      className={[
        'flex w-full flex-col rounded-2xl border border-white/12 bg-white/[0.06] py-2.5 px-3 text-left',
        'shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-all',
        clickable ? 'cursor-pointer hover:border-cyan-400/45 hover:bg-white/[0.08] active:scale-95' : 'cursor-default',
      ].join(' ')}
      aria-label={ariaParts.join(': ')}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
        {icon} {title}
      </span>
      {valueLabel ? (
        <span className="mt-1 text-lg font-semibold tabular-nums text-zinc-100">
          {valueLabel}
        </span>
      ) : null}
      {chip?.label ? (
        <span
          className={`mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${CHIP_CLASS[chip.tone] || CHIP_CLASS.neutral}`}
        >
          {chip.label}
        </span>
      ) : null}
      {subtitle ? (
        <p className="m-0 mt-0.5 text-xs font-medium leading-snug text-zinc-400">
          {subtitle}
        </p>
      ) : null}
      {note ? (
        <p className="m-0 mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-400">
          {note}
        </p>
      ) : null}
    </button>
  );
}

const CARD_CLASS = [
  'rounded-2xl border border-white/12 bg-white/[0.06]',
  'shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md',
].join(' ');

/**
 * Genera una frase di sintesi umana basata sugli stati dei 4 pilastri.
 * Funzione PURA spostata fuori dal componente per evitare ricreazione a ogni render.
 * 
 * @param {object} pillars - I 4 pilastri (metabolism, nutrition, activity, recovery)
 * @returns {string} - Frase di 1 riga che descrive lo stato complessivo
 */
function generateHealthSummary(pillars = {}) {
  const states = PILLAR_ORDER.map((id) => ({
    id,
    state: pillars[id]?.state,
    label: PILLAR_META[id]?.label || id,
  }));

  const optimal = states.filter((p) => p.state === PILLAR_STATES.OPTIMAL);
  const overload = states.filter((p) => p.state === PILLAR_STATES.OVERLOAD);
  const flexion = states.filter((p) => p.state === PILLAR_STATES.FLEXION);
  const neutral = states.filter((p) => p.state === PILLAR_STATES.NEUTRAL);

  // Giornata appena iniziata (Nutrizione e Attività in attesa)
  if (neutral.length >= 2 && neutral.some((p) => p.id === 'nutrition') && neutral.some((p) => p.id === 'activity')) {
    return 'Giornata appena iniziata, attendiamo nuovi dati.';
  }

  // Tutto ottimale
  if (optimal.length === 4) {
    return 'Tutto in equilibrio, mantieni la rotta.';
  }

  // Almeno un ottimale e almeno un problema
  if (optimal.length > 0 && (overload.length > 0 || flexion.length > 0)) {
    const bestPillar = optimal[0].label.toLowerCase();
    const worstPillar = overload.length > 0 ? overload[0] : flexion[0];
    const worstLabel = worstPillar.label.toLowerCase();
    
    if (worstPillar.id === 'activity') {
      return `Ottimo ${bestPillar}, ma l'attività fisica scarseggia.`;
    }
    if (worstPillar.id === 'nutrition') {
      return `Ottimo ${bestPillar}, ma la nutrizione ha margini di miglioramento.`;
    }
    if (worstPillar.id === 'recovery') {
      return `Ottimo ${bestPillar}, ma il recupero necessita attenzione.`;
    }
    if (worstPillar.id === 'metabolism') {
      return `Ottimo ${bestPillar}, ma il metabolismo è sotto pressione.`;
    }
    return `Ottimo ${bestPillar}, ma ${worstLabel} richiede attenzione.`;
  }

  // Prevalentemente problemi
  if (overload.length >= 2) {
    return 'Diversi aspetti da migliorare: ascolta i suggerimenti.';
  }

  // Mix di stati intermedi
  if (flexion.length >= 2) {
    return 'In fase di assestamento, continua a monitorare.';
  }

  // Fallback generico
  return 'Sistema in analisi, consulta i dettagli dei pilastri.';
}

/**
 * Livello 1 — Health Cockpit. Solo presentazione di `HealthSystemState`.
 * Performance: generateHealthSummary è PURA e definita fuori (no re-creation).
 */
export default function HealthCockpit({
  healthState = null,
  isReady = false,
  isLoading = false,
  onOpenLabTool = null,
  onOpenPillarAnalysis = null,
  onOpenStimulusCockpit = null,
  onOpenMetabolicFocus = null,
  longevityResult = null,
} = {}) {
  const score = Number(healthState?.score);
  const globalTone = Number.isFinite(score) ? scoreTone(score) : 'flexion';
  const pillars = healthState?.pillars || {};
  const actionText = String(healthState?.primaryAction?.text || '').trim();
  const longevityCards = buildLongevityCockpitCards(longevityResult);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Health Cockpit"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-2">
        {isLoading || !isReady || !healthState ? (
          <div className={`${CARD_CLASS} mx-auto mt-10 w-full max-w-md px-6 py-12 text-center`}>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Health Cockpit
            </p>
            <p className="mt-3 text-sm text-zinc-400">Allineamento motori…</p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-md flex-col gap-5">
            <header className="text-center">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Health Cockpit
              </p>
              <div
                className={`mt-3 text-[4.25rem] font-semibold leading-none tracking-tight ${TONE_TEXT[globalTone]} ${TONE_GLOW[globalTone]}`}
                aria-label={`Punteggio globale ${Math.round(score)}`}
              >
                {Math.round(score)}
              </div>
              <p className="mt-2 px-4 text-sm font-medium leading-snug text-zinc-400">
                {generateHealthSummary(pillars)}
              </p>
            </header>

            {/* 🎯 DIRETTIVA DI SISTEMA - Azione Prioritaria */}
            {healthState?.primaryAction?.text && (
              <div className="mx-6 mt-2 mb-8 flex items-center gap-4 rounded-2xl border border-white/12 bg-white/[0.06] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md">
                {/* Icona Target */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <circle cx="12" cy="12" r="6"></circle>
                    <circle cx="12" cy="12" r="2"></circle>
                  </svg>
                </div>
                
                {/* Testo dell'azione */}
                <div className="flex-1">
                  <h3 className="text-xs font-bold tracking-wider text-cyan-500 uppercase mb-1">
                    Obiettivo Primario
                  </h3>
                  <p className="text-sm text-zinc-200 font-medium leading-snug">
                    {healthState.primaryAction.text}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3" aria-label="Quattro pilastri">
              {PILLAR_ORDER.map((id) => {
                const pillar = pillars[id] || {};
                const meta = PILLAR_META[id];
                const visual = stateVisual(pillar.state);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onOpenPillarAnalysis?.(id)}
                    className={`${CARD_CLASS} relative flex w-full cursor-pointer flex-col items-center gap-1.5 px-3 py-4 text-center transition-transform hover:border-cyan-400/45 hover:bg-white/[0.08] active:scale-95`}
                    aria-label={`${meta.label}: ${visual.label}. Apri analisi`}
                  >
                    <ChevronRight
                      size={14}
                      strokeWidth={2.2}
                      className="absolute right-2.5 top-2.5 text-zinc-500/70"
                      aria-hidden
                    />
                    <span className="text-lg leading-none" aria-hidden>{meta.icon}</span>
                    <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-300">
                      {meta.label}
                    </h3>
                    <span className="text-base leading-none" aria-hidden>{visual.lamp}</span>
                    <span className={`text-sm font-semibold leading-tight ${TONE_TEXT[visual.tone]}`}>
                      {visual.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mb-4 mt-6 grid w-full grid-cols-2 gap-3">
              <DrillDownCard
                icon={longevityCards.activity.icon}
                title={longevityCards.activity.title}
                valueLabel={longevityCards.activity.valueLabel}
                subtitle={longevityCards.activity.subtitle}
                onClick={onOpenStimulusCockpit}
              />
              <DrillDownCard
                icon={longevityCards.metabolism.icon}
                title={longevityCards.metabolism.title}
                valueLabel={longevityCards.metabolism.valueLabel}
                subtitle={longevityCards.metabolism.subtitle}
                onClick={onOpenMetabolicFocus}
              />
              <DrillDownCard
                icon={longevityCards.nutrition.icon}
                title={longevityCards.nutrition.title}
                valueLabel={longevityCards.nutrition.valueLabel}
                subtitle={longevityCards.nutrition.subtitle}
                chip={longevityCards.nutrition.chip}
                note={longevityCards.nutrition.note}
              />
              <DrillDownCard
                icon={longevityCards.recovery.icon}
                title={longevityCards.recovery.title}
                valueLabel={longevityCards.recovery.valueLabel}
                subtitle={longevityCards.recovery.subtitle}
                note={longevityCards.recovery.note}
              />
            </div>

            {actionText ? (
              <div
                className={`${CARD_CLASS} mt-6 border-cyan-400/25 bg-gradient-to-br from-cyan-500/10 via-white/[0.04] to-transparent px-4 py-4`}
                aria-label="Azione primaria"
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-cyan-400/80">
                  ⚡ Azione
                </p>
                <p className="mt-2 text-[0.95rem] font-semibold leading-snug text-cyan-50 [text-shadow:0_0_18px_rgba(34,211,238,0.25)]">
                  {actionText}
                </p>
              </div>
            ) : null}

            {/* Carosello Widget Laboratorio - Effetto Oblò */}
            <div className="flex overflow-x-auto gap-4 snap-x snap-mandatory px-4 pb-12 pt-2 mt-12 -mx-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              
              {/* Card 1: STRUMENTI */}
              <button
                type="button"
                onClick={() => onOpenLabTool?.('STRUMENTI_LEGACY')}
                className="relative w-[260px] h-36 shrink-0 rounded-3xl overflow-hidden snap-center group border border-white/5 text-left transition-transform active:scale-95"
              >
                {/* Immagine di sfondo ottimizzata */}
                <img 
                  src="/strumenti/bussola.png" 
                  alt="Bussola metabolica" 
                  loading="lazy" 
                  decoding="async" 
                  className="absolute inset-0 w-full h-full object-cover opacity-80" 
                />
                {/* Gradiente Oblò */}
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-transparent"></div>
                {/* Testo in primo piano */}
                <div className="absolute bottom-0 left-0 p-4 w-full">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-lg">🧰</span>
                    <h3 className="font-bold text-zinc-100 text-sm tracking-widest uppercase">Strumenti</h3>
                  </div>
                  <p className="text-xs text-zinc-400 font-medium">Bussola metabolica</p>
                </div>
              </button>

              {/* Card 2: TIMELINE */}
              <button
                type="button"
                onClick={() => onOpenLabTool?.('TIMELINE')}
                className="relative w-[260px] h-36 shrink-0 rounded-3xl overflow-hidden snap-center group border border-white/5 text-left transition-transform active:scale-95"
              >
                <img 
                  src="/strumenti/timeline.png" 
                  alt="Timeline 24H" 
                  loading="lazy" 
                  decoding="async" 
                  className="absolute inset-0 w-full h-full object-cover opacity-80" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-transparent"></div>
                <div className="absolute bottom-0 left-0 p-4 w-full">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-lg">📈</span>
                    <h3 className="font-bold text-zinc-100 text-sm tracking-widest uppercase">Timeline 24H</h3>
                  </div>
                  <p className="text-xs text-zinc-400 font-medium">Dinamiche in tempo reale</p>
                </div>
              </button>

              {/* Card 3: CALIBRAZIONE */}
              <button
                type="button"
                onClick={() => onOpenLabTool?.('AUTOPILOTA')}
                className="relative w-[260px] h-36 shrink-0 rounded-3xl overflow-hidden snap-center group border border-white/5 text-left transition-transform active:scale-95"
              >
                <img 
                  src="/strumenti/calibrazione.png" 
                  alt="Calibrazione" 
                  loading="lazy" 
                  decoding="async" 
                  className="absolute inset-0 w-full h-full object-cover opacity-80" 
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/70 to-transparent"></div>
                <div className="absolute bottom-0 left-0 p-4 w-full">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-lg">⚙️</span>
                    <h3 className="font-bold text-zinc-100 text-sm tracking-widest uppercase">Calibrazione</h3>
                  </div>
                  <p className="text-xs text-zinc-400 font-medium">Target & Bilancio</p>
                </div>
              </button>

            </div>
          </div>
        )}
      </div>
    </section>
  );
}
