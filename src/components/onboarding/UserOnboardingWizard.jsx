import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { get, ref, set } from 'firebase/database';
import {
  Dumbbell,
  Footprints,
  Scale,
  Sofa,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { db } from '../../firebaseConfig';
import { BODY_WEIGHT_KG_MAX, BODY_WEIGHT_KG_MIN, clampBodyWeightKg } from '../../utils/inputSanity';
import { calculateAge } from '../../utils/profileAge';

const TOTAL_STEPS = 5;
const PUBLIC_BASE = String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
const PARTY_VIDEO_SRC = `${PUBLIC_BASE}party.mp4`;
const PARTY_CLIP_END_SEC = 8.5;
const DEFAULT_DISPLAY_NAME = 'Campione';

function resolveUserDisplayName(raw, fallback = '') {
  const primary = String(raw ?? '').trim();
  if (primary) return primary;
  const secondary = String(fallback ?? '').trim();
  if (secondary) return secondary;
  return DEFAULT_DISPLAY_NAME;
}

/** Declinazione di benvenuto: M → Benvenuto, F → Benvenuta, N/altro → Benvenut·e. */
function getWelcomeWord(gender) {
  const g = normalizeGender(gender);
  if (g === 'F') return 'Benvenuta';
  if (g === 'N') return 'Benvenut·e';
  return 'Benvenuto';
}

const PAL_OPTIONS = [
  {
    id: '1.2',
    pal: 1.2,
    title: 'Base di ricarica',
    description: 'Lavoro da scrivania, poca attività strutturata.',
    Icon: Sofa,
  },
  {
    id: '1.4',
    pal: 1.4,
    title: 'Operativo',
    description: 'Camminate regolari o 2–3 sessioni di allenamento.',
    Icon: Footprints,
  },
  {
    id: '1.6',
    pal: 1.6,
    title: 'Assalto',
    description: 'Allenamento frequente o lavoro fisico intenso.',
    Icon: Zap,
  },
];

const GOAL_OPTIONS = [
  {
    id: 'cut',
    title: 'Perdita di peso / Definizione',
    delta: -300,
    nutritionGoal: 'cut',
    goal: 'lose',
    Icon: TrendingDown,
  },
  {
    id: 'maintain',
    title: 'Mantenimento / Ricomposizione',
    delta: 0,
    nutritionGoal: 'maintain',
    goal: 'maintain',
    Icon: Scale,
  },
  {
    id: 'bulk',
    title: 'Aumento massa / Forza',
    delta: 250,
    nutritionGoal: 'bulk',
    goal: 'gain',
    Icon: Dumbbell,
  },
];

function clampFloat(value, min, max, fallback) {
  const n = Number.parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseOptionalInt(value, min, max) {
  if (value === '' || value == null) return null;
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function parseOptionalFloat(value, min, max) {
  if (value === '' || value == null) return null;
  const n = Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function isGenderSelected(gender) {
  return gender === 'M' || gender === 'F' || gender === 'N';
}

/** Limiti input date: età operativa 15–99 anni. */
function getBirthDateInputBounds() {
  const today = new Date();
  const max = new Date(today.getFullYear() - 15, today.getMonth(), today.getDate());
  const min = new Date(today.getFullYear() - 99, today.getMonth(), today.getDate());
  const toIsoDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { min: toIsoDate(min), max: toIsoDate(max) };
}

/** Età valida (15–99) da YYYY-MM-DD, altrimenti null. */
function parseAgeFromBirthDate(birthDate) {
  const raw = String(birthDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const age = calculateAge(raw);
  if (age == null || age < 15 || age > 99) return null;
  return age;
}

function formatBirthDateLabel(birthDate) {
  const raw = String(birthDate ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split('-');
  return `${d}/${m}/${y}`;
}

function normalizeGender(raw) {
  const g = String(raw ?? '').trim().toUpperCase();
  if (!g) return '';
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
  if (g === 'M' || g === 'MALE' || g === 'UOMO') return 'M';
  return '';
}

function genderLabel(gender) {
  if (gender === 'F') return 'Femmina';
  if (gender === 'N') return 'Neutro / Non specificato';
  if (gender === 'M') return 'Maschio';
  return '—';
}

/** Offset Mifflin–St Jeor: M +5, F −161, N media (−78). */
function mifflinGenderOffset(gender) {
  if (gender === 'F') return -161;
  if (gender === 'N') return -78;
  return 5;
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

/** Stato iniziale vuoto: nessun default pre-valorizzato. */
function buildInitialState() {
  return {
    gender: '',
    birthDate: '',
    height: '',
    weight: '',
    pal: null,
    goalId: '',
    displayName: '',
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

/** Domanda colloquiale per step a scelta (PAL / obiettivo). */
function QuestionLabel({ children }) {
  return (
    <p className="mb-1.5 text-base font-semibold leading-snug text-zinc-100">
      {children}
    </p>
  );
}

function CheckIcon({ className = '' }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden
      className={className}
    >
      <circle cx="10" cy="10" r="9" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6.2 10.2 8.7 12.7 13.8 7.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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

function OptionCard({ selected, onClick, title, description, Icon = null }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={[
        'w-full rounded-xl border px-4 py-3.5 text-left transition duration-200',
        selected
          ? 'border-cyan-400 bg-cyan-400/10 opacity-100 ring-2 ring-cyan-400/70 shadow-[0_0_24px_rgba(34,211,238,0.18)]'
          : 'border-white/10 bg-white/[0.03] opacity-60 hover:border-white/20 hover:opacity-80',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <span
            aria-hidden
            className={[
              'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition',
              selected
                ? 'border-cyan-400/55 bg-cyan-400/15 text-cyan-200'
                : 'border-white/10 bg-black/40 text-zinc-400',
            ].join(' ')}
          >
            <Icon className="h-5 w-5" strokeWidth={1.9} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{title}</p>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">{description}</p>
          ) : null}
        </div>
        {selected ? (
          <CheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
        ) : (
          <span
            aria-hidden
            className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-white/20"
          />
        )}
      </div>
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
 * Video celebrativo party.mp4 — una sola riproduzione automatica + replay manuale.
 */
function PartyCelebrationVideo() {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    video.muted = true;
    video.defaultMuted = true;
    video.setAttribute('muted', '');
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');

    let autoStarted = false;
    const tryPlayOnce = () => {
      if (autoStarted) return;
      autoStarted = true;
      try {
        video.currentTime = 0;
      } catch (_) {
        /* ignore */
      }
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch((err) => {
          console.warn('Video playback blocked, retrying...', err);
          autoStarted = false;
          window.setTimeout(() => {
            if (autoStarted) return;
            autoStarted = true;
            video.play().catch(() => {});
          }, 100);
        });
      }
    };

    tryPlayOnce();

    const onCanPlay = () => tryPlayOnce();
    const onLoadedData = () => tryPlayOnce();
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('loadeddata', onLoadedData);
    const retryTimer = window.setTimeout(() => tryPlayOnce(), 250);

    return () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('loadeddata', onLoadedData);
      window.clearTimeout(retryTimer);
      try {
        video.pause();
      } catch (_) {
        /* ignore */
      }
    };
  }, []);

  const replay = () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = 0;
    } catch (_) {
      /* ignore */
    }
    video.play().catch(() => {});
  };

  const handleTimeUpdate = (e) => {
    const video = e.target;
    if (video.currentTime >= PARTY_CLIP_END_SEC) {
      video.pause();
      try {
        video.currentTime = PARTY_CLIP_END_SEC;
      } catch (_) {
        /* ignore */
      }
    }
  };

  return (
    <div className="mb-6 flex flex-col items-center">
      <video
        ref={videoRef}
        src={PARTY_VIDEO_SRC}
        autoPlay
        muted
        playsInline
        preload="auto"
        onTimeUpdate={handleTimeUpdate}
        className="w-full max-w-sm rounded-2xl border-2 border-emerald-500/50 object-cover shadow-2xl"
        aria-label="Celebrazione configurazione completata"
      />
      <button
        type="button"
        onClick={replay}
        className="mt-3 flex items-center gap-2 text-sm text-emerald-400 transition-colors hover:text-emerald-300"
      >
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
          <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.373 15.201A7.003 7.003 0 0015.001 15H13a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 011.885-.666z" />
        </svg>
        Ripeti animazione
      </button>
    </div>
  );
}

function MacroSummaryCard({ summary, goalLabel }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left sm:p-5">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-cyan-400/80">
        Riepilogo motore
      </p>
      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
          <dt className="text-zinc-500">BMR</dt>
          <dd className="font-medium text-zinc-100">{Math.round(summary.bmr)} kcal</dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
          <dt className="text-zinc-500">TDEE</dt>
          <dd className="font-medium text-zinc-100">{Math.round(summary.tdee)} kcal</dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
          <dt className="text-zinc-500">Kcal obiettivo</dt>
          <dd className="font-medium text-cyan-200">{summary.kcal} kcal</dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
          <dt className="text-zinc-500">Proteine</dt>
          <dd className="font-medium text-zinc-100">{summary.prot} g</dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
          <dt className="text-zinc-500">Carboidrati</dt>
          <dd className="font-medium text-zinc-100">{summary.carb} g</dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-white/5 pb-2">
          <dt className="text-zinc-500">Grassi</dt>
          <dd className="font-medium text-zinc-100">{summary.fat} g</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Obiettivo</dt>
          <dd className="font-medium text-zinc-100">{goalLabel}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Schermata finale: party → benvenuto personalizzato → riepilogo → CTA.
 */
function OnboardingFinaleScreen({
  userName,
  gender = 'M',
  summary,
  goalLabel,
  isSimulationMode = false,
  primaryLabel = 'Inizia ora',
  onPrimary,
  onSecondary = null,
  secondaryLabel = 'Ripeti simulazione',
}) {
  const name = resolveUserDisplayName(userName);
  const welcomeWord = getWelcomeWord(gender ?? summary?.gender);

  return (
    <div className="fixed inset-0 z-[100050] flex items-center justify-center overflow-y-auto bg-[#0a0d12] px-4 py-8 text-white">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      >
        {isSimulationMode ? (
          <div className="mb-4 rounded-xl border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Modalità Simulazione — dati non salvati su Firebase.
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.35)]">
          <p className="mb-4 text-center text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-emerald-400/80">
            KentuOS · Battesimo
          </p>

          <PartyCelebrationVideo />

          <h2 className="mb-6 text-center text-xl font-bold text-white">
            {welcomeWord} in KentuOS,{' '}
            <span className="text-emerald-400">{name}</span>
            ! Il tuo motore è pronto.
          </h2>

          <MacroSummaryCard summary={summary} goalLabel={goalLabel} />

          <div className="mt-6 flex flex-col gap-2">
            {typeof onSecondary === 'function' ? (
              <button
                type="button"
                onClick={onSecondary}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-medium text-zinc-200 hover:border-white/25"
              >
                {secondaryLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onPrimary}
              className="rounded-xl border border-emerald-400/45 bg-emerald-400/15 px-5 py-3.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/25"
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </motion.div>
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
  const [form, setForm] = useState(() => buildInitialState());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  /** True dopo un tentativo di avanzare con campi incompleti. */
  const [showStepHints, setShowStepHints] = useState(false);
  /** Payload Firebase pronto: mostra party screen prima di smontare il wizard. */
  const [completedPayload, setCompletedPayload] = useState(null);
  /** @type {[null | { bmr: number, tdee: number, kcal: number, prot: number, fat: number, carb: number, water: number, gender: string, age: number, height: number, weight: number, pal: number, goalId: string }, Function]} */
  const [simResult, setSimResult] = useState(null);

  const parsedAge = parseAgeFromBirthDate(form.birthDate);
  const parsedHeight = parseOptionalInt(form.height, 120, 250);
  const parsedWeight = parseOptionalFloat(form.weight, BODY_WEIGHT_KG_MIN, BODY_WEIGHT_KG_MAX);
  const nameFilled = String(form.displayName ?? '').trim().length > 0;
  const birthDateBounds = useMemo(() => getBirthDateInputBounds(), []);

  const canContinueStep1 =
    nameFilled
    && isGenderSelected(form.gender)
    && parsedAge != null
    && parsedHeight != null;

  const canContinueStep2 = parsedWeight != null;
  const canContinueStep3 = form.pal != null && PAL_OPTIONS.some((o) => o.pal === form.pal);
  const canContinueStep4 = Boolean(form.goalId) && GOAL_OPTIONS.some((o) => o.id === form.goalId);
  const canContinueStep5 =
    canContinueStep1 && canContinueStep2 && canContinueStep3 && canContinueStep4;

  const canContinueCurrent =
    step === 1 ? canContinueStep1
      : step === 2 ? canContinueStep2
        : step === 3 ? canContinueStep3
          : step === 4 ? canContinueStep4
            : canContinueStep5;

  const selectedGoal = GOAL_OPTIONS.find((g) => g.id === form.goalId) || null;
  const selectedPal = PAL_OPTIONS.find((o) => o.pal === form.pal) || null;

  const preview = useMemo(() => {
    if (
      !isGenderSelected(form.gender)
      || parsedAge == null
      || parsedHeight == null
      || parsedWeight == null
      || form.pal == null
      || !selectedGoal
    ) {
      return null;
    }
    return computeOnboardingMacros({
      gender: form.gender,
      age: parsedAge,
      heightCm: parsedHeight,
      weightKg: parsedWeight,
      pal: form.pal,
      goalDelta: selectedGoal.delta,
    });
  }, [form.gender, form.pal, parsedAge, parsedHeight, parsedWeight, selectedGoal]);

  const resolvedDisplayName = nameFilled
    ? String(form.displayName).trim()
    : '';

  const stepHintMessage =
    step === 1
      ? 'Compila nome, sesso, data di nascita e altezza (120–250 cm).'
      : step === 2
        ? 'Inserisci un peso valido tra 30 e 300 kg.'
        : step === 3
          ? 'Dimmi quanto ti muovi durante il giorno.'
          : step === 4
            ? 'Scegli il tuo obiettivo.'
            : 'Completa tutti i parametri vitali prima di procedere.';

  const bumpWeight = (delta) => {
    setForm((prev) => {
      const current = parseOptionalFloat(prev.weight, BODY_WEIGHT_KG_MIN, BODY_WEIGHT_KG_MAX);
      if (current == null) {
        return { ...prev, weight: delta > 0 ? BODY_WEIGHT_KG_MIN : '' };
      }
      return {
        ...prev,
        weight: clampFloat(current + delta, BODY_WEIGHT_KG_MIN, BODY_WEIGHT_KG_MAX, current),
      };
    });
  };

  const buildComputedPayload = () => {
    if (!canContinueStep5 || !selectedGoal) return null;
    const age = parsedAge;
    const height = parsedHeight;
    const weight = clampBodyWeightKg(parsedWeight);
    if (age == null || height == null || weight == null) return null;
    const macros = computeOnboardingMacros({
      gender: form.gender,
      age,
      heightCm: height,
      weightKg: weight,
      pal: form.pal,
      goalDelta: selectedGoal.delta,
    });
    return { age, height, weight, goal: selectedGoal, macros, birthDate: String(form.birthDate).trim() };
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!canContinueStep5) {
      setShowStepHints(true);
      setError('Completa sesso, data di nascita, altezza, peso, attività e obiettivo prima del calcolo.');
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const computed = buildComputedPayload();
      if (!computed) {
        setError('Parametri vitali incompleti: impossibile avviare il calcolo.');
        setSaving(false);
        return;
      }
      const { age, height, weight, goal, macros, birthDate } = computed;
      const userName = String(form.displayName ?? '').trim() || DEFAULT_DISPLAY_NAME;

      if (isSimulationMode) {
        const summary = {
          ...macros,
          gender: form.gender,
          age,
          birthDate,
          height,
          weight,
          pal: form.pal,
          goalId: goal.id,
          displayName: userName,
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
        displayName: userName,
        name: userName,
        gender: form.gender,
        birthDate,
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

      const payload = {
        profile,
        targets,
        summary: {
          ...macros,
          gender: form.gender,
          goalId: goal.id,
          displayName: userName,
        },
      };
      await set(ref(db, `users/${uid}/profile_targets`), {
        profile,
        targets,
      });
      // Non chiamare onCompleted qui: App smonterebbe il wizard prima del party.
      setCompletedPayload(payload);
      setSaving(false);
    } catch (err) {
      console.error('[Onboarding] salvataggio fallito', err);
      setError('Salvataggio non riuscito. Controlla la connessione e riprova.');
      setSaving(false);
    }
  };

  const handleStartNow = () => {
    if (completedPayload) {
      onCompleted?.({
        profile: completedPayload.profile,
        targets: completedPayload.targets,
      });
    }
    navigate('/', { replace: true });
  };

  const goNext = () => {
    if (!canContinueCurrent) {
      setShowStepHints(true);
      setError(stepHintMessage);
      return;
    }
    setError(null);
    setShowStepHints(false);
    if (step >= TOTAL_STEPS) {
      void handleSubmit();
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const jumpToStep = (target) => {
    setError(null);
    setShowStepHints(false);
    setStep(Math.min(TOTAL_STEPS, Math.max(1, target)));
  };

  const goBack = () => {
    setError(null);
    setShowStepHints(false);
    setStep((s) => Math.max(1, s - 1));
  };

  const goHome = () => {
    navigate('/', { replace: true });
  };

  useEffect(() => {
    if (canContinueCurrent) {
      setShowStepHints(false);
      setError((prev) => (prev === stepHintMessage ? null : prev));
    }
  }, [canContinueCurrent, stepHintMessage]);

  const fieldInvalidClass = (invalid) =>
    showStepHints && invalid
      ? 'border-rose-400/60 focus:border-rose-400/70'
      : 'border-white/10 focus:border-cyan-400/50';

  const genderInvalid = showStepHints && !isGenderSelected(form.gender);
  const nameInvalid = showStepHints && !nameFilled;
  const ageInvalid = showStepHints && parsedAge == null;
  const heightInvalid = showStepHints && parsedHeight == null;
  const weightInvalid = showStepHints && parsedWeight == null;

  if (completedPayload?.summary) {
    const goalLabel = GOAL_OPTIONS.find((g) => g.id === completedPayload.summary.goalId)?.title
      ?? completedPayload.summary.goalId;
    return (
      <OnboardingFinaleScreen
        userName={completedPayload.summary.displayName || resolvedDisplayName}
        gender={completedPayload.summary.gender || form.gender}
        summary={completedPayload.summary}
        goalLabel={goalLabel}
        primaryLabel="Inizia ora"
        onPrimary={handleStartNow}
      />
    );
  }

  if (isSimulationMode && simResult) {
    const goalLabel = GOAL_OPTIONS.find((g) => g.id === simResult.goalId)?.title ?? simResult.goalId;
    return (
      <OnboardingFinaleScreen
        userName={simResult.displayName || resolvedDisplayName}
        gender={simResult.gender || form.gender}
        summary={simResult}
        goalLabel={goalLabel}
        isSimulationMode
        primaryLabel="Torna alla Home"
        onPrimary={goHome}
        secondaryLabel="Ripeti simulazione"
        onSecondary={() => {
          setSimResult(null);
          setStep(1);
        }}
      />
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
                <FieldLabel>Nome</FieldLabel>
                <input
                  type="text"
                  autoComplete="given-name"
                  placeholder="Il tuo nome"
                  value={form.displayName}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, displayName: e.target.value }));
                  }}
                  onBlur={() => {
                    setForm((p) => ({
                      ...p,
                      displayName: String(p.displayName ?? '').trim(),
                    }));
                  }}
                  className={[
                    'w-full rounded-xl bg-black/30 px-4 py-3 text-white outline-none placeholder:text-zinc-600 border',
                    fieldInvalidClass(nameInvalid),
                  ].join(' ')}
                  aria-invalid={nameInvalid}
                />
              </div>

              <div>
                <FieldLabel>Sesso</FieldLabel>
                <div
                  className={[
                    'rounded-2xl p-0.5',
                    genderInvalid ? 'ring-2 ring-rose-400/50' : '',
                  ].join(' ')}
                >
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
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  Parametro fisiologico per il calcolo del metabolismo basale (BMR).
                </p>
              </div>

              <div>
                <FieldLabel>Data di nascita</FieldLabel>
                <input
                  type="date"
                  value={form.birthDate}
                  min={birthDateBounds.min}
                  max={birthDateBounds.max}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, birthDate: e.target.value || '' }));
                  }}
                  className={[
                    'w-full rounded-xl bg-black/30 px-4 py-3 text-white outline-none placeholder:text-zinc-600 border [color-scheme:dark]',
                    fieldInvalidClass(ageInvalid),
                  ].join(' ')}
                  aria-invalid={ageInvalid}
                />
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  {parsedAge != null
                    ? `Età calcolata: ${parsedAge} anni (usata per BMR/TDEE).`
                    : 'Inserisci la data di nascita (età operativa 15–99 anni).'}
                </p>
              </div>

              <div>
                <FieldLabel>Altezza (cm)</FieldLabel>
                <input
                  type="number"
                  inputMode="numeric"
                  min={120}
                  max={250}
                  placeholder="Es. 175"
                  value={form.height}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setForm((p) => ({ ...p, height: '' }));
                      return;
                    }
                    const n = Number.parseInt(raw, 10);
                    if (!Number.isFinite(n)) return;
                    setForm((p) => ({ ...p, height: n }));
                  }}
                  onBlur={() => {
                    setForm((p) => {
                      if (p.height === '' || p.height == null) return p;
                      const n = parseOptionalInt(p.height, 120, 250);
                      return { ...p, height: n == null ? '' : n };
                    });
                  }}
                  className={[
                    'w-full rounded-xl bg-black/30 px-4 py-3 text-white outline-none placeholder:text-zinc-600 border',
                    fieldInvalidClass(heightInvalid),
                  ].join(' ')}
                  aria-invalid={heightInvalid}
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
                  placeholder="—"
                  value={form.weight}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '' || raw === '.' || raw === '-') {
                      setForm((p) => ({ ...p, weight: raw === '.' || raw === '-' ? raw : '' }));
                      return;
                    }
                    const n = Number.parseFloat(String(raw).replace(',', '.'));
                    if (!Number.isFinite(n)) return;
                    setForm((p) => ({ ...p, weight: n }));
                  }}
                  onBlur={() => {
                    setForm((p) => {
                      if (p.weight === '' || p.weight == null || p.weight === '.' || p.weight === '-') {
                        return { ...p, weight: '' };
                      }
                      const clamped = clampBodyWeightKg(p.weight);
                      return { ...p, weight: clamped == null ? '' : clamped };
                    });
                  }}
                  className={[
                    'min-w-0 flex-1 rounded-xl bg-black/30 px-4 py-3 text-center text-2xl font-semibold text-white outline-none placeholder:text-zinc-600 border',
                    fieldInvalidClass(weightInvalid),
                  ].join(' ')}
                  aria-invalid={weightInvalid}
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
              <p className="text-xs text-zinc-500">Range operativo 30–300 kg.</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3" role="radiogroup" aria-label="Quanto ti muovi durante il giorno?">
              <QuestionLabel>Quanto ti muovi durante il giorno?</QuestionLabel>
              {showStepHints && !canContinueStep3 ? (
                <p className="text-xs text-rose-300">Seleziona un&apos;opzione per continuare.</p>
              ) : null}
              {PAL_OPTIONS.map((opt) => (
                <OptionCard
                  key={opt.id}
                  selected={form.pal === opt.pal}
                  onClick={() => setForm((p) => ({ ...p, pal: opt.pal }))}
                  title={opt.title}
                  description={opt.description}
                  Icon={opt.Icon}
                />
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3" role="radiogroup" aria-label="Qual è il tuo obiettivo?">
              <QuestionLabel>Qual è il tuo obiettivo?</QuestionLabel>
              {showStepHints && !canContinueStep4 ? (
                <p className="text-xs text-rose-300">Seleziona un obiettivo per continuare.</p>
              ) : null}
              {GOAL_OPTIONS.map((opt) => (
                <OptionCard
                  key={opt.id}
                  selected={form.goalId === opt.id}
                  onClick={() => setForm((p) => ({ ...p, goalId: opt.id }))}
                  title={opt.title}
                  Icon={opt.Icon}
                />
              ))}
              {preview ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs text-zinc-400">
                  <p className="font-semibold uppercase tracking-[0.14em] text-zinc-500">Anteprima motore</p>
                  <p className="mt-2 text-zinc-300">
                    ~{Math.round(preview.kcal)} kcal · P {preview.prot}g · C {preview.carb}g · F {preview.fat}g
                  </p>
                </div>
              ) : null}
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
                label="Nome"
                value={resolvedDisplayName || '—'}
                onEdit={() => jumpToStep(1)}
              />
              <SummaryEditRow
                label="Sesso"
                value={genderLabel(form.gender)}
                onEdit={() => jumpToStep(1)}
              />
              <SummaryEditRow
                label="Data di nascita"
                value={
                  parsedAge != null && form.birthDate
                    ? `${formatBirthDateLabel(form.birthDate)} · ${parsedAge} anni`
                    : '—'
                }
                onEdit={() => jumpToStep(1)}
              />
              <SummaryEditRow
                label="Altezza"
                value={parsedHeight != null ? `${parsedHeight} cm` : '—'}
                onEdit={() => jumpToStep(1)}
              />
              <SummaryEditRow
                label="Peso"
                value={parsedWeight != null ? `${parsedWeight} kg` : '—'}
                onEdit={() => jumpToStep(2)}
              />
              <SummaryEditRow
                label="Quanto ti muovi"
                value={selectedPal ? selectedPal.title : '—'}
                onEdit={() => jumpToStep(3)}
              />
              <SummaryEditRow
                label="Obiettivo"
                value={selectedGoal ? selectedGoal.title : '—'}
                onEdit={() => jumpToStep(4)}
              />

              {preview ? (
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
              ) : (
                <p className="text-sm text-amber-200/90" role="status">
                  Completa tutti i campi obbligatori per vedere l&apos;anteprima e attivare il motore.
                </p>
              )}
            </div>
          )}

          {error ? (
            <p className="mt-4 text-sm text-rose-300" role="alert">
              {error}
            </p>
          ) : !canContinueCurrent && !saving ? (
            <p className="mt-4 text-sm text-amber-200/90" role="status">
              {stepHintMessage}
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
            <div
              className="ml-auto inline-flex min-w-[8.5rem]"
              onClick={() => {
                if (saving) return;
                if (!canContinueCurrent) {
                  setShowStepHints(true);
                  setError(stepHintMessage);
                }
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goNext();
                }}
                disabled={saving || !canContinueCurrent}
                aria-disabled={saving || !canContinueCurrent}
                className="w-full rounded-xl border border-cyan-400/40 bg-cyan-400/15 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/25 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
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
    </div>
  );
}
