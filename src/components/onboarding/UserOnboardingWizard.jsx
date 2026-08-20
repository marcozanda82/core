import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, ref, set } from 'firebase/database';
import { db } from '../../firebaseConfig';
import { BODY_WEIGHT_KG_MAX, BODY_WEIGHT_KG_MIN, clampBodyWeightKg } from '../../utils/inputSanity';

const TOTAL_STEPS = 5;

const PAL_OPTIONS = [
  {
    id: '1.2',
    pal: 1.2,
    title: 'Base di ricarica',
    subtitle: 'Sedentario — PAL 1.2',
    description: 'Lavoro da scrivania, poca attività strutturata.',
  },
  {
    id: '1.4',
    pal: 1.4,
    title: 'Operativo',
    subtitle: 'Moderato — PAL 1.4',
    description: 'Camminate regolari o 2–3 sessioni di allenamento.',
  },
  {
    id: '1.6',
    pal: 1.6,
    title: 'Assalto',
    subtitle: 'Molto attivo — PAL 1.6',
    description: 'Allenamento frequente o lavoro fisico intenso.',
  },
];

const GOAL_OPTIONS = [
  {
    id: 'cut',
    title: 'Perdita di peso / Definizione',
    subtitle: '−300 kcal',
    delta: -300,
    nutritionGoal: 'cut',
    goal: 'lose',
  },
  {
    id: 'maintain',
    title: 'Mantenimento / Ricomposizione',
    subtitle: '0 kcal',
    delta: 0,
    nutritionGoal: 'maintain',
    goal: 'maintain',
  },
  {
    id: 'bulk',
    title: 'Aumento massa / Forza',
    subtitle: '+250 kcal',
    delta: 250,
    nutritionGoal: 'bulk',
    goal: 'gain',
  },
];

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampFloat(value, min, max, fallback) {
  const n = Number.parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeGender(raw) {
  const g = String(raw ?? 'M').trim().toUpperCase();
  if (g === 'F' || g === 'FEMALE' || g === 'DONNA') return 'F';
  if (
    g === 'N'
    || g === 'X'
    || g === 'NB'
    || g === 'NEUTRO'
    || g === 'NEUTRAL'
    || g === 'OTHER'
    || g === 'NS'
    || g === 'UNSPECIFIED'
  ) {
    return 'N';
  }
  return 'M';
}

function genderLabel(gender) {
  if (gender === 'F') return 'Femmina';
  if (gender === 'N') return 'Neutro / Non specificato';
  return 'Maschio';
}

/** Offset Mifflin–St Jeor: M +5, F −161, N media (−78). */
function mifflinGenderOffset(gender) {
  if (gender === 'F') return -161;
  if (gender === 'N') return -78;
  return 5;
}

function normalizePal(raw) {
  const n = Number.parseFloat(String(raw ?? '1.4').replace(',', '.'));
  if (n <= 1.3) return 1.2;
  if (n >= 1.55) return 1.6;
  return 1.4;
}

function normalizeGoalId(profile) {
  const raw = String(profile?.nutritionGoal || profile?.goal || 'maintain')
    .trim()
    .toLowerCase();
  if (raw === 'cut' || raw === 'lose' || raw === 'dimagrimento' || raw === 'perdita_grasso') return 'cut';
  if (raw === 'bulk' || raw === 'gain' || raw === 'massa') return 'bulk';
  return 'maintain';
}

/**
 * Mifflin–St Jeor + split macro onboarding (prot 1.8 g/kg, fat 0.8 g/kg).
 * Neutro (N): offset −78 = media matematica tra M (+5) e F (−161).
 */
export function computeOnboardingMacros({ gender, age, heightCm, weightKg, pal, goalDelta }) {
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + mifflinGenderOffset(gender);
  const tdee = bmr * pal;
  const rawKcal = tdee + goalDelta;
  const kcal = Math.round(Math.min(5000, Math.max(1200, rawKcal)));
  const prot = Math.round(weightKg * 1.8);
  const fatGrams = weightKg * 0.8;
  const fatKcal = fatGrams * 9;
  const fat = Math.round(fatGrams);
  const carb = Math.max(0, Math.round((kcal - prot * 4 - fatKcal) / 4));
  const water = Math.round(Math.min(5000, Math.max(1500, weightKg * 35)));
  return { bmr, tdee, kcal, prot, fat, carb, water };
}

function buildInitialState(initialProfile, displayName) {
  const p = initialProfile && typeof initialProfile === 'object' ? initialProfile : {};
  const weight = clampBodyWeightKg(p.weight) ?? 70;
  return {
    gender: normalizeGender(p.gender),
    age: clampInt(p.age, 15, 99, 30),
    height: clampInt(p.height, 120, 250, 175),
    weight,
    pal: normalizePal(p.activityLevel),
    goalId: normalizeGoalId(p),
    displayName: typeof p.displayName === 'string' && p.displayName
      ? p.displayName
      : displayName || '',
  };
}

function StepDots({ step }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        Step {step} di {TOTAL_STEPS}
      </p>
      <div className="flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => {
          const n = i + 1;
          const active = n === step;
          const done = n < step;
          return (
            <span
              key={n}
              className={[
                'h-1.5 rounded-full transition-all',
                active ? 'w-6 bg-cyan-400' : done ? 'w-3 bg-cyan-400/50' : 'w-3 bg-white/15',
              ].join(' ')}
            />
          );
        })}
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
      {children}
    </label>
  );
}

function PillButton({ selected, onClick, children, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-4 py-2.5 text-sm font-semibold transition',
        selected
          ? 'border-cyan-400/60 bg-cyan-400/15 text-cyan-100'
          : 'border-white/10 bg-white/[0.04] text-zinc-300 hover:border-white/20',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function SummaryEditRow({ label, value, onEdit }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-left transition hover:border-cyan-400/35 hover:bg-cyan-400/5"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
        <p className="mt-0.5 truncate text-sm font-medium text-zinc-100">{value}</p>
      </div>
      <span className="shrink-0 text-xs font-semibold text-cyan-300/90">Modifica</span>
    </button>
  );
}

function OptionCard({ selected, onClick, title, subtitle, description }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full rounded-xl border px-4 py-3.5 text-left transition',
        selected
          ? 'border-cyan-400/55 bg-cyan-400/10 shadow-[0_0_24px_rgba(34,211,238,0.12)]'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20',
      ].join(' ')}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-white">{title}</p>
        {subtitle ? <p className="shrink-0 text-xs text-cyan-300/90">{subtitle}</p> : null}
      </div>
      {description ? <p className="mt-1 text-xs leading-relaxed text-zinc-400">{description}</p> : null}
    </button>
  );
}

/** Mascotte wizard.mp4 in loop continuo (autoplay muted + ridondanza onEnded). */
function MascotLoopVideo({ className = '' }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    el.muted = true;
    const tryPlay = () => {
      const p = el.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          /* autoplay bloccato: ritenta al primo gesture via attributes */
        });
      }
    };
    tryPlay();
    const onVis = () => {
      if (document.visibilityState === 'visible') tryPlay();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return (
    <div
      className={[
        'aspect-video w-full overflow-hidden rounded-2xl border border-emerald-500/20 bg-black shadow-lg',
        className,
      ].join(' ')}
    >
      <video
        ref={videoRef}
        src="/wizard.mp4"
        className="h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onEnded={() => {
          const el = videoRef.current;
          if (!el) return;
          el.currentTime = 0;
          el.play().catch(() => {});
        }}
        aria-label="Mascotte KentuOS"
      />
    </div>
  );
}

/**
 * Battesimo Nuovo Utente — raccoglie i parametri vitali e scrive profile_targets.
 *
 * @param {{
 *   uid?: string|null,
 *   displayName?: string|null,
 *   initialProfile?: object|null,
 *   initialTargets?: object|null,
 *   isSimulationMode?: boolean,
 *   onCompleted?: (payload: { profile: object, targets: object }) => void,
 * }} props
 */
export default function UserOnboardingWizard({
  uid = null,
  displayName = '',
  initialProfile = null,
  initialTargets = null,
  isSimulationMode = false,
  onCompleted,
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => buildInitialState(initialProfile, displayName));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  /** @type {[null | { bmr: number, tdee: number, kcal: number, prot: number, fat: number, carb: number, water: number, gender: string, age: number, height: number, weight: number, pal: number, goalId: string }, Function]} */
  const [simResult, setSimResult] = useState(null);

  const preview = useMemo(() => {
    const goal = GOAL_OPTIONS.find((g) => g.id === form.goalId) || GOAL_OPTIONS[1];
    return computeOnboardingMacros({
      gender: form.gender,
      age: form.age,
      heightCm: form.height,
      weightKg: form.weight,
      pal: form.pal,
      goalDelta: goal.delta,
    });
  }, [form]);

  const canContinueStep1 =
    (form.gender === 'M' || form.gender === 'F' || form.gender === 'N')
    && form.age >= 15 && form.age <= 99
    && form.height >= 120 && form.height <= 250;

  const canContinueStep2 = form.weight >= 30 && form.weight <= 300;
  const canContinueStep3 = PAL_OPTIONS.some((o) => o.pal === form.pal);
  const canContinueStep4 = GOAL_OPTIONS.some((o) => o.id === form.goalId);

  const selectedGoal = GOAL_OPTIONS.find((g) => g.id === form.goalId) || GOAL_OPTIONS[1];
  const selectedPal = PAL_OPTIONS.find((o) => o.pal === form.pal) || PAL_OPTIONS[1];

  const bumpWeight = (delta) => {
    setForm((prev) => ({
      ...prev,
      weight: clampFloat(Number(prev.weight) + delta, 30, 300, 70),
    }));
  };

  const buildComputedPayload = () => {
    const age = clampInt(form.age, 15, 99, 30);
    const height = clampInt(form.height, 120, 250, 175);
    const weight = clampBodyWeightKg(form.weight) ?? 70;
    const goal = GOAL_OPTIONS.find((g) => g.id === form.goalId) || GOAL_OPTIONS[1];
    const macros = computeOnboardingMacros({
      gender: form.gender,
      age,
      heightCm: height,
      weightKg: weight,
      pal: form.pal,
      goalDelta: goal.delta,
    });
    return { age, height, weight, goal, macros };
  };

  const handleSubmit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const { age, height, weight, goal, macros } = buildComputedPayload();

      if (isSimulationMode) {
        const summary = {
          ...macros,
          gender: form.gender,
          age,
          height,
          weight,
          pal: form.pal,
          goalId: goal.id,
        };
        console.info('[Onboarding][Simulazione] riepilogo motore', summary);
        setSimResult(summary);
        setSaving(false);
        return;
      }

      if (!uid) {
        setError('Sessione non valida. Rieffettua il login.');
        setSaving(false);
        return;
      }

      const existingSnap = await get(ref(db, `users/${uid}/profile_targets`));
      const existing = existingSnap.exists() ? existingSnap.val() : {};
      const prevProfile = existing?.profile && typeof existing.profile === 'object' ? existing.profile : {};
      const prevTargets = existing?.targets && typeof existing.targets === 'object'
        ? existing.targets
        : (initialTargets && typeof initialTargets === 'object' ? initialTargets : {});

      const profile = {
        ...prevProfile,
        displayName: form.displayName || prevProfile.displayName || displayName || '',
        gender: form.gender,
        age,
        height,
        weight,
        activityLevel: String(form.pal),
        nutritionGoal: goal.nutritionGoal,
        goal: goal.goal,
        targetCalories: macros.kcal,
        proteinTarget: macros.prot,
        firstSetupCompleted: true,
        onboardingCompletedAt: new Date().toISOString(),
      };

      const targets = {
        ...prevTargets,
        kcal: macros.kcal,
        prot: macros.prot,
        carb: macros.carb,
        fat: macros.fat,
        fatTotal: macros.fat,
        water: macros.water,
        autoCalculated: true,
        targetHistory: Array.isArray(prevTargets.targetHistory) ? prevTargets.targetHistory : [],
      };

      const payload = { profile, targets };
      await set(ref(db, `users/${uid}/profile_targets`), payload);
      onCompleted?.(payload);
    } catch (err) {
      console.error('[Onboarding] salvataggio fallito', err);
      setError('Salvataggio non riuscito. Controlla la connessione e riprova.');
      setSaving(false);
    }
  };

  const goNext = () => {
    setError(null);
    if (step === 1 && !canContinueStep1) {
      setError('Completa sesso, età (15–99) e altezza (120–250 cm).');
      return;
    }
    if (step === 2 && !canContinueStep2) {
      setError('Inserisci un peso valido tra 30 e 300 kg.');
      return;
    }
    if (step === 3 && !canContinueStep3) {
      setError('Seleziona uno stile di vita.');
      return;
    }
    if (step === 4 && !canContinueStep4) {
      setError('Seleziona un obiettivo.');
      return;
    }
    if (step >= TOTAL_STEPS) {
      void handleSubmit();
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const jumpToStep = (target) => {
    setError(null);
    setStep(Math.min(TOTAL_STEPS, Math.max(1, target)));
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const goHome = () => {
    navigate('/', { replace: true });
  };

  if (isSimulationMode && simResult) {
    const goalLabel = GOAL_OPTIONS.find((g) => g.id === simResult.goalId)?.title ?? simResult.goalId;
    return (
      <div className="fixed inset-0 z-[100050] flex items-center justify-center overflow-y-auto bg-[#0a0d12] px-4 py-8 text-white">
        <div className="w-full max-w-md">
          <div className="mb-4 rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Modalità Simulazione — dati non salvati su Firebase.
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.35)]">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-cyan-400/80">
              Riepilogo motore
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">Calcolo completato</h2>
            <dl className="mt-5 space-y-2.5 text-sm">
              <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
                <dt className="text-zinc-500">BMR</dt>
                <dd className="font-medium text-zinc-100">{Math.round(simResult.bmr)} kcal</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
                <dt className="text-zinc-500">TDEE</dt>
                <dd className="font-medium text-zinc-100">{Math.round(simResult.tdee)} kcal</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
                <dt className="text-zinc-500">Kcal obiettivo</dt>
                <dd className="font-medium text-cyan-200">{simResult.kcal} kcal</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
                <dt className="text-zinc-500">Proteine</dt>
                <dd className="font-medium text-zinc-100">{simResult.prot} g</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
                <dt className="text-zinc-500">Carboidrati</dt>
                <dd className="font-medium text-zinc-100">{simResult.carb} g</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
                <dt className="text-zinc-500">Grassi</dt>
                <dd className="font-medium text-zinc-100">{simResult.fat} g</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Direttiva</dt>
                <dd className="font-medium text-zinc-100">{goalLabel}</dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setSimResult(null);
                  setStep(1);
                }}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-zinc-200 hover:border-white/25"
              >
                Ripeti simulazione
              </button>
              <button
                type="button"
                onClick={goHome}
                className="rounded-xl border border-cyan-400/40 bg-cyan-400/15 px-5 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/25"
              >
                Torna alla Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100050] flex items-center justify-center overflow-y-auto bg-[#0a0d12] px-4 py-8 text-white">
      <div className="w-full max-w-md">
        {isSimulationMode ? (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <span>Modalità Simulazione — dati non salvati su Firebase.</span>
            <button
              type="button"
              onClick={goHome}
              className="shrink-0 text-xs font-semibold uppercase tracking-wide text-amber-50/90 underline-offset-2 hover:underline"
            >
              Home
            </button>
          </div>
        ) : null}

        <header className="mb-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-cyan-400/80">
            KentuOS · Battesimo{isSimulationMode ? ' · Preview' : ''}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
            Configura il motore metabolico
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-gray-400">
            Cinque passaggi per calibrare BMR, TDEE e macro senza fallback generici.
          </p>
        </header>

        <StepDots step={step} />

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 shadow-[0_24px_64px_rgba(0,0,0,0.35)] sm:p-5">
          <MascotLoopVideo className="mb-4" />
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <FieldLabel>Sesso</FieldLabel>
                <div className="flex gap-2">
                  <PillButton
                    className="flex-1"
                    selected={form.gender === 'M'}
                    onClick={() => setForm((p) => ({ ...p, gender: 'M' }))}
                  >
                    M
                  </PillButton>
                  <PillButton
                    className="flex-1"
                    selected={form.gender === 'F'}
                    onClick={() => setForm((p) => ({ ...p, gender: 'F' }))}
                  >
                    F
                  </PillButton>
                </div>
                <PillButton
                  className="mt-2 w-full"
                  selected={form.gender === 'N'}
                  onClick={() => setForm((p) => ({ ...p, gender: 'N' }))}
                >
                  Preferisco non specificare
                </PillButton>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  Parametro fisiologico per il calcolo del metabolismo basale (BMR).
                </p>
              </div>

              <div>
                <FieldLabel>Età</FieldLabel>
                <input
                  type="number"
                  inputMode="numeric"
                  min={15}
                  max={99}
                  value={form.age}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    if (!Number.isFinite(n)) return;
                    setForm((p) => ({ ...p, age: n }));
                  }}
                  onBlur={() => {
                    setForm((p) => ({ ...p, age: clampInt(p.age, 15, 99, 30) }));
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                />
              </div>

              <div>
                <FieldLabel>Altezza (cm)</FieldLabel>
                <input
                  type="number"
                  inputMode="numeric"
                  min={120}
                  max={250}
                  value={form.height}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    if (!Number.isFinite(n)) return;
                    setForm((p) => ({ ...p, height: n }));
                  }}
                  onBlur={() => {
                    setForm((p) => ({ ...p, height: clampInt(p.height, 120, 250, 175) }));
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-cyan-400/50"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <FieldLabel>Peso attuale (kg)</FieldLabel>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => bumpWeight(-0.5)}
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xl text-white hover:border-white/25"
                  aria-label="Diminuisci peso"
                >
                  −
                </button>
                <input
                  type="number"
                  inputMode="decimal"
                  min={BODY_WEIGHT_KG_MIN}
                  max={BODY_WEIGHT_KG_MAX}
                  step={0.1}
                  value={form.weight}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '' || raw === '.' || raw === '-') return;
                    const n = Number.parseFloat(String(raw).replace(',', '.'));
                    if (!Number.isFinite(n)) return;
                    setForm((p) => ({ ...p, weight: n }));
                  }}
                  onBlur={() => {
                    setForm((p) => ({
                      ...p,
                      weight: clampBodyWeightKg(p.weight) ?? 70,
                    }));
                  }}
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center text-2xl font-semibold text-white outline-none focus:border-cyan-400/50"
                />
                <button
                  type="button"
                  onClick={() => bumpWeight(0.5)}
                  className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-xl text-white hover:border-white/25"
                  aria-label="Aumenta peso"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-zinc-500">Range operativo 30–300 kg. Suggerito di partenza: 70 kg.</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <FieldLabel>Stile di vita (PAL)</FieldLabel>
              {PAL_OPTIONS.map((opt) => (
                <OptionCard
                  key={opt.id}
                  selected={form.pal === opt.pal}
                  onClick={() => setForm((p) => ({ ...p, pal: opt.pal }))}
                  title={opt.title}
                  subtitle={opt.subtitle}
                  description={opt.description}
                />
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <FieldLabel>Direttiva primaria</FieldLabel>
              {GOAL_OPTIONS.map((opt) => (
                <OptionCard
                  key={opt.id}
                  selected={form.goalId === opt.id}
                  onClick={() => setForm((p) => ({ ...p, goalId: opt.id }))}
                  title={opt.title}
                  subtitle={opt.subtitle}
                />
              ))}
              <div className="mt-4 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs text-zinc-400">
                <p className="font-semibold uppercase tracking-[0.14em] text-zinc-500">Anteprima motore</p>
                <p className="mt-2 text-zinc-300">
                  ~{Math.round(preview.kcal)} kcal · P {preview.prot}g · C {preview.carb}g · F {preview.fat}g
                </p>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <div>
                <FieldLabel>Riepilogo & conferma</FieldLabel>
                <p className="mb-3 text-xs leading-relaxed text-zinc-500">
                  Controlla i dati. Tocca una riga o «Modifica» per correggere prima di attivare il motore.
                </p>
              </div>

              <SummaryEditRow
                label="Sesso"
                value={genderLabel(form.gender)}
                onEdit={() => jumpToStep(1)}
              />
              <SummaryEditRow
                label="Età"
                value={`${form.age} anni`}
                onEdit={() => jumpToStep(1)}
              />
              <SummaryEditRow
                label="Altezza"
                value={`${form.height} cm`}
                onEdit={() => jumpToStep(1)}
              />
              <SummaryEditRow
                label="Peso"
                value={`${form.weight} kg`}
                onEdit={() => jumpToStep(2)}
              />
              <SummaryEditRow
                label="Stile di vita (PAL)"
                value={`${selectedPal.title} · ${selectedPal.subtitle}`}
                onEdit={() => jumpToStep(3)}
              />
              <SummaryEditRow
                label="Obiettivo"
                value={`${selectedGoal.title} (${selectedGoal.subtitle})`}
                onEdit={() => jumpToStep(4)}
              />

              <div className="mt-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-emerald-400/80">
                  Anteprima metabolica
                </p>
                <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-zinc-500">BMR stimato</dt>
                    <dd className="font-medium text-zinc-100">{Math.round(preview.bmr)} kcal</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">TDEE</dt>
                    <dd className="font-medium text-zinc-100">{Math.round(preview.tdee)} kcal</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Kcal target</dt>
                    <dd className="font-medium text-cyan-200">{preview.kcal} kcal</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-500">Proteine</dt>
                    <dd className="font-medium text-zinc-100">{preview.prot} g</dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-zinc-500">
                  C {preview.carb}g · F {preview.fat}g · acqua ~{preview.water} ml
                </p>
              </div>
            </div>
          )}

          {error ? (
            <p className="mt-4 text-sm text-rose-300" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={goBack}
                disabled={saving}
                className="rounded-xl border border-white/10 bg-transparent px-4 py-3 text-sm font-medium text-zinc-300 hover:border-white/25 disabled:opacity-50"
              >
                Indietro
              </button>
            ) : isSimulationMode ? (
              <button
                type="button"
                onClick={goHome}
                className="rounded-xl border border-white/10 bg-transparent px-4 py-3 text-sm font-medium text-zinc-300 hover:border-white/25"
              >
                Torna alla Home
              </button>
            ) : (
              <div className="flex-1" />
            )}
            <button
              type="button"
              onClick={goNext}
              disabled={saving || (step === 1 && !canContinueStep1) || (step === 2 && !canContinueStep2)}
              className="ml-auto min-w-[8.5rem] rounded-xl border border-cyan-400/40 bg-cyan-400/15 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-50"
            >
              {saving
                ? (isSimulationMode ? 'Calcolo…' : 'Salvataggio…')
                : step === TOTAL_STEPS
                  ? (isSimulationMode ? 'Simula motore' : 'Attiva KentuOS')
                  : step === 4
                    ? 'Vai al riepilogo'
                    : 'Continua'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
