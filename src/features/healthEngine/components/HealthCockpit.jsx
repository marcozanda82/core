import React from 'react';
import { ChevronRight } from 'lucide-react';
import { PILLAR_STATES } from '../contracts/healthSystem.types.js';

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

const CARD_CLASS = [
  'rounded-2xl border border-white/10 bg-zinc-950/55',
  'shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl',
].join(' ');

/**
 * Livello 1 — Health Cockpit. Solo presentazione di `HealthSystemState`.
 */
export default function HealthCockpit({
  healthState = null,
  isReady = false,
  isLoading = false,
  dateStr = '',
  todayStr = '',
  onNavigatePrevDay = null,
  onNavigateNextDay = null,
  onOpenLabTool = null,
  onOpenPillarAnalysis = null,
} = {}) {
  const score = Number(healthState?.score);
  const globalTone = Number.isFinite(score) ? scoreTone(score) : 'flexion';
  const pillars = healthState?.pillars || {};
  const actionText = String(healthState?.primaryAction?.text || '').trim();
  
  const isToday = String(dateStr || '').slice(0, 10) === String(todayStr || '').slice(0, 10);
  const isNextDayDisabled = isToday;
  
  function formatDisplayDate(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = todayStr ? new Date(todayStr + 'T00:00:00') : new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (isoDate === todayStr) return 'OGGI';
    if (isoDate === yesterday.toISOString().slice(0, 10)) return 'Ieri';
    
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    return `${dayNames[date.getDay()]} ${d} ${['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'][m - 1]}`;
  }
  
  const displayDate = formatDisplayDate(dateStr);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-label="Health Cockpit"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2">
        {isLoading || !isReady || !healthState ? (
          <div className={`${CARD_CLASS} mx-auto mt-10 w-full max-w-md px-6 py-12 text-center`}>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              Health Cockpit
            </p>
            <p className="mt-3 text-sm text-zinc-400">Allineamento motori…</p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-md flex-col gap-5">
            {displayDate && (
              <div className="flex items-center justify-between gap-3 px-1">
                <button
                  type="button"
                  onClick={() => onNavigatePrevDay?.()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:border-white/20 hover:bg-white/10 active:scale-95 disabled:opacity-30"
                  aria-label="Giorno precedente"
                >
                  <span className="text-lg">‹</span>
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <p className={`${isToday ? 'text-2xl font-bold' : 'text-lg font-semibold'} leading-tight text-zinc-100`}>
                    {displayDate}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateNextDay?.()}
                  disabled={isNextDayDisabled}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:border-white/20 hover:bg-white/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Giorno successivo"
                >
                  <span className="text-lg">›</span>
                </button>
              </div>
            )}
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
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">
                Score sistema
              </p>
            </header>

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
                    className={`${CARD_CLASS} relative flex w-full cursor-pointer flex-col items-center gap-1.5 px-3 py-4 text-center transition-transform hover:bg-white/[0.02] active:scale-95`}
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

            {actionText ? (
              <div
                className={`${CARD_CLASS} border-cyan-400/25 bg-gradient-to-br from-cyan-950/50 via-zinc-950/70 to-zinc-950/80 px-4 py-4`}
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
          </div>
        )}
      </div>

      <div
        className="shrink-0 border-t border-white/5 bg-zinc-950/90 pt-2"
        style={{ paddingBottom: 'calc(4.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div
          className="flex w-full gap-2 px-3 pb-3"
          role="toolbar"
          aria-label="Laboratorio"
        >
          {LAB_TOOLS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => onOpenLabTool?.(tool.id)}
              className="flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl border border-white/5 bg-zinc-900/80 py-3 transition-colors hover:border-white/10 hover:bg-zinc-800/90 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40"
            >
              <span className="text-xl leading-none" aria-hidden>{tool.icon}</span>
              <span className="px-0.5 text-center text-[10px] font-bold uppercase leading-tight tracking-widest text-zinc-400">
                {tool.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
