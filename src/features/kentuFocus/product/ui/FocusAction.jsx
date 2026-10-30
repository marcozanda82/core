import React from 'react';
import { Target } from 'lucide-react';

/**
 * Card azione del giorno.
 * @param {{
 *   text?: string|null,
 *   label?: string,
 *   motive?: string|null,
 * }} props
 */
export function FocusAction({ text, label = 'Oggi prova così', motive = null }) {
  const body = String(text || '').trim();
  if (!body) return null;

  return (
    <section className="kf-v-action" aria-label={label}>
      <div className="kf-v-action-chip" aria-hidden="true">
        <Target size={18} strokeWidth={2.25} />
      </div>
      <p className="kf-v-action-label">{label}</p>
      <p className="kf-v-action-text">{body}</p>
      {motive ? <p className="kf-v-action-motive">{motive}</p> : null}
    </section>
  );
}

export default FocusAction;
