/**
 * Stato UI + salvataggio rapido stimolanti (caffè / tè / energy) dal Choice modal.
 */

import { useCallback, useState } from 'react';
import {
  buildCoffeeStimulantNode,
  COFFEE_VARIANT,
  readLastCoffeeType,
  writeLastCoffeeType,
} from '../../features/stimulants/coffeeLogEngine.js';
import {
  buildTeaStimulantNode,
  readLastTeaType,
  writeLastTeaType,
} from '../../features/stimulants/teaLogEngine.js';
import {
  buildEnergyStimulantNode,
  readLastEnergyType,
  writeLastEnergyType,
} from '../../features/stimulants/energyDrinkLogEngine.js';
import {
  buildQuickEventConfirmPayload,
  resolveStimulantConfirmKind,
} from '../../features/quickEvents/quickEventConfirmAssets.js';

/**
 * @param {{
 *   manualNodes?: object[],
 *   setManualNodes?: (nodes: object[]) => void,
 *   dailyLog?: object[],
 *   syncDatiFirebase?: (log: object[], nodes: object[]) => void,
 *   setShowChoiceModal?: (v: boolean) => void,
 *   setAddChoiceView?: (v: string) => void,
 *   activeAction?: string|null,
 *   setActiveAction?: (updater: any) => void,
 *   returnToChatAfterQuickActionRef?: React.MutableRefObject<boolean>,
 *   appendQuickEventConfirmToChat?: (kind: string, extra?: object) => void,
 *   setQuickEventConfirm?: (payload: object|null) => void,
 *   finishQuickActionSurface?: (opts?: object) => void,
 * }} params
 */
export function useStimulantQuickLog({
  manualNodes = [],
  setManualNodes = null,
  dailyLog = [],
  syncDatiFirebase = null,
  setShowChoiceModal = null,
  setAddChoiceView = null,
  activeAction = null,
  setActiveAction = null,
  returnToChatAfterQuickActionRef = null,
  appendQuickEventConfirmToChat = null,
  setQuickEventConfirm = null,
  finishQuickActionSurface = null,
} = {}) {
  const [stimulantSubtype, setStimulantSubtype] = useState('caffè');
  const [coffeeType, setCoffeeType] = useState(() => readLastCoffeeType());
  const [teaType, setTeaType] = useState(() => readLastTeaType());
  const [energyType, setEnergyType] = useState(() => readLastEnergyType());
  const [coffeeVariant, setCoffeeVariant] = useState(COFFEE_VARIANT.AMARO);
  const [stimulantTime, setStimulantTime] = useState(8);

  const handleSaveChoiceStimulant = useCallback(() => {
    const id = Date.now().toString();
    const sub = String(stimulantSubtype || '').toLowerCase();
    const isCoffee = sub === 'caffè' || sub === 'caffe';
    const isTea = sub === 'tè' || sub === 'te' || sub === 'tea';
    const isEnergy = sub.includes('energy');

    let node;
    if (isCoffee) {
      writeLastCoffeeType(coffeeType);
      node = buildCoffeeStimulantNode(coffeeVariant, stimulantTime, {
        id,
        coffeeType,
        type: coffeeType,
        sugar: coffeeVariant === COFFEE_VARIANT.ZUCCHERATO,
      });
    } else if (isTea) {
      writeLastTeaType(teaType);
      node = buildTeaStimulantNode(coffeeVariant, stimulantTime, {
        id,
        teaType,
        type: teaType,
        sugar: coffeeVariant === COFFEE_VARIANT.ZUCCHERATO,
      });
    } else if (isEnergy) {
      writeLastEnergyType(energyType);
      node = buildEnergyStimulantNode(energyType, stimulantTime, { id });
    } else {
      node = {
        id,
        type: 'stimulant',
        subtype: stimulantSubtype,
        time: stimulantTime,
        kcal: 0,
        carb: 0,
        breaksFast: false,
      };
    }

    const next = [...(manualNodes || []), node];
    setManualNodes?.(next);
    syncDatiFirebase?.(dailyLog, next);
    setShowChoiceModal?.(false);
    setAddChoiceView?.('main');
    setCoffeeVariant(COFFEE_VARIANT.AMARO);
    const fromChat = returnToChatAfterQuickActionRef?.current === true
      || activeAction === 'ai_chat';
    const confirmKind = resolveStimulantConfirmKind(node);
    if (confirmKind) {
      const subtitle = node.label || undefined;
      if (fromChat) {
        appendQuickEventConfirmToChat?.(confirmKind, { subtitle });
      } else {
        setQuickEventConfirm?.(buildQuickEventConfirmPayload(confirmKind, { subtitle }));
      }
    }
    if (fromChat) {
      finishQuickActionSurface?.({ forceChat: true });
    } else if (returnToChatAfterQuickActionRef) {
      returnToChatAfterQuickActionRef.current = false;
      setActiveAction?.((prev) => (prev === 'ai_chat' ? 'ai_chat' : null));
    }
  }, [
    stimulantSubtype,
    coffeeType,
    teaType,
    energyType,
    coffeeVariant,
    stimulantTime,
    manualNodes,
    setManualNodes,
    dailyLog,
    syncDatiFirebase,
    setShowChoiceModal,
    setAddChoiceView,
    activeAction,
    setActiveAction,
    returnToChatAfterQuickActionRef,
    appendQuickEventConfirmToChat,
    setQuickEventConfirm,
    finishQuickActionSurface,
  ]);

  return {
    stimulantSubtype,
    setStimulantSubtype,
    coffeeType,
    setCoffeeType,
    teaType,
    setTeaType,
    energyType,
    setEnergyType,
    coffeeVariant,
    setCoffeeVariant,
    stimulantTime,
    setStimulantTime,
    handleSaveChoiceStimulant,
  };
}

export default useStimulantQuickLog;
