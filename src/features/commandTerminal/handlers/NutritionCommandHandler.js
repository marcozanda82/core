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
      const result = await onAddFoodCommand(envelope?.payload || {}, envelope);
      if (typeof result === 'string' && result.trim()) {
        bus.publish(
          DISPATCH_SYSTEM_MESSAGE,
          { message: result.trim() },
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
