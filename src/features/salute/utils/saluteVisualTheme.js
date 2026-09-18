/**
 * Token visivi `/salute` — riuso delle classi/colori già usati in Home Kentu.
 * Solo presentazione: nessuna formula, nessuno stato.
 *
 * Home: cyan `#22d3ee` / `#00e5ff` · amber `#fbbf24` · emerald `#34d399`
 * viola `#a855f7` / `#818cf8` / `#b388ff` · fuchsia AI.
 * Superfici: stesso frost di Home (`backdrop-blur-sm` + inset white ~8–10%).
 */

import {
  longevityToneFromScore,
  pillarPctFromLongevityScore,
} from '../../trendHub/utils/longevityInsightGenerator';

/** Superfici satinata/frost — blur basso, opacità alta, niente ghiaccio. */
export const SALUTE_FROST = {
  page: 'pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(255,255,255,0.045),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.025)_0%,transparent_28%)]',
  card: 'relative overflow-hidden bg-[#171E2A]/90 backdrop-blur-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_28px_rgba(0,0,0,0.22)]',
  sheet: 'bg-[#0E141C]/97 backdrop-blur-[2px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
  micro: 'bg-[#0C121A]/98 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]',
  sheen: 'pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/[0.06] via-transparent to-transparent',
};

export const SALUTE_PILLAR_THEME = {
  cardio: {
    id: 'cardio',
    icon: '🫀',
    title: 'Cardio',
    text: 'text-cyan-300',
    value: 'text-cyan-100',
    label: 'text-cyan-200/80',
    iconWrap: 'border-cyan-400/30 bg-cyan-500/12',
    card: 'border-white/[0.10] hover:border-cyan-400/28',
    cardSelected: 'border-cyan-400/35 bg-[#13222C]/95',
    sheetBorder: 'border-white/[0.10]',
    kpiBorder: 'border-white/[0.08]',
    hex: '#22d3ee',
    glow: 'rgba(34,211,238,0.16)',
  },
  strength: {
    id: 'strength',
    icon: '💪',
    title: 'Forza',
    text: 'text-amber-300',
    value: 'text-amber-100',
    label: 'text-amber-200/80',
    iconWrap: 'border-amber-400/30 bg-amber-500/12',
    card: 'border-white/[0.10] hover:border-amber-400/28',
    cardSelected: 'border-amber-400/35 bg-[#231C12]/95',
    sheetBorder: 'border-white/[0.10]',
    kpiBorder: 'border-white/[0.08]',
    hex: '#fbbf24',
    glow: 'rgba(251,191,36,0.14)',
  },
  sleep: {
    id: 'sleep',
    icon: '🌙',
    title: 'Sonno & Recupero',
    text: 'text-violet-300',
    value: 'text-violet-100',
    label: 'text-violet-200/80',
    iconWrap: 'border-violet-400/30 bg-violet-500/12',
    card: 'border-white/[0.10] hover:border-violet-400/28',
    cardSelected: 'border-violet-400/35 bg-[#1C1830]/95',
    sheetBorder: 'border-white/[0.10]',
    kpiBorder: 'border-white/[0.08]',
    hex: '#a78bfa',
    glow: 'rgba(167,139,250,0.16)',
  },
  nutrition: {
    id: 'nutrition',
    icon: '🍽️',
    title: 'Nutrizione',
    text: 'text-emerald-300',
    value: 'text-emerald-100',
    label: 'text-emerald-200/80',
    iconWrap: 'border-emerald-400/30 bg-emerald-500/12',
    card: 'border-white/[0.10] hover:border-emerald-400/28',
    cardSelected: 'border-emerald-400/35 bg-[#12241F]/95',
    sheetBorder: 'border-white/[0.10]',
    kpiBorder: 'border-white/[0.08]',
    hex: '#34d399',
    glow: 'rgba(52,211,153,0.14)',
  },
  focus: {
    id: 'focus',
    icon: '🔬',
    title: 'Focus Metabolico',
    text: 'text-fuchsia-300',
    value: 'text-fuchsia-100',
    label: 'text-fuchsia-200/80',
    iconWrap: 'border-fuchsia-400/30 bg-fuchsia-500/12',
    card: 'border-white/[0.10] hover:border-fuchsia-400/28',
    cardSelected: 'border-fuchsia-400/32 bg-[#241428]/95',
    sheetBorder: 'border-white/[0.10]',
    kpiBorder: 'border-white/[0.08]',
    hex: '#e879f9',
    glow: 'rgba(232,121,249,0.12)',
  },
};

export const SALUTE_INSIGHT_THEME = {
  strength: {
    label: 'text-emerald-300',
    dot: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.28)]',
    bar: 'bg-emerald-400',
    icon: '✓',
    iconWrap: 'border-emerald-400/30 bg-emerald-500/12 text-emerald-200',
  },
  penalty: {
    label: 'text-amber-300',
    dot: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.26)]',
    bar: 'bg-amber-400',
    icon: '!',
    iconWrap: 'border-amber-400/30 bg-amber-500/12 text-amber-200',
  },
  action: {
    label: 'text-cyan-300',
    dot: 'bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.26)]',
    bar: 'bg-cyan-400',
    icon: '→',
    iconWrap: 'border-cyan-400/30 bg-cyan-500/12 text-cyan-200',
  },
};

export const SALUTE_SLEEP_CHART = {
  actual: '#22d3ee',
  ghost: '#a78bfa',
  average: 'rgba(148,163,184,0.55)',
};

export const SALUTE_SEMAPHORE = {
  ok: {
    emoji: '🟢',
    label: 'In linea',
    text: 'text-emerald-300',
    wrap: 'border-emerald-500/25 bg-emerald-500/10',
  },
  warn: {
    emoji: '🟡',
    label: 'Attenzione',
    text: 'text-amber-300',
    wrap: 'border-amber-500/25 bg-amber-500/10',
  },
  low: {
    emoji: '🔴',
    label: 'Priorità',
    text: 'text-rose-300',
    wrap: 'border-rose-500/25 bg-rose-500/10',
  },
  idle: {
    emoji: '⚪',
    label: 'Dato assente',
    text: 'text-slate-400',
    wrap: 'border-white/10 bg-white/[0.04]',
  },
};

const SLEEP_IDLE = {
  ...SALUTE_SEMAPHORE.idle,
  label: 'Notti non registrate',
};

/**
 * Semaforo pilastri: riuso del tone già usato in pagella
 * (`longevityToneFromScore` su percentuale /25).
 */
export function pillarSemaphoreFromScore(score) {
  if (!Number.isFinite(Number(score))) return SALUTE_SEMAPHORE.idle;
  const tone = longevityToneFromScore(pillarPctFromLongevityScore(score));
  if (tone === 'good') return SALUTE_SEMAPHORE.ok;
  if (tone === 'mid') return SALUTE_SEMAPHORE.warn;
  return SALUTE_SEMAPHORE.low;
}

/** Media 14g vs riferimento /salute. Non è un debt score. */
export function sleepSemaphoreFromDelta(deltaHours) {
  const n = Number(deltaHours);
  if (!Number.isFinite(n)) return SLEEP_IDLE;
  if (n >= 0) return SALUTE_SEMAPHORE.ok;
  if (n >= -1) return SALUTE_SEMAPHORE.warn;
  return SALUTE_SEMAPHORE.low;
}

export function saluteTheme(id) {
  return SALUTE_PILLAR_THEME[id] || SALUTE_PILLAR_THEME.cardio;
}
