import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, Moon, Sparkles, Utensils } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  FOCUS_PRODUCT_DEMO_BANNER,
  FOCUS_PRODUCT_PERIODS,
  peekFocusDiaryForUser,
  requestFocusAiCoachAnalysis,
  buildFocusAiCoachDossier,
  peekFocusAiCoachMemory,
  focusAiCoachCacheKey,
} from '../features/kentuFocus/product/index.js';
import {
  FOCUS_PAGE_MODE,
  formatNutritionVerifyLabel,
  loadFocusPageDemoEditionIfAllowed,
  resolveFocusPageSession,
} from '../features/kentuFocus/product/buildFocusPageSession.js';
import './kentuFocusPage.css';

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

function FocusAiCoachPanel({ session, aiState, onGenerate }) {
  const analysis = aiState?.analysis || null;
  const bindingOk = Boolean(
    analysis
    && aiState?.binding
    && session
    && aiState.binding.uid === session.uid
    && aiState.binding.periodId === session.periodId
    && aiState.binding.analysisDate === session.analysisDate
    && aiState.binding.publicationDate === session.publicationDate
    && aiState.binding.dataVersion === aiState.expectedDataVersion,
  );

  return (
    <section className="kf-block kf-ai-coach" aria-label="Analisi AI Kentu Focus">
      <h2 className="kf-block-title">Analisi AI</h2>
      <p className="kf-ai-consent">
        Premendo il pulsante, le informazioni selezionate del tuo diario Focus
        (pasti, allenamenti e sonno della finestra corrente) saranno inviate al servizio AI
        per generare un commento narrativo. Nessuno score di salute.
      </p>
      <button
        type="button"
        className="kf-ai-generate"
        disabled={aiState?.status === 'loading' || aiState?.busy}
        onClick={onGenerate}
      >
        {aiState?.status === 'loading' ? 'Generazione in corso…' : 'Genera analisi AI'}
      </button>

      {aiState?.status === 'loading' ? (
        <p className="kf-state" aria-live="polite">Sto preparando l’analisi AI…</p>
      ) : null}

      {aiState?.status === 'error' || aiState?.status === 'validation_failed' || aiState?.status === 'blocked' ? (
        <p className="kf-state kf-state--error" role="alert">
          {aiState.userMessage || 'Analisi AI non disponibile.'}
        </p>
      ) : null}

      {bindingOk && analysis ? (
        <div className="kf-ai-result">
          <p className="kf-ai-integrated">{analysis.integratedComment}</p>
          <div className="kf-ai-pillars">
            <div>
              <h3>Alimentazione</h3>
              <p>{analysis.pillarObservations.nutrition}</p>
            </div>
            <div>
              <h3>Esercizio</h3>
              <p>{analysis.pillarObservations.exercise}</p>
            </div>
            <div>
              <h3>Sonno</h3>
              <p>{analysis.pillarObservations.sleep}</p>
            </div>
          </div>
          {(analysis.focusAspects || []).length > 0 ? (
            <div className="kf-ai-aspects">
              <h3>Da approfondire</h3>
              <ul>
                {analysis.focusAspects.map((a, i) => (
                  <li key={`asp_${i}`}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="kf-ai-action">
            <h3>Proposta pratica</h3>
            <p>{analysis.practicalAction}</p>
          </div>
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
}) {
  const wellness = session?.wellness;
  const pillars = wellness?.pillars || [];
  const byId = wellness?.pillarsById || {};
  const nutrition = session?.nutrition || null;

  const toggleDetail = (key) => {
    setOpenDetail(key === openDetail ? null : key);
  };

  return (
    <>
      <section className="kf-pillars" aria-label="Tre pilastri del benessere">
        {pillars.map((p) => (
          <PillarCard
            key={p.id}
            pillar={p}
            selected={openDetail === (p.detailKey || p.id)}
            onOpen={toggleDetail}
          />
        ))}
      </section>

      <WellnessCoachBlock coach={wellness?.coach} />

      {periodId === 'settimana' || periodId === 'mese' ? (
        <HabitCompassBlock compass={session?.habitCompass} />
      ) : null}

      {periodId === 'ieri' || session?.mealManeuver?.suggested ? (
        <MealManeuverBlock maneuver={session?.mealManeuver} />
      ) : null}

      <FocusAiCoachPanel
        session={session}
        aiState={aiState}
        onGenerate={onGenerateAi}
      />

      <p className="kf-deepen-hint">Tocca una card per aprire l’approfondimento.</p>

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
  const { user } = useAuth();
  const uid = user?.uid || null;
  const [periodId, setPeriodId] = useState('ieri');
  const [pageStatus, setPageStatus] = useState('loading');
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

  const handoff = useMemo(
    () => (uid ? peekFocusDiaryForUser(uid) : null),
    [uid, periodId],
  );

  useEffect(() => {
    let cancelled = false;
    setPageStatus('loading');
    setSession(null);
    setOpenDetail(null);
    setAiState({
      status: 'idle',
      analysis: null,
      binding: null,
      expectedDataVersion: null,
      userMessage: null,
      busy: false,
    });
    aiInflightRef.current = false;

    const base = resolveFocusPageSession({
      uid,
      periodId,
      handoff,
    });

    if (base.mode === FOCUS_PAGE_MODE.real_diary) {
      if (!cancelled) {
        setSession(base);
        setPageStatus('ready');
        const built = buildFocusAiCoachDossier(base);
        if (built.ok && built.binding) {
          const key = focusAiCoachCacheKey(built.binding);
          const cached = peekFocusAiCoachMemory(key, built.binding);
          if (cached?.analysis) {
            setAiState({
              status: 'ready',
              analysis: cached.analysis,
              binding: built.binding,
              expectedDataVersion: built.dataVersion,
              userMessage: null,
              busy: false,
            });
          } else {
            setAiState((prev) => ({
              ...prev,
              expectedDataVersion: built.dataVersion,
            }));
          }
        }
      }
      return () => {
        cancelled = true;
      };
    }

    loadFocusPageDemoEditionIfAllowed(base).then((loaded) => {
      if (cancelled) return;
      setSession(loaded);
      setPageStatus(loaded.status || 'ready');
    });

    return () => {
      cancelled = true;
    };
  }, [uid, periodId, handoff]);

  const handleGenerateAi = async () => {
    if (!session || session.mode !== FOCUS_PAGE_MODE.real_diary) {
      setAiState({
        status: 'blocked',
        analysis: null,
        binding: null,
        expectedDataVersion: null,
        userMessage: 'L’analisi AI è disponibile solo con il diario reale.',
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

    aiInflightRef.current = true;
    setAiState({
      status: 'loading',
      analysis: null,
      binding: built.binding,
      expectedDataVersion: built.dataVersion,
      userMessage: null,
      busy: true,
    });

    try {
      const result = await requestFocusAiCoachAnalysis({ session });
      if (
        result.binding
        && (
          result.binding.dataVersion !== built.dataVersion
          || result.binding.periodId !== session.periodId
          || result.binding.uid !== session.uid
        )
      ) {
        setAiState({
          status: 'error',
          analysis: null,
          binding: result.binding,
          expectedDataVersion: built.dataVersion,
          userMessage: 'I dati Focus sono cambiati: rigenera l’analisi.',
          busy: false,
        });
        return;
      }

      if (!result.ok || !result.analysis) {
        setAiState({
          status: result.status || 'error',
          analysis: null,
          binding: result.binding || built.binding,
          expectedDataVersion: built.dataVersion,
          userMessage: result.userMessage || 'Analisi AI non disponibile.',
          busy: false,
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
      });
    } catch (err) {
      setAiState({
        status: 'error',
        analysis: null,
        binding: built.binding,
        expectedDataVersion: built.dataVersion,
        userMessage: err?.message || 'Errore durante l’analisi AI.',
        busy: false,
      });
    } finally {
      aiInflightRef.current = false;
    }
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
          {session?.banner || FOCUS_PRODUCT_DEMO_BANNER}
        </div>

        <header className="kf-hero">
          <div className="kf-hero-icons" aria-hidden>
            <span className="kf-domain-chip"><Utensils size={15} /></span>
            <span className="kf-domain-chip"><Dumbbell size={15} /></span>
            <span className="kf-domain-chip"><Moon size={15} /></span>
          </div>
          <h2>{session?.headline?.title || 'Benessere a tre pilastri'}</h2>
          <p>{session?.headline?.subtitle || 'Alimentazione, esercizio, sonno — stessa importanza.'}</p>
        </header>

        <div className="kf-period-tabs" role="tablist" aria-label="Periodo Focus">
          {FOCUS_PRODUCT_PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              className="kf-period-tab"
              aria-selected={periodId === p.id}
              onClick={() => setPeriodId(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {session?.metaLine ? (
          <p className="kf-meta">{session.metaLine}</p>
        ) : null}

        {pageStatus === 'loading' && !session ? (
          <div className="kf-state" aria-live="polite">Sto preparando la dashboard…</div>
        ) : null}

        {isReal ? (
          <RealWellnessDashboard
            session={session}
            periodId={periodId}
            openDetail={openDetail}
            setOpenDetail={setOpenDetail}
            aiState={aiState}
            onGenerateAi={handleGenerateAi}
          />
        ) : (
          <DemoEditorialBlock edition={edition} status={pageStatus} />
        )}
      </div>
    </div>
  );
}
