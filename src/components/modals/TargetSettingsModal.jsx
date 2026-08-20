import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { logout } from '../../services/firebaseAuth';
import { MANUAL_TARGET_EDIT_EXCLUDED_KEYS } from '../../constants/salaComandiConstants';
import { mergeProfileNutritionFromServer } from '../../userNutritionGoals';
import {
  APP_MODE_OPTIONS,
  resolveSelectableAppMode,
} from '../../features/chat/healthChatMode.js';

const CONTROL_CLASS = [
  'min-w-0 shrink-0 rounded-lg border border-white/10 bg-white/[0.06]',
  'px-3 py-1.5 text-sm text-white outline-none',
  'focus:border-cyan-400/45 focus:ring-1 focus:ring-cyan-400/30',
  'disabled:opacity-50',
].join(' ');

function SettingsSection({ title, children }) {
  return (
    <section className="mb-1">
      <h3 className="px-0.5 pb-1.5 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {title}
      </h3>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({ title, description, control, last = false }) {
  return (
    <div
      className={[
        'flex items-center gap-3 px-3 py-2.5',
        last ? '' : 'border-b border-white/10',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-zinc-50">{title}</p>
        {description ? (
          <p className="mt-0.5 text-sm leading-snug text-gray-300">{description}</p>
        ) : null}
      </div>
      <div className="flex min-w-[9.5rem] w-[min(50%,16rem)] shrink-0 justify-end">
        {control}
      </div>
    </div>
  );
}

/**
 * Modale "Impostazioni universali": biometrici, target manuali, CSV bilancia, logout.
 */
export default function TargetSettingsModal({
  open,
  onClose,
  userProfile,
  setUserProfile,
  birthDate,
  setBirthDate,
  userTargets,
  applyTargetModeUpdate,
  calculateAge,
  calculateSmartTargets,
  csvInputRef,
  handleCSVUpload,
  saveProfileToFirebase,
  onAppModeChange = null,
}) {
  const [appModeSaving, setAppModeSaving] = useState(false);
  const [appModeFeedback, setAppModeFeedback] = useState('');

  const selectedAppMode = useMemo(
    () => resolveSelectableAppMode(userProfile),
    [userProfile],
  );

  const selectedModeHint = useMemo(() => {
    const opt = APP_MODE_OPTIONS.find((o) => o.value === selectedAppMode);
    return opt?.hint || '';
  }, [selectedAppMode]);

  const handleAppModeSelect = useCallback(async (nextMode) => {
    const mode = String(nextMode || '').trim().toLowerCase();
    if (!mode || mode === selectedAppMode) return;

    const nextProfile = { ...userProfile, appMode: mode };
    setUserProfile(nextProfile);
    setAppModeFeedback('');

    if (typeof onAppModeChange !== 'function') return;

    setAppModeSaving(true);
    try {
      await onAppModeChange(mode, nextProfile);
      setAppModeFeedback(mode === 'diabete'
        ? 'Modalità Diabete attiva — chat e Report Medico aggiornati.'
        : 'Modalità Standard attiva — nutrizione e ipertrofia.');
    } catch (err) {
      console.error('[TargetSettingsModal] appMode save failed', err);
      setAppModeFeedback('Salvataggio modalità non riuscito. Riprova.');
    } finally {
      setAppModeSaving(false);
    }
  }, [onAppModeChange, selectedAppMode, setUserProfile, userProfile]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const computedAge = calculateAge(birthDate);
  const targetKeys = Object.keys(userTargets || {}).filter((key) => !MANUAL_TARGET_EDIT_EXCLUDED_KEYS.has(key));

  const saveProfile = () => {
    let profilePayload = { ...userProfile, birthDate: birthDate || '' };
    if (computedAge != null) profilePayload.age = computedAge;
    if (profilePayload.targetCalories == null && userTargets.kcal != null) {
      profilePayload.targetCalories = Math.round(Number(userTargets.kcal));
    }
    if (!profilePayload.appMode) {
      profilePayload.appMode = selectedAppMode;
    }
    profilePayload = mergeProfileNutritionFromServer(profilePayload);
    setUserProfile(profilePayload);
    saveProfileToFirebase(profilePayload, userTargets);
  };

  return createPortal(
    <>
      <div
        className="kentu-submenu-focus-backdrop fixed inset-0 z-[100040] bg-black/60 backdrop-blur-md"
        aria-hidden
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Impostazioni Universali"
        className="pointer-events-none fixed inset-0 z-[100041] flex items-start justify-center overflow-y-auto px-3 py-4 sm:px-4 sm:py-6"
      >
        <div
          className="kentu-submenu-focus-panel pointer-events-auto my-auto w-11/12 max-w-2xl rounded-2xl border border-white/10 bg-zinc-950/75 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="mb-2 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Account
              </p>
              <h2 className="text-lg font-semibold text-zinc-50">Impostazioni Universali</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Chiudi impostazioni"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-900/80 text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              ✕
            </button>
          </header>

          <SettingsSection title="Profilo operativo">
            {APP_MODE_OPTIONS.map((opt, index) => {
              const active = selectedAppMode === opt.value;
              const last = index === APP_MODE_OPTIONS.length - 1;
              return (
                <button
                  key={`radio_${opt.value}`}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={appModeSaving}
                  onClick={() => {
                    void handleAppModeSelect(opt.value);
                  }}
                  className={[
                    'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    last ? '' : 'border-b border-white/10',
                    active ? 'bg-cyan-500/10' : 'hover:bg-white/[0.04]',
                    appModeSaving ? 'cursor-wait opacity-70' : 'cursor-pointer',
                  ].join(' ')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-50">{opt.label}</p>
                    <p className="mt-0.5 text-sm leading-snug text-gray-300">{opt.hint}</p>
                  </div>
                  <span
                    className={[
                      'h-5 w-5 shrink-0 rounded-full border-2',
                      active ? 'border-cyan-300 bg-cyan-400' : 'border-white/25 bg-transparent',
                    ].join(' ')}
                    aria-hidden
                  />
                </button>
              );
            })}
            <p
              className={`px-3 py-2 text-sm ${
                appModeFeedback.includes('non riuscito') ? 'text-red-400' : 'text-emerald-300/90'
              }`}
            >
              {appModeSaving ? 'Salvataggio modalità…' : (appModeFeedback || selectedModeHint)}
            </p>
          </SettingsSection>

          <SettingsSection title="Dati biometrici">
            <SettingsRow
              title="Nome"
              description="Come ti chiama Kentu in chat"
              control={(
                <input
                  type="text"
                  autoComplete="given-name"
                  placeholder="es. Marco"
                  value={userProfile.displayName ?? userProfile.name ?? ''}
                  onChange={(e) => setUserProfile({
                    ...userProfile,
                    displayName: e.target.value,
                    name: e.target.value,
                  })}
                  className={`${CONTROL_CLASS} w-full`}
                />
              )}
            />
            <SettingsRow
              title="Sesso"
              control={(
                <select
                  value={userProfile.gender}
                  onChange={(e) => setUserProfile({ ...userProfile, gender: e.target.value })}
                  className={`${CONTROL_CLASS} w-full`}
                >
                  <option value="M">Uomo</option>
                  <option value="F">Donna</option>
                </select>
              )}
            />
            <SettingsRow
              title="Data di nascita"
              description={computedAge != null ? `Età calcolata: ${computedAge} anni` : null}
              control={(
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className={`${CONTROL_CLASS} w-full`}
                />
              )}
            />
            <SettingsRow
              title="Età"
              control={(
                <input
                  type="number"
                  min="1"
                  max="120"
                  inputMode="numeric"
                  value={userProfile.age}
                  onChange={(e) => setUserProfile({ ...userProfile, age: parseInt(e.target.value, 10) || 30 })}
                  className={`${CONTROL_CLASS} w-full`}
                />
              )}
            />
            <SettingsRow
              title="Peso"
              description="kg"
              control={(
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  inputMode="decimal"
                  value={userProfile.weight}
                  onChange={(e) => setUserProfile({ ...userProfile, weight: parseFloat(e.target.value) || 75 })}
                  className={`${CONTROL_CLASS} w-full`}
                />
              )}
            />
            <SettingsRow
              title="Altezza"
              description="cm"
              control={(
                <input
                  type="number"
                  min="1"
                  inputMode="decimal"
                  value={userProfile.height}
                  onChange={(e) => setUserProfile({ ...userProfile, height: parseFloat(e.target.value) || 175 })}
                  className={`${CONTROL_CLASS} w-full`}
                />
              )}
            />
            <SettingsRow
              title="Stile di vita"
              control={(
                <select
                  value={userProfile.activityLevel}
                  onChange={(e) => setUserProfile({ ...userProfile, activityLevel: e.target.value })}
                  className={`${CONTROL_CLASS} w-full`}
                >
                  <option value="1.2">Sedentario</option>
                  <option value="1.375">Leggero (1-3 allenamenti)</option>
                  <option value="1.55">Moderato (3-5 allenamenti)</option>
                  <option value="1.725">Attivo (6-7 allenamenti)</option>
                  <option value="1.9">Molto attivo</option>
                </select>
              )}
            />
            <SettingsRow
              title="Obiettivo nutrizionale"
              control={(
                <select
                  value={userProfile.nutritionGoal || 'maintain'}
                  onChange={(e) => {
                    const v = e.target.value;
                    setUserProfile({
                      ...userProfile,
                      nutritionGoal: v,
                      goal: v === 'cut' ? 'lose' : v === 'bulk' ? 'gain' : 'maintain',
                    });
                  }}
                  className={`${CONTROL_CLASS} w-full`}
                >
                  <option value="cut">Deficit (cut)</option>
                  <option value="recomp">Ricomposizione</option>
                  <option value="maintain">Mantenimento</option>
                  <option value="bulk">Surplus (bulk)</option>
                </select>
              )}
            />
            <SettingsRow
              title="Calorie target"
              description="Giornaliere"
              control={(
                <input
                  type="number"
                  min={800}
                  max={12000}
                  inputMode="numeric"
                  value={userProfile.targetCalories ?? userTargets.kcal ?? ''}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    const nextCal = Number.isFinite(n) ? n : null;
                    setUserProfile({ ...userProfile, targetCalories: nextCal });
                    if (Number.isFinite(n)) {
                      applyTargetModeUpdate({
                        updater: (prev) => ({ ...prev, kcal: n }),
                        mode: 'manual',
                        source: 'manual-kcal-input',
                      });
                    }
                  }}
                  className={`${CONTROL_CLASS} w-full`}
                />
              )}
            />
            <SettingsRow
              title="Proteine"
              description="g — lascia vuoto per usare i macro"
              control={(
                <input
                  type="number"
                  min={30}
                  max={400}
                  inputMode="numeric"
                  placeholder="Auto"
                  value={userProfile.proteinTarget ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    if (raw === '') {
                      setUserProfile({ ...userProfile, proteinTarget: null });
                      return;
                    }
                    const n = parseInt(raw, 10);
                    if (Number.isFinite(n)) {
                      setUserProfile({ ...userProfile, proteinTarget: n });
                      applyTargetModeUpdate({
                        updater: (prev) => ({ ...prev, prot: n }),
                        mode: 'manual',
                        source: 'manual-protein-input',
                      });
                    }
                  }}
                  className={`${CONTROL_CLASS} w-full`}
                />
              )}
            />
            <SettingsRow
              title="Livello interfaccia"
              last
              control={(
                <select
                  value={userProfile.level || 'pro'}
                  onChange={(e) => setUserProfile({ ...userProfile, level: e.target.value })}
                  className={`${CONTROL_CLASS} w-full`}
                >
                  <option value="base">Base (semplificata)</option>
                  <option value="pro">Pro (grafici e telemetria)</option>
                </select>
              )}
            />
          </SettingsSection>

          <button
            type="button"
            onClick={calculateSmartTargets}
            className="mb-3 mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/35 bg-amber-400/15 px-3 py-2.5 text-sm font-bold text-amber-200 transition-colors hover:bg-amber-400/25"
          >
            <img src="/nuova-icona.png" alt="" width={18} height={18} decoding="async" className="object-contain" />
            Auto-Calcola Target
          </button>

          <SettingsSection title="Modifica manuale target">
            <p className="border-b border-white/10 px-3 py-2 text-sm text-gray-300">
              Correggi i valori se il nutrizionista o l&apos;AI ti ha dato numeri specifici.
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-3">
              {targetKeys.map((key) => (
                <label key={key} className="flex flex-col gap-1 py-1.5">
                  <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-cyan-300/90">{key}</span>
                  <input
                    type="number"
                    min="0"
                    step={key === 'omega3' || key === 'vitD' ? 0.1 : 1}
                    inputMode="decimal"
                    value={userTargets[key] ?? ''}
                    onChange={(e) => {
                      const parsed = parseFloat(e.target.value);
                      applyTargetModeUpdate({
                        updater: (prev) => ({ ...prev, [key]: Number.isFinite(parsed) ? parsed : 0 }),
                        mode: 'manual',
                        source: 'manual-target-grid',
                      });
                    }}
                    className={CONTROL_CLASS}
                  />
                </label>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection title="Sincronizzazione bilancia">
            <SettingsRow
              title="Importa CSV"
              description="Peso, massa grassa, muscolare e idratazione nei giorni giusti del diario."
              last
              control={(
                <>
                  <input type="file" accept=".csv" ref={csvInputRef} className="hidden" onChange={handleCSVUpload} />
                  <button
                    type="button"
                    onClick={() => csvInputRef.current?.click()}
                    className="rounded-lg border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-sm font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/20"
                  >
                    Carica CSV
                  </button>
                </>
              )}
            />
          </SettingsSection>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => logout()}
              className="rounded-full border border-red-400/35 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/20"
            >
              Esci
            </button>
            <div className="ml-auto flex flex-1 justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-zinc-600/80 bg-zinc-900/80 px-4 py-2 text-sm font-medium text-zinc-300 backdrop-blur-sm transition-colors hover:border-zinc-500 hover:text-white"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={saveProfile}
                className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-4 py-2 text-sm font-bold text-emerald-100 transition-colors hover:bg-emerald-500/30"
              >
                Salva Profilo
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
