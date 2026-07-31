import { commandBus } from '../dispatcher/CommandBus.js';
import {
  DISPATCH_ADD_FOOD,
  DISPATCH_COMMAND_REJECTED,
  DISPATCH_SYSTEM_MESSAGE,
} from '../contracts/eventTypes.js';

/**
 * Register nutrition domain listeners for command bus events.
 * Returns a cleanup function to unsubscribe handlers.
 */
export function initNutritionHandlers({
  bus = commandBus,
  onAddFoodCommand = null,
} = {}) {
  if (typeof onAddFoodCommand !== 'function') {
    throw new Error('initNutritionHandlers requires onAddFoodCommand callback');
  }

  const unsubscribeAddFood = bus.subscribe(DISPATCH_ADD_FOOD, async (envelope) => {
    try {
      console.log('🔵 DEBUG - OUTPUT TOOL ADD_FOOD (dispatch ricevuto):', {
        payload: envelope?.payload || {},
        correlationId: envelope?.meta?.correlationId || null,
        source: envelope?.meta?.source || null,
      });
      const result = await onAddFoodCommand(envelope?.payload || {}, envelope);
      console.log('🔵 DEBUG - OUTPUT TOOL ADD_FOOD (result commit):', result);
      if (envelope?.meta?.correlationId === 'advice_accept'
        || envelope?.meta?.correlationId === 'meal_proposal_accept'
        || envelope?.meta?.correlationId === 'meal_proposal_update') {
        return;
      }
      if (typeof result === 'string' && result.trim()) {
        console.log('🟢 DEBUG - RISPOSTA FINALE PRONTA PER LA UI (NutritionHandler→SYSTEM_MESSAGE):', result.trim());
        bus.publish(
          DISPATCH_SYSTEM_MESSAGE,
          { message: result.trim(), text: result.trim() },
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
  });

  return () => {
    unsubscribeAddFood();
  };
}
