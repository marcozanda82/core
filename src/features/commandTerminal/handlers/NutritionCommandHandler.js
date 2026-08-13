import { commandBus } from '../dispatcher/CommandBus.js';
import {
  DISPATCH_ADD_FOOD,
  DISPATCH_UPSERT_MEAL,
  DISPATCH_COMMAND_REJECTED,
  DISPATCH_SYSTEM_MESSAGE,
} from '../contracts/eventTypes.js';

const SKIP_SYSTEM_MESSAGE_CORRELATION_IDS = new Set([
  'advice_accept',
  'meal_proposal_accept',
  'meal_proposal_update',
  'meal_proposal_merge',
  'meal_upsert_accept',
]);

/**
 * Register nutrition domain listeners for command bus events.
 * DISPATCH_ADD_FOOD resta per retrocompatibilità e viene inoltrato a UPSERT.
 * Returns a cleanup function to unsubscribe handlers.
 */
export function initNutritionHandlers({
  bus = commandBus,
  onAddFoodCommand = null,
  onUpsertMealCommand = null,
  onMealCommitSuccess = null,
} = {}) {
  const writer = typeof onUpsertMealCommand === 'function'
    ? onUpsertMealCommand
    : onAddFoodCommand;

  if (typeof writer !== 'function') {
    throw new Error('initNutritionHandlers requires onUpsertMealCommand or onAddFoodCommand');
  }

  const handleUpsert = async (envelope, label = 'UPSERT_MEAL') => {
    try {
      console.log(`🔵 DEBUG - OUTPUT TOOL ${label} (dispatch ricevuto):`, {
        payload: envelope?.payload || {},
        correlationId: envelope?.meta?.correlationId || null,
        source: envelope?.meta?.source || null,
      });
      const result = await writer(envelope?.payload || {}, envelope);
      console.log(`🔵 DEBUG - OUTPUT TOOL ${label} (result commit):`, result);
      if (typeof onMealCommitSuccess === 'function') {
        onMealCommitSuccess(envelope, result);
      }
      if (SKIP_SYSTEM_MESSAGE_CORRELATION_IDS.has(String(envelope?.meta?.correlationId || ''))) {
        return;
      }
      if (typeof result === 'string' && result.trim()) {
        console.log(`🟢 DEBUG - RISPOSTA FINALE PRONTA PER LA UI (NutritionHandler→SYSTEM_MESSAGE):`, result.trim());
        bus.publish(
          DISPATCH_SYSTEM_MESSAGE,
          { message: result.trim(), text: result.trim() },
          { source: 'NutritionCommandHandler' },
        );
        return;
      }
      if (result && typeof result === 'object' && result.mealReceipt) {
        const text = String(result.text || '').trim() || '✅ Pasto registrato';
        console.log(`🟢 DEBUG - RISPOSTA FINALE PRONTA PER LA UI (NutritionHandler→MEAL_RECEIPT):`, text);
        bus.publish(
          DISPATCH_SYSTEM_MESSAGE,
          {
            type: 'MEAL_RECEIPT',
            message: text,
            text,
            mealReceipt: result.mealReceipt,
          },
          { source: 'NutritionCommandHandler' },
        );
      }
    } catch (error) {
      bus.publish(
        DISPATCH_COMMAND_REJECTED,
        {
          reason: `Nutrition handler failure: ${error?.message || 'unknown error'}`,
          command: envelope?.payload || null,
        },
        { source: 'NutritionCommandHandler' },
      );
    }
  };

  const unsubscribeUpsert = bus.subscribe(DISPATCH_UPSERT_MEAL, (envelope) => (
    handleUpsert(envelope, 'UPSERT_MEAL')
  ));

  // Retrocompat: ADD_FOOD → stesso writer UPSERT (action default append/replace da payload).
  const unsubscribeAddFood = bus.subscribe(DISPATCH_ADD_FOOD, (envelope) => (
    handleUpsert(envelope, 'ADD_FOOD→UPSERT')
  ));

  return () => {
    unsubscribeUpsert();
    unsubscribeAddFood();
  };
}
