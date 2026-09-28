import React, { useMemo } from 'react';
import {
  METABOLIC_FOCUS_LABEL,
  parseMetabolicFocusReport,
} from './metabolicFocus.js';

const LIGHT_STYLES = {
  verde: {
    badge: 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100',
    accent: 'border-emerald-400/30',
    kpi: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100',
  },
  giallo: {
    badge: 'border-amber-400/45 bg-amber-500/20 text-amber-50',
    accent: 'border-amber-400/30',
    kpi: 'border-amber-400/35 bg-amber-500/10 text-amber-100',
  },
  rosso: {
    badge: 'border-rose-400/45 bg-rose-500/20 text-rose-50',
    accent: 'border-rose-400/30',
    kpi: 'border-rose-400/35 bg-rose-500/10 text-rose-100',
  },
};

function KpiCard({ label, value, toneClass }) {
  return (
    <div className={`rounded-xl border px-2.5 py-2 ${toneClass}`}>
      <p className="m-0 text-[9px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="m-0 mt-0.5 text-sm font-semibold leading-tight">{value}</p>
    </div>
  );
}

/**
 * Insight clinico — dashboard/report (non layout chat).
 */
export default function MetabolicFocusChatCard({
  text = '',
} = {}) {
  const parsed = useMemo(() => parseMetabolicFocusReport(text), [text]);
  const styles = LIGHT_STYLES[parsed.light.key] || LIGHT_STYLES.giallo;
  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const badges = Array.isArray(parsed.badges) ? parsed.badges : [];

  return (
    <article
      className={`w-full min-w-0 overflow-hidden rounded-2xl border bg-zinc-950/90 shadow-[0_12px_40px_rgba(0,0,0,0.28)] ${styles.accent}`}
      aria-label="Insight clinico"
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/8 px-3.5 py-3">
        <div className="min-w-0">
          <p className="m-0 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
            Report · Insight clinico
          </p>
          <h2 className="m-0 mt-1 text-base font-semibold text-zinc-50">
            {METABOLIC_FOCUS_LABEL}
          </h2>
        </div>
        <span className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold tracking-wide ${styles.badge}`}>
          {parsed.light.label}
        </span>
      </header>

      <div className="space-y-3 px-3.5 py-3">
        {badges.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {badges.map((badge) => (
              <KpiCard
                key={badge.id}
                label={badge.label}
                value={badge.value}
                toneClass={LIGHT_STYLES[badge.tone]?.kpi || styles.kpi}
              />
            ))}
          </div>
        ) : null}

        {sections.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {sections.map((section) => (
              <section
                key={section.id}
                className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2.5"
              >
                <p className="m-0 mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200/90">
                  <span aria-hidden>{section.icon}</span>
                  {section.sheetLabel || section.label}
                </p>
                <ul className="m-0 list-none space-y-1.5 p-0">
                  {section.bullets.map((bullet, index) => (
                    <li
                      key={`${section.id}-${index}`}
                      className="text-[12px] leading-snug text-zinc-200"
                    >
                      {bullet}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="m-0 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-300">
            {parsed.raw || parsed.teaser}
          </p>
        )}

        {parsed.teaser && sections.length > 0 ? (
          <section className="rounded-xl border border-white/8 bg-zinc-900/50 px-3 py-2.5">
            <p className="m-0 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Sintesi
            </p>
            <p className="m-0 mt-1 text-[13px] leading-relaxed text-zinc-200">
              {parsed.teaser}
            </p>
          </section>
        ) : null}
      </div>
    </article>
  );
}
