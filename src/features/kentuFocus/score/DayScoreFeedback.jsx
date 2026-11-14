import { useEffect, useMemo, useState } from 'react';
import { db } from '../../../firebaseConfig.js';
import { focusLocalIsoDate } from '../product/loadFocusAuthenticatedDiary.js';
import { computeDayScore } from './computeDayScore.js';
import {
  createScoreFeedbackStore,
  SCORE_FEEDBACK_ANSWERS,
  SCORE_FEEDBACK_REASON_MAX,
} from './scoreFeedback.js';

/**
 * Domanda sul rapporto di ieri. Salva il parere e non tocca il punteggio.
 */
export default function DayScoreFeedback({ uid, session }) {
  const date = session?.analysisDate || null;
  const snapshot = useMemo(() => {
    if (!date) return null;
    return computeDayScore(date, {
      today: focusLocalIsoDate(),
      fullHistory: session?.fullHistory,
      userTargets: session?.userTargets,
      profile_targets: session?.profile_targets,
    });
  }, [date, session?.fullHistory, session?.profile_targets, session?.userTargets]);

  const [answer, setAnswer] = useState(null);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (!uid || !date || !db) return undefined;
    let cancelled = false;
    createScoreFeedbackStore({ db, uid }).read(date)
      .then((saved) => {
        if (cancelled || !saved) return;
        setAnswer(saved.answer);
        setReason(saved.reason || '');
        setStatus('saved');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [uid, date]);

  const choose = async (next) => {
    setAnswer(next);
    if (!uid || !date || !db || !snapshot) {
      setStatus('local');
      return;
    }
    setStatus('saving');
    try {
      await createScoreFeedbackStore({ db, uid }).write(date, {
        answer: next,
        reason,
        scoreVersion: snapshot.version,
        score: snapshot.score,
        cylinders: snapshot.cylinders,
        answeredAt: Date.now(),
      });
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  };

  if (!date || !snapshot) return null;

  return (
    <section className="kf-score-feedback" aria-label="Ti torna?">
      <h2 className="kf-score-feedback-title">Ti torna?</h2>
      <div className="kf-score-feedback-choices" role="group">
        {Object.entries(SCORE_FEEDBACK_ANSWERS).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={answer === id ? 'is-selected' : ''}
            aria-pressed={answer === id}
            onClick={() => choose(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="kf-score-feedback-why">
        perché
        <textarea
          maxLength={SCORE_FEEDBACK_REASON_MAX}
          value={reason}
          placeholder="facoltativo"
          onChange={(event) => setReason(event.target.value.slice(0, SCORE_FEEDBACK_REASON_MAX))}
          onBlur={() => {
            if (answer) choose(answer);
          }}
        />
      </label>
      <p className="kf-score-feedback-note">
        {status === 'saving' ? 'Salvo…' : null}
        {status === 'saved' ? 'Salvato. Il punteggio non cambia.' : null}
        {status === 'error' ? 'Non sono riuscito a salvare il parere.' : null}
        {status === 'local' ? 'Parere solo su questo schermo: manca l’accesso.' : null}
        {status === 'idle' ? `${reason.length}/${SCORE_FEEDBACK_REASON_MAX}` : null}
      </p>
    </section>
  );
}
