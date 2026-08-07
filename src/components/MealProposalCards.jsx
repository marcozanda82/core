import { useCallback, useEffect, useMemo, useState } from 'react';
import { KentuButton } from './kentuos/KentuOSUI';
import {
  FOOD_RESOLUTION_STATUS,
  resolveFoodItemForProposal,
} from '../utils/foodResolver.js';
import {
  mealUpsertBadgeLabel,
  resolveUpsertActionFromPayload,
} from '../features/commandTerminal/meals/mealUpsert.js';
import MealReceiptMessage from '../features/chat/MealReceiptMessage';
import { buildMealReceiptPayload } from '../features/chat/mealReceiptUtils.js';
import { deduplicateMealProposalItems } from '../features/wipMealBuilder/utils/wipMealItemUtils.js';
import { requestCameraPermissionsAsync, launchCameraAsync } from '../platform/expoNativeCamera.js';
import { processFoodImage } from '../features/foodResolution/processFoodImage.js';

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
    resultingItems: Array.isArray(proposal.resultingItems)
      ? proposal.resultingItems.map((item) => ({ ...item }))
      : undefined,
    baselineItems: Array.isArray(proposal.baselineItems)
      ? proposal.baselineItems.map((item) => ({ ...item }))
      : undefined,
    operations: Array.isArray(proposal.operations)
      ? proposal.operations.map((op) => ({
          ...op,
          updatedFood: op?.updatedFood ? { ...op.updatedFood } : op?.updatedFood,
        }))
      : undefined,
    totals: proposal.totals ? { ...proposal.totals } : undefined,
  }));
}

function normalizeMutationOperations(operations) {
  if (!Array.isArray(operations)) return [];
  return operations
    .map((op) => {
      if (!op || typeof op !== 'object') return null;
      const action = String(op.action || '').trim().toLowerCase();
      if (!['add', 'update', 'delete'].includes(action)) return null;
      return {
        action,
        targetItemId: op.targetItemId != null ? String(op.targetItemId).trim() : '',
        matchHint: op.matchHint != null ? String(op.matchHint).trim() : '',
        updatedFood: op.updatedFood && typeof op.updatedFood === 'object'
          ? {
              foodName: String(op.updatedFood.foodName || '').trim(),
              grams: Math.round(Number(op.updatedFood.grams) || 0),
            }
          : null,
      };
    })
    .filter(Boolean);
}

function resolveBaselineItem(op, baselineItems = []) {
  const list = Array.isArray(baselineItems) ? baselineItems : [];
  const targetId = String(op?.targetItemId || '').trim();
  if (targetId) {
    const byId = list.find((item) => String(item?.itemId || '').trim() === targetId);
    if (byId) return byId;
  }
  const hint = String(op?.matchHint || op?.updatedFood?.foodName || '').trim().toLowerCase();
  if (!hint) return null;
  return list.find((item) => {
    const name = String(item?.foodName || item?.name || '').trim().toLowerCase();
    return name === hint || name.includes(hint) || hint.includes(name);
  }) || null;
}

function resolveOperationFoodName(op, baselineItems = []) {
  const hint = String(op?.matchHint || '').trim();
  if (hint) return hint;
  const updatedName = String(op?.updatedFood?.foodName || '').trim();
  if (updatedName) return updatedName;
  const baseline = resolveBaselineItem(op, baselineItems);
  if (baseline?.foodName) return String(baseline.foodName).trim();
  const targetId = String(op?.targetItemId || '').trim();
  return targetId || 'Alimento';
}

function MealMutationOpsList({ operations, baselineItems = [] }) {
  const ops = normalizeMutationOperations(operations);
  if (ops.length === 0) return null;

  return (
    <ul className="kentu-meal-mutation-ops" aria-label="Modifiche proposte">
      {ops.map((op, index) => {
        const name = resolveOperationFoodName(op, baselineItems);
        const baseline = resolveBaselineItem(op, baselineItems);
        const oldGrams = Math.round(Number(baseline?.grams) || 0);
        const newGrams = Math.round(Number(op.updatedFood?.grams) || 0);
        const key = `${op.action}_${op.targetItemId || name}_${index}`;

        if (op.action === 'delete') {
          return (
            <li key={key} className="kentu-meal-mutation-ops__row kentu-meal-mutation-ops__row--delete">
              <span className="kentu-meal-mutation-ops__badge" aria-hidden>−</span>
              <span className="kentu-meal-mutation-ops__name kentu-meal-mutation-ops__name--delete">
                {name}
                {oldGrams > 0 ? ` · ${oldGrams}g` : ''}
              </span>
              <span className="kentu-meal-mutation-ops__action">Rimosso</span>
            </li>
          );
        }

        if (op.action === 'update') {
          return (
            <li key={key} className="kentu-meal-mutation-ops__row kentu-meal-mutation-ops__row--update">
              <span className="kentu-meal-mutation-ops__badge" aria-hidden>✎</span>
              <span className="kentu-meal-mutation-ops__name">
                {name}
                {oldGrams > 0 && newGrams > 0 && oldGrams !== newGrams ? (
                  <>
                    {' · '}
                    <span className="kentu-meal-mutation-ops__grams-old">{oldGrams}g</span>
                    <span className="kentu-meal-mutation-ops__grams-arrow"> → </span>
                    <span className="kentu-meal-mutation-ops__grams-new">{newGrams}g</span>
                  </>
                ) : newGrams > 0 ? (
                  <span className="kentu-meal-mutation-ops__grams-new">{` · ${newGrams}g`}</span>
                ) : null}
              </span>
              <span className="kentu-meal-mutation-ops__action">Modificato</span>
            </li>
          );
        }

        // add
        return (
          <li key={key} className="kentu-meal-mutation-ops__row kentu-meal-mutation-ops__row--add">
            <span className="kentu-meal-mutation-ops__badge" aria-hidden>+</span>
            <span className="kentu-meal-mutation-ops__name kentu-meal-mutation-ops__name--add">
              {name}
              {newGrams > 0 ? ` · ${newGrams}g` : ''}
            </span>
            <span className="kentu-meal-mutation-ops__action">Aggiunto</span>
          </li>
        );
      })}
    </ul>
  );
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

function recalcItemMacros(item, foodDatabase, fullHistory, mealType, catalogDbs = {}) {
  const foodName = String(item?.foodName || item?.name || '').trim();
  const grams = Math.max(1, Math.round(Number(item?.grams ?? item?.qta) || 0));
  if (!foodName) return { ...item, grams };

  if (
    item?.status === FOOD_RESOLUTION_STATUS.RESOLVED
    && item?.resolutionSource === 'manual'
  ) {
    return scaleItemMacros({ ...item, grams }, grams);
  }

  const resolved = resolveFoodItemForProposal(foodName, grams, {
    foodDb: foodDatabase || {},
    kentuItDb: catalogDbs.kentuItDb || {},
    globalDb: catalogDbs.globalDb || {},
    fullHistory: fullHistory || {},
    mealType,
    preferredDbKey: item?.foodDbKey,
  });

  if (!resolved) {
    return {
      ...item,
      grams,
      kcal: 0,
      pro: 0,
      carbo: 0,
      fat: 0,
      foodDbKey: null,
      status: FOOD_RESOLUTION_STATUS.NEEDS_RESOLUTION,
    };
  }

  return {
    ...item,
    foodName: resolved.foodName || foodName,
    foodDbKey: resolved.foodDbKey ?? null,
    grams: resolved.grams ?? grams,
    kcal: resolved.kcal,
    pro: resolved.pro,
    carbo: resolved.carbo,
    fat: resolved.fat,
    alternatives: resolved.alternatives ?? item.alternatives,
    status: resolved.status || FOOD_RESOLUTION_STATUS.RESOLVED,
    resolutionSource: undefined,
  };
}

function MealProposalItemRow({
  item,
  itemIdx,
  disabled,
  isEditing,
  interactiveEdit = false,
  onSelectAlternative,
  onEditName,
  onEditGrams,
  onRemoveItem,
  onRequestItemEdit,
}) {
  const [open, setOpen] = useState(false);
  const hasAlternatives = !isEditing && !interactiveEdit
    && Array.isArray(item.alternatives) && item.alternatives.length > 1;
  const grams = Math.round(Number(item?.grams ?? item?.qta) || 0);
  const name = String(item?.foodName || item?.name || 'Alimento').trim();
  const icon = String(item?.icon || '').trim();
  const label = `${icon ? `${icon} ` : ''}${name} ${grams}g`;

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

  if (interactiveEdit) {
    return (
      <li className="kentu-meal-proposal-card__item kentu-meal-proposal-card__item--interactive">
        <button
          type="button"
          className="kentu-meal-proposal-card__item-edit-btn"
          disabled={disabled}
          aria-label={`Modifica ${name}`}
          title="Tocca per correggere questo alimento"
          onClick={() => onRequestItemEdit?.(itemIdx, item)}
        >
          <span className="kentu-meal-proposal-card__item-name">{label}</span>
          <span className="kentu-meal-proposal-card__item-edit-hint" aria-hidden>✎</span>
        </button>
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
              <span className="kentu-meal-proposal-card__item-name">{icon ? `${icon} ${name}` : name}</span>
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
          <span className="kentu-meal-proposal-card__item-name">{icon ? `${icon} ${name}` : name}</span>
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
  kentuItDatabase = {},
  globalFoodDatabase = {},
  fullHistory,
  onConfirm,
  onDraftChange,
  onLearnUnresolvedFood = null,
  interactiveEdit = false,
  onRequestItemEdit = null,
  onCancelDraft = null,
  onEnableInteractiveEdit = null,
}) {
  const id = String(proposal?.id || `proposal_${index}`);
  const [localProposal, setLocalProposal] = useState(() => cloneProposal(proposal));
  const [isEditing, setIsEditing] = useState(false);
  const [isInteractiveEdit, setIsInteractiveEdit] = useState(Boolean(interactiveEdit));
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [processingItemIdx, setProcessingItemIdx] = useState(null);
  const [manualOpenForIdx, setManualOpenForIdx] = useState(null);
  const [cameraHint, setCameraHint] = useState('');
  const [cameraHintForIdx, setCameraHintForIdx] = useState(null);
  const [pendingImageUriByIdx, setPendingImageUriByIdx] = useState({});
  const [prefilledMacrosByIdx, setPrefilledMacrosByIdx] = useState({});

  useEffect(() => {
    setLocalProposal(cloneProposal(proposal));
    setIsEditing(false);
    setEditSnapshot(null);
  }, [proposal]);

  useEffect(() => {
    setIsInteractiveEdit(Boolean(interactiveEdit));
  }, [interactiveEdit]);

  const label = String(localProposal?.label || localProposal?.name || `Opzione ${index + 1}`).trim();
  const mealType = String(localProposal?.mealType || 'pranzo').trim();
  const exactTime = String(localProposal?.exactTime || localProposal?.timeString || '').trim();
  const targetNodeId = String(localProposal?.targetNodeId || '').trim();
  const mutationOps = useMemo(
    () => normalizeMutationOperations(localProposal?.operations),
    [localProposal?.operations],
  );
  const upsertAction = resolveUpsertActionFromPayload(localProposal);
  const isMutationCard = Boolean(targetNodeId) && (mutationOps.length > 0 || upsertAction !== 'append');
  const badgeText = mealUpsertBadgeLabel(upsertAction, mealType)
    + (exactTime ? ` · ${exactTime}` : '');
  const resulting = Array.isArray(localProposal?.resultingItems) ? localProposal.resultingItems : [];
  const commitItems = deduplicateMealProposalItems(
    resulting.length > 0
      ? resulting
      : (Array.isArray(localProposal?.items) ? localProposal.items : []),
  );
  const rawItems = isMutationCard && !isEditing
    ? commitItems
    : (Array.isArray(localProposal?.items) ? localProposal.items : commitItems);
  const items = deduplicateMealProposalItems(rawItems);
  const totals = formatMacroTotals(localProposal?.totals || sumItemMacros(items));
  const hasUnresolvedItems = items.some(
    (it) => String(it?.status || '') === FOOD_RESOLUTION_STATUS.NEEDS_RESOLUTION,
  );
  const canSaveOrConfirm = commitItems.length > 0 && !hasUnresolvedItems;
  const baselineItems = Array.isArray(localProposal?.baselineItems)
    ? localProposal.baselineItems
    : [];
  const previewReceipt = buildMealReceiptPayload({
    items,
    mealType,
    timeString: exactTime,
    mealTotals: totals,
    preview: true,
  });

  const commitProposal = useCallback((nextProposal) => {
    const nextItems = Array.isArray(nextProposal?.items) ? nextProposal.items : [];
    const synced = {
      ...nextProposal,
      items: nextItems,
      resultingItems: nextItems,
    };
    setLocalProposal(synced);
    onDraftChange?.(index, synced);
  }, [index, onDraftChange]);

  const showCameraHint = useCallback((itemIndex, message) => {
    setCameraHintForIdx(itemIndex);
    setCameraHint(String(message || '').trim());
  }, []);

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
        status: FOOD_RESOLUTION_STATUS.RESOLVED,
        resolutionSource: undefined,
      };
    });
    commitProposal({
      ...localProposal,
      items: nextItems,
      totals: sumItemMacros(nextItems),
    });
  }, [commitProposal, items, localProposal]);

  const handleCorrectNameSubmit = useCallback((itemIndex, newName) => {
    const item = items[itemIndex];
    if (!item) return;
    const cleaned = String(newName || '').trim();
    if (!cleaned) return;

    const grams = Math.max(1, Math.round(Number(item.grams) || 0));
    const resolved = resolveFoodItemForProposal(cleaned, grams, {
      foodDb: foodDatabase || {},
      kentuItDb: kentuItDatabase || {},
      globalDb: globalFoodDatabase || {},
      fullHistory: fullHistory || {},
      mealType,
    });

    if (resolved && resolved.status !== FOOD_RESOLUTION_STATUS.NEEDS_RESOLUTION) {
      const nextItems = items.map((it, ii) => {
        if (ii !== itemIndex) return it;
        return {
          ...it,
          foodName: resolved.foodName || cleaned,
          foodDbKey: resolved.foodDbKey ?? null,
          grams: resolved.grams ?? grams,
          kcal: resolved.kcal,
          pro: resolved.pro,
          carbo: resolved.carbo,
          fat: resolved.fat,
          alternatives: resolved.alternatives ?? [],
          status: FOOD_RESOLUTION_STATUS.RESOLVED,
          resolutionSource: undefined,
          rawQuery: cleaned,
        };
      });
      commitProposal({
        ...localProposal,
        items: nextItems,
        totals: sumItemMacros(nextItems),
      });
      setCameraHint('');
      setCameraHintForIdx(null);
      return;
    }

    // Nome aggiornato ma ancora non trovato: resta NEEDS_RESOLUTION.
    const nextItems = items.map((it, ii) => {
      if (ii !== itemIndex) return it;
      return {
        ...it,
        foodName: cleaned,
        foodDbKey: null,
        kcal: 0,
        pro: 0,
        carbo: 0,
        fat: 0,
        status: FOOD_RESOLUTION_STATUS.NEEDS_RESOLUTION,
        alternatives: [],
        rawQuery: cleaned,
      };
    });
    commitProposal({
      ...localProposal,
      items: nextItems,
      totals: sumItemMacros(nextItems),
    });
    showCameraHint(itemIndex, 'Nome aggiornato ma non trovato nel DB — riprova o inserisci manualmente');
  }, [
    commitProposal,
    foodDatabase,
    fullHistory,
    globalFoodDatabase,
    items,
    kentuItDatabase,
    localProposal,
    mealType,
    showCameraHint,
  ]);

  const captureForFoodResolution = useCallback(async (itemIndex, mode) => {
    if (isLoaded || processingItemIdx != null) return;
    setProcessingItemIdx(itemIndex);
    setCameraHint('');
    setCameraHintForIdx(null);
    try {
      const perm = await requestCameraPermissionsAsync();
      if (!perm.granted) {
        showCameraHint(itemIndex, 'Permesso fotocamera negato.');
        return;
      }
      const shot = await launchCameraAsync({ quality: 0.85 });
      if (shot.canceled || !shot.uri) {
        if (shot.reason === 'native_camera_unavailable') {
          showCameraHint(
            itemIndex,
            'Fotocamera nativa non disponibile (build Expo/Capacitor richiesto).',
          );
        }
        return;
      }
      setPendingImageUriByIdx((prev) => ({ ...prev, [itemIndex]: shot.uri }));
      const itemGrams = Math.round(Number(items[itemIndex]?.grams) || 0);
      const result = await processFoodImage(shot.uri, mode, { grams: itemGrams });
      if (result?.prefilledMacros) {
        setPrefilledMacrosByIdx((prev) => ({
          ...prev,
          [itemIndex]: result.prefilledMacros,
        }));
      } else {
        setPrefilledMacrosByIdx((prev) => {
          const next = { ...prev };
          delete next[itemIndex];
          return next;
        });
      }
      if (result?.errorToast) {
        showCameraHint(itemIndex, result.errorToast);
      }
      setManualOpenForIdx(itemIndex);
    } catch (error) {
      showCameraHint(itemIndex, error?.message || 'Errore fotocamera');
      setManualOpenForIdx(itemIndex);
    } finally {
      setProcessingItemIdx(null);
    }
  }, [isLoaded, items, processingItemIdx, showCameraHint]);

  const handleScanBarcode = useCallback((itemIndex) => {
    void captureForFoodResolution(itemIndex, 'barcode');
  }, [captureForFoodResolution]);

  const handleUseLabelPhoto = useCallback((itemIndex) => {
    void captureForFoodResolution(itemIndex, 'label');
  }, [captureForFoodResolution]);

  const handleManualResolve = useCallback(async (itemIndex, macros) => {
    const item = items[itemIndex];
    if (!item) return;
    setProcessingItemIdx(itemIndex);
    try {
      const labelImageUri = pendingImageUriByIdx[itemIndex] || null;
      let patch = {
        kcal: Math.round(Number(macros?.kcal) || 0),
        pro: roundMacro(macros?.pro),
        carbo: roundMacro(macros?.carbo),
        fat: roundMacro(macros?.fat),
        foodDbKey: null,
        status: FOOD_RESOLUTION_STATUS.RESOLVED,
        resolutionSource: 'manual',
      };
      if (typeof onLearnUnresolvedFood === 'function') {
        const learned = await onLearnUnresolvedFood({
          foodName: item.foodName,
          grams: item.grams,
          mealType,
          kcal: patch.kcal,
          pro: patch.pro,
          carbo: patch.carbo,
          fat: patch.fat,
          source: labelImageUri ? 'label_vision' : 'manual_resolution',
          labelImageUri,
        });
        patch = {
          ...patch,
          ...learned,
          status: FOOD_RESOLUTION_STATUS.RESOLVED,
          resolutionSource: learned?.resolutionSource || 'learned_db',
        };
      }
      const nextItems = items.map((it, ii) => (ii === itemIndex ? { ...it, ...patch } : it));
      commitProposal({
        ...localProposal,
        items: nextItems,
        totals: sumItemMacros(nextItems),
      });
      setManualOpenForIdx(null);
      setPendingImageUriByIdx((prev) => {
        const next = { ...prev };
        delete next[itemIndex];
        return next;
      });
      setPrefilledMacrosByIdx((prev) => {
        const next = { ...prev };
        delete next[itemIndex];
        return next;
      });
    } catch (error) {
      showCameraHint(itemIndex, error?.message || 'Salvataggio alimento fallito');
    } finally {
      setProcessingItemIdx(null);
    }
  }, [
    commitProposal,
    items,
    localProposal,
    mealType,
    onLearnUnresolvedFood,
    pendingImageUriByIdx,
    showCameraHint,
  ]);

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
    // Bozza interattiva: righe cliccabili → wizard isolato (non campi testo).
    setIsInteractiveEdit(true);
    onEnableInteractiveEdit?.();
  };

  const handleCancelEdit = () => {
    if (editSnapshot) {
      commitProposal(editSnapshot);
    }
    setEditSnapshot(null);
    setIsEditing(false);
    setIsInteractiveEdit(false);
  };

  const handleRequestItemEdit = (itemIndex, item) => {
    onRequestItemEdit?.(itemIndex, item, {
      proposal: localProposal,
      proposalIndex: index,
      adviceId,
    });
  };

  const handleSaveEdit = () => {
    const nextItems = items.map((item) => recalcItemMacros(
      item,
      foodDatabase,
      fullHistory,
      mealType,
      { kentuItDb: kentuItDatabase, globalDb: globalFoodDatabase },
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
    <article className={`kentu-meal-proposal-card${isEditing ? ' kentu-meal-proposal-card--editing' : ''}${isMutationCard ? ' kentu-meal-proposal-card--mutation' : ''}`}>
      {isEditing ? (
        <header className="kentu-meal-proposal-card__head">
          <div className="kentu-meal-proposal-card__titles">
            <span className="kentu-meal-proposal-card__badge">
              {badgeText}
            </span>
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
      ) : null}

      {isMutationCard && !isEditing ? (
        <MealMutationOpsList
          operations={mutationOps}
          baselineItems={baselineItems}
        />
      ) : null}

      {!isEditing && !isInteractiveEdit && items.length > 0 ? (
        <div className="kentu-meal-proposal-card__receipt">
          <MealReceiptMessage
            receipt={previewReceipt}
            disabled={isLoaded || processingItemIdx != null}
            onSelectAlternative={handleSelectAlternative}
            onScanBarcode={handleScanBarcode}
            onUseLabelPhoto={handleUseLabelPhoto}
            onManualResolve={handleManualResolve}
            onCorrectNameSubmit={handleCorrectNameSubmit}
            processingItemIdx={processingItemIdx}
            manualOpenForIdx={manualOpenForIdx}
            onManualOpenForIdx={setManualOpenForIdx}
            statusHint={cameraHint}
            statusHintForIdx={cameraHintForIdx}
            pendingImageUriByIdx={pendingImageUriByIdx}
            prefilledMacrosByIdx={prefilledMacrosByIdx}
          />
        </div>
      ) : null}

      {(isEditing || isInteractiveEdit) && items.length > 0 ? (
        <ul className="kentu-meal-proposal-card__items" aria-label={isInteractiveEdit ? 'Tocca un alimento da correggere' : 'Modifica alimenti'}>
          {isInteractiveEdit ? (
            <li className="kentu-meal-proposal-card__interactive-hint">
              Tocca l&apos;alimento da correggere
            </li>
          ) : null}
          {items.map((item, itemIdx) => (
            <MealProposalItemRow
              key={`${id}_${itemIdx}_${item.foodDbKey || item.foodName}`}
              item={item}
              itemIdx={itemIdx}
              disabled={isLoaded}
              isEditing={isEditing}
              interactiveEdit={isInteractiveEdit && !isEditing}
              onSelectAlternative={handleSelectAlternative}
              onEditName={handleEditName}
              onEditGrams={handleEditGrams}
              onRemoveItem={handleRemoveItem}
              onRequestItemEdit={handleRequestItemEdit}
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
        ) : isInteractiveEdit ? (
          <>
            <KentuButton
              variant="primary"
              className="kentu-meal-proposal-card__confirm"
              disabled={isLoaded || !canSaveOrConfirm}
              onClick={() => {
                if (isLoaded || !canSaveOrConfirm) return;
                setIsInteractiveEdit(false);
                onConfirm?.({
                  ...localProposal,
                  targetNodeId: targetNodeId || localProposal?.targetNodeId || null,
                  action: upsertAction,
                  upsertAction,
                  items: commitItems,
                  resultingItems: commitItems,
                }, index, adviceId);
              }}
            >
              Sì, Salva
            </KentuButton>
            <KentuButton
              variant="secondary"
              className="kentu-meal-proposal-card__cancel"
              disabled={isLoaded}
              onClick={() => setIsInteractiveEdit(false)}
            >
              Chiudi edit
            </KentuButton>
          </>
        ) : (
          <>
            <KentuButton
              variant="primary"
              className={`kentu-meal-proposal-card__confirm${isLoaded ? ' kentu-meal-proposal-card__confirm--loaded' : ''}`}
              disabled={isLoaded || !canSaveOrConfirm}
              title={hasUnresolvedItems ? 'Risolvi tutti gli alimenti non trovati nel DB prima di salvare' : undefined}
              onClick={() => {
                if (isLoaded || !canSaveOrConfirm) return;
                onConfirm?.({
                  ...localProposal,
                  targetNodeId: targetNodeId || localProposal?.targetNodeId || null,
                  action: upsertAction,
                  upsertAction,
                  items: commitItems,
                  resultingItems: commitItems,
                }, index, adviceId);
              }}
            >
              {isLoaded
                ? 'Applicato ✓'
                : hasUnresolvedItems
                  ? 'Risolvi alimenti…'
                  : upsertAction === 'merge'
                    ? 'Aggiungi al pasto'
                    : isMutationCard
                      ? 'Applica modifiche'
                      : 'Sì, Salva'}
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
            {!isLoaded && typeof onCancelDraft === 'function' ? (
              <KentuButton
                variant="secondary"
                className="kentu-meal-proposal-card__cancel"
                onClick={() => onCancelDraft(localProposal, index, adviceId)}
              >
                Annulla
              </KentuButton>
            ) : null}
          </>
        )}
      </footer>
    </article>
  );
}

/**
 * Card compatte per proposte pasto Solver (mealProposals da ADVICE).
 */
export default function MealProposalCards({
  proposals = [],
  adviceId,
  loadedProposalIds = [],
  foodDatabase = {},
  kentuItDatabase = {},
  globalFoodDatabase = {},
  fullHistory = {},
  onConfirm,
  onLearnUnresolvedFood = null,
  interactiveEdit = false,
  onRequestItemEdit = null,
  onCancelDraft = null,
  onEnableInteractiveEdit = null,
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
            kentuItDatabase={kentuItDatabase}
            globalFoodDatabase={globalFoodDatabase}
            fullHistory={fullHistory}
            onConfirm={onConfirm}
            onDraftChange={handleDraftChange}
            onLearnUnresolvedFood={onLearnUnresolvedFood}
            interactiveEdit={interactiveEdit}
            onRequestItemEdit={onRequestItemEdit}
            onCancelDraft={onCancelDraft}
            onEnableInteractiveEdit={onEnableInteractiveEdit}
          />
        );
      })}
    </div>
  );
}
