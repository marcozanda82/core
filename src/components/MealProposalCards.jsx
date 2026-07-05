import { useCallback, useEffect, useMemo, useState } from 'react';
import { KentuButton } from './kentuos/KentuOSUI';

const MEAL_LABELS = {
  colazione: 'Colazione',
  snack: 'Snack',
  pranzo: 'Pranzo',
  cena: 'Cena',
};

function mealLabel(mealType) {
  const base = String(mealType || '').split('_')[0].toLowerCase();
  return MEAL_LABELS[base] || base || 'Pasto';
}

function formatMacroTotals(totals) {
  const t = totals && typeof totals === 'object' ? totals : {};
  return {
    kcal: Math.round(Number(t.kcal) || 0),
    pro: Math.round(Number(t.pro) || 0),
    carbo: Math.round(Number(t.carbo) || 0),
    fat: Math.round(Number(t.fat) || 0),
  };
}

function sumItemMacros(items) {
  return (items || []).reduce(
    (acc, item) => ({
      kcal: acc.kcal + (Number(item.kcal) || 0),
      pro: acc.pro + (Number(item.pro) || 0),
      carbo: acc.carbo + (Number(item.carbo) || 0),
      fat: acc.fat + (Number(item.fat) || 0),
    }),
    { kcal: 0, pro: 0, carbo: 0, fat: 0 },
  );
}

function cloneProposals(proposals) {
  return (proposals || []).map((proposal) => ({
    ...proposal,
    items: Array.isArray(proposal.items)
      ? proposal.items.map((item) => ({
          ...item,
          alternatives: Array.isArray(item.alternatives)
            ? item.alternatives.map((alt) => ({ ...alt }))
            : [],
        }))
      : [],
    totals: proposal.totals ? { ...proposal.totals } : undefined,
  }));
}

function MealProposalItemRow({
  item,
  itemIdx,
  disabled,
  onSelectAlternative,
}) {
  const [open, setOpen] = useState(false);
  const hasAlternatives = Array.isArray(item.alternatives) && item.alternatives.length > 1;
  const grams = Math.round(Number(item?.grams ?? item?.qta) || 0);
  const name = String(item?.foodName || item?.name || 'Alimento').trim();

  const handleSelect = (alternative) => {
    onSelectAlternative?.(itemIdx, alternative);
    setOpen(false);
  };

  return (
    <li className={`kentu-meal-proposal-card__item${hasAlternatives ? ' kentu-meal-proposal-card__item--ambiguous' : ''}`}>
      <div className="kentu-meal-proposal-card__item-main">
        {hasAlternatives ? (
          <>
            <button
              type="button"
              className="kentu-meal-proposal-card__item-picker"
              disabled={disabled}
              aria-expanded={open}
              aria-haspopup="listbox"
              onClick={() => setOpen((prev) => !prev)}
            >
              <span className="kentu-meal-proposal-card__item-picker-icon" aria-hidden>🔄</span>
              <span className="kentu-meal-proposal-card__item-name">{name}</span>
              <span className="kentu-meal-proposal-card__item-chevron" aria-hidden>{open ? '▴' : '▾'}</span>
            </button>
            {open ? (
              <ul className="kentu-meal-proposal-card__alternatives" role="listbox">
                {item.alternatives.map((alt) => {
                  const altKey = String(alt.foodDbKey || alt.foodName);
                  const isActive = String(item.foodDbKey || '') === altKey
                    || name.toLowerCase() === String(alt.foodName || '').toLowerCase();
                  return (
                    <li key={altKey} role="option" aria-selected={isActive}>
                      <button
                        type="button"
                        className={`kentu-meal-proposal-card__alternative${isActive ? ' kentu-meal-proposal-card__alternative--active' : ''}`}
                        onClick={() => handleSelect(alt)}
                      >
                        <span className="kentu-meal-proposal-card__alternative-name">
                          {alt.foodName}
                        </span>
                        <span className="kentu-meal-proposal-card__alternative-meta">
                          {Math.round(Number(alt.kcal) || 0)} kcal · P {Math.round(Number(alt.pro) || 0)}g
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </>
        ) : (
          <span className="kentu-meal-proposal-card__item-name">{name}</span>
        )}
      </div>
      <span className="kentu-meal-proposal-card__item-grams">{grams}g</span>
    </li>
  );
}

/**
 * Card compatte per proposte pasto Cameriere (mealProposals da ADVICE).
 */
export default function MealProposalCards({
  proposals = [],
  adviceId,
  loadedProposalIds = [],
  onConfirm,
  onModify,
}) {
  const [draftProposals, setDraftProposals] = useState(() => cloneProposals(proposals));

  useEffect(() => {
    setDraftProposals(cloneProposals(proposals));
  }, [proposals]);

  const loadedSet = useMemo(
    () => new Set((loadedProposalIds || []).map(String)),
    [loadedProposalIds],
  );

  const handleSelectAlternative = useCallback((proposalIndex, itemIndex, alternative) => {
    if (!alternative) return;
    setDraftProposals((prev) =>
      prev.map((proposal, pi) => {
        if (pi !== proposalIndex) return proposal;
        const items = (proposal.items || []).map((item, ii) => {
          if (ii !== itemIndex) return item;
          return {
            ...item,
            foodDbKey: alternative.foodDbKey,
            foodName: alternative.foodName,
            kcal: alternative.kcal,
            pro: alternative.pro,
            carbo: alternative.carbo,
            fat: alternative.fat,
            alternatives: item.alternatives,
          };
        });
        return {
          ...proposal,
          items,
          totals: sumItemMacros(items),
        };
      }),
    );
  }, []);

  if (!Array.isArray(draftProposals) || draftProposals.length === 0) return null;

  return (
    <div className="kentu-meal-proposals">
      {draftProposals.map((proposal, index) => {
        const id = String(proposal?.id || `proposal_${index}`);
        const isLoaded = loadedSet.has(id);
        const label = String(proposal?.label || proposal?.name || `Proposta ${index + 1}`).trim();
        const mealType = String(proposal?.mealType || 'pranzo').trim();
        const exactTime = String(proposal?.exactTime || proposal?.timeString || '').trim();
        const badgeText = exactTime
          ? `${mealLabel(mealType)} • ${exactTime}`
          : mealLabel(mealType);
        const items = Array.isArray(proposal?.items) ? proposal.items : [];
        const totals = formatMacroTotals(proposal?.totals || sumItemMacros(items));

        return (
          <article key={id} className="kentu-meal-proposal-card">
            <header className="kentu-meal-proposal-card__head">
              <div className="kentu-meal-proposal-card__titles">
                <span className="kentu-meal-proposal-card__badge">{badgeText}</span>
                <h4 className="kentu-meal-proposal-card__label">{label}</h4>
              </div>
              <div className="kentu-meal-proposal-card__macros" aria-label="Macronutrienti stimati">
                <span className="kentu-meal-proposal-card__macro kentu-meal-proposal-card__macro--kcal">
                  {totals.kcal} kcal
                </span>
                <span className="kentu-meal-proposal-card__macro">P {totals.pro}g</span>
                <span className="kentu-meal-proposal-card__macro">C {totals.carbo}g</span>
                <span className="kentu-meal-proposal-card__macro">G {totals.fat}g</span>
              </div>
            </header>

            {items.length > 0 ? (
              <ul className="kentu-meal-proposal-card__items">
                {items.map((item, itemIdx) => (
                  <MealProposalItemRow
                    key={`${id}_${itemIdx}_${item.foodDbKey || item.foodName}`}
                    item={item}
                    itemIdx={itemIdx}
                    disabled={isLoaded}
                    onSelectAlternative={(itemIndex, alternative) => {
                      handleSelectAlternative(index, itemIndex, alternative);
                    }}
                  />
                ))}
              </ul>
            ) : null}

            <footer className="kentu-meal-proposal-card__footer">
              <KentuButton
                variant="primary"
                className={`kentu-meal-proposal-card__confirm${isLoaded ? ' kentu-meal-proposal-card__confirm--loaded' : ''}`}
                disabled={isLoaded}
                onClick={() => {
                  if (isLoaded) return;
                  onConfirm?.(proposal, index, adviceId);
                }}
              >
                {isLoaded ? 'Caricato ✓' : 'Conferma e carica'}
              </KentuButton>
              {typeof onModify === 'function' && !isLoaded ? (
                <KentuButton
                  variant="secondary"
                  className="kentu-meal-proposal-card__modify"
                  onClick={() => onModify(proposal, index, adviceId)}
                >
                  Modifica
                </KentuButton>
              ) : null}
            </footer>
          </article>
        );
      })}
    </div>
  );
}
