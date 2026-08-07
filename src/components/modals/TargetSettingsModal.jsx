import React, { useCallback, useMemo, useState } from 'react';
import { MANUAL_TARGET_EDIT_EXCLUDED_KEYS } from '../../constants/salaComandiConstants';
import { mergeProfileNutritionFromServer } from '../../userNutritionGoals';
import {
  APP_MODE_OPTIONS,
  resolveSelectableAppMode,
} from '../../features/chat/healthChatMode.js';

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
  longevityData,
  onOpenLongevityStats,
  auth,
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

  if (!open) return null;

  return (
    <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', zIndex: 100020, overflowY: 'auto', padding: '20px' }}>
      <div style={{ background: '#1e1e1e', padding: '30px', borderRadius: '16px', maxWidth: '600px', margin: '0 auto', color: '#fff' }}>
        <h2 style={{ color: '#00e5ff', borderBottom: '1px solid #333', paddingBottom: '10px' }}>⚙️ Impostazioni Universali</h2>

        <div style={{ background: '#2c2c2c', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(0, 229, 255, 0.22)' }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#00e5ff' }}>Profilo Operativo</h3>
          <p style={{ margin: '0 0 14px 0', fontSize: '0.8rem', color: '#aaa', lineHeight: 1.45 }}>
            Scegli come KentuOS deve lavorare per questo account. Il cambio si salva subito su Firebase.
          </p>
          <label style={{ display: 'block' }}>
            Modalità App
            <select
              value={selectedAppMode}
              disabled={appModeSaving}
              onChange={(e) => {
                void handleAppModeSelect(e.target.value);
              }}
              style={{
                width: '100%',
                marginTop: '6px',
                padding: '10px',
                background: '#111',
                border: '1px solid #00e5ff55',
                color: '#fff',
                borderRadius: '6px',
                fontWeight: 600,
              }}
            >
              {APP_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <div
            role="radiogroup"
            aria-label="Profilo operativo"
            style={{ display: 'grid', gap: '8px', marginTop: '12px' }}
          >
            {APP_MODE_OPTIONS.map((opt) => {
              const active = selectedAppMode === opt.value;
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
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    cursor: appModeSaving ? 'wait' : 'pointer',
                    border: active ? '1px solid #00e5ff' : '1px solid #444',
                    background: active ? 'rgba(0, 229, 255, 0.12)' : '#111',
                    color: '#fff',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                    {active ? '● ' : '○ '}
                    {opt.label}
                  </div>
                  <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.4 }}>
                    {opt.hint}
                  </div>
                </button>
              );
            })}
          </div>
          <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: appModeFeedback.includes('non riuscito') ? '#f87171' : '#6ee7b7' }}>
            {appModeSaving ? 'Salvataggio modalità…' : (appModeFeedback || selectedModeHint)}
          </p>
        </div>

        <div style={{ background: '#2c2c2c', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>1. Dati Biometrici</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            <label style={{ display: 'block', gridColumn: '1 / -1' }}>
              Nome (come ti chiama Kentu in chat)
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
                style={{ width: '100%', marginTop: '4px', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'block' }}>Sesso: <select value={userProfile.gender} onChange={e => setUserProfile({ ...userProfile, gender: e.target.value })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}><option value="M">Uomo</option><option value="F">Donna</option></select></label>
            <label style={{ display: 'block' }}>Data di Nascita
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                style={{ width: '100%', padding: '8px', marginTop: '4px', background: '#2c2c2e', border: '1px solid #444', color: '#fff', borderRadius: '8px', boxSizing: 'border-box' }}
              />
            </label>
            {calculateAge(birthDate) != null ? (
              <div style={{ gridColumn: '1 / -1', fontSize: '0.8rem', color: '#00e5ff', marginTop: '-4px', marginBottom: '4px' }}>
                Età calcolata: <strong>{calculateAge(birthDate)}</strong> anni
              </div>
            ) : null}
            <label style={{ display: 'block' }}>Età: <input type="number" min="1" max="120" inputMode="numeric" value={userProfile.age} onChange={e => setUserProfile({ ...userProfile, age: parseInt(e.target.value, 10) || 30 })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }} /></label>
            <label style={{ display: 'block' }}>Peso (kg): <input type="number" min="1" step="0.1" inputMode="decimal" value={userProfile.weight} onChange={e => setUserProfile({ ...userProfile, weight: parseFloat(e.target.value) || 75 })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }} /></label>
            <label style={{ display: 'block' }}>Altezza (cm): <input type="number" min="1" inputMode="decimal" value={userProfile.height} onChange={e => setUserProfile({ ...userProfile, height: parseFloat(e.target.value) || 175 })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }} /></label>
            <label style={{ display: 'block' }}>Stile di Vita:
              <select value={userProfile.activityLevel} onChange={e => setUserProfile({ ...userProfile, activityLevel: e.target.value })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}>
                <option value="1.2">Sedentario</option>
                <option value="1.375">Leggero (1-3 allenamenti)</option>
                <option value="1.55">Moderato (3-5 allenamenti)</option>
                <option value="1.725">Attivo (6-7 allenamenti)</option>
                <option value="1.9">Molto attivo</option>
              </select>
            </label>
            <label style={{ display: 'block' }}>Obiettivo nutrizionale:
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
                style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
              >
                <option value="cut">Deficit (cut)</option>
                <option value="recomp">Ricomposizione</option>
                <option value="maintain">Mantenimento</option>
                <option value="bulk">Surplus (bulk)</option>
              </select>
            </label>
            <label style={{ display: 'block', gridColumn: '1 / -1' }}>
              Calorie target (giornaliere)
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
                style={{ width: '100%', marginTop: '4px', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
              />
            </label>
            <label style={{ display: 'block', gridColumn: '1 / -1' }}>
              Proteine (g) — opzionale, lascia vuoto per usare il valore dai macro
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
                style={{ width: '100%', marginTop: '4px', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
              />
            </label>
            <label style={{ display: 'block' }}>Livello interfaccia:
              <select value={userProfile.level || 'pro'} onChange={e => setUserProfile({ ...userProfile, level: e.target.value })} style={{ width: '100%', padding: '8px', background: '#111', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}>
                <option value="base">Base (semplificata)</option>
                <option value="pro">Pro (grafici e telemetria)</option>
              </select>
            </label>
          </div>
          <button type="button" onClick={calculateSmartTargets} style={{ width: '100%', padding: '12px', marginTop: '15px', background: '#ff9800', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
            <img src="/nuova-icona.png" alt="" width={20} height={20} decoding="async" style={{ objectFit: 'contain' }} />
            Auto-Calcola Target
          </button>
        </div>

        <div style={{ background: '#2c2c2c', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 15px 0' }}>2. Modifica Manuale Target</h3>
          <p style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '15px' }}>Correggi manualmente i valori calcolati se il tuo nutrizionista (o l'AI) ti ha fornito numeri specifici.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
            {Object.keys(userTargets)
              .filter((key) => !MANUAL_TARGET_EDIT_EXCLUDED_KEYS.has(key))
              .map(key => (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', fontSize: '0.9rem' }}>
                <span style={{ textTransform: 'uppercase', color: '#00e5ff' }}>{key}</span>
                <input
                  type="number"
                  min="0"
                  step={key === 'omega3' || key === 'vitD' ? 0.1 : 1}
                  inputMode="decimal"
                  value={userTargets[key] ?? ''}
                  onChange={e => {
                    const parsed = parseFloat(e.target.value);
                    applyTargetModeUpdate({
                      updater: (prev) => ({ ...prev, [key]: Number.isFinite(parsed) ? parsed : 0 }),
                      mode: 'manual',
                      source: 'manual-target-grid',
                    });
                  }}
                  style={{ padding: '8px', border: '1px solid #444', background: '#111', color: '#fff', borderRadius: '4px' }}
                />
              </label>
            ))}
          </div>
        </div>

        <div style={{ background: '#2c2c2c', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#00e5ff' }}>3. Sincronizzazione Bilancia (CSV)</h3>
          <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '15px', lineHeight: 1.4 }}>
            Importa lo storico delle pesate dalla tua bilancia smart. Il sistema leggerà automaticamente Peso, Massa Grassa, Massa Muscolare e Idratazione, assegnandoli ai giorni corretti nel tuo diario.
          </p>
          <input type="file" accept=".csv" ref={csvInputRef} style={{ display: 'none' }} onChange={handleCSVUpload} />
          <button
            type="button"
            onClick={() => csvInputRef.current?.click()}
            style={{ width: '100%', padding: '12px', background: 'rgba(0, 229, 255, 0.1)', color: '#00e5ff', border: '1px dashed #00e5ff', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            <span style={{ fontSize: '1.2rem' }}>📊</span> Carica File CSV Bilancia
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          {longevityData && (
            <button
              type="button"
              onClick={onOpenLongevityStats}
              style={{ flex: '1 1 140px', padding: '10px 12px', background: 'transparent', border: `1px solid ${longevityData.color}55`, color: longevityData.color, borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
            >
              🧬 Statistiche
            </button>
          )}
          <button
            type="button"
            onClick={() => auth.signOut()}
            style={{ flex: '1 1 140px', padding: '10px 12px', background: 'rgba(244,67,54,0.12)', border: '1px solid rgba(244,67,54,0.45)', color: '#f87171', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}
          >
            Esci
          </button>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '12px', background: '#444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Annulla</button>
          <button
            type="button"
            onClick={() => {
              const computedAge = calculateAge(birthDate);
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
            }}
            style={{ flex: 2, padding: '12px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            💾 Salva Profilo
          </button>
        </div>
      </div>
    </div>
  );
}
