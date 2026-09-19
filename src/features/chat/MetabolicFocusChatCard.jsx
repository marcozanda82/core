import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import KentuAvatar from './KentuAvatar.jsx';
import {
  METABOLIC_FOCUS_CHAT_CTA,
  METABOLIC_FOCUS_LABEL,
  parseMetabolicFocusReport,
} from './metabolicFocus.js';

const LIGHT_STYLES = {
  verde: {
    badge: 'border-emerald-400/40 bg-gradient-to-r from-emerald-500/35 to-emerald-700/20 text-emerald-100',
    card: 'border-emerald-400/25 bg-gradient-to-br from-emerald-950/55 via-zinc-950/90 to-zinc-950',
    chip: 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100',
  },
  giallo: {
    badge: 'border-amber-400/45 bg-gradient-to-r from-amber-400/40 to-orange-700/25 text-amber-50',
    card: 'border-amber-400/30 bg-gradient-to-br from-amber-950/50 via-zinc-950/90 to-zinc-950',
    chip: 'border-amber-400/35 bg-amber-500/15 text-amber-100',
  },
  rosso: {
    badge: 'border-rose-400/45 bg-gradient-to-r from-rose-500/40 to-rose-800/25 text-rose-50',
    card: 'border-rose-400/30 bg-gradient-to-br from-rose-950/50 via-zinc-950/90 to-zinc-950',
    chip: 'border-rose-400/35 bg-rose-500/15 text-rose-100',
  },
};

function StatusBadgeRow({ badges }) {
  const list = Array.isArray(badges) ? badges : [];
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((badge) => {
        const chip = LIGHT_STYLES[badge.tone]?.chip || LIGHT_STYLES.giallo.chip;
        return (
          <span
            key={badge.id}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${chip}`}
          >
            <span className="text-[8px] font-bold uppercase tracking-wider opacity-70">
              {badge.label}
            </span>
            <span className="text-[10px] font-semibold">{badge.value}</span>
          </span>
        );
      })}
    </div>
  );
}

function MetabolicFocusDetailSheet({ open, parsed, styles, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[100080] flex items-end justify-center bg-black/60 backdrop-blur-md"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="metabolic-focus-sheet-title"
        className="flex max-h-[86dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-zinc-950/75 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-zinc-600" aria-hidden />
        <header className="flex items-start justify-between gap-3 border-b border-white/8 px-4 pb-3 pt-2">
          <div className="min-w-0">
            <h2
              id="metabolic-focus-sheet-title"
              className="m-0 text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400"
            >
              {METABOLIC_FOCUS_LABEL}
            </h2>
            <span
              className={`mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${styles.badge}`}
            >
              {parsed.light.label}
            </span>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <StatusBadgeRow badges={parsed.badges} />

          {sections.length > 0 ? (
            sections.map((section) => (
              <section
                key={section.id}
                className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2.5"
              >
                <p className="m-0 mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  <span aria-hidden>{section.icon}</span>
                  {section.sheetLabel || section.label}
                </p>
                <ul className="m-0 list-none space-y-1.5 p-0">
                  {section.bullets.map((bullet, index) => (
                    <li
                      key={`${section.id}-${index}`}
                      className="flex gap-2 text-[13px] leading-snug text-zinc-200"
                    >
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-400/80" aria-hidden />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="m-0 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-300">
              {parsed.raw || parsed.teaser}
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-white/8 px-4 pb-[calc(0.9rem+env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={onClose}
            className={[
              'flex w-full items-center justify-center rounded-xl border px-3 py-2.5',
              'border-zinc-500/50 bg-zinc-900 text-[13px] font-semibold text-zinc-100',
              'hover:border-zinc-400 hover:bg-zinc-800',
              'active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
            ].join(' ')}
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Scheda chat a piena larghezza: sintesi + bottom sheet dettagli (resta in chat).
 */
export default function MetabolicFocusChatCard({
  text = '',
  avatarSrc = null,
} = {}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const parsed = useMemo(() => parseMetabolicFocusReport(text), [text]);
  const styles = LIGHT_STYLES[parsed.light.key] || LIGHT_STYLES.giallo;

  return (
    <>
      <article
        className={`w-full min-w-0 overflow-hidden rounded-2xl border ${styles.card} shadow-[0_12px_40px_rgba(0,0,0,0.28)]`}
        aria-label={METABOLIC_FOCUS_LABEL}
      >
        <header className="flex items-center gap-2.5 border-b border-white/8 px-3 py-2">
          <KentuAvatar
            size="xs"
            src={avatarSrc}
            fit="contain"
            alt=""
            className="!h-8 !w-8"
          />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">
              {METABOLIC_FOCUS_LABEL}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${styles.badge}`}
          >
            {parsed.light.label}
          </span>
        </header>

        <div className="space-y-2.5 px-3 py-2.5">
          <StatusBadgeRow badges={parsed.badges} />
          <p className="m-0 text-[13px] leading-snug text-zinc-200">
            {parsed.teaser}
          </p>

          {parsed.pills.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {parsed.pills.map((pill) => (
                <li
                  key={pill.id}
                  className="flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.04] px-2.5 py-1.5"
                >
                  <span className="shrink-0 text-sm leading-none" aria-hidden>{pill.icon}</span>
                  <div className="min-w-0">
                    <p className="m-0 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
                      {pill.label}
                    </p>
                    <p className="m-0 truncate text-[12px] leading-snug text-zinc-300">
                      {pill.summary}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={[
              'flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5',
              'border-cyan-400/40 bg-cyan-500/15 text-[13px] font-semibold text-cyan-100',
              'shadow-[0_0_24px_rgba(34,211,238,0.12)] transition',
              'hover:border-cyan-300/60 hover:bg-cyan-400/20 hover:text-white',
              'active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
            ].join(' ')}
          >
            {METABOLIC_FOCUS_CHAT_CTA}
          </button>
        </div>
      </article>

      <MetabolicFocusDetailSheet
        open={sheetOpen}
        parsed={parsed}
        styles={styles}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
