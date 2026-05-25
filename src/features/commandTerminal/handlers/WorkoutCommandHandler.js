import { commandBus } from '../dispatcher/CommandBus.js';
import {
  DISPATCH_ADD_WORKOUT,
  DISPATCH_COMMAND_REJECTED,
  DISPATCH_SYSTEM_MESSAGE,
} from '../contracts/eventTypes.js';

/**
 * Register workout domain listeners for command bus events.
 * Returns a cleanup function to unsubscribe handlers.
 */
export function initWorkoutHandlers({
  bus = commandBus,
  onAddWorkoutCommand = null,
} = {}) {
  if (typeof onAddWorkoutCommand !== 'function') {
    throw new Error('initWorkoutHandlers requires onAddWorkoutCommand callback');
  }

  const unsubscribeAddWorkout = bus.subscribe(DISPATCH_ADD_WORKOUT, async (envelope) => {
    try {
      const result = await onAddWorkoutCommand(envelope?.payload || {}, envelope);
      if (typeof result === 'string' && result.trim()) {
        bus.publish(
          DISPATCH_SYSTEM_MESSAGE,
          { message: result.trim() },
          { source: 'WorkoutCommandHandler' },
        );
      }
    } catch (error) {
      bus.publish(
        DISPATCH_COMMAND_REJECTED,
        {
          reason: `Workout handler failure: ${error?.message || 'unknown error'}`,
          command: envelope?.payload || null,
        },
        { source: 'WorkoutCommandHandler' },
      );
    }
  });

  return () => {
    unsubscribeAddWorkout();
  };
}
