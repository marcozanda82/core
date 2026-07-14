import { useCallback, useEffect, useMemo, useState } from 'react';
import { KentuButton } from './kentuos/KentuOSUI';
import { resolveFoodItemForProposal } from '../utils/foodResolver.js';

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

function roundMacro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
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

function cloneProposal(proposal) {
  return cloneProposals([proposal])[0];
}

function scaleItemMacros(item, newGrams) {
  const oldGrams = Math.round(Number(item?.grams ?? item?.qta) || 0);
  const grams = Math.max(1, Math.round(Number(newGrams) || 0));
  if (oldGrams <= 0) return { ...item, grams };
  const ratio = grams / oldGrams;
  return {
    ...item,
    grams,
    kcal: roundMacro((Number(item.kcal) || 0) * ratio),
    pro: roundMacro((Number(item.pro) || 0) * ratio),
    carbo: roundMacro((Number(item.carbo) || 0) * ratio),
    fat: roundMacro((Number(item.fat) || 0) * ratio),
  };
}

function recalcItemMacros(item, foodDatabase, fullHistory, mealType) {
  const foodName = String(item?.foodName || item?.name || '').trim();
  const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qta) || 0));
  if (!foodName) return { ...item, grams };

  const resolved = resolveFoodItemForProposal(foodName, grams, {
    foodDb: foodDatabase || {},
    fullHistory: fullHistory || {},
    mealType,
    preferredDbKey: item?.foodDbKey,
  });

  if (!resolved) {
    return scaleItemMacros({ ...item, grams }, grams);
  }

  return {
    ...item,
    foodName: resolved.foodName || foodName,
    foodDbKey: resolved.foodDbKey ?? item.foodDbKey,
    grams: resolved.grams ?? grams,
    kcal: resolved.kcal,
    pro: resolved.pro,
    carbo: resolved.carbo,
    fat: resolved.fat,
    alternatives: resolved.alternatives ?? item.alternatives,
  };
}

function MealProposalItemRow({
  item,
  itemIdx,
  disabled,
  isEditing,
  onSelectAlternative,
  onEditName,
  onEditGrams,
  onRemoveItem,
}) {
  const [open, setOpen] = useState(false);
  const hasAlternatives = !isEditing && Array.isArray(item.alternatives) && item.alternatives.length > 1;
  const grams = Math.round(Number(item?.grams ?? item?.qta) || 0);
  const name = String(item?.foodName || item?.name || 'Alimento').trim();

  const handleSelect = (alternative) => {
    onSelectAlternative?.(itemIdx, alternative);
    setOpen(false);
  };

  if (isEditing) {
    return (
      <li className="kentu-meal-proposal-card__item kentu-meal-proposal-card__item--editing">
        <div className="kentu-meal-proposal-card__edit-fields">
          <input
            type="text"
            className="kentu-meal-proposal-card__edit-name"
            value={name}
            disabled={disabled}
            aria-label={`Nome alimento ${itemIdx + 1}`}
            onChange={(e) => onEditName?.(itemIdx, e.target.value)}
          />
          <input
            type="number"
            min={1}
            step={1}
            className="kentu-meal-proposal-card__edit-grams"
            value={grams > 0 ? grams : ''}
            disabled={disabled}
            aria-label={`Grammi ${name}`}
            onChange={(e) => onEditGrams?.(itemIdx, e.target.value)}
          />
          <span className="kentu-meal-proposal-card__edit-grams-suffix">g</span>
          <button
            type="button"
            className="kentu-meal-proposal-card__edit-remove"
            disabled={disabled}
            aria-label={`Rimuovi ${name}`}
            title="Rimuovi alimento"
            onClick={() => onRemoveItem?.(itemIdx)}
          >
            🗑️
          </button>
        </div>
      </li>
    );
  }

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

function MealProposalCard({
  proposal,
  index,
  adviceId,
  isLoaded,
  foodDatabase,
  fullHistory,
  onConfirm,
  onDraftChange,
}) {
  const id = String(proposal?.id || `proposal_${index}`);
  const [localProposal, setLocalProposal] = useState(() => cloneProposal(proposal));
  const [isEditing, setIsEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState(null);

  useEffect(() => {
    setLocalProposal(cloneProposal(proposal));
    setIsEditing(false);
    setEditSnapshot(null);
  }, [proposal]);

  const label = String(localProposal?.label || localProposal?.name || `Opzione ${index + 1}`).trim();
  const mealType = String(localProposal?.mealType || 'pranzo').trim();
  const exactTime = String(localProposal?.exactTime || localProposal?.timeString || '').trim();
  const badgeText = exactTime
    ? `${mealLabel(mealType)} • ${exactTime}`
    : mealLabel(mealType);
  const items = Array.isArray(localProposal?.items) ? localProposal.items : [];
  const totals = formatMacroTotals(localProposal?.totals || sumItemMacros(items));
  const canSaveOrConfirm = items.length > 0;

  const commitProposal = useCallback((nextProposal) => {
    setLocalProposal(nextProposal);
    onDraftChange?.(index, nextProposal);
  }, [index, onDraftChange]);

  const handleSelectAlternative = useCallback((itemIndex, alternative) => {
    if (!alternative) return;
    const nextItems = items.map((item, ii) => {
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
    commitProposal({
      ...localProposal,
      items: nextItems,
      totals: sumItemMacros(nextItems),
    });
  }, [commitProposal, items, localProposal]);

  const handleEditName = useCallback((itemIndex, value) => {
    const nextItems = items.map((item, ii) => (
      ii === itemIndex ? { ...item, foodName: value } : item
    ));
    setLocalProposal((prev) => ({ ...prev, items: nextItems }));
  }, [items]);

  const handleEditGrams = useCallback((itemIndex, value) => {
    const parsed = Math.max(1, Math.round(Number(value) || 0));
    const nextItems = items.map((item, ii) => (
      ii === itemIndex ? { ...item, grams: parsed } : item
    ));
    setLocalProposal((prev) => ({ ...prev, items: nextItems }));
  }, [items]);

  const handleRemoveItem = useCallback((itemIndex) => {
    const nextItems = items.filter((_, ii) => ii !== itemIndex);
    setLocalProposal((prev) => ({
      ...prev,
      items: nextItems,
      totals: sumItemMacros(nextItems),
    }));
  }, [items]);

  const handleStartEdit = () => {
    setEditSnapshot(cloneProposal(localProposal));
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    if (editSnapshot) {
      commitProposal(editSnapshot);
    }
    setEditSnapshot(null);
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    const nextItems = items.map((item) => recalcItemMacros(
      item,
      foodDatabase,
      fullHistory,
      mealType,
    ));
    commitProposal({
      ...localProposal,
      items: nextItems,
      totals: sumItemMacros(nextItems),
    });
    setEditSnapshot(null);
    setIsEditing(false);
  };

  return (
    <article className={`kentu-meal-proposal-card${isEditing ? ' kentu-meal-proposal-card--editing' : ''}`}>
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
              isEditing={isEditing}
              onSelectAlternative={handleSelectAlternative}
              onEditName={handleEditName}
              onEditGrams={handleEditGrams}
              onRemoveItem={handleRemoveItem}
            />
          ))}
        </ul>
      ) : null}

      <footer className="kentu-meal-proposal-card__footer">
        {isEditing ? (
          <>
            <KentuButton
              variant="primary"
              className="kentu-meal-proposal-card__save"
              disabled={isLoaded || !canSaveOrConfirm}
              onClick={handleSaveEdit}
            >
              Salva Modifiche
            </KentuButton>
            <KentuButton
              variant="secondary"
              className="kentu-meal-proposal-card__cancel"
              disabled={isLoaded}
              onClick={handleCancelEdit}
            >
              Annulla
            </KentuButton>
          </>
        ) : (
          <>
            <KentuButton
              variant="primary"
              className={`kentu-meal-proposal-card__confirm${isLoaded ? ' kentu-meal-proposal-card__confirm--loaded' : ''}`}
              disabled={isLoaded || !canSaveOrConfirm}
              onClick={() => {
                if (isLoaded || !canSaveOrConfirm) return;
                onConfirm?.(localProposal, index, adviceId);
              }}
            >
              {isLoaded ? 'Caricato ✓' : 'Conferma e carica'}
            </KentuButton>
            {!isLoaded ? (
              <KentuButton
                variant="secondary"
                className="kentu-meal-proposal-card__modify"
                onClick={handleStartEdit}
              >
                Modifica
              </KentuButton>
            ) : null}
          </>
        )}
      </footer>
    </article>
  );
}

/**
 * Card compatte per proposte pasto Cameriere (mealProposals da ADVICE).
 */
export default function MealProposalCards({
  proposals = [],
  adviceId,
  loadedProposalIds = [],
  foodDatabase = {},
  fullHistory = {},
  onConfirm,
}) {
  const [draftProposals, setDraftProposals] = useState(() => cloneProposals(proposals));

  useEffect(() => {
    setDraftProposals(cloneProposals(proposals));
  }, [proposals]);

  const loadedSet = useMemo(
    () => new Set((loadedProposalIds || []).map(String)),
    [loadedProposalIds],
  );

  const handleDraftChange = useCallback((proposalIndex, nextProposal) => {
    setDraftProposals((prev) =>
      prev.map((proposal, pi) => (pi === proposalIndex ? nextProposal : proposal)),
    );
  }, []);

  if (!Array.isArray(draftProposals) || draftProposals.length === 0) return null;

  return (
    <div className="kentu-meal-proposals">
      {draftProposals.map((proposal, index) => {
        const id = String(proposal?.id || `proposal_${index}`);
        const isLoaded = loadedSet.has(id);

        return (
          <MealProposalCard
            key={id}
            proposal={proposal}
            index={index}
            adviceId={adviceId}
            isLoaded={isLoaded}
            foodDatabase={foodDatabase}
            fullHistory={fullHistory}
            onConfirm={onConfirm}
            onDraftChange={handleDraftChange}
          />
        );
      })}
    </div>
  );
}
