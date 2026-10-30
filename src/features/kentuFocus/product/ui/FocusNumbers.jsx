import React, { useMemo } from 'react';
import { AreaChip } from './AreaChip.jsx';
import { EnergySparkline } from './EnergySparkline.jsx';
import { buildFocusNumberCards } from './buildFocusNumberCards.js';

/**
 * @param {{
 *   session: object|null|undefined,
 *   periodId: string,
 *   toImprove?: object[],
 *   openDetail?: string|null,
 *   onOpenDetail?: Function,
 * }} props
 */
export function FocusNumbers({
  session,
  periodId,
  toImprove = [],
  openDetail = null,
  onOpenDetail = null,
}) {
  const improveAreas = useMemo(() => {
    const set = new Set();
    for (const row of toImprove || []) {
      if (row?.area) set.add(String(row.area).toLowerCase());
    }
    return set;
  }, [toImprove]);

  const model = useMemo(
    () => buildFocusNumberCards(session, periodId, { toImproveAreas: improveAreas }),
    [session, periodId, improveAreas],
  );

  const title = periodId === 'settimana'
    ? 'La settimana in numeri'
    : periodId === 'mese'
      ? 'Il mese in numeri'
      : 'Ieri in numeri';

  const energy = model.energy;

  const renderCard = (card, { wide = false } = {}) => {
    const className = [
      'kf-v-num-card',
      wide ? 'kf-v-num-card--wide' : '',
      !card.hasData ? 'kf-v-num-card--empty' : '',
      card.flagged ? 'kf-v-num-card--flagged' : '',
    ].filter(Boolean).join(' ');

    const body = (
      <>
        <AreaChip area={card.area} size="sm" />
        <span className="kf-v-num-card-label">{card.label}</span>
        <strong className="kf-v-num-card-value">{card.value}</strong>
        {card.subtitle ? <p className="kf-v-num-card-sub">{card.subtitle}</p> : null}
        {wide && card.excursionLine ? (
          <p className="kf-v-num-card-excursion">{card.excursionLine}</p>
        ) : null}
        {wide && card.hasData ? (
          <EnergySparkline
            points={card.sparkPoints}
            targetKcal={card.targetKcal}
            analysisDate={session?.analysisDate}
          />
        ) : null}
      </>
    );

    if (!card.detailKey || !onOpenDetail) {
      return <div key={card.area} className={className}>{body}</div>;
    }

    return (
      <button
        key={card.area}
        type="button"
        className={className}
        aria-pressed={openDetail === card.detailKey}
        onClick={() => onOpenDetail(card.detailKey)}
      >
        {body}
      </button>
    );
  };

  return (
    <section className="kf-v-numbers" aria-label={title}>
      <h2 className="kf-v-section-title">{title}</h2>
      {renderCard(energy, { wide: true })}
      <div className="kf-v-num-grid">
        {model.grid.map((card) => renderCard(card))}
      </div>
    </section>
  );
}

export default FocusNumbers;
