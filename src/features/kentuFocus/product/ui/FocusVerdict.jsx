import React from 'react';
import { Check, Clock3 } from 'lucide-react';
import { AreaChip } from './AreaChip.jsx';

/**
 * Griglia Bene / Da migliorare.
 * @param {{
 *   wentWell?: object[],
 *   toImprove?: object[],
 * }} props
 */
export function FocusVerdict({ wentWell = [], toImprove = [] }) {
  const good = Array.isArray(wentWell) ? wentWell.filter((r) => r?.text) : [];
  const improve = Array.isArray(toImprove) ? toImprove.filter((r) => r?.text) : [];
  if (!good.length && !improve.length) return null;

  const both = good.length > 0 && improve.length > 0;

  return (
    <section
      className={`kf-v-verdict${both ? '' : ' kf-v-verdict--single'}`}
      aria-label="Sintesi Bene e Da migliorare"
    >
      {good.length > 0 ? (
        <div className="kf-v-verdict-col kf-v-verdict-col--good">
          <header className="kf-v-verdict-head">
            <span className="kf-v-verdict-mark kf-v-verdict-mark--good" aria-hidden="true">
              <Check size={18} strokeWidth={2.5} />
            </span>
            <h3>Bene</h3>
          </header>
          <ul className="kf-v-verdict-list">
            {good.map((row, i) => (
              <li key={`ww_${i}`}>
                {row.area ? <AreaChip area={row.area} size="sm" /> : null}
                <p>{row.text}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {improve.length > 0 ? (
        <div className="kf-v-verdict-col kf-v-verdict-col--improve">
          <header className="kf-v-verdict-head">
            <span className="kf-v-verdict-mark kf-v-verdict-mark--improve" aria-hidden="true">
              <Clock3 size={18} strokeWidth={2.4} />
            </span>
            <h3>Da migliorare</h3>
          </header>
          <ul className="kf-v-verdict-list">
            {improve.map((row, i) => (
              <li key={`ti_${i}`}>
                {row.area ? <AreaChip area={row.area} size="sm" /> : null}
                <p>{row.text}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export default FocusVerdict;
