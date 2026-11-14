import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebaseConfig.js';
import {
  createScoreFeedbackStore,
  groupDisagreements,
  SCORE_FEEDBACK_ANSWERS,
} from '../features/kentuFocus/score/scoreFeedback.js';
import './kentuFocusPage.css';

/**
 * Revisione DEV dei pareri «Ti torna?», per mese.
 * I disaccordi sono raggruppati per cilindro più basso e segnali attivi.
 */
export default function ScoreFeedbackReviewPage() {
  const { user, authReady } = useAuth();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!authReady) return undefined;
    if (!user?.uid || !db) {
      setStatus('empty');
      return undefined;
    }
    let cancelled = false;
    createScoreFeedbackStore({ db, uid: user.uid }).readAll()
      .then((entries) => {
        if (cancelled) return;
        setRows(entries);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [authReady, user?.uid]);

  const months = useMemo(() => {
    const byMonth = new Map();
    for (const row of rows) {
      const month = String(row.date || '').slice(0, 7);
      const list = byMonth.get(month) || [];
      list.push(row);
      byMonth.set(month, list);
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, entries]) => ({
        month,
        entries,
        disagreements: groupDisagreements(entries),
      }));
  }, [rows]);

  return (
    <main className="kf-feedback-review">
      <p><Link to="/kentu-focus">← Focus</Link></p>
      <h1>Pareri sul punteggio</h1>
      <p>Il parere non modifica il punteggio. Qui si rileggono i disaccordi.</p>
      {status === 'loading' ? <p>Carico i pareri…</p> : null}
      {status === 'error' ? <p>Non riesco a leggere i pareri.</p> : null}
      {status === 'empty' ? <p>Serve un accesso per leggere i pareri.</p> : null}
      {status === 'ready' && months.length === 0 ? <p>Nessun parere salvato.</p> : null}
      {months.map((block) => (
        <section key={block.month}>
          <h2>{block.month}</h2>
          <ul>
            {block.entries.map((entry) => (
              <li key={entry.date}>
                {entry.date}
                {' · '}
                {SCORE_FEEDBACK_ANSWERS[entry.answer] || entry.answer}
                {entry.reason ? ` · ${entry.reason}` : ''}
                {entry.score != null ? ` · ${entry.score}` : ''}
              </li>
            ))}
          </ul>
          <h3>Disaccordi per tipo di giornata</h3>
          {block.disagreements.length === 0 ? <p>Nessun disaccordo in questo mese.</p> : (
            <ul>
              {block.disagreements.map((group) => (
                <li key={group.key}>
                  {group.key}
                  {' · '}
                  {group.count}
                  {' · '}
                  {group.dates.join(', ')}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}
