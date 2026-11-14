import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Dumbbell, Moon, Pause, Utensils } from 'lucide-react';
import { get, ref, set } from 'firebase/database';
import { db } from '../../../../firebaseConfig.js';
import DayScoreFeedback from '../../score/DayScoreFeedback.jsx';
import { computePeriodScore } from '../../score/computePeriodScore.js';
import { PERIOD_RULES, PILLAR_STATUS } from '../../score/scoreConfig.kds-3.js';
import { WALK_CHECKIN_OPTIONS, createMovementCheckinStore, forzaSettingPath } from '../../score/movementCheckin.js';
import { loadKentuDatabases, peekKentuDatabasesSnapshot, subscribeKentuDatabases } from '../../../../foodLoader.js';
import { buildFocusPeriodBrief } from '../focusPeriodBrief.js';
import { composeFocusV5Report } from '../composeFocusV5Report.js';
import { baselineWords } from '../calibration.js';
import { formatFocusHistoryLabel } from '../../normalize/focusDateUtils.js';
import { datesBetween, weekOf } from './focusPeriodCursor.js';
import { dayColor } from './dayColor.js';
import { FocusCompoundFoodAuditDev } from './FocusCompoundFoodAuditDev.jsx';
import {
  focusOpenPerfLongTasksSnapshot,
  focusOpenPerfMark,
  focusOpenPerfPrintLongTasks,
  focusOpenPerfStopLongTasks,
} from '../focusOpenPerf.js';
import { resolveFocusGridScores } from '../resolveFocusGridScores.js';
import './focusBoard.css';

const TABS = [
  { id: 'ieri', label: 'Giorno' },
  { id: 'settimana', label: 'Settimana' },
  { id: 'mese', label: 'Mese' },
];

const PILLARS = [
  { id: 'alimentazione', label: 'Alimentazione', icon: Utensils, token: '--kf-pillar-food' },
  { id: 'sonno', label: 'Sonno', icon: Moon, token: '--kf-pillar-sleep' },
  { id: 'movimento', label: 'Movimento', icon: Activity, token: '--kf-pillar-move' },
  { id: 'forza', label: 'Forza', icon: Dumbbell, token: '--kf-pillar-force' },
];

const DOW = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

const ACTION_LABEL = {
  oggi: 'OGGI PROVA COSÌ',
  'questa settimana': 'QUESTA SETTIMANA',
  'questo mese': 'QUESTO MESE',
  'la prossima settimana': 'LA PROSSIMA SETTIMANA',
};

function actionKicker(horizon) {
  if (ACTION_LABEL[horizon]) return ACTION_LABEL[horizon];
  if (/^a\s+\p{L}+$/u.test(String(horizon || ''))) return String(horizon).toLocaleUpperCase('it-IT');
  return ACTION_LABEL.oggi;
}

function shownPillarLine(id, aiLine, codeLine, keyFact) {
  if (id === 'forza' && codeLine && /session/.test(codeLine)) {
    const macros = [...String(codeLine).matchAll(/parte (?:alta|bassa)/g)].map((match) => match[0]);
    const ai = String(aiLine || '');
    if (macros.some((macro) => !ai.includes(macro))) return codeLine;
  }
  if (keyFact && /eq\s*\/\s*7 giorni/.test(String(aiLine || '')) && String(aiLine) !== keyFact) {
    return keyFact;
  }
  return aiLine || codeLine || keyFact || 'non registrato';
}

function scoreStateWord(score) {
  const value = Number(score);
  if (!Number.isFinite(value)) return '';
  if (value >= 0.75) return 'sulla rotta';
  if (value >= 0.45) return 'a metà';
  return 'fuori rotta';
}

function uniqueHistory(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows || []) {
    const label = formatFocusHistoryLabel(row.periodId, row.windowKey || row.analysisDate)
      || row.windowLabel
      || row.windowKey;
    const key = `${row.periodId}|${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * Pagina Focus. I numeri del motore restano fuori da qui, tranne in DEV.
 */
export default function FocusBoard({
  uid,
  session,
  today,
  periodId,
  periodWindow,
  cursor,
  onSelectPeriod,
  onCursor,
  onOpenDay,
  aiState,
  onRegenerate,
  onOpenHistory,
  promptCheckIn = false,
}) {
  const [forzaOn, setForzaOn] = useState(false);
  const [checkins, setCheckins] = useState({});
  const [checkInDismissed, setCheckInDismissed] = useState(false);
  const [records, setRecords] = useState({});
  const [openPillar, setOpenPillar] = useState(null);
  const [dayScores, setDayScores] = useState({});
  const [storedScores, setStoredScores] = useState({});
  const [catalogs, setCatalogs] = useState(() => peekKentuDatabasesSnapshot());
  const [savedBaseline, setSavedBaseline] = useState(null);
  const [inputsReady, setInputsReady] = useState(false);
  const scoreJobRef = useRef({ cancelled: false });

  useEffect(() => {
    setOpenPillar(null);
  }, [periodId, periodWindow?.analysisDate]);

  useEffect(() => {
    // Focus non aspetta i cataloghi: solo subscribe. Caricamento soft dopo il primo paint.
    const unsub = subscribeKentuDatabases(setCatalogs);
    const warm = peekKentuDatabasesSnapshot();
    if (warm?.kentuItDb && Object.keys(warm.kentuItDb).length) {
      setCatalogs(warm);
      focusOpenPerfMark('catalogs_already_warm', {
        kentuIt: Object.keys(warm.kentuItDb || {}).length,
      });
      return unsub;
    }
    let cancelled = false;
    const start = () => {
      if (cancelled) return;
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      focusOpenPerfMark('catalogs_deferred_start');
      loadKentuDatabases()
        .then((snap) => {
          if (cancelled) return;
          focusOpenPerfMark('catalogs_core_ready', {
            ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
            kentuIt: Object.keys(snap?.kentuItDb || {}).length,
            global: Object.keys(snap?.globalDb || {}).length,
            offReady: Boolean(snap?.offReady),
            deferred: true,
          });
        })
        .catch(() => {
          if (!cancelled) focusOpenPerfMark('catalogs_load_error');
        });
    };
    const idle = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(start, { timeout: 2500 })
      : setTimeout(start, 0);
    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function' && typeof idle === 'number') {
        try { cancelIdleCallback(idle); } catch { /* ignore */ }
      } else {
        clearTimeout(idle);
      }
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!uid || !db) return undefined;
    let cancelled = false;
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    Promise.all([
      get(ref(db, forzaSettingPath(uid))).catch(() => null),
      createMovementCheckinStore({ db, uid }).readAll().catch(() => ({})),
      get(ref(db, `users/${uid}/day_status`)).catch(() => null),
    ]).then(([enabledSnap, saved, statusSnap]) => {
      if (cancelled) return;
      setForzaOn(enabledSnap?.val?.() === true || enabledSnap?.val?.() === 'true');
      setCheckins(saved || {});
      const raw = statusSnap?.val?.() || {};
      setRecords(raw && typeof raw === 'object' ? raw : {});
      setInputsReady(true);
      focusOpenPerfMark('board_inputs_ready', {
        ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
      });
    }).catch(() => {
      if (!cancelled) setInputsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Contesto stabile per la cache: i cataloghi non invalidano i giorni chiusi.
  const scoreContextCore = useMemo(() => ({
    today,
    fullHistory: session?.fullHistory,
    userTargets: session?.userTargets,
    targetKcal: session?.userTargets?.kcal ?? null,
    profile_targets: session?.profile_targets || null,
    cylinders: { forza: { enabled: forzaOn } },
    movementCheckins: checkins,
    records,
  }), [today, session?.fullHistory, session?.userTargets, session?.profile_targets, forzaOn, checkins, records]);

  const scoreContext = useMemo(() => ({
    ...scoreContextCore,
    catalogs,
  }), [scoreContextCore, catalogs]);

  const gridDates = useMemo(() => gridOf(periodId, periodWindow), [periodId, periodWindow]);

  // Nessun computeDayScore in render: tutto dal job cache-first.
  const liveDays = dayScores;

  useEffect(() => {
    if (!uid || !db || !inputsReady) return undefined;
    const signal = { cancelled: false };
    scoreJobRef.current = signal;
    const dates = [...new Set([
      ...gridDates.filter(Boolean),
      ...(periodWindow?.from && periodWindow?.to
        ? datesBetween(periodWindow.from, periodWindow.to)
        : []),
    ])].filter(Boolean).sort();

    // Debounce: StrictMode + aggiornamenti check-in non devono far partire N job.
    const timer = setTimeout(() => {
      if (signal.cancelled) return;
      resolveFocusGridScores({
        uid,
        db,
        today,
        dates,
        scoreContext: scoreContextCore,
        signal,
        onPartial: (partial) => {
          if (signal.cancelled) return;
          setDayScores((prev) => ({ ...prev, ...partial.live }));
          setStoredScores((prev) => ({ ...prev, ...partial.stored }));
        },
      }).then((result) => {
        if (signal.cancelled) return;
        if (result?.live) setDayScores((prev) => ({ ...prev, ...result.live }));
        if (result?.stored) setStoredScores((prev) => ({ ...prev, ...result.stored }));
        if (result?.aborted) return;
        const lt = focusOpenPerfLongTasksSnapshot();
        focusOpenPerfMark('kds3_longtasks', {
          count: lt.count,
          maxMs: lt.max,
          over200: lt.tasks.filter((row) => Number(row.duration) > 200).length,
        });
        focusOpenPerfPrintLongTasks(lt.tasks, 'kds3_longtasks');
        focusOpenPerfStopLongTasks();
      }).catch((err) => {
        focusOpenPerfMark('kds3_resolve_error', {
          message: String(err?.message || err || 'error').slice(0, 120),
        });
        if (!signal.cancelled) focusOpenPerfStopLongTasks();
      });
    }, 40);

    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [uid, inputsReady, gridDates, periodWindow?.from, periodWindow?.to, scoreContextCore, today]);

  const scoredContext = useMemo(() => ({
    ...scoreContext,
    precomputedDays: liveDays,
    // Mai ricalcolare in render: solo cache / job a chunk.
    allowComputeFallback: false,
  }), [scoreContext, liveDays]);

  const period = useMemo(() => (
    periodWindow
      ? computePeriodScore(periodWindow.from, periodWindow.to, scoredContext)
      : null
  ), [periodWindow, scoredContext]);

  const stripRange = useMemo(() => {
    if (!periodWindow) return null;
    if (periodId === 'ieri') return weekOf(periodWindow.from);
    return { from: periodWindow.from, to: periodWindow.to };
  }, [periodId, periodWindow]);

  const stripScore = useMemo(() => (
    stripRange ? computePeriodScore(stripRange.from, stripRange.to, scoredContext) : null
  ), [stripRange, scoredContext]);

  const brief = useMemo(() => (
    session?.analysisDate
      ? buildFocusPeriodBrief(periodId, session.analysisDate, {
        ...scoredContext,
        periodFrom: periodWindow?.from,
        periodTo: periodWindow?.to,
      })
      : null
  ), [periodId, session?.analysisDate, scoredContext, periodWindow]);

  const composed = useMemo(() => (brief?.ai === false ? null : composeFocusV5Report(brief)), [brief]);
  const analysis = matchingAnalysis(aiState, session, periodId);
  const viewingToday = periodId === 'ieri' && periodWindow?.inProgress;
  const aiHeadline = analysis?.headline || analysis?.summary?.headline || '';
  const stateWord = scoreStateWord(brief?.score);
  const aiPillar = analysis?.action?.pillar || null;
  const calibrating = Boolean(brief?.calibration?.active);
  const analysisMatches = !calibrating && Boolean(aiPillar) && aiPillar === brief?.actionPillar
    && (!stateWord || aiHeadline.includes(stateWord));
  const headline = calibrating
    ? (composed?.headline || '')
    : (analysisMatches ? aiHeadline : (composed?.headline || aiHeadline || ''));
  const aiAction = analysis?.action?.text
    || (typeof analysis?.summary?.todayAction === 'string' ? analysis.summary.todayAction : analysis?.summary?.todayAction?.text)
    || '';
  const actionText = (analysisMatches ? aiAction : '') || composed?.action?.text || aiAction || '';
  const actionHorizon = composed?.action?.horizon || analysis?.action?.horizon || 'oggi';
  const supportText = analysis?.support?.text || null;
  const deepDive = analysis?.deepDive || composed?.deepDive || null;
  const limits = [...(deepDive?.limits || [])];
  if (brief?.unconfirmedNote && !limits.includes(brief.unconfirmedNote)) {
    limits.push(brief.unconfirmedNote);
  }
  if (brief?.movementEstimateNote && !limits.includes(brief.movementEstimateNote)) {
    limits.push(brief.movementEstimateNote);
  }
  const shownBaseline = savedBaseline || brief?.baseline || null;
  const profileAge = Number(session?.profile_targets?.profile?.age);
  const forzaLabel = profileAge >= 65 ? 'Forza ed equilibrio' : 'Forza';

  useEffect(() => {
    if (!uid || !db || !inputsReady || calibrating || !brief?.baseline) return undefined;
    let cancelled = false;
    const path = `users/${uid}/baseline/v1`;
    const payload = brief.baseline;
    get(ref(db, path)).then((snap) => {
      if (cancelled) return null;
      const saved = snap.exists() ? snap.val() : null;
      if (saved && typeof saved === 'object') {
        setSavedBaseline({ ...payload, ...saved, dismissed: Boolean(saved.dismissed) });
        return null;
      }
      return set(ref(db, path), { ...payload, dismissed: false }).then(() => {
        if (!cancelled) setSavedBaseline({ ...payload, dismissed: false });
      });
    }).catch(() => {
      if (!cancelled) setSavedBaseline({ ...payload, dismissed: false });
    });
    return () => {
      cancelled = true;
    };
  }, [uid, inputsReady, calibrating, brief?.baseline]);

  const dismissBaselineCard = () => {
    if (!shownBaseline) return;
    const next = { ...shownBaseline, dismissed: true };
    setSavedBaseline(next);
    if (!uid || !db) return;
    set(ref(db, `users/${uid}/baseline/v1`), next).catch(() => {});
  };

  const showBaselineHero = Boolean(
    !calibrating
    && periodId === 'ieri'
    && shownBaseline
    && !shownBaseline.dismissed,
  );
  const streaks = stripScore?.streaks || [];

  const todayScore = liveDays[today];
  const logged = viewingToday ? loggedLines(todayScore, forzaOn) : [];

  const checkInDate = periodId === 'ieri' && !viewingToday ? periodWindow?.from : null;
  const showCheckIn = Boolean(
    promptCheckIn && checkInDate && !checkInDismissed && !checkins[checkInDate],
  );

  const saveCheckIn = (walked) => {
    if (!uid || !db || !checkInDate) return;
    createMovementCheckinStore({ db, uid }).write(checkInDate, walked)
      .then((saved) => {
        if (saved) setCheckins((prev) => ({ ...prev, [checkInDate]: saved }));
      })
      .catch(() => {});
  };

  return (
    <section className="kf-focus" aria-label="KENTU Focus">
      {showCheckIn ? (
        <article className="kf-focus-checkin">
          <div>
            <p>Ieri quanto hai camminato?</p>
            <span>È una stima. Se la camminata è già nel diario, resta quella.</span>
          </div>
          <button type="button" className="kf-focus-checkin-close" onClick={() => setCheckInDismissed(true)} aria-label="Chiudi il check-in">
            ×
          </button>
          <div className="kf-focus-checkin-options">
            {WALK_CHECKIN_OPTIONS.map((option) => (
              <button key={option.id} type="button" onClick={() => saveCheckIn(option.id)}>
                {option.label}
              </button>
            ))}
          </div>
        </article>
      ) : null}
      <div className="kf-focus-tabs" role="tablist" aria-label="Periodo">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className="kf-focus-tab"
            aria-selected={periodId === tab.id}
            onClick={() => onSelectPeriod(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="kf-focus-period">
        <button type="button" className="kf-focus-arrow" aria-label="Periodo precedente" onClick={() => onCursor(cursor - 1)}>
          ‹
        </button>
        <div className="kf-focus-period-main">
          <span className="kf-focus-dot" style={dotStyle(period, viewingToday)} aria-hidden="true" />
          <div className="kf-focus-period-copy">
            <strong>{periodWindow?.label}</strong>
            <span>{calibrating ? 'in apprendimento' : statusWord(period, viewingToday)}</span>
            {import.meta.env.DEV ? <span className="kf-focus-dev">{devLine(period, liveDays[periodWindow?.analysisDate])}</span> : null}
          </div>
        </div>
        <button
          type="button"
          className="kf-focus-arrow"
          aria-label="Periodo successivo"
          disabled={cursor >= 1}
          onClick={() => onCursor(cursor + 1)}
        >
          ›
        </button>
      </div>

      {periodId === 'mese' ? (
        <div className="kf-focus-month" aria-hidden="true">
          {DOW.map((label, index) => <span key={`${label}-${index}`} className="kf-focus-dow">{label}</span>)}
        </div>
      ) : null}

      <div className={periodId === 'mese' ? 'kf-focus-month' : 'kf-focus-strip'} role="group" aria-label="Calendario del periodo">
        {gridDates.map((date, index) => (
          date ? (
            <DayCell
              key={date}
              date={date}
              live={liveDays[date]}
              stored={storedScores[date]}
              selected={periodId === 'ieri' && date === periodWindow?.from}
              streak={calibrating ? '' : streakKind(date, streaks, liveDays[date])}
              onOpen={onOpenDay}
            />
          ) : <span key={`blank-${index}`} />
        ))}
      </div>

      <p className="kf-focus-legend">Blu: giornata sulla rotta · più intenso: muscoli allenati di recente · nero: giorno non registrato.</p>

      {calibrating ? (
        <p className="kf-focus-kicker">
          {`Kentu sta imparando le tue abitudini (giorno ${Math.max(Number(brief.calibration.day) || 0, 1)} di ${brief.calibration.total})`}
        </p>
      ) : null}

      {showBaselineHero ? (
        <article className="kf-focus-checkin" aria-label="La tua linea di partenza">
          <div>
            <p>La tua linea di partenza</p>
            {baselineWords(shownBaseline).map((line) => (
              <span key={line} style={{ display: 'block' }}>{line}</span>
            ))}
            <button
              type="button"
              className="kf-focus-regen"
              style={{ marginTop: 10 }}
              onClick={dismissBaselineCard}
            >
              Ho capito
            </button>
          </div>
        </article>
      ) : null}

      {periodId === 'mese' && period && !calibrating ? (
        <p className="kf-focus-month-note">
          {period.onTrackDays} giorni sulla rotta
          {' · '}
          {Number(period.longestStreak) >= 3
            ? `scia più lunga: ${period.longestStreak} giorni${longestDates(period)}`
            : 'Nessuna scia ancora'}
        </p>
      ) : null}

      {!viewingToday && (aiState?.status === 'loading' || aiState?.busy) ? (
        <p className="kf-focus-preparing" aria-live="polite">
          Sto preparando il rapporto di ieri…
        </p>
      ) : null}

      {viewingToday ? (
        <div className="kf-focus-progress">
          <p className="kf-focus-kicker">In corso</p>
          {logged.length === 0 ? <p>Per ora non c’è nulla di registrato.</p> : logged.map((line) => <p key={line}>{line}</p>)}
          <p>Il giudizio arriva domattina.</p>
        </div>
      ) : (
        <>
          {headline ? <h2 className="kf-focus-headline">{headline}</h2> : null}
          <div>
            {(brief?.pillars || []).filter((item) => item.status !== 'inactive').map((item) => {
              const meta = PILLARS.find((pillar) => pillar.id === item.id);
              if (!meta) return null;
              const aiLine = (analysis?.pillars || []).find((row) => row.id === item.id)?.line;
              const codeLine = (composed?.pillars || []).find((row) => row.id === item.id)?.line;
              const line = item.status === 'no_data'
                ? 'non registrato'
                : shownPillarLine(item.id, aiLine, codeLine, item.keyFact);
              const open = openPillar === item.id;
              const Icon = meta.icon;
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    className="kf-focus-pillar"
                    aria-expanded={open}
                    onClick={() => setOpenPillar(open ? null : item.id)}
                  >
                    <span className="kf-focus-pillar-icon" style={{ '--kf-icon': `var(${meta.token})` }}>
                      <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span>
                      <b>{item.id === 'forza' ? forzaLabel : meta.label}</b>
                      <small>{line}</small>
                    </span>
                    <i className="kf-focus-status" style={{ '--kf-status': statusColor(item.status) }} aria-hidden="true" />
                  </button>
                  {open ? (
                    <div className="kf-focus-detail">
                      {item.keyFact ? <p>{item.keyFact}</p> : null}
                      {(item.penalties || []).map((id) => <p key={id}>{penaltyFact(id)}</p>)}
                      {sectionBody(deepDive, item.id)}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {actionText ? (
            <article className="kf-focus-action">
              <p className="kf-focus-kicker"><i />{actionKicker(actionHorizon)}</p>
              <p>{actionText}</p>
            </article>
          ) : null}

          {supportText ? (
            <article className="kf-focus-support">
              <p>{supportText}</p>
            </article>
          ) : null}

          {periodId === 'ieri' && session?.analysisDate ? (
            <DayScoreFeedback uid={uid} session={session} />
          ) : null}
        </>
      )}

      <details className="kf-focus-why">
        <summary>Perché te lo dico</summary>
        {shownBaseline ? (
          <div style={{ marginBottom: 12 }}>
            <p><strong>La tua linea di partenza</strong></p>
            {baselineWords(shownBaseline).map((line) => (
              <p key={`baseline-${line}`}>{line}</p>
            ))}
          </div>
        ) : null}
        {viewingToday || !deepDive?.lead ? null : <p>{deepDive.lead}</p>}
        {viewingToday ? null : (deepDive?.sections || []).map((section, index) => (
          <p key={section.id || section.title || index}>
            {section.title ? <strong>{section.title}. </strong> : null}
            {section.body || section.content || ''}
          </p>
        ))}
        {viewingToday ? null : limits.map((limit) => <p key={limit}>{limit}</p>)}
        {!viewingToday && (deepDive?.evidenceRefs || []).length > 0 ? (
          <p>Fonti: {(deepDive.evidenceRefs || []).map((item) => item?.label || item?.id || item).join(' · ')}</p>
        ) : null}
        <p id="focus-metodo">
          <a href="#focus-metodo">Il metodo</a>
          {' '}decide gli stati e i colori. Il testo non cambia il punteggio.
        </p>
        <button
          type="button"
          className="kf-focus-regen"
          disabled={aiState?.status === 'loading' || aiState?.busy}
          onClick={onRegenerate}
        >
          {aiState?.status === 'loading' ? 'Generazione…' : 'Rigenera analisi'}
        </button>
      </details>

      {(aiState?.historyRows || []).length > 0 ? (
        <aside className="kf-focus-history" aria-label="Storico">
          <h2>Storico</h2>
          <ul>
            {uniqueHistory(aiState.historyRows).map((row) => (
              <li key={`${row.periodId}_${row.windowKey}_${row.revisionId}`}>
                <button type="button" onClick={() => onOpenHistory?.(row)}>
                  {formatFocusHistoryLabel(row.periodId, row.windowKey || row.analysisDate) || row.windowLabel || row.windowKey}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {import.meta.env.DEV ? (
        <FocusCompoundFoodAuditDev session={session} />
      ) : null}
    </section>
  );
}

function DayCell({ date, live, stored, selected, streak, onOpen }) {
  const dayStatus = live?.dayStatus || 'hole';
  const score = stored?.version && stored.version === live?.version ? stored.score : live?.score;
  const color = dayColor(score, live?.forceIntensity, dayStatus);
  const future = dayStatus === 'future';
  const label = `${spokenDate(date)}, ${spokenStatus(dayStatus, score)}`;
  return (
    <button
      type="button"
      className={`kf-focus-day is-${color.kind}${dayStatus === 'unconfirmed' ? ' is-unconfirmed' : ''}${selected ? ' is-selected' : ''}${streak ? ` is-${streak}` : ''}`}
      style={color.kind === 'score' ? { background: color.background, color: color.color } : undefined}
      aria-label={label}
      aria-current={selected ? 'date' : undefined}
      disabled={future}
      onClick={() => onOpen?.(date)}
    >
      {dayStatus === 'paused' ? <Pause size={14} aria-hidden="true" /> : dayStatus === 'in_progress' ? 'OGGI' : String(Number(date.slice(8)))}
      {color.late ? <i className="kf-focus-mark" aria-hidden="true" /> : null}
      {color.approximate ? <span className="kf-focus-approx">≈</span> : null}
    </button>
  );
}

function gridOf(periodId, periodWindow) {
  if (!periodWindow) return [];
  if (periodId === 'mese') {
    const dates = datesBetween(periodWindow.from, periodWindow.to);
    const lead = (new Date(`${periodWindow.from}T12:00:00`).getDay() + 6) % 7;
    return [...Array(lead).fill(null), ...dates];
  }
  const week = periodId === 'settimana'
    ? { from: periodWindow.from, to: periodWindow.to }
    : weekOf(periodWindow.from);
  return datesBetween(week.from, week.to);
}

function matchingAnalysis(aiState, session, periodId) {
  const analysis = aiState?.analysis;
  if (!analysis || !session || aiState?.diaryStale) return null;
  if (analysis.schema && analysis.schema !== 'kentu.focusAiCoachAnalysis.v5') return null;
  const binding = aiState.binding || {};
  if (binding.periodId && binding.periodId !== periodId) return null;
  if (binding.analysisDate && binding.analysisDate !== session.analysisDate) return null;
  if (aiState.expectedDataVersion && binding.dataVersion && binding.dataVersion !== aiState.expectedDataVersion) {
    return null;
  }
  return analysis;
}

function loggedLines(score, forzaOn) {
  if (!score?.cylinders) return [];
  return PILLARS.filter((item) => item.id !== 'forza' || forzaOn).flatMap((item) => {
    const cylinder = score.cylinders[item.id];
    if (!cylinder || cylinder.status === 'no_data' || cylinder.status === 'inactive' || !cylinder.keyFact) return [];
    return [`${item.label}: ${cylinder.keyFact}`];
  });
}

function statusWord(period, inProgress) {
  if (inProgress) return 'in corso';
  if (!period || period.coverage < PERIOD_RULES.minCoverage || period.score == null) return 'dati insufficienti';
  if (period.score >= PILLAR_STATUS.onTrackMin) return 'sulla rotta';
  if (period.score >= PILLAR_STATUS.halfwayMin) return 'a metà';
  return 'fuori rotta';
}

function dotStyle(period, inProgress) {
  if (inProgress) return { background: 'var(--kf-none)', '--kf-dot-halo': 'rgba(139, 151, 166, 0.28)' };
  if (!period || period.coverage < PERIOD_RULES.minCoverage || period.score == null) {
    return { background: '#8b97a6', '--kf-dot-halo': 'rgba(139, 151, 166, 0.28)' };
  }
  const color = dayColor(period.score, 0, 'closed');
  const match = color.background.match(/rgb\([^)]+\)/);
  const ink = match ? match[0] : '#2f63d6';
  return { background: ink, '--kf-dot-halo': ink.replace('rgb', 'rgba').replace(')', ', 0.28)') };
}

function statusColor(status) {
  if (status === 'on_track') return 'var(--kf-positive)';
  if (status === 'halfway') return 'var(--kf-halfway)';
  if (status === 'off_track') return 'var(--kf-off)';
  return 'var(--kf-none)';
}

function streakKind(date, streaks, live) {
  const score = live?.score;
  const inside = (streaks || []).some((streak) => date >= streak.from && date <= streak.to);
  if (!inside || live?.dayStatus === 'hole') return '';
  if (score != null && score >= 0.5 && score < 0.75) return 'streak-pause';
  if (score != null && score >= 0.75) return 'streak';
  return '';
}

function longestDates(period) {
  const streak = [...(period.streaks || [])].sort((a, b) => b.length - a.length)[0];
  if (!streak || period.longestStreak < 1) return '';
  const from = streak.from.slice(8).replace(/^0/, '');
  const to = streak.to.slice(8).replace(/^0/, '');
  return ` (${from}–${to})`;
}

function spokenDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function spokenStatus(dayStatus, score) {
  if (dayStatus === 'hole') return 'non registrato';
  if (dayStatus === 'paused') return 'pausa';
  if (dayStatus === 'in_progress') return 'in corso';
  if (dayStatus === 'future') return 'futuro';
  if (dayStatus === 'late') return 'registrato dopo';
  if (dayStatus === 'approximate') return 'approssimato';
  if (score == null) return 'non registrato';
  if (score >= 0.75) return 'sulla rotta';
  if (score >= 0.45) return 'a metà';
  return 'fuori rotta';
}

function penaltyFact(id) {
  if (id === 'heavy_late_meal') return 'Cena abbondante.';
  if (id === 'late_meal_before_sleep') return 'Ultimo pasto vicino al sonno.';
  return 'Ultra-processato sfavorevole.';
}

function sectionBody(deepDive, id) {
  const section = (deepDive?.sections || []).find((item) => item.id === id || item.title?.toLowerCase() === id);
  const text = section?.body || section?.content;
  return text ? <p>{text}</p> : null;
}

function devLine(period, day) {
  const periodScore = period?.score == null ? 'senza media' : period.score.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const dayScore = day?.score == null ? 'giorno senza numero' : day.score.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return `${periodScore} · ${dayScore}`;
}
