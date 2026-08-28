import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Leaf } from 'lucide-react';
import AddEventMenuGrid from '../components/AddEventMenuGrid';
import LegalTextModal from '../components/legal/LegalTextModal.jsx';
import {
  MEDICAL_DISCLAIMER_BODY,
  MEDICAL_DISCLAIMER_TITLE,
  PRIVACY_POLICY_URL,
} from '../constants/legalContent.js';

const MENU_BTN_CLASS = [
  'flex items-center justify-center rounded-2xl border',
  'border-white/12 bg-white/[0.06] text-zinc-100 shadow-[0_8px_32px_rgba(0,0,0,0.35)]',
  'backdrop-blur-sm transition-all duration-150',
  'hover:border-cyan-400/45 hover:bg-cyan-500/10 hover:shadow-[0_12px_40px_rgba(34,211,238,0.12)]',
  'active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50',
].join(' ');

function MenuGlassButton({
  icon,
  label,
  onClick,
  span = 1,
  labelClassName = 'text-zinc-100',
  iconFilter,
}) {
  const isWide = span === 2;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        MENU_BTN_CLASS,
        isWide ? 'col-span-2 min-h-[4.75rem] flex-row gap-3 px-5 py-4' : 'min-h-[5.5rem] flex-col gap-2 px-4 py-4',
      ].join(' ')}
    >
      {typeof icon === 'string' ? (
        <span
          className={`leading-none ${isWide ? 'text-2xl' : 'text-3xl'}`}
          style={iconFilter ? { filter: iconFilter } : undefined}
          aria-hidden
        >
          {icon}
        </span>
      ) : (
        <span className="leading-none" aria-hidden>{icon}</span>
      )}
      <span className={`text-center text-xs font-semibold leading-tight sm:text-sm ${labelClassName}`}>
        {label}
      </span>
    </button>
  );
}

/**
 * Home drawer: griglia eventi.
 * Menu generale: overlay glassmorphism (Vetrina Ghiacciata), non più nel cassetto.
 */
export default function MainMenuDrawer({
  activeAction,
  setActiveAction,
  addEventMenuOrder,
  commitAddEventMenuOrder,
  handleAddEventMenuItem,
  setShowReport,
  onOpenHealthReport = null,
  onOpenTherapyPlan = null,
  onOpenTrainingPlan = null,
  isDiabetesAppMode = false,
  closeDrawer,
  setIsDrawerOpen,
  setShowProfile,
  onSanitizeFoodDb = null,
}) {
  const showHome = !activeAction || activeAction === 'home';
  const showSecondary = activeAction === 'menu_secondary';
  const [showMedicalDisclaimer, setShowMedicalDisclaimer] = useState(false);

  const closeMenu = useCallback(() => {
    setActiveAction(null);
    closeDrawer();
  }, [closeDrawer, setActiveAction]);

  const openDrawerAction = useCallback((action) => {
    setActiveAction(action);
    setIsDrawerOpen?.(true);
  }, [setActiveAction, setIsDrawerOpen]);

  const runAndClose = useCallback((fn) => {
    fn?.();
    setActiveAction(null);
    closeDrawer();
  }, [closeDrawer, setActiveAction]);

  useEffect(() => {
    if (!showSecondary) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showSecondary, closeMenu]);

  if (!showHome && !showSecondary) return null;

  return (
    <>
      {showHome ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 [-webkit-overflow-scrolling:touch]">
          <div className="view-animate">
            <AddEventMenuGrid
              menuOrder={addEventMenuOrder}
              onOrderCommit={commitAddEventMenuOrder}
              onItemActivate={(id) => handleAddEventMenuItem(id, 'drawer')}
            />
          </div>
        </div>
      ) : null}

      {showSecondary && typeof document !== 'undefined'
        ? createPortal(
          <>
            <div
              className="kentu-submenu-focus-backdrop fixed inset-0 z-[100040] bg-black/60 backdrop-blur-md"
              aria-hidden
              onClick={closeMenu}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Menu generale"
              className="pointer-events-none fixed inset-0 z-[100041] flex items-center justify-center px-4 py-6 sm:px-6 sm:py-8"
            >
              <div
                className="kentu-submenu-focus-panel pointer-events-auto flex max-h-[90dvh] w-full max-w-lg flex-col items-center gap-4 overflow-hidden"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="shrink-0 text-center">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Menu generale
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-zinc-50">Azioni</h2>
                </div>

                <div className="min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-0.5 pb-1">
                  <div className="grid w-full grid-cols-2 gap-3">
                    <MenuGlassButton
                      span={2}
                      icon="⚙️"
                      label="Profilo & Target"
                      onClick={() => runAndClose(() => setShowProfile(true))}
                    />
                    <MenuGlassButton
                      icon="📚"
                      label="Archivio Storico"
                      labelClassName="text-[#b0bec5]"
                      iconFilter="drop-shadow(0 0 8px rgba(176, 190, 197, 0.5))"
                      onClick={() => openDrawerAction('storico')}
                    />
                    {isDiabetesAppMode ? (
                      <MenuGlassButton
                        icon="🩺"
                        label="Report Medico"
                        labelClassName="text-[#6ee7b7]"
                        iconFilter="drop-shadow(0 0 8px rgba(16, 185, 129, 0.5))"
                        onClick={() => runAndClose(() => onOpenHealthReport?.())}
                      />
                    ) : (
                      <MenuGlassButton
                        icon="📊"
                        label="Report"
                        onClick={() => runAndClose(() => setShowReport(true))}
                      />
                    )}
                    <MenuGlassButton
                      icon="🏋️"
                      label="Piano Allenamento"
                      labelClassName="text-[#fdba74]"
                      iconFilter="drop-shadow(0 0 8px rgba(251, 146, 60, 0.5))"
                      onClick={() => runAndClose(() => onOpenTrainingPlan?.())}
                    />
                    <MenuGlassButton
                      icon="💊"
                      label="Piano Terapia"
                      labelClassName="text-[#67e8f9]"
                      iconFilter="drop-shadow(0 0 8px rgba(34, 211, 238, 0.5))"
                      onClick={() => runAndClose(() => onOpenTherapyPlan?.())}
                    />
                    <MenuGlassButton
                      span={import.meta.env.DEV ? 1 : 2}
                      icon={(
                        <Leaf
                          size={28}
                          strokeWidth={1.75}
                          className="text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.55)]"
                        />
                      )}
                      label="Neural Reset"
                      labelClassName="text-emerald-200"
                      onClick={() => {
                        setActiveAction('focus');
                        setIsDrawerOpen?.(false);
                      }}
                    />
                    {import.meta.env.DEV ? (
                      <MenuGlassButton
                        icon="📟"
                        label="Diario API"
                        labelClassName="text-[#fbbf24]"
                        iconFilter="drop-shadow(0 0 8px rgba(251, 191, 36, 0.45))"
                        onClick={() => openDrawerAction('api_diary')}
                      />
                    ) : null}
                    {import.meta.env.DEV && typeof onSanitizeFoodDb === 'function' ? (
                      <MenuGlassButton
                        icon="🧹"
                        label="Bonifica Food DB"
                        labelClassName="text-[#fca5a5]"
                        iconFilter="drop-shadow(0 0 8px rgba(248, 113, 113, 0.45))"
                        onClick={async (e) => {
                          const dryRun = !e.shiftKey;
                          if (!dryRun) {
                            const ok = window.confirm(
                              'SCRITTURA Firebase: re-sync master + sterilizza micro inventati + auto-tagging semanticTags.\n\nContinuare?',
                            );
                            if (!ok) return;
                          } else {
                            window.alert(
                              'Dry-run avviato: controlla la console DevTools.\n\nShift+click per scrivere su Firebase.',
                            );
                          }
                          const result = await onSanitizeFoodDb({ dryRun });
                          if (result?.tagStats) {
                            const { total = 0, masterMatched = 0, heuristic = 0 } = result.tagStats;
                            const modeLabel = dryRun ? 'Dry-run completato' : 'Bonifica e auto-tagging completati';
                            window.alert(
                              `${modeLabel} su ${total} alimenti.\n${masterMatched} tag da master · ${heuristic} tag euristici.`,
                            );
                          }
                          if (!dryRun) closeMenu();
                        }}
                      />
                    ) : null}
                    <MenuGlassButton
                      span={import.meta.env.DEV && typeof onSanitizeFoodDb === 'function' ? 1 : 2}
                      icon="🛠️"
                      label="Dev Console"
                      labelClassName="text-[#cbd5e1]"
                      iconFilter="drop-shadow(0 0 8px rgba(148, 163, 184, 0.45))"
                      onClick={() => {
                        setActiveAction('dev_console');
                        setIsDrawerOpen?.(false);
                      }}
                    />
                    <MenuGlassButton
                      icon="⚕️"
                      label="Disclaimer Medico"
                      labelClassName="text-[#fcd34d]"
                      iconFilter="drop-shadow(0 0 8px rgba(251, 191, 36, 0.4))"
                      onClick={() => setShowMedicalDisclaimer(true)}
                    />
                    <MenuGlassButton
                      icon="🔒"
                      label="Privacy Policy"
                      labelClassName="text-[#67e8f9]"
                      iconFilter="drop-shadow(0 0 8px rgba(34, 211, 238, 0.4))"
                      onClick={() => {
                        if (typeof window !== 'undefined') {
                          window.open(PRIVACY_POLICY_URL, '_blank', 'noopener,noreferrer');
                        }
                      }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeMenu}
                  className={[
                    'mt-auto flex-shrink-0 rounded-full border border-zinc-600/80 bg-zinc-900/80 px-5 py-2.5',
                    'text-sm font-medium text-zinc-300 backdrop-blur-sm transition-colors',
                    'hover:border-zinc-500 hover:bg-zinc-800 hover:text-white',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40',
                  ].join(' ')}
                >
                  Annulla
                </button>
              </div>
            </div>
            <LegalTextModal
              open={showMedicalDisclaimer}
              title={MEDICAL_DISCLAIMER_TITLE}
              body={MEDICAL_DISCLAIMER_BODY}
              onClose={() => setShowMedicalDisclaimer(false)}
            />
          </>,
          document.body,
        )
        : null}
    </>
  );
}
