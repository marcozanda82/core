import { useEffect, useMemo, useState } from 'react';
import { get, ref } from 'firebase/database';
import { db } from '../../../firebaseConfig.js';
import { focusLocalIsoDate } from '../product/loadFocusAuthenticatedDiary.js';
import { computeDayScore } from './computeDayScore.js';
import { dayScoreColor } from './scoreColor.js';
import {
  createMovementCheckinStore,
  forzaSettingPath,
  WALK_CHECKIN_OPTIONS,
} from './movementCheckin.js';

/**
 * Colore, movimento e forza del giorno, più la domanda sulla camminata di ieri.
 * Non scrive pareri di prova e non modifica il punteggio da un feedback.
 */
export default function DayScorePanel({ uid, session }) {
  const date = session?.analysisDate || null;
  const [forzaOn, setForzaOn] = useState(false);
  const [forzaKnown, setForzaKnown] = useState(false);
  const [checkins, setCheckins] = useState({});
  const [walked, setWalked] = useState(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!uid || !db) {
      setForzaKnown(true);
      return undefined;
    }
    let cancelled = false;
    Promise.all([
      get(ref(db, forzaSettingPath(uid))).catch(() => null),
      createMovementCheckinStore({ db, uid }).readAll().catch(() => ({})),
    ]).then(([enabledSnap, saved]) => {
      if (cancelled) return;
      setForzaOn(enabledSnap?.val?.() === true || enabledSnap?.val?.() === 'true');
      setForzaKnown(true);
      setCheckins(saved || {});
      if (date && saved?.[date]) setWalked(saved[date].walked);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, date]);

  const score = useMemo(() => {
    if (!date) return null;
    return computeDayScore(date, {
      today: focusLocalIsoDate(),
      fullHistory: session?.fullHistory,
      userTargets: session?.userTargets,
      profile_targets: session?.profile_targets,
      cylinders: { forza: { enabled: forzaOn } },
      movementCheckins: checkins,
    });
  }, [date, session?.fullHistory, session?.profile_targets, session?.userTargets, forzaOn, checkins]);

  const chooseWalk = async (id) => {
    setWalked(id);
    if (!uid || !date || !db) return;
    setStatus('saving');
    try {
      const saved = await createMovementCheckinStore({ db, uid }).write(date, id);
      setCheckins((prev) => ({ ...prev, [date]: saved }));
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  if (!date || !score) return null;
  const color = dayScoreColor(score.score, score.forceIntensity);
  const movimento = score.cylinders.movimento;
  const forza = score.cylinders.forza;
  const diaryWins = movimento?.signals?.includes('diary_movement') || movimento?.signals?.includes('steps');
  const showEngineNumbers = import.meta.env.DEV;

  return (
    <section className="kf-day-score" aria-label="Pilastri del giorno">
      <p className="kf-day-score-line">Pilastri</p>
      <div className="kf-day-score-swatch" style={{ background: color.hex }} />
      {showEngineNumbers ? (
        <p className="kf-day-score-line">
          {score.score == null ? 'Senza punteggio' : score.score.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
          {forzaOn ? ` · forza ${Number(score.forceIntensity || 0).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : ''}
        </p>
      ) : null}
      <p className="kf-day-score-line">Movimento · {movimento?.keyFact}</p>
      {!forzaKnown ? null : forzaOn ? (
        <p className="kf-day-score-line">Forza · {forza?.keyFact}</p>
      ) : (
        <p className="kf-day-score-line kf-day-score-line--off">Forza · non attiva</p>
      )}

      <h2 className="kf-score-feedback-title">Ieri quanto hai camminato?</h2>
      <div className="kf-score-feedback-choices" role="group">
        {WALK_CHECKIN_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={walked === option.id ? 'is-selected' : ''}
            aria-pressed={walked === option.id}
            onClick={() => chooseWalk(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="kf-score-feedback-note">
        {diaryWins ? 'Nel diario c’è già un movimento: vale quello.' : 'È una stima, finché non registri l’attività.'}
        {status === 'saved' ? ' Salvata.' : ''}
        {status === 'error' ? ' Non sono riuscito a salvare la stima.' : ''}
      </p>
    </section>
  );
}
