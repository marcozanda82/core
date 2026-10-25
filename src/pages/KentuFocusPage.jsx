import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Dumbbell, Moon, Sparkles, Utensils } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ref, set, get } from 'firebase/database';
import { db } from '../firebaseConfig.js';
import {
  FOCUS_PRODUCT_DEMO_BANNER,
  FOCUS_PRODUCT_PERIODS,
  peekFocusDiaryForUser,
  handoffBelongsToUser,
  clearFocusDiaryForUser,
  requestFocusAiCoachAnalysis,
  buildFocusAiCoachDossier,
  peekFocusAiCoachMemory,
  focusAiCoachCacheKey,
  loadFocusAiAnalysisFromStore,
  listFocusAiAnalysisHistory,
  createFirebaseFocusAiAnalysisStore,
  getDefaultMemoryFocusAiAnalysisStore,
  normalizeFocusEditorialAnalysis,
  buildFocusKentuDeepLinks,
  buildFocusEditorialMockAnalysis,
  loadFocusAuthenticatedDiary,
  resolveFocusEvidenceRefs,
  buildFocusAiAnalysisRecord,
  buildFocusSavedEvidenceHarnessAnalysis,
  FOCUS_SAVED_EVIDENCE_HARNESS_REVISION_ID,
  FOCUS_SAVED_EVIDENCE_HARNESS_GENERATED_AT,
  __resetFocusAiAnalysisPersistenceForTests,
} from '../features/kentuFocus/product/index.js';
import {
  FOCUS_PAGE_MODE,
  formatNutritionVerifyLabel,
  loadFocusPageDemoEditionIfAllowed,
  resolveFocusPageSession,
} from '../features/kentuFocus/product/buildFocusPageSession.js';
import { addCalendarDays } from '../features/kentuFocus/normalize/focusDateUtils.js';
import { focusLocalIsoDate } from '../features/kentuFocus/product/loadFocusAuthenticatedDiary.js';
import './kentuFocusPage.css';

function resolveFocusAiPersistence(options = {}) {
  // Harness / test: memoria di sessione — nessuna write Firebase produzione.
  if (options.forceMemory) return getDefaultMemoryFocusAiAnalysisStore();
  try {
    if (db) return createFirebaseFocusAiAnalysisStore({ db, ref, set, get });
  } catch {
    /* fallback memory */
  }
  return getDefaultMemoryFocusAiAnalysisStore();
}

/** Provider askAI iniettabile (test/harness). Mai Gemini reale se impostato. */
function resolveFocusAskAiFn() {
  if (typeof window === 'undefined') return undefined;
  if (typeof window.__KENTU_FOCUS_ASK_AI__ === 'function') {
    return window.__KENTU_FOCUS_ASK_AI__;
  }
  return undefined;
}

/**
 * Harness DEV: diario test via stesso loader (get iniettato), senza mockEditorial.
 * Attivo solo con ?focusHarness=1 in development.
 */
function buildFocusHarnessDiaryGet(periodId) {
  const publicationDate = focusLocalIsoDate();
  const analysisDate = addCalendarDays(publicationDate, -1);
  const dayKey = `trackerStorico_${analysisDate}`;
  const sleepKey = `trackerStorico_${publicationDate}`;
  const isWeek = String(periodId) === 'settimana' || String(periodId) === 'mese';
  const fullHistory = {
    [dayKey]: {
      data: analysisDate,
      log: [
        {
          type: 'food', id: 'h1', name: 'Salmone', mealType: 'pranzo', mealTime: 13,
          grams: 150, kcal: 280, prot: 35, carb: 0, fat: 14,
        },
        {
          type: 'food', id: 'h2', name: 'Riso', mealType: 'pranzo', mealTime: 13,
          grams: 180, kcal: 230, prot: 5, carb: 50, fat: 1,
        },
        {
          type: 'workout', id: 'hw1', name: 'Pesi · Petto', workoutType: 'pesi',
          duration: 50, time: 17.5, muscles: ['Petto'],
        },
        ...(isWeek
          ? [{
            type: 'workout', id: 'hw2', name: 'Camminata', workoutType: 'cardio',
            duration: 30, time: 8, intensity: 'moderate',
          }]
          : []),
      ],
    },
    [sleepKey]: {
      data: publicationDate,
      log: [{ type: 'sleep', id: 'hs1', hours: 8, wakeTime: 7, bedtime: 23 }],
    },
  };
  if (isWeek) {
    for (let i = 1; i <= 6; i += 1) {
      const d = addCalendarDays(analysisDate, -i);
      fullHistory[`trackerStorico_${d}`] = {
        data: d,
        log: [
          {
            type: 'food', id: `hf${i}`, name: 'Yogurt', mealType: 'colazione', mealTime: 8,
            grams: 150, kcal: 140, prot: 12, carb: 10, fat: 4,
          },
          {
            type: 'workout', id: `hw${i}`, name: 'Pesi', workoutType: 'pesi',
            duration: 45, time: 18, muscles: i % 2 ? ['Gambe'] : ['Schiena'],
          },
        ],
      };
    }
  }
  const profile = {
    targets: { kcal: 2200, prot: 140, carb: 220, fat: 70 },
    profile: { targetCalories: 2200, proteinTarget: 140 },
  };
  return async (_ref) => {
    const path = String(_ref?.toString?.() || _ref?._path?.toString?.() || '');
    const exists = true;
    if (path.includes('profile_targets')) {
      return { exists: () => exists, val: () => profile };
    }
    return { exists: () => exists, val: () => fullHistory };
  };
}

function buildFocusHarnessAskAi(periodId) {
  const mock = buildFocusEditorialMockAnalysis(periodId);
  const { _mock, _mockLabel, ...payload } = mock;
  return async () => JSON.stringify(payload);
}

function DomainIcon({ domain }) {
  if (domain === 'sleep') return <Moon size={16} strokeWidth={2.2} aria-hidden />;
  if (domain === 'nutrition') return <Utensils size={16} strokeWidth={2.2} aria-hidden />;
  if (domain === 'activity' || domain === 'exercise') return <Dumbbell size={16} strokeWidth={2.2} aria-hidden />;
  return <Sparkles size={16} strokeWidth={2.2} aria-hidden />;
}

function SparkBars({ chart, accent = '#4ea1ff' }) {
  const points = chart?.points || [];
  if (!chart?.hasData) {
    return <p className="kf-card-empty">{chart?.emptyLabel || 'Nessun dato.'}</p>;
  }

  const recordedValues = points
    .filter((p) => p.status === 'recorded' && Number.isFinite(p.value))
    .map((p) => p.value);
  const max = Math.max(...recordedValues, 0.0001);
  const w = 320;
  const h = 76;
  const pad = 6;
  const n = Math.max(points.length, 1);
  const slot = (w - pad * 2) / n;
  const barW = Math.max(3, Math.min(14, slot * 0.55));

  return (
    <svg className="kf-spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={chart.title}>
      {points.map((p, i) => {
        const x = pad + i * slot + (slot - barW) / 2;
        if (p.status !== 'recorded' || p.value == null) {
          return (
            <rect
              key={p.date}
              x={x}
              y={h - 10}
              width={barW}
              height={4}
              rx={1}
              fill="none"
              stroke="#6d7c91"
              strokeDasharray="2 2"
            />
          );
        }
        const barH = Math.max(4, ((p.value / max) * (h - 18)));
        return (
          <rect
            key={p.date}
            x={x}
            y={h - 8 - barH}
            width={barW}
            height={barH}
            rx={2}
            fill={accent}
            opacity={0.92}
          />
        );
      })}
    </svg>
  );
}

function InsightCard({ variant, section }) {
  const primary = section?.primary;
  const kicker = section?.cardLabel || section?.title || '';
  return (
    <article className={`kf-card kf-card--${variant}`}>
      <p className="kf-card-kicker">{kicker}</p>
      {primary ? (
        <>
          <h3>{primary.title}</h3>
          {primary.body ? <p>{primary.body}</p> : null}
        </>
      ) : (
        <p className="kf-card-empty">{section?.emptyLabel}</p>
      )}
    </article>
  );
}

function provenanceLabel(tag) {
  if (tag === 'recorded') return 'dato registrato';
  if (tag === 'estimated') return 'dato stimato';
  if (tag === 'calculated') return 'osservazione calcolata';
  return 'origine indicata';
}

function formatMicroLabel(key) {
  if (key === 'k') return 'Potassio';
  if (key === 'mg') return 'Magnesio';
  if (key === 'vitB12') return 'B12';
  if (key === 'omega3') return 'Omega-3';
  if (key === 'omega6') return 'Omega-6';
  return key;
}

function formatClockHour(hour) {
  if (hour == null || !Number.isFinite(Number(hour))) return null;
  const h = Math.floor(Number(hour)) % 24;
  const m = Math.round((Number(hour) - Math.floor(Number(hour))) * 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function NutritionIeriSection({ nutrition, analysisDate }) {
  const ieri = nutrition?.ieri;
  if (!ieri) {
    return (
      <section className="kf-block kf-nutrition" aria-label="La tua alimentazione">
        <h2 className="kf-block-title">Dettaglio alimentazione</h2>
        <p className="kf-card-empty">
          {nutrition?.message || 'Diario non disponibile per il giorno di analisi.'}
        </p>
      </section>
    );
  }

  const meals = ieri.meals || [];
  const microKeys = ['omega3', 'omega6', 'k', 'mg', 'vitB12'];
  const microByKey = ieri.totals?.micronutrients?.byKey || {};
  const coachMicros = ieri.coachEvidence?.micronutrients || {};
  const itemFlags = (ieri.toVerify || []).filter((r) => r.scope === 'item');
  const dayFlags = (ieri.toVerify || []).filter((r) => r.scope === 'day');

  return (
    <section className="kf-block kf-nutrition" aria-label="Dettaglio alimentazione">
      <h2 className="kf-block-title">Dettaglio alimentazione</h2>
      {analysisDate ? (
        <p className="kf-nutrition-privacy">
          Giorno {analysisDate} · pasti, macro, distribuzione, fonti e micronutrienti.
        </p>
      ) : null}

      {ieri.comment?.text ? (
        <div className="kf-nutrition-comment">
          <p className="kf-nutrition-comment-kicker">Osservazione nutrizionale</p>
          <p>{ieri.comment.text}</p>
        </div>
      ) : null}

      {ieri.totals ? (
        <div className="kf-nutrition-totals">
          <div>
            <span className="kf-nutrition-totals-label">Energia</span>
            <strong>
              {ieri.totals.kcal?.value != null ? `${Math.round(ieri.totals.kcal.value)} kcal` : '—'}
            </strong>
          </div>
          <div>
            <span className="kf-nutrition-totals-label">Proteine</span>
            <strong>
              {ieri.totals.proteinG?.value != null ? `${ieri.totals.proteinG.value} g` : '—'}
            </strong>
          </div>
          <div>
            <span className="kf-nutrition-totals-label">Carboidrati</span>
            <strong>
              {ieri.totals.carbG?.value != null ? `${ieri.totals.carbG.value} g` : '—'}
            </strong>
          </div>
          <div>
            <span className="kf-nutrition-totals-label">Grassi</span>
            <strong>
              {ieri.totals.fatG?.value != null ? `${ieri.totals.fatG.value} g` : '—'}
            </strong>
          </div>
          <div>
            <span className="kf-nutrition-totals-label">Fibre</span>
            <strong>
              {ieri.totals.fiberG?.value != null ? `${ieri.totals.fiberG.value} g` : '—'}
            </strong>
            {ieri.totals.fiberG?.usableForJudgement === false ? (
              <span className="kf-nutrition-flag">totale da verificare</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="kf-nutrition-micros">
        <h3 className="kf-nutrition-sub">Micronutrienti e copertura dei dati</h3>
        <ul>
          {microKeys.map((key) => {
            const tot = microByKey[key];
            const coach = coachMicros[key];
            const coverage = Math.round((tot?.completenessRatio || 0) * 100);
            const observe = Boolean(coach?.usableForObservation);
            return (
              <li key={key}>
                <span>{formatMicroLabel(key)}</span>
                <span>
                  {tot?.value != null ? `${tot.value}${tot.unit ? ` ${tot.unit}` : ''}` : 'non valutabile'}
                  {' · '}
                  copertura dati {coverage}%
                  {observe
                    ? ' · osservabile'
                    : ' · copertura dati insufficiente (non è una carenza)'}
                </span>
              </li>
            );
          })}
        </ul>
        {(ieri.comment?.technicalNotes || []).length > 0 ? (
          <ul className="kf-nutrition-tech-notes">
            {ieri.comment.technicalNotes.map((note, i) => (
              <li key={`tech_${i}`}>{note}</li>
            ))}
          </ul>
        ) : null}
        <p className="kf-nutrition-note">
          «Copertura dati insufficiente» non significa apporto nutrizionale insufficiente.
          Nessuna diagnosi di carenza.
        </p>
      </div>

      {meals.length === 0 ? (
        <p className="kf-card-empty">Nessun pasto registrato in questo giorno.</p>
      ) : (
        <div className="kf-nutrition-meals">
          {meals.map((meal) => (
            <article key={meal.mealSlotId} className="kf-nutrition-meal">
              <header>
                <h3>{meal.mealLabel}</h3>
                <span>{meal.clockLabel || 'orario non registrato'}</span>
              </header>
              <p className="kf-nutrition-dist">
                Distribuzione: {meal.distribution?.kcal ?? 0} kcal · proteine {meal.distribution?.proteinG ?? 0} g · carboidrati {meal.distribution?.carbG ?? 0} g · grassi {meal.distribution?.fatG ?? 0} g
              </p>
              <ul>
                {(meal.items || []).map((item, idx) => (
                  <li key={item.id || `${meal.mealSlotId}_${idx}`}>
                    <strong>{item.name || 'Alimento senza nome'}</strong>
                    {item.grams != null ? <span> · {item.grams} g</span> : null}
                    {item.macros?.kcal != null ? <span> · {Math.round(item.macros.kcal)} kcal</span> : null}
                    {(item.toVerify || []).length ? (
                      <span className="kf-nutrition-flag"> · da verificare</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}

      {itemFlags.length > 0 ? (
        <div className="kf-nutrition-verify">
          <h3 className="kf-nutrition-sub">Sospetti su singoli alimenti</h3>
          <ul>
            {itemFlags.map((row, i) => (
              <li key={`item_${i}`}>{formatNutritionVerifyLabel(row)}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {dayFlags.length > 0 ? (
        <div className="kf-nutrition-verify">
          <h3 className="kf-nutrition-sub">Sospetti sul totale del giorno</h3>
          <ul>
            {dayFlags.map((row, i) => (
              <li key={`day_${i}`}>{formatNutritionVerifyLabel(row)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function NutritionTrendsSection({ nutrition, periodLabel, analysisDate }) {
  const trends = nutrition?.trends;
  if (!trends) {
    return (
      <section className="kf-block kf-nutrition" aria-label={`Andamento alimentazione ${periodLabel}`}>
        <h2 className="kf-block-title">Dettaglio alimentazione</h2>
        <p className="kf-card-empty">{nutrition?.message || 'Nessun andamento disponibile.'}</p>
      </section>
    );
  }

  return (
    <section className="kf-block kf-nutrition" aria-label={`Andamento alimentazione ${periodLabel}`}>
      <h2 className="kf-block-title">Dettaglio alimentazione</h2>
      {analysisDate ? (
        <p className="kf-nutrition-privacy">
          Finestra che termina il {analysisDate} · solo giorni con cibo registrato.
        </p>
      ) : null}
      <p className="kf-nutrition-note">{trends.note}</p>
      {!trends.available ? (
        <p className="kf-card-empty">Nessun giorno con cibo registrato nella finestra.</p>
      ) : (
        <>
          <div className="kf-nutrition-totals">
            <div>
              <span className="kf-nutrition-totals-label">Giorni con cibo</span>
              <strong>{trends.daysWithFood}/{trends.daysInWindow}</strong>
            </div>
            <div>
              <span className="kf-nutrition-totals-label">Media kcal*</span>
              <strong>
                {trends.averagesFromRecordedDaysOnly?.kcal != null
                  ? Math.round(trends.averagesFromRecordedDaysOnly.kcal)
                  : '—'}
              </strong>
            </div>
            <div>
              <span className="kf-nutrition-totals-label">Media proteine*</span>
              <strong>
                {trends.averagesFromRecordedDaysOnly?.proteinG != null
                  ? `${trends.averagesFromRecordedDaysOnly.proteinG} g`
                  : '—'}
              </strong>
            </div>
          </div>
          <p className="kf-nutrition-note">* Solo giorni con registrazione; giorni mancanti esclusi (non = 0).</p>
          <ul className="kf-nutrition-trend-list">
            {(trends.series || []).map((row) => (
              <li key={row.date}>
                <span>{row.date}</span>
                <span>
                  {row.status === 'recorded'
                    ? `${Math.round(row.kcal || 0)} kcal · proteine ${row.proteinG ?? '—'} g`
                    : row.status === 'no_food_log'
                      ? 'senza cibo'
                      : 'senza registrazione'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function PillarCard({ pillar, onOpen, selected }) {
  if (!pillar) return null;
  const tone = pillar.tone || 'muted';
  const detailKey = pillar.detailKey || pillar.id;
  return (
    <button
      type="button"
      className={`kf-pillar kf-pillar--${pillar.id} kf-pillar--${tone}${selected ? ' kf-pillar--open' : ''}`}
      aria-pressed={selected}
      onClick={() => onOpen?.(detailKey)}
    >
      <span className="kf-pillar-icon" aria-hidden>
        <DomainIcon domain={pillar.id} />
      </span>
      <span className="kf-pillar-kicker">{pillar.title}</span>
      <strong className="kf-pillar-value">{pillar.primaryValue || 'Dati insufficienti'}</strong>
      <span className="kf-pillar-phrase">{pillar.shortPhrase || ''}</span>
    </button>
  );
}

function HabitCompassBlock({ compass }) {
  if (!compass?.available) return null;
  const hl = compass.highlights || {};
  const evaluations = compass.evaluations || [];
  const cardio = compass.cardio || null;
  const directionClass = (d) => {
    if (d === 'favorable') return 'kf-habit-dir--good';
    if (d === 'correct') return 'kf-habit-dir--warn';
    if (d === 'insufficient') return 'kf-habit-dir--muted';
    return 'kf-habit-dir--watch';
  };

  return (
    <section className="kf-block kf-habit-compass" aria-label="Le abitudini che stai costruendo">
      <h2 className="kf-block-title">{compass.title || 'Le abitudini che stai costruendo'}</h2>
      {compass.subtitle ? <p className="kf-habit-subtitle">{compass.subtitle}</p> : null}

      {cardio ? (
        <div className="kf-cardio-strip" aria-label="Attività aerobica">
          <span className="kf-coach-brief-label">Attività aerobica</span>
          <p className="kf-cardio-ref">{cardio.reference}</p>
          <p>
            Documentati: <strong>{cardio.aerobicMinutesDocumented ?? 0} min</strong>
            {cardio.intensityDocumented
              ? <> · Classificabili: <strong>{cardio.equivalentModerateMinutes} min-eq. moderati</strong>
                {cardio.moderateMinutes != null ? ` (M ${cardio.moderateMinutes}` : ''}
                {cardio.vigorousMinutes != null ? ` + V ${cardio.vigorousMinutes}×2)` : cardio.moderateMinutes != null ? ')' : ''}
              </>
              : ' · Intensità non classificata in modo affidabile'}
            .
          </p>
          {cardio.walkingMinutesUnclassified > 0 ? (
            <p className="kf-nutrition-note">
              Camminate senza intensità: {cardio.walkingMinutesUnclassified} min (non conteggiate come moderate).
            </p>
          ) : null}
          {cardio.monthTrendNote ? (
            <p className="kf-nutrition-note">{cardio.monthTrendNote}</p>
          ) : null}
        </div>
      ) : null}

      <div className="kf-habit-highlights">
        {hl.encourage ? (
          <div className="kf-habit-hl kf-habit-hl--good">
            <span className="kf-coach-brief-label">Da incentivare</span>
            <p><strong>{hl.encourage.pillar}.</strong> {hl.encourage.text}</p>
          </div>
        ) : null}
        {hl.correct ? (
          <div className="kf-habit-hl kf-habit-hl--warn">
            <span className="kf-coach-brief-label">Da correggere</span>
            <p><strong>{hl.correct.pillar}.</strong> {hl.correct.text}</p>
          </div>
        ) : null}
        {hl.primaryAction ? (
          <div className="kf-habit-hl kf-habit-hl--action">
            <span className="kf-coach-brief-label">Azione concreta</span>
            <p>{hl.primaryAction.text}</p>
          </div>
        ) : (
          <div className="kf-habit-hl kf-habit-hl--muted">
            <span className="kf-coach-brief-label">Azione concreta</span>
            <p>Nessuna azione specifica consigliata con i dati di questa settimana.</p>
          </div>
        )}
      </div>

      {hl.conflictNote ? (
        <p className="kf-habit-conflict">{hl.conflictNote}</p>
      ) : null}

      <div className="kf-habit-evals">
        {evaluations.map((ev) => (
          <details key={ev.id} className={`kf-habit-eval ${directionClass(ev.direction)}`}>
            <summary>
              <span className="kf-habit-eval-pillar">{ev.pillarLabel}</span>
              <span className="kf-habit-eval-dir">{ev.directionLabel}</span>
            </summary>
            <p className="kf-habit-obs"><strong>Abitudine osservata.</strong> {ev.habitObserved}</p>
            <p><strong>Motivazione.</strong> {ev.motivation}</p>
            {ev.evidence?.length ? (
              <ul className="kf-habit-evidence">
                {ev.evidence.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {ev.limits?.length ? (
              <ul className="kf-habit-limits">
                {ev.limits.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {ev.proposal ? (
              <p className="kf-habit-proposal"><strong>Proposta.</strong> {ev.proposal}</p>
            ) : null}
            {ev.verifyIn ? (
              <p className="kf-nutrition-note"><strong>Verifica.</strong> {ev.verifyIn}</p>
            ) : null}
          </details>
        ))}
      </div>
    </section>
  );
}

function WellnessCoachBlock({ coach }) {
  if (!coach) return null;
  const wentWell = typeof coach.wentWell === 'string'
    ? coach.wentWell
    : (coach.wentWellLines?.[0] || coach.wentWell?.[0] || '');
  const needsAttention = typeof coach.needsAttention === 'string'
    ? coach.needsAttention
    : (coach.needsAttentionLines?.[0] || coach.needsAttention?.[0] || '');
  return (
    <section className="kf-block kf-wellness-coach" aria-label="Commento del coach">
      <h2 className="kf-block-title">{coach.title || 'Commento del coach'}</h2>
      <ol className="kf-coach-brief">
        <li>
          <span className="kf-coach-brief-label">Va bene</span>
          <p>{wentWell}</p>
        </li>
        <li>
          <span className="kf-coach-brief-label">Da osservare</span>
          <p>{needsAttention}</p>
        </li>
        <li>
          <span className="kf-coach-brief-label">Prossima azione</span>
          <p>{coach.concreteAction}</p>
        </li>
      </ol>
    </section>
  );
}

function ExerciseDetailSection({ pillar, periodId }) {
  if (!pillar) return null;
  const workouts = pillar.workouts || [];
  const series = pillar.series || [];
  const muscleFreq = pillar.muscleGroupFrequency || [];
  const cardio = pillar.cardio || null;

  return (
    <section className="kf-block kf-exercise" aria-label="Dettaglio esercizio">
      <h2 className="kf-block-title">Dettaglio esercizio</h2>
      {pillar.detailNote ? <p className="kf-nutrition-note">{pillar.detailNote}</p> : null}
      {cardio && periodId !== 'ieri' ? (
        <div className="kf-cardio-strip">
          <span className="kf-coach-brief-label">Cardio nel periodo</span>
          <p className="kf-cardio-ref">{cardio.referenceAdult}</p>
          <p>
            Documentati: {cardio.aerobicMinutesDocumented ?? 0} min
            {cardio.intensityDocumented
              ? ` · classificabili ≈ ${cardio.equivalentModerateMinutes} min-eq. moderati`
              : ' · intensità non classificata'}
          </p>
        </div>
      ) : null}
      {periodId === 'ieri' ? (
        workouts.length === 0 ? (
          <p className="kf-card-empty">
            Nessun allenamento registrato. Questo non significa inattività: mancano solo le evidenze nel diario.
          </p>
        ) : (
          <ul className="kf-exercise-list">
            {workouts.map((w) => (
              <li key={w.id || `${w.label}_${w.clockLabel}`}>
                <strong>{w.label}</strong>
                <span>
                  {w.kindLabel}
                  {w.workoutTypeId ? ` · ${w.workoutTypeId}` : ''}
                  {w.clockLabel ? ` · ore ${w.clockLabel}` : ''}
                  {w.durationMin != null ? ` · ${w.durationMin} min` : ''}
                  {(w.muscleGroups || []).length
                    ? ` · gruppi: ${w.muscleGroups.join(', ')}`
                    : ''}
                  {w.kcalBurn != null ? ` · ${Math.round(w.kcalBurn)} kcal (registrate)` : ''}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          {muscleFreq.length > 0 ? (
            <div className="kf-nutrition-totals">
              {muscleFreq.slice(0, 6).map((row) => (
                <div key={row.group}>
                  <span className="kf-nutrition-totals-label">{row.group}</span>
                  <strong>{row.sessions} sessioni</strong>
                </div>
              ))}
            </div>
          ) : null}
          <ul className="kf-nutrition-trend-list">
            {series.map((row) => (
              <li key={row.date}>
                <span>{row.date}</span>
                <span>
                  {row.status === 'recorded'
                    ? [
                      `${row.sessions} sessioni`,
                      row.durationMinTotal != null ? `${Math.round(row.durationMinTotal)} min` : null,
                      (row.muscleGroups || []).length ? row.muscleGroups.join(', ') : null,
                    ].filter(Boolean).join(' · ')
                    : 'senza allenamento registrato'}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="kf-nutrition-note">
        Minuti, calorie e tipo di lavoro non sono equivalenti. Intensità solo se documentata.
        I gruppi muscolari sono quelli del diario, non i singoli esercizi.
      </p>
    </section>
  );
}

function SleepDetailSection({ pillar, sleepNight, periodId }) {
  if (!pillar) return null;
  const series = pillar.series || [];

  return (
    <section className="kf-block kf-sleep" aria-label="Dettaglio sonno">
      <h2 className="kf-block-title">Dettaglio sonno e recupero</h2>
      {pillar.detailNote ? <p className="kf-nutrition-note">{pillar.detailNote}</p> : null}
      {periodId === 'ieri' ? (
        <>
          {pillar.hasEvidence ? (
            <div className="kf-nutrition-totals">
              {(pillar.metrics || []).map((m) => (
                <div key={m}>
                  <span className="kf-nutrition-totals-label">Dato</span>
                  <strong>{m}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="kf-card-empty">{pillar.primaryValue || 'Non registrato'}</p>
          )}
          {sleepNight?.sleepAvailable ? (
            <p className="kf-nutrition-note">
              Notte conclusa al risveglio del {sleepNight.nightEndedOn}
              {sleepNight.hours != null ? ` · circa ${sleepNight.hours} ore` : ''}
              {formatClockHour(sleepNight.wakeTime)
                ? ` · risveglio ${formatClockHour(sleepNight.wakeTime)}`
                : ''}
            </p>
          ) : null}
        </>
      ) : (
        <ul className="kf-nutrition-trend-list">
          {series.map((row) => (
            <li key={`${row.date}_${row.wakeDate}`}>
              <span>{row.date} → risveglio {row.wakeDate}</span>
              <span>
                {row.status === 'recorded'
                  ? (row.hours != null ? `${row.hours} ore` : 'registrato')
                  : 'senza sonno registrato'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MealManeuverBlock({ maneuver }) {
  if (!maneuver) return null;
  const sim = maneuver.simulation;
  return (
    <section className="kf-block kf-maneuver" aria-label="Manovra pasti">
      <h2 className="kf-block-title">Manovra · redistribuzione pasti</h2>
      {!maneuver.suggested ? (
        <p className="kf-card-empty">{maneuver.message || 'Nessuna manovra specifica consigliata'}</p>
      ) : (
        <div className="kf-maneuver-body">
          {maneuver.criticality ? (
            <div>
              <h3>Criticità</h3>
              <p>{maneuver.criticality}</p>
            </div>
          ) : null}
          {maneuver.objective ? (
            <div>
              <h3>Obiettivo della modifica</h3>
              <p>{maneuver.objective}</p>
            </div>
          ) : null}
          {maneuver.suggestedChange?.text ? (
            <div className="kf-maneuver-change">
              <h3>Modifica suggerita</h3>
              <p>{maneuver.suggestedChange.text}</p>
              {sim?.dailyKcalUnchanged ? (
                <p className="kf-nutrition-note">
                  Simulazione: energia giornaliera invariata
                  {sim.dailyKcalBefore != null ? ` (${Math.round(sim.dailyKcalBefore)} kcal)` : ''}
                  . Nessuna modifica al diario.
                </p>
              ) : null}
            </div>
          ) : null}
          {sim?.mealTotalsBefore && sim?.mealTotalsAfter ? (
            <div>
              <h3>Prima / dopo (macro documentati)</h3>
              <ul className="kf-maneuver-limits">
                {sim.mealTotalsAfter.map((row) => {
                  const prev = sim.mealTotalsBefore.find((b) => b.mealSlotId === row.mealSlotId);
                  return (
                    <li key={row.mealSlotId || row.clockLabel}>
                      {row.mealLabel} {row.clockLabel ? `(${row.clockLabel})` : ''}
                      {': '}
                      {prev ? `${Math.round(prev.kcal)}→${Math.round(row.kcal)} kcal` : `${Math.round(row.kcal)} kcal`}
                      {row.proteinG != null && prev
                        ? ` · P ${Math.round(prev.proteinG)}→${Math.round(row.proteinG)} g`
                        : ''}
                      {row.carbG != null && prev
                        ? ` · C ${Math.round(prev.carbG || 0)}→${Math.round(row.carbG)} g`
                        : ''}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {maneuver.expectedAdvantage ? (
            <div>
              <h3>Vantaggio atteso</h3>
              <p>{maneuver.expectedAdvantage}</p>
            </div>
          ) : null}
          {maneuver.tradeoffs ? (
            <div>
              <h3>Compromessi</h3>
              <p>{maneuver.tradeoffs}</p>
            </div>
          ) : null}
          {maneuver.watchNextDays ? (
            <div>
              <h3>Cosa osservare</h3>
              <p>{maneuver.watchNextDays}</p>
            </div>
          ) : null}
        </div>
      )}
      {(maneuver.limits || []).length > 0 ? (
        <ul className="kf-maneuver-limits">
          {maneuver.limits.map((line, i) => (
            <li key={`lim_${i}`}>{line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function FocusDeepLinksBar({ session }) {
  const links = useMemo(
    () => buildFocusKentuDeepLinks({
      analysisDate: session?.analysisDate,
      periodId: session?.periodId,
    }),
    [session?.analysisDate, session?.periodId],
  );
  const items = [links.pilotaEnergetico, links.bussola, links.stimoloMuscolare, links.cardio];
  return (
    <nav className="kf-deep-links" aria-label="Apri strumenti Kentu OS">
      {items.map((link) => (
        <Link
          key={link.engineId}
          className="kf-deep-link"
          to={link.to}
          state={link.state || undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function FocusEditorialReport({
  session,
  aiState,
  onGenerate,
  historyRows,
  onOpenHistory,
  allowGenerate = true,
  showHistoryOnly = false,
}) {
  const analysis = aiState?.analysis || null;
  const editorial = useMemo(() => normalizeFocusEditorialAnalysis(analysis), [analysis]);
  const evidenceItems = useMemo(() => {
    // Preferisci i raw salvati in RTDB (possono essere oggetti {label,value} o mappe {"0":…}),
    // non solo gli id stringa della normalize — altrimenti le righe restano vuote.
    const rawRefs = analysis?.evidenceRefs;
    const hasRaw = (Array.isArray(rawRefs) && rawRefs.length > 0)
      || (rawRefs && typeof rawRefs === 'object' && !Array.isArray(rawRefs) && Object.keys(rawRefs).length > 0);
    const refs = hasRaw ? rawRefs : (editorial?.evidenceRefs || []);
    let dossier = null;
    try {
      if (session) {
        const built = buildFocusAiCoachDossier(session);
        if (built.ok) dossier = built.dossier;
      }
    } catch {
      dossier = null;
    }
    const resolved = resolveFocusEvidenceRefs(refs, { dossier, session });
    const visible = [];
    for (const ev of resolved) {
      const label = String(ev?.label || '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').replace(/\s+/g, ' ').trim();
      const detail = String(ev?.detail || '').replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!/[\p{L}\p{N}]/u.test(label) && !/[\p{L}\p{N}]/u.test(detail)) continue;
      visible.push({
        id: String(ev?.id || label || `ev_${visible.length + 1}`),
        label: /[\p{L}\p{N}]/u.test(label) ? label : detail,
        detail: /[\p{L}\p{N}]/u.test(detail) && detail !== label ? detail : '',
        available: Boolean(ev?.available),
      });
    }
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      const shape = Array.isArray(rawRefs)
        ? `array:${rawRefs.length}`
        : (rawRefs && typeof rawRefs === 'object' ? `object:${Object.keys(rawRefs).length}` : typeof rawRefs);
      // Solo metadati: nessuna riga diario.
      // eslint-disable-next-line no-console
      console.info('[FocusEvidence]', {
        rawShape: shape,
        resolvedCount: visible.length,
        labels: visible.map((v) => v.label),
      });
    }
    return visible;
  }, [analysis?.evidenceRefs, editorial?.evidenceRefs, session]);
  const bindingOk = Boolean(
    analysis
    && (
      aiState.diaryStale
      || showHistoryOnly
      || (
        aiState?.binding
        && session
        && aiState.binding.uid === session.uid
        && aiState.binding.periodId === session.periodId
        && aiState.binding.analysisDate === session.analysisDate
        && aiState.binding.publicationDate === session.publicationDate
        && aiState.binding.dataVersion === aiState.expectedDataVersion
      )
    ),
  );
  const isMock = Boolean(analysis?._mock || aiState?.isMock);
  const isHarnessMock = Boolean(aiState?.isHarnessMock);
  const hasFreshReport = bindingOk && editorial && (!aiState?.diaryStale || isMock || isHarnessMock);
  const statusLabel = aiState?.status === 'loading'
    ? 'Generazione in corso'
    : aiState?.regenerateFailed
      ? 'Rigenerazione non riuscita · rapporto precedente'
      : isMock
        ? 'Anteprima MOCK (non Gemini)'
        : isHarnessMock
          ? 'Provider mock di test (non Gemini)'
          : aiState?.diaryStale
            ? 'Analisi precedente (diario aggiornato)'
            : hasFreshReport
              ? (editorial?.legacyCompat ? 'Rapporto salvato (formato precedente)' : 'Rapporto pronto')
              : 'In attesa di analisi';

  return (
    <section className="kf-editorial" aria-label="Rapporto Kentu Focus">
      {isMock ? (
        <p className="kf-mock-banner" role="status">
          {analysis?._mockLabel || 'SIMULAZIONE EDITORIALE — non è un’analisi Gemini reale'}
        </p>
      ) : null}
      {isHarnessMock && !isMock ? (
        <p className="kf-mock-banner kf-mock-banner--harness" role="status">
          RISPOSTA PROVIDER MOCK — non è Gemini reale (flusso diario reale)
        </p>
      ) : null}
      <header className="kf-editorial-head">
        <div>
          <p className="kf-editorial-kicker">Kentu Focus</p>
          <p className="kf-editorial-meta">
            {session?.windowLabel || session?.metaLine || 'Periodo'}
            {' · '}
            <span className="kf-editorial-status">{statusLabel}</span>
          </p>
        </div>
        <div className="kf-editorial-actions">
          {allowGenerate ? (
            <button
              type="button"
              className="kf-ai-generate"
              disabled={aiState?.status === 'loading' || aiState?.busy}
              onClick={onGenerate}
            >
              {aiState?.status === 'loading'
                ? 'Generazione…'
                : hasFreshReport
                  ? 'Rigenera analisi'
                  : 'Genera analisi'}
            </button>
          ) : null}
        </div>
      </header>

      {allowGenerate && !hasFreshReport && !aiState?.diaryStale && aiState?.status !== 'loading' ? (
        <div className="kf-editorial-empty">
          <h2 className="kf-report-headline">Il tuo rapporto personale</h2>
          <p className="kf-report-lead">
            Qui compare l’interpretazione delle abitudini — titolo, capitoli e una proposta concreta —
            non un riassunto delle card del diario.
          </p>
          <p className="kf-ai-consent">
            I dati della finestra possono essere inviati all’AI con il tuo consenso. Nessuno score di salute.
          </p>
        </div>
      ) : null}

      {aiState?.persistError ? (
        <p className="kf-state kf-state--error" role="status">
          Analisi generata in sessione, ma salvataggio cloud non riuscito ({aiState.persistError}).
          Su altri dispositivi potrebbe non comparire finché non si ripete con rete ok.
        </p>
      ) : null}

      {aiState?.status === 'loading' ? (
        <p className="kf-state" aria-live="polite">Sto preparando il rapporto…</p>
      ) : null}

      {aiState?.status === 'error' || aiState?.status === 'validation_failed' || aiState?.status === 'blocked' ? (
        <p className="kf-state kf-state--error" role="alert">
          {aiState.userMessage || 'Analisi AI non disponibile.'}
        </p>
      ) : null}

      {aiState?.diaryStale ? (
        <p className="kf-nutrition-note" role="status">
          {aiState.userMessage || 'Analisi riferita a una versione precedente del diario.'}
        </p>
      ) : null}

      {bindingOk && editorial ? (
        <article className="kf-report">
          {aiState?.record?.generatedAt ? (
            <p className="kf-nutrition-note">
              Generata il {new Date(aiState.record.generatedAt).toLocaleString('it-IT')}
              {aiState.record.windowLabel ? ` · ${aiState.record.windowLabel}` : ''}
              {aiState.record.revisionId ? ` · rev ${aiState.record.revisionId}` : ''}
              {editorial.legacyCompat ? ' · formato precedente' : ''}
            </p>
          ) : null}

          <h2 className="kf-report-headline">{editorial.headline}</h2>
          <p className="kf-report-lead">{editorial.lead}</p>

          {(editorial.sections || []).map((sec) => (
            <section key={sec.id || sec.title} className="kf-report-chapter">
              <h3>{sec.title}</h3>
              <p>{sec.body}</p>
            </section>
          ))}

          {editorial.keyInsight ? (
            <aside className="kf-report-insight">
              <h3>Collegamento importante</h3>
              <p>{editorial.keyInsight}</p>
            </aside>
          ) : null}

          <section className="kf-report-action">
            <h3>La scelta che farei</h3>
            <p>{editorial.recommendedAction}</p>
            {editorial.expectedChange ? (
              <p className="kf-report-expected">
                <strong>Cosa cambia / cosa no:</strong>
                {' '}
                {editorial.expectedChange}
              </p>
            ) : null}
          </section>

          {editorial.verifyNext ? (
            <section className="kf-report-verify">
              <h3>Cosa osservare dopo</h3>
              <p>{editorial.verifyNext}</p>
            </section>
          ) : null}

          {(editorial.limits || []).length > 0 ? (
            <ul className="kf-report-limits">
              {editorial.limits.map((l, i) => (
                <li key={`lim_${i}`}>{l}</li>
              ))}
            </ul>
          ) : null}

          {evidenceItems.length > 0 ? (
            <details className="kf-report-evidence" open data-testid="kf-report-evidence">
              <summary>Evidenze citate ({evidenceItems.length})</summary>
              <ul className="kf-evidence-list">
                {evidenceItems.map((ev, idx) => {
                  const label = String(ev.label || '').trim();
                  const detail = String(ev.detail || '').trim();
                  if (!label || /citato nel rapporto|non risolto/i.test(detail)) return null;
                  return (
                    <li
                      key={`${ev.id || 'ev'}_${idx}`}
                      className="kf-evidence-item"
                      data-evidence-id={ev.id || undefined}
                    >
                      <div className="kf-evidence-label">{label}</div>
                      {detail && detail !== label ? (
                        <div className="kf-evidence-detail">{detail}</div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}

          {editorial.quantitativeProposal ? (
            <details className="kf-report-evidence">
              <summary>Proposta quantitativa</summary>
              <p>
                {editorial.quantitativeProposal.foodName
                  ? `${editorial.quantitativeProposal.foodName}`
                  : 'Alimento'}
                {editorial.quantitativeProposal.grams != null
                  ? ` · ${editorial.quantitativeProposal.grams} g`
                  : ''}
                {editorial.quantitativeProposal.fromMeal
                  ? ` · da ${editorial.quantitativeProposal.fromMeal}`
                  : ''}
                {editorial.quantitativeProposal.toTiming
                  ? ` → ${editorial.quantitativeProposal.toTiming}`
                  : ''}
              </p>
              {editorial.quantitativeProposal.rationale ? (
                <p className="kf-nutrition-note">{editorial.quantitativeProposal.rationale}</p>
              ) : null}
            </details>
          ) : null}

          <FocusDeepLinksBar session={session} />
        </article>
      ) : null}

      {(historyRows || []).length > 0 ? (
        <div className="kf-ai-history">
          <h3>Storico analisi</h3>
          <ul>
            {historyRows.map((row) => (
              <li key={`${row.periodId}_${row.windowKey}_${row.revisionId}`}>
                <button
                  type="button"
                  className="kf-ai-history-btn"
                  onClick={() => onOpenHistory?.(row)}
                >
                  {row.periodId} · {row.windowKey}
                  {row.windowLabel ? ` · ${row.windowLabel}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function RealWellnessDashboard({
  session,
  periodId,
  openDetail,
  setOpenDetail,
  aiState,
  onGenerateAi,
  onOpenAiHistory,
}) {
  const wellness = session?.wellness;
  const pillars = wellness?.pillars || [];
  const byId = wellness?.pillarsById || {};
  const nutrition = session?.nutrition || null;
  const hasFreshAi = Boolean(
    aiState?.analysis && (!aiState?.diaryStale || aiState?.isMock || aiState?.isHarnessMock),
  );

  const toggleDetail = (key) => {
    setOpenDetail(key === openDetail ? null : key);
  };

  return (
    <>
      <FocusEditorialReport
        session={session}
        aiState={aiState}
        onGenerate={onGenerateAi}
        historyRows={aiState?.historyRows || []}
        onOpenHistory={onOpenAiHistory}
      />

      <details className="kf-evidence" open={!hasFreshAi}>
        <summary className="kf-evidence-summary">
          {hasFreshAi ? 'Prove e approfondimenti' : 'Dati del diario (non sono un rapporto AI)'}
        </summary>

        <section className="kf-pillars kf-pillars--compact" aria-label="Tre pilastri del benessere">
          {pillars.map((p) => (
            <PillarCard
              key={p.id}
              pillar={p}
              selected={openDetail === (p.detailKey || p.id)}
              onOpen={toggleDetail}
            />
          ))}
        </section>

        {periodId === 'settimana' || periodId === 'mese' ? (
          <HabitCompassBlock compass={session?.habitCompass} />
        ) : null}

        {periodId === 'ieri' || session?.mealManeuver?.suggested ? (
          <MealManeuverBlock maneuver={session?.mealManeuver} />
        ) : null}

        <p className="kf-deepen-hint">Tocca una card per aprire l’approfondimento.</p>
      </details>

      {openDetail === 'nutrition' ? (
        periodId === 'ieri' ? (
          <NutritionIeriSection nutrition={nutrition} analysisDate={session.analysisDate} />
        ) : (
          <NutritionTrendsSection
            nutrition={nutrition}
            periodLabel={periodId === 'mese' ? 'Mese' : 'Settimana'}
            analysisDate={session.analysisDate}
          />
        )
      ) : null}

      {openDetail === 'exercise' ? (
        <ExerciseDetailSection pillar={byId.exercise} periodId={periodId} />
      ) : null}

      {openDetail === 'sleep' ? (
        <SleepDetailSection
          pillar={byId.sleep}
          sleepNight={session.sleepNight}
          periodId={periodId}
        />
      ) : null}
    </>
  );
}

function DemoEditorialBlock({ edition, status }) {
  const coach = edition?.coachView;
  const charts = edition?.charts?.charts || [];

  if (status === 'loading') {
    return <div className="kf-state" aria-live="polite">Sto preparando l’anteprima dimostrativa…</div>;
  }
  if (status === 'error') {
    return (
      <div className="kf-state kf-state--error" role="alert">
        {edition?.error?.message || 'Anteprima non disponibile.'}
      </div>
    );
  }
  if (!coach) return null;

  return (
    <>
      <div className="kf-cards">
        <InsightCard variant="bene" section={coach.sections.bene} />
        <InsightCard variant="attenzione" section={coach.sections.attenzione} />
        <InsightCard variant="migliora" section={coach.sections.migliora} />
      </div>

      <section className="kf-block" aria-label="Grafici">
        <h2 className="kf-block-title">Grafici del periodo (anteprima)</h2>
        {charts.length === 0 ? (
          <p className="kf-card-empty">Nessuna serie disponibile per questo periodo.</p>
        ) : (
          charts.map((chart) => (
            <div key={chart.id} className="kf-chart">
              <div className="kf-chart-head">
                <span className="kf-domain-chip">
                  <DomainIcon domain={chart.domain} />
                </span>
                <h4>{chart.title}</h4>
              </div>
              <p className="kf-chart-meta">
                {chart.windowLabel} · unità {chart.unit}
                {' · '}
                {chart.recordedCount} registrati
                {' · '}
                {chart.missingCount} senza registrazione
              </p>
              <SparkBars
                chart={chart}
                accent={
                  chart.domain === 'sleep'
                    ? '#8b9cff'
                    : chart.domain === 'nutrition'
                      ? '#2fbf7a'
                      : '#4ea1ff'
                }
              />
              <div className="kf-legend">
                <span className="kf-legend-rec">giorno registrato</span>
                <span className="kf-legend-miss">giorno senza registrazione</span>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="kf-block" aria-label="Consiglio del coach">
        <h2 className="kf-block-title">Il consiglio del coach</h2>
        {coach.coachAdvice ? (
          <div className="kf-coach">
            <div className="kf-coach-avatar" aria-hidden>
              <Sparkles size={18} />
            </div>
            <div>
              <h3>{coach.coachAdvice.title}</h3>
              <p>{coach.coachAdvice.body}</p>
            </div>
          </div>
        ) : (
          <p className="kf-card-empty">
            Nessun consiglio del coach fondato sui dati in questa edizione.
          </p>
        )}
      </section>

      <details className="kf-block kf-deepen">
        <summary>Leggi l’approfondimento</summary>
        {(coach.deepenArticles || []).length === 0 ? (
          <p className="kf-card-empty">Nessun articolo in questa edizione.</p>
        ) : (
          coach.deepenArticles.map((item) => (
            <article key={item.id || item.title} className="kf-article">
              <h4>{item.title}</h4>
              {item.body ? <p>{item.body}</p> : null}
              <div className="kf-tags">
                {(item.provenanceTags || []).map((tag) => (
                  <span key={tag} className="kf-tag">{provenanceLabel(tag)}</span>
                ))}
              </div>
            </article>
          ))
        )}
      </details>
    </>
  );
}

export default function KentuFocusPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, authReady } = useAuth();
  const mockEditorial = searchParams.get('mockEditorial') === '1'
    || searchParams.get('mockEditorial') === 'true';
  const focusHarness = import.meta.env.DEV
    && (searchParams.get('focusHarness') === '1' || searchParams.get('focusHarness') === 'true');
  /** DEV: ripristina un rapporto v3 già “salvato” in memoria (no Gemini, no Firebase prod). */
  const focusSavedEvidence = focusHarness
    && (searchParams.get('focusSavedEvidence') === '1' || searchParams.get('focusSavedEvidence') === 'true');
  const uid = focusHarness ? 'focus-harness-uid' : (user?.uid || null);
  const periodFromUrl = String(searchParams.get('period') || '').toLowerCase();
  const [periodId, setPeriodId] = useState(
    ['ieri', 'settimana', 'mese'].includes(periodFromUrl) ? periodFromUrl : 'ieri',
  );
  const [pageStatus, setPageStatus] = useState('loading');
  const [diaryLoadState, setDiaryLoadState] = useState('idle');
  const [session, setSession] = useState(null);
  const [openDetail, setOpenDetail] = useState(null);
  const [aiState, setAiState] = useState({
    status: 'idle',
    analysis: null,
    binding: null,
    expectedDataVersion: null,
    userMessage: null,
    busy: false,
  });
  const aiInflightRef = useRef(false);
  /** Snapshot rapporto precedente: se la rigenerazione fallisce resta consultabile. */
  const previousAiRef = useRef(null);

  useEffect(() => {
    if (['ieri', 'settimana', 'mese'].includes(periodFromUrl) && periodFromUrl !== periodId) {
      setPeriodId(periodFromUrl);
    }
  }, [periodFromUrl, periodId]);

  const selectPeriod = (id) => {
    setPeriodId(id);
    const next = new URLSearchParams(searchParams);
    next.set('period', id);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!mockEditorial || !session || session.mode !== FOCUS_PAGE_MODE.real_diary) return;
    const mock = buildFocusEditorialMockAnalysis(periodId);
    setAiState((prev) => ({
      ...prev,
      status: 'ready',
      analysis: mock,
      binding: {
        uid: uid || 'mock-preview',
        periodId,
        analysisDate: session.analysisDate || null,
        publicationDate: session.publicationDate || null,
        dataVersion: 'mock',
        windowKey: session.analysisDate || periodId,
      },
      expectedDataVersion: 'mock',
      diaryStale: false,
      busy: false,
      isMock: true,
      isHarnessMock: false,
      userMessage: mock._mockLabel,
      historyRows: prev.historyRows || [],
    }));
  }, [mockEditorial, periodId, session, uid]);

  useEffect(() => {
    if (focusHarness && typeof window !== 'undefined') {
      window.__KENTU_FOCUS_ASK_AI__ = buildFocusHarnessAskAi(periodId);
    }
  }, [focusHarness, periodId]);

  useEffect(() => {
    let cancelled = false;

    const applyAiForRealSession = async (base) => {
      const built = buildFocusAiCoachDossier(base);
      if (!built.ok || !built.binding) {
        if (!cancelled) {
          setAiState((prev) => ({
            ...prev,
            status: 'idle',
            analysis: null,
            expectedDataVersion: null,
            busy: false,
            isMock: false,
            isHarnessMock: false,
          }));
        }
        return;
      }
      const key = focusAiCoachCacheKey(built.binding);
      const cached = peekFocusAiCoachMemory(key, built.binding);
      const persistence = resolveFocusAiPersistence({ forceMemory: focusHarness });

      // Seed rapporto v3 “già salvato” → stesso percorso loadFocusAiAnalysisFromStore (no Gemini).
      if (focusSavedEvidence && persistence?.kind === 'memory') {
        try {
          __resetFocusAiAnalysisPersistenceForTests();
          const seededPersistence = resolveFocusAiPersistence({ forceMemory: true });
          const analysis = buildFocusSavedEvidenceHarnessAnalysis();
          const record = {
            ...buildFocusAiAnalysisRecord(built.binding, analysis, built.dossier, 1),
            revisionId: FOCUS_SAVED_EVIDENCE_HARNESS_REVISION_ID,
            revisionSeq: 1,
            generatedAt: FOCUS_SAVED_EVIDENCE_HARNESS_GENERATED_AT,
            analysis,
            isHarnessMock: true,
            meta: { harnessMock: true, savedEvidenceFixture: true },
          };
          await seededPersistence.saveRevision({
            uid: base.uid,
            periodId: base.periodId,
            windowKey: built.binding.windowKey || built.binding.analysisDate,
            record,
          });
        } catch {
          /* seed best-effort */
        }
      }

      let historyRows = [];
      try {
        const hist = await listFocusAiAnalysisHistory({
          uid: base.uid,
          periodId: base.periodId,
          persistence: focusSavedEvidence
            ? resolveFocusAiPersistence({ forceMemory: true })
            : persistence,
        });
        historyRows = hist.rows || [];
      } catch {
        historyRows = [];
      }
      if (cancelled) return;

      if (mockEditorial) {
        setAiState((prev) => ({ ...prev, historyRows, expectedDataVersion: 'mock' }));
        return;
      }

      const applyLoaded = (analysis, binding, extra = {}) => {
        if (cancelled) return;
        setAiState({
          status: extra.status || 'ready',
          analysis,
          binding,
          expectedDataVersion: built.dataVersion,
          userMessage: extra.userMessage || null,
          busy: false,
          diaryStale: Boolean(extra.diaryStale),
          record: extra.record || null,
          historyRows,
          isMock: false,
          isHarnessMock: Boolean(extra.isHarnessMock),
        });
      };

      // Con fixture salvata: salta cache RAM e vai allo store (percorso recupero storico).
      if (cached?.analysis && !focusSavedEvidence) {
        applyLoaded(cached.analysis, built.binding, {
          record: cached.record || null,
          isHarnessMock: Boolean(cached.record?.isHarnessMock),
        });
        return;
      }

      try {
        const storeForLoad = focusSavedEvidence
          ? resolveFocusAiPersistence({ forceMemory: true })
          : persistence;
        const remote = await loadFocusAiAnalysisFromStore({
          uid: base.uid,
          periodId: base.periodId,
          windowKey: built.binding.windowKey || built.binding.analysisDate,
          currentDataVersion: built.dataVersion,
          persistence: storeForLoad,
        });
        if (remote.ok && remote.record?.analysis) {
          applyLoaded(remote.record.analysis, {
            ...built.binding,
            dataVersion: remote.record.dataVersion,
          }, {
            status: remote.record.diaryStale ? 'stale_available' : 'ready',
            diaryStale: remote.record.diaryStale,
            userMessage: remote.record.freshnessNote,
            record: remote.record,
            isHarnessMock: Boolean(remote.record?.meta?.harnessMock || remote.record?.isHarnessMock),
          });
          return;
        }
      } catch {
        /* ignore */
      }

      if (!cancelled) {
        setAiState((prev) => ({
          ...prev,
          status: 'idle',
          analysis: null,
          binding: built.binding,
          expectedDataVersion: built.dataVersion,
          historyRows,
          busy: false,
          isMock: false,
          isHarnessMock: false,
        }));
      }
    };

    (async () => {
      setPageStatus('loading');
      setOpenDetail(null);
      setAiState((prev) => ({
        status: 'idle',
        analysis: null,
        binding: null,
        expectedDataVersion: null,
        userMessage: null,
        busy: false,
        historyRows: prev.historyRows || [],
        isMock: false,
        isHarnessMock: false,
      }));
      aiInflightRef.current = false;

      // Auth non ancora pronta: non mostrare demo al posto del diario reale.
      if (!focusHarness && !authReady) {
        setDiaryLoadState('loading');
        setSession(null);
        return;
      }

      // Utente non autenticato (e non harness): anteprima demo esplicita.
      if (!uid) {
        setDiaryLoadState('unauthenticated');
        const base = resolveFocusPageSession({ uid: null, periodId, handoff: null });
        const loaded = await loadFocusPageDemoEditionIfAllowed(base);
        if (cancelled) return;
        setSession(loaded);
        setPageStatus(loaded.status || 'ready');
        return;
      }

      // Harness: ricostruisci il diario per periodo (ieri ≠ settimana).
      if (focusHarness) clearFocusDiaryForUser(uid);

      let handoff = peekFocusDiaryForUser(uid);
      if (!handoffBelongsToUser(uid, handoff)) {
        setDiaryLoadState('loading');
        setSession(null);
        setPageStatus('loading');

        const loadedDiary = focusHarness
          ? await loadFocusAuthenticatedDiary({
            uid,
            db: { __harness: true },
            get: buildFocusHarnessDiaryGet(periodId),
            ref: (_db, path) => ({ toString: () => path, _path: path }),
            stash: true,
          })
          : await loadFocusAuthenticatedDiary({
            uid,
            db,
            get,
            ref,
            stash: true,
          });

        if (cancelled) return;

        if (!loadedDiary.ok) {
          setDiaryLoadState(loadedDiary.status || 'read_error');
          setSession({
            mode: FOCUS_PAGE_MODE.empty,
            uid,
            periodId,
            banner: 'DIARIO NON DISPONIBILE',
            headline: {
              title: 'Focus',
              subtitle: loadedDiary.status === 'no_database'
                ? 'Database non disponibile in questa sessione.'
                : 'Impossibile leggere il diario dal cloud.',
            },
            metaLine: null,
            fullHistory: null,
            editorial: { available: false, message: 'Errore di lettura diario.' },
            showDemoEditorial: false,
            diagnostics: { diaryLoadState: loadedDiary.status },
          });
          setPageStatus('error');
          return;
        }

        handoff = loadedDiary.snapshot;
        setDiaryLoadState(loadedDiary.status);
      } else {
        setDiaryLoadState(handoff.diarySource === 'firebase_tracker_data' ? 'ready' : 'ready_ram');
      }

      const base = resolveFocusPageSession({ uid, periodId, handoff });
      if (cancelled) return;

      if (base.mode === FOCUS_PAGE_MODE.real_diary) {
        const source = handoff?.diarySource || 'handoff_ram';
        setDiaryLoadState(source === 'firebase_tracker_data' ? 'ready' : 'ready_ram');
        setSession({
          ...base,
          banner: focusHarness ? 'DIARIO TEST (harness · non produzione)' : 'DIARIO REALE',
          diagnostics: {
            ...base.diagnostics,
            diarySource: source,
          },
        });
        setPageStatus('ready');
        await applyAiForRealSession(base);
        return;
      }

      // Fallback difensivo: non mescolare demo se uid presente.
      setDiaryLoadState('insufficient');
      setSession({
        ...base,
        mode: FOCUS_PAGE_MODE.empty,
        banner: 'DIARIO INSUFFICIENTE',
        showDemoEditorial: false,
        headline: {
          title: 'Focus',
          subtitle: 'Diario caricato ma sessione non pronta.',
        },
      });
      setPageStatus('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, periodId, authReady, mockEditorial, focusHarness, focusSavedEvidence]);

  const handleGenerateAi = async () => {
    if (!session || session.mode !== FOCUS_PAGE_MODE.real_diary) {
      setAiState({
        status: 'blocked',
        analysis: null,
        binding: null,
        expectedDataVersion: null,
        userMessage: diaryLoadState === 'loading'
          ? 'Sto ancora caricando il diario reale…'
          : diaryLoadState === 'unauthenticated'
            ? 'Accedi per generare l’analisi sul tuo diario.'
            : 'L’analisi AI è disponibile solo con il diario reale caricato.',
        busy: false,
      });
      return;
    }
    if (aiInflightRef.current) return;

    const built = buildFocusAiCoachDossier(session);
    if (!built.ok || !built.binding) {
      setAiState({
        status: 'blocked',
        analysis: null,
        binding: null,
        expectedDataVersion: null,
        userMessage: 'Sessione non pronta per l’analisi AI.',
        busy: false,
      });
      return;
    }

    previousAiRef.current = {
      analysis: aiState.analysis || null,
      binding: aiState.binding || null,
      record: aiState.record || null,
      expectedDataVersion: aiState.expectedDataVersion || null,
      historyRows: aiState.historyRows || [],
      diaryStale: Boolean(aiState.diaryStale),
    };

    aiInflightRef.current = true;
    setAiState((prev) => ({
      ...prev,
      status: 'loading',
      binding: built.binding,
      expectedDataVersion: built.dataVersion,
      userMessage: null,
      busy: true,
      isHarnessMock: false,
      isMock: false,
      // tieni il vecchio rapporto visibile durante il loading; verrà sostituito solo se ok
    }));

    try {
      const persistence = resolveFocusAiPersistence({ forceMemory: focusHarness });
      const askAiFn = resolveFocusAskAiFn();
      // Click esplicito Genera/Rigenera: sempre force, anche se esiste cache/RTDB per la stessa dataVersion.
      const result = await requestFocusAiCoachAnalysis({
        session,
        persistence,
        askAiFn,
        force: true,
      });
      const usedHarness = Boolean(askAiFn);
      let historyRows = [];
      try {
        const hist = await listFocusAiAnalysisHistory({
          uid: session.uid,
          periodId: session.periodId,
          persistence,
        });
        historyRows = hist.rows || [];
      } catch {
        historyRows = [];
      }

      if (result.status === 'stale_available' && result.analysis) {
        setAiState({
          status: 'stale_available',
          analysis: result.analysis,
          binding: result.binding,
          expectedDataVersion: built.dataVersion,
          userMessage: result.userMessage,
          busy: false,
          diaryStale: true,
          record: result.record || null,
          historyRows,
          isHarnessMock: usedHarness,
          isMock: false,
        });
        return;
      }

      if (
        result.binding
        && result.ok
        && (
          result.binding.periodId !== session.periodId
          || result.binding.uid !== session.uid
        )
      ) {
        const prev = previousAiRef.current;
        setAiState({
          status: 'error',
          analysis: prev?.analysis || null,
          binding: prev?.binding || result.binding,
          expectedDataVersion: prev?.expectedDataVersion || built.dataVersion,
          userMessage: 'I dati Focus sono cambiati: la rigenerazione non è stata applicata. Il rapporto precedente resta visibile.',
          busy: false,
          diaryStale: Boolean(prev?.diaryStale),
          record: prev?.record || null,
          historyRows: historyRows.length ? historyRows : (prev?.historyRows || []),
          isHarnessMock: false,
          isMock: false,
          regenerateFailed: true,
        });
        return;
      }

      if (!result.ok || !result.analysis) {
        const prev = previousAiRef.current;
        setAiState({
          status: result.status || 'error',
          analysis: prev?.analysis || null,
          binding: prev?.binding || result.binding || built.binding,
          expectedDataVersion: prev?.expectedDataVersion || built.dataVersion,
          userMessage: result.userMessage || 'Rigenerazione non riuscita. Il rapporto precedente resta visibile.',
          busy: false,
          diaryStale: Boolean(prev?.diaryStale),
          record: prev?.record || null,
          historyRows: historyRows.length ? historyRows : (prev?.historyRows || []),
          isHarnessMock: false,
          isMock: false,
          regenerateFailed: true,
        });
        return;
      }

      if (result.fromCache) {
        const prev = previousAiRef.current;
        setAiState({
          status: 'error',
          analysis: prev?.analysis || result.analysis,
          binding: prev?.binding || result.binding,
          expectedDataVersion: prev?.expectedDataVersion || built.dataVersion,
          userMessage: 'Rigenerazione interrotta: è stata riproposta una cache invece di una nuova analisi. Riprova.',
          busy: false,
          diaryStale: Boolean(prev?.diaryStale),
          record: prev?.record || result.record || null,
          historyRows,
          isHarnessMock: false,
          isMock: false,
          regenerateFailed: true,
        });
        return;
      }

      setAiState({
        status: 'ready',
        analysis: result.analysis,
        binding: result.binding,
        expectedDataVersion: built.dataVersion,
        userMessage: null,
        busy: false,
        diaryStale: false,
        record: result.record || null,
        historyRows,
        persistError: result.reason === 'persist_failed' ? (result.persistError || 'persist_failed') : null,
        isHarnessMock: usedHarness,
        isMock: false,
        regenerateFailed: false,
      });
    } catch (err) {
      const prev = previousAiRef.current;
      setAiState({
        status: 'error',
        analysis: prev?.analysis || null,
        binding: prev?.binding || built.binding,
        expectedDataVersion: prev?.expectedDataVersion || built.dataVersion,
        userMessage: err?.message || 'Errore durante l’analisi AI. Il rapporto precedente resta visibile.',
        busy: false,
        diaryStale: Boolean(prev?.diaryStale),
        record: prev?.record || null,
        historyRows: prev?.historyRows || [],
        isHarnessMock: false,
        isMock: false,
        regenerateFailed: true,
      });
    } finally {
      aiInflightRef.current = false;
    }
  };

  const handleOpenAiHistory = async (row) => {
    if (!row || !uid) return;
    const persistence = resolveFocusAiPersistence({ forceMemory: focusHarness });
    const built = session?.mode === FOCUS_PAGE_MODE.real_diary
      ? buildFocusAiCoachDossier(session)
      : { ok: false };
    const loaded = await loadFocusAiAnalysisFromStore({
      uid,
      periodId: row.periodId,
      windowKey: row.windowKey,
      currentDataVersion: built.ok ? built.dataVersion : null,
      persistence,
    });
    if (!loaded.ok || !loaded.record?.analysis) return;
    const withoutFreshDiary = !built.ok;
    setAiState((prev) => ({
      ...prev,
      status: (loaded.record.diaryStale || withoutFreshDiary) ? 'stale_available' : 'ready',
      analysis: loaded.record.analysis,
      binding: {
        uid,
        periodId: row.periodId,
        analysisDate: loaded.record.analysisDate || row.windowKey,
        publicationDate: loaded.record.publicationDate || session?.publicationDate || null,
        dataVersion: loaded.record.dataVersion,
        windowKey: row.windowKey,
      },
      expectedDataVersion: built.ok ? built.dataVersion : loaded.record.dataVersion,
      diaryStale: Boolean(loaded.record.diaryStale) || withoutFreshDiary,
      userMessage: withoutFreshDiary
        ? 'Storico recuperato senza diario in sessione: consultabile; non ricalcolato sui dati attuali.'
        : loaded.record.freshnessNote,
      record: loaded.record,
    }));
  };

  const isReal = session?.mode === FOCUS_PAGE_MODE.real_diary;
  const edition = session?.demoEdition || null;

  return (
    <div className="kf-page">
      <div className="kf-shell">
        <div className="kf-topbar">
          <button
            type="button"
            className="kf-back"
            onClick={() => navigate('/', { replace: false })}
          >
            ← Sala Comandi
          </button>
          <div className="kf-brand">
            <p className="kf-brand-kicker">Kentu</p>
            <h1 className="kf-brand-title">Focus</h1>
          </div>
        </div>

        <div className="kf-banner" role="status">
          {diaryLoadState === 'loading' || (!session && pageStatus === 'loading')
            ? 'CARICAMENTO DIARIO…'
            : (session?.banner || FOCUS_PRODUCT_DEMO_BANNER)}
        </div>

        {!aiState?.analysis && session?.mode === FOCUS_PAGE_MODE.real_diary ? null : !aiState?.analysis ? (
          <header className="kf-hero">
            <div className="kf-hero-icons" aria-hidden>
              <span className="kf-domain-chip"><Utensils size={15} /></span>
              <span className="kf-domain-chip"><Dumbbell size={15} /></span>
              <span className="kf-domain-chip"><Moon size={15} /></span>
            </div>
            <h2>{session?.headline?.title || 'Rapporto personale'}</h2>
            <p>{session?.headline?.subtitle || 'Interpretazione delle abitudini — non un riassunto del diario.'}</p>
          </header>
        ) : null}

        <div className="kf-period-tabs" role="tablist" aria-label="Periodo Focus">
          {FOCUS_PRODUCT_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              className="kf-period-tab"
              aria-selected={periodId === p.id}
              onClick={() => selectPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {session?.metaLine ? (
          <p className="kf-meta">{session.metaLine}</p>
        ) : null}

        {(pageStatus === 'loading' || diaryLoadState === 'loading') && !session ? (
          <div className="kf-state" aria-live="polite">
            {uid ? 'Sto caricando il tuo diario reale…' : 'Sto preparando Focus…'}
          </div>
        ) : null}

        {isReal ? (
          <RealWellnessDashboard
            session={session}
            periodId={periodId}
            openDetail={openDetail}
            setOpenDetail={setOpenDetail}
            aiState={aiState}
            onGenerateAi={handleGenerateAi}
            onOpenAiHistory={handleOpenAiHistory}
          />
        ) : (
          <>
            <FocusEditorialReport
              session={session}
              aiState={aiState}
              onGenerate={mockEditorial ? () => {} : handleGenerateAi}
              historyRows={aiState?.historyRows || []}
              onOpenHistory={handleOpenAiHistory}
              allowGenerate={!mockEditorial && Boolean(uid)}
              showHistoryOnly
            />
            <details className="kf-evidence" open={!aiState?.analysis}>
              <summary className="kf-evidence-summary">
                Anteprima dimostrativa e dati di esempio
              </summary>
              <DemoEditorialBlock edition={edition} status={pageStatus} />
            </details>
          </>
        )}
      </div>
    </div>
  );
}
